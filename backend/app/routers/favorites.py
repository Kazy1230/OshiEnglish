from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.favorite import Favorite
from app.models.instructor_profile import InstructorProfile
from app.core.character_voice import customer_display_name

router = APIRouter(prefix="/favorites", tags=["お気に入り"])


@router.post("/{instructor_id}", status_code=201)
def add_favorite(instructor_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    profile = db.query(InstructorProfile).filter(InstructorProfile.id == instructor_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="講師が見つかりません")

    existing = db.query(Favorite).filter(
        Favorite.user_id == current_user.id, Favorite.instructor_id == instructor_id
    ).first()
    if existing:
        return {"message": "既にお気に入り登録済みです"}

    db.add(Favorite(user_id=current_user.id, instructor_id=instructor_id))
    db.commit()
    return {"message": "お気に入りに登録しました"}


@router.delete("/{instructor_id}")
def remove_favorite(instructor_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    favorite = db.query(Favorite).filter(
        Favorite.user_id == current_user.id, Favorite.instructor_id == instructor_id
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
        profile = db.query(InstructorProfile).filter(InstructorProfile.id == f.instructor_id).first()
        if not profile:
            continue
        result.append({
            "instructor_id": profile.id,
            "display_name": customer_display_name(profile.user),
            "characters": [{"id": c.id, "name": c.name, "avatar_url": c.image_url} for c in profile.characters],
        })
    return result
