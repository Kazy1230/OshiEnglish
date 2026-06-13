import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from app.core.database import Base, engine, SessionLocal
from app.core.config import settings
from app.routers import auth, articles, customers, orders, access_logs, characters, grammar_masters, messages, service_items, intimacy_settings, payments, rewards, corrections

# テーブル自動作成（開発用。本番はAlembicマイグレーションを使用）
Base.metadata.create_all(bind=engine)

# 簡易マイグレーション: create_all は既存テーブルへの列追加を行わないため、
# 後から追加したカラムは存在チェックのうえ ALTER TABLE で補う
def _ensure_column(table: str, column: str, ddl: str):
    with engine.connect() as conn:
        result = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_schema = DATABASE() AND table_name = :table AND column_name = :column"
        ), {"table": table, "column": column})
        if result.scalar() == 0:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
            conn.commit()

_ensure_column("characters", "greeting", "VARCHAR(300) NULL")
_ensure_column("characters", "image_url", "VARCHAR(500) NULL")
_ensure_column("characters", "greetings", "JSON NULL")
_ensure_column("characters", "reward_progress_template", "VARCHAR(300) NULL")
_ensure_column("characters", "chat_footer_note", "VARCHAR(300) NULL")
_ensure_column("characters", "instagram_account", "VARCHAR(100) NULL")  # 公式Instagramアカウント名（@なし）
_ensure_column("articles", "article_type", "VARCHAR(20) NOT NULL DEFAULT 'request'")
# 演習問題（選択式・記述式）対応のための追加カラム
_ensure_column("articles", "exercise_format", "VARCHAR(30) NULL")
_ensure_column("articles", "exercise_category", "VARCHAR(100) NULL")
_ensure_column("articles", "exercise_data", "JSON NULL")

# 簡易マイグレーション②: 既存カラムのNULL許容化（ブログ記事は顧客・文法マスターに紐付かないため）
def _ensure_nullable(table: str, column: str):
    with engine.connect() as conn:
        result = conn.execute(text(
            "SELECT IS_NULLABLE, COLUMN_TYPE FROM information_schema.columns "
            "WHERE table_schema = DATABASE() AND table_name = :table AND column_name = :column"
        ), {"table": table, "column": column})
        row = result.first()
        if row and row[0] == "NO":
            conn.execute(text(f"ALTER TABLE {table} MODIFY COLUMN {column} {row[1]} NULL"))
            conn.commit()

_ensure_nullable("articles", "customer_id")
_ensure_nullable("articles", "grammar_master_id")


# 簡易マイグレーション②': インデックス追加（存在チェックのうえCREATE INDEX）
def _ensure_index(table: str, index_name: str, columns_sql: str):
    with engine.connect() as conn:
        result = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.statistics "
            "WHERE table_schema = DATABASE() AND table_name = :table AND index_name = :index_name"
        ), {"table": table, "index_name": index_name})
        if result.scalar() == 0:
            conn.execute(text(f"CREATE INDEX {index_name} ON {table} {columns_sql}"))
            conn.commit()

# 簡易マイグレーション③: 顧客の「キャラクターが覚えているメモ」（誕生日・好きなもの・エピソードなど）
# → 記事・ブログのパーソナライズ生成プロンプトに織り込み、世界観の「特別感」を演出するため
_ensure_column("customers", "character_memory", "JSON NULL")

# 簡易マイグレーション④: 親密度（キャラクターとの関係性ポイント）
_ensure_column("customers", "intimacy_points", "INT NOT NULL DEFAULT 0")

# 簡易マイグレーション⑤: 受注と顧客アカウントの紐づけ
# 受注フォーム（orders）から顧客アカウント（customers）が作成された後、
# どの受注がどの顧客につながったかを追跡するための外部キー（アプリ側で整合性を管理）
_ensure_column("orders", "customer_id", "INT NULL")

# 簡易マイグレーション⑥: DMスレッドの担当割り当て・優先度（複数オペレーターでの分担運用のため）
_ensure_column("customers", "assigned_admin_id", "INT NULL")
_ensure_column("customers", "priority", "VARCHAR(20) NOT NULL DEFAULT 'normal'")

# 簡易マイグレーション⑦: アクセスログ・DMの肥大化対策
# - access_logsは記事閲覧のたびに1行追加されるため、顧客×期間での絞り込みを高速化するインデックスを追加
# - messagesはカーソルページネーション（顧客×idでの絞り込み）を高速化するインデックスを追加
_ensure_index("access_logs", "ix_access_logs_customer_accessed", "(customer_id, accessed_at)")
_ensure_index("messages", "ix_messages_customer_id_id", "(customer_id, id)")

# 簡易マイグレーション⑧: 記述式演習の添削半自動化
# - 解答提出メッセージを「添削専用画面」で一覧・識別するためのフラグ
# - 添削下書き生成時にお題（exercise_data.prompt）を引くための演習記事への参照
_ensure_column("messages", "is_exercise_submission", "TINYINT(1) NOT NULL DEFAULT 0")
_ensure_column("messages", "article_id", "INT NULL")

# 簡易マイグレーション⑨: 親密度ポイント自動加算
# - ログインボーナスを「1日1回まで」に制限するため、最後にボーナスを付与した日付を記録する
_ensure_column("customers", "last_login_bonus_date", "DATE NULL")

# 簡易マイグレーション⑩: Stripe決済連携・アカウント自動発行
_ensure_column("orders", "stripe_session_id", "VARCHAR(255) NULL")
_ensure_column("orders", "stripe_payment_status", "VARCHAR(20) NULL")
_ensure_column("orders", "issued_username", "VARCHAR(100) NULL")
_ensure_column("orders", "issued_password", "VARCHAR(255) NULL")
_ensure_column("orders", "credentials_viewed", "TINYINT(1) NOT NULL DEFAULT 0")
_ensure_index("orders", "ix_orders_stripe_session_id", "(stripe_session_id)")

# 簡易マイグレーション⑪: オンボーディング自動化（申込フォームのメールアドレス）
# - 決済完了後のアカウント情報・キャラクター完成通知の送付先として使用する
_ensure_column("orders", "email", "VARCHAR(255) NULL")

# 簡易マイグレーション⑫: ウェルカムページ「最初の1つ無料」キャンペーン
# - キャラ作成完了前の顧客が、無料コンテンツ（記事／演習問題）を一人一回だけ受け取れるようにする
_ensure_column("customers", "free_content_claimed", "TINYINT(1) NOT NULL DEFAULT 0")

# 簡易マイグレーション⑫-2: オリジナルキャラ作成完了時の「ようこそ」表示
# - 既存顧客は表示済み扱い（DEFAULT 1）。管理者がcharacter_idを初めて割り当てた時にFalseにする
_ensure_column("customers", "character_ready_announced", "TINYINT(1) NOT NULL DEFAULT 1")

# 簡易マイグレーション⑬: 公式キャラクター（プリセットキャラ）フラグ
_ensure_column("characters", "is_preset", "TINYINT(1) NOT NULL DEFAULT 0")
with engine.connect() as _conn:
    _conn.execute(text(
        "UPDATE characters SET is_preset = 1 WHERE name IN ('白河雪菜', '蒼井零') AND is_preset = 0"
    ))
    _conn.commit()

# 簡易マイグレーション⑭: 公式キャラクター限定の報酬フラグ
_ensure_column("reward_items", "official_only", "TINYINT(1) NOT NULL DEFAULT 0")

# 簡易マイグレーション⑮: パスワード再発行（セルフサービス）用トークン
_ensure_column("customers", "reset_token", "VARCHAR(255) NULL")
_ensure_column("customers", "reset_token_expires", "DATETIME NULL")
_ensure_index("customers", "ix_customers_reset_token", "(reset_token)")

# 簡易マイグレーション⑯: 退会・返金フロー
_ensure_column("customers", "stripe_subscription_id", "VARCHAR(255) NULL")
_ensure_column("customers", "withdrawn_at", "DATETIME NULL")
_ensure_column("orders", "stripe_payment_intent_id", "VARCHAR(255) NULL")
_ensure_column("orders", "refund_status", "VARCHAR(20) NULL")
_ensure_column("orders", "refunded_at", "DATETIME NULL")

# 簡易マイグレーション⑰: 領収書・請求書発行
_ensure_column("orders", "amount_total", "INT NULL")
_ensure_column("orders", "currency", "VARCHAR(10) NULL")
_ensure_column("orders", "stripe_invoice_id", "VARCHAR(255) NULL")
_ensure_column("orders", "stripe_receipt_url", "VARCHAR(500) NULL")

# 簡易マイグレーション⑱: チャット送信失敗時のキャラ口調エラー文言
_ensure_column("characters", "chat_error_message", "VARCHAR(300) NULL")

# 簡易マイグレーション⑲: 依頼記事と元のリクエストメッセージの紐付け
# - 記事を「公開」にした際、対応するリクエスト（messages.request_status）を
#   自動で completed に更新できるようにする（手動更新漏れの防止）
_ensure_column("articles", "request_message_id", "INT NULL")
_ensure_index("articles", "ix_articles_request_message_id", "(request_message_id)")

# 簡易マイグレーション⑳: 「最初の1つ無料」ウェルカム記事のテンプレート化
# - LLM呼び出しをやめ、事前に用意したテンプレート記事を本棚にコピーする方式に変更
_ensure_column("articles", "is_welcome_template", "TINYINT(1) NOT NULL DEFAULT 0")
_ensure_column("articles", "template_character_id", "INT NULL")

# 簡易マイグレーション㉑: 管理者がDM対応で記録する「重要メモ」
# - DM返信下書き生成プロンプトに織り込み、運用スタッフ間で顧客の細かい情報を共有する
_ensure_column("customers", "admin_memo", "TEXT NULL")

# 簡易マイグレーション㉒: ログインセキュリティ強化
# - 連続ログイン失敗回数とアカウントロック解除時刻（時間経過で自動解除）
# - 管理者向け二段階認証（メール認証コード）の発行コードと有効期限
_ensure_column("customers", "failed_login_attempts", "INT NOT NULL DEFAULT 0")
_ensure_column("customers", "locked_until", "DATETIME NULL")
_ensure_column("customers", "two_factor_code", "VARCHAR(10) NULL")
_ensure_column("customers", "two_factor_code_expires", "DATETIME NULL")

# 簡易マイグレーション㉔: お題のない自由提出の添削リクエスト（ライティング/スピーキング）
# - correction_requestsテーブル自体はcreate_all()で自動作成される
# - articles: 添削記事として配信した際の参照、公開時にCorrectionRequestを完了状態にするために使う
# - messages: キャラDMのメッセージに「添削してもらう」CTAボタンを付与するためのフラグ
_ensure_column("articles", "correction_request_id", "INT NULL")
_ensure_index("articles", "ix_articles_correction_request_id", "(correction_request_id)")
_ensure_column("messages", "suggested_action", "VARCHAR(50) NULL")

# 簡易マイグレーション㉕: クレジット制決済システム
# - customers.credit_balance: クレジット残高（1クレジット=1円）
# - credit_transactionsテーブル自体はcreate_all()で自動作成される
_ensure_column("customers", "credit_balance", "INT NOT NULL DEFAULT 0")

# アクセスログのリテンション: 進捗比較（progress-stats）が見るのは直近14日間のみのため、
# それより十分長い期間を超えた閲覧履歴は定期的に削除し、無制限な行数増加を防ぐ
ACCESS_LOG_RETENTION_DAYS = 180


def _cleanup_old_access_logs():
    from datetime import datetime, timedelta
    from app.models.access_log import AccessLog

    cutoff = datetime.utcnow() - timedelta(days=ACCESS_LOG_RETENTION_DAYS)
    db = SessionLocal()
    try:
        db.query(AccessLog).filter(AccessLog.accessed_at < cutoff).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


_cleanup_old_access_logs()


def _seed_service_items():
    """料金・サービスメニューの初期データを投入する（テーブルが空のときのみ）。

    将来的に決済システムと連携する「商品カタログ」の土台。
    現時点では決済を実装しないため、ここで投入した項目は
    顧客向けメニューページに「価格の目安」として表示され、
    「気になる！」ボタン経由でキャラクターへのDM相談につながる。
    """
    from app.models.service_item import ServiceItem

    db = SessionLocal()
    try:
        if db.query(ServiceItem).count() > 0:
            return

        items = []

        def add(category, name, description, price_label, fulfillment=None, sort_order=0):
            items.append(ServiceItem(
                category=category, name=name, description=description,
                price_label=price_label, fulfillment=fulfillment, sort_order=sort_order,
            ))

        # ----- プラン -----
        add("プラン", "スタータープラン", "キャラ作成＋記事1本", "2,000円", sort_order=0)
        add("プラン", "追加ユニット（記事）", "1本", "500円〜", sort_order=1)

        # ----- TOEIC（各500円・約10分） -----
        add("TOEIC", "Part 1", "6問＋解説", "500円", "自動", 0)
        add("TOEIC", "Part 2", "6問＋解説", "500円", "自動", 1)
        add("TOEIC", "Part 3", "2セット（6問）＋解説", "500円", "自動", 2)
        add("TOEIC", "Part 4", "2セット（6問）＋解説", "500円", "自動", 3)
        add("TOEIC", "Part 5", "5問＋解説", "500円", "自動", 4)
        add("TOEIC", "Part 6", "2セット（8問）＋解説", "500円", "自動", 5)
        add("TOEIC", "Part 7", "1セット（シングル）＋解説", "500円", "自動", 6)

        # ----- 英検リーディング（各500円） -----
        add("英検リーディング", "短文穴埋め（5級〜準2級）", "5問＋解説", "500円", "自動", 0)
        add("英検リーディング", "短文穴埋め（2級〜1級）", "5問＋解説", "500円", "自動", 1)
        add("英検リーディング", "長文穴埋め（5級〜準2級）", "3問＋解説", "500円", "自動", 2)
        add("英検リーディング", "長文穴埋め（2級〜1級）", "2問＋解説", "500円", "自動", 3)
        add("英検リーディング", "長文読解（5級〜準2級）", "3問＋解説", "500円", "自動", 4)
        add("英検リーディング", "長文読解（2級〜1級）", "2問＋解説", "500円", "自動", 5)

        # ----- 英検リスニング（各500円） -----
        add("英検リスニング", "5級・4級", "10問＋解説", "500円", "自動", 0)
        add("英検リスニング", "3級・準2級", "8問＋解説", "500円", "自動", 1)
        add("英検リスニング", "2級", "6問＋解説", "500円", "自動", 2)
        add("英検リスニング", "準1級", "5問＋解説", "500円", "自動", 3)
        add("英検リスニング", "1級", "4問＋解説", "500円", "自動", 4)

        # ----- 英検ライティング・スピーキング -----
        add("英検ライティング・スピーキング", "ライティング", "1問", "1,000円", "マニュアル＋キャラフィードバック", 0)
        add("英検ライティング・スピーキング", "スピーキング", "1セット", "1,000円", "マニュアル＋キャラフィードバック", 1)

        # ----- IELTS -----
        add("IELTS", "Reading Academic", "1パッセージ（13〜14問）＋解説", "500円", "自動", 0)
        add("IELTS", "Reading General", "1パッセージ（13〜14問）＋解説", "500円", "自動", 1)
        add("IELTS", "Listening", "Section 1〜4 各10問＋解説（1セクションあたり）", "500円/セクション", "自動", 2)
        add("IELTS", "Writing Task 1", "1問", "500円", "マニュアル＋キャラフィードバック", 3)
        add("IELTS", "Writing Task 2", "1問", "1,000円", "マニュアル＋キャラフィードバック", 4)
        add("IELTS", "Speaking", "Part 1〜3まとめて", "1,000円", "マニュアル＋キャラフィードバック", 5)

        # ----- TOEFL -----
        add("TOEFL", "Reading", "1パッセージ（10問）＋解説", "500円", "自動", 0)
        add("TOEFL", "Listening", "Conversation＋Lecture（1セット）", "500円", "自動", 1)
        add("TOEFL", "Writing Integrated", "1問", "1,000円", "マニュアル＋キャラフィードバック", 2)
        add("TOEFL", "Writing Academic Discussion", "1問", "500円", "マニュアル＋キャラフィードバック", 3)
        add("TOEFL", "Speaking", "Task 1〜4まとめて", "1,000円", "マニュアル＋キャラフィードバック", 4)

        # ----- 文法記事 -----
        add("文法記事", "文法1項目", "2,500〜3,000文字", "500円", "自動", 0)

        db.add_all(items)
        db.commit()
    finally:
        db.close()


_seed_service_items()


def _seed_welcome_articles():
    """「最初の1つ無料」ウェルカム記事のテンプレートを投入する（テーブルに存在しない場合のみ）。

    公式キャラ（蒼井零・白河雪菜）はそれぞれの口調のテンプレートを、
    オリジナルキャラ（キャラクタービルダー使用）は character_id=NULL の汎用テンプレートを使う。
    """
    from app.models.article import Article
    from app.models.character import Character

    db = SessionLocal()
    try:
        aoi = db.query(Character).filter(Character.id == 14).first()
        shirakawa = db.query(Character).filter(Character.id == 13).first()
        if not aoi or not shirakawa:
            return

        def _template_exists(template_character_id):
            query = db.query(Article).filter(Article.is_welcome_template == True)  # noqa: E712
            if template_character_id is None:
                query = query.filter(Article.template_character_id.is_(None))
            else:
                query = query.filter(Article.template_character_id == template_character_id)
            return query.first() is not None

        all_templates = [
            Article(
                character_id=aoi.id,
                template_character_id=aoi.id,
                article_type="blog",
                title="……先輩へ。推しEnglishを始めるにあたって",
                content=(
                    "……はじめまして、先輩。蒼井零です。\n\n"
                    "これから、英語学習のパートナーとして付き合います。\n\n"
                    "推しEnglishでは、こんなことができます。\n\n"
                    "- 先輩のレベルに合わせた文法解説記事や演習問題が、この本棚に届きます\n"
                    "- チャットで質問すれば、いつでも答えます。雑談も……まあ、付き合います\n"
                    "- 書いた英文や、話した音声・動画を提出すれば、添削して記事として返します\n\n"
                    "今後の流れは単純です。記事が届いたら読んで、演習があれば解いて、わからないことがあればここで聞く。それだけです。\n\n"
                    "……先輩はやれます。根拠はありませんが、そう思っています。\n\n"
                    "それでは、今日からよろしくお願いします。"
                ),
                tips=[
                    "本棚に記事が届いたら、まず読んでみてください",
                    "チャットはいつでも開けます。気軽に質問してください",
                    "添削してほしい英文や音声があれば、本棚の「次の記事をリクエストする」から提出できます",
                ],
                example_sentences=[
                    "I'm looking forward to studying with you.",
                    "Let's get started, senpai.",
                ],
                status="published",
                is_llm_drafted=False,
                is_welcome_template=True,
            ),
            Article(
                character_id=shirakawa.id,
                template_character_id=shirakawa.id,
                article_type="blog",
                title="推しEnglishを始めるあなたへ……べ、別に歓迎してるわけじゃないですけど",
                content=(
                    "べ、別にあなたのために書いてるわけじゃないんですけど……まあ、一応説明しておきます。白河雪菜です。\n\n"
                    "推しEnglishでは、こんなことができます。\n\n"
                    "- あなたのレベルに合わせた文法解説記事や演習問題を、この本棚に届けます\n"
                    "- チャットでいつでも質問できます。…まあ、ちゃんと答えますから\n"
                    "- 書いた英文や、録音した音声・動画を提出すれば、添削して記事にして返します\n\n"
                    "今後の流れも教えておきます。記事が届いたら読む、演習があれば解く、わからないことがあればチャットで聞く。それを繰り返すだけです。\n\n"
                    "なんで諦めるんですか。私はまだ見捨ててないんですから。\n\n"
                    "……今日からよろしくお願いします。べ、別に楽しみにしてるわけじゃないですからね。"
                ),
                tips=[
                    "本棚に届いた記事は、まず読んでみてください",
                    "わからないことがあれば、チャットで聞いてください",
                    "添削してほしい英文・音声は「次の記事をリクエストする」から提出できます",
                ],
                example_sentences=[
                    "Don't give up. I haven't given up on you.",
                    "Let's see how much progress you can make.",
                ],
                status="published",
                is_llm_drafted=False,
                is_welcome_template=True,
            ),
            Article(
                character_id=aoi.id,
                template_character_id=None,
                article_type="blog",
                title="推しEnglishへようこそ",
                content=(
                    "推しEnglishへのご登録ありがとうございます。\n\n"
                    "推しEnglishは、あなた専用の「推し」キャラクターが英語学習のパートナーとなり、"
                    "文法解説記事や演習問題を届けたり、チャットで質問に答えたりするサービスです。\n\n"
                    "現在、あなた専用のキャラクターを準備しています。完成までは今しばらくお待ちください。"
                    "完成しましたら、登録いただいたメールアドレス宛にお知らせいたします。\n\n"
                    "キャラクターが決まると、以下のようなことができるようになります。\n\n"
                    "- あなたのレベルに合わせた文法解説記事や演習問題が本棚に届きます\n"
                    "- キャラクターとチャットでやりとりできます\n"
                    "- 書いた英文や録音した音声・動画を提出すると、キャラクターが添削して記事として返してくれます\n\n"
                    "キャラクターの完成まで、もうしばらくお待ちください。"
                ),
                tips=[
                    "キャラクターが完成すると、メールでお知らせします",
                    "完成後は本棚からチャットができるようになります",
                ],
                example_sentences=[],
                status="published",
                is_llm_drafted=False,
                is_welcome_template=True,
            ),
        ]
        templates = [t for t in all_templates if not _template_exists(t.template_character_id)]
        if templates:
            db.add_all(templates)
            db.commit()
    finally:
        db.close()


_seed_welcome_articles()

app = FastAPI(
    title="推しEnglish API",
    description="キャラクター英文法解説サービス バックエンドAPI",
    version="1.0.0",
    # DOCS_ENABLED=False で本番環境のSwagger UIを非公開にする
    docs_url="/docs" if settings.DOCS_ENABLED else None,
    redoc_url="/redoc" if settings.DOCS_ENABLED else None,
    openapi_url="/openapi.json" if settings.DOCS_ENABLED else None,
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
os.makedirs(os.path.join(_static_dir, "reward_images"), exist_ok=True)
os.makedirs(os.path.join(_static_dir, "correction_media"), exist_ok=True)
app.mount("/static", StaticFiles(directory=_static_dir), name="static")

app.include_router(auth.router)
app.include_router(articles.router)
app.include_router(customers.router)
app.include_router(orders.router)
app.include_router(access_logs.router)
app.include_router(characters.router)
app.include_router(grammar_masters.router)
app.include_router(messages.router)
app.include_router(service_items.router)
app.include_router(intimacy_settings.router)
app.include_router(payments.router)
app.include_router(rewards.router)
app.include_router(corrections.router)

@app.get("/health")
def health():
    return {"status": "ok", "service": "推しEnglish API"}
