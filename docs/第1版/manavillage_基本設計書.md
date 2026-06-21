# ManaVillage 基本設計書

> ドメイン: manavillage.online
> ステータス: ドラフト v0.1
> 関連ドキュメント: ManaVillage マーケットプレイス化 要件定義書

---

## 1. 画面設計

### 1.1 画面一覧

| 画面ID | 画面名 | 対象ユーザー | 対応要件 |
|---|---|---|---|
| SCR-01 | トップページ | 全員(未ログイン含む) | E-01, R-03 |
| SCR-02 | 講師一覧ページ | 全員 | E-01 |
| SCR-03 | 講師ページ | 全員 | E-02, E-03 |
| SCR-04 | コンテンツ詳細・購入ページ | 全員/学習者 | E-03, E-04 |
| SCR-05 | 学習者ダッシュボード | 学習者 | E-06, E-07, R-04, R-05 |
| SCR-06 | 講師ダッシュボード(概要) | 講師 | D-04 |
| SCR-07 | キャラクタービルダー | 講師 | B-01〜B-05 |
| SCR-08 | AIコンテンツ生成スタジオ | 講師 | C-01〜C-07 |
| SCR-09 | 講師ページ編集 | 講師 | D-01〜D-03 |
| SCR-10 | 売上ダッシュボード | 講師 | D-04, F-03, F-04 |
| SCR-11 | 管理者パネル | 管理者 | G-01〜G-04 |
| SCR-12 | ログイン・会員登録 | 全員 | A-01 |
| SCR-13 | プロフィール編集 | 全員 | A-04 |
| SCR-14 | 講師申請ページ | 学習者→講師昇格 | A-02, A-03 |

---

### 1.2 画面遷移図(概略)

```
[未ログイン]
トップ(SCR-01)
  ├── 講師一覧(SCR-02)
  │     └── 講師ページ(SCR-03)
  │           └── コンテンツ詳細(SCR-04) → ログイン要求 → 購入
  └── ログイン/登録(SCR-12)

[学習者ログイン後]
トップ(SCR-01)
  ├── 講師一覧(SCR-02) → 講師ページ(SCR-03) → コンテンツ詳細・購入(SCR-04)
  ├── 学習者ダッシュボード(SCR-05)
  │     ├── 購入済みコンテンツ一覧
  │     ├── お気に入り講師一覧
  │     └── 学習進捗
  └── プロフィール編集(SCR-13)
      講師申請(SCR-14)

[講師ログイン後]
  ├── 講師ダッシュボード(SCR-06)
  │     ├── キャラクタービルダー(SCR-07)
  │     ├── AIコンテンツ生成スタジオ(SCR-08)
  │     ├── 講師ページ編集(SCR-09)
  │     └── 売上ダッシュボード(SCR-10)
  └── 自分の講師ページ(SCR-03)のプレビュー

[管理者ログイン後]
  └── 管理者パネル(SCR-11)
        ├── 講師申請審査
        ├── コンテンツモデレーション
        ├── ユーザー管理
        └── 売上・利用状況
```

---

### 1.3 主要画面の詳細

#### SCR-01 トップページ
| エリア | 内容 |
|---|---|
| ヒーローバナー | サービスキャッチコピー + 会員登録CTA |
| 新着コンテンツ | 最新公開コンテンツのカード一覧(最大8件) |
| 人気講師 | 購入数上位の講師カード(最大6件)。Phase 2以降はフォロワー数も加味する | 
| カテゴリ導線 | TOEIC / IELTS / TOEFL / 英文法 / 英会話 のアイコンリンク |
| 講師向けCTA | 「あなたもManaVillageで講師になろう」バナー |

#### SCR-03 講師ページ
| エリア | 内容 |
|---|---|
| キャラクタービジュアル | アイコン・バナー画像・キャラクター名 |
| プロフィール | 自己紹介・SNSリンク |
| コンテンツ一覧 | カテゴリタブ切り替え / 無料・有料バッジ / 価格表示 |
| お気に入り登録ボタン | ログイン済み学習者のみ表示 |
| AIチャットエリア | キャラクターの口調でQ&A(既存機能転用) |

#### SCR-07 キャラクタービルダー
| エリア | 内容 |
|---|---|
| 基本情報 | キャラクター名・アイコン/バナーアップロード |
| TONE_PROFILE設定 | 口調・性格・一人称・語尾・口癖・NG表現 (フォームUI) |
| プレビューパネル | サンプル文をリアルタイムでキャラクター口調に変換して表示 |
| 保存・複製・削除 | 複数キャラクター管理 |

#### SCR-08 AIコンテンツ生成スタジオ
| ステップ | 内容 |
|---|---|
| Step 1: 相談 | 「何を教えたいか」をチャット形式でAIに入力 → 構成案・タイトル案を提案 |
| Step 2: 素材生成 | テーマ確定後、生の教材素材をAI生成(文法解説・例文・練習問題) |
| Step 3: 口調変換 | キャラクター選択 → TONE_PROFILEを適用して変換 |
| Step 4: 編集・出力 | 手動編集 → 記事/台本形式を選択して出力 |
| Step 5: 公開設定 | タイトル・カテゴリ・価格(無料/有料)を設定して公開 |

---

## 2. DB設計

### 2.1 テーブル一覧

| テーブル名 | 概要 |
|---|---|
| users | 全ユーザー共通情報 |
| instructor_profiles | 講師プロフィール情報 |
| characters | キャラクター設定(TONE_PROFILEを含む) |
| courses | コース(購入単位) |
| lessons | コース内の個別レッスン(テキスト or 動画) |
| content_drafts | 生成中・下書きコンテンツ |
| purchases | 購入履歴(コース単位) |
| lesson_progress | レッスン単位の学習進捗 |
| favorites | お気に入り講師 |
| notifications | 通知 |

---

### 2.2 テーブル定義

#### users
| カラム名 | 型 | 制約 | 備考 |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| email | VARCHAR(255) | UNIQUE, NOT NULL | |
| password_hash | VARCHAR(255) | NOT NULL | bcrypt |
| role | ENUM('learner','instructor','admin') | NOT NULL, DEFAULT 'learner' | |
| display_name | VARCHAR(100) | NOT NULL | |
| avatar_url | VARCHAR(500) | NULL | |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| updated_at | DATETIME | NOT NULL, DEFAULT NOW() | |

#### instructor_profiles
| カラム名 | 型 | 制約 | 備考 |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| user_id | BIGINT | FK(users.id), UNIQUE | |
| bio | TEXT | NULL | 自己紹介文 |
| sns_youtube | VARCHAR(500) | NULL | |
| sns_instagram | VARCHAR(500) | NULL | |
| sns_twitter | VARCHAR(500) | NULL | |
| status | ENUM('pending','active','suspended') | NOT NULL, DEFAULT 'pending' | Phase 2以降の審査フロー用 |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| updated_at | DATETIME | NOT NULL, DEFAULT NOW() | |

#### characters
| カラム名 | 型 | 制約 | 備考 |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| instructor_id | BIGINT | FK(instructor_profiles.id) | |
| name | VARCHAR(100) | NOT NULL | キャラクター名 |
| avatar_url | VARCHAR(500) | NULL | |
| banner_url | VARCHAR(500) | NULL | |
| tone_profile | JSON | NOT NULL | 口調・性格・一人称・語尾・NG表現などを格納 |
| is_active | BOOLEAN | NOT NULL, DEFAULT TRUE | 表示/非表示切り替え |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| updated_at | DATETIME | NOT NULL, DEFAULT NOW() | |

#### courses
| カラム名 | 型 | 制約 | 備考 |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| character_id | BIGINT | FK(characters.id) | |
| title | VARCHAR(255) | NOT NULL | |
| description | TEXT | NULL | コース概要 |
| thumbnail_url | VARCHAR(500) | NULL | |
| category | VARCHAR(100) | NULL | TOEIC / IELTS / 英文法 など |
| status | ENUM('draft','published','unpublished') | NOT NULL, DEFAULT 'draft' | |
| price | INT | NOT NULL | 単位: 円 |
| is_free | BOOLEAN | NOT NULL, DEFAULT FALSE | |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| updated_at | DATETIME | NOT NULL, DEFAULT NOW() | |

#### lessons
| カラム名 | 型 | 制約 | 備考 |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| course_id | BIGINT | FK(courses.id) | |
| order | INT | NOT NULL | コース内の表示順 |
| title | VARCHAR(255) | NOT NULL | |
| content_type | ENUM('text','video') | NOT NULL | |
| body | LONGTEXT | NULL | content_type='text'の場合の本文 |
| youtube_url | VARCHAR(500) | NULL | content_type='video'の場合のYouTube限定公開URL。購入済みユーザーのみAPIで返却 |
| is_preview | BOOLEAN | NOT NULL, DEFAULT FALSE | 未購入でも閲覧可能なレッスンか |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| updated_at | DATETIME | NOT NULL, DEFAULT NOW() | |

#### content_drafts
| カラム名 | 型 | 制約 | 備考 |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| character_id | BIGINT | FK(characters.id) | |
| theme | VARCHAR(255) | NULL | AIに入力したテーマ |
| raw_content | LONGTEXT | NULL | 第一段階: 生の素材 |
| voiced_content | LONGTEXT | NULL | 第二段階: 口調変換済み |
| generation_status | ENUM('idle','generating','done','error') | NOT NULL, DEFAULT 'idle' | |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| updated_at | DATETIME | NOT NULL, DEFAULT NOW() | |

#### purchases
| カラム名 | 型 | 制約 | 備考 |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| user_id | BIGINT | FK(users.id) | |
| course_id | BIGINT | FK(courses.id) | コース単位で購入 |
| amount | INT | NOT NULL | 購入時の価格(円) |
| stripe_payment_intent_id | VARCHAR(255) | UNIQUE, NOT NULL | |
| status | ENUM('pending','succeeded','failed') | NOT NULL, DEFAULT 'pending' | |
| purchased_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| | | UNIQUE(user_id, course_id) ※ | ※status='succeeded'のレコードに対してアプリ側でチェック |

#### favorites
| カラム名 | 型 | 制約 | 備考 |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| user_id | BIGINT | FK(users.id) | |
| instructor_id | BIGINT | FK(instructor_profiles.id) | |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| | | UNIQUE(user_id, instructor_id) | 重複登録防止 |

#### lesson_progress
| カラム名 | 型 | 制約 | 備考 |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| user_id | BIGINT | FK(users.id) | |
| lesson_id | BIGINT | FK(lessons.id) | |
| is_completed | BOOLEAN | NOT NULL, DEFAULT FALSE | レッスン完了フラグ |
| last_accessed_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| | | UNIQUE(user_id, lesson_id) | |

#### notifications
| カラム名 | 型 | 制約 | 備考 |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| user_id | BIGINT | FK(users.id) | 通知受信者 |
| type | VARCHAR(100) | NOT NULL | 'new_content' / 'purchase_complete' など |
| payload | JSON | NULL | 通知に必要な補足データ(content_id等) |
| is_read | BOOLEAN | NOT NULL, DEFAULT FALSE | |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |

---

## 3. API設計

### 3.1 基本方針
- RESTful API(FastAPI)
- 認証: JWTトークン(Bearerヘッダー)
- レスポンス形式: JSON
- エラーレスポンス: `{ "detail": "エラーメッセージ" }`
- 画像ストレージ: Phase 1はVPSローカルストレージ(手軽・低コスト)。講師数・画像数が増えてきたらCloudflare R2等の外部ストレージへ移行を検討する

---

### 3.2 エンドポイント一覧

#### ファイルアップロード (Upload)
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| POST | /upload/image | 画像アップロード(アバター・バナー等)。URLを返却 | 要 |

#### 認証 (Auth)
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| POST | /auth/register | 新規会員登録 | 不要 |
| POST | /auth/login | ログイン(JWTトークン返却) | 不要 |
| POST | /auth/logout | ログアウト | 要 |
| POST | /auth/forgot-password | パスワードリセットメール送信 | 不要 |
| POST | /auth/reset-password | パスワードリセット実行(トークン検証) | 不要 |

#### 講師 (Instructors)
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| GET | /instructors | 講師一覧取得(カテゴリ・タグでフィルタ) | 不要 |
| GET | /instructors/{id} | 講師ページ情報取得 | 不要 |
| PUT | /instructors/{id} | 講師プロフィール更新 | 要(本人) |
| POST | /instructors/apply | 講師申請 | 要(学習者) |

#### キャラクター (Characters)
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| GET | /instructors/{id}/characters | 講師のキャラクター一覧 | 不要 |
| POST | /characters | キャラクター新規作成 | 要(講師) |
| GET | /characters/{id} | キャラクター詳細取得 | 不要 |
| PUT | /characters/{id} | キャラクター更新 | 要(本人) |
| DELETE | /characters/{id} | キャラクター削除 | 要(本人) |
| POST | /characters/{id}/preview | TONE_PROFILEプレビュー変換 | 要(講師) |

#### コース (Courses)
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| GET | /courses | コース一覧(新着・カテゴリフィルタ) | 不要 |
| GET | /instructors/{id}/courses | 講師別コース一覧 | 不要 |
| GET | /courses/{id} | コース詳細(レッスン一覧含む。動画URLは購入済みのみ返却) | 不要 |
| POST | /courses | コース新規作成。公開時にお気に入り登録済みユーザーへ通知生成 | 要(講師) |
| PUT | /courses/{id} | コース更新 | 要(本人) |
| DELETE | /courses/{id} | コース削除 | 要(本人) |

#### レッスン (Lessons)
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| POST | /courses/{id}/lessons | レッスン追加 | 要(講師) |
| PUT | /lessons/{id} | レッスン更新 | 要(本人) |
| DELETE | /lessons/{id} | レッスン削除 | 要(本人) |
| PUT | /courses/{id}/lessons/reorder | レッスン並び順変更 | 要(本人) |

#### AIコンテンツ生成スタジオ (Studio)
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| POST | /studio/generate/character | Step 0: キャラクターイメージ説明→TONE_PROFILE JSON提案 | 要(講師) |
| POST | /studio/consult | テーマ相談 → 構成案・タイトル案をAI提案 | 要(講師) |
| POST | /studio/generate/raw | 第一段階: 生の教材素材を生成 | 要(講師) |
| POST | /studio/generate/voiced | 第二段階: TONE_PROFILE適用・口調変換 | 要(講師) |
| POST | /studio/generate/script | 動画用台本の生成 | 要(講師) |
| GET | /studio/drafts | 下書き一覧取得 | 要(講師) |
| GET | /studio/drafts/{id} | 下書き詳細取得 | 要(講師) |
| DELETE | /studio/drafts/{id} | 下書き削除 | 要(講師) |

#### 購入・決済 (Purchases / Payments)
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| POST | /payments/checkout | Stripe決済セッション作成 | 要(学習者) |
| POST | /payments/webhook | Stripe Webhook受信 | Stripe署名検証 |
| GET | /purchases | 購入済みコンテンツ一覧 | 要(学習者) |

#### お気に入り (Favorites)
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| POST | /favorites/{instructor_id} | お気に入り登録 | 要(学習者) |
| DELETE | /favorites/{instructor_id} | お気に入り解除 | 要(学習者) |
| GET | /favorites | お気に入り講師一覧 | 要(学習者) |

#### 進捗 (Progress)
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| PUT | /lessons/{id}/complete | レッスン完了フラグをONにする | 要(学習者) |
| GET | /courses/{id}/progress | コース内のレッスン進捗一覧 | 要(学習者) |

#### 通知 (Notifications)
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| GET | /notifications | 通知一覧 | 要 |
| PUT | /notifications/{id}/read | 既読にする | 要 |

#### 管理者 (Admin)
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| GET | /admin/applications | 講師申請一覧 | 要(管理者) |
| PUT | /admin/applications/{id} | 申請承認/却下 | 要(管理者) |
| GET | /admin/contents | 全コンテンツ一覧(モデレーション用) | 要(管理者) |
| PUT | /admin/contents/{id}/unpublish | コンテンツ非公開化 | 要(管理者) |
| GET | /admin/users | ユーザー一覧 | 要(管理者) |
| PUT | /admin/users/{id}/suspend | ユーザー停止 | 要(管理者) |
| GET | /admin/stats | 売上・利用状況 | 要(管理者) |

---

---

## 5. UI/UXレビュー

### 5.1 モバイルファースト
英語学習コンテンツはスマートフォンでの閲覧が主流になる。全画面をモバイルファーストで設計し、PCはそのレスポンシブ拡張として位置づける。特にSCR-03(講師ページ)・SCR-04(コンテンツ詳細)・SCR-08(AIスタジオ)はスマホでの操作性を優先する。

---

### 5.2 購入フローのUX
購入完了までのステップが多いと離脱率が上がる。以下を意識した設計にする。

| ステップ | UX方針 |
|---|---|
| 購入ボタン | コンテンツ詳細ページの目立つ位置に固定表示(スクロールしても追従するCTA) |
| Stripe遷移 | 購入ボタン押下→Stripe決済画面への遷移はローディング表示で待機感を軽減 |
| 購入完了後 | 完了画面からそのままコンテンツ本文へ1タップで遷移できる導線を設ける |
| 購入失敗時 | エラーメッセージを日本語で明示し、再試行ボタンをその場に表示 |

---

### 5.3 AI生成スタジオのローディング体験
AI生成は数秒〜十数秒かかる場合がある。待機中のUXが粗いと講師がストレスを感じてコンテンツ制作を辞める。

| 対策 | 内容 |
|---|---|
| ストリーミング表示 | 生成テキストをリアルタイムで逐次表示(Anthropic APIのstreamingを活用) |
| プログレス表示 | Step 1→2→3の進行状況をステップバーで可視化 |
| エラー時の再試行 | 生成失敗時は「もう一度試す」ボタンをその場に表示。下書きは自動保存 |

---

### 5.4 コンテンツ詳細ページのプレビュー体験
「冒頭200文字」を単純に切り捨てると読者が不満を感じる。「続きが気になる」状態を作るUIにする。

- 本文の末尾をフェードアウト(グラデーションで薄くなる)で表現
- フェードの直下に「この続きを読む ¥○○」のCTAを配置
- 無料部分でも「このコンテンツの内容」が伝わるよう、タイトル・目次・冒頭は必ず見せる

---

### 5.5 空状態(Empty State)の設計
Phase 1ローンチ直後はコンテンツ数が少なく、トップページや講師一覧が寂しく見える。

| 画面 | 対策 |
|---|---|
| トップページ | 自社キャラ(雪菜・零・霧島くん等)のコンテンツを事前に充分な量まで用意してからローンチ。最低20〜30件を目標にする |
| 講師一覧 | Phase 1は自社キャラのみのため「講師一覧」という表現より「キャラクターを選ぶ」という表現に寄せ、人数の少なさが気にならないUIにする |
| 検索結果ゼロ | 「見つかりませんでした」だけでなく「他のカテゴリを見る」「おすすめコンテンツ」への導線を表示 |

---

### 5.6 講師ページのファーストビュー
キャラクタービジュアルに目が行くのはいいが、「この講師が何を教えているか」がすぐわからないと離脱される。

- キャラクタービジュアルの直下にカテゴリタグ(TOEIC / IELTS / 英文法など)を並べる
- コンテンツ一覧はファーストビュー内に最低2〜3件見えるようスクロール位置を設計する
- 無料コンテンツには「無料」バッジを目立つ色で表示し、試し読みへの心理的ハードルを下げる

---

## 6. 技術スタック(既存継続)

| レイヤー | 技術 | 備考 |
|---|---|---|
| フロントエンド | Next.js | 既存継続 |
| バックエンド | FastAPI (Python) | 既存継続 |
| DB | MySQL | 既存継続 |
| キャッシュ/セッション | Redis | 既存継続 |
| 決済 | Stripe | 既存継続。講師分配はStripe Connect検討 |
| AI | Anthropic API (Claude) | 既存継続 |
| インフラ | Sakura VPS + Docker | 既存継続 |
| ドメイン | manavillage.online | 切り替え要 |
