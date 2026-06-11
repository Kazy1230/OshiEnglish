from sqlalchemy import Column, Integer, String, Text, Boolean, JSON, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class Article(Base):
    __tablename__ = "articles"

    id = Column(Integer, primary_key=True, index=True)
    # 「依頼記事(request)」は customer_id・grammar_master_id が必須。
    # 「ブログ記事(blog)」はキャラクターが趣味で書いている体の簡易記事で、
    # 特定の顧客・文法トピックに紐付かないため、これらはNULL許容にしてある。
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True, index=True)
    character_id = Column(Integer, ForeignKey("characters.id"), nullable=False)
    grammar_master_id = Column(Integer, ForeignKey("grammar_masters.id"), nullable=True)
    article_type = Column(String(20), nullable=False, default="request")  # request / blog / exercise
    # ----- 演習問題（exercise）専用フィールド -----
    # exercise_format: "multiple_choice"（選択式：リーディング・リスニング等の自動採点問題）
    #                  "written_response"（記述式：ライティング・スピーキング等のキャラフィードバック前提の問題）
    exercise_format = Column(String(30), nullable=True)
    # exercise_category: 料金・メニュー表に対応する分類ラベル（例: "TOEIC Part 5" / "英検2級 ライティング"）
    exercise_category = Column(String(100), nullable=True)
    # exercise_data: 形式に応じた構造化データ（質問・選択肢・正解・解説、もしくはお題・評価観点メモ）をJSONで保持
    exercise_data = Column(JSON, nullable=True)
    title = Column(String(300), nullable=False)
    content = Column(Text, nullable=False)           # 本文 Markdown
    tips = Column(JSON, nullable=True)               # Tips リスト
    example_sentences = Column(JSON, nullable=True)  # 例文リスト
    status = Column(String(20), default="draft")     # draft / review / published
    is_llm_drafted = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    customer = relationship("Customer", back_populates="articles")
    character = relationship("Character", back_populates="articles")
    grammar_master = relationship("GrammarMaster", back_populates="articles")
    access_logs = relationship("AccessLog", back_populates="article")
