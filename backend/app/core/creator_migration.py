import re
import secrets

from sqlalchemy.orm import Session

from app.core.security import hash_password


def migrate_legacy_characters_to_creator(db: Session) -> int:
    """creator_id未設定の既存キャラクターを、自社運営クリエイターアカウントの配下に割り当てる。

    1クリエイター=1人格(キャラクター)の制約があるため、公式キャラクター1体ごとに
    専用のクリエイターアカウント（manavillage_official_<キャラ名のスラッグ>）を作成して割り当てる。

    呼び出し元でdb.commit()すること。割り当てたキャラクター数を返す。
    """
    from app.models.character import Character
    from app.models.customer import Customer
    from app.models.creator_profile import CreatorProfile

    orphan_characters = db.query(Character).filter(Character.creator_id.is_(None)).all()
    if not orphan_characters:
        return 0

    for character in orphan_characters:
        slug = re.sub(r"[^a-zA-Z0-9]+", "", character.name) or str(character.id)
        username = f"manavillage_official_{slug}".lower()

        official_user = db.query(Customer).filter(Customer.username == username).first()
        if official_user is None:
            official_user = Customer(
                username=username,
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

        character.creator_id = creator_profile.id

    return len(orphan_characters)


def dedupe_characters_per_creator(db: Session) -> int:
    """1クリエイターに複数キャラクターが紐づいている既存データを統合する。
    各creator_idで最も古い(id最小)キャラクターを残し、それ以外のキャラクターが持つ
    コースの紐付けを残すキャラクターに付け替えてから削除する。

    呼び出し元でdb.commit()すること。削除したキャラクター数を返す。
    """
    from sqlalchemy import func
    from app.models.character import Character
    from app.models.course import Course

    duplicated_creator_ids = [
        row[0]
        for row in db.query(Character.creator_id)
        .filter(Character.creator_id.isnot(None))
        .group_by(Character.creator_id)
        .having(func.count(Character.id) > 1)
        .all()
    ]
    if not duplicated_creator_ids:
        return 0

    deleted_count = 0
    for creator_id in duplicated_creator_ids:
        chars = (
            db.query(Character)
            .filter(Character.creator_id == creator_id)
            .order_by(Character.id.asc())
            .all()
        )
        keep, duplicates = chars[0], chars[1:]
        for dup in duplicates:
            db.query(Course).filter(Course.character_id == dup.id).update({"character_id": keep.id})
            db.delete(dup)
            deleted_count += 1

    return deleted_count
