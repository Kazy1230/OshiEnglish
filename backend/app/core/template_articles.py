import random
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from app.models.article import Article
from app.models.customer import Customer
from app.core.credits import TEMPLATE_UNLOCK_COST, TEMPLATE_INTERVAL_MIN_DAYS, TEMPLATE_INTERVAL_MAX_DAYS


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
        interval_days = random.randint(TEMPLATE_INTERVAL_MIN_DAYS, TEMPLATE_INTERVAL_MAX_DAYS)
        if (now - last) < timedelta(days=interval_days):
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
        return  # 配布できる定期便記事が無ければスキップ（last_template_article_atは更新しない）

    db.add(Article(
        customer_id=customer.id,
        character_id=customer.character_id or template.character_id,
        article_type="template",
        title=template.title,
        content=template.content,
        tips=template.tips,
        example_sentences=template.example_sentences,
        status="published",
        unlock_cost=template.unlock_cost or TEMPLATE_UNLOCK_COST,
        template_source_id=template.id,
    ))
    customer.last_template_article_at = now
