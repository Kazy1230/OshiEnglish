from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Message(Base):
    """
    顧客とキャラクターの「DM」スレッド。
    sender='customer' は顧客本人からのメッセージ（記事リクエストを含む）、
    sender='character' は運営者がキャラクターになりきって送る返信
    （記事完成の知らせ・ご褒美写真の送付などもここに含まれる）。
    """
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    character_id = Column(Integer, ForeignKey("characters.id"), nullable=True)

    sender = Column(String(20), nullable=False)       # customer / character
    content = Column(Text, nullable=True)             # テキスト本文
    image_url = Column(String(500), nullable=True)    # ご褒美写真などの画像パス

    is_request = Column(Boolean, default=False)       # 記事リクエストかどうか
    grammar_topic = Column(String(300), nullable=True)  # リクエストされた文法トピック
    request_status = Column(String(20), nullable=True)  # pending / accepted / completed（リクエストのみ使用）

    is_reward = Column(Boolean, default=False)        # ご褒美写真メッセージかどうか
    is_read = Column(Boolean, default=False)          # 顧客が既読したか（character→customer向け）

    # 記述式演習の解答提出メッセージかどうか（添削専用画面で一覧表示するため）
    is_exercise_submission = Column(Boolean, default=False)
    # 演習問題（記事）への参照。添削下書き生成時にお題（exercise_data.prompt）を引くために使用する。
    article_id = Column(Integer, ForeignKey("articles.id"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    customer = relationship("Customer", back_populates="messages")
    character = relationship("Character")
    article = relationship("Article")
