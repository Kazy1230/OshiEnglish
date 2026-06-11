import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_admin, get_current_user
from app.core.intimacy import compute_intimacy_level
from app.core.rewards import get_article_request_count
from app.models.character import Character
from app.models.customer import Customer
from app.models.reward import RewardItem, CustomerReward

router = APIRouter(prefix="/rewards", tags=["報酬・ご褒美"])

_VALID_CATEGORIES = {"line", "title", "wallpaper"}
_VALID_TRIGGERS = {"intimacy", "article_count"}

_CATEGORY_LABELS = {
    "line": "隠しセリフ",
    "title": "称号",
    "wallpaper": "壁紙",
}

# 画像保存先（main.py で /static にマウントされているディレクトリ配下）
_IMAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static", "reward_images")
os.makedirs(_IMAGE_DIR, exist_ok=True)
_ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".webp"}
_MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB

# 隠しセリフ（category="line"）の登録上限数。公式キャラはオリジナルキャラより多く登録できる
_MAX_LINE_REWARDS_CUSTOM = 5
_MAX_LINE_REWARDS_PRESET = 15


def _validate_item(category: str, trigger_type: str, threshold: int):
    if category not in _VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail="category は 'line' / 'title' / 'wallpaper' のいずれかを指定してください")
    if trigger_type not in _VALID_TRIGGERS:
        raise HTTPException(status_code=400, detail="trigger_type は 'intimacy' / 'article_count' のいずれかを指定してください")
    if trigger_type == "intimacy" and not (1 <= threshold <= 5):
        raise HTTPException(status_code=400, detail="trigger_type が 'intimacy' の場合、threshold（到達親密度レベル）は1〜5で指定してください")
    if trigger_type == "article_count" and threshold < 1:
        raise HTTPException(status_code=400, detail="threshold（記事依頼回数）は1以上で指定してください")


def _serialize_item_admin(item: RewardItem) -> dict:
    return {
        "id": item.id,
        "character_id": item.character_id,
        "category": item.category,
        "category_label": _CATEGORY_LABELS.get(item.category, item.category),
        "trigger_type": item.trigger_type,
        "threshold": item.threshold,
        "text_content": item.text_content,
        "icon": item.icon,
        "image_url": item.image_url,
        "sort_order": item.sort_order,
        "official_only": item.official_only,
    }


# ===== 管理者向け：報酬コンテンツ管理 =====

class RewardItemCreate(BaseModel):
    character_id: int
    category: str
    trigger_type: str
    threshold: int
    text_content: Optional[str] = None
    icon: Optional[str] = None
    sort_order: int = 0
    official_only: bool = False


class RewardItemUpdate(BaseModel):
    category: Optional[str] = None
    trigger_type: Optional[str] = None
    threshold: Optional[int] = None
    text_content: Optional[str] = None
    icon: Optional[str] = None
    sort_order: Optional[int] = None
    official_only: Optional[bool] = None


@router.get("/admin/items", tags=["管理者"])
def admin_list_reward_items(
    character_id: Optional[int] = None,
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    q = db.query(RewardItem)
    if character_id is not None:
        q = q.filter(RewardItem.character_id == character_id)
    items = q.order_by(RewardItem.character_id, RewardItem.trigger_type, RewardItem.threshold, RewardItem.sort_order).all()
    return [_serialize_item_admin(i) for i in items]


@router.post("/admin/items", tags=["管理者"], status_code=201)
def admin_create_reward_item(data: RewardItemCreate, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    character = db.query(Character).filter(Character.id == data.character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="キャラクターが見つかりません")
    _validate_item(data.category, data.trigger_type, data.threshold)

    if data.category == "line":
        existing = db.query(func.count(RewardItem.id)).filter(
            RewardItem.character_id == data.character_id,
            RewardItem.category == "line",
        ).scalar() or 0
        limit = _MAX_LINE_REWARDS_PRESET if character.is_preset else _MAX_LINE_REWARDS_CUSTOM
        if existing >= limit:
            raise HTTPException(
                status_code=400,
                detail=f"隠しセリフはこのキャラクターにつき最大{limit}件まで登録できます。",
            )

    item = RewardItem(
        character_id=data.character_id,
        category=data.category,
        trigger_type=data.trigger_type,
        threshold=data.threshold,
        text_content=(data.text_content or "").strip() or None,
        icon=(data.icon or "").strip() or None,
        sort_order=data.sort_order,
        official_only=data.official_only,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_item_admin(item)


@router.patch("/admin/items/{item_id}", tags=["管理者"])
def admin_update_reward_item(item_id: int, data: RewardItemUpdate, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    item = db.query(RewardItem).filter(RewardItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="報酬が見つかりません")

    new_category = data.category if data.category is not None else item.category
    new_trigger = data.trigger_type if data.trigger_type is not None else item.trigger_type
    new_threshold = data.threshold if data.threshold is not None else item.threshold
    _validate_item(new_category, new_trigger, new_threshold)

    update = data.model_dump(exclude_none=True)
    if "text_content" in update:
        update["text_content"] = update["text_content"].strip() or None
    if "icon" in update:
        update["icon"] = update["icon"].strip() or None
    for key, val in update.items():
        setattr(item, key, val)
    db.commit()
    db.refresh(item)
    return _serialize_item_admin(item)


def _delete_image_file(image_url: Optional[str]):
    if not image_url:
        return
    path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static", image_url.replace("/static/", "", 1))
    if os.path.isfile(path):
        try:
            os.remove(path)
        except OSError:
            pass


@router.post("/admin/items/{item_id}/image", tags=["管理者"])
async def admin_upload_reward_image(
    item_id: int,
    file: UploadFile = File(...),
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """壁紙画像をアップロードする（PNG/JPG/WEBP, 5MBまで）"""
    item = db.query(RewardItem).filter(RewardItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="報酬が見つかりません")
    if item.category != "wallpaper":
        raise HTTPException(status_code=400, detail="画像登録は category='wallpaper' の報酬のみ対応しています")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="対応形式は PNG / JPG / JPEG / WEBP のみです")

    contents = await file.read()
    if len(contents) > _MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="画像サイズは5MB以下にしてください")

    _delete_image_file(item.image_url)

    filename = f"reward_{item_id}_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(_IMAGE_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(contents)

    item.image_url = f"/static/reward_images/{filename}"
    db.commit()
    db.refresh(item)
    return {"message": "画像をアップロードしました", "image_url": item.image_url}


@router.delete("/admin/items/{item_id}", tags=["管理者"])
def admin_delete_reward_item(item_id: int, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    item = db.query(RewardItem).filter(RewardItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="報酬が見つかりません")
    _delete_image_file(item.image_url)
    db.query(CustomerReward).filter(CustomerReward.reward_item_id == item_id).delete(synchronize_session=False)
    db.delete(item)
    db.commit()
    return {"message": "削除しました"}


# ===== 顧客向け：報酬一覧・解放演出 =====

def _serialize_item_for_customer(item: RewardItem, customer_reward: Optional[CustomerReward]) -> dict:
    unlocked = customer_reward is not None
    data = {
        "id": item.id,
        "category": item.category,
        "category_label": _CATEGORY_LABELS.get(item.category, item.category),
        "trigger_type": item.trigger_type,
        "threshold": item.threshold,
        "unlocked": unlocked,
        "official_only": item.official_only,
    }
    if unlocked:
        data["unlocked_at"] = customer_reward.unlocked_at.isoformat() if customer_reward.unlocked_at else None
        data["is_new"] = customer_reward.is_new
        data["text_content"] = item.text_content
        data["icon"] = item.icon
        data["image_url"] = item.image_url
    else:
        # 解放前はカテゴリ名のみ表示し、具体的な内容は隠す
        data["unlocked_at"] = None
        data["is_new"] = False
        data["text_content"] = None
        data["icon"] = None
        data["image_url"] = None
    return data


@router.get("/me")
def get_my_rewards(current_user: Customer = Depends(get_current_user), db: Session = Depends(get_db)):
    """現在のキャラクターに紐づく全報酬を、解放状況とともに返す。

    解放前の報酬はカテゴリ名のみを返し、内容（隠しセリフ・称号・壁紙画像）は伏せる
    （フロントエンドではモザイク・シルエット表示にする）。
    """
    if not current_user.character_id:
        return {
            "intimacy_level": 0,
            "article_request_count": 0,
            "items": [],
        }

    items = db.query(RewardItem).filter(
        RewardItem.character_id == current_user.character_id,
    ).order_by(RewardItem.trigger_type, RewardItem.threshold, RewardItem.sort_order).all()

    unlocks = {
        cr.reward_item_id: cr
        for cr in db.query(CustomerReward).filter(CustomerReward.customer_id == current_user.id).all()
    }

    return {
        "intimacy_level": compute_intimacy_level(current_user.intimacy_points or 0),
        "article_request_count": get_article_request_count(db, current_user.id),
        "items": [_serialize_item_for_customer(item, unlocks.get(item.id)) for item in items],
    }


@router.post("/me/{reward_item_id}/ack")
def ack_reward_unlock(reward_item_id: int, current_user: Customer = Depends(get_current_user), db: Session = Depends(get_db)):
    """報酬解放アニメーションを表示し終えたら呼び出し、is_newフラグを下ろす。"""
    cr = db.query(CustomerReward).filter(
        CustomerReward.customer_id == current_user.id,
        CustomerReward.reward_item_id == reward_item_id,
    ).first()
    if not cr:
        raise HTTPException(status_code=404, detail="解放済みの報酬が見つかりません")
    cr.is_new = False
    db.commit()
    return {"message": "ok"}


@router.post("/me/wallpaper/{reward_item_id}/apply")
def apply_wallpaper(reward_item_id: int, current_user: Customer = Depends(get_current_user), db: Session = Depends(get_db)):
    """解放済みの壁紙報酬をサイト背景に適用する。"""
    cr = db.query(CustomerReward).filter(
        CustomerReward.customer_id == current_user.id,
        CustomerReward.reward_item_id == reward_item_id,
    ).first()
    if not cr:
        raise HTTPException(status_code=404, detail="解放済みの報酬が見つかりません")

    item = db.query(RewardItem).filter(RewardItem.id == reward_item_id).first()
    if not item or item.category != "wallpaper" or not item.image_url:
        raise HTTPException(status_code=400, detail="この報酬は壁紙ではありません")

    theme_config = dict(current_user.theme_config or {})
    theme_config["wallpaper_url"] = item.image_url
    current_user.theme_config = theme_config
    db.commit()
    return {"message": "壁紙を適用しました", "wallpaper_url": item.image_url}


@router.delete("/me/wallpaper")
def clear_wallpaper(current_user: Customer = Depends(get_current_user), db: Session = Depends(get_db)):
    """壁紙の適用を解除し、デフォルトの背景に戻す。"""
    theme_config = dict(current_user.theme_config or {})
    theme_config.pop("wallpaper_url", None)
    current_user.theme_config = theme_config
    db.commit()
    return {"message": "壁紙の適用を解除しました"}
