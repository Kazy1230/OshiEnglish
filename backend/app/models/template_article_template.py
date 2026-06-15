from sqlalchemy import Column, Integer, String, Text, JSON, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class TemplateArticleTemplate(Base):
    """定期便プールの第1段階で生成された、キャラ要素を含まない素材記事のストック。

    第2段階「キャラに適応」で、このストックの内容（content/example_sentences/tips）に
    キャラのトーンを反映してリライトし、article_type="template" の記事として保存する際の
    入力として再利用される。
    """

    __tablename__ = "template_article_templates"

    id = Column(Integer, primary_key=True, index=True)
    topic = Column(String(200), nullable=True, index=True)
    difficulty = Column(String(10), nullable=False, default="medium")  # easy / medium / hard
    content = Column(Text, nullable=False)
    example_sentences = Column(JSON, nullable=True)
    tips = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
