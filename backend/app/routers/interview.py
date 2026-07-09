from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_creator_or_admin
from app.core.llm import generate_text, extract_json, LLMError
from app.core import personality_prompts as prompts
from app.core.character_voice import customer_display_name, sanitize_tone_profile_fields
from app.models.creator_profile import CreatorProfile
from app.models.interview_session import InterviewSession
from app.models.personality_profile import PersonalityProfile
from app.models.character import Character

router = APIRouter(prefix="/interview", tags=["AIインタビュー（人格収集）"])


def _get_own_creator_profile(db: Session, current_user) -> CreatorProfile:
    profile = db.query(CreatorProfile).filter(CreatorProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=400, detail="先にクリエイター申請を行ってください")
    return profile


BASE_TYPES = ("共感型", "指導型", "激励型", "厳格型")
GENDERS = ("男性", "女性", "中性的")


class InterviewStartRequest(BaseModel):
    base_type: Optional[str] = None
    gender: Optional[str] = None
    subject: Optional[str] = None


@router.post("/start")
def start_interview(data: InterviewStartRequest = InterviewStartRequest(), current_user=Depends(get_current_creator_or_admin), db: Session = Depends(get_db)):
    """インタビューを開始（または途中保存から再開）し、現在出すべき質問を返す。

    base_typeはStep0で選んだ指導スタイルのプリセット（初回開始時のみ反映、再開時は無視）。
    subjectはコースのジャンル（english/it/music/japanese）。初回開始時のみ反映。
    """
    profile = _get_own_creator_profile(db, current_user)

    session = db.query(InterviewSession).filter(InterviewSession.creator_id == profile.id).first()
    subject = session.subject if session else data.subject
    fixed_qs = prompts.get_fixed_questions(subject)
    total_questions = len(fixed_qs)

    if session and session.status == "completed":
        return {"status": "completed", "question": None, "progress": {"current": total_questions, "total": total_questions}}

    if not session:
        if data.base_type and data.base_type not in BASE_TYPES:
            raise HTTPException(status_code=400, detail=f"base_typeは{BASE_TYPES}のいずれかを指定してください")
        if data.gender and data.gender not in GENDERS:
            raise HTTPException(status_code=400, detail=f"genderは{GENDERS}のいずれかを指定してください")
        session = InterviewSession(
            creator_id=profile.id,
            fixed_index=0,
            follow_up_count=0,
            pending_question=fixed_qs[0],
            qa_history=[],
            status="in_progress",
            base_type=data.base_type,
            gender=data.gender,
            subject=data.subject,
        )
        db.add(session)
        db.commit()
        db.refresh(session)

    return {
        "status": "in_progress",
        "question": session.pending_question,
        "progress": {"current": session.fixed_index + 1, "total": total_questions},
        "base_type": session.base_type,
    }


class InterviewAnswerRequest(BaseModel):
    answer: str


@router.post("/answer")
def submit_answer(data: InterviewAnswerRequest, current_user=Depends(get_current_creator_or_admin), db: Session = Depends(get_db)):
    """回答を送信し、深掘り質問が必要かをAIに判定させ、次の質問または完了を返す。"""
    profile = _get_own_creator_profile(db, current_user)
    session = db.query(InterviewSession).filter(InterviewSession.creator_id == profile.id).first()
    if not session or session.status == "completed":
        raise HTTPException(status_code=400, detail="進行中のインタビューがありません。/interview/start から開始してください")
    if not session.pending_question:
        raise HTTPException(status_code=400, detail="現在回答待ちの質問がありません")

    fixed_qs = prompts.get_fixed_questions(session.subject)
    total_questions = len(fixed_qs)

    history = list(session.qa_history or [])
    history.append({
        "question": session.pending_question,
        "answer": data.answer,
        "is_followup": session.fixed_index >= total_questions,
    })

    is_last_fixed_question = session.fixed_index == total_questions - 1
    can_follow_up = session.follow_up_count < prompts.MAX_FOLLOW_UPS

    next_question = None
    if can_follow_up:
        try:
            text = generate_text(
                prompts.build_follow_up_decision_system(session.subject),
                prompts.build_follow_up_decision_messages(session.pending_question, data.answer),
                max_tokens=300,
                json_mode=True,
            )
            decision = extract_json(text)
        except LLMError:
            decision = {"action": "next"}

        if decision.get("action") == "followup" and decision.get("question"):
            next_question = decision["question"]
            session.follow_up_count += 1

    if next_question:
        session.pending_question = next_question
        session.qa_history = history
        db.commit()
        return {
            "status": "in_progress",
            "question": next_question,
            "progress": {"current": session.fixed_index + 1, "total": total_questions},
        }

    # 深掘り不要、または深掘り上限に達した → 次の固定質問へ
    if is_last_fixed_question:
        session.status = "completed"
        session.pending_question = None
        session.qa_history = history
        db.commit()
        return {"status": "completed", "question": None, "progress": {"current": total_questions, "total": total_questions}}

    session.fixed_index += 1
    session.pending_question = fixed_qs[session.fixed_index]
    session.qa_history = history
    db.commit()
    return {
        "status": "in_progress",
        "question": session.pending_question,
        "progress": {"current": session.fixed_index + 1, "total": total_questions},
    }


@router.post("/generate-profile")
def generate_profile(current_user=Depends(get_current_creator_or_admin), db: Session = Depends(get_db)):
    """インタビューの全回答履歴から人格プロファイルをAI生成し、保存する。"""
    profile = _get_own_creator_profile(db, current_user)
    session = db.query(InterviewSession).filter(InterviewSession.creator_id == profile.id).first()
    if not session or session.status != "completed":
        raise HTTPException(status_code=400, detail="インタビューが完了していません")

    try:
        text = generate_text(
            prompts.build_profile_generation_system(session.subject),
            prompts.build_profile_generation_messages(session.qa_history or [], session.base_type, session.gender),
            max_tokens=1800,
            json_mode=True,
        )
        generated = extract_json(text)
    except LLMError as e:
        raise HTTPException(status_code=500, detail=str(e))

    sample_reply = generated.pop("sample_reply", None)
    tone_profile_data = generated.pop("tone_profile", None)

    personality = db.query(PersonalityProfile).filter(PersonalityProfile.creator_id == profile.id).first()
    if not personality:
        personality = PersonalityProfile(creator_id=profile.id)
        db.add(personality)
    personality.interview_answers = session.qa_history
    personality.profile = generated
    personality.base_type = session.base_type
    personality.gender = session.gender
    personality.sample_reply = sample_reply

    # 1クリエイター=1人格(キャラクター)。インタビュー完了時点でキャラクターが無ければ自動で作成する
    character = profile.character
    if not character:
        character = Character(name=customer_display_name(current_user), creator_id=profile.id)
        db.add(character)
    # インタビューで得たtone_profileをキャラクターに保存（チャットでの人格再現に使用）
    # AIの応答が文字列を期待するフィールド（reaction_patterns等）でdict/listを返すことがあるため、
    # 保存前に文字列へ矯正する（[object Object]表示バグの対策）
    if tone_profile_data:
        character.tone_profile = sanitize_tone_profile_fields(tone_profile_data)

    db.commit()
    db.refresh(personality)
    return {
        "profile": personality.profile,
        "interview_answers": personality.interview_answers,
        "base_type": personality.base_type,
        "gender": personality.gender,
        "sample_reply": personality.sample_reply,
        "tone_profile": character.tone_profile if character else None,
    }


@router.get("/profile")
def get_profile(current_user=Depends(get_current_creator_or_admin), db: Session = Depends(get_db)):
    profile = _get_own_creator_profile(db, current_user)
    personality = db.query(PersonalityProfile).filter(PersonalityProfile.creator_id == profile.id).first()
    if not personality:
        raise HTTPException(status_code=404, detail="人格プロファイルがまだ生成されていません")
    return {
        "profile": personality.profile,
        "interview_answers": personality.interview_answers,
        "base_type": personality.base_type,
        "gender": personality.gender,
        "sample_reply": personality.sample_reply,
    }


class ProfileUpdateRequest(BaseModel):
    profile: dict


@router.put("/profile")
def update_profile(data: ProfileUpdateRequest, current_user=Depends(get_current_creator_or_admin), db: Session = Depends(get_db)):
    """クリエイターによる人格プロファイルの手動修正。"""
    profile = _get_own_creator_profile(db, current_user)
    personality = db.query(PersonalityProfile).filter(PersonalityProfile.creator_id == profile.id).first()
    if not personality:
        raise HTTPException(status_code=404, detail="人格プロファイルがまだ生成されていません")
    personality.profile = data.profile
    db.commit()
    db.refresh(personality)
    return {
        "profile": personality.profile,
        "interview_answers": personality.interview_answers,
        "base_type": personality.base_type,
        "gender": personality.gender,
        "sample_reply": personality.sample_reply,
    }
