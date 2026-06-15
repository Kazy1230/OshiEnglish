from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_admin
from app.models.template_article_template import TemplateArticleTemplate

router = APIRouter(prefix="/template-article-templates", tags=["定期便ストック"])


def _serialize(t: TemplateArticleTemplate) -> dict:
    return {
        "id": t.id,
        "topic": t.topic,
        "difficulty": t.difficulty,
        "content": t.content,
        "example_sentences": t.example_sentences,
        "tips": t.tips,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


@router.get("/admin/")
def list_template_article_templates(
    topic: Optional[str] = None,
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """定期便プールの第1段階で作成された、キャラ要素を含まない素材記事ストックの一覧。

    topicを指定すると部分一致で絞り込む。
    """
    query = db.query(TemplateArticleTemplate)
    if topic:
        query = query.filter(TemplateArticleTemplate.topic.ilike(f"%{topic}%"))
    items = query.order_by(TemplateArticleTemplate.created_at.desc()).all()
    return [_serialize(t) for t in items]


class TemplateArticleTemplateCreate(BaseModel):
    topic: Optional[str] = None
    difficulty: str = "medium"
    content: str
    example_sentences: Optional[list] = None
    tips: Optional[list] = None


@router.post("/admin/")
def create_template_article_template(
    data: TemplateArticleTemplateCreate,
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if data.difficulty not in ("easy", "medium", "hard"):
        raise HTTPException(status_code=400, detail="difficulty は easy/medium/hard のいずれかを指定してください")
    if not data.content.strip():
        raise HTTPException(status_code=400, detail="content は必須です")

    template = TemplateArticleTemplate(
        topic=(data.topic.strip() if data.topic else None),
        difficulty=data.difficulty,
        content=data.content.strip(),
        example_sentences=data.example_sentences,
        tips=data.tips,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return _serialize(template)


@router.delete("/admin/{template_id}")
def delete_template_article_template(
    template_id: int,
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    template = db.query(TemplateArticleTemplate).filter(TemplateArticleTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="定期便ストックが見つかりません")
    db.delete(template)
    db.commit()
    return {"message": "削除しました"}
