from sqlalchemy import Column, Integer, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from app.core.database import Base


class ChatGreeting(Base):
    """学習者ごとの初回挨拶メッセージ。チャット履歴が空の間、開くたびに別の文面が
    生成されてしまわないよう、初回生成時に永続化して使い回す。"""
    __tablename__ = "chat_greetings"
    __table_args__ = (
        UniqueConstraint("user_id", "course_id", name="uq_chat_greetings_user_course"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
