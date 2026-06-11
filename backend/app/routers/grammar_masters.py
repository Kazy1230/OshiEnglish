from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from app.core.database import get_db
from app.core.security import get_current_admin
from app.models.grammar_master import GrammarMaster
from pydantic import BaseModel

router = APIRouter(prefix="/grammar-masters", tags=["文法マスター"])

VALID_CATEGORIES = {"TOEIC", "IELTS", "英検", "一般"}

class GrammarMasterCreate(BaseModel):
    topic_name: str
    exam_category: str
    part: Optional[str] = None
    description: Optional[str] = None

class GrammarMasterUpdate(BaseModel):
    topic_name: Optional[str] = None
    exam_category: Optional[str] = None
    part: Optional[str] = None
    description: Optional[str] = None

@router.get("/")
def list_grammar_masters(admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    return db.query(GrammarMaster).order_by(GrammarMaster.exam_category, GrammarMaster.topic_name).all()

@router.post("/", status_code=201)
def create_grammar_master(data: GrammarMasterCreate, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    gm = GrammarMaster(**data.model_dump())
    db.add(gm)
    db.commit()
    db.refresh(gm)
    return gm

@router.patch("/{grammar_id}")
def update_grammar_master(grammar_id: int, data: GrammarMasterUpdate, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    gm = db.query(GrammarMaster).filter(GrammarMaster.id == grammar_id).first()
    if not gm:
        raise HTTPException(status_code=404, detail="文法マスターが見つかりません")
    for key, val in data.model_dump(exclude_none=True).items():
        setattr(gm, key, val)
    db.commit()
    db.refresh(gm)
    return gm

@router.delete("/{grammar_id}")
def delete_grammar_master(grammar_id: int, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    gm = db.query(GrammarMaster).filter(GrammarMaster.id == grammar_id).first()
    if not gm:
        raise HTTPException(status_code=404, detail="文法マスターが見つかりません")
    # 紐付き記事があれば削除不可
    from app.models.article import Article
    linked = db.query(Article).filter(Article.grammar_master_id == grammar_id).count()
    if linked > 0:
        raise HTTPException(status_code=400, detail=f"この文法マスターには{linked}件の記事が紐付いています。先に記事を削除または変更してください")
    db.delete(gm)
    db.commit()
    return {"message": "削除しました"}
