from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class CorrectionRequest(Base):
    """お題のない「自由提出」の添削リクエスト（ライティング/スピーキング）。

    顧客がRequestArticleModalから「ライティング添削」「スピーキング添削」を選んだ場合や、
    キャラDMのCTAボタン経由で作成される。
    管理者はCorrectionsTabで一覧確認し、writing_feedback/speaking_feedback記事に変換して
    本棚へ配信する（その際 feedback_article_id を設定し status を completed にする）。
    """

    __tablename__ = "correction_requests"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    character_id = Column(Integer, ForeignKey("characters.id"), nullable=True)

    correction_type = Column(String(20), nullable=False)  # writing / speaking
    status = Column(String(20), nullable=False, default="pending")  # pending / in_progress / completed

    # ライティング: 提出本文。スピーキング: 補足メモ（音声/動画がない場合は実質の提出内容）。
    text_content = Column(Text, nullable=True)
    # スピーキング: アップロード/録音された音声・動画ファイルのパス（/static/correction_media/...）
    media_url = Column(String(500), nullable=True)
    media_type = Column(String(20), nullable=True)  # audio / video
    note = Column(Text, nullable=True)

    # 添削記事として配信された場合の参照（公開時に設定）
    feedback_article_id = Column(Integer, ForeignKey("articles.id"), nullable=True)

    # 演習問題（written_response、お題付き）からの提出の場合、元になった記事への参照。
    # 自由提出（お題なし）の場合はNULL。
    source_article_id = Column(Integer, ForeignKey("articles.id"), nullable=True, index=True)

    # スピーキング: 管理者が音声/動画を手動で文字起こしした結果を貼り付けておく欄（FB生成プロンプトの提出内容に使う）
    transcript = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    customer = relationship("Customer")
    character = relationship("Character")
    feedback_article = relationship("Article", foreign_keys=[feedback_article_id])
    source_article = relationship("Article", foreign_keys=[source_article_id])
