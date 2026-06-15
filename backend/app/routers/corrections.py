import os
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user, get_current_admin
from app.core.uploads import validate_media_ext, MAX_MEDIA_SIZE
from app.core.intimacy import get_intimacy_settings
from app.core.rewards import check_and_unlock_rewards
from app.models.correction_request import CorrectionRequest
from app.models.customer import Customer

router = APIRouter(prefix="/corrections", tags=["添削リクエスト"])

# 添削提出（スピーキング）の音声・動画の保存先（main.pyで /static にマウントされているディレクトリ配下）
_CORRECTION_MEDIA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static", "correction_media")
os.makedirs(_CORRECTION_MEDIA_DIR, exist_ok=True)

VALID_CORRECTION_TYPES = ("writing", "speaking")
VALID_STATUSES = ("pending", "in_progress", "completed")


def serialize_correction_request(cr: CorrectionRequest, with_customer_info: bool = False) -> dict:
    data = {
        "id": cr.id,
        "customer_id": cr.customer_id,
        "character_id": cr.character_id,
        "correction_type": cr.correction_type,
        "status": cr.status,
        "text_content": cr.text_content,
        "media_url": cr.media_url,
        "media_type": cr.media_type,
        "note": cr.note,
        "transcript": cr.transcript,
        "source_article_id": cr.source_article_id,
        "feedback_article_id": cr.feedback_article_id,
        "created_at": cr.created_at.isoformat() if cr.created_at else None,
    }
    if with_customer_info:
        data["username"] = cr.customer.username if cr.customer else None
        data["character_name"] = cr.character.name if cr.character else None
    if cr.source_article:
        data["source_article_title"] = cr.source_article.title
        data["source_article_prompt"] = (cr.source_article.exercise_data or {}).get("prompt")
    return data


def _award_submission_points(db: Session, customer: Customer):
    settings_row = get_intimacy_settings(db)
    customer.intimacy_points = (customer.intimacy_points or 0) + settings_row.points_per_exercise_submit
    check_and_unlock_rewards(db, customer)


# ===== 顧客向け =====

class CorrectionRequestCreate(BaseModel):
    correction_type: str  # "writing" | "speaking"
    text_content: Optional[str] = None
    note: Optional[str] = None


@router.post("/me")
def submit_correction_text(
    data: CorrectionRequestCreate,
    current_user: Customer = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """お題のない添削リクエストをテキストで提出する（ライティング本文、またはスピーキングの補足メモのみ）。"""
    if data.correction_type not in VALID_CORRECTION_TYPES:
        raise HTTPException(status_code=400, detail="correction_type は 'writing' または 'speaking' を指定してください")

    if data.correction_type == "writing" and not (data.text_content and data.text_content.strip()):
        raise HTTPException(status_code=400, detail="添削してほしい英文を入力してください")

    if data.correction_type == "speaking" and not (
        (data.text_content and data.text_content.strip()) or (data.note and data.note.strip())
    ):
        raise HTTPException(status_code=400, detail="音声・動画を添付するか、メモを入力してください")

    cr = CorrectionRequest(
        customer_id=current_user.id,
        character_id=current_user.character_id,
        correction_type=data.correction_type,
        status="pending",
        text_content=data.text_content.strip() if data.text_content else None,
        note=data.note.strip() if data.note else None,
    )
    db.add(cr)
    _award_submission_points(db, current_user)
    db.commit()
    db.refresh(cr)
    return serialize_correction_request(cr)


@router.post("/me/media")
def submit_correction_media(
    file: UploadFile = File(...),
    correction_type: str = Form("speaking"),
    media_type_hint: Optional[str] = Form(None),
    note: Optional[str] = Form(None),
    current_user: Customer = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """音声・動画ファイル付きで添削リクエストを提出する（主にスピーキング添削）。"""
    if correction_type not in VALID_CORRECTION_TYPES:
        raise HTTPException(status_code=400, detail="correction_type は 'writing' または 'speaking' を指定してください")

    ext = os.path.splitext(file.filename or "")[1].lower()
    media_type = validate_media_ext(ext, media_type_hint)

    raw = file.file.read()
    if len(raw) > MAX_MEDIA_SIZE:
        raise HTTPException(status_code=400, detail="ファイルサイズが大きすぎます（50MBまで）")

    filename = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(_CORRECTION_MEDIA_DIR, filename)
    with open(path, "wb") as f:
        f.write(raw)

    cr = CorrectionRequest(
        customer_id=current_user.id,
        character_id=current_user.character_id,
        correction_type=correction_type,
        status="pending",
        media_url=f"/static/correction_media/{filename}",
        media_type=media_type,
        note=note.strip() if note else None,
    )
    db.add(cr)
    _award_submission_points(db, current_user)
    db.commit()
    db.refresh(cr)
    return serialize_correction_request(cr)


# ===== 管理者向け =====

class CorrectionStatusUpdate(BaseModel):
    status: str


class CorrectionTranscriptUpdate(BaseModel):
    transcript: str


@router.get("/admin/")
def list_correction_requests(
    status: Optional[str] = None,
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """管理者向け：添削リクエスト一覧。

    status未指定の場合はpending/in_progressのみ（対応待ち）を返す。
    ?status=all で全件、?status=completed のように個別指定も可能。
    """
    query = db.query(CorrectionRequest)
    if status == "all":
        pass
    elif status in VALID_STATUSES:
        query = query.filter(CorrectionRequest.status == status)
    else:
        query = query.filter(CorrectionRequest.status.in_(("pending", "in_progress")))

    items = query.order_by(CorrectionRequest.id.asc()).all()
    return [serialize_correction_request(cr, with_customer_info=True) for cr in items]


@router.get("/admin/{correction_id}")
def get_correction_request(
    correction_id: int,
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """管理者向け：添削リクエスト詳細（添削記事作成時のデータ引き渡し用）"""
    cr = db.query(CorrectionRequest).filter(CorrectionRequest.id == correction_id).first()
    if not cr:
        raise HTTPException(status_code=404, detail="添削リクエストが見つかりません")
    return serialize_correction_request(cr, with_customer_info=True)


@router.patch("/admin/{correction_id}/status")
def update_correction_status(
    correction_id: int,
    data: CorrectionStatusUpdate,
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """管理者向け：添削リクエストのステータスを手動更新する（対応開始時にin_progressにする等）"""
    if data.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="status は pending/in_progress/completed のいずれかを指定してください")

    cr = db.query(CorrectionRequest).filter(CorrectionRequest.id == correction_id).first()
    if not cr:
        raise HTTPException(status_code=404, detail="添削リクエストが見つかりません")

    cr.status = data.status
    db.commit()
    db.refresh(cr)
    return serialize_correction_request(cr, with_customer_info=True)


@router.patch("/admin/{correction_id}/transcript")
def update_correction_transcript(
    correction_id: int,
    data: CorrectionTranscriptUpdate,
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """管理者向け：スピーキング提出の音声/動画を手動で文字起こしした結果を保存する。

    保存した内容はFB記事作成プロンプトの「生徒の提出内容」として使われる。
    """
    cr = db.query(CorrectionRequest).filter(CorrectionRequest.id == correction_id).first()
    if not cr:
        raise HTTPException(status_code=404, detail="添削リクエストが見つかりません")

    cr.transcript = data.transcript.strip() if data.transcript and data.transcript.strip() else None
    db.commit()
    db.refresh(cr)
    return serialize_correction_request(cr, with_customer_info=True)
