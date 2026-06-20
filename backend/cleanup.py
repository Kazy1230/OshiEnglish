import sys
sys.path.insert(0, "/app")
from app.core.database import SessionLocal
from app.models.purchase import Purchase
from app.models.lesson_progress import LessonProgress

db = SessionLocal()
try:
    db.query(LessonProgress).filter(LessonProgress.user_id == 3).delete()
    db.query(Purchase).filter(Purchase.stripe_payment_intent_id == "pi_test_123").delete()
    db.commit()
    print("cleaned up test data")
finally:
    db.close()
