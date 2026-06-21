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
from app.models.report import Report

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
