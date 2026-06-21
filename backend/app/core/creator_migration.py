import secrets

from sqlalchemy.orm import Session

from app.core.security import hash_password


def migrate_legacy_characters_to_creator(db: Session) -> int:
    """creator_id未設定の既存キャラクターを、自社運営クリエイターアカウントの配下に割り当てる
    （Phase 1は自社運営のみのため、既存公式キャラは1つのクリエイタープロフィールに集約する）。

    呼び出し元でdb.commit()すること。割り当てたキャラクター数を返す。
    """
    from app.models.character import Character
    from app.models.customer import Customer
    from app.models.creator_profile import CreatorProfile

    orphan_characters = db.query(Character).filter(Character.creator_id.is_(None)).all()
    if not orphan_characters:
        return 0

    official_user = db.query(Customer).filter(Customer.username == "manavillage_official").first()
    if official_user is None:
        official_user = Customer(
            username="manavillage_official",
            hashed_password=hash_password(secrets.token_urlsafe(24)),
            role="creator",
            is_password_reset_required=True,
        )
        db.add(official_user)
        db.flush()

    creator_profile = db.query(CreatorProfile).filter(
        CreatorProfile.user_id == official_user.id
    ).first()
    if creator_profile is None:
        creator_profile = CreatorProfile(user_id=official_user.id, status="active")
        db.add(creator_profile)
        db.flush()

    for character in orphan_characters:
        character.creator_id = creator_profile.id

    return len(orphan_characters)
