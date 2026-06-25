import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_admin, get_current_user, hash_password
from app.core.credentials import generate_temp_password
from app.core.email import send_email
from app.core.config import settings
from app.models.customer import Customer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/customers", tags=["顧客管理（管理者）"])


class CustomerCreate(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    role: str = "learner"  # learner / creator / admin


class CustomerOut(BaseModel):
    id: int
    username: str
    email: Optional[str]
    role: str
    is_active: bool
    is_password_reset_required: bool

    class Config:
        from_attributes = True


@router.get("/")
def list_customers(admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    customers = db.query(Customer).all()
    return [
        {
            "id": c.id,
            "username": c.username,
            "email": c.email,
            "role": c.role,
            "is_active": c.is_active,
            "is_password_reset_required": c.is_password_reset_required,
        }
        for c in customers
    ]


@router.post("/", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
def create_customer(data: CustomerCreate, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    if db.query(Customer).filter(Customer.username == data.username).first():
        raise HTTPException(status_code=400, detail="このユーザー名はすでに使用されています")
    if data.role not in ("learner", "creator", "admin"):
        raise HTTPException(status_code=400, detail="role は 'learner' / 'creator' / 'admin' のいずれかを指定してください")
    customer = Customer(
        username=data.username,
        hashed_password=hash_password(data.password),
        email=data.email,
        role=data.role,
        is_password_reset_required=True,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


class CustomerUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    is_active: Optional[bool] = None
    role: Optional[str] = None


@router.patch("/{customer_id}")
def update_customer(customer_id: int, data: CustomerUpdate, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="顧客が見つかりません")

    if data.username is not None and data.username != customer.username:
        if db.query(Customer).filter(Customer.username == data.username, Customer.id != customer_id).first():
            raise HTTPException(status_code=400, detail="このユーザー名はすでに使用されています")

    if data.role is not None and data.role not in ("learner", "creator", "admin"):
        raise HTTPException(status_code=400, detail="role は 'learner' / 'creator' / 'admin' のいずれかを指定してください")

    for key, val in data.model_dump(exclude_none=True).items():
        setattr(customer, key, val)

    db.commit()
    db.refresh(customer)

    return {
        "id": customer.id,
        "username": customer.username,
        "email": customer.email,
        "role": customer.role,
        "is_active": customer.is_active,
        "is_password_reset_required": customer.is_password_reset_required,
    }


@router.post("/{customer_id}/reissue-password")
def reissue_password(customer_id: int, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """顧客のパスワードを再発行する。

    パスワードはハッシュ化して保存しているため元の文字列は復元できない。
    新しいランダムな一時パスワードを生成し、この場で一度だけ平文を返す。
    """
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="顧客が見つかりません")

    new_password = generate_temp_password()
    customer.hashed_password = hash_password(new_password)
    customer.is_password_reset_required = True
    db.commit()

    return {
        "message": "新しい一時パスワードを発行しました。この画面を閉じると二度と表示できないため、必ずこの場でお客様に伝えてください。",
        "username": customer.username,
        "temporary_password": new_password,
    }


@router.delete("/{customer_id}")
def delete_customer(customer_id: int, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="顧客が見つかりません")

    db.delete(customer)
    db.commit()
    return {"message": "削除しました"}


@router.post("/me/withdraw")
def withdraw(current_user: Customer = Depends(get_current_user), db: Session = Depends(get_db)):
    """顧客自身による退会処理。Stripeサブスクリプションが存在する場合は解約し、アカウントを削除する。"""
    if current_user.role == "admin":
        raise HTTPException(status_code=403, detail="管理者アカウントは退会できません")

    if current_user.role == "creator":
        from app.models.creator_profile import CreatorProfile
        from app.models.character import Character
        from app.models.course import Course
        from app.models.course_subscription import CourseSubscription

        creator_profile = db.query(CreatorProfile).filter(CreatorProfile.user_id == current_user.id).first()
        if creator_profile:
            course_ids = [
                c.id for c in db.query(Course).join(Character, Course.character_id == Character.id)
                .filter(Character.creator_id == creator_profile.id).all()
            ]
            active_count = db.query(CourseSubscription).filter(
                CourseSubscription.course_id.in_(course_ids),
                CourseSubscription.status.in_(["active", "past_due"]),
            ).count() if course_ids else 0
            if active_count > 0:
                raise HTTPException(
                    status_code=409,
                    detail=f"在籍中の学習者が{active_count}名います。運営にご連絡のうえ、返金・引き継ぎ対応の完了後に退会してください。",
                )

    if current_user.stripe_subscription_id and settings.STRIPE_SECRET_KEY:
        try:
            import stripe
            stripe.api_key = settings.STRIPE_SECRET_KEY
            stripe.Subscription.delete(current_user.stripe_subscription_id)
        except Exception:
            logger.exception("[Stripe] サブスクリプションの解約に失敗しました")

    email = current_user.email
    username = current_user.username

    db.delete(current_user)
    db.commit()

    if email:
        send_email(
            to=email,
            subject="【ManaVillage】退会手続き完了のお知らせ",
            html=(
                f"<p>{username} 様</p>"
                "<p>退会手続きが完了しました。これまでご利用いただきありがとうございました。</p>"
                "<p>アカウント情報・学習履歴等はすべて削除されました。</p>"
            ),
        )

    return {"message": "退会処理が完了しました。ご利用ありがとうございました。"}
