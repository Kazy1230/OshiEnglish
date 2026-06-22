from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, model_validator

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.llm import generate_text, extract_json, LLMError
from app.core import diagnosis_prompts as prompts
from app.models.course import Course
from app.models.course_day import CourseDay
from app.models.personality_profile import PersonalityProfile
from app.models.learner_profile import LearnerProfile
from app.models.learner_roadmap import LearnerRoadmap
from app.models.notification_setting import NotificationSetting
from app.models.learner_review import LearnerReview
from app.routers.courses import _is_accessible

router = APIRouter(prefix="/diagnosis", tags=["Day1初回診断・ロードマップ"])


def _get_purchased_course(db: Session, course_id: int, current_user) -> Course:
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="コースが見つかりません")
    if not _is_accessible(db, course, current_user.id):
        raise HTTPException(status_code=403, detail="このコースは現在ご利用いただけません")
    return course


def _get_personality_profile(db: Session, course: Course) -> PersonalityProfile:
    personality = None
    if course.personality_profile_id:
        personality = db.query(PersonalityProfile).filter(PersonalityProfile.id == course.personality_profile_id).first()
    if not personality or not personality.profile:
        raise HTTPException(status_code=400, detail="このコースのクリエイター人格プロファイルが未設定です")
    return personality


def _serialize_roadmap(roadmap: LearnerRoadmap) -> dict:
    return {
        "level_analysis": roadmap.level_analysis,
        "roadmap_reason": roadmap.roadmap_reason,
        "weekly_plan": roadmap.weekly_plan,
        "day1_tasks": roadmap.day1_tasks,
        "creator_message": roadmap.creator_message,
    }


@router.get("/{course_id}/questions")
def get_diagnosis_questions(course_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """診断チャットの固定7問（選択肢含む）を返す。要(購入済み学習者)"""
    _get_purchased_course(db, course_id, current_user)
    return {"questions": prompts.FIXED_QUESTIONS}


@router.post("/{course_id}/welcome")
def get_welcome_message(course_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """クリエイターの人格でウェルカムメッセージを生成する。要(購入済み学習者)"""
    course = _get_purchased_course(db, course_id, current_user)
    personality = _get_personality_profile(db, course)
    try:
        message = generate_text(
            prompts.WELCOME_MESSAGE_SYSTEM,
            prompts.build_welcome_message_messages(personality.profile),
            max_tokens=300,
        )
    except LLMError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"message": message}


class DiagnosisSubmitRequest(BaseModel):
    current_score: Optional[int] = None
    has_taken_before: bool = True  # False=未受験（current_scoreは無視される）
    target_score: int
    exam_date: str
    daily_study_time: str
    weak_areas: List[str]
    study_history: Optional[str] = None
    materials: Optional[str] = None

    @model_validator(mode="after")
    def _validate(self):
        if not self.has_taken_before:
            self.current_score = None
        if self.exam_date not in [o for q in prompts.FIXED_QUESTIONS if q["key"] == "exam_date" for o in q["options"]]:
            raise ValueError("exam_date が選択肢にありません")
        if self.daily_study_time not in [o for q in prompts.FIXED_QUESTIONS if q["key"] == "daily_study_time" for o in q["options"]]:
            raise ValueError("daily_study_time が選択肢にありません")
        valid_weak_areas = next(o["options"] for o in prompts.FIXED_QUESTIONS if o["key"] == "weak_areas")
        if not self.weak_areas or any(w not in valid_weak_areas for w in self.weak_areas):
            raise ValueError("weak_areas が選択肢にありません")
        return self


@router.post("/{course_id}/submit", status_code=201)
def submit_diagnosis(course_id: int, data: DiagnosisSubmitRequest, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """診断7問の回答を送信し、AIが90日ロードマップを生成して返す（事業検証ポイント②）。要(購入済み学習者)"""
    course = _get_purchased_course(db, course_id, current_user)
    personality = _get_personality_profile(db, course)

    course_days = sorted(course.days, key=lambda d: d.day_number)
    if not course_days:
        raise HTTPException(status_code=400, detail="このコースはまだ90日分のコンテンツが生成されていません")

    week_themes = []
    seen_weeks = set()
    for d in course_days:
        if d.week_number not in seen_weeks:
            seen_weeks.add(d.week_number)
            week_themes.append({"week_number": d.week_number, "theme": d.theme})

    profile = db.query(LearnerProfile).filter(
        LearnerProfile.user_id == current_user.id, LearnerProfile.course_id == course_id
    ).first()
    if not profile:
        profile = LearnerProfile(user_id=current_user.id, course_id=course_id)
        db.add(profile)

    profile.current_score = data.current_score
    profile.target_score = data.target_score
    profile.exam_date = data.exam_date
    profile.daily_study_time = data.daily_study_time
    profile.weak_areas = data.weak_areas
    profile.study_history = data.study_history
    profile.materials = data.materials
    db.commit()
    db.refresh(profile)

    try:
        text = generate_text(
            prompts.ROADMAP_GENERATION_SYSTEM,
            prompts.build_roadmap_generation_messages(profile, personality.profile, week_themes),
            max_tokens=3000,
        )
        generated = extract_json(text)
    except LLMError as e:
        raise HTTPException(status_code=500, detail=f"ロードマップの生成に失敗しました: {e}")

    roadmap = db.query(LearnerRoadmap).filter(LearnerRoadmap.learner_profile_id == profile.id).first()
    if not roadmap:
        roadmap = LearnerRoadmap(learner_profile_id=profile.id)
        db.add(roadmap)

    roadmap.level_analysis = generated.get("level_analysis", {})
    roadmap.roadmap_reason = generated.get("roadmap_reason", "")
    roadmap.weekly_plan = generated.get("weekly_plan", [])
    roadmap.day1_tasks = generated.get("day1_tasks", [])
    roadmap.creator_message = generated.get("creator_message", "")
    db.commit()
    db.refresh(roadmap)

    return _serialize_roadmap(roadmap)


@router.get("/{course_id}/roadmap")
def get_roadmap(course_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """生成済みのパーソナライズロードマップを取得する。要(購入済み学習者)"""
    _get_purchased_course(db, course_id, current_user)
    profile = db.query(LearnerProfile).filter(
        LearnerProfile.user_id == current_user.id, LearnerProfile.course_id == course_id
    ).first()
    if not profile or not profile.roadmap:
        raise HTTPException(status_code=404, detail="まだ診断・ロードマップ生成が完了していません")
    return _serialize_roadmap(profile.roadmap)


class NotificationSettingRequest(BaseModel):
    morning_time: str = "07:00"
    evening_time: str = "21:00"
    is_enabled: bool = True


@router.get("/{course_id}/notification-settings")
def get_notification_settings(course_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """通知時刻設定を取得する（未設定の場合はデフォルト値を返す）。要(購入済み学習者)"""
    _get_purchased_course(db, course_id, current_user)
    setting = db.query(NotificationSetting).filter(
        NotificationSetting.user_id == current_user.id, NotificationSetting.course_id == course_id
    ).first()
    if not setting:
        return {"morning_time": "07:00", "evening_time": "21:00", "is_enabled": True}
    return {"morning_time": setting.morning_time, "evening_time": setting.evening_time, "is_enabled": setting.is_enabled}


@router.put("/{course_id}/notification-settings")
def update_notification_settings(course_id: int, data: NotificationSettingRequest, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """通知時刻設定を保存する（「後で設定する」スキップ時もデフォルト値で作成される）。要(購入済み学習者)"""
    _get_purchased_course(db, course_id, current_user)
    setting = db.query(NotificationSetting).filter(
        NotificationSetting.user_id == current_user.id, NotificationSetting.course_id == course_id
    ).first()
    if not setting:
        setting = NotificationSetting(user_id=current_user.id, course_id=course_id)
        db.add(setting)
    setting.morning_time = data.morning_time
    setting.evening_time = data.evening_time
    setting.is_enabled = data.is_enabled
    db.commit()
    return {"morning_time": setting.morning_time, "evening_time": setting.evening_time, "is_enabled": setting.is_enabled}


@router.get("/{course_id}/reviews")
def list_reviews(course_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """週次・月次レビュー一覧を取得する（要件定義書5.5）。新しい順。要(購入済み学習者)"""
    _get_purchased_course(db, course_id, current_user)
    reviews = db.query(LearnerReview).filter(
        LearnerReview.user_id == current_user.id, LearnerReview.course_id == course_id
    ).order_by(LearnerReview.review_type, LearnerReview.period_number.desc()).all()
    return [
        {
            "id": r.id,
            "review_type": r.review_type,
            "period_number": r.period_number,
            "content": r.content,
            "created_at": r.created_at,
        }
        for r in reviews
    ]
