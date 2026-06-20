import sys
sys.path.insert(0, "/app")
from app.core.security import create_access_token
from app.core.database import SessionLocal
from app.models.customer import Customer

db = SessionLocal()
admin = db.query(Customer).filter(Customer.username == "admin").first()
token = create_access_token(data={"sub": str(admin.id), "role": admin.role})
print(token)
db.close()
