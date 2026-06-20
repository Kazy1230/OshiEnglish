from typing import Optional
from sqlalchemy.orm import Session

from app.models.customer import Customer

# ----- クレジット制決済システムは廃止済み(ManaVillageマーケットプレイス化で courses/purchases に置き換え) -----
# DB上のcredit_balance/CreditTransaction/unlock_costは削除済み。
# 呼び出し元(messages.py/articles.py/payments.py等)がまだ参照しているため、
# 当面は何もしないスタブとして残し、Step3のコース購入フロー実装時に呼び出し元を含めて置き換える。

# キャラクターへのDM（チャット）送信1回あたりの消費クレジット数（廃止・現在は未使用）
DM_SEND_COST = 0
# 記事・問題リクエスト時に即時消費する固定費（廃止・現在は未使用）
ARTICLE_REQUEST_FEE = 0
# クライアントから送られてくるcredit_costの許可値（廃止・現在は未使用）
ALLOWED_ARTICLE_REQUEST_CREDIT_COSTS = {200, 400}
# 定期便の配布間隔（日数）：このランダムな範囲から毎回間隔を決める
TEMPLATE_INTERVAL_MIN_DAYS = 3
TEMPLATE_INTERVAL_MAX_DAYS = 5
# 初回定期便を届けるまでの待機日数（アカウント作成から）
TEMPLATE_FIRST_DELIVERY_DAYS = 4

# 毎日ログインボーナスとして付与していたクレジット数（廃止・現在は未使用）
DAILY_LOGIN_BONUS = 0
DAILY_LOGIN_BONUS_CAP = 0


def grant_credits(
    db: Session,
    customer: Customer,
    amount: int,
    reason: str,
    stripe_session_id: Optional[str] = None,
) -> None:
    """クレジット制度は廃止済み。何もしない(呼び出し元の互換のためのスタブ)。"""
    return


def consume_credits(
    db: Session,
    customer: Customer,
    amount: int,
    reason: str,
    related_message_id: Optional[int] = None,
) -> None:
    """クレジット制度は廃止済み。何もしない(呼び出し元の互換のためのスタブ)。"""
    return
