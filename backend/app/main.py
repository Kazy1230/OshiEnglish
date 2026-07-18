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
from app.routers import auth, customers, characters, payments, courses, creators, favorites, studio, notifications, interview, chat, admin, contents, curriculum

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


def _ensure_nullable(table: str, column: str, ddl: str):
    """既存カラムをNOT NULL→NULL許容に変更する（型・既存制約は維持したままMODIFYする）。"""
    if _table_exists(table) and _column_exists(table, column):
        with engine.connect() as conn:
            conn.execute(text(f"ALTER TABLE {table} MODIFY COLUMN {column} {ddl}"))
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


def _unique_index_exists(table: str, index_name: str) -> bool:
    with engine.connect() as conn:
        result = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.statistics "
            "WHERE table_schema = DATABASE() AND table_name = :table AND index_name = :index_name AND non_unique = 0"
        ), {"table": table, "index_name": index_name})
        return result.scalar() > 0


def _ensure_unique_index(table: str, column: str, index_name: str):
    if _table_exists(table) and _column_exists(table, column) and not _unique_index_exists(table, index_name):
        with engine.connect() as conn:
            conn.execute(text(f"ALTER TABLE {table} ADD UNIQUE INDEX {index_name} ({column})"))
            conn.commit()


def _drop_unique_index(table: str, index_name: str):
    if _table_exists(table) and _unique_index_exists(table, index_name):
        with engine.connect() as conn:
            conn.execute(text(f"ALTER TABLE {table} DROP INDEX {index_name}"))
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

# --- Phase 2: コース構造（v2.0でgoal/target_learner/intensity/days_generation_*はDROPするため_ensure_column不要） ---
_ensure_column("courses", "personality_profile_id", "INT NULL")

# --- Phase 4: Stripeサブスクリプション（Tier A/B） ---
_ensure_column("courses", "tier_a_price", "INT NULL")
_ensure_column("courses", "tier_b_price", "INT NULL")

# --- Phase 9: 管理者・収益管理 ---
_ensure_column("courses", "is_suspended", "BOOLEAN NOT NULL DEFAULT FALSE")
_ensure_column("courses", "suspension_reason", "TEXT NULL")

# --- 質問カテゴリの承認制（既存カテゴリは導入前から使われていたものとして自動承認扱いにする） ---
_ensure_column("question_categories", "status", "VARCHAR(20) NOT NULL DEFAULT 'approved'")

# --- 3層コース生成アーキテクチャへの移行（90日→30日、Layer1/2/3分離） ---
_drop_column("course_days", "tasks")
_drop_column("course_days", "ai_message_morning")
_drop_column("course_days", "ai_message_evening")
_drop_column("course_days", "ai_message_completion")
_ensure_column("course_subscriptions", "past_due_since", "DATETIME NULL")

# --- クリエイターダッシュボード・紹介ページ再設計（AI生成自己紹介文） ---
_ensure_column("creator_profiles", "self_intro", "TEXT NULL")

# --- 教材進捗ベースのパーソナライズ（v2.0でstudy_materials/paceはDROPするため_ensure_column不要） ---
# --- 教材進捗ベースのパーソナライズ（議論サマリー20260626 13節） ---
_ensure_column("course_textbooks", "target_laps", "INT NOT NULL DEFAULT 1")
# --- 繰越タスク設計（議論サマリー20260626 15節） ---
_ensure_column("learner_course_days", "carryover_tasks", "JSON NULL")
# --- コンテンツスタジオ: content_draftsテーブルのカラム追加 ---
_ensure_column("content_drafts", "creator_id", "INT NULL")
_ensure_column("content_drafts", "character_id", "INT NULL")
_ensure_column("content_drafts", "format", "VARCHAR(50) NULL")
_ensure_column("content_drafts", "is_saved", "TINYINT(1) NOT NULL DEFAULT 0")
_ensure_column("content_drafts", "memo", "TEXT NULL")
# --- コンテンツプール ---
_ensure_column("course_textbooks", "content_id", "INT NULL")
# --- マルチドメイン拡張（v1.2）: subject・チェックリスト化 ---
_ensure_column("courses", "subject", "VARCHAR(100) NOT NULL DEFAULT ''")
_ensure_nullable("courses", "subject", "VARCHAR(100) NULL DEFAULT ''")
_rename_column("course_days", "task_types", "checklist_items", "JSON NULL")
_rename_column("day_logs", "completed_task_types", "completed_item_indices", "JSON NULL")
_ensure_column("interview_sessions", "base_type", "VARCHAR(50) NULL")
_ensure_column("interview_sessions", "gender", "VARCHAR(20) NULL")
_ensure_column("personality_profiles", "base_type", "VARCHAR(50) NULL")
_ensure_column("personality_profiles", "gender", "VARCHAR(20) NULL")
_ensure_column("personality_profiles", "sample_reply", "TEXT NULL")

# --- Day1診断をクリエイターのカスタム質問のみに変更（固定7問を廃止） ---
_ensure_nullable("learner_profiles", "target_score", "INT NULL")
_ensure_nullable("learner_profiles", "exam_date", "VARCHAR(50) NULL")
_ensure_nullable("learner_profiles", "daily_study_time", "VARCHAR(50) NULL")
_ensure_nullable("learner_profiles", "weak_areas", "JSON NULL")

# --- v2.0: カリキュラム（章/カード）アーキテクチャへの移行 ---
# courses: 旧day系カラムを削除 → 新カリキュラム用カラムを追加
_drop_column("courses", "goal")
_drop_column("courses", "target_learner")
_drop_column("courses", "intensity")
_drop_column("courses", "study_materials")
_drop_column("courses", "pace")
_drop_column("courses", "days_generation_status")
_drop_column("courses", "days_generation_error")
_ensure_column("courses", "curriculum_target_audience", "TEXT NULL")
_ensure_column("courses", "curriculum_topics", "TEXT NULL")
_ensure_column("courses", "curriculum_style", "TEXT NULL")
_ensure_column("courses", "completion_video_url", "VARCHAR(500) NULL")
# purchases: 学習者ペース・卒業フラグ追加
_ensure_column("purchases", "target_pace", "VARCHAR(20) NULL")
_ensure_column("purchases", "pace_set_at", "DATETIME NULL")
_ensure_column("purchases", "is_graduated", "TINYINT(1) NOT NULL DEFAULT 0")
_ensure_column("purchases", "graduated_at", "DATETIME NULL")
_ensure_column("interview_sessions", "subject", "VARCHAR(100) NULL")
_ensure_nullable("interview_sessions", "subject", "VARCHAR(100) NULL")
_ensure_nullable("creator_contents", "subject", "VARCHAR(100) NULL DEFAULT ''")

# --- コース作成フロー v2（外部AI壁打ち用フィールド追加）---
_ensure_column("courses", "curriculum_purpose",         "TEXT NULL")
_ensure_column("courses", "curriculum_duration",        "VARCHAR(100) NULL")
_ensure_column("courses", "curriculum_concerns",        "TEXT NULL")
_ensure_column("courses", "curriculum_existing_videos", "TEXT NULL")
# --- チャプターカード: quiz 種別の選択肢 ---
_ensure_column("chapter_cards", "quiz_options", "JSON NULL")

# --- 修正.md 2節: build_task提出形式・完了メッセージ・YouTube可用性チェック ---
_ensure_column("chapter_cards", "submission_format", "VARCHAR(20) NULL")
_ensure_column("chapter_cards", "completion_message", "TEXT NULL")
_ensure_column("chapter_cards", "youtube_available", "BOOLEAN NULL")
_ensure_column("chapter_cards", "youtube_checked_at", "DATETIME NULL")

# --- 修正.md 2節: build_task提出内容・AI一次判定・クリエイターコメント・quiz正誤 ---
_ensure_column("card_progress", "submission_text", "TEXT NULL")
_ensure_column("card_progress", "submission_url", "VARCHAR(500) NULL")
_ensure_column("card_progress", "submitted_at", "DATETIME NULL")
_ensure_column("card_progress", "ai_feedback", "TEXT NULL")
_ensure_column("card_progress", "creator_comment", "TEXT NULL")
_ensure_column("card_progress", "creator_commented_at", "DATETIME NULL")
_ensure_column("card_progress", "quiz_is_correct", "BOOLEAN NULL")

# --- 修正.md: コース型選択（自由進行型/ペース管理型）・沈黙ベース再エンゲージメント ---
_ensure_column("courses", "course_type", "VARCHAR(20) NOT NULL DEFAULT 'self_paced'")
_ensure_column("courses", "pace_unit_description", "VARCHAR(255) NULL")

# --- ペース管理型コース：30日カレンダー(Layer1)自動生成の進行状況 ---
_ensure_column("courses", "days_generation_status", "VARCHAR(20) NULL")
_ensure_column("courses", "days_generation_error", "TEXT NULL")

# --- 30日カレンダー相談AIチャットの残高 ---
_ensure_column("creator_profiles", "ai_chat_balance", "INT NOT NULL DEFAULT 20")

# --- Day1診断機能の完全廃止（LearnerProfileベースの個人化レイヤー・週次/月次レビューを含む） ---
with engine.connect() as _conn:
    _conn.execute(text("SET FOREIGN_KEY_CHECKS=0"))
    _conn.commit()
for _diagnosis_table in (
    "learner_diagnosis_answers", "course_diagnosis_questions",
    "learner_roadmaps", "learner_course_days", "learner_textbook_progress",
    "learner_reviews", "learner_profiles", "notification_settings",
):
    _drop_table(_diagnosis_table)
with engine.connect() as _conn:
    _conn.execute(text("SET FOREIGN_KEY_CHECKS=1"))
    _conn.commit()


def _migrate_legacy_characters_to_creator():
    from app.core.creator_migration import migrate_legacy_characters_to_creator

    db = SessionLocal()
    try:
        migrate_legacy_characters_to_creator(db)
        db.commit()
    finally:
        db.close()



def _dedupe_characters_per_creator():
    from app.core.creator_migration import dedupe_characters_per_creator

    db = SessionLocal()
    try:
        dedupe_characters_per_creator(db)
        db.commit()
    finally:
        db.close()


def _ensure_preset_textbooks():
    """TOEFL ITP向けプリセット教材が textbooks テーブルに存在することを保証する。"""
    from app.core.textbook_seeds import seed_textbooks

    db = SessionLocal()
    try:
        seed_textbooks(db)
        db.commit()
    finally:
        db.close()


_ensure_preset_textbooks()
_migrate_legacy_characters_to_creator()
# 1クリエイター=1人格(キャラクター)の制約を追加する前に、既存の重複データを統合しておく
_dedupe_characters_per_creator()
_ensure_unique_index("characters", "creator_id", "uq_characters_creator_id")

# 解約後の再契約で履歴として複数行を残せるよう、course_subscriptionsのUNIQUE制約を撤廃する
_drop_unique_index("course_subscriptions", "uq_course_subscriptions_user_course")


# --- 改善提案書5節: 3段階リマインドメール（チャット未開封日数に応じたメール） ---
# 1日1コースあたり1通までという粒度のため、1時間間隔のチェックで十分
async def _inactivity_reminder_loop():
    from app.core.daily_notifications import check_inactive_reminders

    while True:
        try:
            await asyncio.to_thread(check_inactive_reminders)
        except Exception:
            logger.exception("[InactivityReminder] 定期チェックに失敗しました")
        await asyncio.sleep(3600)



@asynccontextmanager
async def lifespan(_app: FastAPI):
    inactivity_task = asyncio.create_task(_inactivity_reminder_loop())
    yield
    inactivity_task.cancel()


app = FastAPI(
    title="ManaVillage API",
    description="30日間AIメンターシップ・サブスクリプションサービス バックエンドAPI",
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
app.include_router(chat.router)
app.include_router(admin.router)
app.include_router(contents.router)
app.include_router(curriculum.router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "ManaVillage API"}
