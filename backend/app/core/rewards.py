from sqlalchemy import func, or_, and_
from sqlalchemy.orm import Session

from app.core.intimacy import compute_intimacy_level
from app.models.article import Article
from app.models.character import Character
from app.models.reward import RewardItem, CustomerReward


def get_article_request_count(db: Session, customer_id: int) -> int:
    """顧客の累計「記事依頼回数」（依頼記事の作成数。ステータス問わず）を返す。"""
    return db.query(func.count(Article.id)).filter(
        Article.customer_id == customer_id,
        Article.article_type == "request",
    ).scalar() or 0


def check_and_unlock_rewards(db: Session, customer) -> list[RewardItem]:
    """親密度レベル・記事依頼回数の達成状況をもとに、未解放の報酬を解放する（コストゼロ・純DB処理）。

    新たに解放されたRewardItemのリストを返す（フロントエンドの解放演出に使用）。
    db.commit() はこの関数の中では行わない（呼び出し元の既存コミットに乗せる）。
    """
    if not customer.character_id:
        return []

    level = compute_intimacy_level(customer.intimacy_points or 0)
    article_count = get_article_request_count(db, customer.id)

    candidates = db.query(RewardItem).filter(
        RewardItem.character_id == customer.character_id,
        or_(
            and_(RewardItem.trigger_type == "intimacy", RewardItem.threshold <= level),
            and_(RewardItem.trigger_type == "article_count", RewardItem.threshold <= article_count),
        ),
    ).all()

    if not candidates:
        return []

    # 公式キャラ限定の報酬は、公式キャラ（is_preset）を選んだ顧客のみ解放対象とする
    if any(c.official_only for c in candidates):
        character = db.query(Character).filter(Character.id == customer.character_id).first()
        is_preset = bool(character and character.is_preset)
        if not is_preset:
            candidates = [c for c in candidates if not c.official_only]
        if not candidates:
            return []

    unlocked_ids = {
        row[0] for row in db.query(CustomerReward.reward_item_id).filter(
            CustomerReward.customer_id == customer.id,
            CustomerReward.reward_item_id.in_([c.id for c in candidates]),
        ).all()
    }

    newly_unlocked = []
    for item in candidates:
        if item.id in unlocked_ids:
            continue
        db.add(CustomerReward(customer_id=customer.id, reward_item_id=item.id))
        newly_unlocked.append(item)

    return newly_unlocked
