# ManaVillage 基本設計書 v1.1

> ステータス: ドラフト v1.1
> 関連ドキュメント: ManaVillage 要件定義書 v1.1

---

## 0. 設計原則：1クリエイター = 1人格(キャラクター)

ManaVillageは「成果達成型メンタープラットフォーム」であり、学習者が購入するのは「好きなクリエイターと一緒に目標達成する伴走体験」である。この理念上、**1人のクリエイターには人格(キャラクター)が1つだけ存在する**。複数の人格を持つことはできない。

- 人格(キャラクター)データは、AIインタビュー（固定5問＋深掘り）の回答が完了した時点で**自動的に生成・作成**される。クリエイターが別途「キャラクターを新規作成する」という操作は存在しない。
- 30日伴走コースやAIコンテンツ生成スタジオなど、コンテンツ作成系の画面では「キャラクターを選択する」という項目・操作は存在しない。常にクリエイター本人の人格に自動的に紐づく。
- DB上は`characters`テーブルが`creator_profiles`テーブルと**1対1（creator_idにUNIQUE制約）**で対応する。

---

## 1. 画面設計

### 1.1 画面一覧

| 画面ID | パス | 画面名 | 対象ユーザー |
|---|---|---|---|
| SCR-01 | / | トップ・マーケットプレイス | 全員(未ログイン含む) |
| SCR-02 | /courses/[id] | コース詳細 | 全員 |
| SCR-03 | /chat/[course_id] | 伴走チャット画面 | 学習者(購入済み) |
| SCR-04 | /mypage | マイページ | 学習者 |
| SCR-05 | /settings/notifications | 通知設定 | 学習者 |
| SCR-06 | /settings/profile | プロフィール編集 | 全員 |
| SCR-07 | /login | ログイン | 未ログイン |
| SCR-08 | /register | 会員登録 | 未ログイン |
| SCR-09 | /forgot-password | パスワードリセット申請 | 未ログイン |
| SCR-10 | /reset-password | パスワードリセット実行 | 未ログイン |
| SCR-11 | /creator/apply | クリエイター申請 | 学習者 |
| SCR-12 | /creator/dashboard | クリエイターダッシュボード | クリエイター |
| SCR-13 | /creator/interview | AIインタビュー(人格収集) | クリエイター |
| SCR-14 | /creator/profile | 人格プロファイル確認・編集 | クリエイター |
| SCR-15 | /creator/courses/new | コース新規作成 | クリエイター |
| SCR-16 | /creator/courses/[id]/edit | コース基本情報編集 | クリエイター |
| SCR-17 | /creator/courses/[id]/calendar | 30日カレンダー編集 | クリエイター |
| SCR-18 | /creator/courses/[id]/analytics | 質問分析ダッシュボード | クリエイター |
| SCR-19 | /creator/courses/[id]/answers | Tier B回答画面 | クリエイター |
| SCR-20 | /creator/earnings | 売上管理 | クリエイター |
| SCR-21 | /admin/applications | クリエイター申請審査 | 管理者 |
| SCR-22 | /admin/courses | コース管理 | 管理者 |
| SCR-23 | /admin/reports | 通報管理 | 管理者 |
| SCR-24 | /admin/tier-b-monitor | Tier B回答状況監視 | 管理者 |

---

### 1.2 画面遷移図

```
[未ログイン]
/(SCR-01) ──→ /courses/[id](SCR-02) ──→ /login(SCR-07)
                                               ↓
                                          /register(SCR-08)

[学習者ログイン後]
/(SCR-01)
  ├── /courses/[id](SCR-02) ──→ 購入 ──→ /chat/[course_id](SCR-03)
  ├── /mypage(SCR-04)
  │     ├── 購入済みコース一覧 ──→ /chat/[course_id](SCR-03)
  │     └── 設定 ──→ /settings/notifications(SCR-05)
  └── /creator/apply(SCR-11) ──→ 承認後 ──→ /creator/dashboard(SCR-12)

[クリエイターログイン後]
/creator/dashboard(SCR-12)
  ├── /creator/interview(SCR-13) ──→ /creator/profile(SCR-14)
  ├── /creator/courses/new(SCR-15)
  │     └── 作成後 ──→ /creator/courses/[id]/calendar(SCR-17)
  ├── /creator/courses/[id]/analytics(SCR-18)
  ├── /creator/courses/[id]/answers(SCR-19)  ← Tier Bのみ
  └── /creator/earnings(SCR-20)

[管理者ログイン後]
/admin/applications(SCR-21)
/admin/courses(SCR-22)
/admin/reports(SCR-23)
/admin/tier-b-monitor(SCR-24)
```

---

### 1.3 主要画面の詳細

#### SCR-01 トップ・マーケットプレイス
| エリア | 内容 |
|---|---|
| ヒーローバナー | キャッチコピー + 会員登録CTA |
| コース検索 | キーワード・カテゴリ・ティアでフィルタ |
| 注目コース | 購入数上位のコースカード一覧 |
| 新着コース | 最新公開コースカード一覧 |
| クリエイター向けCTA | 「あなたも伴走コースを作ろう」バナー |

#### SCR-03 伴走チャット画面
| エリア | 内容 |
|---|---|
| クリエイターアバター | 人格プロファイルのアバター画像 |
| チャット履歴 | メッセージ一覧(学習者/AI/講師の送信者を色分け) |
| 入力フィールド | テキスト入力 + 送信ボタン |
| 今日のタスク | サイドバーに当日のタスクリストを表示 |
| 学習報告ボタン | 「今日の学習を報告する」クイックアクション |
| 進捗バー | 30日中の現在位置を表示 |

#### SCR-13 AIインタビュー
| エリア | 内容 |
|---|---|
| 進捗インジケーター | 「3/5問目」のような表示 |
| AIメッセージ | 質問文をチャット形式で表示 |
| 回答エリア | テキスト入力 or 選択肢ボタン |
| 途中保存 | ブラウザを閉じても続きから再開可能 |

※ インタビュー完了（`/interview/generate-profile`呼び出し）と同時に、人格プロファイルに加えて**人格(キャラクター)レコードも自動生成**される（名前の初期値はクリエイターのアカウント名）。クリエイターは生成後、SCR-14またはキャラクター編集画面で名前・口調・アバター画像を編集できる。

#### SCR-15 コース新規作成
| エリア | 内容 |
|---|---|
| 担当キャラクター表示 | 「このコースは『{キャラクター名}』として公開されます」という読み取り専用表示（選択UIなし） |
| コース基本情報入力 | コース名・ゴール・対象者・学習強度 |
| Tier A/B 価格設定 | Tier A(980〜1,980円/月)・Tier B(2,980〜5,000円/月、任意) |

※ 1クリエイター=1人格のため、キャラクターを選ぶプルダウン等のUIは存在しない。クリエイターがまだAIインタビューを完了していない（人格が存在しない）場合は、コース作成不可とし、AIインタビューへの導線を表示する。

#### SCR-17 30日カレンダー編集
| エリア | 内容 |
|---|---|
| カレンダービュー | 30日分を月単位で表示。各日をクリックで編集パネル展開 |
| 凡例 | AI生成済み(青) / クリエイター編集済み(緑) / 休息日(グレー) |
| 編集パネル | 日テーマ・タスクリスト・AIメッセージ(朝/夜/完了時)を編集 |
| 一括操作 | 「全日のAIメッセージを口調統一」「週単位で休息日設定」 |

#### SCR-18 質問分析ダッシュボード
| エリア | 内容 |
|---|---|
| 質問ランキング | カテゴリ別の質問数(今週/今月/累計) |
| 質問一覧 | カテゴリをクリックすると実際の質問文を表示 |
| コンテンツ紐付け | 「このカテゴリに動画を紐付ける」ボタン + URL入力 |

#### SCR-19 Tier B回答画面
| エリア | 内容 |
|---|---|
| 未回答一覧 | 学習者名・質問・受信時刻・経過時間 |
| AI下書き | 人格プロファイルで生成した回答案 |
| 編集フィールド | 下書きを直接編集 |
| 承認ボタン | 編集内容を送信 / AI下書きをそのまま送信 |
| 残り時間 | 24時間タイマー表示 |

---

## 2. DB設計

### 2.1 テーブル一覧

| テーブル名 | 概要 |
|---|---|
| users | 全ユーザー共通情報 |
| creator_profiles | クリエイタープロフィール・申請状態 |
| characters | クリエイターの人格(キャラクター)。creator_profiles と1対1（creator_idにUNIQUE制約） |
| personality_profiles | AIインタビュー結果・人格プロファイル |
| interview_sessions | AIインタビューの進行状態(途中保存) |
| courses | コース基本情報 |
| course_days | 30日分の日次コンテンツ |
| course_materials | コースに添付する参考資料 |
| subscriptions | 学習者のサブスク状態 |
| learner_profiles | 学習者の診断結果 |
| learner_roadmaps | パーソナライズされた30日計画 |
| chat_messages | チャット画面のメッセージ履歴 |
| day_logs | 日次学習ログ |
| notification_settings | 通知時刻設定 |
| questions | 学習者からの質問(タグ付け・分析用) |
| answers | 質問への回答(AI/講師) |
| question_categories | 質問の自動タグ付けカテゴリ |
| category_contents | カテゴリに紐付けたコンテンツ |
| reports | ユーザーからの通報 |
| creator_earnings | クリエイターの月次売上 |

---

### 2.2 テーブル定義

#### users
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| email | VARCHAR(255) | UNIQUE, NOT NULL | |
| password_hash | VARCHAR(255) | NOT NULL | bcrypt |
| role | ENUM('learner','creator','admin') | NOT NULL, DEFAULT 'learner' | |
| display_name | VARCHAR(100) | NOT NULL | |
| avatar_url | VARCHAR(500) | NULL | |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| updated_at | DATETIME | NOT NULL, DEFAULT NOW() | |

#### creator_profiles
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| user_id | BIGINT | FK(users.id), UNIQUE | |
| bio | TEXT | NULL | |
| speciality | VARCHAR(255) | NULL | 専門分野 |
| experience | TEXT | NULL | 指導実績 |
| sns_links | JSON | NULL | {youtube, instagram, twitter, blog} |
| status | ENUM('pending','active','suspended') | NOT NULL, DEFAULT 'pending' | |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| updated_at | DATETIME | NOT NULL, DEFAULT NOW() | |

#### characters

1クリエイター=1人格の制約を表すテーブル。`creator_id`にUNIQUE制約を持ち、1つのクリエイタープロフィールに対して複数行が存在できない。AIインタビュー完了（`POST /interview/generate-profile`）時点で自動的に1行作成される。

| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| creator_id | BIGINT | FK(creator_profiles.id), **UNIQUE**, NULL | 1対1。公式運営アカウントなど一時的にNULLの場合あり |
| name | VARCHAR(100) | NOT NULL | 初期値はクリエイターのアカウント名。後から変更可 |
| description | VARCHAR(500) | NULL | |
| image_url | VARCHAR(500) | NULL | アバター画像 |
| tone_profile | JSON | NULL | 口調・性格プロファイル |
| color_scheme | JSON | NULL | UIカラー設定 |
| font_style | VARCHAR(100) | NULL | |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |

#### personality_profiles
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| creator_id | BIGINT | FK(creator_profiles.id), UNIQUE | |
| interview_answers | JSON | NULL | 質問と回答のペア配列 |
| profile | JSON | NOT NULL | 人格プロファイル構造体 |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| updated_at | DATETIME | NOT NULL, DEFAULT NOW() | |

#### courses
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| creator_id | BIGINT | FK(creator_profiles.id) | |
| personality_profile_id | BIGINT | FK(personality_profiles.id) | |
| title | VARCHAR(255) | NOT NULL | |
| goal | VARCHAR(255) | NOT NULL | |
| target_learner | TEXT | NULL | |
| tier | ENUM('A','B') | NOT NULL | A=AIのみ B=講師回答あり |
| price | INT | NOT NULL | 円 |
| status | ENUM('draft','review','published','suspended') | NOT NULL, DEFAULT 'draft' | |
| thumbnail_url | VARCHAR(500) | NULL | |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| updated_at | DATETIME | NOT NULL, DEFAULT NOW() | |

#### course_days
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| course_id | BIGINT | FK(courses.id) | |
| day_number | INT | NOT NULL | 1〜30 |
| week_number | INT | NOT NULL | 1〜13 |
| theme | VARCHAR(255) | NULL | |
| tasks | JSON | NULL | タスクリスト配列 |
| ai_message_morning | TEXT | NULL | |
| ai_message_evening | TEXT | NULL | |
| ai_message_completion | TEXT | NULL | |
| is_rest_day | BOOLEAN | NOT NULL, DEFAULT FALSE | |
| is_edited_by_creator | BOOLEAN | NOT NULL, DEFAULT FALSE | |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| updated_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| | | UNIQUE(course_id, day_number) | |

#### interview_sessions
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| creator_id | BIGINT | FK(creator_profiles.id), UNIQUE | |
| current_question_index | INT | NOT NULL, DEFAULT 0 | 現在何問目まで完了したか |
| answers | JSON | NULL | 回答済みの質問と回答のペア配列 |
| status | ENUM('in_progress','completed') | NOT NULL, DEFAULT 'in_progress' | |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| updated_at | DATETIME | NOT NULL, DEFAULT NOW() | |

#### chat_messages
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| user_id | BIGINT | FK(users.id) | 学習者 |
| course_id | BIGINT | FK(courses.id) | |
| sender | ENUM('learner','ai','instructor') | NOT NULL | 送信者種別 |
| body | TEXT | NOT NULL | メッセージ本文 |
| message_type | ENUM('chat','report','reminder','review') | NOT NULL, DEFAULT 'chat' | 通常チャット/学習報告/リマインド/レビュー |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| course_id | BIGINT | FK(courses.id) | |
| type | ENUM('pdf','url') | NOT NULL | |
| title | VARCHAR(255) | NOT NULL | |
| file_url | VARCHAR(500) | NOT NULL | |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |

#### subscriptions
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| user_id | BIGINT | FK(users.id) | |
| course_id | BIGINT | FK(courses.id) | |
| stripe_subscription_id | VARCHAR(255) | UNIQUE, NOT NULL | |
| status | ENUM('active','canceled','past_due') | NOT NULL | |
| current_period_end | DATETIME | NOT NULL | |
| started_at | DATETIME | NOT NULL | |
| canceled_at | DATETIME | NULL | |
| | | UNIQUE(user_id, course_id) | 同一コースの重複契約防止 |

#### learner_profiles
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| user_id | BIGINT | FK(users.id) | |
| course_id | BIGINT | FK(courses.id) | |
| current_score | VARCHAR(50) | NULL | 未受験の場合は'未受験' |
| target_score | VARCHAR(50) | NULL | |
| exam_date | VARCHAR(100) | NULL | 「3ヶ月後」等のテキスト |
| daily_study_time | VARCHAR(50) | NULL | |
| weak_areas | JSON | NULL | 苦手分野の配列 |
| study_history | TEXT | NULL | |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| | | UNIQUE(user_id, course_id) | |

#### learner_roadmaps
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| learner_profile_id | BIGINT | FK(learner_profiles.id), UNIQUE | |
| level_analysis | JSON | NOT NULL | レベル分析サマリー |
| week_advices | JSON | NOT NULL | 週次アドバイスのパーソナライズ |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |

#### day_logs
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| user_id | BIGINT | FK(users.id) | |
| course_id | BIGINT | FK(courses.id) | |
| day_number | INT | NOT NULL | |
| is_completed | BOOLEAN | NOT NULL, DEFAULT FALSE | |
| completed_at | DATETIME | NULL | |
| memo | TEXT | NULL | 任意の学習メモ |
| | | UNIQUE(user_id, course_id, day_number) | |

#### notification_settings
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| user_id | BIGINT | FK(users.id) | |
| course_id | BIGINT | FK(courses.id) | |
| morning_time | VARCHAR(5) | NOT NULL, DEFAULT '07:00' | HH:MM形式 |
| evening_time | VARCHAR(5) | NOT NULL, DEFAULT '21:00' | HH:MM形式 |
| is_enabled | BOOLEAN | NOT NULL, DEFAULT TRUE | |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| updated_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| | | UNIQUE(user_id, course_id) | |

#### reports
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| reporter_id | BIGINT | FK(users.id) | 通報者 |
| target_type | ENUM('course','message','creator') | NOT NULL | 通報対象の種別 |
| target_id | BIGINT | NOT NULL | 対象のID |
| reason | TEXT | NOT NULL | 通報理由 |
| status | ENUM('pending','resolved','dismissed') | NOT NULL, DEFAULT 'pending' | |
| resolved_at | DATETIME | NULL | |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |

#### questions
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| user_id | BIGINT | FK(users.id) | 学習者 |
| course_id | BIGINT | FK(courses.id) | |
| tier | ENUM('A','B') | NOT NULL | |
| body | TEXT | NOT NULL | 質問文 |
| category_id | BIGINT | FK(question_categories.id), NULL | 自動タグ付け結果 |
| status | ENUM('pending','answered_by_ai','answered_by_instructor','pending_instructor') | NOT NULL, DEFAULT 'pending' | |
| is_instructor_target | BOOLEAN | NOT NULL, DEFAULT FALSE | Tier Bの1日1回枠として講師に届いたか。アプリ側でDATE(created_at)ごとに1件のみtrueにする |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |

#### answers
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| question_id | BIGINT | FK(questions.id) | UNIQUE制約なし。Tier BではAI下書き+講師確認済みの2レコードが存在しうる |
| answered_by | ENUM('ai','instructor') | NOT NULL | |
| body | TEXT | NOT NULL | |
| linked_content_url | VARCHAR(500) | NULL | 紐付けコンテンツURL |
| is_draft | BOOLEAN | NOT NULL, DEFAULT FALSE | Tier B講師確認前はtrue。承認後falseに更新 |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| sent_at | DATETIME | NULL | 実際に学習者に届いた時刻 |

#### question_categories
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| creator_id | BIGINT | FK(creator_profiles.id) | |
| name | VARCHAR(100) | NOT NULL | 例:「仮定法」 |
| keywords | JSON | NOT NULL | 自動タグ付けに使うキーワード配列 |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |

※ 質問数は`questions`テーブルを集計クエリで動的にカウントする(カラム管理は整合性リスクがあるため不採用)

#### category_contents
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| category_id | BIGINT | FK(question_categories.id) | |
| content_type | ENUM('video','article','pdf') | NOT NULL | |
| title | VARCHAR(255) | NOT NULL | |
| url | VARCHAR(500) | NOT NULL | |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |

#### creator_earnings
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | BIGINT | PK, AUTO_INCREMENT | |
| creator_id | BIGINT | FK(creator_profiles.id) | |
| month | VARCHAR(7) | NOT NULL | 例:「2026-06」 |
| gross_amount | INT | NOT NULL | 総売上(円) |
| platform_fee | INT | NOT NULL | プラットフォーム手数料(円) |
| net_amount | INT | NOT NULL | クリエイター取り分(円) |
| status | ENUM('pending','paid') | NOT NULL, DEFAULT 'pending' | |
| paid_at | DATETIME | NULL | |
| | | UNIQUE(creator_id, month) | |

---

## 3. API設計

### 3.1 基本方針
- RESTful API(FastAPI)
- 認証: JWTトークン(Bearer)
- レスポンス形式: JSON
- ストリーミング: text/event-stream(AIチャット・生成系)

---

### 3.2 エンドポイント一覧

#### 認証 (Auth)
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| POST | /auth/register | 会員登録 | 不要 |
| POST | /auth/login | ログイン | 不要 |
| POST | /auth/logout | ログアウト | 要 |
| POST | /auth/forgot-password | リセットメール送信 | 不要 |
| POST | /auth/reset-password | パスワードリセット実行 | 不要 |
| POST | /auth/refresh | トークンリフレッシュ | 不要 |

#### ユーザー (Users)
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| GET | /users/me | 自分の情報取得 | 要 |
| PUT | /users/me | プロフィール更新 | 要 |

#### クリエイター申請 (Creator)
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| POST | /creator/apply | クリエイター申請 | 要(learner) |
| GET | /creator/profile | 自分のクリエイタープロフィール取得 | 要(creator) |
| PUT | /creator/profile | クリエイタープロフィール更新 | 要(creator) |

#### AIインタビュー (Interview)
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| POST | /interview/start | インタビュー開始・最初の質問を返す | 要(creator) |
| POST | /interview/answer | 回答を送信・次の質問 or 完了を返す | 要(creator) |
| POST | /interview/generate-profile | 回答をもとに人格プロファイルを生成。**人格(キャラクター)レコードが未作成の場合は同時に自動作成**する | 要(creator) |
| GET | /interview/profile | 人格プロファイル取得 | 要(creator) |
| PUT | /interview/profile | 人格プロファイル手動修正 | 要(creator) |

#### コース (Courses)
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| GET | /courses | 公開コース一覧(検索・フィルタ対応) | 不要 |
| GET | /courses/[id] | コース詳細 | 不要 |
| POST | /courses | コース新規作成。`character_id`の指定は不要で、クリエイター本人の人格(キャラクター)に自動的に紐づく | 要(creator) |
| PUT | /courses/[id] | コース更新 | 要(creator/本人) |
| DELETE | /courses/[id] | コース削除 | 要(creator/本人) |
| POST | /courses/[id]/generate-days | 30日コースをAI生成 | 要(creator/本人) |

#### 30日カレンダー (Course Days)
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| GET | /courses/[id]/days | 30日分の日次コンテンツ一覧 | 要 |
| PUT | /courses/[id]/days/[day_number] | 特定日の内容を更新 | 要(creator/本人) |

#### 参考資料 (Materials)
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| GET | /courses/[id]/materials | 参考資料一覧 | 要(購入済み) |
| POST | /courses/[id]/materials | 参考資料追加 | 要(creator/本人) |
| DELETE | /materials/[id] | 参考資料削除 | 要(creator/本人) |

#### サブスク・決済 (Subscriptions)
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| POST | /subscriptions | サブスク開始(Stripeセッション作成) | 要(learner) |
| DELETE | /subscriptions/[id] | 解約 | 要(本人) |
| GET | /subscriptions/me | 自分のサブスク一覧 | 要 |
| POST | /payments/webhook | Stripe Webhook受信 | Stripe署名検証 |

#### 学習者診断 (Diagnosis)
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| POST | /diagnosis/[course_id] | Day1診断の回答を保存・ロードマップ生成 | 要(learner) |
| GET | /diagnosis/[course_id] | 診断結果・ロードマップ取得 | 要(本人) |

#### チャット・質問 (Chat)
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| POST | /chat/[course_id] | メッセージ送信・AIが応答(SSEストリーミング) | 要(購入済み) |
| GET | /chat/[course_id]/history | チャット履歴取得 | 要(本人) |
| GET | /questions/me | 自分の質問一覧 | 要(learner) |

#### 学習ログ (Day Logs)
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| POST | /day-logs | 当日の学習完了を記録 | 要(learner) |
| GET | /day-logs/[course_id] | コースの学習ログ一覧 | 要(本人) |

#### 通知設定 (Notifications)
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| GET | /notification-settings/[course_id] | 通知設定取得 | 要(本人) |
| PUT | /notification-settings/[course_id] | 通知設定更新 | 要(本人) |

#### Tier B 講師回答 (Instructor Answers)
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| GET | /creator/questions | 未回答質問一覧(AI下書き付き) | 要(creator) |
| POST | /creator/answers/[question_id] | 回答を承認・送信 | 要(creator/本人) |

#### 質問分析 (Analytics)
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| GET | /creator/analytics/[course_id] | 質問カテゴリ別集計 | 要(creator/本人) |
| POST | /question-categories | カテゴリ新規作成 | 要(creator) |
| PUT | /question-categories/[id] | カテゴリ更新 | 要(creator/本人) |
| POST | /category-contents | カテゴリにコンテンツ紐付け | 要(creator) |
| DELETE | /category-contents/[id] | 紐付け解除 | 要(creator/本人) |

#### 売上 (Earnings)
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| GET | /creator/earnings | 月次売上一覧 | 要(creator) |

#### 通報 (Reports)
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| POST | /reports | 通報を送信 | 要 |

#### 管理者 (Admin)
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| GET | /admin/applications | クリエイター申請一覧 | 要(admin) |
| PUT | /admin/applications/[id] | 申請承認/却下 | 要(admin) |
| GET | /admin/courses | 全コース一覧 | 要(admin) |
| PUT | /admin/courses/[id]/suspend | コース停止 | 要(admin) |
| GET | /admin/reports | 通報一覧 | 要(admin) |
| PUT | /admin/reports/[id] | 通報対応 | 要(admin) |
| GET | /admin/tier-b-monitor | Tier B未回答一覧(24時間超) | 要(admin) |

---

## 4. 技術スタック

| レイヤー | 技術 | 備考 |
|---|---|---|
| フロントエンド | Next.js(App Router) | |
| バックエンド | FastAPI(Python) | |
| DB | MySQL | |
| キャッシュ/セッション | Redis | セッション管理・Cronジョブ用カウンター |
| 決済 | Stripe(サブスク) | Stripe Connectで講師分配 |
| AI | Anthropic API(Claude) | Sonnet 4.6 / Haiku 4.5 を用途別に使い分け |
| インフラ | Sakura VPS + Docker | |
| メール配信 | Resend | Push通知・週次レビュー・決済通知 |
| ドメイン | manavillage.online | |
EOF