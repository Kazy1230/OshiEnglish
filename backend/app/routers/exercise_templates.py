from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_admin
from app.models.exercise_template import ExerciseTemplate

router = APIRouter(prefix="/exercise-templates", tags=["問題本体ストック"])


def _serialize(t: ExerciseTemplate) -> dict:
    return {
        "id": t.id,
        "exercise_category": t.exercise_category,
        "exercise_subcategory": t.exercise_subcategory,
        "difficulty": t.difficulty,
        "exercise_data": t.exercise_data,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


@router.get("/admin/")
def list_exercise_templates(
    exercise_category: Optional[str] = None,
    exercise_subcategory: Optional[str] = None,
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """②演習問題（選択式：リーディング・リスニング）の第1段階で作成された、
    キャラ要素を含まない問題本体ストックの一覧。

    exercise_categoryを指定すると部分一致で絞り込む（同じ試験・パートの既存ストックを探す用途）。
    exercise_subcategoryを指定すると一致するもの（reading/listening）のみに絞り込む。
    """
    query = db.query(ExerciseTemplate)
    if exercise_category:
        query = query.filter(ExerciseTemplate.exercise_category.ilike(f"%{exercise_category}%"))
    if exercise_subcategory:
        query = query.filter(ExerciseTemplate.exercise_subcategory == exercise_subcategory)
    items = query.order_by(ExerciseTemplate.created_at.desc()).all()
    return [_serialize(t) for t in items]


def _validate_question_body(exercise_data: Optional[dict]):
    if not exercise_data:
        raise HTTPException(status_code=400, detail="exercise_data（問題本体）の指定が必須です")
    questions = exercise_data.get("questions")
    if not isinstance(questions, list) or len(questions) == 0:
        raise HTTPException(status_code=400, detail="少なくとも1問の questions が必要です")
    for i, q in enumerate(questions, start=1):
        if not isinstance(q, dict) or not q.get("prompt"):
            raise HTTPException(status_code=400, detail=f"設問{i}：prompt（問題文）が必要です")
        choices = q.get("choices")
        if not isinstance(choices, list) or len(choices) < 2:
            raise HTTPException(status_code=400, detail=f"設問{i}：choices（選択肢）は2つ以上必要です")
        ci = q.get("correct_index")
        if not isinstance(ci, int) or not (0 <= ci < len(choices)):
            raise HTTPException(status_code=400, detail=f"設問{i}：correct_index（正解の選択肢番号）が不正です")


class ExerciseTemplateCreate(BaseModel):
    exercise_category: str
    exercise_subcategory: Optional[str] = None  # reading / listening
    difficulty: str = "medium"
    exercise_data: dict


@router.post("/admin/")
def create_exercise_template(
    data: ExerciseTemplateCreate,
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if data.difficulty not in ("easy", "medium", "hard"):
        raise HTTPException(status_code=400, detail="difficulty は easy/medium/hard のいずれかを指定してください")
    if not data.exercise_category.strip():
        raise HTTPException(status_code=400, detail="exercise_category は必須です")
    if data.exercise_subcategory is not None and data.exercise_subcategory not in ("reading", "listening"):
        raise HTTPException(status_code=400, detail="exercise_subcategory は reading/listening のいずれかを指定してください")
    _validate_question_body(data.exercise_data)

    template = ExerciseTemplate(
        exercise_category=data.exercise_category.strip(),
        exercise_subcategory=data.exercise_subcategory,
        difficulty=data.difficulty,
        exercise_data=data.exercise_data,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return _serialize(template)


@router.delete("/admin/{template_id}")
def delete_exercise_template(
    template_id: int,
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    template = db.query(ExerciseTemplate).filter(ExerciseTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="問題本体ストックが見つかりません")
    db.delete(template)
    db.commit()
    return {"message": "削除しました"}
