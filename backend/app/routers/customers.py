import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from app.core.database import get_db
from app.core.security import get_current_admin, get_current_user, hash_password
from app.models.customer import Customer
from app.models.character import Character
from app.models.article import Article
from app.models.message import Message
from app.models.access_log import AccessLog
from app.models.correction_request import CorrectionRequest
from app.models.reward import CustomerReward
from app.models.order import Order
from app.models.exercise_submission import ExerciseSubmission
from app.models.message_feedback import MessageFeedback
from app.models.preview_example import PreviewExample
from app.core.intimacy import intimacy_info
from app.core.credentials import generate_temp_password
from app.core.email import send_email
from app.core.welcome_articles import swap_welcome_article_if_character_ready
from app.core.config import settings
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/customers", tags=["顧客管理（管理者）"])

class CustomerCreate(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    character_id: Optional[int] = None
    theme_config: Optional[dict] = None
    subscription_plan: str = "buy_once"  # buy_once / monthly
    role: str = "learner"  # learner / instructor / admin

class CustomerOut(BaseModel):
    id: int
    username: str
    email: Optional[str]
    role: str
    is_active: bool
    is_password_reset_required: bool
    character_id: Optional[int]
    subscription_plan: str
    character_memory: Optional[dict] = None

    class Config:
        from_attributes = True

@router.get("/")
def list_customers(admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    customers = db.query(Customer).all()

    # 全記事数（N+1を防ぐため一括集計・依頼記事のみ）
    article_counts = dict(
        db.query(Article.customer_id, func.count(Article.id))
        .filter(Article.article_type == "request")
        .group_by(Article.customer_id)
        .all()
    )
    # 公開済み依頼記事数
    published_counts = dict(
        db.query(Article.customer_id, func.count(Article.id))
        .filter(Article.status == "published", Article.article_type == "request")
        .group_by(Article.customer_id)
        .all()
    )
    # 公開済み演習問題数（依頼記事とは別に管理）
    exercise_counts = dict(
        db.query(Article.customer_id, func.count(Article.id))
        .filter(Article.status == "published", Article.article_type == "exercise")
        .group_by(Article.customer_id)
        .all()
    )
    # 各顧客への最終挨拶・DM送信日時（キャラからのメッセージの最新日時）
    last_character_message_map = dict(
        db.query(Message.customer_id, func.max(Message.created_at))
        .filter(Message.sender == "character")
        .group_by(Message.customer_id)
        .all()
    )

    # 定期便プールの残数（顧客ごとに「まだ配布されていないプール記事」が何本残っているか）
    # 管理画面で「この顧客には定期便プールの記事が足りなくなりそう」を判断するための値
    total_template_count = db.query(func.count(Article.id)).filter(
        Article.article_type == "template",
        Article.status == "published",
        Article.customer_id.is_(None),
    ).scalar() or 0
    received_template_counts = dict(
        db.query(Article.customer_id, func.count(Article.id))
        .filter(Article.template_source_id.isnot(None))
        .group_by(Article.customer_id)
        .all()
    )

    from app.core.character_voice import customer_display_name
    return [
        {
            "id": c.id,
            "username": c.username,
            "display_name": customer_display_name(c),
            "email": c.email,
            "role": c.role,
            "is_active": c.is_active,
            "is_password_reset_required": c.is_password_reset_required,
            "character_id": c.character_id,
            "subscription_plan": c.subscription_plan,
            "article_count": article_counts.get(c.id, 0),        # 依頼記事（全ステータス）
            "published_count": published_counts.get(c.id, 0),    # 依頼記事（公開済み）
            "exercise_count": exercise_counts.get(c.id, 0),      # 演習問題（公開済み）
            "character_memory": c.character_memory,
            "intimacy": intimacy_info(c.intimacy_points),
            "last_character_message_at": (
                last_character_message_map[c.id].isoformat() if last_character_message_map.get(c.id) else None
            ),
            "template_pool_remaining": max(0, total_template_count - received_template_counts.get(c.id, 0)),
        }
        for c in customers
    ]

@router.post("/", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
def create_customer(data: CustomerCreate, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    if db.query(Customer).filter(Customer.username == data.username).first():
        raise HTTPException(status_code=400, detail="このユーザー名はすでに使用されています")
    if data.subscription_plan not in ("buy_once", "monthly"):
        raise HTTPException(status_code=400, detail="subscription_plan は 'buy_once' または 'monthly' を指定してください")
    if data.role not in ("learner", "instructor", "admin"):
        raise HTTPException(status_code=400, detail="role は 'learner' / 'instructor' / 'admin' のいずれかを指定してください")
    customer = Customer(
        username=data.username,
        hashed_password=hash_password(data.password),
        email=data.email,
        character_id=data.character_id,
        theme_config=data.theme_config,
        subscription_plan=data.subscription_plan,
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
    character_id: Optional[int] = None
    is_active: Optional[bool] = None
    subscription_plan: Optional[str] = None
    character_memory: Optional[dict] = None

@router.patch("/{customer_id}")
def update_customer(customer_id: int, data: CustomerUpdate, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="顧客が見つかりません")

    # ユーザー名変更時は重複チェック
    if data.username is not None and data.username != customer.username:
        if db.query(Customer).filter(Customer.username == data.username, Customer.id != customer_id).first():
            raise HTTPException(status_code=400, detail="このユーザー名はすでに使用されています")

    old_character_id = customer.character_id

    for key, val in data.model_dump(exclude_none=True).items():
        setattr(customer, key, val)

    # オリジナルキャラ作成完了：キャラ未割り当て→割り当て済みになったタイミングで
    # 本棚に「ようこそ」演出を一度表示するためのフラグを立てる
    if old_character_id is None and customer.character_id is not None:
        customer.character_ready_announced = False

    # キャラ未割り当てだった顧客が割り当て済みになった場合、本棚の汎用ウェルカム記事を
    # キャラクター専用版（既に登録済みなら）に差し替える
    if old_character_id != customer.character_id:
        swap_welcome_article_if_character_ready(db, customer)

    db.commit()
    db.refresh(customer)

    # オリジナルキャラ作成完了：キャラ未割り当て→割り当て済みになったタイミングで
    # 完成案内メールを送信する（受注の「納品完了」操作とは独立して、割り当て時に1回だけ送る）
    if old_character_id is None and customer.character_id is not None and customer.email:
        character = db.query(Character).filter(Character.id == customer.character_id).first()
        if character:
            send_email(
                to=customer.email,
                subject="【推しEnglish】あなた専用キャラクターが完成しました",
                html=(
                    f"<p>{customer.username} 様</p>"
                    f"<p>お待たせしました。あなた専用のキャラクター「{character.name}」が完成しました！</p>"
                    "<p>さっそくアプリにログインして、アプリ内チャットでやり取りを始めましょう。</p>"
                    f'<p><a href="{settings.FRONTEND_URL}/login">ログインはこちら</a></p>'
                ),
            )

    # 最新の intimacy も含めて返す（フロントエンドがそのまま使えるように）
    return {
        "id": customer.id,
        "username": customer.username,
        "email": customer.email,
        "role": customer.role,
        "is_active": customer.is_active,
        "is_password_reset_required": customer.is_password_reset_required,
        "character_id": customer.character_id,
        "subscription_plan": customer.subscription_plan,
        "character_memory": customer.character_memory,
        "intimacy": intimacy_info(customer.intimacy_points),
    }


@router.get("/{customer_id}/progress-stats")
def get_customer_progress_stats(customer_id: int, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """『先週より伸びたね！』のような、キャラクターが顧客の頑張りに気づいている演出をするための
    簡易的な進捗比較データを返す（直近7日間とその前の7日間で、記事の閲覧件数を比較する）。
    """
    from datetime import datetime, timedelta

    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="顧客が見つかりません")

    now = datetime.utcnow()
    this_week_start = now - timedelta(days=7)
    last_week_start = now - timedelta(days=14)

    this_week_count = db.query(func.count(AccessLog.id)).filter(
        AccessLog.customer_id == customer_id,
        AccessLog.accessed_at >= this_week_start,
    ).scalar() or 0
    last_week_count = db.query(func.count(AccessLog.id)).filter(
        AccessLog.customer_id == customer_id,
        AccessLog.accessed_at >= last_week_start,
        AccessLog.accessed_at < this_week_start,
    ).scalar() or 0

    if this_week_count > last_week_count:
        trend = "up"
    elif this_week_count < last_week_count:
        trend = "down"
    else:
        trend = "flat"

    total_published_articles = db.query(func.count(Article.id)).filter(
        Article.customer_id == customer_id,
        Article.status == "published",
        Article.article_type == "request",
    ).scalar() or 0

    total_published_exercises = db.query(func.count(Article.id)).filter(
        Article.customer_id == customer_id,
        Article.status == "published",
        Article.article_type == "exercise",
    ).scalar() or 0

    return {
        "this_week_access_count": this_week_count,
        "last_week_access_count": last_week_count,
        "trend": trend,  # up（伸びている）/ down（少し減っている）/ flat（変わらない）
        # 依頼記事と演習問題を分けて返す（LLMプロンプトで「X本書いた」「Y問解いた」と区別して表示するため）
        "total_published_articles": total_published_articles,
        "total_published_exercises": total_published_exercises,
        "total_published_all": total_published_articles + total_published_exercises,
    }


_generate_temp_password = generate_temp_password


@router.post("/{customer_id}/reissue-password")
def reissue_password(customer_id: int, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """顧客のパスワードを再発行する。

    パスワードはハッシュ化して保存しているため元の文字列は復元できない
    （閲覧は原理的に不可能）。そのため「忘れた・分からない」場合の実務対応として、
    新しいランダムな一時パスワードを生成し、この場で一度だけ平文を返す
    （以後は表示も復元もできない）。次回ログイン時に変更必須フラグも立てる。
    """
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="顧客が見つかりません")

    new_password = _generate_temp_password()
    customer.hashed_password = hash_password(new_password)
    customer.is_password_reset_required = True
    db.commit()

    return {
        "message": "新しい一時パスワードを発行しました。この画面を閉じると二度と表示できないため、必ずこの場でお客様に伝えてください。",
        "username": customer.username,
        "temporary_password": new_password,
    }


def _delete_customer_and_related_data(db: Session, customer: Customer) -> None:
    """顧客本体および関連レコードをまとめて削除する（DBから完全に削除）。

    管理者による削除・顧客自身の退会のいずれでも、DM(messages)・記事(articles)・
    アクセスログ(access_logs)等が残っていると外部キー制約により削除に失敗するため、
    関連レコードを先にまとめて削除してから顧客本体を削除する。呼び出し元でdb.commit()すること。
    """
    customer_id = customer.id

    db.query(ExerciseSubmission).filter(ExerciseSubmission.customer_id == customer_id).delete(synchronize_session=False)
    db.query(MessageFeedback).filter(MessageFeedback.customer_id == customer_id).delete(synchronize_session=False)
    db.query(PreviewExample).filter(PreviewExample.customer_id == customer_id).delete(synchronize_session=False)
    db.query(Message).filter(Message.customer_id == customer_id).delete(synchronize_session=False)
    db.query(AccessLog).filter(AccessLog.customer_id == customer_id).delete(synchronize_session=False)
    db.query(CustomerReward).filter(CustomerReward.customer_id == customer_id).delete(synchronize_session=False)

    # Article ⇄ CorrectionRequest は相互参照のため、先にArticle側の参照を外してから
    # CorrectionRequestを削除し、その後Articleを削除する
    db.query(Article).filter(Article.customer_id == customer_id).update(
        {"correction_request_id": None}, synchronize_session=False
    )
    db.query(CorrectionRequest).filter(CorrectionRequest.customer_id == customer_id).delete(synchronize_session=False)
    db.query(Article).filter(Article.customer_id == customer_id).delete(synchronize_session=False)

    # 紐づいている受注（受注リスト）の顧客アカウント紐づけを解除
    db.query(Order).filter(Order.customer_id == customer_id).update(
        {"customer_id": None}, synchronize_session=False
    )

    db.delete(customer)


@router.delete("/{customer_id}")
def delete_customer(customer_id: int, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """顧客を削除する（関連するDM・記事・アクセスログ・添削リクエスト・解放済みご褒美も合わせて
    DBから完全に削除される）。"""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="顧客が見つかりません")

    _delete_customer_and_related_data(db, customer)
    db.commit()
    return {"message": "削除しました（関連するDM・記事・アクセスログ・添削リクエスト・解放済みご褒美も合わせて削除されました）"}


@router.post("/me/ack-character-ready")
def ack_character_ready(current_user: Customer = Depends(get_current_user), db: Session = Depends(get_db)):
    """オリジナルキャラ作成完了の「ようこそ」演出を表示済みにする（一人一回限り）。"""
    current_user.character_ready_announced = True
    db.commit()
    return {"message": "確認しました"}


@router.post("/me/withdraw")
def withdraw(current_user: Customer = Depends(get_current_user), db: Session = Depends(get_db)):
    """顧客自身による退会処理。

    返金・解約ポリシー: Stripeのサブスクリプションが存在する場合は解約し、
    アカウント・キャラとのチャット履歴・記事等をDBから完全に削除した上で
    退会完了メールを送信する（管理者による削除と同じ完全削除処理）。
    """
    if current_user.role == "admin":
        raise HTTPException(status_code=403, detail="管理者アカウントは退会できません")

    if current_user.stripe_subscription_id and settings.STRIPE_SECRET_KEY:
        try:
            import stripe
            stripe.api_key = settings.STRIPE_SECRET_KEY
            stripe.Subscription.delete(current_user.stripe_subscription_id)
        except Exception:
            logger.exception("[Stripe] サブスクリプションの解約に失敗しました")

    # メール送信用に削除前の情報を保持しておく
    email = current_user.email
    username = current_user.username

    _delete_customer_and_related_data(db, current_user)
    db.commit()

    if email:
        send_email(
            to=email,
            subject="【推しEnglish】退会手続き完了のお知らせ",
            html=(
                f"<p>{username} 様</p>"
                "<p>退会手続きが完了しました。これまでご利用いただきありがとうございました。</p>"
                "<p>アカウント情報・キャラクターとのチャット履歴・記事等はすべて削除されました。</p>"
            ),
        )

    return {"message": "退会処理が完了しました。ご利用ありがとうございました。"}
