from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Optional
from app.core.database import get_db
from app.core.security import get_current_admin
from app.core.intimacy import get_intimacy_settings
from pydantic import BaseModel, Field

router = APIRouter(prefix="/intimacy-settings", tags=["親密度ポイント設定"])


def serialize_settings(s) -> dict:
    return {
        "points_per_message": s.points_per_message,
        "points_per_purchase": s.points_per_purchase,
        "points_per_login": s.points_per_login,
        "points_per_exercise_submit": s.points_per_exercise_submit,
    }


class IntimacySettingsUpdate(BaseModel):
    points_per_message: Optional[int] = Field(default=None, ge=0)
    points_per_purchase: Optional[int] = Field(default=None, ge=0)
    points_per_login: Optional[int] = Field(default=None, ge=0)
    points_per_exercise_submit: Optional[int] = Field(default=None, ge=0)


@router.get("/admin/", tags=["管理者"])
def admin_get_settings(admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """親密度ポイントの自動加算設定を取得する。"""
    return serialize_settings(get_intimacy_settings(db))


@router.patch("/admin/", tags=["管理者"])
def admin_update_settings(data: IntimacySettingsUpdate, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """各イベント（メッセージ送信・コンテンツ購入・ログイン・演習問題提出）の加算ポイント数を更新する。"""
    settings_row = get_intimacy_settings(db)
    for key, val in data.model_dump(exclude_none=True).items():
        setattr(settings_row, key, val)
    db.commit()
    db.refresh(settings_row)
    return serialize_settings(settings_row)
