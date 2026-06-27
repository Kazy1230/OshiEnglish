from sqlalchemy import Column, Integer, String, JSON, Boolean
from app.core.database import Base


class Textbook(Base):
    """プリセット教材マスタ。クリエイターがコース作成時に検索して選択できる既存教材のカタログ。"""
    __tablename__ = "textbooks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    publisher = Column(String(255), nullable=True)
    type = Column(String(20), nullable=False, default="textbook")  # textbook / vocabulary
    target = Column(String(255), nullable=True)  # 対象セクション（例:「Section 1 Listening」）
    # 目次データ。例: [{"item": "Section 1 Listening - Part A..."}]
    toc = Column(JSON, nullable=True)
    is_preset = Column(Boolean, nullable=False, default=True)
