import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.email import send_email
from app.core.config import settings as app_settings
from app.core.llm import generate_text, LLMError
from app.core import chat_prompts as prompts
from app.models.character import Character
from app.models.daily_summary import DailySummary
from app.models.personality_profile import PersonalityProfile
from app.models.course import Course
from app.models.customer import Customer
from app.models.notification import Notification
from app.models.question import Question
from app.models.creator_profile import CreatorProfile
from app.models.purchase import Purchase
from app.models.course_subscription import CourseSubscription
from app.models.card_progress import CardProgress
from app.models.chapter_card import ChapterCard
from app.models.course_chapter import CourseChapter
from app.models.reengagement_state import ReengagementState

logger = logging.getLogger(__name__)

# 沈黙ベース再エンゲージメント（修正.md 2節）: コースの型ごとの閾値（経過日数）とトーンの指示。
# 一度送ったら次の閾値に達するまで再送しない。罪悪感を煽らず、好奇心・前向きさを軸にする。
REENGAGEMENT_THRESHOLDS: dict[str, list[tuple[int, str]]] = {
    "self_paced": [
        (7, "経過7日程度。軽い好奇心ベースの一言（例：「そういえば、あの続きどうなった？」）。"),
        (14, "経過14日程度。学習者が最後に取り組んでいた章の内容に具体的に触れながら、続きへの興味を引き出す。"),
        (30, "経過30日以上。ブランクがあっても大丈夫、前回の続きからすぐ再開できると伝え、再開のハードルを下げる。"),
    ],
    "pace_based": [
        (2, "経過2〜3日程度。軽い声かけ（例：「今日の分、まだ残ってるよ。1個だけでも進めてみる？」）で、習慣の再開を促す。"),
        (5, "経過5〜7日程度。積み上げが途切れていることに軽く触れつつ、無理せず今日から再開できる粒度を提示する。"),
        (14, "経過14日以上。続きのところからでも、最初からやり直してもどちらでも大丈夫と伝え、再開のハードルを下げる。"),
    ],
}

# 学習者が入力する朝・夜の通知時刻は日本時間（JST）基準のため、サーバーのUTC時刻をJSTに変換して比較する
JST = timezone(timedelta(hours=9))


def _access_start_at(db: Session, user_id: int, course_id: int) -> Optional[datetime]:
    """学習者がこのコースへのアクセスを得た日時（買い切り購入 or サブスク契約開始）の最も古いもの。"""
    purchase_at = db.query(Purchase.purchased_at).filter(
        Purchase.user_id == user_id, Purchase.course_id == course_id, Purchase.status == "succeeded",
    ).order_by(Purchase.purchased_at.asc()).first()
    sub_at = db.query(CourseSubscription.created_at).filter(
        CourseSubscription.user_id == user_id, CourseSubscription.course_id == course_id,
    ).order_by(CourseSubscription.created_at.asc()).first()
    candidates = [c[0] for c in (purchase_at, sub_at) if c and c[0]]
    if not candidates:
        return None
    return min(c if c.tzinfo else c.replace(tzinfo=timezone.utc) for c in candidates)


def _last_activity_at_v2(db: Session, user_id: int, course_id: int, fallback_start: datetime) -> datetime:
    """学習者が最後にこのコースに触れた日時。チャットの質問送信・カード操作（完了/提出/閲覧）のうち
    最も新しいものを採用する。どちらもなければ購入・契約開始日時を起点とする（旧Day制LearnerProfile
    には依存しない。カリキュラムは章/カード構造のため）。"""
    last_question = db.query(Question.created_at).filter(
        Question.user_id == user_id, Question.course_id == course_id,
    ).order_by(Question.created_at.desc()).first()
    last_card_access = (
        db.query(CardProgress.last_accessed_at)
        .join(ChapterCard, CardProgress.card_id == ChapterCard.id)
        .join(CourseChapter, ChapterCard.chapter_id == CourseChapter.id)
        .filter(CourseChapter.course_id == course_id, CardProgress.user_id == user_id)
        .order_by(CardProgress.last_accessed_at.desc())
        .first()
    )
    started = fallback_start if fallback_start.tzinfo else fallback_start.replace(tzinfo=timezone.utc)
    candidates = [started]
    for row in (last_question, last_card_access):
        if row and row[0]:
            candidates.append(row[0] if row[0].tzinfo else row[0].replace(tzinfo=timezone.utc))
    return max(candidates)


def _last_chapter_title(db: Session, user_id: int, course_id: int) -> Optional[str]:
    """学習者が最後に触れた章のタイトル（沈黙14日メッセージで具体的に触れるために使う）。
    直近で完了したカードの章を優先し、なければ最初の未完了章（＝現在地）を返す。"""
    last_completed = (
        db.query(CourseChapter.title)
        .join(ChapterCard, ChapterCard.chapter_id == CourseChapter.id)
        .join(CardProgress, CardProgress.card_id == ChapterCard.id)
        .filter(CourseChapter.course_id == course_id, CardProgress.user_id == user_id, CardProgress.is_completed == True)  # noqa: E712
        .order_by(CardProgress.completed_at.desc())
        .first()
    )
    if last_completed:
        return last_completed[0]
    first_chapter = db.query(CourseChapter.title).filter(CourseChapter.course_id == course_id).order_by(CourseChapter.order).first()
    return first_chapter[0] if first_chapter else None


def _next_reengagement_threshold(course_type: str, days_inactive: int, last_sent_threshold: Optional[int]) -> Optional[tuple[int, str]]:
    """コースの型・経過日数・前回送信済みの閾値から、今回送るべき閾値（未送信かつ経過日数以上で最大のもの）を返す。"""
    thresholds = REENGAGEMENT_THRESHOLDS.get(course_type, REENGAGEMENT_THRESHOLDS["self_paced"])
    candidate = None
    for threshold_days, tone_hint in thresholds:
        if days_inactive >= threshold_days and (last_sent_threshold is None or threshold_days > last_sent_threshold):
            candidate = (threshold_days, tone_hint)
    return candidate


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


def _iter_active_course_access(db: Session):
    """(user_id, course_id, fallback_start)を、買い切り購入(未卒業)・有効なサブスク契約の両方から列挙する。
    旧Day制のLearnerProfileには依存しない（章/カード構造のコースではLearnerProfileが作られないため）。"""
    seen: set[tuple[int, int]] = set()
    purchases = db.query(Purchase).filter(Purchase.status == "succeeded", Purchase.is_graduated == False).all()  # noqa: E712
    for p in purchases:
        key = (p.user_id, p.course_id)
        if key in seen:
            continue
        seen.add(key)
        yield p.user_id, p.course_id, p.purchased_at
    subs = db.query(CourseSubscription).filter(CourseSubscription.status == "active").all()
    for s in subs:
        key = (s.user_id, s.course_id)
        if key in seen:
            continue
        seen.add(key)
        yield s.user_id, s.course_id, s.created_at


def check_inactive_reminders():
    """沈黙ベースの呼び戻し通知（修正.md 2節）。罪悪感ではなく好奇心ベースのニュアンスで送信し、
    コースの型（自由進行型/ペース管理型）ごとに異なる閾値・トーンを使う。一度送った閾値は
    次の閾値に達するまで再送しない（ReengagementStateで管理）。"""
    db = SessionLocal()
    try:
        now = datetime.now(JST)
        for user_id, course_id, fallback_start in _iter_active_course_access(db):
            course = db.query(Course).filter(Course.id == course_id).first()
            if not course:
                continue

            last_activity = _last_activity_at_v2(db, user_id, course_id, fallback_start)
            days_inactive = (now.date() - last_activity.astimezone(JST).date()).days
            if days_inactive < 1:
                continue

            state = db.query(ReengagementState).filter(
                ReengagementState.user_id == user_id, ReengagementState.course_id == course_id,
            ).first()
            next_threshold = _next_reengagement_threshold(course.course_type, days_inactive, state.last_threshold_days if state else None)
            if not next_threshold:
                continue
            threshold_days, tone_hint = next_threshold

            user = db.query(Customer).filter(Customer.id == user_id).first()
            if not user:
                continue

            # キャラクターのtone_profileと人格プロファイル（指導哲学）を両方取得し、
            # どちらの生成パスでも人格が薄くならないようにする
            character = db.query(Character).filter(Character.creator_id == course.character.creator_id).first() if course.character else None
            tone_profile = character.tone_profile if character and character.tone_profile else None
            character_name = character.name if character else None
            character_image = character.image_url if character else None
            personality = db.query(PersonalityProfile).filter(PersonalityProfile.id == course.personality_profile_id).first()
            personality_profile = personality.profile if personality and personality.profile else None

            if not (tone_profile and character_name) and not personality_profile:
                continue

            last_summary_row = db.query(DailySummary).filter(
                DailySummary.user_id == user.id, DailySummary.course_id == course.id,
            ).order_by(DailySummary.day_number.desc()).first()
            last_summary = last_summary_row.summary if last_summary_row else None
            last_chapter_title = _last_chapter_title(db, user.id, course.id) if course.course_type == "self_paced" and threshold_days >= 14 else None

            try:
                message = generate_text(
                    prompts.build_reengagement_message_system(tone_profile or {}, character_name or (course.character.name if course.character else "コーチ"), personality_profile),
                    prompts.build_reengagement_message_user(last_summary, days_inactive, tone_hint, last_chapter_title),
                    max_tokens=150,
                    model=app_settings.DEEPSEEK_MODEL_LITE,
                )
            except LLMError:
                logger.exception(f"[ReengagementReminder] メッセージ生成に失敗: user_id={user.id}, course_id={course.id}")
                continue

            db.add(Notification(
                user_id=user.id,
                type="inactivity_reminder",
                payload={
                    "course_id": course.id,
                    "days_inactive": days_inactive,
                    "threshold_days": threshold_days,
                    "message": message,
                    "character_name": character_name,
                    "character_image": character_image,
                    "course_title": course.title,
                },
            ))
            if state:
                state.last_threshold_days = threshold_days
            else:
                db.add(ReengagementState(user_id=user.id, course_id=course.id, last_threshold_days=threshold_days))
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
