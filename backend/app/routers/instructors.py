from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user_optional
from app.models.instructor_profile import InstructorProfile
from app.models.course import Course
from app.models.favorite import Favorite
from app.core.character_voice import customer_display_name

router = APIRouter(prefix="/instructors", tags=["講師"])


def _serialize_instructor_card(profile: InstructorProfile) -> dict:
    return {
        "id": profile.id,
        "display_name": customer_display_name(profile.user),
        "bio": profile.bio,
        "characters": [
            {"id": c.id, "name": c.name, "avatar_url": c.image_url} for c in profile.characters
        ],
    }


@router.get("/")
def list_instructors(db: Session = Depends(get_db)):
    """講師一覧取得(公開中の講師プロフィールのみ)"""
    profiles = db.query(InstructorProfile).filter(InstructorProfile.status == "active").all()
    return [_serialize_instructor_card(p) for p in profiles]


@router.get("/{instructor_id}")
def get_instructor(instructor_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user_optional)):
    """講師ページ情報取得"""
    profile = db.query(InstructorProfile).filter(InstructorProfile.id == instructor_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="講師が見つかりません")

    character_ids = [c.id for c in profile.characters]
    courses = []
    if character_ids:
        courses = db.query(Course).filter(
            Course.character_id.in_(character_ids),
            Course.status == "published",
        ).order_by(Course.created_at.desc()).all()

    is_favorited = False
    if current_user:
        is_favorited = db.query(Favorite).filter(
            Favorite.user_id == current_user.id,
            Favorite.instructor_id == profile.id,
        ).first() is not None

    data = _serialize_instructor_card(profile)
    data["sns_youtube"] = profile.sns_youtube
    data["sns_instagram"] = profile.sns_instagram
    data["sns_twitter"] = profile.sns_twitter
    data["courses"] = [
        {
            "id": c.id, "title": c.title, "description": c.description,
            "thumbnail_url": c.thumbnail_url, "category": c.category,
            "price": c.price, "is_free": c.is_free,
        }
        for c in courses
    ]
    data["is_favorited"] = is_favorited
    return data
