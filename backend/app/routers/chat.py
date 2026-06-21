from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.llm import generate_text, extract_json, LLMError
from app.core.rate_limit import enforce_daily_message_limit
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
from app.routers.courses import _is_accessible

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
    if not creator_id or not category_name:
        return None
    existing = db.query(QuestionCategory).filter(
        QuestionCategory.creator_id == creator_id, QuestionCategory.name == category_name
    ).first()
    if existing:
        return existing
    category = QuestionCategory(creator_id=creator_id, name=category_name, keywords=[])
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
    """直近7日間で同一カテゴリへの質問がFRUSTRATION_THRESHOLD回以上続いていれば検知する（事業検証ポイント①）。"""
    if not category:
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

    enforce_daily_message_limit(current_user.id, course_id)

    tier = _get_tier(db, course, current_user)
    creator_id = course.character.creator_id if course.character else None

    # Tier Bは1日1回まで講師へ届く。2回目以降はAIが自動回答（Tier Aと同じフロー）
    route_to_instructor = tier == "B" and not _today_questions_used_by_tier_b(db, current_user.id, course_id)

    personality = _get_personality_profile(db, course) or {}
    existing_category_names = [
        c.name for c in db.query(QuestionCategory).filter(QuestionCategory.creator_id == creator_id).all()
    ] if creator_id else []

    try:
        classify_raw = generate_text(
            prompts.CLASSIFY_SYSTEM,
            prompts.build_classify_messages(data.body, existing_category_names),
            max_tokens=200,
            model=settings.ANTHROPIC_MODEL_HAIKU,
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
        linked_content = db.query(CategoryContent).filter(CategoryContent.category_id == category.id).first() if category else None
        try:
            draft_body = generate_text(
                prompts.build_answer_system(personality, message_type),
                prompts.build_answer_messages(data.body, linked_content.title if linked_content else None, linked_content.url if linked_content else None),
                max_tokens=400,
                model=settings.ANTHROPIC_MODEL,
            )
        except LLMError as e:
            raise HTTPException(status_code=500, detail=f"下書き回答の生成に失敗しました: {e}") from e
        db.add(Answer(question_id=question.id, answered_by="ai", body=draft_body, linked_content_url=linked_content.url if linked_content else None, is_draft=True))
        db.commit()
        db.refresh(question)
        _notify_creator_of_pending_question(db, course, data.body)
        return _serialize_question(question)

    # Tier A（またはTier Bの2回目以降）：AIが自動回答。
    # 学習内容・感情系の相談はSonnet、状況報告等の定型応答はHaiku（設計書2.5節のモデル使い分け方針）
    linked_content = db.query(CategoryContent).filter(CategoryContent.category_id == category.id).first() if category else None
    answer_model = prompts.select_answer_model(message_type, data.body, settings.ANTHROPIC_MODEL_HAIKU, settings.ANTHROPIC_MODEL)
    try:
        answer_body = generate_text(
            prompts.build_answer_system(personality, message_type),
            prompts.build_answer_messages(data.body, linked_content.title if linked_content else None, linked_content.url if linked_content else None),
            max_tokens=400,
            model=answer_model,
        )
    except LLMError as e:
        raise HTTPException(status_code=500, detail=f"回答の生成に失敗しました: {e}") from e

    question.status = "answered_by_ai"
    db.add(Answer(question_id=question.id, answered_by="ai", body=answer_body, linked_content_url=linked_content.url if linked_content else None, is_draft=False))
    db.commit()
    db.refresh(question)

    # Tier A学習者が同一トピックで繰り返し質問している場合、Tier Bアップグレードを提案する（事業検証ポイント①）
    frustration_signal = _detect_frustration(db, current_user.id, course_id, category) if tier == "A" else None
    return _serialize_question(question, frustration_signal)


@router.get("/{course_id}/history")
def get_chat_history(course_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """自分の質問・回答履歴を取得する。要(購入済み学習者)"""
    _get_accessible_course(db, course_id, current_user)
    questions = db.query(Question).filter(
        Question.user_id == current_user.id, Question.course_id == course_id
    ).order_by(Question.created_at).all()
    return [_serialize_question(q) for q in questions]


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
    return result


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
    """質問分析ダッシュボード：カテゴリ別ランキングと紐付けコンテンツの状況。要(クリエイター本人)"""
    profile = _get_own_creator_profile(db, current_user)
    categories = db.query(QuestionCategory).filter(QuestionCategory.creator_id == profile.id).all()
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
