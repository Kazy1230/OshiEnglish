import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import Optional
from app.core.database import get_db
from app.core.security import get_current_admin, get_current_user
from app.models.character import Character
from app.models.customer import Customer
from app.models.article import Article
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
    greeting: Optional[str] = None
    greetings: Optional[list[str]] = None
    tone_profile: Optional[dict] = None
    color_scheme: Optional[dict] = None
    font_style: Optional[str] = None
    reward_progress_template: Optional[str] = None
    chat_footer_note: Optional[str] = None
    chat_error_message: Optional[str] = None
    instagram_account: Optional[str] = None
    is_preset: bool = False

@router.get("/")
def list_characters(admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    return db.query(Character).all()

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
        "greeting": char.greeting,
        "greetings": char.greetings,
        "image_url": char.image_url,
        "color_scheme": char.color_scheme,
        "font_style": char.font_style,
        "reward_progress_template": char.reward_progress_template,
        "chat_footer_note": char.chat_footer_note,
        "chat_error_message": char.chat_error_message,
        "instagram_account": char.instagram_account,
        "is_preset": char.is_preset,
    }

@router.post("/", status_code=201)
def create_character(data: CharacterCreate, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    char = Character(**data.model_dump())
    db.add(char)
    db.commit()
    db.refresh(char)
    return char

class CharacterUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    greeting: Optional[str] = None
    greetings: Optional[list[str]] = None
    image_url: Optional[str] = None
    tone_profile: Optional[dict] = None
    color_scheme: Optional[dict] = None
    font_style: Optional[str] = None
    reward_progress_template: Optional[str] = None
    chat_footer_note: Optional[str] = None
    chat_error_message: Optional[str] = None
    instagram_account: Optional[str] = None
    is_preset: Optional[bool] = None

@router.patch("/{character_id}")
def update_character(character_id: int, data: CharacterUpdate, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    char = db.query(Character).filter(Character.id == character_id).first()
    if not char:
        raise HTTPException(status_code=404, detail="キャラクターが見つかりません")
    for key, val in data.model_dump(exclude_none=True).items():
        setattr(char, key, val)
    db.commit()
    db.refresh(char)
    return char

@router.post("/{character_id}/image")
async def upload_character_image(
    character_id: int,
    file: UploadFile = File(...),
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """AI生成したキャラクター画像をアップロードする（PNG/JPG/WEBP, 5MBまで）"""
    char = db.query(Character).filter(Character.id == character_id).first()
    if not char:
        raise HTTPException(status_code=404, detail="キャラクターが見つかりません")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="対応形式は PNG / JPG / JPEG / WEBP のみです")

    contents = await file.read()
    if len(contents) > _MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="画像サイズは5MB以下にしてください")

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
def delete_character_image(character_id: int, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """キャラクター画像を削除する"""
    char = db.query(Character).filter(Character.id == character_id).first()
    if not char:
        raise HTTPException(status_code=404, detail="キャラクターが見つかりません")
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
def delete_character(character_id: int, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    char = db.query(Character).filter(Character.id == character_id).first()
    if not char:
        raise HTTPException(status_code=404, detail="キャラクターが見つかりません")

    # まだ割り当てられている顧客がいる場合、外部キー制約で500エラーになっていた問題を解消するため、
    # 事前にチェックして分かりやすいエラーメッセージを返す
    # （シミュレーションでデモキャラクターを削除しようとした際に実際に発生した不具合の修正）
    assigned_count = db.query(Customer).filter(Customer.character_id == character_id).count()
    if assigned_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"このキャラクターは現在 {assigned_count} 名の顧客に割り当てられているため削除できません。"
                   "先に顧客管理画面で担当キャラクターを変更してから削除してください。",
        )

    # 記事にも character_id FK があるため、記事が残っていると削除に失敗する
    article_count = db.query(Article).filter(Article.character_id == character_id).count()
    if article_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"このキャラクターには {article_count} 件の記事・演習問題が紐づいているため削除できません。"
                   "先に記事管理画面で該当記事をすべて削除するか、担当キャラクターを変更してから削除してください。",
        )

    db.delete(char)
    db.commit()
    return {"message": "削除しました"}
