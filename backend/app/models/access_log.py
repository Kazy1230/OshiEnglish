from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class AccessLog(Base):
    __tablename__ = "access_logs"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    article_id = Column(Integer, ForeignKey("articles.id"), nullable=False, index=True)
    ip_address = Column(String(50), nullable=True)
    accessed_at = Column(DateTime(timezone=True), server_default=func.now())

    customer = relationship("Customer", back_populates="access_logs")
    article = relationship("Article", back_populates="access_logs")
