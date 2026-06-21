import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import Optional
from app.core.database import get_db
from app.core.security import get_current_user, get_current_creator_or_admin
from app.core.uploads import validate_image_content
from app.core.llm import generate_text, LLMError
from app.core import studio_prompts as prompts
from app.models.character import Character
from app.models.customer import Customer
from app.models.creator_profile import CreatorProfile
from pydantic import BaseModel

router = APIRouter(prefix="/characters", tags=["キャラクター管理"])

# 画像保存先（main.py で /static にマウントされているディレクトリ配下）
_IMAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static", "character_images")
os.makedirs(_IMAGE_DIR, exist_ok=True)
_ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".webp"}
_MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB

class CharacterCreate(BaseModel):
    name: str
    description: Optional[str] = None
    tone_profile: Optional[dict] = None
    color_scheme: Optional[dict] = None
    font_style: Optional[str] = None
    creator_id: Optional[int] = None

def _get_own_creator_profile(db: Session, current_user) -> Optional[CreatorProfile]:
    return db.query(CreatorProfile).filter(CreatorProfile.user_id == current_user.id).first()


def _get_owned_character(db: Session, character_id: int, current_user) -> Character:
    char = db.query(Character).filter(Character.id == character_id).first()
    if not char:
        raise HTTPException(status_code=404, detail="キャラクターが見つかりません")
    if current_user.role != "admin":
        profile = _get_own_creator_profile(db, current_user)
        if not profile or char.creator_id != profile.id:
            raise HTTPException(status_code=403, detail="このキャラクターを編集する権限がありません")
    return char


@router.get("/")
def list_characters(current_user=Depends(get_current_creator_or_admin), db: Session = Depends(get_db)):
    """管理者は全キャラクター、クリエイターは自分の所有キャラクターのみ一覧表示する"""
    if current_user.role == "admin":
        return db.query(Character).all()
    profile = _get_own_creator_profile(db, current_user)
    if not profile:
        return []
    return db.query(Character).filter(Character.creator_id == profile.id).all()


@router.get("/{character_id}")
def get_character(character_id: int, current_user=Depends(get_current_creator_or_admin), db: Session = Depends(get_db)):
    return _get_owned_character(db, character_id, current_user)

@router.get("/theme/{character_id}")
def get_character_theme(
    character_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """顧客向け: キャラクターのテーマ情報のみ返す（tone_profileは返さない）"""
    char = db.query(Character).filter(Character.id == character_id).first()
    if not char:
        raise HTTPException(status_code=404, detail="キャラクターが見つかりません")
    return {
        "id": char.id,
        "name": char.name,
        "description": char.description,
        "image_url": char.image_url,
        "color_scheme": char.color_scheme,
        "font_style": char.font_style,
        "creator_id": char.creator_id,
    }

@router.post("/", status_code=201)
def create_character(data: CharacterCreate, current_user=Depends(get_current_creator_or_admin), db: Session = Depends(get_db)):
    payload = data.model_dump()
    if current_user.role != "admin":
        profile = _get_own_creator_profile(db, current_user)
        if not profile:
            raise HTTPException(status_code=400, detail="クリエイタープロフィールが見つかりません")
        payload["creator_id"] = profile.id
    char = Character(**payload)
    db.add(char)
    db.commit()
    db.refresh(char)
    return char

class CharacterUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    tone_profile: Optional[dict] = None
    color_scheme: Optional[dict] = None
    font_style: Optional[str] = None
    creator_id: Optional[int] = None

@router.patch("/{character_id}")
def update_character(character_id: int, data: CharacterUpdate, current_user=Depends(get_current_creator_or_admin), db: Session = Depends(get_db)):
    char = _get_owned_character(db, character_id, current_user)
    payload = data.model_dump(exclude_none=True)
    if current_user.role != "admin":
        payload.pop("creator_id", None)  # クリエイターは所有権の付け替え不可
    for key, val in payload.items():
        setattr(char, key, val)
    db.commit()
    db.refresh(char)
    return char


class PreviewRequest(BaseModel):
    sample_text: str


@router.post("/{character_id}/preview")
def preview_character_voice(character_id: int, data: PreviewRequest, current_user=Depends(get_current_creator_or_admin), db: Session = Depends(get_db)):
    """キャラクタービルダーで、保存済みtone_profileを使った口調変換をリアルタイムに確認する"""
    char = _get_owned_character(db, character_id, current_user)
    try:
        system_prompt = prompts.build_preview_system(char)
        previewed = generate_text(system_prompt, prompts.build_preview_messages(data.sample_text))
    except LLMError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"original": data.sample_text, "previewed": previewed}


@router.post("/{character_id}/image")
async def upload_character_image(
    character_id: int,
    file: UploadFile = File(...),
    current_user=Depends(get_current_creator_or_admin),
    db: Session = Depends(get_db),
):
    """AI生成したキャラクター画像をアップロードする（PNG/JPG/WEBP, 5MBまで）"""
    char = _get_owned_character(db, character_id, current_user)

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="対応形式は PNG / JPG / JPEG / WEBP のみです")

    contents = await file.read()
    if len(contents) > _MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="画像サイズは5MB以下にしてください")
    validate_image_content(contents, ext)

    # 古い画像があれば削除
    if char.image_url:
        old_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static", char.image_url.replace("/static/", "", 1))
        if os.path.isfile(old_path):
            try:
                os.remove(old_path)
            except OSError:
                pass

    filename = f"character_{character_id}_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(_IMAGE_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(contents)

    char.image_url = f"/static/character_images/{filename}"
    db.commit()
    db.refresh(char)
    return {"message": "画像をアップロードしました", "image_url": char.image_url}

@router.delete("/{character_id}/image")
def delete_character_image(character_id: int, current_user=Depends(get_current_creator_or_admin), db: Session = Depends(get_db)):
    """キャラクター画像を削除する"""
    char = _get_owned_character(db, character_id, current_user)
    if char.image_url:
        old_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static", char.image_url.replace("/static/", "", 1))
        if os.path.isfile(old_path):
            try:
                os.remove(old_path)
            except OSError:
                pass
        char.image_url = None
        db.commit()
    return {"message": "画像を削除しました"}

@router.delete("/{character_id}")
def delete_character(character_id: int, current_user=Depends(get_current_creator_or_admin), db: Session = Depends(get_db)):
    char = _get_owned_character(db, character_id, current_user)

    # まだ割り当てられている顧客がいる場合、外部キー制約で500エラーになっていた問題を解消するため、
    # 事前にチェックして分かりやすいエラーメッセージを返す
    assigned_count = db.query(Customer).filter(Customer.character_id == character_id).count()
    if assigned_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"このキャラクターは現在 {assigned_count} 名の顧客に割り当てられているため削除できません。",
        )

    db.delete(char)
    db.commit()
    return {"message": "削除しました"}
