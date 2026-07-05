from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user, get_current_creator_or_admin
from app.core.ogp import detect_content_type, fetch_ogp
from app.models.creator_content import CreatorContent
from app.models.content_like import ContentLike
from app.models.creator_profile import CreatorProfile

router = APIRouter(prefix="/contents", tags=["コンテンツプール"])


def _get_creator_id(db: Session, current_user) -> int:
    profile = db.query(CreatorProfile).filter(CreatorProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=400, detail="クリエイタープロフィールが見つかりません")
    return profile.id


def _serialize(c: CreatorContent, liked: bool = False) -> dict:
    return {
        "id": c.id,
        "creator_id": c.creator_id,
        "url": c.url,
        "title": c.title,
        "description": c.description,
        "thumbnail_url": c.thumbnail_url,
        "content_type": c.content_type,
        "subject": c.subject,
        "tags": c.tags or [],
        "is_public": c.is_public,
        "like_count": c.like_count,
        "liked": liked,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "creator_name": c.creator.display_name if c.creator else None,
        "creator_avatar": (c.creator.character.avatar_url if c.creator and c.creator.character else None),
    }


class ContentCreate(BaseModel):
    url: str
    subject: str = "english"
    tags: Optional[list[str]] = None
    is_public: bool = True


@router.post("/", status_code=201)
def create_content(
    data: ContentCreate,
    current_user=Depends(get_current_creator_or_admin),
    db: Session = Depends(get_db),
):
    creator_id = _get_creator_id(db, current_user)
    content_type = detect_content_type(data.url)
    ogp = fetch_ogp(data.url)

    c = CreatorContent(
        creator_id=creator_id,
        url=data.url,
        title=ogp["title"] or data.url,
        description=ogp.get("description"),
        thumbnail_url=ogp.get("thumbnail_url"),
        content_type=content_type,
        subject=data.subject,
        tags=data.tags or [],
        is_public=data.is_public,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _serialize(c)


@router.get("/my")
def list_my_contents(
    current_user=Depends(get_current_creator_or_admin),
    db: Session = Depends(get_db),
):
    """自分のコンテンツプール一覧。"""
    creator_id = _get_creator_id(db, current_user)
    contents = (
        db.query(CreatorContent)
        .filter(CreatorContent.creator_id == creator_id)
        .order_by(CreatorContent.created_at.desc())
        .all()
    )
    liked_ids = {
        row.content_id
        for row in db.query(ContentLike.content_id).filter(ContentLike.user_id == current_user.id).all()
    }
    return [_serialize(c, liked=c.id in liked_ids) for c in contents]


@router.get("/")
def list_public_contents(
    subject: Optional[str] = Query(None),
    limit: int = Query(20, le=50),
    offset: int = Query(0),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """公開フィード（全クリエイター・subject絞り込み対応）。"""
    q = db.query(CreatorContent).filter(CreatorContent.is_public == True)
    if subject:
        q = q.filter(CreatorContent.subject == subject)
    contents = q.order_by(CreatorContent.created_at.desc()).offset(offset).limit(limit).all()

    liked_ids: set[int] = set()
    if current_user:
        liked_ids = {
            row.content_id
            for row in db.query(ContentLike.content_id).filter(ContentLike.user_id == current_user.id).all()
        }
    return [_serialize(c, liked=c.id in liked_ids) for c in contents]


@router.get("/public")
def list_public_contents_noauth(
    subject: Optional[str] = Query(None),
    limit: int = Query(20, le=50),
    offset: int = Query(0),
    db: Session = Depends(get_db),
):
    """認証不要の公開フィード（トップページ用）。"""
    q = db.query(CreatorContent).filter(CreatorContent.is_public == True)
    if subject:
        q = q.filter(CreatorContent.subject == subject)
    contents = q.order_by(CreatorContent.created_at.desc()).offset(offset).limit(limit).all()
    return [_serialize(c) for c in contents]


@router.get("/recommendations")
def get_recommendations(
    subject: str = Query(...),
    limit: int = Query(10, le=20),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """学習者マイページ：subject一致コンテンツを返す。"""
    contents = (
        db.query(CreatorContent)
        .filter(CreatorContent.is_public == True, CreatorContent.subject == subject)
        .order_by(CreatorContent.like_count.desc(), CreatorContent.created_at.desc())
        .limit(limit)
        .all()
    )
    liked_ids: set[int] = set()
    if current_user:
        liked_ids = {
            row.content_id
            for row in db.query(ContentLike.content_id).filter(ContentLike.user_id == current_user.id).all()
        }
    return [_serialize(c, liked=c.id in liked_ids) for c in contents]


@router.post("/{content_id}/like")
def toggle_like(
    content_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """いいねをトグル。"""
    c = db.query(CreatorContent).filter(CreatorContent.id == content_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="コンテンツが見つかりません")

    existing = db.query(ContentLike).filter(
        ContentLike.content_id == content_id, ContentLike.user_id == current_user.id
    ).first()

    if existing:
        db.delete(existing)
        c.like_count = max(0, c.like_count - 1)
        liked = False
    else:
        db.add(ContentLike(content_id=content_id, user_id=current_user.id))
        c.like_count += 1
        liked = True

    db.commit()
    return {"liked": liked, "like_count": c.like_count}


@router.delete("/{content_id}", status_code=204)
def delete_content(
    content_id: int,
    current_user=Depends(get_current_creator_or_admin),
    db: Session = Depends(get_db),
):
    creator_id = _get_creator_id(db, current_user)
    c = db.query(CreatorContent).filter(CreatorContent.id == content_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="コンテンツが見つかりません")
    if current_user.role != "admin" and c.creator_id != creator_id:
        raise HTTPException(status_code=403, detail="削除権限がありません")
    db.delete(c)
    db.commit()
