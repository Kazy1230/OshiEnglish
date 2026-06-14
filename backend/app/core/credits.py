from typing import Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.customer import Customer
from app.models.credit_transaction import CreditTransaction

# キャラクターへのDM（チャット）送信1回あたりの消費クレジット数
DM_SEND_COST = 1
# 記事・問題リクエスト時に即時消費する固定費（合計の一部）。残りは記事のunlock_costとして開封時に消費する。
ARTICLE_REQUEST_FEE = 50
# 記事・問題リクエスト時にcredit_costとして指定可能な合計クレジット数（料金表の各項目はこのいずれか）。
# クライアントから送られてくるcredit_costはこの集合に含まれる値のみ許可する。
ALLOWED_ARTICLE_REQUEST_CREDIT_COSTS = {200, 400}
# 定期便（無料配布・開封課金）の開封コストのデフォルト値（管理画面の「料金・メニュー」で変更可能。CreditSettings未作成時のフォールバック）
TEMPLATE_UNLOCK_COST = 50
# 定期便の配布間隔（日数）：このランダムな範囲から毎回間隔を決める
TEMPLATE_INTERVAL_MIN_DAYS = 3
TEMPLATE_INTERVAL_MAX_DAYS = 5


def get_credit_settings(db: Session):
    """クレジット関連の料金設定（シングルトン行）を取得する。存在しない場合はデフォルト値で作成する。"""
    from app.models.credit_settings import CreditSettings

    settings_row = db.query(CreditSettings).filter(CreditSettings.id == 1).first()
    if not settings_row:
        settings_row = CreditSettings(id=1, template_unlock_cost=TEMPLATE_UNLOCK_COST)
        db.add(settings_row)
        db.commit()
        db.refresh(settings_row)
    return settings_row

# 毎日ログインボーナスとして付与するクレジット数
DAILY_LOGIN_BONUS = 10
# ログインボーナスでクレジット残高がこの値を超えるまで付与する（無課金でも記事・定期便の開封ができる程度の範囲に留める）
DAILY_LOGIN_BONUS_CAP = 50


def grant_credits(
    db: Session,
    customer: Customer,
    amount: int,
    reason: str,
    stripe_session_id: Optional[str] = None,
) -> None:
    """顧客のクレジット残高を加算し、台帳に記録する"""
    customer.credit_balance = (customer.credit_balance or 0) + amount
    db.add(CreditTransaction(
        customer_id=customer.id,
        amount=amount,
        reason=reason,
        balance_after=customer.credit_balance,
        stripe_session_id=stripe_session_id,
    ))


def consume_credits(
    db: Session,
    customer: Customer,
    amount: int,
    reason: str,
    related_message_id: Optional[int] = None,
) -> None:
    """顧客のクレジット残高を消費し、台帳に記録する。残高不足の場合は402を返す"""
    balance = customer.credit_balance or 0
    if balance < amount:
        raise HTTPException(status_code=402, detail="クレジットが不足しています")
    customer.credit_balance = balance - amount
    db.add(CreditTransaction(
        customer_id=customer.id,
        amount=-amount,
        reason=reason,
        balance_after=customer.credit_balance,
        related_message_id=related_message_id,
    ))
