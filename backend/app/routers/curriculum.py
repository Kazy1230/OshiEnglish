"""カリキュラム（章/カード）CRUD + 学習進捗 + 卒業"""
import httpx
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.course import Course
from app.models.course_chapter import CourseChapter
from app.models.chapter_card import ChapterCard
from app.models.card_progress import CardProgress
from app.models.purchase import Purchase
from app.models.creator_profile import CreatorProfile
from app.models.course_subscription import CourseSubscription
from app.models.notification import Notification
from app.models.course_review import CourseReview
from app.models.character import Character

router = APIRouter(tags=["カリキュラム"])


# ── ヘルパー ─────────────────────────────────────────────────────

def _get_owned_course(db: Session, course_id: int, current_user) -> Course:
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="コースが見つかりません")
    if current_user.role != "admin":
        profile = db.query(CreatorProfile).filter(CreatorProfile.user_id == current_user.id).first()
        if not profile or course.character.creator_id != profile.id:
            raise HTTPException(status_code=403, detail="権限がありません")
    return course


def _require_purchase(db: Session, user_id: int, course_id: int) -> Purchase:
    purchase = db.query(Purchase).filter(
        Purchase.user_id == user_id,
        Purchase.course_id == course_id,
        Purchase.status == "succeeded",
    ).first()
    if not purchase:
        sub = db.query(CourseSubscription).filter(
            CourseSubscription.user_id == user_id,
            CourseSubscription.course_id == course_id,
            CourseSubscription.status == "active",
        ).first()
        if not sub:
            raise HTTPException(status_code=403, detail="このコースを購入していません")
        return None  # subscription
    return purchase


def _has_enrolled_learners(db: Session, course_id: int) -> bool:
    purchase_count = db.query(Purchase).filter(
        Purchase.course_id == course_id, Purchase.status == "succeeded"
    ).count()
    if purchase_count > 0:
        return True
    subscription_count = db.query(CourseSubscription).filter(
        CourseSubscription.course_id == course_id, CourseSubscription.status == "active"
    ).count()
    return subscription_count > 0


def _block_structural_edit_if_locked(db: Session, course: Course) -> None:
    """公開済みで受講者がいるコースは、章/カードの追加・削除（総カード数が変わる操作）を禁止する。"""
    if course.status == "published" and _has_enrolled_learners(db, course.id):
        raise HTTPException(status_code=403, detail="受講者がいる公開中のコースは、章・カードの追加/削除はできません")


def _card_count(db: Session, course_id: int) -> int:
    return (
        db.query(ChapterCard)
        .join(CourseChapter, ChapterCard.chapter_id == CourseChapter.id)
        .filter(CourseChapter.course_id == course_id)
        .count()
    )


def _completed_card_count(db: Session, user_id: int, course_id: int) -> int:
    return (
        db.query(CardProgress)
        .join(ChapterCard, CardProgress.card_id == ChapterCard.id)
        .join(CourseChapter, ChapterCard.chapter_id == CourseChapter.id)
        .filter(CourseChapter.course_id == course_id, CardProgress.user_id == user_id, CardProgress.is_completed == True)
        .count()
    )


# ── Pydantic スキーマ ─────────────────────────────────────────────

class ChapterCreate(BaseModel):
    title: str
    goal: Optional[str] = None
    assessment_criteria: Optional[List[str]] = None
    order: Optional[int] = None

class ChapterUpdate(BaseModel):
    title: Optional[str] = None
    goal: Optional[str] = None
    assessment_criteria: Optional[List[str]] = None
    order: Optional[int] = None

class CardCreate(BaseModel):
    card_type: str = "video"  # video / build_task / quiz / message
    title: Optional[str] = None
    body: Optional[str] = None
    youtube_url: Optional[str] = None
    quiz_options: Optional[List[dict]] = None  # [{text: str, is_correct: bool}]
    is_preview: bool = False
    order: Optional[int] = None

class CardUpdate(BaseModel):
    card_type: Optional[str] = None
    title: Optional[str] = None
    body: Optional[str] = None
    youtube_url: Optional[str] = None
    quiz_options: Optional[List[dict]] = None
    is_preview: Optional[bool] = None
    order: Optional[int] = None

class ReorderRequest(BaseModel):
    ids: List[int]

class PaceSet(BaseModel):
    target_pace: str  # 2weeks / 1month / 3months / no_deadline

class CurriculumMeta(BaseModel):
    purpose: Optional[str] = None
    target_audience: Optional[str] = None
    topics: Optional[str] = None
    duration: Optional[str] = None
    style: Optional[str] = None
    concerns: Optional[str] = None
    existing_videos: Optional[str] = None
    completion_video_url: Optional[str] = None


# ── クリエイター: カリキュラムメタ更新 ─────────────────────────────

@router.put("/courses/{course_id}/curriculum-meta")
def update_curriculum_meta(
    course_id: int,
    data: CurriculumMeta,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    course = _get_owned_course(db, course_id, current_user)
    field_map = {
        "purpose": "curriculum_purpose",
        "target_audience": "curriculum_target_audience",
        "topics": "curriculum_topics",
        "duration": "curriculum_duration",
        "style": "curriculum_style",
        "concerns": "curriculum_concerns",
        "existing_videos": "curriculum_existing_videos",
        "completion_video_url": "completion_video_url",
    }
    for src, dst in field_map.items():
        val = getattr(data, src)
        if val is not None:
            setattr(course, dst, val)
    db.commit()
    return {"ok": True}


# ── クリエイター: 外部AI壁打ち用プロンプト生成 ─────────────────────

@router.get("/courses/{course_id}/curriculum-prompt")
def get_curriculum_prompt(
    course_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    course = _get_owned_course(db, course_id, current_user)
    purpose = course.curriculum_purpose or "（未入力）"
    target = course.curriculum_target_audience or "（未入力）"
    topics = course.curriculum_topics or "（未入力）"
    duration = course.curriculum_duration or "（未入力）"
    style = course.curriculum_style or "（未入力）"
    concerns = course.curriculum_concerns or "（未入力）"
    existing_videos = course.curriculum_existing_videos or "（未入力）"

    prompt = f"""あなたは学習カリキュラム設計の専門家です。
以下の情報を元に、まずはコース全体の章立て（カリキュラムの骨格）を提案してください。

【講座の目的】{purpose}
【対象者】{target}
【扱いたいトピック・要素】{topics}
【期間感の目安】{duration}
【講師としてのスタイル・こだわり】{style}
【まだ迷っている・決めきれていない点】{concerns}
【持っている動画】{existing_videos}"""

    return {"prompt": prompt}


# ── クリエイター: 章 CRUD ────────────────────────────────────────

@router.get("/courses/{course_id}/chapters")
def list_chapters(
    course_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _get_owned_course(db, course_id, current_user)
    chapters = (
        db.query(CourseChapter)
        .filter(CourseChapter.course_id == course_id)
        .order_by(CourseChapter.order)
        .all()
    )
    result = []
    for ch in chapters:
        cards = [
            {
                "id": c.id,
                "order": c.order,
                "card_type": c.card_type,
                "title": c.title,
                "body": c.body,
                "youtube_url": c.youtube_url,
                "is_preview": c.is_preview,
                "youtube_available": c.youtube_available,
            }
            for c in ch.cards
        ]
        result.append({
            "id": ch.id,
            "order": ch.order,
            "title": ch.title,
            "goal": ch.goal,
            "assessment_criteria": ch.assessment_criteria,
            "cards": cards,
        })
    return result


@router.post("/courses/{course_id}/chapters")
def create_chapter(
    course_id: int,
    data: ChapterCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    course = _get_owned_course(db, course_id, current_user)
    _block_structural_edit_if_locked(db, course)
    max_order = db.query(CourseChapter).filter(CourseChapter.course_id == course_id).count()
    ch = CourseChapter(
        course_id=course_id,
        title=data.title,
        goal=data.goal,
        assessment_criteria=data.assessment_criteria,
        order=data.order if data.order is not None else max_order,
    )
    db.add(ch)
    db.commit()
    db.refresh(ch)
    return {"id": ch.id, "order": ch.order, "title": ch.title}


@router.put("/courses/{course_id}/chapters/{chapter_id}")
def update_chapter(
    course_id: int,
    chapter_id: int,
    data: ChapterUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _get_owned_course(db, course_id, current_user)
    ch = db.query(CourseChapter).filter(CourseChapter.id == chapter_id, CourseChapter.course_id == course_id).first()
    if not ch:
        raise HTTPException(status_code=404, detail="章が見つかりません")
    if data.title is not None:
        ch.title = data.title
    if data.goal is not None:
        ch.goal = data.goal
    if data.assessment_criteria is not None:
        ch.assessment_criteria = data.assessment_criteria
    if data.order is not None:
        ch.order = data.order
    db.commit()
    return {"ok": True}


@router.delete("/courses/{course_id}/chapters/{chapter_id}")
def delete_chapter(
    course_id: int,
    chapter_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    course = _get_owned_course(db, course_id, current_user)
    _block_structural_edit_if_locked(db, course)
    ch = db.query(CourseChapter).filter(CourseChapter.id == chapter_id, CourseChapter.course_id == course_id).first()
    if not ch:
        raise HTTPException(status_code=404, detail="章が見つかりません")
    db.delete(ch)
    db.commit()
    return {"ok": True}


# ── クリエイター: カード CRUD ──────────────────────────────────────

@router.post("/courses/{course_id}/chapters/{chapter_id}/cards")
def create_card(
    course_id: int,
    chapter_id: int,
    data: CardCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    course = _get_owned_course(db, course_id, current_user)
    _block_structural_edit_if_locked(db, course)
    ch = db.query(CourseChapter).filter(CourseChapter.id == chapter_id, CourseChapter.course_id == course_id).first()
    if not ch:
        raise HTTPException(status_code=404, detail="章が見つかりません")
    max_order = db.query(ChapterCard).filter(ChapterCard.chapter_id == chapter_id).count()
    card = ChapterCard(
        chapter_id=chapter_id,
        card_type=data.card_type,
        title=data.title,
        body=data.body,
        youtube_url=data.youtube_url,
        is_preview=data.is_preview,
        order=data.order if data.order is not None else max_order,
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    return {"id": card.id, "order": card.order, "card_type": card.card_type}


@router.put("/courses/{course_id}/chapters/{chapter_id}/cards/{card_id}")
def update_card(
    course_id: int,
    chapter_id: int,
    card_id: int,
    data: CardUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _get_owned_course(db, course_id, current_user)
    card = db.query(ChapterCard).filter(ChapterCard.id == card_id, ChapterCard.chapter_id == chapter_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="カードが見つかりません")
    for field in ("card_type", "title", "body", "youtube_url", "quiz_options", "is_preview", "order"):
        val = getattr(data, field)
        if val is not None:
            setattr(card, field, val)
    db.commit()
    return {"ok": True}


@router.delete("/courses/{course_id}/chapters/{chapter_id}/cards/{card_id}")
def delete_card(
    course_id: int,
    chapter_id: int,
    card_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    course = _get_owned_course(db, course_id, current_user)
    _block_structural_edit_if_locked(db, course)
    card = db.query(ChapterCard).filter(ChapterCard.id == card_id, ChapterCard.chapter_id == chapter_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="カードが見つかりません")
    db.delete(card)
    db.commit()
    return {"ok": True}


# ── クリエイター: 章/カード並び替え ──────────────────────────────

@router.put("/courses/{course_id}/chapters/reorder")
def reorder_chapters(
    course_id: int,
    data: ReorderRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _get_owned_course(db, course_id, current_user)
    for idx, chapter_id in enumerate(data.ids):
        db.query(CourseChapter).filter(
            CourseChapter.id == chapter_id, CourseChapter.course_id == course_id
        ).update({"order": idx})
    db.commit()
    return {"ok": True}


@router.put("/courses/{course_id}/chapters/{chapter_id}/cards/reorder")
def reorder_cards(
    course_id: int,
    chapter_id: int,
    data: ReorderRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _get_owned_course(db, course_id, current_user)
    for idx, card_id in enumerate(data.ids):
        db.query(ChapterCard).filter(
            ChapterCard.id == card_id, ChapterCard.chapter_id == chapter_id
        ).update({"order": idx})
    db.commit()
    return {"ok": True}


# ── クリエイター: カード複製 ─────────────────────────────────────

@router.post("/courses/{course_id}/chapters/{chapter_id}/cards/{card_id}/duplicate")
def duplicate_card(
    course_id: int,
    chapter_id: int,
    card_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    course = _get_owned_course(db, course_id, current_user)
    _block_structural_edit_if_locked(db, course)
    src = db.query(ChapterCard).filter(ChapterCard.id == card_id, ChapterCard.chapter_id == chapter_id).first()
    if not src:
        raise HTTPException(status_code=404, detail="カードが見つかりません")
    max_order = db.query(ChapterCard).filter(ChapterCard.chapter_id == chapter_id).count()
    new_card = ChapterCard(
        chapter_id=chapter_id,
        card_type=src.card_type,
        title=f"{src.title}（コピー）" if src.title else None,
        body=src.body,
        youtube_url=src.youtube_url,
        quiz_options=src.quiz_options,
        is_preview=src.is_preview,
        order=max_order,
    )
    db.add(new_card)
    db.commit()
    db.refresh(new_card)
    return {"id": new_card.id, "order": new_card.order}


# ── クリエイター: YouTube メタデータ取得 ─────────────────────────

@router.get("/courses/{course_id}/chapters/{chapter_id}/cards/{card_id}/youtube-meta")
async def get_youtube_meta(
    course_id: int,
    chapter_id: int,
    card_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _get_owned_course(db, course_id, current_user)
    card = db.query(ChapterCard).filter(ChapterCard.id == card_id, ChapterCard.chapter_id == chapter_id).first()
    if not card or not card.youtube_url:
        raise HTTPException(status_code=404, detail="カードまたはYouTube URLが見つかりません")
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(
                "https://www.youtube.com/oembed",
                params={"url": card.youtube_url, "format": "json"},
            )
            if r.status_code != 200:
                return {"available": False}
            data = r.json()
            return {
                "available": True,
                "title": data.get("title"),
                "author_name": data.get("author_name"),
                "thumbnail_url": data.get("thumbnail_url"),
            }
    except Exception:
        return {"available": False}


# ── クリエイター: コース審査申請 ─────────────────────────────────

@router.post("/courses/{course_id}/submit-for-review")
def submit_for_review(
    course_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    course = _get_owned_course(db, course_id, current_user)
    if course.status not in ("draft", "unpublished"):
        raise HTTPException(status_code=400, detail="審査申請できる状態ではありません")
    card_count = _card_count(db, course_id)
    if card_count == 0:
        raise HTTPException(status_code=400, detail="カードが1件もないコースは申請できません")
    course.status = "under_review"
    db.commit()
    return {"ok": True, "status": "under_review"}


# ── YouTube oEmbed 可用性チェック ─────────────────────────────────

async def _check_youtube_url(url: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(
                "https://www.youtube.com/oembed",
                params={"url": url, "format": "json"},
            )
            return r.status_code == 200
    except Exception:
        return False


@router.post("/courses/{course_id}/youtube-check")
async def trigger_youtube_check(
    course_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _get_owned_course(db, course_id, current_user)

    cards = (
        db.query(ChapterCard)
        .join(CourseChapter, ChapterCard.chapter_id == CourseChapter.id)
        .filter(CourseChapter.course_id == course_id, ChapterCard.youtube_url.isnot(None))
        .all()
    )

    async def _run_checks():
        for card in cards:
            available = await _check_youtube_url(card.youtube_url)
            card.youtube_available = available
            card.youtube_checked_at = datetime.now(timezone.utc)
        db.commit()

    background_tasks.add_task(_run_checks)
    return {"ok": True, "cards_to_check": len(cards)}


# ── 学習者: カリキュラム取得 ─────────────────────────────────────

@router.get("/courses/{course_id}/curriculum")
def get_curriculum(
    course_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require_purchase(db, current_user.id, course_id)
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="コースが見つかりません")

    completed_ids = set(
        row.card_id for row in
        db.query(CardProgress.card_id)
        .join(ChapterCard, CardProgress.card_id == ChapterCard.id)
        .join(CourseChapter, ChapterCard.chapter_id == CourseChapter.id)
        .filter(CourseChapter.course_id == course_id, CardProgress.user_id == current_user.id, CardProgress.is_completed == True)
        .all()
    )

    chapters_data = []
    for ch in sorted(course.chapters, key=lambda c: c.order):
        cards_data = []
        for card in sorted(ch.cards, key=lambda c: c.order):
            cards_data.append({
                "id": card.id,
                "order": card.order,
                "card_type": card.card_type,
                "title": card.title,
                "body": card.body,
                "youtube_url": card.youtube_url,
                "is_preview": card.is_preview,
                "youtube_available": card.youtube_available,
                "is_completed": card.id in completed_ids,
            })
        chapters_data.append({
            "id": ch.id,
            "order": ch.order,
            "title": ch.title,
            "goal": ch.goal,
            "assessment_criteria": ch.assessment_criteria,
            "cards": cards_data,
            "is_completed": all(c["is_completed"] for c in cards_data) if cards_data else False,
        })

    total = sum(len(ch["cards"]) for ch in chapters_data)
    completed = len(completed_ids)

    purchase = db.query(Purchase).filter(
        Purchase.user_id == current_user.id,
        Purchase.course_id == course_id,
        Purchase.status == "succeeded",
    ).first()

    return {
        "course_id": course_id,
        "completion_video_url": course.completion_video_url,
        "total_cards": total,
        "completed_cards": completed,
        "progress_pct": round(completed / total * 100) if total > 0 else 0,
        "target_pace": purchase.target_pace if purchase else None,
        "is_graduated": purchase.is_graduated if purchase else False,
        "chapters": chapters_data,
    }


# ── 学習者: ペース設定 ────────────────────────────────────────────

@router.post("/courses/{course_id}/pace")
def set_pace(
    course_id: int,
    data: PaceSet,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    valid = {"2weeks", "1month", "3months", "no_deadline"}
    if data.target_pace not in valid:
        raise HTTPException(status_code=400, detail=f"target_pace は {valid} のいずれかで指定してください")
    purchase = db.query(Purchase).filter(
        Purchase.user_id == current_user.id,
        Purchase.course_id == course_id,
        Purchase.status == "succeeded",
    ).first()
    if not purchase:
        raise HTTPException(status_code=403, detail="このコースを購入していません")
    purchase.target_pace = data.target_pace
    purchase.pace_set_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


# ── 学習者: カード完了 ────────────────────────────────────────────

@router.post("/cards/{card_id}/complete")
def complete_card(
    card_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    card = db.query(ChapterCard).filter(ChapterCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="カードが見つかりません")

    course_id = card.chapter.course_id
    _require_purchase(db, current_user.id, course_id)

    prog = db.query(CardProgress).filter(
        CardProgress.user_id == current_user.id,
        CardProgress.card_id == card_id,
    ).first()
    if prog:
        prog.is_completed = True
        prog.completed_at = datetime.now(timezone.utc)
    else:
        prog = CardProgress(
            user_id=current_user.id,
            card_id=card_id,
            is_completed=True,
            completed_at=datetime.now(timezone.utc),
        )
        db.add(prog)
    db.commit()

    total = _card_count(db, course_id)
    completed = _completed_card_count(db, current_user.id, course_id)
    return {"total": total, "completed": completed, "progress_pct": round(completed / total * 100) if total > 0 else 0}


# ── 学習者: 卒業 ────────────────────────────────────────────────

@router.post("/courses/{course_id}/graduate")
def graduate(
    course_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    purchase = db.query(Purchase).filter(
        Purchase.user_id == current_user.id,
        Purchase.course_id == course_id,
        Purchase.status == "succeeded",
    ).first()
    if not purchase:
        raise HTTPException(status_code=403, detail="このコースを購入していません")
    if purchase.is_graduated:
        return {"already_graduated": True}

    total = _card_count(db, course_id)
    completed = _completed_card_count(db, current_user.id, course_id)
    if total > 0 and completed < total:
        raise HTTPException(status_code=400, detail="まだ完了していないカードがあります")

    purchase.is_graduated = True
    purchase.graduated_at = datetime.now(timezone.utc)

    # 卒業通知
    course = db.query(Course).filter(Course.id == course_id).first()
    notif = Notification(
        user_id=current_user.id,
        type="graduation",
        title=f"🎓 「{course.title}」を卒業しました！",
        body="おめでとうございます。修了証を確認してください。",
        payload={"course_id": course_id, "completion_video_url": course.completion_video_url},
    )
    db.add(notif)
    db.commit()

    # 同クリエイターの次コース（未購入・公開済み・自分以外）
    character = db.query(Character).filter(Character.id == course.character_id).first()
    next_courses = []
    if character:
        siblings = db.query(Course).filter(
            Course.character_id == character.id,
            Course.id != course_id,
            Course.status == "published",
        ).order_by(Course.created_at).all()
        purchased_ids = {
            r[0] for r in db.query(Purchase.course_id).filter(
                Purchase.user_id == current_user.id,
                Purchase.status == "succeeded",
            ).all()
        }
        for c in siblings:
            next_courses.append({
                "id": c.id,
                "title": c.title,
                "description": c.description,
                "thumbnail_url": c.thumbnail_url,
                "price": c.price,
                "is_free": c.is_free,
                "is_purchased": c.id in purchased_ids,
            })

    return {
        "graduated": True,
        "completion_video_url": course.completion_video_url,
        "course_title": course.title,
        "next_courses": next_courses,
    }


# ── 学習者: 進捗サマリー ─────────────────────────────────────────

@router.get("/courses/{course_id}/progress")
def get_progress(
    course_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require_purchase(db, current_user.id, course_id)
    total = _card_count(db, course_id)
    completed = _completed_card_count(db, current_user.id, course_id)

    purchase = db.query(Purchase).filter(
        Purchase.user_id == current_user.id,
        Purchase.course_id == course_id,
        Purchase.status == "succeeded",
    ).first()

    return {
        "total_cards": total,
        "completed_cards": completed,
        "progress_pct": round(completed / total * 100) if total > 0 else 0,
        "target_pace": purchase.target_pace if purchase else None,
        "is_graduated": purchase.is_graduated if purchase else False,
    }


# ── 学習者: コースレビュー ────────────────────────────────────────

class ReviewCreate(BaseModel):
    content_rating: int   # 1〜5
    coaching_rating: int  # 1〜5
    body: Optional[str] = None


@router.post("/courses/{course_id}/reviews")
def create_review(
    course_id: int,
    data: ReviewCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """コースレビューを投稿する。進捗50%以上または卒業済みが条件。"""
    purchase = _require_purchase(db, current_user.id, course_id)
    if data.content_rating < 1 or data.content_rating > 5:
        raise HTTPException(status_code=400, detail="content_ratingは1〜5で指定してください")
    if data.coaching_rating < 1 or data.coaching_rating > 5:
        raise HTTPException(status_code=400, detail="coaching_ratingは1〜5で指定してください")

    total = _card_count(db, course_id)
    completed = _completed_card_count(db, current_user.id, course_id)
    pct = round(completed / total * 100) if total > 0 else 0
    is_graduated = purchase.is_graduated if purchase else False
    if not is_graduated and pct < 50:
        raise HTTPException(status_code=400, detail="レビューは進捗50%以上から投稿できます")

    existing = db.query(CourseReview).filter(
        CourseReview.user_id == current_user.id,
        CourseReview.course_id == course_id,
    ).first()
    if existing:
        existing.content_rating = data.content_rating
        existing.coaching_rating = data.coaching_rating
        existing.body = data.body
        db.commit()
        db.refresh(existing)
        return _review_dict(existing, current_user)

    review = CourseReview(
        user_id=current_user.id,
        course_id=course_id,
        content_rating=data.content_rating,
        coaching_rating=data.coaching_rating,
        body=data.body,
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return _review_dict(review, current_user)


@router.get("/courses/{course_id}/reviews")
def list_reviews(
    course_id: int,
    db: Session = Depends(get_db),
):
    """コースのレビュー一覧（公開）。卒業済みレビューを上位表示。"""
    from app.models.customer import Customer
    reviews = db.query(CourseReview).filter(
        CourseReview.course_id == course_id,
    ).order_by(CourseReview.created_at.desc()).all()

    purchase_map = {
        r[0]: r[1] for r in db.query(Purchase.user_id, Purchase.is_graduated).filter(
            Purchase.course_id == course_id,
            Purchase.status == "succeeded",
        ).all()
    }
    user_map = {
        u.id: u for u in db.query(Customer).filter(
            Customer.id.in_([r.user_id for r in reviews])
        ).all()
    }

    result = []
    for r in reviews:
        u = user_map.get(r.user_id)
        result.append({
            **_review_dict(r, u),
            "is_graduated": purchase_map.get(r.user_id, False),
        })
    # 卒業済みを先に
    result.sort(key=lambda x: (0 if x["is_graduated"] else 1, x["created_at"]), reverse=False)
    result.sort(key=lambda x: not x["is_graduated"])
    return result


@router.get("/courses/{course_id}/reviews/mine")
def get_my_review(
    course_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """自分のレビューを取得。"""
    review = db.query(CourseReview).filter(
        CourseReview.user_id == current_user.id,
        CourseReview.course_id == course_id,
    ).first()
    if not review:
        return None
    return _review_dict(review, current_user)


def _review_dict(review: CourseReview, user) -> dict:
    from app.core.character_voice import customer_display_name
    name = customer_display_name(user) if user else "匿名"
    return {
        "id": review.id,
        "user_name": name,
        "content_rating": review.content_rating,
        "coaching_rating": review.coaching_rating,
        "body": review.body,
        "created_at": review.created_at.isoformat() if review.created_at else None,
    }
