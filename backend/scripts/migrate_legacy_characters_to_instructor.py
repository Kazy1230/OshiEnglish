"""
ManaVillageマーケットプレイス化: 既存キャラクター(雪菜・零など)を講師プロフィールに移行するスクリプト
===========================================================================
main.py起動時にも自動実行される（簡易マイグレーション㉜）が、移行内容を手動で確認・
再実行したい場合にこのスクリプトを使う。

使い方:
  docker compose exec backend python scripts/migrate_legacy_characters_to_instructor.py

実行内容:
  - instructor_id未設定の既存キャラクターを全件取得
  - 自社運営講師アカウント customers.username='manavillage_official' (role='instructor') を
    存在しなければ作成し、対応する instructor_profiles レコードを用意する
  - 上記のキャラクター全てにinstructor_idを割り当てる
  （既に全キャラクターにinstructor_idが設定済みの場合は何もしない）
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import SessionLocal
from app.core.instructor_migration import migrate_legacy_characters_to_instructor


def main():
    db = SessionLocal()
    try:
        migrated_count = migrate_legacy_characters_to_instructor(db)
        if migrated_count == 0:
            print("✅ 移行対象のキャラクターはありません（すでに講師プロフィールに割り当て済みです）")
        else:
            db.commit()
            print(f"✅ {migrated_count} 件のキャラクターを講師プロフィール(manavillage_official)に割り当てました")
    except Exception as e:
        db.rollback()
        print(f"❌ エラーが発生しました: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
