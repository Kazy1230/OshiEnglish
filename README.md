# YourTeacher

キャラクター英文法解説サービス — メイドバイオーダー型パーソナライズド英語学習プラットフォーム

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | Next.js 16（App Router）+ Tailwind CSS |
| バックエンド | FastAPI（Python 3.12）|
| データベース | MySQL 8 |
| キャッシュ | Redis |
| リバースプロキシ | Nginx |
| コンテナ | Docker / Docker Compose |
| デプロイ先 | さくらインターネット VPS |

---

## ローカル開発環境のセットアップ

### 前提条件
- Docker Desktop がインストールされていること

### 手順

```bash
# 1. リポジトリをクローン
git clone <your-repo-url>
cd YourTeacher

# 2. 起動
docker compose up -d

# 3. テストデータを投入（管理者・キャラクター・記事・受注が一括作成される）
docker compose exec backend python seed.py

# 初期化してゼロからやり直す場合
docker compose exec backend python seed.py --reset
```

**シードで作成されるアカウント：**

| アカウント | パスワード | 権限 |
|---|---|---|
| admin | Admin1234! | 管理者 |
| test_doraemon | test1234 | 顧客（ドラえもん風キャラ付き） |
| test_sadist | test1234 | 顧客（鬼島先輩風キャラ付き） |
```

| URL | 内容 |
|---|---|
| http://localhost | フロントエンド |
| http://localhost/admin | 管理者画面（admin / admin1234） |
| http://localhost/api/docs | Swagger UI（開発環境のみ） |

---

## さくらVPS 本番デプロイ手順

### 1. VPSのセットアップ

```bash
# サーバーにSSH接続後
sudo apt update && sudo apt upgrade -y

# Dockerインストール
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# ログアウトして再接続

# Docker Compose v2確認
docker compose version
```

### 2. コードをVPSに配置

```bash
# GitHubからクローン（推奨）
git clone <your-repo-url> /srv/yourteacher
cd /srv/yourteacher
```

### 3. 環境変数を設定

```bash
cp .env.example .env
nano .env   # 各値を本番用に変更
```

**必ず変更する項目：**
- `MYSQL_PASSWORD` — 強いパスワードに変更
- `SECRET_KEY` — `openssl rand -hex 32` で生成した値
- `WEBHOOK_SECRET` — 任意の長い文字列
- `ALLOWED_ORIGINS` — 本番ドメインに変更
- `DOCS_ENABLED` — `False` に設定
- `NEXT_PUBLIC_API_URL` — 本番ドメインに変更

### 4. SSL証明書の取得（Let's Encrypt）

`nginx/prod.conf` は `oshi-english.life` 用に設定済みです。
コンテナ起動前に、ホスト側で証明書を取得してください
（`docker-compose.prod.yml` がホストの `/etc/letsencrypt` を読み取り専用でマウントします）。

```bash
sudo apt install certbot -y

# 80番ポートを一時的に空けてから取得（nginxコンテナが未起動の状態で実行）
sudo certbot certonly --standalone -d oshi-english.life -d www.oshi-english.life
```

証明書は90日ごとに更新が必要です。更新時もnginxコンテナを一時停止する必要があるため、
以下のようなcron運用を推奨します。

```bash
# crontab -e で設定（毎月1日 4:00 に更新を試行）
0 4 1 * * cd /srv/yourteacher && docker compose -f docker-compose.prod.yml stop nginx && certbot renew --quiet && docker compose -f docker-compose.prod.yml start nginx
```

### 5. Nginx SSL設定

`nginx/prod.conf` に本番用設定（`oshi-english.life` のSSL終端、HTTP→HTTPSリダイレクト、
`/api/` → backend、`/` → frontend へのプロキシ）が用意済みです。
別ドメインで運用する場合は、このファイル内の `oshi-english.life` を置き換えてください。

### 6. 本番環境で起動

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### 7. 管理者ユーザーを初回作成

```bash
docker compose -f docker-compose.prod.yml exec backend python -c "
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.customer import Customer
db = SessionLocal()
admin = Customer(username='admin', hashed_password=hash_password('your-strong-password'), is_admin=True, is_password_reset_required=False, is_active=True)
db.add(admin)
db.commit()
db.close()
print('Done')
"
```

---

## コードをVPSに更新デプロイする手順

```bash
cd /srv/yourteacher
git pull
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

---

## データベースバックアップ

```bash
# 手動バックアップ
docker compose exec db mysqldump -u yt_user -p yourteacher > backup_$(date +%Y%m%d).sql

# cronで毎日自動バックアップ（crontab -e で設定）
0 3 * * * cd /srv/yourteacher && docker compose exec -T db mysqldump -u yt_user -pパスワード yourteacher > mysql/backup/backup_$(date +\%Y\%m\%d).sql
```

---

## キャラクターのプロフィール画像（AI生成画像）

管理画面の「キャラクター」タブの各キャラクターカードから、AIで生成した
プロフィール画像をアップロードできます。

1. 「🎨 画像生成プロンプトをコピー」ボタンを押すと、画像生成AI
   （Midjourney / DALL-E / Stable Diffusionなど）にそのまま貼り付けられる
   プロンプトがコピーされます。このプロンプトには
   - **画像サイズ指定**（1024x1024pxの正方形・中央構図）
   - **著作権対策**：実在の人物名・既存作品名・既存キャラクター名を
     一切使わず、髪型・瞳の色・服装などの「見た目の特徴」のみで
     描写するよう強く指示する文言
   が組み込まれています。
2. 生成された画像を「📤 画像をアップロード」からアップロード
   （PNG/JPG/WEBP、5MBまで）。
3. アップロードした画像は記事ページのキャラクターバナーや
   サイドバーのプロフィール枠に自動的に表示されます。

**保存場所：** `backend/app/static/character_images/`
（Dockerのボリュームマウントによりホスト側にも永続化されます。
　`.gitignore` で画像ファイル自体はコミット対象外にしています）

---

## キャラクター・記事作成テンプレート

`templates/` フォルダに、毎回同じ手順・同じ品質でキャラクターと記事を
作成するための記入式テンプレートを用意しています。

| ファイル | 用途 |
|---|---|
| `templates/キャラクター作成テンプレート.txt` | キャラクター作成時に埋める項目（説明・一言・tone_profile・color_schemeなど）と完成チェックリスト |
| `templates/記事作成テンプレート.txt` | LLMプロンプト生成 → 出力確認 → 管理画面への入稿 → プレビュー確認、までの標準フロー |

迷ったときはまずこのテンプレートを開き、空欄を埋めてから管理画面に
転記してください。これにより、品質や体裁が安定した状態で
キャラクター・記事を量産できます。

---

## LLMで記事を作る際のクオリティ再現性について

「Claudeで書いた回はいい感じに装飾された」が毎回バラつく場合は、依頼するたびに口調や出力形式を口頭で説明し直しているのが原因であることが多いです。
本サービスでは、管理画面の「キャラクター」タブにある **📋 LLMプロンプトをコピー** ボタンで、

- キャラクターの口調・口癖・性格（`tone_profile`）
- 今回依頼された文法トピック（ボタン押下時に入力）
- **固定の出力フォーマット指定**（`===CONTENT===` / `===EXAMPLES===` / `===TIPS===` の3ブロックと、見出し・太字・コード表記・引用ブロックなどMarkdown装飾ルール）

を1つのプロンプトにまとめてクリップボードにコピーできます。これをそのままClaude(Code)に渡すことで、

1. 毎回同じ装飾密度・構成で出力される（再現性が上がる）
2. 出力をそのまま「解説本文」「例文」「Tips」の3つの入力欄に分割して貼り付けられる（編集の手間が減る）

という2つの効果が得られます。記事の質にバラつきを感じたら、まず自己流のプロンプトではなく、このコピー機能で生成した定型プロンプトを使ってみてください。

---

## Google Forms 自動連携（GAS設定）

Google Apps Script に以下を設定してください：

```javascript
function onFormSubmit(e) {
  const responses = e.namedValues;
  const payload = {
    customer_name: responses["お名前"][0] || "",
    contact: responses["SNSアカウント"][0] || "",
    character_name: responses["希望キャラクター"][0] || "",
    grammar_topic: responses["学習したい文法項目"][0] || "",
    form_submitted_at: new Date().toISOString(),
  };

  UrlFetchApp.fetch("https://oshi-english.life/api/orders/webhook", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    headers: {
      "X-Webhook-Secret": "あなたのWEBHOOK_SECRET"
    }
  });
}
```

---

## ディレクトリ構成

```
YourTeacher/
├── docker-compose.yml          # 開発環境
├── docker-compose.prod.yml     # 本番環境
├── .env                        # 本番環境変数（gitignore対象、各サービスのenv_file）
├── .env.example                # 環境変数テンプレート
├── nginx/
│   ├── default.conf            # Nginx設定（開発用）
│   └── prod.conf                # Nginx設定（本番用、oshi-english.lifeのSSL終端）
├── backend/
│   ├── Dockerfile               # 開発用（--reload）
│   ├── Dockerfile.prod          # 本番用（--reloadなし）
│   ├── requirements.txt
│   └── app/
│       ├── main.py
│       ├── core/               # 設定・DB・認証
│       ├── models/             # SQLAlchemyモデル
│       └── routers/            # APIエンドポイント
├── frontend/
│   ├── Dockerfile              # 開発用
│   ├── Dockerfile.prod         # 本番用（next build、NEXT_PUBLIC_API_URLを埋め込み）
│   ├── app/                    # Next.js App Router
│   ├── components/             # 共通コンポーネント
│   └── lib/                    # API・認証・テーマ
└── mysql/
    └── init/                   # 初期SQLスクリプト
```
