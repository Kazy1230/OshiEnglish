from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_admin, get_current_user
from app.core.email import send_email
from app.models.creator_profile import CreatorProfile
from app.models.customer import Customer
from app.models.course import Course
from app.models.character import Character
from app.models.question import Question
from app.models.answer import Answer
from app.models.report import Report
from app.models.favorite import Favorite
from app.models.notification import Notification
from app.models.course_subscription import CourseSubscription
from app.models.purchase import Purchase
from app.models.lesson import Lesson
from app.models.lesson_progress import LessonProgress
from app.models.course_day import CourseDay
from app.models.course_material import CourseMaterial
from app.models.day_log import DayLog
from app.models.daily_summary import DailySummary
from app.models.learner_review import LearnerReview
from app.models.learner_profile import LearnerProfile
from app.models.learner_roadmap import LearnerRoadmap
from app.models.learner_course_day import LearnerCourseDay
from app.models.notification_setting import NotificationSetting

router = APIRouter(prefix="/admin", tags=["管理者機能"])


# ----- G-01: クリエイター申請の審査 -----

@router.get("/creator-applications")
def list_creator_applications(admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """審査待ち（pending）のクリエイター申請一覧。要(管理者)"""
    profiles = db.query(CreatorProfile).filter(CreatorProfile.status == "pending").order_by(CreatorProfile.id).all()
    result = []
    for p in profiles:
        user = db.query(Customer).filter(Customer.id == p.user_id).first()
        result.append({
            "id": p.id,
            "username": user.username if user else None,
            "speciality": p.speciality,
            "experience": p.experience,
        })
    return result


@router.put("/creator-applications/{profile_id}/approve")
def approve_creator_application(profile_id: int, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """クリエイター申請を承認する。要(管理者)"""
    profile = db.query(CreatorProfile).filter(CreatorProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="申請が見つかりません")
    profile.status = "active"
    db.commit()
    user = db.query(Customer).filter(Customer.id == profile.user_id).first()
    if user and user.email:
        send_email(user.email, "【ManaVillage】クリエイター申請が承認されました", "<p>クリエイター申請が承認されました。コースの作成を始められます。</p>")
    return {"message": "承認しました"}


class RejectRequest(BaseModel):
    reason: Optional[str] = None


@router.put("/creator-applications/{profile_id}/reject")
def reject_creator_application(profile_id: int, data: RejectRequest, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """クリエイター申請を却下する。要(管理者)"""
    profile = db.query(CreatorProfile).filter(CreatorProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="申請が見つかりません")
    profile.status = "suspended"
    db.commit()
    user = db.query(Customer).filter(Customer.id == profile.user_id).first()
    if user and user.email:
        reason_text = f"<p>理由: {data.reason}</p>" if data.reason else ""
        send_email(user.email, "【ManaVillage】クリエイター申請について", f"<p>クリエイター申請は今回見送りとなりました。</p>{reason_text}")
    return {"message": "却下しました"}


# ----- クリエイター一覧管理（承認済み・停止済みも含む全件） -----

@router.get("/creators")
def list_all_creators(admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """全クリエイター一覧（pending/active/suspendedすべて）。要(管理者)"""
    profiles = db.query(CreatorProfile).order_by(CreatorProfile.id.desc()).all()
    result = []
    for p in profiles:
        user = db.query(Customer).filter(Customer.id == p.user_id).first()
        course_count = db.query(Course).filter(Course.character_id == (p.character.id if p.character else None)).count() if p.character else 0
        result.append({
            "id": p.id,
            "username": user.username if user else None,
            "email": user.email if user else None,
            "status": p.status,
            "speciality": p.speciality,
            "character_name": p.character.name if p.character else None,
            "course_count": course_count,
        })
    return result


@router.put("/creators/{profile_id}/suspend")
def suspend_creator(profile_id: int, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """承認済みクリエイターを停止する（新規コース作成・コンテンツ生成を不可にする）。要(管理者)"""
    profile = db.query(CreatorProfile).filter(CreatorProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="クリエイターが見つかりません")
    profile.status = "suspended"
    db.commit()
    return {"message": "クリエイターを停止しました"}


@router.put("/creators/{profile_id}/reactivate")
def reactivate_creator(profile_id: int, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """停止中のクリエイターを再度activeに戻す。要(管理者)"""
    profile = db.query(CreatorProfile).filter(CreatorProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="クリエイターが見つかりません")
    profile.status = "active"
    db.commit()
    return {"message": "クリエイターを再開しました"}


# ----- G-02: 違反コンテンツ・コースの停止 -----

@router.get("/courses")
def list_all_courses(admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """全コース一覧（停止状態含む）。要(管理者)"""
    courses = db.query(Course).order_by(Course.created_at.desc()).all()
    return [
        {
            "id": c.id, "title": c.title, "status": c.status,
            "is_suspended": c.is_suspended, "suspension_reason": c.suspension_reason,
            "character_name": c.character.name if c.character else None,
        }
        for c in courses
    ]


class SuspendRequest(BaseModel):
    reason: str


@router.put("/courses/{course_id}/suspend")
def suspend_course(course_id: int, data: SuspendRequest, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """違反コースを停止する（購入済み学習者も含め利用不可になる）。要(管理者)"""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="コースが見つかりません")
    course.is_suspended = True
    course.suspension_reason = data.reason
    db.commit()
    return {"message": "コースを停止しました"}


def delete_course_cascade(db: Session, course_id: int, force: bool = False) -> None:
    """コース1件に紐づく全データを削除する（commitはしない）。
    forceがFalseの場合、在籍中（active/past_due）の学習者がいればHTTPExceptionを投げて中断する。"""
    active_subscriptions = db.query(CourseSubscription).filter(
        CourseSubscription.course_id == course_id,
        CourseSubscription.status.in_(["active", "past_due"]),
    ).count()
    if active_subscriptions > 0 and not force:
        raise HTTPException(status_code=409, detail=f"在籍中の学習者が{active_subscriptions}名います。先にコースを停止し、退会・返金対応の完了後に削除してください。")

    learner_profile_ids = [r[0] for r in db.query(LearnerProfile.id).filter(LearnerProfile.course_id == course_id).all()]
    if learner_profile_ids:
        db.query(LearnerRoadmap).filter(LearnerRoadmap.learner_profile_id.in_(learner_profile_ids)).delete(synchronize_session=False)
        db.query(LearnerCourseDay).filter(LearnerCourseDay.learner_profile_id.in_(learner_profile_ids)).delete(synchronize_session=False)
    db.query(LearnerProfile).filter(LearnerProfile.course_id == course_id).delete(synchronize_session=False)

    question_ids = [r[0] for r in db.query(Question.id).filter(Question.course_id == course_id).all()]
    if question_ids:
        db.query(Answer).filter(Answer.question_id.in_(question_ids)).delete(synchronize_session=False)
    db.query(Question).filter(Question.course_id == course_id).delete(synchronize_session=False)

    lesson_ids = [r[0] for r in db.query(Lesson.id).filter(Lesson.course_id == course_id).all()]
    if lesson_ids:
        db.query(LessonProgress).filter(LessonProgress.lesson_id.in_(lesson_ids)).delete(synchronize_session=False)
    db.query(Lesson).filter(Lesson.course_id == course_id).delete(synchronize_session=False)

    db.query(CourseDay).filter(CourseDay.course_id == course_id).delete(synchronize_session=False)
    db.query(CourseMaterial).filter(CourseMaterial.course_id == course_id).delete(synchronize_session=False)
    db.query(DayLog).filter(DayLog.course_id == course_id).delete(synchronize_session=False)
    db.query(DailySummary).filter(DailySummary.course_id == course_id).delete(synchronize_session=False)
    db.query(LearnerReview).filter(LearnerReview.course_id == course_id).delete(synchronize_session=False)
    db.query(NotificationSetting).filter(NotificationSetting.course_id == course_id).delete(synchronize_session=False)
    db.query(Purchase).filter(Purchase.course_id == course_id).delete(synchronize_session=False)
    db.query(CourseSubscription).filter(CourseSubscription.course_id == course_id).delete(synchronize_session=False)

    db.query(Course).filter(Course.id == course_id).delete(synchronize_session=False)


@router.delete("/courses/{course_id}")
def delete_course(course_id: int, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """コースを完全に削除する。在籍中（active/past_due）の学習者がいる場合は削除できない。要(管理者)"""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="コースが見つかりません")

    delete_course_cascade(db, course_id)
    db.commit()
    return {"message": "コースを削除しました"}


@router.put("/courses/{course_id}/unsuspend")
def unsuspend_course(course_id: int, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """コースの停止を解除する。要(管理者)"""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="コースが見つかりません")
    course.is_suspended = False
    course.suspension_reason = None
    db.commit()
    return {"message": "停止を解除しました"}


# ----- コース公開審査（運営承認）-----

@router.put("/courses/{course_id}/approve")
def approve_course(course_id: int, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """公開申請中(review)のコースを承認し、公開(published)にする。お気に入り登録者へ通知する。要(管理者)"""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="コースが見つかりません")
    if course.status != "review":
        raise HTTPException(status_code=400, detail="公開申請中のコースのみ承認できます")

    course.status = "published"

    creator_id = course.character.creator_id if course.character else None
    if creator_id is not None:
        favorite_user_ids = [
            f.user_id for f in db.query(Favorite).filter(Favorite.creator_id == creator_id).all()
        ]
        for user_id in favorite_user_ids:
            db.add(Notification(
                user_id=user_id,
                type="new_course",
                payload={"course_id": course.id, "title": course.title},
            ))

    db.commit()
    return {"message": "コースを承認し公開しました"}


@router.put("/courses/{course_id}/reject")
def reject_course(course_id: int, data: RejectRequest, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """公開申請中(review)のコースを却下し、draftに戻す。クリエイターにメールで理由を通知する。要(管理者)"""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="コースが見つかりません")
    if course.status != "review":
        raise HTTPException(status_code=400, detail="公開申請中のコースのみ却下できます")

    course.status = "draft"
    db.commit()

    creator_profile = (
        db.query(CreatorProfile).filter(CreatorProfile.id == course.character.creator_id).first()
        if course.character and course.character.creator_id else None
    )
    creator_user = db.query(Customer).filter(Customer.id == creator_profile.user_id).first() if creator_profile else None
    if creator_user and creator_user.email:
        reason_text = f"<p>理由: {data.reason}</p>" if data.reason else ""
        send_email(
            creator_user.email,
            "【ManaVillage】コースの公開申請について",
            f"<p>「{course.title}」の公開申請は今回見送りとなりました。内容を見直して再度申請してください。</p>{reason_text}",
        )
    return {"message": "コースを却下しました"}


# ----- G-03: ユーザーからの通報管理 -----

class ReportCreate(BaseModel):
    target_type: str  # course / creator
    target_id: int
    reason: str


@router.post("/reports", status_code=201)
def create_report(data: ReportCreate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """学習者がコース・クリエイターを通報する。要(ログイン済み)"""
    if data.target_type not in ("course", "creator"):
        raise HTTPException(status_code=400, detail="target_type は 'course' または 'creator' を指定してください")
    report = Report(reporter_id=current_user.id, target_type=data.target_type, target_id=data.target_id, reason=data.reason)
    db.add(report)
    db.commit()
    db.refresh(report)
    return {"id": report.id, "status": report.status}


@router.get("/reports")
def list_reports(admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """通報一覧（未対応優先）。要(管理者)"""
    reports = db.query(Report).order_by(Report.status, Report.created_at.desc()).all()
    return [
        {
            "id": r.id, "target_type": r.target_type, "target_id": r.target_id,
            "reason": r.reason, "status": r.status, "created_at": r.created_at,
        }
        for r in reports
    ]


@router.put("/reports/{report_id}/resolve")
def resolve_report(report_id: int, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """通報を対応済みにする。要(管理者)"""
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="通報が見つかりません")
    report.status = "resolved"
    db.commit()
    return {"message": "対応済みにしました"}


# ----- G-04: Tier B講師の回答状況監視（24時間未回答のアラート） -----

@router.get("/tier-b-overdue")
def list_tier_b_overdue(admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """全クリエイターを横断して、24時間以上未対応のTier B質問を一覧する。要(管理者)"""
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=24)
    questions = db.query(Question).filter(
        Question.status == "pending_instructor",
        Question.created_at < cutoff,
    ).order_by(Question.created_at).all()

    result = []
    for q in questions:
        creator_profile = None
        if q.course and q.course.character and q.course.character.creator_id:
            creator_profile = db.query(CreatorProfile).filter(CreatorProfile.id == q.course.character.creator_id).first()
        creator_user = db.query(Customer).filter(Customer.id == creator_profile.user_id).first() if creator_profile else None
        created_at = q.created_at if q.created_at.tzinfo else q.created_at.replace(tzinfo=timezone.utc)
        hours_elapsed = (now - created_at).total_seconds() / 3600
        result.append({
            "question_id": q.id,
            "course_title": q.course.title if q.course else None,
            "creator_username": creator_user.username if creator_user else None,
            "hours_elapsed": round(hours_elapsed, 1),
        })
    return result
