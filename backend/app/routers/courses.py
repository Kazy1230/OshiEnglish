import json
import os
import re
import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy import func
from sqlalchemy.orm import Session
from pydantic import BaseModel, model_validator

from app.core.database import get_db
from app.core.security import get_current_user, get_current_user_optional
from app.core.uploads import validate_image_content
from app.models.course import Course
from app.models.course_chapter import CourseChapter
from app.models.chapter_card import ChapterCard
from app.models.card_progress import CardProgress
from app.models.character import Character
from app.models.creator_profile import CreatorProfile
from app.models.purchase import Purchase
from app.models.favorite import Favorite
from app.models.notification import Notification
from app.models.course_material import CourseMaterial
from app.models.personality_profile import PersonalityProfile
from app.models.course_subscription import CourseSubscription
from app.models.course_day import CourseDay
from app.models.day_log import DayLog
from app.core.llm import generate_text, LLMError
from app.core import course_generation_prompts as gen_prompts
from app.core.access_control import is_interaction_expired

router = APIRouter(tags=["コース・レッスン"])

# サムネイル画像保存先（main.py で /static にマウントされているディレクトリ配下）
_THUMBNAIL_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static", "course_thumbnails")
os.makedirs(_THUMBNAIL_DIR, exist_ok=True)
_ALLOWED_THUMBNAIL_EXT = {".png", ".jpg", ".jpeg", ".webp"}
_MAX_THUMBNAIL_SIZE = 5 * 1024 * 1024  # 5MB


# ----- 権限ヘルパー -----

def _get_owned_course(db: Session, course_id: int, current_user) -> Course:
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="コースが見つかりません")
    if current_user.role != "admin":
        profile = db.query(CreatorProfile).filter(CreatorProfile.user_id == current_user.id).first()
        if not profile or course.character.creator_id != profile.id:
            raise HTTPException(status_code=403, detail="このコースを操作する権限がありません")
    return course


def _is_purchased(db: Session, user_id: Optional[int], course_id: int) -> bool:
    if not user_id:
        return False
    has_one_time_purchase = db.query(Purchase).filter(
        Purchase.user_id == user_id,
        Purchase.course_id == course_id,
        Purchase.status == "succeeded",
    ).first() is not None
    if has_one_time_purchase:
        return True
    sub = db.query(CourseSubscription).filter(
        CourseSubscription.user_id == user_id,
        CourseSubscription.course_id == course_id,
        CourseSubscription.status.in_(["active", "past_due"]),
    ).first()
    if not sub:
        return False
    if sub.status == "active":
        return True
    # past_due（決済失敗）でも3日間は猶予期間としてアクセスを許可する
    from datetime import datetime, timezone, timedelta
    if not sub.past_due_since:
        return True
    return datetime.now(timezone.utc) < sub.past_due_since.replace(tzinfo=timezone.utc) + timedelta(days=3)


def _is_accessible(db: Session, course: Course, user_id: Optional[int]) -> bool:
    """管理者がコースを停止（G-02）した場合、購入済みでも利用不可にする。
    無料コースも「受講する」ボタンでamount=0のPurchaseが作成されるまでは未購入扱いとする。"""
    if course.is_suspended:
        return False
    return _is_purchased(db, user_id, course.id)


# ----- シリアライズ -----

def _serialize_character_brief(character: Character) -> dict:
    return {"id": character.id, "name": character.name, "avatar_url": character.image_url, "creator_id": character.creator_id}



def _serialize_course_card(course: Course) -> dict:
    return {
        "id": course.id,
        "title": course.title,
        "description": course.description,
        "thumbnail_url": course.thumbnail_url,
        "subject": course.subject,
        "category": course.category,
        "status": course.status,
        "price": course.price,
        "is_free": course.is_free,
        "tier_a_price": course.tier_a_price,
        "tier_b_price": course.tier_b_price,
        "course_type": course.course_type,
        "pace_unit_description": course.pace_unit_description,
        "is_suspended": course.is_suspended,
        "suspension_reason": course.suspension_reason,
        "completion_video_url": course.completion_video_url,
        "curriculum_target_audience": course.curriculum_target_audience,
        "character": _serialize_character_brief(course.character),
    }



def _serialize_course_detail(db: Session, course: Course, current_user) -> dict:
    user_id = current_user.id if current_user else None
    # 管理者は審査のため、購入状態によらずカードの本文・動画URLを閲覧できる必要がある
    is_admin = bool(current_user and current_user.role == "admin")
    unlocked = is_admin or _is_accessible(db, course, user_id)
    data = _serialize_course_card(course)
    data["is_purchased"] = unlocked
    data["chapter_count"] = len(course.chapters)
    purchase_count = db.query(Purchase).filter(
        Purchase.course_id == course.id, Purchase.status == "succeeded"
    ).count()
    subscription_count = db.query(CourseSubscription).filter(
        CourseSubscription.course_id == course.id, CourseSubscription.status == "active"
    ).count()
    data["enrollment_count"] = purchase_count + subscription_count
    subscription = None
    if user_id:
        subscription = db.query(CourseSubscription).filter(
            CourseSubscription.user_id == user_id,
            CourseSubscription.course_id == course.id,
            CourseSubscription.status.in_(["incomplete", "active", "past_due"]),
        ).first()
    data["my_subscription"] = (
        {"id": subscription.id, "tier": subscription.tier, "status": subscription.status} if subscription else None
    )
    # ペース管理型(30日カレンダー)コースの日次データ。管理者の審査画面で内容を確認できるようにする
    data["days"] = [_serialize_course_day(d) for d in course.days] if (unlocked and course.course_type == "pace_based") else []

    chapters = sorted(course.chapters, key=lambda ch: ch.order)
    data["chapters"] = [
        {
            "id": ch.id,
            "order": ch.order,
            "title": ch.title,
            "goal": ch.goal,
            "cards": [
                {
                    "id": c.id,
                    "order": c.order,
                    "card_type": c.card_type,
                    "title": c.title,
                    "is_preview": c.is_preview,
                    # 購入済み、またはis_preview=trueの無料プレビューカードのみ本文を返す（管理者は審査のため常時閲覧可）
                    "body": c.body if (unlocked or c.is_preview) else None,
                    "youtube_url": c.youtube_url if (unlocked or c.is_preview) else None,
                    "quiz_options": c.quiz_options if (unlocked or c.is_preview) else None,
                }
                for c in sorted(ch.cards, key=lambda c: c.order)
            ],
        }
        for ch in chapters
    ]
    return data


# ----- リクエストスキーマ -----

COURSE_TYPES = ("self_paced", "pace_based")


class CourseCreate(BaseModel):
    creator_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    subject: str = ""
    category: Optional[str] = None
    price: int = 0
    is_free: bool = False
    tier_a_price: Optional[int] = None
    tier_b_price: Optional[int] = None
    course_type: str = "self_paced"
    pace_unit_description: Optional[str] = None
    curriculum_target_audience: Optional[str] = None
    curriculum_topics: Optional[str] = None
    curriculum_style: Optional[str] = None

    @model_validator(mode="after")
    def _validate_price(self):
        if not self.is_free and self.price < 100 and self.tier_a_price is None and self.tier_b_price is None:
            raise ValueError("有料コースの価格は100円以上を指定してください")
        if self.is_free:
            self.price = 0
            self.tier_a_price = None
            self.tier_b_price = None
        if self.tier_a_price is not None and not (980 <= self.tier_a_price <= 20000):
            raise ValueError("Tier Aの価格は980〜20000円/月で指定してください")
        if self.tier_b_price is not None and not (2980 <= self.tier_b_price <= 100000):
            raise ValueError("Tier Bの価格は2980〜100000円/月で指定してください")
        if self.course_type not in COURSE_TYPES:
            raise ValueError(f"course_typeは{COURSE_TYPES}のいずれかを指定してください")
        if self.course_type == "self_paced":
            self.pace_unit_description = None
        return self


class CourseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    subject: Optional[str] = None
    category: Optional[str] = None
    price: Optional[int] = None
    is_free: Optional[bool] = None
    status: Optional[str] = None
    tier_a_price: Optional[int] = None
    tier_b_price: Optional[int] = None
    curriculum_target_audience: Optional[str] = None
    curriculum_topics: Optional[str] = None
    curriculum_style: Optional[str] = None
    completion_video_url: Optional[str] = None

    @model_validator(mode="after")
    def _validate_status(self):
        if self.status is not None and self.status not in ("draft", "unpublished"):
            raise ValueError("status は 'draft' / 'unpublished' のいずれかを指定してください（公開には運営の承認が必要です）")
        if self.tier_a_price is not None and not (980 <= self.tier_a_price <= 20000):
            raise ValueError("Tier Aの価格は980〜20000円/月で指定してください")
        if self.tier_b_price is not None and not (2980 <= self.tier_b_price <= 100000):
            raise ValueError("Tier Bの価格は2980〜100000円/月で指定してください")
        return self


class CourseMaterialCreate(BaseModel):
    type: str  # pdf / url
    title: str
    file_url: str

    @model_validator(mode="after")
    def _validate_type(self):
        if self.type not in ("pdf", "url"):
            raise ValueError("type は 'pdf' または 'url' を指定してください")
        return self




# ----- コースAPI -----

@router.get("/courses")
def list_courses(category: Optional[str] = None, db: Session = Depends(get_db)):
    """コース一覧(新着・カテゴリフィルタ)。公開済みかつ停止されていないものだけ返す"""
    query = db.query(Course).filter(Course.status == "published", Course.is_suspended == False)  # noqa: E712
    if category:
        query = query.filter(Course.category == category)
    courses = query.order_by(Course.created_at.desc()).all()
    return [_serialize_course_card(c) for c in courses]


@router.get("/stats/public")
def get_public_stats(db: Session = Depends(get_db)):
    """トップページの社会的証明セクション用。コースを卒業した学習者の延べ人数(実数)。"""
    from app.models.purchase import Purchase as PurchaseModel
    achievers_count = db.query(PurchaseModel).filter(PurchaseModel.is_graduated == True).count()  # noqa: E712
    return {"achievers_count": achievers_count}


@router.get("/creators/{creator_id}/courses")
def list_creator_courses(creator_id: int, db: Session = Depends(get_db)):
    """クリエイター別コース一覧(公開済みのみ)"""
    profile = db.query(CreatorProfile).filter(CreatorProfile.id == creator_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="クリエイターが見つかりません")
    if not profile.character:
        return []
    courses = db.query(Course).filter(
        Course.character_id == profile.character.id,
        Course.status == "published",
        Course.is_suspended == False,  # noqa: E712
    ).order_by(Course.created_at.desc()).all()
    return [_serialize_course_card(c) for c in courses]


@router.get("/courses/me/created")
def list_my_created_courses(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """ログイン中のクリエイターが作成した全コースを、申込者数とともに返す(クリエイターのコース管理画面用)。要(クリエイター)"""
    if current_user.role not in ("creator", "admin"):
        raise HTTPException(status_code=403, detail="クリエイター権限が必要です")
    profile = db.query(CreatorProfile).filter(CreatorProfile.user_id == current_user.id).first()
    if not profile or not profile.character:
        return []
    courses = db.query(Course).filter(Course.character_id == profile.character.id).order_by(Course.created_at.desc()).all()
    results = []
    for course in courses:
        purchase_count = db.query(Purchase).filter(
            Purchase.course_id == course.id, Purchase.status == "succeeded"
        ).count()
        subscription_count = db.query(CourseSubscription).filter(
            CourseSubscription.course_id == course.id, CourseSubscription.status == "active"
        ).count()
        results.append({
            "id": course.id,
            "title": course.title,
            "status": course.status,
            "is_suspended": course.is_suspended,
            "course_type": course.course_type,
            "enrollment_count": purchase_count + subscription_count,
        })
    return results


@router.get("/courses/{course_id}/enrollments")
def list_course_enrollments(course_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """このコースに申し込んだ学習者一覧(買い切り購入者+サブスク契約者)を返す。要(本人)"""
    course = _get_owned_course(db, course_id, current_user)

    purchases = db.query(Purchase).filter(
        Purchase.course_id == course.id, Purchase.status == "succeeded"
    ).all()
    results = [
        {
            "user_id": p.user_id,
            "username": p.user.username,
            "type": "purchase",
            "tier": None,
            "status": "succeeded",
            "enrolled_at": p.purchased_at,
        }
        for p in purchases
    ]

    subscriptions = db.query(CourseSubscription).filter(CourseSubscription.course_id == course.id).all()
    results += [
        {
            "user_id": s.user_id,
            "username": s.user.username,
            "type": "subscription",
            "tier": s.tier,
            "status": s.status,
            "enrolled_at": s.created_at,
        }
        for s in subscriptions
    ]

    results.sort(key=lambda r: r["enrolled_at"] or "", reverse=True)
    return results


@router.get("/courses/{course_id}")
def get_course(course_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user_optional)):
    """コース詳細(レッスン一覧含む)。未購入かつ有料の場合、is_preview=falseのレッスンはbody/youtube_urlをnullで返す"""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="コースが見つかりません")

    if course.status != "published" or course.is_suspended:
        is_owner = False
        if current_user:
            if current_user.role == "admin":
                is_owner = True
            else:
                profile = db.query(CreatorProfile).filter(CreatorProfile.user_id == current_user.id).first()
                is_owner = bool(profile and course.character.creator_id == profile.id)
        if not is_owner:
            raise HTTPException(status_code=404, detail="コースが見つかりません")

    return _serialize_course_detail(db, course, current_user)


@router.post("/courses", status_code=status.HTTP_201_CREATED)
def create_course(data: CourseCreate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """コース新規作成(status='draft')。要(クリエイター)。
    キャラクター(人格)は1クリエイターに1つしか存在しないため、選択は不要で自動的に紐づく。"""
    if current_user.role not in ("creator", "admin"):
        raise HTTPException(status_code=403, detail="クリエイター権限が必要です")

    if current_user.role == "admin":
        if data.creator_id is None:
            raise HTTPException(status_code=400, detail="管理者が代理作成する場合はcreator_idを指定してください")
        profile = db.query(CreatorProfile).filter(CreatorProfile.id == data.creator_id).first()
        if not profile:
            raise HTTPException(status_code=404, detail="クリエイターが見つかりません")
    else:
        profile = db.query(CreatorProfile).filter(CreatorProfile.user_id == current_user.id).first()
        if not profile:
            raise HTTPException(status_code=400, detail="クリエイタープロフィールが見つかりません")
        if profile.status != "active":
            raise HTTPException(status_code=403, detail="クリエイター申請が承認されるまでコースを作成できません")

    character = profile.character
    if not character:
        raise HTTPException(status_code=400, detail="先にAIインタビューを完了し、人格(キャラクター)を作成してください")

    # 30日コース生成にはクリエイター本人の人格プロファイルを使う
    personality = db.query(PersonalityProfile).filter(PersonalityProfile.creator_id == profile.id).first()

    course = Course(
        character_id=character.id,
        title=data.title,
        description=data.description,
        thumbnail_url=data.thumbnail_url,
        subject=data.subject,
        category=data.category,
        price=data.price,
        is_free=data.is_free,
        status="draft",
        personality_profile_id=personality.id if personality else None,
        tier_a_price=data.tier_a_price,
        tier_b_price=data.tier_b_price,
        course_type=data.course_type,
        pace_unit_description=data.pace_unit_description,
        curriculum_target_audience=data.curriculum_target_audience,
        curriculum_topics=data.curriculum_topics,
        curriculum_style=data.curriculum_style,
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return _serialize_course_detail(db, course, current_user)


@router.put("/courses/{course_id}")
def update_course(course_id: int, data: CourseUpdate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """コース更新。要(本人)。公開状態(published)への変更はこのエンドポイントでは行えない
    （/courses/{id}/submit-for-review → 運営の/admin/courses/{id}/approve を経由する）"""
    course = _get_owned_course(db, course_id, current_user)

    updates = data.model_dump(exclude_none=True)
    for key, val in updates.items():
        setattr(course, key, val)
    if course.is_free:
        course.price = 0
        course.tier_a_price = None
        course.tier_b_price = None
    elif course.price < 100 and course.tier_a_price is None and course.tier_b_price is None:
        raise HTTPException(status_code=400, detail="有料コースの価格は100円以上を指定してください")

    db.commit()
    db.refresh(course)
    return _serialize_course_detail(db, course, current_user)


def _quality_level(score: int, max_score: int) -> str:
    ratio = score / max_score if max_score else 0
    if ratio >= 0.8:
        return "good"
    if ratio >= 0.5:
        return "warning"
    return "critical"


@router.get("/courses/{course_id}/quality-check")
def get_course_quality_check(course_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """コース公開前のセルフチェック。要(本人)。自由進行型は章/カード構造、
    ペース管理型は30日カレンダー(CourseDay)の充実度を確認する。"""
    course = _get_owned_course(db, course_id, current_user)
    items = []

    if course.course_type == "pace_based":
        day_count = len(course.days)
        day_score = 25 if day_count >= 30 else (12 if day_count > 0 else 0)
        items.append({"key": "day_count", "label": "30日カレンダー", "score": day_score, "max": 25,
                      "level": _quality_level(day_score, 25),
                      "feedback": f"{day_count}日分のコンテンツがあります。" if day_count > 0 else "教材登録後、30日カレンダーを生成してください。"})

        theme_count = sum(1 for d in course.days if d.theme)
        theme_score = 25 if theme_count >= 25 else (12 if theme_count > 0 else 0)
        items.append({"key": "day_theme", "label": "各日のテーマ設定", "score": theme_score, "max": 25,
                      "level": _quality_level(theme_score, 25),
                      "feedback": f"{theme_count}日にテーマが設定されています。" if theme_count > 0 else "各日にテーマを設定しましょう。"})

        checklist_count = sum(1 for d in course.days if not d.is_rest_day and d.checklist_items)
        checklist_score = 25 if checklist_count >= 25 else (12 if checklist_count > 0 else 0)
        items.append({"key": "day_checklist", "label": "日次タスク", "score": checklist_score, "max": 25,
                      "level": _quality_level(checklist_score, 25),
                      "feedback": f"{checklist_count}日にタスクが設定されています。" if checklist_count > 0 else "各日にタスクを設定しましょう。"})
    else:
        chapters = course.chapters

        # 1. 章数チェック
        ch_count = len(chapters)
        ch_score = 25 if ch_count >= 3 else (12 if ch_count >= 1 else 0)
        items.append({"key": "chapter_count", "label": "章の構成", "score": ch_score, "max": 25,
                      "level": _quality_level(ch_score, 25),
                      "feedback": f"章が{ch_count}つあります。3章以上が推奨です。" if ch_count > 0 else "章を1つ以上追加してください。"})

        # 2. カード数チェック
        card_count = sum(len(ch.cards) for ch in chapters)
        card_score = 25 if card_count >= 5 else (12 if card_count >= 1 else 0)
        items.append({"key": "card_count", "label": "カード数", "score": card_score, "max": 25,
                      "level": _quality_level(card_score, 25),
                      "feedback": f"カードが{card_count}枚あります。" if card_count >= 5 else "各章に複数のカードを追加しましょう。"})

        # 3. 動画カード有無
        video_count = sum(1 for ch in chapters for c in ch.cards if c.card_type == "video")
        vid_score = 25 if video_count > 0 else 0
        items.append({"key": "video_content", "label": "動画コンテンツ", "score": vid_score, "max": 25,
                      "level": _quality_level(vid_score, 25),
                      "feedback": f"動画カードが{video_count}枚あります。" if video_count > 0 else "動画カードを1枚以上追加しましょう。"})

    # サムネイル・説明文
    meta_score = 25 if course.thumbnail_url and course.description else (12 if course.description or course.thumbnail_url else 0)
    items.append({"key": "metadata", "label": "コース情報の充実度", "score": meta_score, "max": 25,
                  "level": _quality_level(meta_score, 25),
                  "feedback": "サムネイルと説明文が設定されています。" if meta_score == 25 else "サムネイルと説明文を設定しましょう。"})

    total_score = sum(item["score"] for item in items)
    return {"score": total_score, "max_score": 100, "recommendation": "publish" if total_score >= 70 else "review", "items": items}


@router.post("/courses/{course_id}/submit-for-review")
def submit_course_for_review(course_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """コースの公開申請を行う(draft→review)。運営の承認後に公開される。要(本人)"""
    course = _get_owned_course(db, course_id, current_user)
    if course.status != "draft":
        raise HTTPException(status_code=400, detail="公開申請できるのはdraft状態のコースのみです")

    if course.course_type == "pace_based":
        if len(course.days) == 0:
            raise HTTPException(status_code=400, detail="先に30日カレンダーを生成してから公開申請してください")
    else:
        chapter_count = len(course.chapters)
        if chapter_count == 0:
            raise HTTPException(status_code=400, detail="章（カリキュラム）を1つ以上追加してから公開申請してください")
        if any(len(ch.cards) == 0 for ch in course.chapters):
            raise HTTPException(status_code=400, detail="カードが1枚もない章があります。すべての章にカードを追加してください")
        if not course.completion_video_url:
            raise HTTPException(status_code=400, detail="卒業動画を設定してから公開申請してください")

    if current_user.role != "admin":
        profile = db.query(CreatorProfile).filter(CreatorProfile.user_id == current_user.id).first()
        if not profile or profile.status != "active":
            raise HTTPException(status_code=403, detail="クリエイター申請が承認されるまでコースを公開申請できません")
    course.status = "review"
    db.commit()
    db.refresh(course)
    return _serialize_course_detail(db, course, current_user)


@router.post("/courses/{course_id}/thumbnail")
async def upload_course_thumbnail(
    course_id: int,
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """コースのサムネイル画像をアップロードする（PNG/JPG/WEBP, 5MBまで）"""
    course = _get_owned_course(db, course_id, current_user)

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _ALLOWED_THUMBNAIL_EXT:
        raise HTTPException(status_code=400, detail="対応形式は PNG / JPG / JPEG / WEBP のみです")

    contents = await file.read()
    if len(contents) > _MAX_THUMBNAIL_SIZE:
        raise HTTPException(status_code=400, detail="画像サイズは5MB以下にしてください")
    validate_image_content(contents, ext)

    if course.thumbnail_url:
        old_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static", course.thumbnail_url.replace("/static/", "", 1))
        if os.path.isfile(old_path):
            try:
                os.remove(old_path)
            except OSError:
                pass

    filename = f"course_{course_id}_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(_THUMBNAIL_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(contents)

    course.thumbnail_url = f"/static/course_thumbnails/{filename}"
    db.commit()
    db.refresh(course)
    return {"message": "サムネイルをアップロードしました", "thumbnail_url": course.thumbnail_url}


# ----- 参考資料 -----

@router.get("/courses/{course_id}/materials")
def list_course_materials(course_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """参考資料一覧。要(購入済み学習者または本人)"""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="コースが見つかりません")
    if current_user.role != "admin":
        profile = db.query(CreatorProfile).filter(CreatorProfile.user_id == current_user.id).first()
        is_owner = bool(profile and course.character.creator_id == profile.id)
        if not is_owner and not _is_accessible(db, course, current_user.id):
            raise HTTPException(status_code=403, detail="このコースを購入していません")
    return [
        {"id": m.id, "type": m.type, "title": m.title, "file_url": m.file_url}
        for m in course.materials
    ]


@router.post("/courses/{course_id}/materials", status_code=status.HTTP_201_CREATED)
def add_course_material(course_id: int, data: CourseMaterialCreate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """参考資料追加。要(本人)"""
    course = _get_owned_course(db, course_id, current_user)
    material = CourseMaterial(course_id=course.id, type=data.type, title=data.title, file_url=data.file_url)
    db.add(material)
    db.commit()
    db.refresh(material)
    return {"id": material.id, "type": material.type, "title": material.title, "file_url": material.file_url}


@router.delete("/materials/{material_id}")
def delete_course_material(material_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """参考資料削除。要(本人)"""
    material = db.query(CourseMaterial).filter(CourseMaterial.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="参考資料が見つかりません")
    _get_owned_course(db, material.course_id, current_user)
    db.delete(material)
    db.commit()
    return {"message": "削除しました"}


# ----- ペース管理型コース：30日カレンダー(Layer1)自動生成・日単位編集 -----

def _serialize_course_day(day: CourseDay) -> dict:
    return {
        "id": day.id,
        "day": day.day_number,
        "week_number": day.week_number,
        "theme": day.theme,
        "checklist_items": day.checklist_items,
        "is_rest_day": day.is_rest_day,
        "is_edited_by_creator": day.is_edited_by_creator,
    }


@router.get("/courses/{course_id}/days")
def list_course_days(course_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """30日分のコース骨格(Layer1)一覧（カレンダービュー用）。要(本人または購入済み学習者)"""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="コースが見つかりません")
    if current_user.role != "admin":
        profile = db.query(CreatorProfile).filter(CreatorProfile.user_id == current_user.id).first()
        is_owner = bool(profile and course.character.creator_id == profile.id)
        if not is_owner and not _is_accessible(db, course, current_user.id):
            raise HTTPException(status_code=403, detail="このコースの日次コンテンツを閲覧する権限がありません")
    days = sorted(course.days, key=lambda d: d.day_number)
    return [_serialize_course_day(d) for d in days]


class CourseDayUpdate(BaseModel):
    theme: Optional[str] = None
    checklist_items: Optional[List[dict]] = None
    is_rest_day: Optional[bool] = None


@router.put("/courses/{course_id}/days/{day_number}")
def update_course_day(course_id: int, day_number: int, data: CourseDayUpdate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """特定日の内容を更新（クリエイターによる日単位編集）。まだ存在しない日は新規作成する。要(本人)"""
    course = _get_owned_course(db, course_id, current_user)
    if not (1 <= day_number <= 30):
        raise HTTPException(status_code=400, detail="dayは1〜30で指定してください")
    day = db.query(CourseDay).filter(CourseDay.course_id == course.id, CourseDay.day_number == day_number).first()
    if not day:
        day = CourseDay(course_id=course.id, day_number=day_number, week_number=(day_number - 1) // 7 + 1)
        db.add(day)

    for key, val in data.model_dump(exclude_none=True).items():
        setattr(day, key, val)
    day.is_edited_by_creator = True

    db.commit()
    db.refresh(day)
    return _serialize_course_day(day)


# ----- 30日カレンダー相談AIチャット -----

def _build_existing_days_text(course: Course) -> str:
    days = sorted(course.days, key=lambda d: d.day_number)
    if not days:
        return "（まだ何も設定されていません。空の30日カレンダーです）"
    lines = []
    for d in days:
        if d.is_rest_day:
            lines.append(f"Day{d.day_number}: 休息日")
        elif d.theme or d.checklist_items:
            items_text = "、".join(i.get("text", "") for i in (d.checklist_items or []))
            lines.append(f"Day{d.day_number}: {d.theme or ''}（{items_text or 'タスク未設定'}）")
        else:
            lines.append(f"Day{d.day_number}: 未設定")
    return "\n".join(lines)


class CalendarChatRequest(BaseModel):
    message: str
    history: List[dict] = []


@router.post("/courses/{course_id}/calendar-chat")
def calendar_chat(course_id: int, data: CalendarChatRequest, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """30日カレンダーの内容をAIと相談しながら組み立てる。メッセージ送信ごとにクリエイターの
    ai_chat_balanceを1消費する（提案のみでカレンダーへの反映は/calendar-chat/applyで行う）。要(本人)"""
    course = _get_owned_course(db, course_id, current_user)
    if course.course_type != "pace_based":
        raise HTTPException(status_code=400, detail="ペース管理型コースのみ利用できます")
    if not data.message.strip():
        raise HTTPException(status_code=400, detail="メッセージを入力してください")

    profile = db.query(CreatorProfile).filter(CreatorProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=403, detail="クリエイタープロフィールが見つかりません")

    from app.core.creator_balance import try_consume_ai_balance, get_ai_balance
    from app.core.llm import generate_text, LLMError, extract_json

    if get_ai_balance(db, profile.id) <= 0:
        raise HTTPException(status_code=402, detail="AIチャットの残高がありません。外部のAIツールをご利用ください。")

    system = gen_prompts.build_calendar_chat_system(
        course.title, course.curriculum_purpose, course.curriculum_target_audience,
        course.curriculum_topics, course.curriculum_style, course.pace_unit_description,
        _build_existing_days_text(course),
    )
    messages = list(data.history) + [{"role": "user", "content": data.message}]

    try:
        raw = generate_text(system, messages, max_tokens=2000, json_mode=True)
        result = extract_json(raw)
    except (LLMError, ValueError) as e:
        raise HTTPException(status_code=502, detail=f"AI応答の解析に失敗しました: {e}")

    if not try_consume_ai_balance(db, profile.id):
        raise HTTPException(status_code=402, detail="AIチャットの残高がありません。外部のAIツールをご利用ください。")

    return {
        "ai_message": result.get("ai_message", ""),
        "day_changes": result.get("day_changes", []),
        "remaining_balance": get_ai_balance(db, profile.id),
    }


class DayChangeItem(BaseModel):
    day: int
    theme: Optional[str] = None
    checklist_items: Optional[List[dict]] = None
    is_rest_day: Optional[bool] = None


class CalendarChatApplyRequest(BaseModel):
    day_changes: List[DayChangeItem]


@router.post("/courses/{course_id}/calendar-chat/apply")
def apply_calendar_chat_changes(course_id: int, data: CalendarChatApplyRequest, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """AIチャットが提案したday_changesをカレンダーに反映する（存在しない日は新規作成）。要(本人)"""
    course = _get_owned_course(db, course_id, current_user)
    existing_days = {d.day_number: d for d in course.days}

    for change in data.day_changes:
        if not (1 <= change.day <= 30):
            continue
        day = existing_days.get(change.day)
        if not day:
            day = CourseDay(course_id=course.id, day_number=change.day, week_number=(change.day - 1) // 7 + 1)
            db.add(day)
            existing_days[change.day] = day
        if change.theme is not None:
            day.theme = change.theme
        if change.checklist_items is not None:
            day.checklist_items = change.checklist_items
        if change.is_rest_day is not None:
            day.is_rest_day = change.is_rest_day
        day.is_edited_by_creator = True

    db.commit()
    days = sorted(course.days, key=lambda d: d.day_number)
    return [_serialize_course_day(d) for d in days]


# ----- ペース管理型コース：学習者の日次学習ログ -----

def _pace_course_start_date(db: Session, user_id: int, course_id: int):
    """ペース管理型コースの学習開始日時（購入または契約開始のうち最も古いもの）を返す。
    カレンダー進行のゲート（勝手に翌日以降へ進めないようにする）の起点として使う。"""
    purchase = db.query(Purchase).filter(
        Purchase.user_id == user_id, Purchase.course_id == course_id, Purchase.status == "succeeded",
    ).order_by(Purchase.purchased_at).first()
    subscription = db.query(CourseSubscription).filter(
        CourseSubscription.user_id == user_id, CourseSubscription.course_id == course_id,
        CourseSubscription.status.in_(["active", "past_due", "incomplete"]),
    ).order_by(CourseSubscription.created_at).first()
    candidates = [d for d in (
        purchase.purchased_at if purchase else None,
        subscription.created_at if subscription else None,
    ) if d]
    return min(candidates) if candidates else None


def _max_allowed_day_number(db: Session, user_id: int, course_id: int) -> int:
    """今日時点で報告してよい最大のDay番号（実際の経過日数+1、30でキャップ）を返す。
    自己申告のcompleted_countだけに頼ると、購入直後に何日分もまとめて「完了」報告できてしまうため、
    実際のカレンダー経過日数でも上限をかける（30日伴走コースが1日で終わってしまうのを防ぐ）。"""
    from datetime import datetime, timezone
    start = _pace_course_start_date(db, user_id, course_id)
    if not start:
        return 30
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    elapsed_days = (datetime.now(timezone.utc) - start).days
    return min(30, elapsed_days + 1)


@router.get("/courses/{course_id}/day-logs")
def list_day_logs(course_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """自分の日次学習ログ一覧・今日時点で報告してよい最大Day番号・インタラクション利用期限の状態。要(購入済み学習者)"""
    course = db.query(Course).filter(Course.id == course_id).first()
    logs = db.query(DayLog).filter(DayLog.user_id == current_user.id, DayLog.course_id == course_id).all()
    return {
        "logs": [
            {"day_number": l.day_number, "is_completed": l.is_completed, "completed_at": l.completed_at, "memo": l.memo,
             "completed_item_indices": l.completed_item_indices}
            for l in logs
        ],
        "max_allowed_day": _max_allowed_day_number(db, current_user.id, course_id),
        "interaction_expired": is_interaction_expired(db, current_user.id, course_id, course) if course else False,
    }


class DayLogComplete(BaseModel):
    memo: Optional[str] = None
    completed_item_indices: Optional[List[int]] = None


@router.put("/courses/{course_id}/day-logs/{day_number}/complete")
def complete_day_log(course_id: int, day_number: int, data: DayLogComplete, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """指定日を完了として記録する（学習者本人）。要(購入済み学習者)。
    30日伴走コースは1日1日ペースで進むコースのため、実際のカレンダー経過日数を超えた
    先の日を勝手に完了報告することはできない（過去の未報告日を後から埋めることは許可する）。"""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="コースが見つかりません")
    if not _is_accessible(db, course, current_user.id):
        raise HTTPException(status_code=403, detail="このコースを購入していません")
    if is_interaction_expired(db, current_user.id, course_id, course):
        raise HTTPException(status_code=403, detail="このコースは30日間のプログラムが終了したため、日次記録は利用できません。")

    max_allowed_day = _max_allowed_day_number(db, current_user.id, course_id)
    if day_number > max_allowed_day:
        raise HTTPException(
            status_code=400,
            detail=f"Day {day_number}はまだ報告できません。現在報告できるのはDay {max_allowed_day}までです。",
        )

    from datetime import datetime, timezone
    log = db.query(DayLog).filter(
        DayLog.user_id == current_user.id, DayLog.course_id == course_id, DayLog.day_number == day_number,
    ).first()
    if not log:
        log = DayLog(user_id=current_user.id, course_id=course_id, day_number=day_number)
        db.add(log)
    log.is_completed = True
    log.completed_at = datetime.now(timezone.utc)
    if data.memo is not None:
        log.memo = data.memo
    if data.completed_item_indices is not None:
        log.completed_item_indices = data.completed_item_indices
    db.commit()
    db.refresh(log)
    return {"day_number": log.day_number, "is_completed": log.is_completed, "completed_at": log.completed_at, "memo": log.memo}


# ----- 学習進捗 -----

@router.get("/courses/me/purchased")
def list_my_purchased_courses(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """ログインユーザーが購入済み(買い切り)またはサブスク契約中の全コースを、進捗とともに返す(マイページの学習中コース一覧用)"""
    purchased_courses = {p.course for p in db.query(Purchase).filter(
        Purchase.user_id == current_user.id, Purchase.status == "succeeded"
    ).all()}
    subscribed_courses = {s.course for s in db.query(CourseSubscription).filter(
        CourseSubscription.user_id == current_user.id,
        CourseSubscription.status == "active",
    ).all()}
    courses = purchased_courses | subscribed_courses

    results = []
    for course in courses:
        card_ids = [c.id for ch in course.chapters for c in ch.cards]
        total = len(card_ids)
        completed_count = db.query(CardProgress).filter(
            CardProgress.user_id == current_user.id,
            CardProgress.card_id.in_(card_ids),
            CardProgress.is_completed == True,
        ).count() if card_ids else 0
        results.append({
            "course_id": course.id,
            "title": course.title,
            "total_lessons": total,
            "completed_count": completed_count,
            "is_day_based": course.course_type == "pace_based",
            "subject": course.subject,
            "thumbnail_url": course.thumbnail_url,
            "character": (
                {"name": course.character.name, "avatar_url": course.character.image_url}
                if course.character else None
            ),
        })
    return results
