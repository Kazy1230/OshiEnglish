from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.email import send_email
from app.core.security import get_current_admin, get_current_user
from app.models.character import Character
from app.models.customer import Customer
from app.models.preview_example import PreviewExample

router = APIRouter(prefix="/preview", tags=["プレビュー機能"])

EXAMPLE_COUNT = 5


def _serialize_example(e: PreviewExample) -> dict:
    return {
        "id": e.id,
        "example_number": e.example_number,
        "user_message": e.user_message,
        "character_response": e.character_response,
        "rating": e.rating,
        "feedback_text": e.feedback_text,
    }


# ===================== 管理者向け：例文の登録・編集 =====================

class PreviewExampleInput(BaseModel):
    example_number: int
    user_message: str
    character_response: str


class PreviewExamplesSave(BaseModel):
    examples: List[PreviewExampleInput]


@router.get("/admin/{customer_id}")
def get_preview_examples_admin(
    customer_id: int,
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """管理者向け：指定した顧客のプレビュー例文一覧（未登録の場合は空配列）を取得する。"""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="顧客が見つかりません")
    rows = (
        db.query(PreviewExample)
        .filter(PreviewExample.customer_id == customer_id)
        .order_by(PreviewExample.example_number)
        .all()
    )
    return {
        "preview_ready": customer.preview_ready,
        "preview_submitted": customer.preview_submitted,
        "examples": [_serialize_example(e) for e in rows],
    }


@router.put("/admin/{customer_id}")
def save_preview_examples_admin(
    customer_id: int,
    data: PreviewExamplesSave,
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """管理者向け：プレビュー例文（5つ）を保存し、顧客にプレビュー閲覧可能メールを送信する。"""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="顧客が見つかりません")
    if len(data.examples) != EXAMPLE_COUNT:
        raise HTTPException(status_code=400, detail=f"例文は{EXAMPLE_COUNT}件指定してください")

    existing = {
        e.example_number: e
        for e in db.query(PreviewExample).filter(PreviewExample.customer_id == customer_id).all()
    }
    for item in data.examples:
        row = existing.get(item.example_number)
        if row:
            row.user_message = item.user_message
            row.character_response = item.character_response
        else:
            db.add(PreviewExample(
                character_id=customer.character_id,
                customer_id=customer_id,
                example_number=item.example_number,
                user_message=item.user_message,
                character_response=item.character_response,
            ))

    was_ready = customer.preview_ready
    customer.preview_ready = True
    db.commit()

    if not was_ready and customer.email:
        character = db.query(Character).filter(Character.id == customer.character_id).first() if customer.character_id else None
        character_name = character.name if character else "あなたの先生"
        send_email(
            to=customer.email,
            subject="【推しEnglish】プレビューが見れるようになりました",
            html=(
                f"<p>{customer.username} 様</p>"
                f"<p>{character_name}との会話プレビューが見れるようになりました。</p>"
                f"<p>ログインしてご確認ください。</p>"
            ),
        )

    rows = (
        db.query(PreviewExample)
        .filter(PreviewExample.customer_id == customer_id)
        .order_by(PreviewExample.example_number)
        .all()
    )
    return {
        "preview_ready": customer.preview_ready,
        "preview_submitted": customer.preview_submitted,
        "examples": [_serialize_example(e) for e in rows],
    }


# ===================== 顧客向け：プレビュー表示・評価送信 =====================

@router.get("/me")
def get_my_preview(
    current_user: Customer = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """顧客向け：トップ画面表示時に呼び出し、プレビューポップアップを表示すべきか判定する。"""
    if not current_user.preview_ready or current_user.preview_submitted:
        return {"show": False, "examples": []}

    character = db.query(Character).filter(Character.id == current_user.character_id).first() if current_user.character_id else None
    rows = (
        db.query(PreviewExample)
        .filter(PreviewExample.customer_id == current_user.id)
        .order_by(PreviewExample.example_number)
        .all()
    )
    return {
        "show": len(rows) > 0,
        "character_name": character.name if character else None,
        "color_scheme": character.color_scheme if character else None,
        "examples": [_serialize_example(e) for e in rows],
    }


class PreviewRatingInput(BaseModel):
    id: int
    rating: str  # good / unsure
    feedback_text: Optional[str] = None


class PreviewSubmit(BaseModel):
    ratings: List[PreviewRatingInput]


@router.post("/me/submit")
def submit_my_preview(
    data: PreviewSubmit,
    current_user: Customer = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """顧客向け：5つの例文に対する評価（👍ぴったり／🤔少し違うかも）を送信する（一人一回限り）。"""
    if current_user.preview_submitted:
        raise HTTPException(status_code=400, detail="プレビューの評価は既に送信済みです")

    rows = {
        e.id: e
        for e in db.query(PreviewExample).filter(PreviewExample.customer_id == current_user.id).all()
    }
    for item in data.ratings:
        if item.rating not in ("good", "unsure"):
            raise HTTPException(status_code=400, detail="ratingはgoodまたはunsureで指定してください")
        row = rows.get(item.id)
        if not row:
            raise HTTPException(status_code=404, detail="例文が見つかりません")
        row.rating = item.rating
        row.feedback_text = item.feedback_text if item.rating == "unsure" else None

    current_user.preview_submitted = True
    db.commit()
    return {"ok": True}


# ===================== 管理者向け：修正リクエスト一覧 =====================

@router.get("/admin/requests/list")
def list_preview_correction_requests(
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """管理者向け：顧客から送信された修正リクエスト（rating=unsure）の一覧を取得する。"""
    rows = (
        db.query(PreviewExample)
        .filter(PreviewExample.rating == "unsure")
        .order_by(PreviewExample.created_at.desc())
        .all()
    )
    result = []
    for e in rows:
        character = db.query(Character).filter(Character.id == e.character_id).first() if e.character_id else None
        customer = db.query(Customer).filter(Customer.id == e.customer_id).first()
        result.append({
            "id": e.id,
            "character_id": e.character_id,
            "character_name": character.name if character else None,
            "customer_id": e.customer_id,
            "customer_name": customer.username if customer else None,
            "user_message": e.user_message,
            "character_response": e.character_response,
            "feedback_text": e.feedback_text,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        })
    return result
