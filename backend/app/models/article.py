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
    article_type = Column(String(20), nullable=False, default="request")  # request / blog / exercise / template
    # この記事の元になった「記事リクエスト」メッセージ（messages.is_request=True）への参照。
    # 公開時にこのメッセージの request_status を自動で completed にするために使う。
    request_message_id = Column(Integer, ForeignKey("messages.id"), nullable=True, index=True)
    # この記事の元になった「添削リクエスト」（お題のない自由提出のライティング/スピーキング）への参照。
    # 公開時にこのCorrectionRequestのstatusをcompletedにし、feedback_article_idをこの記事に設定する。
    correction_request_id = Column(Integer, ForeignKey("correction_requests.id"), nullable=True, index=True)
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
    # 「最初の1つ無料」ウェルカム記事のテンプレートかどうか。
    # テンプレート記事は customer_id=NULL のまま保持し、claim時に内容をコピーして顧客の本棚に追加する。
    is_welcome_template = Column(Boolean, default=False, nullable=False)
    # is_welcome_template=True の場合のみ使用。対象キャラクター（公式キャラ向けテンプレート）。
    # NULLの場合は「キャラクタービルダー使用（カスタムキャラ）」向けの汎用テンプレートを表す。
    template_character_id = Column(Integer, ForeignKey("characters.id"), nullable=True)
    # ----- クレジットによる開封課金 -----
    unlock_cost = Column(Integer, nullable=False, default=0)   # 開封に必要なクレジット（0=無料）
    opened_at = Column(DateTime(timezone=True), nullable=True)  # 顧客が開封（課金）した日時。NULL=未開封
    # テンプレ記事プール（article_type="template", customer_id=NULL）からこの記事の元になったテンプレートのID。
    # 同じテンプレートを同じ顧客に重複配布しないための履歴として使う。
    template_source_id = Column(Integer, ForeignKey("articles.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    customer = relationship("Customer", back_populates="articles")
    character = relationship("Character", back_populates="articles", foreign_keys=[character_id])
    grammar_master = relationship("GrammarMaster", back_populates="articles")
    access_logs = relationship("AccessLog", back_populates="article")
    correction_request = relationship("CorrectionRequest", foreign_keys=[correction_request_id])
