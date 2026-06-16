import random
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from app.models.article import Article
from app.models.customer import Customer
from app.models.order import Order
from app.core.credits import get_credit_settings, TEMPLATE_INTERVAL_MIN_DAYS, TEMPLATE_INTERVAL_MAX_DAYS, TEMPLATE_FIRST_DELIVERY_DAYS


def _ensure_template_stock_order(db: Session) -> None:
    """配布できる定期便プール記事が無い場合、受注リストに対応タスクを起票する
    （既に未対応のタスクがあれば重複登録しない）。"""
    existing = db.query(Order).filter(
        Order.order_type == "template_stock",
        Order.status != "delivered",
    ).first()
    if existing:
        return
    db.add(Order(
        customer_name="🗂 定期便プールの記事が不足しています",
        order_type="template_stock",
        status="new",
        notes="配布できる定期便プール記事がありません。記事管理タブで「定期便プール」記事を追加してください。",
    ))


def distribute_template_article_if_due(db: Session, customer: Customer) -> None:
    """定期便プール（article_type="template", customer_id=NULL）から、
    配布間隔（3〜5日のランダム）が経過していれば未配布の記事を1件コピーして
    顧客の本棚に追加する（無料配布・開封時にunlock_costを消費）。

    呼び出し元で変更があった場合のみ db.commit() すること。
    """
    now = datetime.now(timezone.utc)
    if customer.last_template_article_at:
        last = customer.last_template_article_at
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        # 配布間隔（3〜5日）は前回配布時刻から決定的に算出する。
        # 呼び出しごとに random.randint() し直すと、判定のたびに間隔が変わってしまい、
        # 「届くはずの日に再ロールで間隔が伸びて届かない」ことが起こり得るため。
        rng = random.Random(f"{customer.id}:{last.isoformat()}")
        interval_days = rng.randint(TEMPLATE_INTERVAL_MIN_DAYS, TEMPLATE_INTERVAL_MAX_DAYS)
        if (now - last) < timedelta(days=interval_days):
            return
    else:
        # 初回：アカウント作成から TEMPLATE_FIRST_DELIVERY_DAYS 日経過するまで配布しない
        created = customer.created_at
        if created is not None:
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            if (now - created) < timedelta(days=TEMPLATE_FIRST_DELIVERY_DAYS):
                return

    received_ids = [
        r[0] for r in db.query(Article.template_source_id).filter(
            Article.customer_id == customer.id,
            Article.template_source_id.isnot(None),
        ).all()
    ]

    query = db.query(Article).filter(
        Article.article_type == "template",
        Article.status == "published",
        Article.customer_id.is_(None),
    )
    if received_ids:
        query = query.filter(~Article.id.in_(received_ids))
    template = query.order_by(Article.id).first()

    if not template:
        # 配布できる定期便記事が無ければスキップ（last_template_article_atは更新しない）。
        # 運営側が気づけるよう、受注リストに対応タスクを起票する。
        _ensure_template_stock_order(db)
        return

    db.add(Article(
        customer_id=customer.id,
        character_id=customer.character_id or template.character_id,
        article_type="template",
        title=template.title,
        content=template.content,
        tips=template.tips,
        example_sentences=template.example_sentences,
        status="published",
        unlock_cost=template.unlock_cost or get_credit_settings(db).template_unlock_cost,
        template_source_id=template.id,
    ))
    customer.last_template_article_at = now
