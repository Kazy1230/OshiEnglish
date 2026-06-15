from sqlalchemy import Column, Integer, String, JSON, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class ExerciseTemplate(Base):
    """②演習問題（選択式：リーディング・リスニング）の第1段階で生成された、
    キャラ要素を含まない問題本体（questions/choices/correct_index、音声情報含む）のストック。

    第2段階「キャラに適応」で、このストックの問題本体に依頼キャラのトーン・親密度を反映した
    explanation_*/score_comments を統合し、最終的なexercise_dataを完成させる。
    """

    __tablename__ = "exercise_templates"

    id = Column(Integer, primary_key=True, index=True)
    exercise_category = Column(String(100), nullable=False, index=True)
    difficulty = Column(String(10), nullable=False, default="medium")  # easy / medium / hard
    exercise_data = Column(JSON, nullable=False)  # questions本体・音声情報のみ（解説・score_commentsは含まない）
    created_at = Column(DateTime(timezone=True), server_default=func.now())
