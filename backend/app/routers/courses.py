from typing import Optional, List
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, model_validator

from app.core.database import get_db
from app.core.security import get_current_user, get_current_user_optional
from app.models.course import Course
from app.models.lesson import Lesson
from app.models.character import Character
from app.models.creator_profile import CreatorProfile
from app.models.purchase import Purchase
from app.models.favorite import Favorite
from app.models.notification import Notification
from app.models.lesson_progress import LessonProgress
from app.models.course_day import CourseDay
from app.models.course_material import CourseMaterial
from app.models.personality_profile import PersonalityProfile
from app.models.day_log import DayLog
from app.models.course_subscription import CourseSubscription
from app.core.llm import generate_text, LLMError
from app.core import course_generation_prompts as gen_prompts

router = APIRouter(tags=["コース・レッスン"])


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
    """管理者がコースを停止（G-02）した場合、購入済み・無料コースでも利用不可にする。"""
    if course.is_suspended:
        return False
    return course.is_free or _is_purchased(db, user_id, course.id)


# ----- シリアライズ -----

def _serialize_character_brief(character: Character) -> dict:
    return {"id": character.id, "name": character.name, "avatar_url": character.image_url, "creator_id": character.creator_id}


def _serialize_lesson(lesson: Lesson, unlocked: bool) -> dict:
    visible = unlocked or lesson.is_preview
    return {
        "id": lesson.id,
        "order": lesson.order,
        "title": lesson.title,
        "content_type": lesson.content_type,
        "is_preview": lesson.is_preview,
        "body": lesson.body if visible else None,
        "youtube_url": lesson.youtube_url if visible else None,
    }


def _serialize_course_card(course: Course) -> dict:
    return {
        "id": course.id,
        "title": course.title,
        "description": course.description,
        "thumbnail_url": course.thumbnail_url,
        "category": course.category,
        "status": course.status,
        "price": course.price,
        "is_free": course.is_free,
        "goal": course.goal,
        "target_learner": course.target_learner,
        "intensity": course.intensity,
        "tier_a_price": course.tier_a_price,
        "tier_b_price": course.tier_b_price,
        "is_suspended": course.is_suspended,
        "suspension_reason": course.suspension_reason,
        "character": _serialize_character_brief(course.character),
    }


def _serialize_course_day(day: CourseDay) -> dict:
    return {
        "id": day.id,
        "day": day.day_number,
        "week_number": day.week_number,
        "theme": day.theme,
        "task_types": day.task_types,
        "is_rest_day": day.is_rest_day,
        "is_edited_by_creator": day.is_edited_by_creator,
    }


def _serialize_course_detail(db: Session, course: Course, current_user) -> dict:
    user_id = current_user.id if current_user else None
    unlocked = _is_accessible(db, course, user_id)
    lessons = sorted(course.lessons, key=lambda l: l.order)
    data = _serialize_course_card(course)
    data["lessons"] = [_serialize_lesson(l, unlocked) for l in lessons]
    data["is_purchased"] = unlocked
    data["has_days"] = len(course.days) > 0
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
    return data


# ----- リクエストスキーマ -----

class CourseCreate(BaseModel):
    # 通常のクリエイターは自分の人格(キャラクター)に自動で紐づくため指定不要。管理者が代理作成する場合のみ使用
    creator_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    category: Optional[str] = None
    price: int = 0
    is_free: bool = False
    goal: Optional[str] = None
    target_learner: Optional[str] = None
    intensity: Optional[str] = None
    tier_a_price: Optional[int] = None
    tier_b_price: Optional[int] = None

    @model_validator(mode="after")
    def _validate_price(self):
        if not self.is_free and self.price < 100 and self.tier_a_price is None and self.tier_b_price is None:
            raise ValueError("有料コースの価格は100円以上を指定してください")
        if self.is_free:
            self.price = 0
        if self.tier_a_price is not None and not (980 <= self.tier_a_price <= 1980):
            raise ValueError("Tier Aの価格は980〜1980円/月で指定してください")
        if self.tier_b_price is not None and not (2980 <= self.tier_b_price <= 5000):
            raise ValueError("Tier Bの価格は2980〜5000円/月で指定してください")
        return self


class CourseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    category: Optional[str] = None
    price: Optional[int] = None
    is_free: Optional[bool] = None
    status: Optional[str] = None
    goal: Optional[str] = None
    target_learner: Optional[str] = None
    intensity: Optional[str] = None
    tier_a_price: Optional[int] = None
    tier_b_price: Optional[int] = None

    @model_validator(mode="after")
    def _validate_status(self):
        # 'review'(公開審査中)・'published'(公開)への変更は専用エンドポイント
        # (/courses/{id}/submit-for-review, /admin/courses/{id}/approve)経由のみ許可する
        if self.status is not None and self.status not in ("draft", "unpublished"):
            raise ValueError("status は 'draft' / 'unpublished' のいずれかを指定してください（公開には運営の承認が必要です）")
        if self.tier_a_price is not None and not (980 <= self.tier_a_price <= 1980):
            raise ValueError("Tier Aの価格は980〜1980円/月で指定してください")
        if self.tier_b_price is not None and not (2980 <= self.tier_b_price <= 5000):
            raise ValueError("Tier Bの価格は2980〜5000円/月で指定してください")
        return self


class CourseDayUpdate(BaseModel):
    theme: Optional[str] = None
    task_types: Optional[List[dict]] = None
    is_rest_day: Optional[bool] = None


class CourseMaterialCreate(BaseModel):
    type: str  # pdf / url
    title: str
    file_url: str

    @model_validator(mode="after")
    def _validate_type(self):
        if self.type not in ("pdf", "url"):
            raise ValueError("type は 'pdf' または 'url' を指定してください")
        return self


def _to_embed_url(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    if value == "" or value.startswith("https://www.youtube.com/embed/"):
        return value or None
    raise ValueError("youtube_url は https://www.youtube.com/embed/ 形式で指定してください")


class LessonCreate(BaseModel):
    title: str
    content_type: str  # text / video
    body: Optional[str] = None
    youtube_url: Optional[str] = None
    is_preview: bool = False

    @model_validator(mode="after")
    def _validate(self):
        if self.content_type not in ("text", "video"):
            raise ValueError("content_type は 'text' または 'video' を指定してください")
        if self.content_type == "video":
            self.youtube_url = _to_embed_url(self.youtube_url)
            if not self.youtube_url:
                raise ValueError("動画レッスンには youtube_url の指定が必須です")
        return self


class LessonUpdate(BaseModel):
    title: Optional[str] = None
    content_type: Optional[str] = None
    body: Optional[str] = None
    youtube_url: Optional[str] = None
    is_preview: Optional[bool] = None

    @model_validator(mode="after")
    def _validate(self):
        if self.content_type is not None and self.content_type not in ("text", "video"):
            raise ValueError("content_type は 'text' または 'video' を指定してください")
        if self.youtube_url is not None:
            self.youtube_url = _to_embed_url(self.youtube_url)
        return self


class ReorderRequest(BaseModel):
    lesson_ids: List[int]


# ----- コースAPI -----

@router.get("/courses")
def list_courses(category: Optional[str] = None, db: Session = Depends(get_db)):
    """コース一覧(新着・カテゴリフィルタ)。公開済みかつ停止されていないものだけ返す"""
    query = db.query(Course).filter(Course.status == "published", Course.is_suspended == False)  # noqa: E712
    if category:
        query = query.filter(Course.category == category)
    courses = query.order_by(Course.created_at.desc()).all()
    return [_serialize_course_card(c) for c in courses]


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
        category=data.category,
        price=data.price,
        is_free=data.is_free,
        status="draft",
        goal=data.goal,
        target_learner=data.target_learner,
        intensity=data.intensity,
        personality_profile_id=personality.id if personality else None,
        tier_a_price=data.tier_a_price,
        tier_b_price=data.tier_b_price,
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
    elif course.price < 100:
        raise HTTPException(status_code=400, detail="有料コースの価格は100円以上を指定してください")

    db.commit()
    db.refresh(course)
    return _serialize_course_detail(db, course, current_user)


@router.post("/courses/{course_id}/submit-for-review")
def submit_course_for_review(course_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """コースの公開申請を行う(draft→review)。運営の承認後に公開される。要(本人)"""
    course = _get_owned_course(db, course_id, current_user)
    if course.status != "draft":
        raise HTTPException(status_code=400, detail="公開申請できるのはdraft状態のコースのみです")
    if len(course.lessons) == 0 and len(course.days) == 0:
        raise HTTPException(status_code=400, detail="レッスンまたは30日分のコンテンツが1件以上ないと公開申請できません")
    if current_user.role != "admin":
        profile = db.query(CreatorProfile).filter(CreatorProfile.user_id == current_user.id).first()
        if not profile or profile.status != "active":
            raise HTTPException(status_code=403, detail="クリエイター申請が承認されるまでコースを公開申請できません")
    course.status = "review"
    db.commit()
    db.refresh(course)
    return _serialize_course_detail(db, course, current_user)


# ----- レッスンAPI -----

@router.post("/courses/{course_id}/lessons", status_code=status.HTTP_201_CREATED)
def add_lesson(course_id: int, data: LessonCreate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """レッスン追加。要(クリエイター・本人)"""
    course = _get_owned_course(db, course_id, current_user)
    max_order = max((l.order for l in course.lessons), default=0)
    lesson = Lesson(
        course_id=course.id,
        order=max_order + 1,
        title=data.title,
        content_type=data.content_type,
        body=data.body,
        youtube_url=data.youtube_url,
        is_preview=data.is_preview,
    )
    db.add(lesson)
    db.commit()
    db.refresh(lesson)
    return _serialize_lesson(lesson, unlocked=True)


@router.put("/lessons/{lesson_id}")
def update_lesson(lesson_id: int, data: LessonUpdate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """レッスン更新。要(本人)"""
    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="レッスンが見つかりません")
    _get_owned_course(db, lesson.course_id, current_user)

    for key, val in data.model_dump(exclude_none=True).items():
        setattr(lesson, key, val)

    db.commit()
    db.refresh(lesson)
    return _serialize_lesson(lesson, unlocked=True)


@router.delete("/lessons/{lesson_id}")
def delete_lesson(lesson_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """レッスン削除。要(本人)"""
    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="レッスンが見つかりません")
    _get_owned_course(db, lesson.course_id, current_user)

    db.delete(lesson)
    db.commit()
    return {"message": "削除しました"}


@router.put("/courses/{course_id}/lessons/reorder")
def reorder_lessons(course_id: int, data: ReorderRequest, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """レッスン並び順変更。要(本人)。lesson_idsに含まれるIDが全てそのコースに属するものか検証する"""
    course = _get_owned_course(db, course_id, current_user)
    existing_ids = {l.id for l in course.lessons}
    if set(data.lesson_ids) != existing_ids:
        raise HTTPException(status_code=400, detail="lesson_idsはこのコースの全レッスンと一致させてください")

    lessons_by_id = {l.id: l for l in course.lessons}
    for index, lesson_id in enumerate(data.lesson_ids, start=1):
        lessons_by_id[lesson_id].order = index

    db.commit()
    lessons = sorted(course.lessons, key=lambda l: l.order)
    return {"lessons": [{"id": l.id, "order": l.order, "title": l.title} for l in lessons]}


# ----- 30日伴走コース：Layer1骨格自動生成・日単位編集 -----

def _run_course_days_generation(course_id: int):
    """Layer1（概念コース骨格）の生成本体。1回のAI呼び出しで30日分をまとめて生成する（目安15秒）。
    requestのDBセッションが閉じた後も動くようバックグラウンドタスクとして実行し、自前でSessionLocal()を開く。"""
    from app.core.database import SessionLocal

    db = SessionLocal()
    try:
        course = db.query(Course).filter(Course.id == course_id).first()
        if not course:
            return
        personality = db.query(PersonalityProfile).filter(PersonalityProfile.id == course.personality_profile_id).first()

        try:
            text = generate_text(
                gen_prompts.COURSE_DAY_GENERATION_SYSTEM,
                gen_prompts.build_course_day_generation_messages(
                    personality.profile, course.title, course.goal, course.target_learner, course.intensity,
                ),
                max_tokens=4000,
            )
            days_data = gen_prompts.extract_json_array(text)
            if len(days_data) != 30:
                raise LLMError(f"30日分のはずが{len(days_data)}日分でした")
        except LLMError as e:
            course.days_generation_status = "failed"
            course.days_generation_error = f"コース骨格の生成に失敗しました: {e}"
            db.commit()
            return

        for day_data in days_data:
            day_number = day_data.get("day")
            db.add(CourseDay(
                course_id=course.id,
                day_number=day_number,
                week_number=day_data.get("week") or ((day_number - 1) // 7 + 1),
                theme=day_data.get("theme"),
                task_types=day_data.get("task_types"),
                is_rest_day=bool(day_data.get("is_rest_day", False)),
            ))
        course.days_generation_status = "completed"
        db.commit()
    finally:
        db.close()


@router.post("/courses/{course_id}/generate-days", status_code=status.HTTP_202_ACCEPTED)
def generate_course_days(course_id: int, background_tasks: BackgroundTasks, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """人格プロファイル＋コース基本情報をもとに30日分のコース骨格(Layer1)をAI生成する。要(本人)。
    1回のAI呼び出しで完結するため目安15秒。バックグラウンドで実行し即座に202を返す。
    進行状況は GET /courses/{course_id}/generation-status をポーリングして確認する。"""
    course = _get_owned_course(db, course_id, current_user)
    if course.days_generation_status == "generating":
        raise HTTPException(status_code=409, detail="すでに生成処理が進行中です")
    if not course.personality_profile_id:
        raise HTTPException(status_code=400, detail="先にクリエイターの人格プロファイルを生成・設定してください")
    if not (course.goal and course.target_learner and course.intensity):
        raise HTTPException(status_code=400, detail="コースのゴール・対象者・学習強度を入力してください")

    personality = db.query(PersonalityProfile).filter(PersonalityProfile.id == course.personality_profile_id).first()
    if not personality or not personality.profile:
        raise HTTPException(status_code=400, detail="人格プロファイルが見つかりません")

    db.query(CourseDay).filter(CourseDay.course_id == course.id).delete()
    course.days_generation_status = "generating"
    course.days_generation_error = None
    db.commit()

    background_tasks.add_task(_run_course_days_generation, course.id)
    return {"message": "生成を開始しました", "status": "generating"}


@router.get("/courses/{course_id}/generation-status")
def get_course_generation_status(course_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """コース骨格(Layer1)生成の進行状況をポーリングするためのエンドポイント。要(本人)"""
    course = _get_owned_course(db, course_id, current_user)
    day_count = db.query(CourseDay).filter(CourseDay.course_id == course.id).count()
    return {
        "status": course.days_generation_status,
        "error": course.days_generation_error,
        "days_done": day_count,
        "days_total": 30,
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


@router.put("/courses/{course_id}/days/{day_number}")
def update_course_day(course_id: int, day_number: int, data: CourseDayUpdate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """特定日の内容を更新（クリエイターによる日単位編集）。要(本人)"""
    course = _get_owned_course(db, course_id, current_user)
    day = db.query(CourseDay).filter(CourseDay.course_id == course.id, CourseDay.day_number == day_number).first()
    if not day:
        raise HTTPException(status_code=404, detail="指定された日のコンテンツが見つかりません")

    for key, val in data.model_dump(exclude_none=True).items():
        setattr(day, key, val)
    day.is_edited_by_creator = True

    db.commit()
    db.refresh(day)
    return _serialize_course_day(day)


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


# ----- 学習進捗(リテンション機能) -----

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
        if course.days:
            completed_count = db.query(DayLog).filter(
                DayLog.user_id == current_user.id,
                DayLog.course_id == course.id,
                DayLog.is_completed == True,
            ).count()
            total = len(course.days)
        else:
            lesson_ids = [l.id for l in course.lessons]
            completed_count = db.query(LessonProgress).filter(
                LessonProgress.user_id == current_user.id,
                LessonProgress.lesson_id.in_(lesson_ids),
                LessonProgress.is_completed == True,
            ).count() if lesson_ids else 0
            total = len(lesson_ids)
        results.append({
            "course_id": course.id,
            "title": course.title,
            "total_lessons": total,
            "completed_count": completed_count,
        })
    return results


@router.get("/courses/{course_id}/progress")
def get_course_progress(course_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """購入済みコースのレッスン別学習進捗を返す(R-05: どこまで読んだか記録)"""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="コースが見つかりません")
    if not _is_accessible(db, course, current_user.id):
        raise HTTPException(status_code=403, detail="このコースを購入していません")

    progress_by_lesson = {
        p.lesson_id: p
        for p in db.query(LessonProgress).filter(
            LessonProgress.user_id == current_user.id,
            LessonProgress.lesson_id.in_([l.id for l in course.lessons]),
        ).all()
    }
    lessons = sorted(course.lessons, key=lambda l: l.order)
    items = [
        {
            "lesson_id": l.id,
            "title": l.title,
            "is_completed": progress_by_lesson[l.id].is_completed if l.id in progress_by_lesson else False,
            "last_accessed_at": progress_by_lesson[l.id].last_accessed_at if l.id in progress_by_lesson else None,
        }
        for l in lessons
    ]
    completed_count = sum(1 for i in items if i["is_completed"])
    return {"course_id": course_id, "total_lessons": len(items), "completed_count": completed_count, "lessons": items}


@router.put("/lessons/{lesson_id}/complete")
def complete_lesson(lesson_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """レッスン完了フラグをONにする(R-05)"""
    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="レッスンが見つかりません")
    course = lesson.course
    if not _is_accessible(db, course, current_user.id):
        raise HTTPException(status_code=403, detail="このコースを購入していません")

    progress = db.query(LessonProgress).filter(
        LessonProgress.user_id == current_user.id, LessonProgress.lesson_id == lesson_id
    ).first()
    if not progress:
        progress = LessonProgress(user_id=current_user.id, lesson_id=lesson_id, is_completed=True)
        db.add(progress)
    else:
        progress.is_completed = True
    db.commit()
    return {"message": "レッスンを完了にしました"}


# ----- 30日伴走コース：日次学習ログ（Day1〜30の完了状況） -----

@router.get("/courses/{course_id}/day-logs")
def list_day_logs(course_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """学習者自身の日次学習ログ一覧を返す。要(購入済み学習者)"""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="コースが見つかりません")
    if not _is_accessible(db, course, current_user.id):
        raise HTTPException(status_code=403, detail="このコースを購入していません")

    logs = db.query(DayLog).filter(DayLog.user_id == current_user.id, DayLog.course_id == course_id).all()
    by_day = {l.day_number: l for l in logs}
    return [
        {
            "day_number": d,
            "is_completed": by_day[d].is_completed if d in by_day else False,
            "completed_at": by_day[d].completed_at if d in by_day else None,
            "memo": by_day[d].memo if d in by_day else None,
        }
        for d in range(1, 31)
    ]


class DayLogCompleteRequest(BaseModel):
    memo: Optional[str] = None


@router.put("/courses/{course_id}/day-logs/{day_number}/complete")
def complete_day_log(course_id: int, day_number: int, data: DayLogCompleteRequest, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """指定日の学習完了を記録する（学習者が「完了」と報告した時に呼ぶ）。要(購入済み学習者)"""
    from datetime import datetime, timezone

    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="コースが見つかりません")
    if not _is_accessible(db, course, current_user.id):
        raise HTTPException(status_code=403, detail="このコースを購入していません")
    if not (1 <= day_number <= 30):
        raise HTTPException(status_code=400, detail="day_numberは1〜30で指定してください")

    log = db.query(DayLog).filter(
        DayLog.user_id == current_user.id, DayLog.course_id == course_id, DayLog.day_number == day_number
    ).first()
    if not log:
        log = DayLog(user_id=current_user.id, course_id=course_id, day_number=day_number)
        db.add(log)
    log.is_completed = True
    log.completed_at = datetime.now(timezone.utc)
    if data.memo is not None:
        log.memo = data.memo
    db.commit()
    return {"day_number": day_number, "is_completed": True, "completed_at": log.completed_at, "memo": log.memo}
