import sys
sys.path.insert(0, "/app")
from app.core.security import create_access_token
from app.core.database import SessionLocal
from app.models.customer import Customer

db = SessionLocal()
admin = db.query(Customer).filter(Customer.username == "admin").first()
print("ADMIN:" + create_access_token(data={"sub": str(admin.id), "role": admin.role}))
learner = db.query(Customer).filter(Customer.username == "test_doraemon").first()
if learner:
    print("LEARNER:" + create_access_token(data={"sub": str(learner.id), "role": learner.role}))
db.close()
