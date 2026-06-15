from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class ArticleTemplate(Base):
    """①記事作成依頼（文法・トピック）の第1段階で生成された、キャラ要素を含まない教育記事のストック。

    第2段階「キャラに適応」で、このストックの内容＋依頼キャラのトーン・親密度を反映して
    リライトする際の入力として再利用される（別キャラ・別顧客の同トピック依頼でも使い回せる）。
    """

    __tablename__ = "article_templates"

    id = Column(Integer, primary_key=True, index=True)
    topic = Column(String(200), nullable=False, index=True)
    difficulty = Column(String(10), nullable=False, default="medium")  # easy / medium / hard
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
