from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Optional
from app.core.database import get_db
from app.core.security import get_current_admin
from app.core.credits import get_credit_settings
from pydantic import BaseModel, Field

router = APIRouter(prefix="/credit-settings", tags=["クレジット料金設定"])


def serialize_settings(s) -> dict:
    return {
        "template_unlock_cost": s.template_unlock_cost,
    }


class CreditSettingsUpdate(BaseModel):
    template_unlock_cost: Optional[int] = Field(default=None, ge=0)


@router.get("/admin/", tags=["管理者"])
def admin_get_settings(admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """クレジット関連の料金設定を取得する。"""
    return serialize_settings(get_credit_settings(db))


@router.patch("/admin/", tags=["管理者"])
def admin_update_settings(data: CreditSettingsUpdate, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """定期便（特別記事）の開封コストなど、クレジット関連の料金設定を更新する。"""
    settings_row = get_credit_settings(db)
    for key, val in data.model_dump(exclude_none=True).items():
        setattr(settings_row, key, val)
    db.commit()
    db.refresh(settings_row)
    return serialize_settings(settings_row)
