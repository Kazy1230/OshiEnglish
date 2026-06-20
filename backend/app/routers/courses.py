from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, model_validator

from app.core.database import get_db
from app.core.security import get_current_user, get_current_user_optional
from app.models.course import Course
from app.models.lesson import Lesson
from app.models.character import Character
from app.models.instructor_profile import InstructorProfile
from app.models.purchase import Purchase
from app.models.favorite import Favorite
from app.models.notification import Notification
from app.models.lesson_progress import LessonProgress

router = APIRouter(tags=["コース・レッスン"])


# ----- 権限ヘルパー -----

def _get_owned_course(db: Session, course_id: int, current_user) -> Course:
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="コースが見つかりません")
    if current_user.role != "admin":
        profile = db.query(InstructorProfile).filter(InstructorProfile.user_id == current_user.id).first()
        if not profile or course.character.instructor_id != profile.id:
            raise HTTPException(status_code=403, detail="このコースを操作する権限がありません")
    return course


def _is_purchased(db: Session, user_id: Optional[int], course_id: int) -> bool:
    if not user_id:
        return False
    return db.query(Purchase).filter(
        Purchase.user_id == user_id,
        Purchase.course_id == course_id,
        Purchase.status == "succeeded",
    ).first() is not None


# ----- シリアライズ -----

def _serialize_character_brief(character: Character) -> dict:
    return {"id": character.id, "name": character.name, "avatar_url": character.image_url}


def _serialize_lesson(lesson: Lesson, unlocked: bool) -> dict:
    visible = unlocked or lesson.is_preview
    return {
        "id": lesson.id,
        "order": lesson.order,
        "title": lesson.title,
        "content_type": lesson.content_type,
        "is_preview": lesson.is_preview,
        "body": lesson.body if visible else None,
        "youtube_url": lesson.youtube_url if visible else None,
    }


def _serialize_course_card(course: Course) -> dict:
    return {
        "id": course.id,
        "title": course.title,
        "description": course.description,
        "thumbnail_url": course.thumbnail_url,
        "category": course.category,
        "status": course.status,
        "price": course.price,
        "is_free": course.is_free,
        "character": _serialize_character_brief(course.character),
    }


def _serialize_course_detail(db: Session, course: Course, current_user) -> dict:
    unlocked = course.is_free or _is_purchased(db, current_user.id if current_user else None, course.id)
    lessons = sorted(course.lessons, key=lambda l: l.order)
    data = _serialize_course_card(course)
    data["lessons"] = [_serialize_lesson(l, unlocked) for l in lessons]
    data["is_purchased"] = unlocked
    return data


# ----- リクエストスキーマ -----

class CourseCreate(BaseModel):
    character_id: int
    title: str
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    category: Optional[str] = None
    price: int = 0
    is_free: bool = False

    @model_validator(mode="after")
    def _validate_price(self):
        if not self.is_free and self.price < 100:
            raise ValueError("有料コースの価格は100円以上を指定してください")
        if self.is_free:
            self.price = 0
        return self


class CourseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    category: Optional[str] = None
    price: Optional[int] = None
    is_free: Optional[bool] = None
    status: Optional[str] = None

    @model_validator(mode="after")
    def _validate_status(self):
        if self.status is not None and self.status not in ("draft", "published", "unpublished"):
            raise ValueError("status は 'draft' / 'published' / 'unpublished' のいずれかを指定してください")
        return self


def _to_embed_url(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    if value == "" or value.startswith("https://www.youtube.com/embed/"):
        return value or None
    raise ValueError("youtube_url は https://www.youtube.com/embed/ 形式で指定してください")


class LessonCreate(BaseModel):
    title: str
    content_type: str  # text / video
    body: Optional[str] = None
    youtube_url: Optional[str] = None
    is_preview: bool = False

    @model_validator(mode="after")
    def _validate(self):
        if self.content_type not in ("text", "video"):
            raise ValueError("content_type は 'text' または 'video' を指定してください")
        if self.content_type == "video":
            self.youtube_url = _to_embed_url(self.youtube_url)
            if not self.youtube_url:
                raise ValueError("動画レッスンには youtube_url の指定が必須です")
        return self


class LessonUpdate(BaseModel):
    title: Optional[str] = None
    content_type: Optional[str] = None
    body: Optional[str] = None
    youtube_url: Optional[str] = None
    is_preview: Optional[bool] = None

    @model_validator(mode="after")
    def _validate(self):
        if self.content_type is not None and self.content_type not in ("text", "video"):
            raise ValueError("content_type は 'text' または 'video' を指定してください")
        if self.youtube_url is not None:
            self.youtube_url = _to_embed_url(self.youtube_url)
        return self


class ReorderRequest(BaseModel):
    lesson_ids: List[int]


# ----- コースAPI -----

@router.get("/courses")
def list_courses(category: Optional[str] = None, db: Session = Depends(get_db)):
    """コース一覧(新着・カテゴリフィルタ)。公開済みのみ返す"""
    query = db.query(Course).filter(Course.status == "published")
    if category:
        query = query.filter(Course.category == category)
    courses = query.order_by(Course.created_at.desc()).all()
    return [_serialize_course_card(c) for c in courses]


@router.get("/instructors/{instructor_id}/courses")
def list_instructor_courses(instructor_id: int, db: Session = Depends(get_db)):
    """講師別コース一覧(公開済みのみ)"""
    profile = db.query(InstructorProfile).filter(InstructorProfile.id == instructor_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="講師が見つかりません")
    character_ids = [c.id for c in profile.characters]
    if not character_ids:
        return []
    courses = db.query(Course).filter(
        Course.character_id.in_(character_ids),
        Course.status == "published",
    ).order_by(Course.created_at.desc()).all()
    return [_serialize_course_card(c) for c in courses]


@router.get("/courses/{course_id}")
def get_course(course_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user_optional)):
    """コース詳細(レッスン一覧含む)。未購入かつ有料の場合、is_preview=falseのレッスンはbody/youtube_urlをnullで返す"""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="コースが見つかりません")

    if course.status != "published":
        is_owner = False
        if current_user:
            if current_user.role == "admin":
                is_owner = True
            else:
                profile = db.query(InstructorProfile).filter(InstructorProfile.user_id == current_user.id).first()
                is_owner = bool(profile and course.character.instructor_id == profile.id)
        if not is_owner:
            raise HTTPException(status_code=404, detail="コースが見つかりません")

    return _serialize_course_detail(db, course, current_user)


@router.post("/courses", status_code=status.HTTP_201_CREATED)
def create_course(data: CourseCreate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """コース新規作成(status='draft')。要(講師)"""
    if current_user.role not in ("instructor", "admin"):
        raise HTTPException(status_code=403, detail="講師権限が必要です")

    character = db.query(Character).filter(Character.id == data.character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="キャラクターが見つかりません")

    if current_user.role != "admin":
        profile = db.query(InstructorProfile).filter(InstructorProfile.user_id == current_user.id).first()
        if not profile or character.instructor_id != profile.id:
            raise HTTPException(status_code=403, detail="このキャラクターでコースを作成する権限がありません")

    course = Course(
        character_id=data.character_id,
        title=data.title,
        description=data.description,
        thumbnail_url=data.thumbnail_url,
        category=data.category,
        price=data.price,
        is_free=data.is_free,
        status="draft",
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return _serialize_course_detail(db, course, current_user)


@router.put("/courses/{course_id}")
def update_course(course_id: int, data: CourseUpdate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """コース更新。要(本人)。status='published'への変更時はお気に入り登録者へ通知を生成する"""
    course = _get_owned_course(db, course_id, current_user)
    prev_status = course.status

    updates = data.model_dump(exclude_none=True)
    for key, val in updates.items():
        setattr(course, key, val)
    if course.is_free:
        course.price = 0
    elif course.price < 100:
        raise HTTPException(status_code=400, detail="有料コースの価格は100円以上を指定してください")

    if course.status == "published" and prev_status != "published":
        if len(course.lessons) == 0:
            raise HTTPException(status_code=400, detail="レッスンが1件以上ないと公開できません")
        instructor_id = course.character.instructor_id
        if instructor_id is not None:
            favorite_user_ids = [
                f.user_id for f in db.query(Favorite).filter(Favorite.instructor_id == instructor_id).all()
            ]
            for user_id in favorite_user_ids:
                db.add(Notification(
                    user_id=user_id,
                    type="new_course",
                    payload={"course_id": course.id, "title": course.title},
                ))

    db.commit()
    db.refresh(course)
    return _serialize_course_detail(db, course, current_user)


# ----- レッスンAPI -----

@router.post("/courses/{course_id}/lessons", status_code=status.HTTP_201_CREATED)
def add_lesson(course_id: int, data: LessonCreate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """レッスン追加。要(講師・本人)"""
    course = _get_owned_course(db, course_id, current_user)
    max_order = max((l.order for l in course.lessons), default=0)
    lesson = Lesson(
        course_id=course.id,
        order=max_order + 1,
        title=data.title,
        content_type=data.content_type,
        body=data.body,
        youtube_url=data.youtube_url,
        is_preview=data.is_preview,
    )
    db.add(lesson)
    db.commit()
    db.refresh(lesson)
    return _serialize_lesson(lesson, unlocked=True)


@router.put("/lessons/{lesson_id}")
def update_lesson(lesson_id: int, data: LessonUpdate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """レッスン更新。要(本人)"""
    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="レッスンが見つかりません")
    _get_owned_course(db, lesson.course_id, current_user)

    for key, val in data.model_dump(exclude_none=True).items():
        setattr(lesson, key, val)

    db.commit()
    db.refresh(lesson)
    return _serialize_lesson(lesson, unlocked=True)


@router.delete("/lessons/{lesson_id}")
def delete_lesson(lesson_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """レッスン削除。要(本人)"""
    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="レッスンが見つかりません")
    _get_owned_course(db, lesson.course_id, current_user)

    db.delete(lesson)
    db.commit()
    return {"message": "削除しました"}


@router.put("/courses/{course_id}/lessons/reorder")
def reorder_lessons(course_id: int, data: ReorderRequest, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """レッスン並び順変更。要(本人)。lesson_idsに含まれるIDが全てそのコースに属するものか検証する"""
    course = _get_owned_course(db, course_id, current_user)
    existing_ids = {l.id for l in course.lessons}
    if set(data.lesson_ids) != existing_ids:
        raise HTTPException(status_code=400, detail="lesson_idsはこのコースの全レッスンと一致させてください")

    lessons_by_id = {l.id: l for l in course.lessons}
    for index, lesson_id in enumerate(data.lesson_ids, start=1):
        lessons_by_id[lesson_id].order = index

    db.commit()
    lessons = sorted(course.lessons, key=lambda l: l.order)
    return {"lessons": [{"id": l.id, "order": l.order, "title": l.title} for l in lessons]}


# ----- 学習進捗(リテンション機能) -----

@router.get("/courses/me/purchased")
def list_my_purchased_courses(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """ログインユーザーが購入済みの全コースを、レッスン完了数とともに返す(ダッシュボードの学習中コース一覧用)"""
    purchases = db.query(Purchase).filter(
        Purchase.user_id == current_user.id, Purchase.status == "succeeded"
    ).all()
    results = []
    for purchase in purchases:
        course = purchase.course
        lesson_ids = [l.id for l in course.lessons]
        completed_count = db.query(LessonProgress).filter(
            LessonProgress.user_id == current_user.id,
            LessonProgress.lesson_id.in_(lesson_ids),
            LessonProgress.is_completed == True,
        ).count() if lesson_ids else 0
        results.append({
            "course_id": course.id,
            "title": course.title,
            "total_lessons": len(lesson_ids),
            "completed_count": completed_count,
        })
    return results


@router.get("/courses/{course_id}/progress")
def get_course_progress(course_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """購入済みコースのレッスン別学習進捗を返す(R-05: どこまで読んだか記録)"""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="コースが見つかりません")
    if not (course.is_free or _is_purchased(db, current_user.id, course_id)):
        raise HTTPException(status_code=403, detail="このコースを購入していません")

    progress_by_lesson = {
        p.lesson_id: p
        for p in db.query(LessonProgress).filter(
            LessonProgress.user_id == current_user.id,
            LessonProgress.lesson_id.in_([l.id for l in course.lessons]),
        ).all()
    }
    lessons = sorted(course.lessons, key=lambda l: l.order)
    items = [
        {
            "lesson_id": l.id,
            "title": l.title,
            "is_completed": progress_by_lesson[l.id].is_completed if l.id in progress_by_lesson else False,
            "last_accessed_at": progress_by_lesson[l.id].last_accessed_at if l.id in progress_by_lesson else None,
        }
        for l in lessons
    ]
    completed_count = sum(1 for i in items if i["is_completed"])
    return {"course_id": course_id, "total_lessons": len(items), "completed_count": completed_count, "lessons": items}


@router.put("/lessons/{lesson_id}/complete")
def complete_lesson(lesson_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """レッスン完了フラグをONにする(R-05)"""
    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="レッスンが見つかりません")
    course = lesson.course
    if not (course.is_free or _is_purchased(db, current_user.id, course.id)):
        raise HTTPException(status_code=403, detail="このコースを購入していません")

    progress = db.query(LessonProgress).filter(
        LessonProgress.user_id == current_user.id, LessonProgress.lesson_id == lesson_id
    ).first()
    if not progress:
        progress = LessonProgress(user_id=current_user.id, lesson_id=lesson_id, is_completed=True)
        db.add(progress)
    else:
        progress.is_completed = True
    db.commit()
    return {"message": "レッスンを完了にしました"}
