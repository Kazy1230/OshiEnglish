import sys
sys.path.insert(0, "/app")
from app.core.database import SessionLocal
from app.models.purchase import Purchase
from app.models.lesson_progress import LessonProgress
from app.models.course import Course
from app.models.notification import Notification

db = SessionLocal()
db.query(LessonProgress).filter(LessonProgress.lesson_id == 1).delete()
db.query(Purchase).filter(Purchase.stripe_payment_intent_id == "pi_test_progress_1").delete()
course = db.query(Course).filter(Course.id == 3).first()
if course:
    for l in list(course.lessons):
        db.delete(l)
    db.delete(course)
db.query(Notification).filter(Notification.payload.isnot(None)).filter(
    Notification.type == "new_course"
).filter(Notification.id.in_([1, 2])).delete(synchronize_session=False)
db.commit()
print("cleaned up")
db.close()
