"""30日カレンダー相談AIチャットの残高（クリエイター単位）を扱う共通ロジック。
メッセージ送信1回につき1消費し、0になると新規消費は失敗する（フロント側は外部AIツールへ誘導する）。"""
from sqlalchemy.orm import Session

from app.models.creator_profile import CreatorProfile


def get_ai_balance(db: Session, creator_profile_id: int) -> int:
    profile = db.query(CreatorProfile).filter(CreatorProfile.id == creator_profile_id).first()
    return profile.ai_chat_balance if profile else 0


def try_consume_ai_balance(db: Session, creator_profile_id: int) -> bool:
    """残高が1以上であれば1消費してTrueを返す。0ならFalseを返し何もしない。"""
    profile = db.query(CreatorProfile).filter(CreatorProfile.id == creator_profile_id).first()
    if not profile or profile.ai_chat_balance <= 0:
        return False
    profile.ai_chat_balance -= 1
    db.commit()
    return True
