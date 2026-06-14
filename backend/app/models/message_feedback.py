from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base


class MessageFeedback(Base):
    """
    チャット内のキャラ返信に対する顧客の👍👎評価。
    管理画面の「修正サジェスト一覧」で確認し、TONE_PROFILE（reaction_examples/ng_expressions）への
    反映や無視を行うための下書きデータとして保持する。
    """
    __tablename__ = "message_feedback"

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("messages.id"), nullable=False, index=True)
    character_id = Column(Integer, ForeignKey("characters.id"), nullable=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)

    rating = Column(String(10), nullable=False)  # good / bad
    message_content = Column(Text, nullable=True)  # 評価対象メッセージの本文スナップショット
    status = Column(String(20), nullable=False, default="pending")  # pending / reviewed

    created_at = Column(DateTime(timezone=True), server_default=func.now())
