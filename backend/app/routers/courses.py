import json
import re
from typing import Optional, List
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import func
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
from app.models.textbook import Textbook
from app.models.course_textbook import CourseTextbook
from app.models.textbook_day_assignment import TextbookDayAssignment
from app.models.course_diagnosis_question import CourseDiagnosisQuestion
from app.models.learner_profile import LearnerProfile
from app.models.learner_course_day import LearnerCourseDay
from app.core.llm import generate_text, LLMError
from app.core import course_generation_prompts as gen_prompts
from app.core import quality_check_prompts as qc_prompts

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
        "study_materials": course.study_materials,
        "pace": course.pace,
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
    data["has_diagnosis"] = (
        db.query(LearnerProfile).filter(
            LearnerProfile.user_id == user_id, LearnerProfile.course_id == course.id,
        ).first() is not None
        if user_id else False
    )
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
    study_materials: Optional[str] = None
    pace: Optional[str] = None
    tier_a_price: Optional[int] = None
    tier_b_price: Optional[int] = None

    @model_validator(mode="after")
    def _validate_price(self):
        if not self.is_free and self.price < 100 and self.tier_a_price is None and self.tier_b_price is None:
            raise ValueError("有料コースの価格は100円以上を指定してください")
        if self.is_free:
            self.price = 0
            self.tier_a_price = None  # 無料コースはTier Aを提供できない（Tier Bのみ対応可能）
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
    study_materials: Optional[str] = None
    pace: Optional[str] = None
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


@router.get("/stats/public")
def get_public_stats(db: Session = Depends(get_db)):
    """トップページの社会的証明セクション用。30日コースを完走した学習者の延べ人数(実数)。"""
    achievers_count = db.query(DayLog.user_id, DayLog.course_id).filter(
        DayLog.is_completed == True,  # noqa: E712
    ).group_by(DayLog.user_id, DayLog.course_id).having(func.count(DayLog.id) >= 30).count()
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
        study_materials=data.study_materials,
        pace=data.pace,
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
        course.tier_a_price = None  # 無料コースはTier Aを提供できない（Tier Bのみ対応可能）
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


def _check_goal_specificity(course: Course) -> dict:
    has_number = bool(re.search(r"\d", course.goal or ""))
    score = 20 if has_number else 0
    feedback = (
        "目標に具体的な数値が含まれています。"
        if has_number
        else "目標に具体的な数値目標を含めましょう（例：「TOEIC800点を取得する」）。"
    )
    return {"key": "goal_specificity", "label": "目標の具体性", "score": score, "max": 20, "level": _quality_level(score, 20), "feedback": feedback}


def _check_task_density(course: Course) -> dict:
    rest_days = sum(1 for d in course.days if d.is_rest_day)
    if rest_days <= 4:
        score = 20
        feedback = f"休息日は{rest_days}日で、適切なペースです。"
    else:
        score = max(0, 20 - (rest_days - 4) * 4)
        feedback = f"休息日が{rest_days}日あります。3〜4日程度に減らすと、学習者がより継続しやすくなります。"
    return {"key": "task_density", "label": "30日間のタスク密度", "score": score, "max": 20, "level": _quality_level(score, 20), "feedback": feedback}


def _check_textbook_coverage(db: Session, course: Course) -> dict:
    course_textbooks = db.query(CourseTextbook).filter(CourseTextbook.course_id == course.id).all()
    total = 0
    assigned = 0
    unassigned_examples = []
    for ct in course_textbooks:
        for a in ct.day_assignments:
            total += 1
            if a.day_number is not None:
                assigned += 1
            elif len(unassigned_examples) < 3:
                name = ct.textbook.name if ct.textbook else ct.custom_name
                unassigned_examples.append(f"「{name}」{a.toc_item}")
    if total == 0:
        return {"key": "textbook_coverage", "label": "教材マッピングの網羅性", "score": 0, "max": 20, "level": "critical", "feedback": "使用教材の章・項目が日程に割り当てられていません。"}
    score = round(20 * assigned / total)
    if assigned == total:
        feedback = "選択した教材のすべての章が30日間に割り振られています。"
    else:
        feedback = f"未割り当ての項目があります（例: {'、'.join(unassigned_examples)}）。全ての教材を活用しましょう。"
    return {"key": "textbook_coverage", "label": "教材マッピングの網羅性", "score": score, "max": 20, "level": _quality_level(score, 20), "feedback": feedback}


def _check_goal_intensity_fit(course: Course) -> dict:
    try:
        text = generate_text(
            qc_prompts.GOAL_FIT_SYSTEM,
            qc_prompts.build_goal_fit_messages(course.goal, course.target_learner, course.intensity, course.pace),
            max_tokens=300,
            json_mode=True,
        )
        result = qc_prompts.extract_goal_fit_result(text)
    except LLMError:
        result = {"score": 20, "feedback": "AIによる整合性判定に失敗したため、この項目は満点扱いとしています。"}
    return {"key": "goal_intensity_fit", "label": "目標と学習時間の整合性", "score": result["score"], "max": 20, "level": _quality_level(result["score"], 20), "feedback": result["feedback"]}


def _check_custom_questions(course: Course) -> dict:
    count = len(course.diagnosis_questions)
    score = 20 if count > 0 else 0
    if count > 0:
        examples = "、".join(f"「{q.question_text}」" for q in course.diagnosis_questions[:2])
        feedback = f"カスタム質問を{count}件設定しています。{examples}はパーソナライズに役立つ良い質問です。"
    else:
        feedback = "Day1診断のカスタム質問が未設定です。学習者の状況を把握する質問を1つ以上追加しましょう。"
    return {"key": "custom_questions", "label": "カスタム質問の設定", "score": score, "max": 20, "level": _quality_level(score, 20), "feedback": feedback}


@router.get("/courses/{course_id}/quality-check")
def get_course_quality_check(course_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """コース公開前のセルフチェック（評価ボタン）。5項目×20点で採点し、改善案を返す。要(本人)"""
    course = _get_owned_course(db, course_id, current_user)
    if len(course.days) == 0:
        raise HTTPException(status_code=400, detail="30日分のコンテンツが生成されてからチェックできます")

    items = [
        _check_goal_specificity(course),
        _check_task_density(course),
        _check_textbook_coverage(db, course),
        _check_goal_intensity_fit(course),
        _check_custom_questions(course),
    ]
    total_score = sum(item["score"] for item in items)
    return {
        "score": total_score,
        "max_score": 100,
        "recommendation": "publish" if total_score >= 70 else "review",
        "items": items,
    }


@router.post("/courses/{course_id}/submit-for-review")
def submit_course_for_review(course_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """コースの公開申請を行う(draft→review)。運営の承認後に公開される。要(本人)"""
    course = _get_owned_course(db, course_id, current_user)
    if course.status != "draft":
        raise HTTPException(status_code=400, detail="公開申請できるのはdraft状態のコースのみです")
    if len(course.lessons) == 0 and len(course.days) == 0:
        raise HTTPException(status_code=400, detail="レッスンまたは30日分のコンテンツが1件以上ないと公開申請できません")
    if len(course.days) > 0:
        textbook_count = db.query(CourseTextbook).filter(CourseTextbook.course_id == course_id).count()
        if textbook_count == 0:
            raise HTTPException(status_code=400, detail="30日コースには使用教材が1件以上必要です。教材設定画面で追加してください")
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

_SKILL_KEYWORDS = [
    ("listening", ["リスニング", "Listening", "聴解"]),
    ("grammar", ["文法", "Grammar", "Structure", "文構造"]),
    ("reading", ["リーディング", "Reading", "読解"]),
    ("shadowing", ["シャドーイング", "Shadowing"]),
]


def _infer_skill_type(ct: "CourseTextbook", name: str | None) -> str:
    """登録された教材の種別(vocabulary/textbook)と名称・対象範囲から、実際に対応するタスク種別を推測する。
    教材データはtype列がvocabulary/textbookの2値しか持たないため、生成AIに渡す許可リストを
    正確に絞るためのキーワードマッチング。一致しない場合は汎用演習として"practice"を返す。"""
    if ct.type == "vocabulary":
        return "vocabulary"
    haystack = " ".join(filter(None, [name, ct.textbook.target if ct.textbook else None]))
    for skill, keywords in _SKILL_KEYWORDS:
        if any(kw in haystack for kw in keywords):
            return skill
    return "practice"


def _build_day_textbook_plan(db: Session, course_id: int) -> tuple[dict[int, list[dict]], set[str]]:
    """course_textbooks + textbook_day_assignmentsから、day_number(1〜30)ごとの教材項目割り当てを組み立てる。
    day_numberがNULL（「やらない」）の項目は含めない。
    あわせて、登録されている教材から実際に対応可能なタスク種別の集合を返す
    （リスニング教材を登録していないのにlistningタスクが出力される、といった不整合を防ぐため）。"""
    course_textbooks = db.query(CourseTextbook).filter(CourseTextbook.course_id == course_id).all()
    plan: dict[int, list[dict]] = {}
    allowed_types: set[str] = set()
    for ct in course_textbooks:
        name = ct.textbook.name if ct.textbook else ct.custom_name
        allowed_types.add(_infer_skill_type(ct, name))
        for assignment in ct.day_assignments:
            if assignment.day_number is None:
                continue
            plan.setdefault(assignment.day_number, []).append({
                "textbook_name": name,
                "item": assignment.toc_item,
                "type": ct.type,
                "daily_words": ct.daily_words,
                "review_words": ct.review_words,
            })
    return plan, allowed_types


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
        day_textbook_plan, allowed_task_types = _build_day_textbook_plan(db, course.id)

        try:
            text = generate_text(
                gen_prompts.COURSE_DAY_GENERATION_SYSTEM,
                gen_prompts.build_course_day_generation_messages(
                    personality.profile, course.title, course.goal, course.target_learner, course.intensity,
                    course.study_materials, course.pace, day_textbook_plan, allowed_task_types,
                ),
                max_tokens=4000,
                json_mode=True,
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
            task_types = day_data.get("task_types") or []
            if allowed_task_types:
                # LLMが指示を無視して未登録の教材種別（例: リスニング教材未登録なのにlistening）を
                # 出力した場合に備え、登録済み教材に対応する種別だけに絞る
                task_types = [t for t in task_types if t.get("type") in allowed_task_types]
            db.add(CourseDay(
                course_id=course.id,
                day_number=day_number,
                week_number=day_data.get("week") or ((day_number - 1) // 7 + 1),
                theme=day_data.get("theme"),
                task_types=task_types,
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
    if not (course.study_materials and course.pace):
        raise HTTPException(status_code=400, detail="使用する教材と進行速度を入力してください")

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


# ----- 教材ベースのコース作成（議論サマリー20260626 1節・10節） -----

@router.get("/textbooks")
def search_textbooks(query: Optional[str] = None, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """プリセット教材を書籍名で検索する。要(ログイン済み)"""
    q = db.query(Textbook).filter(Textbook.is_preset == True)
    if query:
        q = q.filter(Textbook.name.ilike(f"%{query}%"))
    return [
        {"id": t.id, "name": t.name, "publisher": t.publisher, "type": t.type, "target": t.target, "toc": t.toc}
        for t in q.all()
    ]


def _serialize_course_textbook(ct: CourseTextbook) -> dict:
    toc = ct.textbook.toc if ct.textbook else ct.custom_toc
    assignments_by_item = {a.toc_item: a.day_number for a in ct.day_assignments}
    return {
        "id": ct.id,
        "course_id": ct.course_id,
        "textbook_id": ct.textbook_id,
        "name": ct.textbook.name if ct.textbook else ct.custom_name,
        "type": ct.type,
        "daily_words": ct.daily_words,
        "review_words": ct.review_words,
        "target_laps": ct.target_laps,
        "day_assignments": [
            {"toc_item": item.get("item"), "day_number": assignments_by_item.get(item.get("item"))}
            for item in (toc or [])
        ],
    }


class CourseTextbookCreate(BaseModel):
    textbook_id: Optional[int] = None
    custom_name: Optional[str] = None
    custom_toc: Optional[List[dict]] = None
    type: str = "textbook"  # textbook / vocabulary
    daily_words: Optional[int] = None
    review_words: Optional[int] = None
    target_laps: int = 1  # コース完了条件として求める周回数

    @model_validator(mode="after")
    def _validate(self):
        if not self.textbook_id and not (self.custom_name and self.custom_toc):
            raise ValueError("textbook_id、またはcustom_name+custom_tocのいずれかを指定してください")
        return self


@router.get("/courses/{course_id}/textbooks")
def list_course_textbooks(course_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """コースに紐づく教材一覧（日程割り当て込み）。要(本人)"""
    _get_owned_course(db, course_id, current_user)
    textbooks = db.query(CourseTextbook).filter(CourseTextbook.course_id == course_id).all()
    return [_serialize_course_textbook(t) for t in textbooks]


@router.post("/courses/{course_id}/textbooks", status_code=status.HTTP_201_CREATED)
def add_course_textbook(course_id: int, data: CourseTextbookCreate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """コースに教材を追加する（プリセット選択 or 手入力）。要(本人)"""
    course = _get_owned_course(db, course_id, current_user)
    if data.textbook_id and not db.query(Textbook).filter(Textbook.id == data.textbook_id).first():
        raise HTTPException(status_code=404, detail="教材が見つかりません")
    if data.textbook_id and db.query(CourseTextbook).filter(
        CourseTextbook.course_id == course_id, CourseTextbook.textbook_id == data.textbook_id
    ).first():
        raise HTTPException(status_code=400, detail="この教材は既にこのコースに追加されています")
    if data.custom_name and db.query(CourseTextbook).filter(
        CourseTextbook.course_id == course_id, CourseTextbook.custom_name == data.custom_name
    ).first():
        raise HTTPException(status_code=400, detail="同じ名前の教材が既にこのコースに追加されています")

    course_textbook = CourseTextbook(
        course_id=course.id,
        textbook_id=data.textbook_id,
        custom_name=data.custom_name,
        custom_toc=data.custom_toc,
        type=data.type,
        daily_words=data.daily_words,
        review_words=data.review_words,
        target_laps=data.target_laps,
    )
    db.add(course_textbook)
    db.commit()
    db.refresh(course_textbook)
    return _serialize_course_textbook(course_textbook)


class CourseTextbookUpdate(BaseModel):
    daily_words: Optional[int] = None
    review_words: Optional[int] = None
    target_laps: Optional[int] = None


@router.put("/course-textbooks/{course_textbook_id}")
def update_course_textbook(course_textbook_id: int, data: CourseTextbookUpdate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """単語帳の1日あたり新規語数・復習語数・目標周回数を更新する。要(本人)"""
    course_textbook = db.query(CourseTextbook).filter(CourseTextbook.id == course_textbook_id).first()
    if not course_textbook:
        raise HTTPException(status_code=404, detail="教材が見つかりません")
    _get_owned_course(db, course_textbook.course_id, current_user)
    for key, val in data.model_dump(exclude_none=True).items():
        setattr(course_textbook, key, val)
    db.commit()
    db.refresh(course_textbook)
    return _serialize_course_textbook(course_textbook)


@router.delete("/course-textbooks/{course_textbook_id}")
def delete_course_textbook(course_textbook_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """コースから教材を削除する。要(本人)"""
    course_textbook = db.query(CourseTextbook).filter(CourseTextbook.id == course_textbook_id).first()
    if not course_textbook:
        raise HTTPException(status_code=404, detail="教材が見つかりません")
    _get_owned_course(db, course_textbook.course_id, current_user)
    db.delete(course_textbook)
    db.commit()
    return {"message": "削除しました"}


class DayAssignmentItem(BaseModel):
    toc_item: str
    day_number: Optional[int] = None  # 1〜30。NULLは「やらない」


class DayAssignmentsUpdate(BaseModel):
    assignments: List[DayAssignmentItem]


@router.put("/course-textbooks/{course_textbook_id}/day-assignments")
def set_day_assignments(course_textbook_id: int, data: DayAssignmentsUpdate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """教材の各章を1〜30日のどこでやるか（またはやらない）を一括設定する。要(本人)"""
    course_textbook = db.query(CourseTextbook).filter(CourseTextbook.id == course_textbook_id).first()
    if not course_textbook:
        raise HTTPException(status_code=404, detail="教材が見つかりません")
    _get_owned_course(db, course_textbook.course_id, current_user)

    for item in data.assignments:
        if item.day_number is not None and not (1 <= item.day_number <= 30):
            raise HTTPException(status_code=400, detail="day_numberは1〜30で指定してください")

    db.query(TextbookDayAssignment).filter(TextbookDayAssignment.course_textbook_id == course_textbook_id).delete(synchronize_session=False)
    for item in data.assignments:
        db.add(TextbookDayAssignment(course_textbook_id=course_textbook_id, toc_item=item.toc_item, day_number=item.day_number))
    db.commit()
    db.refresh(course_textbook)
    return _serialize_course_textbook(course_textbook)


class TextbookPlanQA(BaseModel):
    question: str
    answer: str


class TextbookPlanRequest(BaseModel):
    description: str
    qa_history: List[TextbookPlanQA] = []


@router.post("/courses/{course_id}/textbooks/plan")
def plan_course_textbooks(course_id: int, data: TextbookPlanRequest, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """クリエイターが自然言語で説明した教材の使い方を、AIが30日間の日程プランに変換する（保存はしない）。要(本人)"""
    _get_owned_course(db, course_id, current_user)
    course_textbooks = db.query(CourseTextbook).filter(CourseTextbook.course_id == course_id).all()
    if not course_textbooks:
        raise HTTPException(status_code=400, detail="先に教材を追加してください")

    textbooks_brief = []
    for ct in course_textbooks:
        toc = ct.textbook.toc if ct.textbook else ct.custom_toc
        textbooks_brief.append({
            "course_textbook_id": ct.id,
            "name": ct.textbook.name if ct.textbook else ct.custom_name,
            "type": ct.type,
            "toc": [item.get("item") for item in (toc or [])],
        })

    from app.core import textbook_plan_prompts as plan_prompts
    messages = plan_prompts.build_textbook_plan_messages(
        textbooks_brief, data.description, [qa.model_dump() for qa in data.qa_history]
    )
    try:
        raw = generate_text(plan_prompts.TEXTBOOK_PLAN_SYSTEM, messages, max_tokens=3000, json_mode=True)
        from app.core.llm import extract_json
        plan = extract_json(raw)
    except LLMError as e:
        raise HTTPException(status_code=502, detail=f"AIによる計画の生成に失敗しました: {e}")
    except (ValueError, json.JSONDecodeError):
        raise HTTPException(status_code=502, detail="AIの応答をJSONとして解析できませんでした")

    return plan


class ParseTocRequest(BaseModel):
    textbook_name: str
    message: str
    history: List[dict] = []


@router.post("/courses/{course_id}/textbooks/parse-toc")
def parse_toc_chat(course_id: int, data: ParseTocRequest, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """ユーザーが自然言語で説明した教材の目次構成をAIがリスト化し、確認を返す。会話形式で精緻化できる。要(本人)"""
    _get_owned_course(db, course_id, current_user)
    SYSTEM = f"""あなたは教材の目次を整理するアシスタントです。
ユーザーが説明した「{data.textbook_name}」の構成を、目次アイテムのリストとして整理してください。
会話の最後に必ずJSONで返答してください。形式:
{{"ai_message": "確認メッセージ（日本語）", "toc_items": ["項目1", "項目2", ...]}}
- toc_itemsは配列形式で、各項目は短い文字列
- ai_messageで生成した目次リストの内容を確認する
- 情報が足りない場合はai_messageで質問し、toc_itemsは空配列にする
JSONのみ返してください。"""
    messages = list(data.history)
    messages.append({"role": "user", "content": data.message})
    try:
        from app.core.llm import extract_json
        raw = generate_text(SYSTEM, messages, max_tokens=1000, json_mode=True)
        result = extract_json(raw)
    except (LLMError, ValueError) as e:
        raise HTTPException(status_code=502, detail=f"AI応答の解析に失敗しました: {e}")
    return result


class TextbookPlanItem(BaseModel):
    course_textbook_id: int
    type: str
    daily_words: Optional[int] = None
    review_words: Optional[int] = None
    target_laps: Optional[int] = None
    day_assignments: Optional[List[DayAssignmentItem]] = None


class TextbookPlanApplyRequest(BaseModel):
    plans: List[TextbookPlanItem]


@router.post("/courses/{course_id}/textbooks/plan/apply")
def apply_course_textbook_plan(course_id: int, data: TextbookPlanApplyRequest, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """AIが生成した教材プランを確定し、各教材の設定・日程割り当てに保存する。要(本人)"""
    _get_owned_course(db, course_id, current_user)
    course_textbooks = {ct.id: ct for ct in db.query(CourseTextbook).filter(CourseTextbook.course_id == course_id).all()}

    for plan in data.plans:
        ct = course_textbooks.get(plan.course_textbook_id)
        if not ct:
            continue
        if plan.daily_words is not None:
            ct.daily_words = plan.daily_words
        if plan.review_words is not None:
            ct.review_words = plan.review_words
        if plan.target_laps is not None:
            ct.target_laps = plan.target_laps
        if plan.day_assignments is not None:
            db.query(TextbookDayAssignment).filter(TextbookDayAssignment.course_textbook_id == ct.id).delete(synchronize_session=False)
            for item in plan.day_assignments:
                if item.day_number is not None and not (1 <= item.day_number <= 30):
                    continue
                db.add(TextbookDayAssignment(course_textbook_id=ct.id, toc_item=item.toc_item, day_number=item.day_number))
    db.commit()

    refreshed = db.query(CourseTextbook).filter(CourseTextbook.course_id == course_id).all()
    return [_serialize_course_textbook(t) for t in refreshed]


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
            "is_day_based": bool(course.days),
            "thumbnail_url": course.thumbnail_url,
            "character": (
                {"name": course.character.name, "avatar_url": course.character.image_url}
                if course.character else None
            ),
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
    completed_task_types: Optional[List[str]] = None  # 実際に完了したタスク種別。未指定なら全タスク完了とみなす


def _apply_carryover(db: Session, course_id: int, user_id: int, day_number: int, completed_task_types: Optional[list[str]]) -> None:
    """完了報告された日のタスクのうち未完了だった分を、翌日のcarryover_tasksに反映する（議論サマリー15節）。
    completed_task_typesがNone（未指定）の場合は全タスク完了とみなし、繰越は発生させない。"""
    if completed_task_types is None or day_number >= 30:
        return
    profile = db.query(LearnerProfile).filter(
        LearnerProfile.user_id == user_id, LearnerProfile.course_id == course_id
    ).first()
    if not profile:
        return
    today_learner_day = db.query(LearnerCourseDay).filter(
        LearnerCourseDay.learner_profile_id == profile.id, LearnerCourseDay.day_number == day_number,
    ).first()
    if not today_learner_day:
        return
    skipped_tasks = [t for t in (today_learner_day.adjusted_tasks or []) if t.get("type") not in completed_task_types]

    next_day = db.query(LearnerCourseDay).filter(
        LearnerCourseDay.learner_profile_id == profile.id, LearnerCourseDay.day_number == day_number + 1,
    ).first()
    if not next_day:
        return
    # 同じ日からの繰越を複数回送信されても重複加算しないよう、この日からの分は一旦除いて再構成する
    other_carryover = [t for t in (next_day.carryover_tasks or []) if t.get("carryover_from_day") != day_number]
    new_carryover = [{**t, "carryover_from_day": day_number} for t in skipped_tasks]
    next_day.carryover_tasks = other_carryover + new_carryover if new_carryover else other_carryover or None


@router.put("/courses/{course_id}/day-logs/{day_number}/complete")
def complete_day_log(course_id: int, day_number: int, data: DayLogCompleteRequest, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """指定日の学習完了を記録する（学習者が「完了」と報告した時に呼ぶ）。
    completed_task_typesを指定すると、未完了だったタスク種別が翌日に繰越タスクとして引き継がれる。要(購入済み学習者)"""
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
    log.completed_task_types = data.completed_task_types
    _apply_carryover(db, course_id, current_user.id, day_number, data.completed_task_types)
    db.commit()
    return {"day_number": day_number, "is_completed": True, "completed_at": log.completed_at, "memo": log.memo}


# ----- Day1診断のカスタム質問（議論サマリー20260626 14節） -----

VALID_ANSWER_TYPES = ("text", "number", "single", "multi")


def _serialize_diagnosis_question(q: CourseDiagnosisQuestion) -> dict:
    return {
        "id": q.id,
        "course_id": q.course_id,
        "question_text": q.question_text,
        "answer_type": q.answer_type,
        "options": q.options,
        "is_required": q.is_required,
        "order": q.order,
    }


class DiagnosisQuestionCreate(BaseModel):
    question_text: str
    answer_type: str = "text"
    options: Optional[List[str]] = None
    is_required: bool = True

    @model_validator(mode="after")
    def _validate(self):
        if self.answer_type not in VALID_ANSWER_TYPES:
            raise ValueError(f"answer_typeは{VALID_ANSWER_TYPES}のいずれかを指定してください")
        if self.answer_type in ("single", "multi") and not self.options:
            raise ValueError("single/multiの場合はoptionsを指定してください")
        return self


class DiagnosisQuestionUpdate(BaseModel):
    question_text: Optional[str] = None
    answer_type: Optional[str] = None
    options: Optional[List[str]] = None
    is_required: Optional[bool] = None
    order: Optional[int] = None


@router.get("/courses/{course_id}/diagnosis-questions")
def list_diagnosis_questions(course_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """コースに設定されたDay1診断のカスタム質問一覧。要(本人)"""
    course = _get_owned_course(db, course_id, current_user)
    return [_serialize_diagnosis_question(q) for q in course.diagnosis_questions]


@router.post("/courses/{course_id}/diagnosis-questions", status_code=status.HTTP_201_CREATED)
def add_diagnosis_question(course_id: int, data: DiagnosisQuestionCreate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Day1診断のカスタム質問を追加する。要(本人)"""
    course = _get_owned_course(db, course_id, current_user)
    next_order = max((q.order for q in course.diagnosis_questions), default=-1) + 1
    question = CourseDiagnosisQuestion(
        course_id=course.id,
        question_text=data.question_text,
        answer_type=data.answer_type,
        options=data.options,
        is_required=data.is_required,
        order=next_order,
    )
    db.add(question)
    db.commit()
    db.refresh(question)
    return _serialize_diagnosis_question(question)


class DiagnosisQuestionBulkCreate(BaseModel):
    questions: List[DiagnosisQuestionCreate]


@router.post("/courses/{course_id}/diagnosis-questions/bulk", status_code=status.HTTP_201_CREATED)
def add_diagnosis_questions_bulk(course_id: int, data: DiagnosisQuestionBulkCreate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Day1診断のカスタム質問をまとめて追加する（テンプレート適用用）。1件でも不正なら全件失敗にする。要(本人)"""
    course = _get_owned_course(db, course_id, current_user)
    next_order = max((q.order for q in course.diagnosis_questions), default=-1) + 1
    created = []
    for i, q in enumerate(data.questions):
        question = CourseDiagnosisQuestion(
            course_id=course.id,
            question_text=q.question_text,
            answer_type=q.answer_type,
            options=q.options,
            is_required=q.is_required,
            order=next_order + i,
        )
        db.add(question)
        created.append(question)
    db.commit()
    for q in created:
        db.refresh(q)
    return [_serialize_diagnosis_question(q) for q in created]


@router.put("/diagnosis-questions/{question_id}")
def update_diagnosis_question(question_id: int, data: DiagnosisQuestionUpdate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Day1診断のカスタム質問を更新する。要(本人)"""
    question = db.query(CourseDiagnosisQuestion).filter(CourseDiagnosisQuestion.id == question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="質問が見つかりません")
    _get_owned_course(db, question.course_id, current_user)

    updates = data.model_dump(exclude_none=True)
    answer_type = updates.get("answer_type", question.answer_type)
    if answer_type not in VALID_ANSWER_TYPES:
        raise HTTPException(status_code=400, detail=f"answer_typeは{VALID_ANSWER_TYPES}のいずれかを指定してください")
    options = updates.get("options", question.options)
    if answer_type in ("single", "multi") and not options:
        raise HTTPException(status_code=400, detail="single/multiの場合はoptionsを指定してください")

    for key, val in updates.items():
        setattr(question, key, val)
    db.commit()
    db.refresh(question)
    return _serialize_diagnosis_question(question)


@router.delete("/diagnosis-questions/{question_id}")
def delete_diagnosis_question(question_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Day1診断のカスタム質問を削除する。要(本人)"""
    question = db.query(CourseDiagnosisQuestion).filter(CourseDiagnosisQuestion.id == question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="質問が見つかりません")
    _get_owned_course(db, question.course_id, current_user)
    db.delete(question)
    db.commit()
    return {"message": "削除しました"}
