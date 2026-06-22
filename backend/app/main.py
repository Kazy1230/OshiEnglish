import asyncio
import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from app.core.database import Base, engine, SessionLocal
from app.core.config import settings
from app.routers import auth, customers, characters, payments, courses, creators, favorites, studio, notifications, interview, diagnosis, chat, admin

logger = logging.getLogger(__name__)


# 簡易マイグレーション: create_all は既存テーブルへの列追加・削除・テーブル削除を行わないため、
# 存在チェックのうえ ALTER TABLE / DROP TABLE で補う
def _column_exists(table: str, column: str) -> bool:
    with engine.connect() as conn:
        result = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_schema = DATABASE() AND table_name = :table AND column_name = :column"
        ), {"table": table, "column": column})
        return result.scalar() > 0


def _table_exists(table: str) -> bool:
    with engine.connect() as conn:
        result = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.tables "
            "WHERE table_schema = DATABASE() AND table_name = :table"
        ), {"table": table})
        return result.scalar() > 0


def _ensure_column(table: str, column: str, ddl: str):
    if _table_exists(table) and not _column_exists(table, column):
        with engine.connect() as conn:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
            conn.commit()


def _drop_foreign_keys_on_column(table: str, column: str):
    """指定カラムに紐づく外部キー制約を全て削除する（DROP COLUMN前に必要）。"""
    if not _table_exists(table):
        return
    with engine.connect() as conn:
        result = conn.execute(text(
            "SELECT CONSTRAINT_NAME FROM information_schema.key_column_usage "
            "WHERE table_schema = DATABASE() AND table_name = :table AND column_name = :column "
            "AND referenced_table_name IS NOT NULL"
        ), {"table": table, "column": column})
        fk_names = [row[0] for row in result]
        for fk_name in fk_names:
            conn.execute(text(f"ALTER TABLE {table} DROP FOREIGN KEY {fk_name}"))
        if fk_names:
            conn.commit()


def _drop_column(table: str, column: str):
    if _table_exists(table) and _column_exists(table, column):
        _drop_foreign_keys_on_column(table, column)
        with engine.connect() as conn:
            conn.execute(text(f"ALTER TABLE {table} DROP COLUMN {column}"))
            conn.commit()


def _drop_table(table: str):
    if _table_exists(table):
        with engine.connect() as conn:
            conn.execute(text(f"DROP TABLE {table}"))
            conn.commit()


def _rename_table(old: str, new: str):
    if _table_exists(old) and not _table_exists(new):
        with engine.connect() as conn:
            conn.execute(text(f"RENAME TABLE {old} TO {new}"))
            conn.commit()


def _rename_column(table: str, old: str, new: str, ddl: str):
    if _table_exists(table) and _column_exists(table, old) and not _column_exists(table, new):
        with engine.connect() as conn:
            conn.execute(text(f"ALTER TABLE {table} CHANGE COLUMN {old} {new} {ddl}"))
            conn.commit()


# テーブルリネームは create_all() より前に行う必要がある
# （create_all()は存在しないテーブルを新規作成するため、先にcreate_all()すると
#   リネーム先の名前で空テーブルが作られてしまい、リネームが「既に存在する」扱いでスキップされる）
_rename_table("instructor_profiles", "creator_profiles")

# テーブル自動作成（開発用。本番はAlembicマイグレーションを使用）
Base.metadata.create_all(bind=engine)

# --- Phase 0: 旧「推しEnglish」システム（DM/記事/報酬/クレジット/受注）の完全廃止 ---
with engine.connect() as _conn:
    _conn.execute(text("SET FOREIGN_KEY_CHECKS=0"))
    _conn.commit()
for _legacy_table in (
    "articles", "article_templates", "template_article_templates", "exercise_templates",
    "exercise_submissions", "grammar_masters", "correction_requests", "customer_rewards",
    "reward_items", "preview_examples", "messages", "message_feedback", "service_items",
    "orders", "access_logs", "intimacy_settings", "credit_transactions", "credit_settings",
):
    _drop_table(_legacy_table)
with engine.connect() as _conn:
    _conn.execute(text("SET FOREIGN_KEY_CHECKS=1"))
    _conn.commit()

for _col in (
    "character_memory", "intimacy_points", "last_login_bonus_date", "free_content_claimed",
    "character_ready_announced", "last_template_article_at", "assigned_admin_id", "admin_memo",
    "preview_ready", "preview_submitted", "is_admin", "credit_balance", "priority",
):
    _drop_column("customers", _col)

for _col in ("greeting", "greetings", "reward_progress_template", "chat_footer_note", "instagram_account"):
    _drop_column("characters", _col)

# --- instructor → creator 用語統一（テーブルリネームはcreate_all()より前で実施済み） ---
_rename_column("characters", "instructor_id", "creator_id", "INT NULL")
_rename_column("favorites", "instructor_id", "creator_id", "INT NOT NULL")

if _column_exists("customers", "role"):
    with engine.connect() as _conn:
        _conn.execute(text("UPDATE customers SET role = 'creator' WHERE role = 'instructor'"))
        _conn.commit()

# --- Phase 1: クリエイター・パーソナリティプロフィール ---
_ensure_column("creator_profiles", "speciality", "VARCHAR(255) NULL")
_ensure_column("creator_profiles", "experience", "TEXT NULL")

# --- Phase 2: コース構造・90日間コース生成 ---
_ensure_column("courses", "goal", "VARCHAR(255) NULL")
_ensure_column("courses", "target_learner", "TEXT NULL")
_ensure_column("courses", "intensity", "VARCHAR(100) NULL")
_ensure_column("courses", "personality_profile_id", "INT NULL")
_ensure_column("courses", "days_generation_status", "VARCHAR(20) NOT NULL DEFAULT 'idle'")
_ensure_column("courses", "days_generation_error", "TEXT NULL")

# --- Phase 4: Stripeサブスクリプション（Tier A/B） ---
_ensure_column("courses", "tier_a_price", "INT NULL")
_ensure_column("courses", "tier_b_price", "INT NULL")

# --- Phase 9: 管理者・収益管理 ---
_ensure_column("courses", "is_suspended", "BOOLEAN NOT NULL DEFAULT FALSE")
_ensure_column("courses", "suspension_reason", "TEXT NULL")

# --- 質問カテゴリの承認制（既存カテゴリは導入前から使われていたものとして自動承認扱いにする） ---
_ensure_column("question_categories", "status", "VARCHAR(20) NOT NULL DEFAULT 'approved'")


def _migrate_legacy_characters_to_creator():
    from app.core.creator_migration import migrate_legacy_characters_to_creator

    db = SessionLocal()
    try:
        migrate_legacy_characters_to_creator(db)
        db.commit()
    finally:
        db.close()


def _ensure_preset_characters():
    """公式キャラクターが characters テーブルに存在することを保証する。"""
    from app.models.character import Character
    presets = [
        {"name": "白河雪菜"},
        {"name": "蒼井零"},
        {"name": "Chloe"},
        {"name": "Frederick"},
    ]
    db = SessionLocal()
    try:
        for p in presets:
            char = db.query(Character).filter(Character.name == p["name"]).first()
            if char is None:
                db.add(Character(name=p["name"]))
        db.commit()
    finally:
        db.close()


_ensure_preset_characters()
_migrate_legacy_characters_to_creator()


# --- Phase 8: リテンション・通知（デイリー伴走チャットの朝・夜の声かけ） ---
# 専用のジョブキュー/cronコンテナを追加せず、アプリ内のasyncioループで1分間隔にチェックする
# （Anthropic Batch APIでのメッセージ事前生成はPhase2の90日コース生成時に完了済みのため、
#   ここでは生成済みメッセージを通知時刻に合わせて送信するのみ）
async def _daily_notification_loop():
    from app.core.daily_notifications import send_due_notifications

    while True:
        try:
            await asyncio.to_thread(send_due_notifications)
        except Exception:
            logger.exception("[DailyNotification] 定期チェックに失敗しました")
        await asyncio.sleep(60)



# --- 週次・月次レビュー（要件定義書5.5）---
# 日次通知よりチェック頻度が低くても十分なため、AI呼び出しコストを抑えて30分間隔でチェックする
async def _review_generation_loop():
    from app.core.review_generation import generate_due_reviews

    while True:
        try:
            await asyncio.to_thread(generate_due_reviews)
        except Exception:
            logger.exception("[ReviewGeneration] 定期チェックに失敗しました")
        await asyncio.sleep(1800)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    notification_task = asyncio.create_task(_daily_notification_loop())
    review_task = asyncio.create_task(_review_generation_loop())
    yield
    notification_task.cancel()
    review_task.cancel()


app = FastAPI(
    title="ManaVillage API",
    description="90日間AIメンターシップ・サブスクリプションサービス バックエンドAPI",
    version="1.1.0",
    # DOCS_ENABLED=False で本番環境のSwagger UIを非公開にする
    docs_url="/docs" if settings.DOCS_ENABLED else None,
    redoc_url="/redoc" if settings.DOCS_ENABLED else None,
    openapi_url="/openapi.json" if settings.DOCS_ENABLED else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 静的ファイル配信（キャラクター画像など）
# 保存場所: backend/app/static/ 配下（Dockerボリュームでホストと同期されるため永続化される）
_static_dir = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(os.path.join(_static_dir, "character_images"), exist_ok=True)
app.mount("/static", StaticFiles(directory=_static_dir), name="static")

app.include_router(auth.router)
app.include_router(customers.router)
app.include_router(characters.router)
app.include_router(payments.router)
app.include_router(courses.router)
app.include_router(creators.router)
app.include_router(favorites.router)
app.include_router(studio.router)
app.include_router(notifications.router)
app.include_router(interview.router)
app.include_router(diagnosis.router)
app.include_router(chat.router)
app.include_router(admin.router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "ManaVillage API"}
