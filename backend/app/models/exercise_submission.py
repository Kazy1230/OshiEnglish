from sqlalchemy import Column, Integer, Boolean, Float, JSON, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base


class ExerciseSubmission(Base):
    """選択式演習問題（リーディング・リスニング）の設問ごとの解答記録。

    顧客が設問を選んだ瞬間にロックされ、この記録が作成される。
    記事全体は再挑戦可能なため、挑戦ごとに attempt_number を増やして新しい記録セットを作る
    （過去の挑戦履歴も保持する）。将来的なAI活用（傾向分析・適応学習の教材選定など）を想定したログ。
    """

    __tablename__ = "exercise_submissions"

    id = Column(Integer, primary_key=True, index=True)
    article_id = Column(Integer, ForeignKey("articles.id"), nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    attempt_number = Column(Integer, nullable=False, default=1)
    question_index = Column(Integer, nullable=False)
    chosen_index = Column(Integer, nullable=True)
    is_correct = Column(Boolean, nullable=False)
    time_taken = Column(Float, nullable=True)  # 解答にかかった時間（秒）
    customer_proficiency_snapshot = Column(JSON, nullable=True)  # 解答時点の親密度・クレジット残高等のスナップショット
    answered_at = Column(DateTime(timezone=True), server_default=func.now())

    article = relationship("Article")
    customer = relationship("Customer")
