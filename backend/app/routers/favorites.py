from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.favorite import Favorite
from app.models.creator_profile import CreatorProfile
from app.core.character_voice import customer_display_name

router = APIRouter(prefix="/favorites", tags=["お気に入り"])


@router.post("/{creator_id}", status_code=201)
def add_favorite(creator_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    profile = db.query(CreatorProfile).filter(CreatorProfile.id == creator_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="クリエイターが見つかりません")

    existing = db.query(Favorite).filter(
        Favorite.user_id == current_user.id, Favorite.creator_id == creator_id
    ).first()
    if existing:
        return {"message": "既にお気に入り登録済みです"}

    db.add(Favorite(user_id=current_user.id, creator_id=creator_id))
    db.commit()
    return {"message": "お気に入りに登録しました"}


@router.delete("/{creator_id}")
def remove_favorite(creator_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    favorite = db.query(Favorite).filter(
        Favorite.user_id == current_user.id, Favorite.creator_id == creator_id
    ).first()
    if favorite:
        db.delete(favorite)
        db.commit()
    return {"message": "お気に入りを解除しました"}


@router.get("/")
def list_favorites(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    favorites = db.query(Favorite).filter(Favorite.user_id == current_user.id).all()
    result = []
    for f in favorites:
        profile = db.query(CreatorProfile).filter(CreatorProfile.id == f.creator_id).first()
        if not profile:
            continue
        result.append({
            "creator_id": profile.id,
            "display_name": customer_display_name(profile.user),
            "characters": [{"id": c.id, "name": c.name, "avatar_url": c.image_url} for c in profile.characters],
        })
    return result
