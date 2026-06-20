import sys
sys.path.insert(0, "/app")
from app.core.database import SessionLocal
from app.models.purchase import Purchase
from app.models.customer import Customer

db = SessionLocal()
learner = db.query(Customer).filter(Customer.username == "test_doraemon").first()
p = Purchase(user_id=learner.id, course_id=1, amount=980, stripe_payment_intent_id="pi_test_progress_1", status="succeeded")
db.add(p)
db.commit()
print("created purchase id=", p.id, "user_id=", learner.id)
db.close()
