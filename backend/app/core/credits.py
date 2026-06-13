from typing import Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.customer import Customer
from app.models.credit_transaction import CreditTransaction


def grant_credits(
    db: Session,
    customer: Customer,
    amount: int,
    reason: str,
    stripe_session_id: Optional[str] = None,
) -> None:
    """顧客のクレジット残高を加算し、台帳に記録する"""
    customer.credit_balance = (customer.credit_balance or 0) + amount
    db.add(CreditTransaction(
        customer_id=customer.id,
        amount=amount,
        reason=reason,
        balance_after=customer.credit_balance,
        stripe_session_id=stripe_session_id,
    ))


def consume_credits(
    db: Session,
    customer: Customer,
    amount: int,
    reason: str,
    related_message_id: Optional[int] = None,
) -> None:
    """顧客のクレジット残高を消費し、台帳に記録する。残高不足の場合は402を返す"""
    balance = customer.credit_balance or 0
    if balance < amount:
        raise HTTPException(status_code=402, detail="クレジットが不足しています")
    customer.credit_balance = balance - amount
    db.add(CreditTransaction(
        customer_id=customer.id,
        amount=-amount,
        reason=reason,
        balance_after=customer.credit_balance,
        related_message_id=related_message_id,
    ))
