import sys
sys.path.insert(0, "/app")
from app.core.database import SessionLocal
from app.models.purchase import Purchase
from app.models.lesson_progress import LessonProgress
from app.routers.payments import _handle_course_payment_succeeded

db = SessionLocal()
try:
    # Manually create a pending purchase to simulate /payments/checkout having run
    p = Purchase(user_id=3, course_id=1, amount=980, stripe_payment_intent_id="pi_test_123", status="pending")
    db.add(p)
    db.commit()
    print("created pending purchase id=", p.id)

    _handle_course_payment_succeeded(db, {"id": "pi_test_123"})

    db.refresh(p)
    print("purchase status after webhook:", p.status)

    progress = db.query(LessonProgress).filter(LessonProgress.user_id == 3).all()
    print("lesson_progress rows:", [(lp.lesson_id, lp.is_completed) for lp in progress])
finally:
    db.close()
