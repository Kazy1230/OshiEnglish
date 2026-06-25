import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.email import send_email
from app.core.llm import generate_text, extract_json, LLMError
from app.core import diagnosis_prompts as prompts
from app.models.learner_profile import LearnerProfile
from app.models.learner_roadmap import LearnerRoadmap
from app.models.learner_review import LearnerReview
from app.models.day_log import DayLog
from app.models.question import Question
from app.models.course import Course
from app.models.customer import Customer
from app.models.personality_profile import PersonalityProfile

logger = logging.getLogger(__name__)

# 学習者の朝・夜通知時刻と同様、日次伴走はJST基準で日数を数える
JST = timezone(timedelta(hours=9))

WEEKLY_PERIOD_DAYS = 7
MONTHLY_PERIOD_DAYS = 30
TOTAL_DAYS = 30


def _day_number_for(learner_profile: LearnerProfile, today: datetime) -> int:
    started = learner_profile.created_at
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    started_jst = started.astimezone(JST)
    elapsed_days = (today.date() - started_jst.date()).days
    return max(1, min(TOTAL_DAYS, elapsed_days + 1))


def _question_category_stats(db: Session, user_id: int, course_id: int, day_start: int, day_end: int, period_start: datetime, period_end: datetime):
    questions = db.query(Question).filter(
        Question.user_id == user_id,
        Question.course_id == course_id,
        Question.created_at >= period_start,
        Question.created_at < period_end,
    ).all()
    category_names = [q.category.name for q in questions if q.category]
    top_weakness = None
    if category_names:
        top_weakness = max(set(category_names), key=category_names.count)
    return sorted(set(category_names)), top_weakness


def _task_stats(db: Session, user_id: int, course_id: int, day_start: int, day_end: int):
    logs = db.query(DayLog).filter(
        DayLog.user_id == user_id,
        DayLog.course_id == course_id,
        DayLog.day_number >= day_start,
        DayLog.day_number < day_end,
    ).all()
    completed_days = sum(1 for l in logs if l.is_completed)
    incomplete_days = (day_end - day_start) - completed_days
    return completed_days, incomplete_days


def _generate_weekly_review(db: Session, learner_profile: LearnerProfile, course: Course, week_number: int, now: datetime):
    day_start = (week_number - 1) * WEEKLY_PERIOD_DAYS + 1
    day_end = day_start + WEEKLY_PERIOD_DAYS

    personality = db.query(PersonalityProfile).filter(PersonalityProfile.id == course.personality_profile_id).first()
    if not personality or not personality.profile:
        return

    period_end = now
    period_start = period_end - timedelta(days=WEEKLY_PERIOD_DAYS)

    completed_days, incomplete_days = _task_stats(db, learner_profile.user_id, course.id, day_start, day_end)
    category_names, top_weakness = _question_category_stats(
        db, learner_profile.user_id, course.id, day_start, day_end, period_start, period_end
    )

    try:
        text = generate_text(
            prompts.WEEKLY_REVIEW_SYSTEM,
            prompts.build_weekly_review_messages(
                personality.profile, week_number, completed_days, completed_days, incomplete_days, category_names, top_weakness,
            ),
            json_mode=True,
        )
        content = extract_json(text)
    except (LLMError, ValueError) as e:
        logger.exception(f"[WeeklyReview] 生成に失敗しました: user_id={learner_profile.user_id}, course_id={course.id}, week={week_number}: {e}")
        return

    db.add(LearnerReview(
        user_id=learner_profile.user_id, course_id=course.id,
        review_type="weekly", period_number=week_number, content=content,
    ))
    db.commit()

    user = db.query(Customer).filter(Customer.id == learner_profile.user_id).first()
    if user and user.email:
        send_email(user.email, "【ManaVillage】今週の振り返りが届きました", f"<p>{content.get('weekly_summary', '')}</p>")


def _generate_monthly_review(db: Session, learner_profile: LearnerProfile, course: Course, month_number: int, now: datetime):
    day_start = (month_number - 1) * MONTHLY_PERIOD_DAYS + 1
    day_end = min(day_start + MONTHLY_PERIOD_DAYS, TOTAL_DAYS + 1)

    personality = db.query(PersonalityProfile).filter(PersonalityProfile.id == course.personality_profile_id).first()
    if not personality or not personality.profile:
        return

    period_end = now
    period_start = period_end - timedelta(days=MONTHLY_PERIOD_DAYS)

    completed_days, incomplete_days = _task_stats(db, learner_profile.user_id, course.id, day_start, day_end)
    category_names, _ = _question_category_stats(
        db, learner_profile.user_id, course.id, day_start, day_end, period_start, period_end
    )

    roadmap = db.query(LearnerRoadmap).filter(LearnerRoadmap.learner_profile_id == learner_profile.id).first()

    try:
        text = generate_text(
            prompts.MONTHLY_REVIEW_SYSTEM,
            prompts.build_monthly_review_messages(
                personality.profile, month_number,
                roadmap.roadmap_reason if roadmap else None,
                roadmap.level_analysis if roadmap else None,
                completed_days, day_end - day_start, completed_days, incomplete_days, category_names,
            ),
            json_mode=True,
        )
        content = extract_json(text)
    except (LLMError, ValueError) as e:
        logger.exception(f"[MonthlyReview] 生成に失敗しました: user_id={learner_profile.user_id}, course_id={course.id}, month={month_number}: {e}")
        return

    db.add(LearnerReview(
        user_id=learner_profile.user_id, course_id=course.id,
        review_type="monthly", period_number=month_number, content=content,
    ))
    db.commit()

    user = db.query(Customer).filter(Customer.id == learner_profile.user_id).first()
    if user and user.email:
        send_email(user.email, "【ManaVillage】今月のレビューが届きました", f"<p>{content.get('monthly_summary', '')}</p>")


def generate_due_reviews():
    """週次・月次レビューが必要な学習者を抽出して生成する（要件定義書5.5）。
    Day番号が7の倍数になった時点でその週のレビュー、30の倍数になった時点でその月のレビューを生成する。
    通知バッチ(send_due_notifications)と同様、毎分実行のループから呼ばれる前提で、
    1学習者・1コースにつき1期間1回だけ生成されるようunique制約＋事前存在チェックで防ぐ。
    """
    db = SessionLocal()
    try:
        now = datetime.now(JST)
        learner_profiles = db.query(LearnerProfile).all()
        for learner_profile in learner_profiles:
            course = db.query(Course).filter(Course.id == learner_profile.course_id).first()
            if not course or not course.personality_profile_id:
                continue

            day_number = _day_number_for(learner_profile, now)

            if day_number % WEEKLY_PERIOD_DAYS == 0:
                week_number = day_number // WEEKLY_PERIOD_DAYS
                exists = db.query(LearnerReview).filter(
                    LearnerReview.user_id == learner_profile.user_id,
                    LearnerReview.course_id == course.id,
                    LearnerReview.review_type == "weekly",
                    LearnerReview.period_number == week_number,
                ).first()
                if not exists:
                    user_id, course_id = learner_profile.user_id, course.id
                    try:
                        _generate_weekly_review(db, learner_profile, course, week_number, now)
                    except Exception:
                        db.rollback()
                        logger.exception(f"[WeeklyReview] 想定外のエラー: user_id={user_id}, course_id={course_id}")

            if day_number % MONTHLY_PERIOD_DAYS == 0:
                month_number = day_number // MONTHLY_PERIOD_DAYS
                exists = db.query(LearnerReview).filter(
                    LearnerReview.user_id == learner_profile.user_id,
                    LearnerReview.course_id == course.id,
                    LearnerReview.review_type == "monthly",
                    LearnerReview.period_number == month_number,
                ).first()
                if not exists:
                    user_id, course_id = learner_profile.user_id, course.id
                    try:
                        _generate_monthly_review(db, learner_profile, course, month_number, now)
                    except Exception:
                        db.rollback()
                        logger.exception(f"[MonthlyReview] 想定外のエラー: user_id={user_id}, course_id={course_id}")
    finally:
        db.close()
