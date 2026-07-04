import json as json_lib
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db, SessionLocal
from app.core.security import get_current_creator_or_admin
from app.core.llm import generate_text, stream_text, extract_json, LLMError
from app.core import studio_prompts as prompts
from app.models.content_draft import ContentDraft
from app.models.character import Character
from app.models.creator_profile import CreatorProfile

router = APIRouter(prefix="/studio", tags=["AIコンテンツ生成スタジオ"])


def _get_own_creator_profile_id(db: Session, current_user) -> Optional[int]:
    """現在のクリエイターに紐づくcreator_profiles.idを返す。adminでプロフィールが無い場合はNoneを返す。"""
    profile = db.query(CreatorProfile).filter(CreatorProfile.user_id == current_user.id).first()
    if profile:
        return profile.id
    if current_user.role == "admin":
        return None
    raise HTTPException(status_code=400, detail="クリエイタープロフィールが見つかりません")


def _require_active_creator(db: Session, current_user) -> None:
    """コンテンツ生成(LLM呼び出しを伴う)は、運営の承認(status='active')が済んだクリエイターのみ利用できる。
    未承認の申請者がAPIコストを発生させ続けられる状態を防ぐ。"""
    if current_user.role == "admin":
        return
    profile = db.query(CreatorProfile).filter(CreatorProfile.user_id == current_user.id).first()
    if not profile or profile.status != "active":
        raise HTTPException(status_code=403, detail="クリエイター申請が承認されるまでコンテンツ生成は利用できません")


def _get_owned_character(db: Session, character_id: int, current_user) -> Character:
    char = db.query(Character).filter(Character.id == character_id).first()
    if not char:
        raise HTTPException(status_code=404, detail="キャラクターが見つかりません")
    if current_user.role != "admin":
        profile = db.query(CreatorProfile).filter(CreatorProfile.user_id == current_user.id).first()
        if not profile or char.creator_id != profile.id:
            raise HTTPException(status_code=403, detail="このキャラクターを編集する権限がありません")
    return char


def _get_owned_draft(db: Session, draft_id: int, current_user) -> ContentDraft:
    draft = db.query(ContentDraft).filter(ContentDraft.id == draft_id).first()
    if not draft:
        raise HTTPException(status_code=404, detail="下書きが見つかりません")
    if current_user.role != "admin":
        profile = db.query(CreatorProfile).filter(CreatorProfile.user_id == current_user.id).first()
        if not profile or draft.creator_id != profile.id:
            raise HTTPException(status_code=403, detail="この下書きを操作する権限がありません")
    return draft


# ── Step 0: キャラクター設定生成 ──────────────────────────────

class CharacterConceptRequest(BaseModel):
    character_concept: str


@router.post("/generate/character")
def generate_character_concept(
    data: CharacterConceptRequest,
    current_user=Depends(get_current_creator_or_admin),
):
    messages = prompts.build_character_concept_messages(data.character_concept)
    last_error: LLMError | None = None
    for _ in range(2):  # DeepSeekがjson_mode指定でも稀に壊れたJSONを返すため1回だけ自動リトライ
        try:
            text = generate_text(prompts.CHARACTER_CONCEPT_SYSTEM, messages, max_tokens=1500, json_mode=True)
            return extract_json(text)
        except LLMError as e:
            last_error = e
    raise HTTPException(status_code=500, detail=str(last_error))


class ToneProfileRequest(BaseModel):
    name: str
    description: str = ""
    tone_profile: dict = {}


@router.post("/generate/tone-profile")
def generate_tone_profile(
    data: ToneProfileRequest,
    current_user=Depends(get_current_creator_or_admin),
):
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="キャラクター名を入力してください")
    messages = prompts.build_tone_profile_messages(data.name, data.description, data.tone_profile)
    last_error: LLMError | None = None
    for _ in range(2):
        try:
            text = generate_text(prompts.TONE_PROFILE_SYSTEM, messages, max_tokens=800, json_mode=True)
            return extract_json(text)
        except LLMError as e:
            last_error = e
    raise HTTPException(status_code=500, detail=str(last_error))


# ── 新スタジオ: アイデア提案 ──────────────────────────────────

class IdeasRequest(BaseModel):
    format: str
    character_id: int
    duration_sec: Optional[int] = None
    char_limit: Optional[int] = None


@router.post("/ideas")
def generate_ideas(data: IdeasRequest, current_user=Depends(get_current_creator_or_admin), db: Session = Depends(get_db)):
    _require_active_creator(db, current_user)
    character = _get_owned_character(db, data.character_id, current_user)
    from app.core.character_voice import render_tone_profile
    tone_block = render_tone_profile(character.tone_profile or {}) or "(口調設定未登録)"
    format_label = prompts.FORMAT_LABELS.get(data.format, data.format)
    constraint = prompts.get_format_constraint(data.format, data.duration_sec, data.char_limit)
    try:
        text = generate_text(prompts.IDEAS_SYSTEM, prompts.build_ideas_messages(format_label, constraint, tone_block), max_tokens=600, json_mode=True)
        return extract_json(text)
    except LLMError as e:
        raise HTTPException(status_code=500, detail=str(e))


class AnglesRequest(BaseModel):
    idea_title: str
    idea_hook: str
    format: str
    character_id: int


@router.post("/angles")
def generate_angles(data: AnglesRequest, current_user=Depends(get_current_creator_or_admin), db: Session = Depends(get_db)):
    _require_active_creator(db, current_user)
    format_label = prompts.FORMAT_LABELS.get(data.format, data.format)
    try:
        text = generate_text(prompts.ANGLES_SYSTEM, prompts.build_angles_messages(data.idea_title, data.idea_hook, format_label), max_tokens=400, json_mode=True)
        return extract_json(text)
    except LLMError as e:
        raise HTTPException(status_code=500, detail=str(e))


class GenerateContentRequest(BaseModel):
    character_id: int
    format: str
    idea: str
    hook: str
    duration_sec: Optional[int] = None
    char_limit: Optional[int] = None


@router.post("/generate/content")
def generate_content(data: GenerateContentRequest, current_user=Depends(get_current_creator_or_admin), db: Session = Depends(get_db)):
    """フォーマット別コンテンツ生成：素材生成→口調変換を1ストリームで返す。"""
    _require_active_creator(db, current_user)
    character = _get_owned_character(db, data.character_id, current_user)
    creator_id = _get_own_creator_profile_id(db, current_user)

    raw_system = prompts.build_format_content_system(data.format, data.duration_sec, data.char_limit)
    raw_messages = [{"role": "user", "content": f"テーマ: {data.idea}\n切り口・フック: {data.hook}"}]

    voiced_system = prompts.build_voiced_content_system(character)

    draft = ContentDraft(creator_id=creator_id, theme=data.idea, structure=[], target_level=data.format)
    db.add(draft)
    db.commit()
    db.refresh(draft)
    draft_id = draft.id

    def _stream():
        raw_chunks: list[str] = []
        yield "data: {\"phase\": \"raw\"}\n\n"
        try:
            for chunk in stream_text(raw_system, raw_messages, max_tokens=1500):
                raw_chunks.append(chunk)
                yield f"data: {json_lib.dumps({'delta': chunk, 'phase': 'raw'})}\n\n"
        except LLMError as e:
            yield f"data: {json_lib.dumps({'error': str(e)})}\n\n"
            return

        raw_text = "".join(raw_chunks)
        yield "data: {\"phase\": \"voiced\"}\n\n"
        voiced_chunks: list[str] = []
        try:
            for chunk in stream_text(voiced_system, prompts.build_voiced_content_messages(raw_text), max_tokens=1500):
                voiced_chunks.append(chunk)
                yield f"data: {json_lib.dumps({'delta': chunk, 'phase': 'voiced'})}\n\n"
        except LLMError as e:
            yield f"data: {json_lib.dumps({'error': str(e)})}\n\n"
            return

        voiced_text = "".join(voiced_chunks)
        with SessionLocal() as gen_db:
            d = gen_db.query(ContentDraft).filter(ContentDraft.id == draft_id).first()
            if d:
                d.raw_content = raw_text
                d.voiced_content = voiced_text
                d.character_id = character.id
                gen_db.commit()

        yield f"data: {json_lib.dumps({'done': True, 'draft_id': draft_id})}\n\n"

    return StreamingResponse(_stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


# ── Step 1: コンテンツ相談（旧フロー・後方互換） ─────────────────

class ConsultRequest(BaseModel):
    theme: str


@router.post("/consult")
def consult(
    data: ConsultRequest,
    current_user=Depends(get_current_creator_or_admin),
    db: Session = Depends(get_db),
):
    _require_active_creator(db, current_user)
    try:
        text = generate_text(prompts.CONSULT_SYSTEM, prompts.build_consult_messages(data.theme), json_mode=True)
        return extract_json(text)
    except LLMError as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Step 2: 素材生成(ストリーミング) ──────────────────────────

class GenerateRawRequest(BaseModel):
    theme: str
    structure: list[str]
    target_level: Optional[str] = None


@router.post("/generate/raw")
def generate_raw(
    data: GenerateRawRequest,
    current_user=Depends(get_current_creator_or_admin),
    db: Session = Depends(get_db),
):
    _require_active_creator(db, current_user)
    creator_id = _get_own_creator_profile_id(db, current_user)
    draft = ContentDraft(
        creator_id=creator_id,
        theme=data.theme,
        structure=data.structure,
        target_level=data.target_level,
    )
    db.add(draft)
    db.commit()
    db.refresh(draft)
    draft_id = draft.id

    def _stream():
        chunks: list[str] = []
        try:
            for chunk in stream_text(
                prompts.RAW_CONTENT_SYSTEM,
                prompts.build_raw_content_messages(data.theme, data.structure, data.target_level),
            ):
                chunks.append(chunk)
                yield chunk
        except LLMError as e:
            yield f"\n[ERROR] {e}"
            return
        finally:
            full_text = "".join(chunks)
            if full_text:
                draft_db = db.query(ContentDraft).filter(ContentDraft.id == draft_id).first()
                if draft_db:
                    draft_db.raw_content = full_text
                    db.commit()
            db.close()

    return StreamingResponse(_stream(), media_type="text/event-stream", headers={"X-Draft-Id": str(draft_id)})


# ── Step 3: 口調変換(ストリーミング) ──────────────────────────

class GenerateVoicedRequest(BaseModel):
    draft_id: int
    character_id: int


@router.post("/generate/voiced")
def generate_voiced(
    data: GenerateVoicedRequest,
    current_user=Depends(get_current_creator_or_admin),
    db: Session = Depends(get_db),
):
    _require_active_creator(db, current_user)
    draft = _get_owned_draft(db, data.draft_id, current_user)
    character = _get_owned_character(db, data.character_id, current_user)
    if not draft.raw_content:
        raise HTTPException(status_code=400, detail="この下書きにはまだ素材生成結果がありません")

    draft.character_id = character.id
    db.commit()
    draft_id = draft.id
    system_prompt = prompts.build_voiced_content_system(character)
    messages = prompts.build_voiced_content_messages(draft.raw_content)

    def _stream():
        chunks: list[str] = []
        try:
            for chunk in stream_text(system_prompt, messages):
                chunks.append(chunk)
                yield chunk
        except LLMError as e:
            yield f"\n[ERROR] {e}"
            return
        finally:
            full_text = "".join(chunks)
            if full_text:
                draft_db = db.query(ContentDraft).filter(ContentDraft.id == draft_id).first()
                if draft_db:
                    draft_db.voiced_content = full_text
                    db.commit()
            db.close()

    return StreamingResponse(_stream(), media_type="text/event-stream")


# ── Step 4: 台本生成(ストリーミング・オプション) ──────────────

class GenerateScriptRequest(BaseModel):
    draft_id: int
    character_id: int


@router.post("/generate/script")
def generate_script(
    data: GenerateScriptRequest,
    current_user=Depends(get_current_creator_or_admin),
    db: Session = Depends(get_db),
):
    _require_active_creator(db, current_user)
    draft = _get_owned_draft(db, data.draft_id, current_user)
    _get_owned_character(db, data.character_id, current_user)
    if not draft.voiced_content:
        raise HTTPException(status_code=400, detail="この下書きにはまだ口調変換結果がありません")

    draft_id = draft.id
    messages = prompts.build_script_messages(draft.voiced_content)

    def _stream():
        chunks: list[str] = []
        try:
            for chunk in stream_text(prompts.SCRIPT_SYSTEM, messages):
                chunks.append(chunk)
                yield chunk
        except LLMError as e:
            yield f"\n[ERROR] {e}"
            return
        finally:
            full_text = "".join(chunks)
            if full_text:
                draft_db = db.query(ContentDraft).filter(ContentDraft.id == draft_id).first()
                if draft_db:
                    draft_db.script_content = full_text
                    db.commit()
            db.close()

    return StreamingResponse(_stream(), media_type="text/event-stream")


# ── 下書き一覧・削除 ──────────────────────────────────────────

@router.get("/drafts")
def list_drafts(
    current_user=Depends(get_current_creator_or_admin),
    db: Session = Depends(get_db),
):
    creator_id = _get_own_creator_profile_id(db, current_user)
    query = db.query(ContentDraft)
    query = query.filter(ContentDraft.creator_id == creator_id) if creator_id is not None else query.filter(ContentDraft.creator_id.is_(None))
    drafts = query.order_by(ContentDraft.updated_at.desc()).all()
    return [
        {
            "id": d.id,
            "theme": d.theme,
            "structure": d.structure,
            "target_level": d.target_level,
            "character_id": d.character_id,
            "has_raw": bool(d.raw_content),
            "has_voiced": bool(d.voiced_content),
            "has_script": bool(d.script_content),
            "updated_at": d.updated_at,
        }
        for d in drafts
    ]


@router.get("/drafts/{draft_id}")
def get_draft(
    draft_id: int,
    current_user=Depends(get_current_creator_or_admin),
    db: Session = Depends(get_db),
):
    draft = _get_owned_draft(db, draft_id, current_user)
    return {
        "id": draft.id,
        "theme": draft.theme,
        "structure": draft.structure,
        "target_level": draft.target_level,
        "character_id": draft.character_id,
        "raw_content": draft.raw_content,
        "voiced_content": draft.voiced_content,
        "script_content": draft.script_content,
    }


@router.delete("/drafts/{draft_id}")
def delete_draft(
    draft_id: int,
    current_user=Depends(get_current_creator_or_admin),
    db: Session = Depends(get_db),
):
    draft = _get_owned_draft(db, draft_id, current_user)
    db.delete(draft)
    db.commit()
    return {"message": "削除しました"}
