from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.llm import generate_text, extract_json, LLMError
from app.core import diagnosis_prompts as prompts
from app.core import personalize_prompts
from app.models.course import Course
from app.models.course_day import CourseDay
from app.models.course_textbook import CourseTextbook
from app.models.learner_textbook_progress import LearnerTextbookProgress
from app.models.course_diagnosis_question import CourseDiagnosisQuestion
from app.models.learner_diagnosis_answer import LearnerDiagnosisAnswer
from app.models.personality_profile import PersonalityProfile
from app.models.learner_profile import LearnerProfile
from app.models.learner_roadmap import LearnerRoadmap
from app.models.learner_course_day import LearnerCourseDay
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
    """教材ごとの進捗質問、クリエイターがコース作成時に設定したカスタム質問を返す。要(購入済み学習者)
    Day1診断はクリエイターが設定した質問のみで構成する（固定質問は廃止）。"""
    course = _get_purchased_course(db, course_id, current_user)
    textbook_questions = [
        {"course_textbook_id": ct.id, "name": ct.textbook.name if ct.textbook else ct.custom_name, "target_laps": ct.target_laps}
        for ct in course.textbooks
    ]
    custom_questions = [
        {"id": q.id, "question_text": q.question_text, "answer_type": q.answer_type, "options": q.options, "is_required": q.is_required}
        for q in sorted(course.diagnosis_questions, key=lambda q: q.order)
    ]
    return {"textbook_questions": textbook_questions, "custom_questions": custom_questions}


@router.post("/{course_id}/welcome")
def get_welcome_message(course_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """クリエイターの人格でウェルカムメッセージを生成する。要(購入済み学習者)"""
    course = _get_purchased_course(db, course_id, current_user)
    personality = _get_personality_profile(db, course)
    try:
        _welcome_msgs = prompts.build_welcome_message_messages(personality.profile, subject=course.subject or "english")
        message = generate_text(
            _welcome_msgs[0]["content"],
            _welcome_msgs[1:],
            max_tokens=300,
        )
    except LLMError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"message": message}


class TextbookProgressInput(BaseModel):
    course_textbook_id: int
    status: Literal["not_started", "in_progress", "completed"]
    lap_number: Optional[int] = None  # in_progressの場合：現在何周目か（1始まり）
    percent: Optional[int] = None  # in_progressの場合：その周の進捗(0〜100)
    note: Optional[str] = None


class CustomAnswerInput(BaseModel):
    question_id: int
    answer: str


class DiagnosisSubmitRequest(BaseModel):
    textbook_progress: Optional[List[TextbookProgressInput]] = None
    custom_answers: Optional[List[CustomAnswerInput]] = None


@router.post("/{course_id}/submit", status_code=201)
def submit_diagnosis(course_id: int, data: DiagnosisSubmitRequest, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """クリエイターが設定したカスタム質問の回答を送信し、AIが30日ロードマップを生成して返す（事業検証ポイント②）。
    Day1診断はクリエイターのカスタム質問のみで構成する（固定7問は廃止）。要(購入済み学習者)"""
    if current_user.role == "creator":
        raise HTTPException(status_code=403, detail="クリエイターアカウントは学習者として診断を受けられません")
    course = _get_purchased_course(db, course_id, current_user)
    personality = _get_personality_profile(db, course)

    course_days = sorted(course.days, key=lambda d: d.day_number)
    if not course_days:
        raise HTTPException(status_code=400, detail="このコースはまだ30日分のコンテンツが生成されていません")

    answered_question_ids = {a.question_id for a in (data.custom_answers or [])}
    missing_required = [q.question_text for q in course.diagnosis_questions if q.is_required and q.id not in answered_question_ids]
    if missing_required:
        raise HTTPException(status_code=400, detail=f"必須の質問に回答してください: {'、'.join(missing_required)}")

    week_themes = []
    seen_weeks = set()
    for d in course_days:
        if d.week_number not in seen_weeks:
            seen_weeks.add(d.week_number)
            week_themes.append({"week_number": d.week_number, "theme": d.theme})

    profile = db.query(LearnerProfile).filter(
        LearnerProfile.user_id == current_user.id, LearnerProfile.course_id == course_id
    ).first()
    if profile:
        raise HTTPException(status_code=409, detail="Day1診断は既に完了しています。再診断はできません。")
    profile = LearnerProfile(user_id=current_user.id, course_id=course_id)
    db.add(profile)
    db.commit()
    db.refresh(profile)

    _save_textbook_progress(db, profile, data.textbook_progress or [])
    _save_custom_answers(db, profile, data.custom_answers or [])

    custom_qa = _build_custom_qa_summary(db, course, profile)

    try:
        _roadmap_msgs = prompts.build_roadmap_generation_messages(custom_qa, personality.profile, week_themes, subject=course.subject or "english")
        text = generate_text(
            _roadmap_msgs[0]["content"],
            _roadmap_msgs[1:],
            max_tokens=3000,
            json_mode=True,
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

    _generate_learner_course_days(db, profile, personality, course_days, custom_qa, course)

    return _serialize_roadmap(roadmap)


def _save_textbook_progress(db: Session, profile: LearnerProfile, items: list[TextbookProgressInput]) -> None:
    """Day1診断で入力された教材ごとの進捗をlearner_textbook_progressにupsertする。
    current_progressは「1周=100%」単位の累計値（議論サマリー13節）。"""
    for item in items:
        course_textbook = db.query(CourseTextbook).filter(CourseTextbook.id == item.course_textbook_id).first()
        if not course_textbook:
            continue
        if item.status == "not_started":
            current_progress = 0
        elif item.status == "completed":
            current_progress = course_textbook.target_laps * 100
        else:
            lap_number = max(item.lap_number or 1, 1)
            percent = min(max(item.percent or 0, 0), 100)
            current_progress = (lap_number - 1) * 100 + percent

        progress = db.query(LearnerTextbookProgress).filter(
            LearnerTextbookProgress.learner_profile_id == profile.id,
            LearnerTextbookProgress.course_textbook_id == item.course_textbook_id,
        ).first()
        if not progress:
            progress = LearnerTextbookProgress(learner_profile_id=profile.id, course_textbook_id=item.course_textbook_id)
            db.add(progress)
        progress.current_progress = current_progress
        progress.note = item.note
    db.commit()


def _save_custom_answers(db: Session, profile: LearnerProfile, items: list[CustomAnswerInput]) -> None:
    """Day1診断で入力されたクリエイター独自のカスタム質問への回答をlearner_diagnosis_answersにupsertする。"""
    for item in items:
        question = db.query(CourseDiagnosisQuestion).filter(CourseDiagnosisQuestion.id == item.question_id).first()
        if not question or question.course_id != profile.course_id:
            continue
        answer = db.query(LearnerDiagnosisAnswer).filter(
            LearnerDiagnosisAnswer.learner_profile_id == profile.id,
            LearnerDiagnosisAnswer.question_id == item.question_id,
        ).first()
        if not answer:
            answer = LearnerDiagnosisAnswer(learner_profile_id=profile.id, question_id=item.question_id)
            db.add(answer)
        answer.answer = item.answer
    db.commit()


def _build_custom_qa_summary(db: Session, course: Course, profile: LearnerProfile) -> list[str]:
    """クリエイターが設定したカスタム質問とその回答を「Q: ... → A: ...」の文章リストにする。
    固定7問を廃止した代わりに、ロードマップ・タスク個人化生成のインプットはこれのみになる。"""
    answers_by_question_id = {
        a.question_id: a.answer
        for a in db.query(LearnerDiagnosisAnswer).filter(LearnerDiagnosisAnswer.learner_profile_id == profile.id).all()
    }
    summary = []
    for q in sorted(course.diagnosis_questions, key=lambda q: q.order):
        answer = answers_by_question_id.get(q.id)
        if answer:
            summary.append(f"Q: {q.question_text} → A: {answer}")
    return summary


def _build_textbook_progress_summary(db: Session, profile: LearnerProfile) -> list[str]:
    """Layer2プロンプト用に、教材ごとの残りタスク量を人間が読める文章にする（議論サマリー13節の計算式）。"""
    progresses = db.query(LearnerTextbookProgress).filter(LearnerTextbookProgress.learner_profile_id == profile.id).all()
    summary = []
    for p in progresses:
        ct = db.query(CourseTextbook).filter(CourseTextbook.id == p.course_textbook_id).first()
        if not ct:
            continue
        name = ct.textbook.name if ct.textbook else ct.custom_name
        total = ct.target_laps * 100
        remaining = max(total - float(p.current_progress), 0)
        summary.append(f"「{name}」目標{ct.target_laps}周（{total}%）中、現在{p.current_progress}%済み → 残り{remaining:.0f}%分を30日に配分")
    return summary


def _generate_learner_course_days(db: Session, profile: LearnerProfile, personality: PersonalityProfile, course_days: list[CourseDay], custom_qa: list[str], course: "Course" = None) -> None:
    """Layer2: 学習者専用の30日タスク配分を生成し learner_course_days に保存する。
    生成に失敗した場合はLayer1のchecklist_itemsをそのままコピーして処理を継続する（学習者を止めない）。"""
    db.query(LearnerCourseDay).filter(LearnerCourseDay.learner_profile_id == profile.id).delete()

    course_days_brief = [
        {"day": d.day_number, "theme": d.theme, "checklist_items": d.checklist_items, "is_rest_day": d.is_rest_day}
        for d in course_days
    ]
    textbook_progress_summary = _build_textbook_progress_summary(db, profile)
    adjusted_by_day: dict[int, dict] = {}
    try:
        _personalize_msgs = personalize_prompts.build_personalize_messages(custom_qa, personality.profile, course_days_brief, textbook_progress_summary, subject=(course.subject if course else None) or "english")
        text = generate_text(
            _personalize_msgs[0]["content"],
            _personalize_msgs[1:],
            max_tokens=4000,
            json_mode=True,
        )
        for item in personalize_prompts.extract_json_array(text):
            adjusted_by_day[item.get("day")] = item
    except LLMError:
        adjusted_by_day = {}

    for d in course_days:
        item = adjusted_by_day.get(d.day_number)
        if item:
            adjusted_tasks = item.get("adjusted_checklist_items", [])
            reason = item.get("personalize_reason")
        else:
            # フォールバック: Layer1のチェックリスト項目をそのままコピー
            adjusted_tasks = list(d.checklist_items or [])
            reason = "標準プランを使用"
        db.add(LearnerCourseDay(
            learner_profile_id=profile.id,
            day_number=d.day_number,
            adjusted_tasks=adjusted_tasks,
            personalize_reason=reason,
        ))
    db.commit()


@router.get("/{course_id}/learner-days")
def list_learner_course_days(course_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """個人化済みの30日タスク配分(Layer2)を取得する。要(購入済み学習者)"""
    _get_purchased_course(db, course_id, current_user)
    profile = db.query(LearnerProfile).filter(
        LearnerProfile.user_id == current_user.id, LearnerProfile.course_id == course_id
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="まだ診断が完了していません")
    days = db.query(LearnerCourseDay).filter(
        LearnerCourseDay.learner_profile_id == profile.id
    ).order_by(LearnerCourseDay.day_number).all()
    return [
        {"day": d.day_number, "adjusted_tasks": d.adjusted_tasks, "personalize_reason": d.personalize_reason, "carryover_tasks": d.carryover_tasks}
        for d in days
    ]


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
