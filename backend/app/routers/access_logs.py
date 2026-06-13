from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import get_db
from app.core.security import get_current_admin
from app.models.access_log import AccessLog
from app.models.customer import Customer
from app.models.article import Article

router = APIRouter(prefix="/access-logs", tags=["アクセスログ（管理者）"])

def serialize_log(log: AccessLog) -> dict:
    return {
        "id": log.id,
        "customer_id": log.customer_id,
        "article_id": log.article_id,
        "ip_address": log.ip_address,
        "accessed_at": log.accessed_at.isoformat() if log.accessed_at else None,
    }

@router.get("/")
def list_access_logs(
    limit: int = 500,
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """全アクセスログ一覧（最新N件）"""
    logs = db.query(AccessLog).order_by(AccessLog.accessed_at.desc()).limit(limit).all()
    return [serialize_log(l) for l in logs]

@router.get("/customer/{customer_id}")
def get_customer_logs(
    customer_id: int,
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """顧客ごとのアクセスログ + 閲覧率サマリー"""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="顧客が見つかりません")

    # 顧客の公開済み記事数（タイプ別）
    total_request_articles = db.query(Article).filter(
        Article.customer_id == customer_id,
        Article.status == "published",
        Article.article_type == "request",
    ).count()
    total_exercises = db.query(Article).filter(
        Article.customer_id == customer_id,
        Article.status == "published",
        Article.article_type == "exercise",
    ).count()
    total_articles = total_request_articles + total_exercises  # 後方互換のため残す

    # アクセスログ（全件、新しい順）
    logs = db.query(AccessLog).filter(
        AccessLog.customer_id == customer_id
    ).order_by(AccessLog.accessed_at.desc()).all()

    # 重複除いた閲覧記事ID（依頼記事のみで既読率を算出——演習問題は「解く」もので「読む」ものではないため）
    all_log_article_ids = {log.article_id for log in logs}
    # ログに含まれる記事のタイプを一括取得
    if all_log_article_ids:
        logged_articles = db.query(Article.id, Article.article_type).filter(
            Article.id.in_(all_log_article_ids)
        ).all()
        request_article_ids = {a.id for a in logged_articles if a.article_type == "request"}
        exercise_ids = {a.id for a in logged_articles if a.article_type == "exercise"}
    else:
        request_article_ids = set()
        exercise_ids = set()

    last_access = logs[0].accessed_at if logs else None

    # ログ一覧に記事タイトルを付与するため一括取得
    article_titles: dict[int, str] = {}
    if all_log_article_ids:
        for a_id, a_title in db.query(Article.id, Article.title).filter(
            Article.id.in_(all_log_article_ids)
        ).all():
            article_titles[a_id] = a_title

    return {
        "customer_id": customer_id,
        "username": customer.username,
        # 依頼記事の既読率（メインKPI：もらった記事をちゃんと読んでいるかの指標）
        "total_articles": total_request_articles,
        "read_count": len(request_article_ids),
        "read_rate": round(len(request_article_ids) / total_request_articles * 100, 1) if total_request_articles > 0 else 0,
        # 演習問題の取り組み状況（別途表示用）
        "total_exercises": total_exercises,
        "exercise_accessed_count": len(exercise_ids),
        # 全体
        "total_all": total_articles,
        "last_access": last_access.isoformat() if last_access else None,
        "logs": [
            {
                "article_id": l.article_id,
                "article_title": article_titles.get(l.article_id),
                "accessed_at": l.accessed_at.isoformat() if l.accessed_at else None,
                "ip": l.ip_address,
            }
            for l in logs
        ],
    }

@router.delete("/cleanup")
def cleanup_old_logs(
    older_than_days: int = 180,
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """指定日数より古いアクセスログを一括削除する（リテンション運用用）。

    起動時にも180日を超えた分は自動で削除されるが、
    運用上すぐに削除したい場合や、保持期間を変更したい場合に管理者が手動実行できるようにする。
    """
    if older_than_days < 1:
        raise HTTPException(status_code=400, detail="older_than_daysは1以上を指定してください")
    cutoff = datetime.utcnow() - timedelta(days=older_than_days)
    deleted = db.query(AccessLog).filter(AccessLog.accessed_at < cutoff).delete(synchronize_session=False)
    db.commit()
    return {"message": f"{deleted}件のログを削除しました"}


@router.delete("/customer/{customer_id}")
def clear_customer_logs(
    customer_id: int,
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """顧客のアクセスログを全削除（管理用）"""
    deleted = db.query(AccessLog).filter(AccessLog.customer_id == customer_id).delete()
    db.commit()
    return {"message": f"{deleted}件のログを削除しました"}
