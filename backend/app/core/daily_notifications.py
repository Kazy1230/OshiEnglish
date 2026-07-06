import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.email import send_email
from app.core.config import settings as app_settings
from app.core.llm import generate_text, LLMError
from app.core import chat_prompts as prompts
from app.models.character import Character
from app.models.notification_setting import NotificationSetting
from app.models.learner_profile import LearnerProfile
from app.models.learner_course_day import LearnerCourseDay
from app.models.daily_summary import DailySummary
from app.models.personality_profile import PersonalityProfile
from app.models.course_day import CourseDay
from app.models.course import Course
from app.models.customer import Customer
from app.models.notification import Notification
from app.models.question import Question
from app.models.day_log import DayLog
from app.models.creator_profile import CreatorProfile

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
    today_tasks = (
        (learner_day.adjusted_tasks or []) + [{**t, "carryover": True} for t in (learner_day.carryover_tasks or [])]
        if learner_day else []
    )
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


def _last_activity_at(db: Session, user_id: int, course_id: int, learner_profile: LearnerProfile) -> datetime:
    """学習者が最後にチャットを開いた（質問を送った）日時。なければDay1診断完了日時を起点とする。"""
    last_question = db.query(Question.created_at).filter(
        Question.user_id == user_id, Question.course_id == course_id,
    ).order_by(Question.created_at.desc()).first()
    started = learner_profile.created_at
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    if not last_question:
        return started
    last_at = last_question[0]
    if last_at.tzinfo is None:
        last_at = last_at.replace(tzinfo=timezone.utc)
    return max(last_at, started)


def _already_sent_reminder_today(db: Session, user_id: int, course_id: int, today: datetime) -> bool:
    jst_midnight = today.replace(hour=0, minute=0, second=0, microsecond=0)
    utc_cutoff = jst_midnight.astimezone(timezone.utc).replace(tzinfo=None)
    todays_notifications = db.query(Notification).filter(
        Notification.user_id == user_id,
        Notification.type == "inactivity_reminder",
        Notification.created_at >= utc_cutoff,
    ).all()
    return any((n.payload or {}).get("course_id") == course_id for n in todays_notifications)


def _notify_creator_of_inactive_learner(db: Session, course: Course, learner_user: Customer, days_inactive: int):
    """4日以上未開封の場合、Tier B講師に直接連絡を促すメールを送る（ベストエフォート）。"""
    if not course.character or not course.character.creator_id:
        return
    creator_profile = db.query(CreatorProfile).filter(CreatorProfile.id == course.character.creator_id).first()
    if not creator_profile:
        return
    creator_user = db.query(Customer).filter(Customer.id == creator_profile.user_id).first()
    if not creator_user or not creator_user.email:
        return
    send_email(
        creator_user.email,
        f"【ManaVillage】学習者が{days_inactive}日間チャットを開いていません",
        f"<p>「{course.title}」の学習者（{learner_user.email}）が{days_inactive}日間チャットを開いていません。"
        f"管理画面から直接メッセージを送ることをご検討ください。</p>",
    )


def check_inactive_reminders():
    """好奇心ベースの呼び戻し通知。罪悪感ではなくキャラクターが「続きを話したかった」ニュアンスで送信する。"""
    db = SessionLocal()
    try:
        now = datetime.now(JST)
        learner_profiles = db.query(LearnerProfile).all()
        for learner_profile in learner_profiles:
            course = db.query(Course).filter(Course.id == learner_profile.course_id).first()
            if not course:
                continue
            completed_count = db.query(DayLog).filter(
                DayLog.user_id == learner_profile.user_id, DayLog.course_id == course.id, DayLog.is_completed == True,  # noqa: E712
            ).count()
            if completed_count >= 30:
                continue

            last_activity = _last_activity_at(db, learner_profile.user_id, course.id, learner_profile)
            days_inactive = (now.date() - last_activity.astimezone(JST).date()).days
            if days_inactive < 1:
                continue
            if _already_sent_reminder_today(db, learner_profile.user_id, course.id, now):
                continue

            user = db.query(Customer).filter(Customer.id == learner_profile.user_id).first()
            if not user:
                continue

            # キャラクターのtone_profileを取得（なければpersonality_profileにフォールバック）
            character = db.query(Character).filter(Character.creator_id == course.character.creator_id).first() if course.character else None
            tone_profile = character.tone_profile if character and character.tone_profile else None
            character_name = character.name if character else None
            character_image = character.image_url if character else None

            if tone_profile and character_name:
                # 最後の日次サマリーを取得して「続きの話」感を出す
                last_summary_row = db.query(DailySummary).filter(
                    DailySummary.user_id == user.id, DailySummary.course_id == course.id,
                ).order_by(DailySummary.day_number.desc()).first()
                last_summary = last_summary_row.summary if last_summary_row else None

                try:
                    message = generate_text(
                        prompts.build_reengagement_message_system(tone_profile, character_name),
                        prompts.build_reengagement_message_user(last_summary, days_inactive),
                        max_tokens=150,
                        model=app_settings.DEEPSEEK_MODEL_LITE,
                    )
                except LLMError:
                    logger.exception(f"[ReengagementReminder] メッセージ生成に失敗: user_id={user.id}, course_id={course.id}")
                    continue
            else:
                # tone_profileがない場合はpersonality_profileでフォールバック
                personality = db.query(PersonalityProfile).filter(PersonalityProfile.id == course.personality_profile_id).first()
                if not personality or not personality.profile:
                    continue
                tier = min(3, days_inactive)
                try:
                    message = generate_text(
                        prompts.build_reminder_message_system(personality.profile, tier),
                        prompts.build_reminder_message_user(days_inactive),
                        max_tokens=200,
                        model=app_settings.DEEPSEEK_MODEL_LITE,
                    )
                except LLMError:
                    logger.exception(f"[InactivityReminder] メッセージ生成に失敗: user_id={user.id}, course_id={course.id}")
                    continue
                character_name = None
                character_image = None

            db.add(Notification(
                user_id=user.id,
                type="inactivity_reminder",
                payload={
                    "course_id": course.id,
                    "days_inactive": days_inactive,
                    "message": message,
                    "character_name": character_name,
                    "character_image": character_image,
                    "course_title": course.title,
                },
            ))
            db.commit()

            if user.email:
                send_email(
                    user.email,
                    f"【{character_name or 'ManaVillage'}】{character_name or 'あなたのコーチ'}からメッセージが届いています",
                    f"<p>{message}</p>"
                    f'<p><a href="https://manavillage.app/courses/{course.id}/chat">チャット画面へ戻る</a></p>',
                )

            if days_inactive >= 4:
                _notify_creator_of_inactive_learner(db, course, user, days_inactive)
    finally:
        db.close()


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
