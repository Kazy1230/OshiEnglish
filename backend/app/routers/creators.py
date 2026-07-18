from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator

from app.core.database import get_db
from app.core.security import get_current_user, get_current_user_optional, get_current_creator_or_admin, hash_password, create_access_token
from app.core.rate_limit import enforce_rate_limit
from app.core.llm import generate_text, LLMError
from app.core import creator_prompts
from app.models.customer import Customer
from app.models.creator_profile import CreatorProfile
from app.models.course import Course
from app.models.favorite import Favorite
from app.core.character_voice import customer_display_name
from app.core.config import settings
from app.models.purchase import Purchase
from app.models.course_subscription import CourseSubscription
from app.models.personality_profile import PersonalityProfile
from app.models.interview_session import InterviewSession

router = APIRouter(prefix="/creators", tags=["クリエイター"])


def _serialize_creator_card(profile: CreatorProfile) -> dict:
    # 学習者に見せる名前は、メールアドレス等が混ざりうるusernameより、まず人格(キャラクター)名を優先する
    display_name = profile.character.name if profile.character else customer_display_name(profile.user)
    return {
        "id": profile.id,
        "display_name": display_name,
        "bio": profile.bio,
        # 1クリエイター=1人格(キャラクター)
        "character": (
            {"id": profile.character.id, "name": profile.character.name, "avatar_url": profile.character.image_url}
            if profile.character else None
        ),
    }


def _serialize_own_profile(profile: CreatorProfile) -> dict:
    return {
        "id": profile.id,
        "bio": profile.bio,
        "speciality": profile.speciality,
        "experience": profile.experience,
        "sns_youtube": profile.sns_youtube,
        "sns_instagram": profile.sns_instagram,
        "sns_twitter": profile.sns_twitter,
        "status": profile.status,
    }


class CreatorApplyRequest(BaseModel):
    speciality: Optional[str] = None
    experience: Optional[str] = None
    sns_youtube: Optional[str] = None
    sns_instagram: Optional[str] = None
    sns_twitter: Optional[str] = None


class CreatorApplySignupRequest(CreatorApplyRequest):
    email: str
    password: str

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("パスワードは8文字以上にしてください")
        return v


@router.post("/apply-public", status_code=201)
def apply_as_creator_public(data: CreatorApplySignupRequest, request: Request, db: Session = Depends(get_db)):
    """クリエイター申請（未登録者向け）。アカウント作成とクリエイター申請を同時に行い、ログイン済み状態のトークンを返す。
    既存の学習者アカウントを持つユーザーは、ログイン後に/apply（要ログイン）から申請する。"""
    enforce_rate_limit(request, "creator-apply-public", limit=10, window_seconds=3600)

    if db.query(Customer).filter(
        (Customer.email == data.email) | (Customer.username == data.email)
    ).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="このメールアドレスは既に登録されています")

    user = Customer(
        username=data.email,
        email=data.email,
        hashed_password=hash_password(data.password),
        role="creator",
        is_password_reset_required=False,
    )
    db.add(user)
    db.flush()

    profile = CreatorProfile(
        user_id=user.id,
        speciality=data.speciality,
        experience=data.experience,
        sns_youtube=data.sns_youtube,
        sns_instagram=data.sns_instagram,
        sns_twitter=data.sns_twitter,
        status="pending",
    )
    db.add(profile)
    db.commit()

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return {
        "access_token": token,
        "token_type": "bearer",
        "is_password_reset_required": False,
    }


@router.post("/apply", status_code=201)
def apply_as_creator(data: CreatorApplyRequest, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """クリエイター申請（学習者本人）。承認制のため status='pending' で作成し、運営審査後にactiveへ変更される。"""
    if current_user.role == "admin":
        raise HTTPException(status_code=400, detail="管理者アカウントはクリエイター申請できません")

    existing = db.query(CreatorProfile).filter(CreatorProfile.user_id == current_user.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="すでにクリエイター申請済みです")

    has_learner_history = (
        db.query(Purchase).filter(Purchase.user_id == current_user.id, Purchase.status == "succeeded").first()
        or db.query(CourseSubscription).filter(CourseSubscription.user_id == current_user.id).first()
    )
    if has_learner_history:
        raise HTTPException(status_code=400, detail="学習者として購入・契約履歴があるアカウントはクリエイター申請できません")

    profile = CreatorProfile(
        user_id=current_user.id,
        speciality=data.speciality,
        experience=data.experience,
        sns_youtube=data.sns_youtube,
        sns_instagram=data.sns_instagram,
        sns_twitter=data.sns_twitter,
        status="pending",
    )
    db.add(profile)
    current_user.role = "creator"
    db.commit()
    db.refresh(profile)
    return _serialize_own_profile(profile)


class CreatorProfileUpdate(BaseModel):
    bio: Optional[str] = None
    speciality: Optional[str] = None
    experience: Optional[str] = None
    sns_youtube: Optional[str] = None
    sns_instagram: Optional[str] = None
    sns_twitter: Optional[str] = None


@router.get("/me")
def get_my_profile(current_user=Depends(get_current_creator_or_admin), db: Session = Depends(get_db)):
    profile = db.query(CreatorProfile).filter(CreatorProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="クリエイタープロフィールが見つかりません")
    return _serialize_own_profile(profile)


@router.put("/me")
def update_my_profile(data: CreatorProfileUpdate, current_user=Depends(get_current_creator_or_admin), db: Session = Depends(get_db)):
    profile = db.query(CreatorProfile).filter(CreatorProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="クリエイタープロフィールが見つかりません")
    for key, val in data.model_dump(exclude_none=True).items():
        setattr(profile, key, val)
    db.commit()
    db.refresh(profile)
    return _serialize_own_profile(profile)


@router.get("/me/revenue")
def get_my_revenue(current_user=Depends(get_current_creator_or_admin), db: Session = Depends(get_db)):
    """クリエイターの収益ダッシュボード（要件定義書5.9節：ユーザー課金→手数料控除→クリエイター残高）。
    AIチャット残高へチャージ済みの額は振込予定額から差し引く。要(本人)"""
    profile = db.query(CreatorProfile).filter(CreatorProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="クリエイタープロフィールが見つかりません")

    course_ids = [c.id for c in db.query(Course).filter(Course.character_id == profile.character.id).all()] if profile.character else []
    if not course_ids:
        return {"gross_revenue": 0, "platform_fee": 0, "net_balance": 0, "active_subscriptions": 0, "fee_rate": settings.PLATFORM_FEE_RATE}

    one_time_total = sum(
        p.amount for p in db.query(Purchase).filter(
            Purchase.course_id.in_(course_ids), Purchase.status == "succeeded"
        ).all()
    )
    active_subs = db.query(CourseSubscription).filter(
        CourseSubscription.course_id.in_(course_ids), CourseSubscription.status == "active"
    ).all()
    subscription_mrr = 0
    for sub in active_subs:
        course = db.query(Course).filter(Course.id == sub.course_id).first()
        if not course:
            continue
        subscription_mrr += (course.tier_a_price if sub.tier == "A" else course.tier_b_price) or 0

    gross_revenue = one_time_total + subscription_mrr
    platform_fee = round(gross_revenue * settings.PLATFORM_FEE_RATE)
    net_balance = (gross_revenue - platform_fee) - profile.ai_credit_transferred_yen

    return {
        "gross_revenue": gross_revenue,
        "platform_fee": platform_fee,
        "net_balance": max(0, net_balance),
        "active_subscriptions": len(active_subs),
        "fee_rate": settings.PLATFORM_FEE_RATE,
    }


def _compute_net_balance(db: Session, profile: CreatorProfile) -> int:
    """get_my_revenueと同じロジックで生涯の売上利益(net_balance)を計算する。"""
    course_ids = [c.id for c in db.query(Course).filter(Course.character_id == profile.character.id).all()] if profile.character else []
    if not course_ids:
        return 0
    one_time_total = sum(
        p.amount for p in db.query(Purchase).filter(
            Purchase.course_id.in_(course_ids), Purchase.status == "succeeded"
        ).all()
    )
    active_subs = db.query(CourseSubscription).filter(
        CourseSubscription.course_id.in_(course_ids), CourseSubscription.status == "active"
    ).all()
    subscription_mrr = 0
    for sub in active_subs:
        course = db.query(Course).filter(Course.id == sub.course_id).first()
        if not course:
            continue
        subscription_mrr += (course.tier_a_price if sub.tier == "A" else course.tier_b_price) or 0
    gross_revenue = one_time_total + subscription_mrr
    platform_fee = round(gross_revenue * settings.PLATFORM_FEE_RATE)
    return gross_revenue - platform_fee


@router.get("/me/ai-balance")
def get_my_ai_balance(current_user=Depends(get_current_creator_or_admin), db: Session = Depends(get_db)):
    """30日カレンダー相談AIチャットの残高と、売上利益からチャージ可能な額を返す。要(本人)"""
    profile = db.query(CreatorProfile).filter(CreatorProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="クリエイタープロフィールが見つかりません")
    net_balance = _compute_net_balance(db, profile)
    available_to_transfer = max(0, net_balance - profile.ai_credit_transferred_yen)
    return {
        "balance": profile.ai_chat_balance,
        "available_to_transfer": available_to_transfer,
        "transferred_total": profile.ai_credit_transferred_yen,
    }


class AiBalanceTransferRequest(BaseModel):
    amount: int


@router.post("/me/ai-balance/transfer")
def transfer_revenue_to_ai_balance(data: AiBalanceTransferRequest, current_user=Depends(get_current_creator_or_admin), db: Session = Depends(get_db)):
    """売上利益をAIチャット残高にチャージする（1円=1クレジット。追加のStripe決済は不要）。要(本人)"""
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="1以上の金額を指定してください")
    profile = db.query(CreatorProfile).filter(CreatorProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="クリエイタープロフィールが見つかりません")

    net_balance = _compute_net_balance(db, profile)
    available_to_transfer = max(0, net_balance - profile.ai_credit_transferred_yen)
    if data.amount > available_to_transfer:
        raise HTTPException(status_code=400, detail=f"チャージ可能な額（¥{available_to_transfer}）を超えています")

    profile.ai_chat_balance += data.amount
    profile.ai_credit_transferred_yen += data.amount
    db.commit()
    return {
        "balance": profile.ai_chat_balance,
        "available_to_transfer": available_to_transfer - data.amount,
        "transferred_total": profile.ai_credit_transferred_yen,
    }


@router.get("/")
def list_creators(db: Session = Depends(get_db)):
    """クリエイター一覧取得(公開中のプロフィールのみ)"""
    profiles = db.query(CreatorProfile).filter(CreatorProfile.status == "active").all()
    result = []
    for p in profiles:
        data = _serialize_creator_card(p)
        course_ids = [r[0] for r in db.query(Course.id).filter(Course.character_id == p.character.id, Course.status == "published").all()] if p.character else []
        personality = db.query(PersonalityProfile).filter(PersonalityProfile.creator_id == p.id).first()
        data["total_learners"] = _count_total_learners(db, course_ids)
        data["coaching_tags"] = creator_prompts.coaching_tags_from_profile(personality.profile) if personality and personality.profile else []
        data["sample_reply"] = personality.sample_reply if personality else None
        result.append(data)
    return result


def _count_total_learners(db: Session, course_ids: list[int]) -> int:
    """そのクリエイターの全コースを買い切り購入またはサブスク契約したことがある学習者の数（重複除去）。"""
    if not course_ids:
        return 0
    purchaser_ids = {
        r[0] for r in db.query(Purchase.user_id).filter(
            Purchase.course_id.in_(course_ids), Purchase.status == "succeeded"
        ).all()
    }
    subscriber_ids = {
        r[0] for r in db.query(CourseSubscription.user_id).filter(
            CourseSubscription.course_id.in_(course_ids)
        ).all()
    }
    return len(purchaser_ids | subscriber_ids)


@router.get("/{creator_id}")
def get_creator(creator_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user_optional)):
    """クリエイターページ情報取得"""
    profile = db.query(CreatorProfile).filter(CreatorProfile.id == creator_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="クリエイターが見つかりません")

    courses = []
    if profile.character:
        courses = db.query(Course).filter(
            Course.character_id == profile.character.id,
            Course.status == "published",
            Course.is_suspended == False,  # noqa: E712
        ).order_by(Course.created_at.desc()).all()

    is_favorited = False
    if current_user:
        is_favorited = db.query(Favorite).filter(
            Favorite.user_id == current_user.id,
            Favorite.creator_id == profile.id,
        ).first() is not None

    personality = db.query(PersonalityProfile).filter(PersonalityProfile.creator_id == profile.id).first()

    data = _serialize_creator_card(profile)
    data["sns_youtube"] = profile.sns_youtube
    data["sns_instagram"] = profile.sns_instagram
    data["sns_twitter"] = profile.sns_twitter
    data["speciality"] = profile.speciality
    data["experience"] = profile.experience
    data["self_intro"] = profile.self_intro
    data["coaching_tags"] = creator_prompts.coaching_tags_from_profile(personality.profile) if personality and personality.profile else []
    data["skill_tags"] = creator_prompts.skill_tags_from_profile(personality.profile) if personality and personality.profile else []
    data["sample_reply"] = personality.sample_reply if personality else None
    data["total_learners"] = _count_total_learners(db, [c.id for c in courses])
    data["courses"] = [
        {
            "id": c.id, "title": c.title, "description": c.description,
            "thumbnail_url": c.thumbnail_url, "category": c.category,
            "price": c.price, "is_free": c.is_free,
        }
        for c in courses
    ]
    data["is_favorited"] = is_favorited
    return data


@router.post("/me/generate-intro")
def generate_my_intro(current_user=Depends(get_current_creator_or_admin), db: Session = Depends(get_db)):
    """人格プロファイルの口調を反映した自己紹介文を生成して保存する（1回生成・保存方式、都度生成はしない）。要(本人)"""
    profile = db.query(CreatorProfile).filter(CreatorProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="クリエイタープロフィールが見つかりません")
    personality = db.query(PersonalityProfile).filter(PersonalityProfile.creator_id == profile.id).first()
    if not personality or not personality.profile:
        raise HTTPException(status_code=400, detail="先にAIインタビューで人格プロファイルを作成してください")

    interview_session = db.query(InterviewSession).filter(InterviewSession.creator_id == profile.id).first()
    subject = (interview_session.subject if interview_session else None) or profile.speciality

    try:
        _intro_msgs = creator_prompts.build_self_intro_messages(personality.profile, profile.speciality, profile.experience, subject=subject)
        intro = generate_text(
            _intro_msgs[0]["content"],
            _intro_msgs[1:],
            max_tokens=300,
        )
    except LLMError as e:
        raise HTTPException(status_code=500, detail=f"自己紹介文の生成に失敗しました: {e}") from e

    profile.self_intro = intro
    db.commit()
    return {"self_intro": profile.self_intro}
