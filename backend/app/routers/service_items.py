from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from app.core.database import get_db
from app.core.security import get_current_admin
from app.models.service_item import ServiceItem
from pydantic import BaseModel

router = APIRouter(prefix="/service-items", tags=["料金・サービスメニュー"])

# 注意: このカタログは現時点では「顧客に直接見せる料金表ページ」としては使わない方針。
# キャラクター（運営）がDM上で会話の流れに乗せて自然に商品・サービスへ誘導する
# 「接客」スタイルを採るため、価格情報は管理者側のみが参照できればよい
# （= 顧客向けの公開エンドポイントはあえて用意しない）。


def serialize_item(s: ServiceItem) -> dict:
    return {
        "id": s.id,
        "category": s.category,
        "name": s.name,
        "description": s.description,
        "price_label": s.price_label,
        "fulfillment": s.fulfillment,
        "sort_order": s.sort_order,
        "is_active": s.is_active,
    }


# ===== 管理者向け =====

class ServiceItemCreate(BaseModel):
    category: str
    name: str
    description: Optional[str] = None
    price_label: str
    fulfillment: Optional[str] = None
    sort_order: int = 0
    is_active: bool = True


class ServiceItemUpdate(BaseModel):
    category: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    price_label: Optional[str] = None
    fulfillment: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


@router.get("/admin/all", tags=["管理者"])
def admin_list_all_items(admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    items = db.query(ServiceItem).order_by(ServiceItem.category, ServiceItem.sort_order, ServiceItem.id).all()
    return [serialize_item(s) for s in items]


@router.post("/admin/", tags=["管理者"], status_code=201)
def admin_create_item(data: ServiceItemCreate, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    item = ServiceItem(**data.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return serialize_item(item)


@router.patch("/admin/{item_id}", tags=["管理者"])
def admin_update_item(item_id: int, data: ServiceItemUpdate, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    item = db.query(ServiceItem).filter(ServiceItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="項目が見つかりません")
    for key, val in data.model_dump(exclude_none=True).items():
        setattr(item, key, val)
    db.commit()
    db.refresh(item)
    return serialize_item(item)


@router.delete("/admin/{item_id}", tags=["管理者"])
def admin_delete_item(item_id: int, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    item = db.query(ServiceItem).filter(ServiceItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="項目が見つかりません")
    db.delete(item)
    db.commit()
    return {"message": "削除しました"}
