import json as json_lib
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.llm import generate_text, stream_text, extract_json, LLMError
from app.core.database import SessionLocal
from app.core.rate_limit import enforce_daily_character_limit, enforce_daily_message_limit
from app.core import chat_prompts as prompts
from app.core.config import settings
from app.core.email import send_email
from app.models.course import Course
from app.models.course_subscription import CourseSubscription
from app.models.personality_profile import PersonalityProfile
from app.models.question import Question
from app.models.answer import Answer
from app.models.question_category import QuestionCategory
from app.models.category_content import CategoryContent
from app.models.creator_profile import CreatorProfile
from app.models.customer import Customer
from app.models.character import Character
from app.models.learner_profile import LearnerProfile
from app.models.learner_course_day import LearnerCourseDay
from app.models.daily_summary import DailySummary
from app.models.day_log import DayLog
from app.routers.courses import _is_accessible

# チャット入力は1メッセージ単位の文字数制限を撤廃し、1日の合計入力文字数で制限する（DAILY_CHARACTER_LIMIT文字/日）
DAILY_CHARACTER_LIMIT = 2000

# 同一トピックでこの回数以上質問が続いたらTier Bアップグレードを提案する（事業検証ポイント①、MVP後に実データで調整予定）
FRUSTRATION_THRESHOLD = 3

router = APIRouter(prefix="/chat", tags=["デイリー伴走チャット"])


def _get_accessible_course(db: Session, course_id: int, current_user) -> Course:
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="コースが見つかりません")
    if not _is_accessible(db, course, current_user.id):
        raise HTTPException(status_code=403, detail="このコースは現在ご利用いただけません")
    return course


def _get_tier(db: Session, course: Course, current_user) -> str:
    sub = db.query(CourseSubscription).filter(
        CourseSubscription.user_id == current_user.id,
        CourseSubscription.course_id == course.id,
        CourseSubscription.status == "active",
    ).first()
    return sub.tier if sub else "A"


def _get_personality_profile(db: Session, course: Course) -> Optional[dict]:
    if not course.personality_profile_id:
        return None
    profile = db.query(PersonalityProfile).filter(PersonalityProfile.id == course.personality_profile_id).first()
    return profile.profile if profile else None


def _resolve_category(db: Session, creator_id: Optional[int], category_name: str) -> Optional[QuestionCategory]:
    """質問のカテゴリを解決する。AIが既存にない新しいカテゴリ名を提案した場合は
    status='pending'の候補として作成し、クリエイターが承認するまでコンテンツ紐付け・
    フラストレーション検知の対象にはしない（承認制、コミュニケーション設計詳細仕様 セクション8-9）。"""
    if not creator_id or not category_name:
        return None
    existing = db.query(QuestionCategory).filter(
        QuestionCategory.creator_id == creator_id, QuestionCategory.name == category_name
    ).first()
    if existing:
        return existing
    category = QuestionCategory(creator_id=creator_id, name=category_name, keywords=[], status="pending")
    db.add(category)
    db.flush()
    return category


def _today_questions_used_by_tier_b(db: Session, user_id: int, course_id: int) -> bool:
    """Tier Bの「1日1回まで講師へ届く」制限：本日すでに講師宛の質問があるかを確認する。"""
    from datetime import datetime, timezone, timedelta
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    return db.query(Question).filter(
        Question.user_id == user_id,
        Question.course_id == course_id,
        Question.tier == "B",
        Question.status == "pending_instructor",
        Question.created_at >= today_start,
    ).first() is not None


def _detect_frustration(db: Session, user_id: int, course_id: int, category: Optional[QuestionCategory]) -> Optional[dict]:
    """直近7日間で同一カテゴリへの質問がFRUSTRATION_THRESHOLD回以上続いていれば検知する（事業検証ポイント①）。
    承認待ち（pending）・却下済み（rejected）のカテゴリはクリエイターが内容を把握していないため対象外とする。"""
    if not category or category.status != "approved":
        return None
    from datetime import datetime, timezone, timedelta
    since = datetime.now(timezone.utc) - timedelta(days=7)
    count = db.query(Question).filter(
        Question.user_id == user_id,
        Question.course_id == course_id,
        Question.category_id == category.id,
        Question.created_at >= since,
    ).count()
    if count >= FRUSTRATION_THRESHOLD:
        return {"topic": category.name, "count": count}
    return None


def _notify_creator_of_pending_question(db: Session, course: Course, question_body: str):
    """Tier Bの質問が届いたことをクリエイターにメールで通知する（ベストエフォート）。"""
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
        "【ManaVillage】学習者からの質問が届いています",
        f"<p>「{course.title}」の学習者から質問が届きました。24時間以内に管理画面でご確認・回答をお願いします。</p>"
        f"<p>{question_body}</p>",
    )


class AskRequest(BaseModel):
    body: str


def _get_current_day_number(db: Session, user_id: int, course_id: int) -> int:
    """完了済み日次ログ数+1を「今日」とする（30日でキャップ）。"""
    completed = db.query(DayLog).filter(
        DayLog.user_id == user_id, DayLog.course_id == course_id, DayLog.is_completed == True,  # noqa: E712
    ).count()
    return min(completed + 1, 30)


def _get_today_context(db: Session, user_id: int, course_id: int) -> tuple[int, list, list[str]]:
    """今日のタスク(Layer2)と直近3日分の圧縮サマリー(Layer3用コンテキスト)を取得する。"""
    day_number = _get_current_day_number(db, user_id, course_id)
    profile = db.query(LearnerProfile).filter(
        LearnerProfile.user_id == user_id, LearnerProfile.course_id == course_id
    ).first()
    today_tasks: list = []
    if profile:
        learner_day = db.query(LearnerCourseDay).filter(
            LearnerCourseDay.learner_profile_id == profile.id, LearnerCourseDay.day_number == day_number,
        ).first()
        if learner_day:
            today_tasks = (learner_day.adjusted_tasks or []) + [
                {**t, "carryover": True} for t in (learner_day.carryover_tasks or [])
            ]
    summaries = db.query(DailySummary).filter(
        DailySummary.user_id == user_id, DailySummary.course_id == course_id,
        DailySummary.day_number >= max(1, day_number - 3), DailySummary.day_number < day_number,
    ).order_by(DailySummary.day_number).all()
    return day_number, today_tasks, [s.summary for s in summaries]


def _generate_and_save_daily_summary(db: Session, user_id: int, course_id: int, day_number: int) -> None:
    """当日の質問・回答ログを圧縮してdaily_summariesにupsertする。失敗時はデフォルト文を保存する（13.5）。"""
    if db.query(DailySummary).filter(
        DailySummary.user_id == user_id, DailySummary.course_id == course_id, DailySummary.day_number == day_number,
    ).first():
        return
    today_questions = db.query(Question).filter(
        Question.user_id == user_id, Question.course_id == course_id,
    ).order_by(Question.created_at).all()
    log_lines = []
    for q in today_questions:
        log_lines.append(f"学習者: {q.body}")
        for a in q.answers:
            log_lines.append(f"回答: {a.body}")
    try:
        summary_text = generate_text(
            prompts.DAILY_SUMMARY_SYSTEM,
            prompts.build_daily_summary_messages("\n".join(log_lines) or "（本日の会話なし）"),
            max_tokens=150,
            model=settings.DEEPSEEK_MODEL_LITE,
        )
    except LLMError:
        summary_text = "本日のサマリー生成失敗。感情: 不明"
    db.add(DailySummary(user_id=user_id, course_id=course_id, day_number=day_number, summary=summary_text))
    db.commit()


def _serialize_question(q: Question, frustration_signal: Optional[dict] = None) -> dict:
    answer = q.answers[-1] if q.answers else None
    return {
        "id": q.id,
        "body": q.body,
        "status": q.status,
        "category": q.category.name if q.category else None,
        "created_at": q.created_at,
        "answer": (
            {
                "body": answer.body,
                "answered_by": answer.answered_by,
                "linked_content_url": answer.linked_content_url,
                "is_draft": answer.is_draft,
            }
            if answer else None
        ),
        "frustration_signal": frustration_signal,
    }


@router.post("/{course_id}/ask")
def ask_question(course_id: int, data: AskRequest, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """学習者からの質問・相談を送信する（事業検証ポイント①の前段：質問ログ蓄積とAI回答）。要(購入済み学習者)"""
    course = _get_accessible_course(db, course_id, current_user)
    if not data.body.strip():
        raise HTTPException(status_code=400, detail="質問内容を入力してください")
    if prompts.check_injection(data.body):
        raise HTTPException(status_code=400, detail="このメッセージは送信できません")

    enforce_daily_message_limit(current_user.id, course_id, limit=30)
    enforce_daily_character_limit(current_user.id, course_id, len(data.body), limit=DAILY_CHARACTER_LIMIT)

    tier = _get_tier(db, course, current_user)
    creator_id = course.character.creator_id if course.character else None

    # Tier Bは1日1回まで講師へ届く。2回目以降はAIが自動回答（Tier Aと同じフロー）
    route_to_instructor = tier == "B" and not _today_questions_used_by_tier_b(db, current_user.id, course_id)

    personality = _get_personality_profile(db, course) or {}
    tone_profile = (course.character.tone_profile if course.character else None) or {}
    day_number, today_tasks, recent_summaries = _get_today_context(db, current_user.id, course_id)
    existing_category_names = [
        c.name for c in db.query(QuestionCategory).filter(QuestionCategory.creator_id == creator_id).all()
    ] if creator_id else []

    # 直近5件のQ&Aを会話履歴として取得する
    recent_questions = db.query(Question).filter(
        Question.user_id == current_user.id,
        Question.course_id == course_id,
    ).order_by(Question.created_at.desc()).limit(5).all()
    recent_questions = list(reversed(recent_questions))
    conversation_history: list[dict] = []
    for rq in recent_questions:
        conversation_history.append({"role": "user", "content": rq.body})
        if rq.answers:
            conversation_history.append({"role": "assistant", "content": rq.answers[-1].body})

    try:
        _classify_msgs = prompts.build_classify_messages(data.body, existing_category_names, subject=course.subject or "")
        classify_raw = generate_text(
            _classify_msgs[0]["content"],
            _classify_msgs[1:],
            max_tokens=200,
            model=settings.DEEPSEEK_MODEL_LITE,
            json_mode=True,
        )
        classified = extract_json(classify_raw)
    except LLMError as e:
        raise HTTPException(status_code=500, detail=f"質問の分類に失敗しました: {e}") from e

    category = _resolve_category(db, creator_id, classified.get("category_name", ""))
    message_type = classified.get("message_type", "content")

    question = Question(
        user_id=current_user.id,
        course_id=course_id,
        tier=tier,
        body=data.body,
        category_id=category.id if category else None,
        status="pending_instructor" if route_to_instructor else "pending",
    )
    db.add(question)
    db.flush()

    if route_to_instructor:
        # Tier B: AIが下書きを生成し、講師の承認を待つ（承認UIはPhase6で実装）。
        # 講師の代理回答のため品質を優先し、常にSonnetで生成する（設計書2.5節）
        linked_content = db.query(CategoryContent).filter(CategoryContent.category_id == category.id).first() if category and category.status == "approved" else None
        try:
            draft_body = generate_text(
                prompts.build_answer_system(personality, message_type, tone_profile),
                prompts.build_answer_messages(
                    data.body, linked_content.title if linked_content else None, linked_content.url if linked_content else None,
                    today_tasks, recent_summaries, conversation_history,
                ),
                max_tokens=400,
                model=settings.DEEPSEEK_MODEL,
            )
        except LLMError as e:
            raise HTTPException(status_code=500, detail=f"下書き回答の生成に失敗しました: {e}") from e
        db.add(Answer(question_id=question.id, answered_by="ai", body=draft_body, linked_content_url=linked_content.url if linked_content else None, is_draft=True))
        db.commit()
        db.refresh(question)
        _notify_creator_of_pending_question(db, course, data.body)
        if prompts.is_daily_close_signal(data.body):
            _generate_and_save_daily_summary(db, current_user.id, course_id, day_number)
        return _serialize_question(question)

    # Tier A（またはTier Bの2回目以降）：AIが自動回答。
    # 学習内容・感情系の相談はSonnet、状況報告等の定型応答はHaiku（設計書2.5節のモデル使い分け方針）
    linked_content = db.query(CategoryContent).filter(CategoryContent.category_id == category.id).first() if category and category.status == "approved" else None
    answer_model = prompts.select_answer_model(message_type, data.body, settings.DEEPSEEK_MODEL_LITE, settings.DEEPSEEK_MODEL)
    try:
        answer_body = generate_text(
            prompts.build_answer_system(personality, message_type, tone_profile),
            prompts.build_answer_messages(
                data.body, linked_content.title if linked_content else None, linked_content.url if linked_content else None,
                today_tasks, recent_summaries, conversation_history,
            ),
            max_tokens=400,
            model=answer_model,
        )
    except LLMError as e:
        raise HTTPException(status_code=500, detail=f"回答の生成に失敗しました: {e}") from e

    question.status = "answered_by_ai"
    db.add(Answer(question_id=question.id, answered_by="ai", body=answer_body, linked_content_url=linked_content.url if linked_content else None, is_draft=False))
    db.commit()
    db.refresh(question)

    if prompts.is_daily_close_signal(data.body):
        _generate_and_save_daily_summary(db, current_user.id, course_id, day_number)

    # Tier A学習者が同一トピックで繰り返し質問している場合、Tier Bアップグレードを提案する（事業検証ポイント①）
    frustration_signal = _detect_frustration(db, current_user.id, course_id, category) if tier == "A" else None
    return _serialize_question(question, frustration_signal)


@router.post("/{course_id}/ask-stream")
def ask_question_stream(course_id: int, data: AskRequest, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """チャット回答をSSEストリームで返す。Tier B講師ルート以外に使用。"""
    course = _get_accessible_course(db, course_id, current_user)
    if not data.body.strip():
        raise HTTPException(status_code=400, detail="質問内容を入力してください")
    if prompts.check_injection(data.body):
        raise HTTPException(status_code=400, detail="このメッセージは送信できません")

    enforce_daily_message_limit(current_user.id, course_id, limit=30)
    enforce_daily_character_limit(current_user.id, course_id, len(data.body), limit=DAILY_CHARACTER_LIMIT)

    tier = _get_tier(db, course, current_user)
    creator_id = course.character.creator_id if course.character else None
    personality = _get_personality_profile(db, course) or {}
    tone_profile = (course.character.tone_profile if course.character else None) or {}
    day_number, today_tasks, recent_summaries = _get_today_context(db, current_user.id, course_id)
    existing_category_names = [
        c.name for c in db.query(QuestionCategory).filter(QuestionCategory.creator_id == creator_id).all()
    ] if creator_id else []

    try:
        _classify_msgs = prompts.build_classify_messages(data.body, existing_category_names, subject=course.subject or "")
        classify_raw = generate_text(
            _classify_msgs[0]["content"],
            _classify_msgs[1:],
            max_tokens=200, model=settings.DEEPSEEK_MODEL_LITE, json_mode=True,
        )
        classified = extract_json(classify_raw)
    except LLMError as e:
        raise HTTPException(status_code=500, detail=f"質問の分類に失敗しました: {e}") from e

    category = _resolve_category(db, creator_id, classified.get("category_name", ""))
    message_type = classified.get("message_type", "content")

    recent_questions = db.query(Question).filter(
        Question.user_id == current_user.id, Question.course_id == course_id,
    ).order_by(Question.created_at.desc()).limit(5).all()
    recent_questions = list(reversed(recent_questions))
    conversation_history: list[dict] = []
    for rq in recent_questions:
        conversation_history.append({"role": "user", "content": rq.body})
        if rq.answers:
            conversation_history.append({"role": "assistant", "content": rq.answers[-1].body})

    linked_content = db.query(CategoryContent).filter(CategoryContent.category_id == category.id).first() if category and category.status == "approved" else None

    question = Question(
        user_id=current_user.id, course_id=course_id, tier=tier, body=data.body,
        category_id=category.id if category else None, status="pending",
    )
    db.add(question)
    db.commit()
    db.refresh(question)
    question_id = question.id

    system_prompt = prompts.build_answer_system(personality, message_type, tone_profile)
    messages_list = prompts.build_answer_messages(
        data.body, linked_content.title if linked_content else None,
        linked_content.url if linked_content else None,
        today_tasks, recent_summaries, conversation_history,
    )
    answer_model = prompts.select_answer_model(message_type, data.body, settings.DEEPSEEK_MODEL_LITE, settings.DEEPSEEK_MODEL)
    user_id = current_user.id
    is_daily_close = prompts.is_daily_close_signal(data.body)
    category_id_for_frustration = category.id if (category and category.status == "approved" and tier == "A") else None

    def generate():
        chunks: list[str] = []
        try:
            for chunk in stream_text(system_prompt, messages_list, max_tokens=400, model=answer_model):
                chunks.append(chunk)
                yield f"data: {json_lib.dumps({'delta': chunk})}\n\n"
        except LLMError as e:
            yield f"data: {json_lib.dumps({'error': str(e)})}\n\n"
            return

        full_text = "".join(chunks)
        frustration_signal = None
        with SessionLocal() as gen_db:
            q = gen_db.query(Question).filter(Question.id == question_id).first()
            if q:
                q.status = "answered_by_ai"
                gen_db.add(Answer(question_id=question_id, answered_by="ai", body=full_text, is_draft=False,
                                  linked_content_url=linked_content.url if linked_content else None))
                gen_db.commit()
            if is_daily_close:
                _generate_and_save_daily_summary(gen_db, user_id, course_id, day_number)
            if category_id_for_frustration:
                cat = gen_db.query(QuestionCategory).filter(QuestionCategory.id == category_id_for_frustration).first()
                if cat:
                    frustration_signal = _detect_frustration(gen_db, user_id, course_id, cat)

        yield f"data: {json_lib.dumps({'done': True, 'question_id': question_id, 'answer': full_text, 'frustration_signal': frustration_signal})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


@router.get("/{course_id}/history")
def get_chat_history(course_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """自分の質問・回答履歴を取得する。要(購入済み学習者)"""
    _get_accessible_course(db, course_id, current_user)
    questions = db.query(Question).filter(
        Question.user_id == current_user.id, Question.course_id == course_id
    ).order_by(Question.created_at).all()
    return [_serialize_question(q) for q in questions]


@router.get("/{course_id}/today-message")
def get_today_message(course_id: int, type: str = "morning", current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Layer3: 今日の朝/夜の声かけメッセージを都度生成する。type は 'morning' または 'evening'。要(購入済み学習者)"""
    if type not in ("morning", "evening"):
        raise HTTPException(status_code=400, detail="type は 'morning' または 'evening' を指定してください")
    course = _get_accessible_course(db, course_id, current_user)
    personality = _get_personality_profile(db, course) or {}
    day_number, today_tasks, recent_summaries = _get_today_context(db, current_user.id, course_id)
    try:
        message = generate_text(
            prompts.build_today_message_system(personality, type),
            prompts.build_today_message_user(day_number, today_tasks, recent_summaries),
            max_tokens=300,
            model=settings.DEEPSEEK_MODEL_LITE,
        )
    except LLMError as e:
        raise HTTPException(status_code=500, detail=f"メッセージの生成に失敗しました: {e}") from e
    return {"day_number": day_number, "type": type, "message": message}


@router.post("/{course_id}/daily-summary")
def post_daily_summary(course_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """当日のチャットログを圧縮してdaily_summariesに保存する。要(購入済み学習者)"""
    _get_accessible_course(db, course_id, current_user)
    day_number = _get_current_day_number(db, current_user.id, course_id)
    _generate_and_save_daily_summary(db, current_user.id, course_id, day_number)
    summary = db.query(DailySummary).filter(
        DailySummary.user_id == current_user.id, DailySummary.course_id == course_id, DailySummary.day_number == day_number,
    ).first()
    return {"day_number": day_number, "summary": summary.summary if summary else None}


def _get_own_creator_profile(db: Session, current_user) -> CreatorProfile:
    profile = db.query(CreatorProfile).filter(CreatorProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=403, detail="クリエイター権限が必要です")
    return profile


@router.get("/creator/pending")
def list_pending_questions(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Tier Bの未回答質問一覧（AI下書き付き）。24時間以上未対応のものは is_overdue=true。要(クリエイター本人)"""
    from datetime import datetime, timezone, timedelta
    profile = _get_own_creator_profile(db, current_user)
    questions = db.query(Question).join(Course, Question.course_id == Course.id).join(
        Character, Course.character_id == Character.id
    ).filter(
        Question.status == "pending_instructor",
        Character.creator_id == profile.id,
    ).order_by(Question.created_at).all()
    now = datetime.now(timezone.utc)
    result = []
    for q in questions:
        draft = q.answers[-1] if q.answers else None
        created_at = q.created_at if q.created_at.tzinfo else q.created_at.replace(tzinfo=timezone.utc)
        result.append({
            "id": q.id,
            "body": q.body,
            "category": q.category.name if q.category else None,
            "created_at": q.created_at,
            "is_overdue": (now - created_at) >= timedelta(hours=24),
            "ai_draft": draft.body if draft else None,
        })
    # 24時間超過のものをログイン直後に最優先で目に入るよう先頭に並べる（G-04: Tier B回答状況監視）
    result.sort(key=lambda r: (not r["is_overdue"], r["created_at"]))
    return result


@router.get("/creator/pending/overdue-count")
def get_pending_overdue_count(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """24時間以上未対応のTier B質問数。ダッシュボードでのログイン直後の優先通知バッジに使う。要(クリエイター本人)"""
    from datetime import datetime, timezone, timedelta
    profile = _get_own_creator_profile(db, current_user)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    count = db.query(Question).join(Course, Question.course_id == Course.id).join(
        Character, Course.character_id == Character.id
    ).filter(
        Question.status == "pending_instructor",
        Character.creator_id == profile.id,
        Question.created_at <= cutoff,
    ).count()
    return {"overdue_count": count}


class RespondRequest(BaseModel):
    body: Optional[str] = None  # 未指定ならAI下書きをそのまま送信（承認）。指定すれば編集して送信


@router.post("/creator/questions/{question_id}/respond")
def respond_to_question(question_id: int, data: RespondRequest, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """講師がTier Bの質問に回答する（AI下書きの承認、または編集して承認）。要(クリエイター本人)"""
    from datetime import datetime, timezone
    profile = _get_own_creator_profile(db, current_user)
    question = db.query(Question).join(Course, Question.course_id == Course.id).join(
        Character, Course.character_id == Character.id
    ).filter(
        Question.id == question_id,
        Question.status == "pending_instructor",
        Character.creator_id == profile.id,
    ).first()
    if not question:
        raise HTTPException(status_code=404, detail="質問が見つかりません")

    draft = question.answers[-1] if question.answers else None
    final_body = data.body if data.body else (draft.body if draft else "")
    if not final_body:
        raise HTTPException(status_code=400, detail="回答内容を入力してください")

    if draft and draft.is_draft:
        draft.body = final_body
        draft.answered_by = "instructor"
        draft.is_draft = False
        draft.sent_at = datetime.now(timezone.utc)
    else:
        db.add(Answer(question_id=question.id, answered_by="instructor", body=final_body, is_draft=False, sent_at=datetime.now(timezone.utc)))

    question.status = "answered_by_instructor"
    db.commit()
    db.refresh(question)
    return _serialize_question(question)


@router.get("/creator/analytics")
def get_question_analytics(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """質問分析ダッシュボード：カテゴリ別ランキングと紐付けコンテンツの状況。承認済みカテゴリのみ対象。要(クリエイター本人)"""
    profile = _get_own_creator_profile(db, current_user)
    categories = db.query(QuestionCategory).filter(
        QuestionCategory.creator_id == profile.id, QuestionCategory.status == "approved"
    ).all()
    result = []
    for c in categories:
        result.append({
            "id": c.id,
            "name": c.name,
            "question_count": len(c.questions),
            "contents": [{"id": ct.id, "content_type": ct.content_type, "title": ct.title, "url": ct.url} for ct in c.contents],
        })
    result.sort(key=lambda x: x["question_count"], reverse=True)
    return result


@router.get("/creator/categories/pending")
def list_pending_categories(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """AIが提案した新規カテゴリ候補の一覧（未承認）。要(クリエイター本人)"""
    profile = _get_own_creator_profile(db, current_user)
    categories = db.query(QuestionCategory).filter(
        QuestionCategory.creator_id == profile.id, QuestionCategory.status == "pending"
    ).order_by(QuestionCategory.created_at.desc()).all()
    return [
        {"id": c.id, "name": c.name, "question_count": len(c.questions), "created_at": c.created_at}
        for c in categories
    ]


@router.put("/creator/categories/{category_id}/approve")
def approve_category(category_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """新規カテゴリ候補を承認する。承認後はコンテンツ紐付け・フラストレーション検知の対象になる。要(クリエイター本人)"""
    profile = _get_own_creator_profile(db, current_user)
    category = db.query(QuestionCategory).filter(
        QuestionCategory.id == category_id, QuestionCategory.creator_id == profile.id
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="カテゴリが見つかりません")
    category.status = "approved"
    db.commit()
    return {"id": category.id, "name": category.name, "status": category.status}


@router.put("/creator/categories/{category_id}/reject")
def reject_category(category_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """新規カテゴリ候補を却下する。既存の質問への紐付けは残るが、コンテンツ紐付け・分析対象からは外れる。要(クリエイター本人)"""
    profile = _get_own_creator_profile(db, current_user)
    category = db.query(QuestionCategory).filter(
        QuestionCategory.id == category_id, QuestionCategory.creator_id == profile.id
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="カテゴリが見つかりません")
    category.status = "rejected"
    db.commit()
    return {"id": category.id, "name": category.name, "status": category.status}


@router.get("/creator/categories/{category_id}/questions")
def get_category_questions(category_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """カテゴリ別の実際の質問文一覧。要(クリエイター本人)"""
    profile = _get_own_creator_profile(db, current_user)
    category = db.query(QuestionCategory).filter(
        QuestionCategory.id == category_id, QuestionCategory.creator_id == profile.id
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="カテゴリが見つかりません")
    return [{"id": q.id, "body": q.body, "created_at": q.created_at} for q in category.questions]


class ContentCreate(BaseModel):
    content_type: str  # video / article / pdf
    title: str
    url: str


@router.post("/creator/categories/{category_id}/contents", status_code=201)
def add_category_content(category_id: int, data: ContentCreate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """質問カテゴリにコンテンツ（動画・記事・PDF）を紐付ける。要(クリエイター本人)"""
    profile = _get_own_creator_profile(db, current_user)
    category = db.query(QuestionCategory).filter(
        QuestionCategory.id == category_id, QuestionCategory.creator_id == profile.id
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="カテゴリが見つかりません")
    if data.content_type not in ("video", "article", "pdf"):
        raise HTTPException(status_code=400, detail="content_type は 'video' / 'article' / 'pdf' のいずれかを指定してください")

    content = CategoryContent(category_id=category_id, content_type=data.content_type, title=data.title, url=data.url)
    db.add(content)
    db.commit()
    db.refresh(content)
    return {"id": content.id, "content_type": content.content_type, "title": content.title, "url": content.url}


@router.delete("/creator/contents/{content_id}", status_code=204)
def delete_category_content(content_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """コンテンツ紐付けを削除する。要(クリエイター本人)"""
    profile = _get_own_creator_profile(db, current_user)
    content = db.query(CategoryContent).join(QuestionCategory).filter(
        CategoryContent.id == content_id, QuestionCategory.creator_id == profile.id
    ).first()
    if not content:
        raise HTTPException(status_code=404, detail="コンテンツが見つかりません")
    db.delete(content)
    db.commit()
