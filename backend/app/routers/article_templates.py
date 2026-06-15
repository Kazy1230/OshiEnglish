from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_admin
from app.models.article_template import ArticleTemplate

router = APIRouter(prefix="/article-templates", tags=["教育記事ストック"])


def _serialize(t: ArticleTemplate) -> dict:
    return {
        "id": t.id,
        "topic": t.topic,
        "difficulty": t.difficulty,
        "content": t.content,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


@router.get("/admin/")
def list_article_templates(
    topic: Optional[str] = None,
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """①記事作成依頼の第1段階で作成された、キャラ要素を含まない教育記事ストックの一覧。

    topicを指定すると部分一致で絞り込む（同じトピックの既存ストックを探す用途）。
    """
    query = db.query(ArticleTemplate)
    if topic:
        query = query.filter(ArticleTemplate.topic.ilike(f"%{topic}%"))
    items = query.order_by(ArticleTemplate.created_at.desc()).all()
    return [_serialize(t) for t in items]


class ArticleTemplateCreate(BaseModel):
    topic: str
    difficulty: str = "medium"
    content: str


@router.post("/admin/")
def create_article_template(
    data: ArticleTemplateCreate,
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if data.difficulty not in ("easy", "medium", "hard"):
        raise HTTPException(status_code=400, detail="difficulty は easy/medium/hard のいずれかを指定してください")
    if not data.topic.strip() or not data.content.strip():
        raise HTTPException(status_code=400, detail="topic と content は必須です")

    template = ArticleTemplate(
        topic=data.topic.strip(),
        difficulty=data.difficulty,
        content=data.content.strip(),
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return _serialize(template)


@router.delete("/admin/{template_id}")
def delete_article_template(
    template_id: int,
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    template = db.query(ArticleTemplate).filter(ArticleTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="教育記事ストックが見つかりません")
    db.delete(template)
    db.commit()
    return {"message": "削除しました"}
