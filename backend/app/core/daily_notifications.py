import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.email import send_email
from app.core.config import settings as app_settings
from app.core.llm import generate_text, LLMError
from app.core import chat_prompts as prompts
from app.models.notification_setting import NotificationSetting
from app.models.learner_profile import LearnerProfile
from app.models.learner_course_day import LearnerCourseDay
from app.models.daily_summary import DailySummary
from app.models.personality_profile import PersonalityProfile
from app.models.course_day import CourseDay
from app.models.course import Course
from app.models.customer import Customer
from app.models.notification import Notification

logger = logging.getLogger(__name__)

# 通知時刻と現在時刻の照合に許容する誤差（このループの実行間隔より長く取る）
TOLERANCE_MINUTES = 5

# 学習者が入力する朝・夜の通知時刻は日本時間（JST）基準のため、サーバーのUTC時刻をJSTに変換して比較する
JST = timezone(timedelta(hours=9))


def _within_tolerance(now: datetime, target_hhmm: str) -> bool:
    try:
        target_hour, target_minute = (int(p) for p in target_hhmm.split(":"))
    except (ValueError, AttributeError):
        return False
    target_minutes_of_day = target_hour * 60 + target_minute
    now_minutes_of_day = now.hour * 60 + now.minute
    return abs(now_minutes_of_day - target_minutes_of_day) <= TOLERANCE_MINUTES


def _day_number_for(learner_profile: LearnerProfile, today: datetime) -> int:
    started = learner_profile.created_at
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    started_jst = started.astimezone(JST)
    elapsed_days = (today.date() - started_jst.date()).days
    return max(1, min(30, elapsed_days + 1))


def _already_sent_today(db: Session, user_id: int, course_id: int, slot: str, today: datetime) -> bool:
    notif_type = f"daily_{slot}"
    jst_midnight = today.replace(hour=0, minute=0, second=0, microsecond=0)
    utc_cutoff = jst_midnight.astimezone(timezone.utc).replace(tzinfo=None)
    todays_notifications = db.query(Notification).filter(
        Notification.user_id == user_id,
        Notification.type == notif_type,
        Notification.created_at >= utc_cutoff,
    ).all()
    return any((n.payload or {}).get("course_id") == course_id for n in todays_notifications)


def _send_slot_notification(db: Session, setting: NotificationSetting, learner_profile: LearnerProfile, slot: str, today: datetime):
    course = db.query(Course).filter(Course.id == setting.course_id).first()
    if not course:
        return
    day_number = _day_number_for(learner_profile, today)
    course_day = db.query(CourseDay).filter(CourseDay.course_id == course.id, CourseDay.day_number == day_number).first()
    if not course_day or course_day.is_rest_day:
        return

    personality = db.query(PersonalityProfile).filter(PersonalityProfile.id == course.personality_profile_id).first()
    if not personality or not personality.profile:
        return

    learner_day = db.query(LearnerCourseDay).filter(
        LearnerCourseDay.learner_profile_id == learner_profile.id, LearnerCourseDay.day_number == day_number,
    ).first()
    today_tasks = learner_day.adjusted_tasks if learner_day else []
    summaries = db.query(DailySummary).filter(
        DailySummary.user_id == setting.user_id, DailySummary.course_id == course.id,
        DailySummary.day_number >= max(1, day_number - 3), DailySummary.day_number < day_number,
    ).order_by(DailySummary.day_number).all()

    try:
        message = generate_text(
            prompts.build_today_message_system(personality.profile, slot),
            prompts.build_today_message_user(day_number, today_tasks, [s.summary for s in summaries]),
            max_tokens=300,
            model=app_settings.DEEPSEEK_MODEL_LITE,
        )
    except LLMError:
        logger.exception(f"[DailyNotification] Layer3メッセージ生成に失敗しました: user_id={setting.user_id}, course_id={course.id}, slot={slot}")
        return

    user = db.query(Customer).filter(Customer.id == setting.user_id).first()
    if not user:
        return

    db.add(Notification(
        user_id=user.id,
        type=f"daily_{slot}",
        payload={"course_id": course.id, "day_number": day_number, "message": message},
    ))
    db.commit()

    if user.email:
        subject = "【ManaVillage】今日の声かけです" if slot == "morning" else "【ManaVillage】今日の学習報告はいかがでしたか？"
        send_email(user.email, subject, f"<p>{message}</p>")


def send_due_notifications():
    """通知時刻が現在時刻と一致する学習者へ、その日のAIメッセージを都度生成して送信する（リテンション機能：Push型通知、Layer3）。

    Day番号は診断完了日（LearnerProfile.created_at）からの経過日数で算出する。
    メッセージはプリ生成せず、今日のタスク(Layer2)・直近3日サマリーを踏まえてその場で生成する。
    """
    db = SessionLocal()
    try:
        now = datetime.now(JST)
        settings_list = db.query(NotificationSetting).filter(NotificationSetting.is_enabled == True).all()  # noqa: E712
        for setting in settings_list:
            learner_profile = db.query(LearnerProfile).filter(
                LearnerProfile.user_id == setting.user_id, LearnerProfile.course_id == setting.course_id
            ).first()
            if not learner_profile:
                continue

            for slot, time_value in (("morning", setting.morning_time), ("evening", setting.evening_time)):
                if not _within_tolerance(now, time_value):
                    continue
                if _already_sent_today(db, setting.user_id, setting.course_id, slot, now):
                    continue
                try:
                    _send_slot_notification(db, setting, learner_profile, slot, now)
                except Exception:
                    logger.exception(f"[DailyNotification] 送信に失敗しました: user_id={setting.user_id}, course_id={setting.course_id}, slot={slot}")
    finally:
        db.close()
