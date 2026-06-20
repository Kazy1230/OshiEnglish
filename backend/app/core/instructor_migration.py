import secrets

from sqlalchemy.orm import Session

from app.core.security import hash_password


def migrate_legacy_characters_to_instructor(db: Session) -> int:
    """instructor_id未設定の既存キャラクターを、自社運営講師アカウントの配下に割り当てる
    （Phase 1は自社運営のみのため、雪菜・零などの既存公式キャラは1つの講師プロフィールに集約する）。

    呼び出し元でdb.commit()すること。割り当てたキャラクター数を返す。
    """
    from app.models.character import Character
    from app.models.customer import Customer
    from app.models.instructor_profile import InstructorProfile

    orphan_characters = db.query(Character).filter(Character.instructor_id.is_(None)).all()
    if not orphan_characters:
        return 0

    official_user = db.query(Customer).filter(Customer.username == "manavillage_official").first()
    if official_user is None:
        official_user = Customer(
            username="manavillage_official",
            hashed_password=hash_password(secrets.token_urlsafe(24)),
            role="instructor",
            is_password_reset_required=True,
        )
        db.add(official_user)
        db.flush()

    instructor_profile = db.query(InstructorProfile).filter(
        InstructorProfile.user_id == official_user.id
    ).first()
    if instructor_profile is None:
        instructor_profile = InstructorProfile(user_id=official_user.id, status="active")
        db.add(instructor_profile)
        db.flush()

    for character in orphan_characters:
        character.instructor_id = instructor_profile.id

    return len(orphan_characters)
