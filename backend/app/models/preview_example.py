from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base


class PreviewExample(Base):
    """
    キャラクター作成後、顧客の初回ログイン時に表示する「プレビュー」用の会話例文。
    管理者が外部LLMで生成した例文（ユーザー発言・キャラ応答のペア）を1〜5番として保存し、
    顧客が各例文を👍（ぴったり）／🤔（少し違う）で評価する。
    🤔の場合は feedback_text に修正コメントを残せる（修正リクエスト一覧で確認）。
    """
    __tablename__ = "preview_examples"

    id = Column(Integer, primary_key=True, index=True)
    character_id = Column(Integer, ForeignKey("characters.id"), nullable=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)

    example_number = Column(Integer, nullable=False)  # 1〜5
    user_message = Column(Text, nullable=False)
    character_response = Column(Text, nullable=False)

    rating = Column(String(20), nullable=True)  # good / unsure
    feedback_text = Column(Text, nullable=True)  # unsureの場合の修正コメント

    created_at = Column(DateTime(timezone=True), server_default=func.now())
