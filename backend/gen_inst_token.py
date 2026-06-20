import sys
sys.path.insert(0, "/app")
from app.core.security import create_access_token
from app.core.database import SessionLocal
from app.models.customer import Customer

db = SessionLocal()
inst = db.query(Customer).filter(Customer.username == "manavillage_official").first()
token = create_access_token(data={"sub": str(inst.id), "role": inst.role})
print(token)
db.close()
