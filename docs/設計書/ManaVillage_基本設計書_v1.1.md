# ManaVillage 基本設計書 v1.1

> ステータス: ドラフト v1.1（現行コードベース反映版）
> 関連ドキュメント: ManaVillage 要件定義書 v1.1

---

## 0. 設計原則：1クリエイター = 1人格(キャラクター)

ManaVillageは「成果達成型メンタープラットフォーム」であり、学習者が購入するのは「好きなクリエイターと一緒に目標達成する伴走体験」である。この理念上、**1人のクリエイターには人格(キャラクター)が1つだけ存在する**。複数の人格を持つことはできない。

- 人格(キャラクター)データは、AIインタビュー（Step0の指導スタイル・性別選択＋固定質問＋深掘り、最大3回）の回答が完了し、人格プロファイルを生成した時点で**自動的に生成・作成**される。クリエイターが別途「キャラクターを新規作成する」という操作は存在しない。
- 30日伴走コースやAIコンテンツ生成スタジオなど、コンテンツ作成系の画面では「キャラクターを選択する」という項目・操作は存在しない。常にクリエイター本人の人格に自動的に紐づく。
- DB上は`characters`テーブルが`creator_profiles`テーブルと**1対1（`characters.creator_id`にUNIQUE制約）**で対応する。なお`characters.creator_id`は`NULL`を許容しており、運営公式キャラクター（白河雪菜・蒼井零・Chloe・Frederick）など、特定クリエイターに属さないプリセットキャラクターも存在する。
- アプリ起動時の簡易マイグレーション処理（`backend/app/main.py`）で、旧データの重複人格を統合（`dedupe_characters_per_creator`）した上で`characters.creator_id`にUNIQUE制約を付与している。

---

## 1. 画面設計

### 1.1 画面一覧

実装は`frontend/app`配下のNext.js App Routerに基づく。

| 画面ID | パス | 画面名 | 対象ユーザー |
|---|---|---|---|
| SCR-01 | / | トップ・マーケットプレイス | 全員(未ログイン含む) |
| SCR-02 | /courses/[id] | コース詳細 | 全員 |
| SCR-02b | /courses/[id]/diagnosis | Day1初回診断 | 学習者(購入済み) |
| SCR-02c | /courses/[id]/schedule | 30日スケジュール確認 | 学習者(購入済み) |
| SCR-02d | /courses/[id]/reviews | 週次・月次レビュー一覧 | 学習者(購入済み) |
| SCR-03 | /courses/[id]/chat | 伴走チャット画面 | 学習者(購入済み) |
| SCR-04 | /mypage | マイページ(購入済みコース一覧・通知・解約等) | 学習者 |
| SCR-06 | /change-password | パスワード変更 | 全員 |
| SCR-07 | /login | ログイン | 未ログイン |
| SCR-08 | /signup | 会員登録 | 未ログイン |
| SCR-09 | /forgot-password | パスワードリセット申請 | 未ログイン |
| SCR-10 | /reset-password | パスワードリセット実行 | 未ログイン |
| SCR-10b | /pricing | 料金プラン案内 | 全員 |
| SCR-10c | /policy | 利用規約・ポリシー | 全員 |
| SCR-10d | /purchase-complete | 購入完了 | 学習者 |
| SCR-10e | /favorites | お気に入りクリエイター一覧 | 学習者 |
| SCR-10f | /creators, /creators/[id] | クリエイター一覧・公開プロフィール | 全員 |
| SCR-11 | /creator/apply | クリエイター申請 | 学習者 |
| SCR-12 | /dashboard | クリエイターダッシュボード | クリエイター |
| SCR-13 | /creator/interview | AIインタビュー(人格収集) | クリエイター |
| SCR-14 | /creator/profile, /dashboard/characters/[id] | 人格プロファイル・キャラクター編集 | クリエイター |
| SCR-15 | /creator/courses/new | コース新規作成 | クリエイター |
| SCR-17 | /creator/courses/[id]/calendar | コース基本情報＋30日カレンダー編集 | クリエイター |
| SCR-17b | /creator/courses/[id]/textbooks | コース教材設定 | クリエイター |
| SCR-17c | /creator/courses/[id]/enrollments | 申込者一覧 | クリエイター |
| SCR-18 | /creator/analytics | 質問分析ダッシュボード | クリエイター |
| SCR-19 | /creator/inbox | Tier B回答画面(未回答質問対応) | クリエイター |
| SCR-20 | /creator/revenue | 売上管理 | クリエイター |
| SCR-21〜24 | /admin（タブ切替: 申請審査／クリエイター管理／コース管理／通報管理／Tier B監視／教材プリセット管理） | 管理者画面 | 管理者 |
| SCR-25 | /studio | AIコンテンツ生成スタジオ | クリエイター |

※ 要件定義書上の独立画面案（`/settings/notifications`、`/creator/courses/[id]/edit`、`/creator/courses/[id]/answers`、`/creator/earnings`等の旧パス）は実装されていない。通知設定はDay1診断フロー内（`/courses/[id]/diagnosis`）、コース基本情報編集は`/creator/courses/[id]/calendar`画面内に統合されている。

---

### 1.2 画面遷移図

```
[未ログイン]
/(SCR-01) ──→ /courses/[id](SCR-02) ──→ /login(SCR-07)
                                               ↓
                                          /signup(SCR-08)

[学習者ログイン後]
/(SCR-01)
  ├── /courses/[id](SCR-02) ──→ 購入/サブスク登録 ──→ /purchase-complete ──→ /courses/[id]/diagnosis(SCR-02b)
  │                                                                              ↓
  │                                                              /courses/[id]/chat(SCR-03)
  ├── /courses/[id]/schedule, /courses/[id]/reviews
  ├── /mypage(SCR-04) ── 購入済みコース一覧・解約・Tier変更
  ├── /favorites
  ├── /creators, /creators/[id]
  └── /creator/apply(SCR-11) ──→ 承認後 ──→ /dashboard(SCR-12)

[クリエイターログイン後]
/dashboard(SCR-12)
  ├── /creator/interview(SCR-13) ──→ /creator/profile, /dashboard/characters/[id](SCR-14)
  ├── /creator/courses(一覧)
  │     ├── /creator/courses/new(SCR-15)
  │     └── /creator/courses/[id]/calendar(SCR-17) ←→ /creator/courses/[id]/textbooks(SCR-17b)
  │           └── /creator/courses/[id]/enrollments(SCR-17c)
  ├── /creator/analytics(SCR-18)
  ├── /creator/inbox(SCR-19)  ← Tier Bの未回答対応
  ├── /creator/revenue(SCR-20)
  └── /studio(SCR-25) ── AIコンテンツ生成スタジオ

[管理者ログイン後]
/admin(SCR-21〜24) ── タブ切替で 申請審査／クリエイター管理／コース管理／通報管理／Tier B監視／教材プリセット管理 を一画面で操作
```

---

### 1.3 主要画面の詳細

#### SCR-01 トップ・マーケットプレイス
| エリア | 内容 |
|---|---|
| ヒーローバナー | キャッチコピー + 会員登録CTA |
| コース検索 | キーワード・カテゴリでフィルタ |
| コース一覧 | 公開済みコースカード一覧 |
| クリエイター向けCTA | 「あなたも伴走コースを作ろう」バナー |

#### SCR-02b Day1初回診断
| エリア | 内容 |
|---|---|
| 教材進捗入力 | コースに設定された教材ごとに未着手/進行中(周回・%)/完了を入力 |
| カスタム質問回答 | クリエイターが`CourseDiagnosisQuestion`で設定した質問（テキスト/数値/単一選択/複数選択）に回答 |
| ロードマップ生成 | 回答送信後、AIが`level_analysis`・`roadmap_reason`・`weekly_plan`・`day1_tasks`・`creator_message`を生成して即時表示 |
| 通知設定 | 朝・夜の通知時刻を設定（スキップ時はデフォルト 07:00/21:00 で保存） |

※ 固定7問の診断（現在のスコア・目標スコア・受験日等）は廃止されており、`learner_profiles`の該当カラムは未使用（NULL許容化済み）。Day1診断はクリエイターが自由に設定するカスタム質問のみで構成する。

#### SCR-03 伴走チャット画面
| エリア | 内容 |
|---|---|
| クリエイターアバター | 人格(キャラクター)のアバター画像 |
| チャット履歴 | メッセージ一覧(学習者/AI/講師を区別表示) |
| 入力フィールド | テキスト入力 + 送信ボタン（1日あたり合計2000文字までの入力制限） |
| 今日のタスク | 個人化済みタスク(Layer2: `learner_course_days`)＋前日からの繰越タスクを表示 |
| Tier B質問枠 | Tier Bの場合、1日1回まで講師に質問を届けられる（`pending_instructor`） |

#### SCR-13 AIインタビュー
| エリア | 内容 |
|---|---|
| Step0 | 指導スタイル(共感型/指導型/激励型/厳格型)とキャラクターの性別(男性/女性/中性的)を選択 |
| 進捗インジケーター | 固定質問の進行状況を表示 |
| AIメッセージ | 質問文をチャット形式で表示 |
| 回答エリア | テキスト入力 |
| 深掘り質問 | 回答内容に応じてAIが最大3回まで深掘り質問を追加する |
| 途中保存 | `interview_sessions`に進行状態(`fixed_index`・`follow_up_count`・`qa_history`)を保存し、ブラウザを閉じても続きから再開可能 |

※ インタビュー完了（`POST /interview/generate-profile`呼び出し）と同時に、人格プロファイル(`personality_profiles`)に加えて**人格(キャラクター)レコードも自動生成**される（名前の初期値はクリエイターのアカウント名）。クリエイターは生成後、`/creator/profile`または`/dashboard/characters/[id]`で名前・口調・アバター画像（AI生成または手動アップロード）を編集できる。

#### SCR-15 コース新規作成
| エリア | 内容 |
|---|---|
| 担当キャラクター表示 | クリエイター本人の人格(キャラクター)に読み取り専用で自動的に紐づく（選択UIなし） |
| コース基本情報入力 | コース名・ゴール・対象学習者・学習強度(intensity)・進行速度(pace) |
| 使用教材 | プリセット教材(`textbooks`)から検索選択、または手入力(`custom_name`/`custom_toc`)で追加。単語帳タイプの場合は1日の新規語数・復習語数も設定 |
| Day1診断カスタム質問 | 任意でカスタム質問を追加（テキスト/数値/単一選択/複数選択） |
| Tier A/B 価格設定 | Tier A・Tier Bそれぞれの月額（`tier_a_price`/`tier_b_price`）を設定。買い切り(`price`/`is_free`)コースとしての運用も可能 |

※ 1クリエイター=1人格のため、キャラクターを選ぶプルダウン等のUIは存在しない。クリエイターがまだAIインタビューを完了していない（人格が存在しない）場合は、コース作成不可とし、AIインタビューへの導線を表示する。

#### SCR-17 コース基本情報＋30日カレンダー編集
| エリア | 内容 |
|---|---|
| コース基本情報編集 | コース名・ゴール・対象者・学習強度・進行速度・価格などを編集 |
| 30日生成 | 「AIで30日分を生成する」操作でバックグラウンドタスクを起動（`days_generation_status`: idle/generating/completed/failed）。フロントエンドはポーリングで進行状況を表示 |
| カレンダービュー | 生成済みの30日分(Layer1: `course_days`)を表示。各日の`theme`・`task_types`(タスク種別と標準時間の型データ)・`is_rest_day`を編集 |
| 品質チェック | 「品質チェック」操作でAIによるコース内容のレビュー結果を取得できる |
| 公開申請 | レビュー依頼(`submit-for-review`)を経て管理者承認後に公開 |

※ Layer1の`course_days`はメッセージ文を持たない（タスクの「型」のみ）。実際の朝/夜/完了時のメッセージは、学習者ごとにLayer3（チャット時に都度生成）で作られる。旧設計の`ai_message_morning`/`ai_message_evening`/`ai_message_completion`カラムは廃止済み。

#### SCR-18 質問分析ダッシュボード
| エリア | 内容 |
|---|---|
| 質問ランキング | カテゴリ別の質問数集計 |
| カテゴリ承認 | AIが新規カテゴリ候補を`pending`状態で自動作成。クリエイターが承認(`approved`)するまでコンテンツ紐付け・フラストレーション検知の対象外 |
| コンテンツ紐付け | カテゴリに動画/記事/PDFのURLを紐付け |

#### SCR-19 Tier B 講師回答画面(/creator/inbox)
| エリア | 内容 |
|---|---|
| 未回答一覧 | 学習者名・質問・受信時刻 |
| AI下書き | 人格プロファイルで生成した回答案(`is_draft=True`) |
| 編集フィールド | 下書きを直接編集して送信、またはAI下書きをそのまま送信 |
| 超過監視 | 24時間超の未回答は管理者の「Tier B監視」タブにも表示される |

---

## 2. DB設計

### 2.1 テーブル一覧

実装は`backend/app/models/__init__.py`が読み込む全モデルに基づく。

| テーブル名 | 概要 |
|---|---|
| customers | 全ユーザー共通情報(旧名: users) |
| creator_profiles | クリエイタープロフィール・申請状態 |
| characters | クリエイターの人格(キャラクター)。creator_profiles と1対1（creator_idにUNIQUE制約、NULL許容） |
| personality_profiles | AIインタビュー結果・人格プロファイル |
| interview_sessions | AIインタビューの進行状態(途中保存) |
| courses | コース基本情報(30日伴走コース＋買い切りレッスン型コースの両方に対応) |
| course_days | Layer1: 30日分のコース骨格（タスクの型のみ、メッセージ文は持たない） |
| course_materials | コースに添付する参考資料 |
| lessons | 買い切りコースの個別レッスン(テキスト/動画) |
| lesson_progress | レッスン単位の学習進捗 |
| purchases | 買い切りコースの購入履歴 |
| course_subscriptions | 30日伴走コースの月額サブスク(Tier A/B) |
| learner_profiles | Day1初回診断の回答結果 |
| learner_roadmaps | 診断結果から生成するパーソナライズ30日ロードマップ |
| learner_course_days | Layer2: 学習者ごとに個人化された30日タスク配分 |
| daily_summaries | Layer3が参照する日次チャットサマリー |
| day_logs | 日次学習ログ(完了タスク種別含む) |
| notification_settings | 通知時刻設定 |
| questions | 学習者からの質問(タグ付け・分析用) |
| answers | 質問への回答(AI/講師) |
| question_categories | 質問の自動タグ付けカテゴリ(承認制) |
| category_contents | カテゴリに紐付けたコンテンツ |
| reports | ユーザーからの通報 |
| favorites | お気に入りクリエイター |
| notifications | アプリ内通知 |
| content_draft(s) | AIコンテンツ生成スタジオの生成途中下書き |
| learner_reviews | 学習者の週次・月次レビュー |
| textbooks | プリセット教材マスタ |
| course_textbooks | コースに紐づく教材(プリセットまたは手入力) |
| textbook_day_assignments | 教材の章・項目を30日のどの日に割り当てるか |
| learner_textbook_progress | 学習者が入力した教材ごとの進捗 |
| course_diagnosis_questions | クリエイターが設定するDay1診断のカスタム質問 |
| learner_diagnosis_answers | カスタム質問への学習者の回答 |

※ 設計時に想定されていた`creator_earnings`テーブルは実装されていない。クリエイターの売上は`purchases`・`course_subscriptions`から動的に集計して`/creators/me/revenue`で返している。

---

### 2.2 テーブル定義

#### customers
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| username | VARCHAR(100) | UNIQUE, NOT NULL | ログインID |
| hashed_password | VARCHAR(255) | NOT NULL | bcrypt |
| email | VARCHAR(255) | NULL | |
| role | VARCHAR(20) | NOT NULL, DEFAULT 'learner' | learner / creator / admin |
| is_active | BOOLEAN | DEFAULT TRUE | |
| is_password_reset_required | BOOLEAN | DEFAULT TRUE | |
| reset_token | VARCHAR(255) | NULL | パスワード再発行用トークン |
| reset_token_expires | DATETIME | NULL | |
| stripe_subscription_id | VARCHAR(255) | NULL | |
| withdrawn_at | DATETIME | NULL | 退会日時(退会判定にも使用) |
| character_id | INT | FK(characters.id), NULL | |
| theme_config | JSON | NULL | |
| subscription_plan | VARCHAR(50) | DEFAULT 'buy_once' | buy_once / monthly |
| failed_login_attempts | INT | NOT NULL, DEFAULT 0 | ログインセキュリティ(連続失敗回数) |
| locked_until | DATETIME | NULL | ロック解除時刻 |
| two_factor_code | VARCHAR(10) | NULL | 管理者向け二段階認証コード |
| two_factor_code_expires | DATETIME | NULL | |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |

#### creator_profiles
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| user_id | INT | FK(customers.id), UNIQUE, NOT NULL | |
| bio | TEXT | NULL | |
| speciality | VARCHAR(255) | NULL | 専門分野 |
| experience | TEXT | NULL | 指導実績 |
| self_intro | TEXT | NULL | 人格プロファイルの口調を反映したAI生成自己紹介文(1回生成・保存方式) |
| sns_youtube | VARCHAR(500) | NULL | |
| sns_instagram | VARCHAR(500) | NULL | |
| sns_twitter | VARCHAR(500) | NULL | |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'pending' | pending / active / suspended |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| updated_at | DATETIME | NOT NULL, DEFAULT NOW() | |

#### characters

1クリエイター=1人格の制約を表すテーブル。`creator_id`にUNIQUE制約を持ち、1つのクリエイタープロフィールに対して複数行が存在できない。AIインタビュー完了（`POST /interview/generate-profile`）時点で自動的に1行作成される。

| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| name | VARCHAR(100) | NOT NULL | 初期値はクリエイターのアカウント名。後から変更可 |
| description | VARCHAR(500) | NULL | |
| image_url | VARCHAR(500) | NULL | アバター画像(`/static/character_images/...`)。AI生成または手動アップロード |
| tone_profile | JSON | NULL | 口調・性格プロファイル |
| color_scheme | JSON | NULL | UIカラー設定 |
| font_style | VARCHAR(100) | NULL | |
| creator_id | INT | FK(creator_profiles.id), **UNIQUE**, NULL | 1対1。運営公式キャラクターはNULL |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |

#### personality_profiles
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| creator_id | INT | FK(creator_profiles.id), UNIQUE, NOT NULL | |
| interview_answers | JSON | NULL | 質問と回答のペア配列(深掘り含む全履歴) |
| profile | JSON | NULL | 人格プロファイル構造体(communication/coaching_style/learning_philosophy/thinking_style) |
| base_type | VARCHAR(50) | NULL | Step0で選んだ指導スタイルのプリセット |
| gender | VARCHAR(20) | NULL | Step0で選んだキャラクターの性別 |
| sample_reply | TEXT | NULL | クリエイター紹介ページに表示するAI生成サンプル返信(1回生成・保存方式) |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| updated_at | DATETIME | NOT NULL, DEFAULT NOW() | |

#### interview_sessions
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| creator_id | INT | FK(creator_profiles.id), UNIQUE, NOT NULL | |
| fixed_index | INT | NOT NULL, DEFAULT 0 | 次に出す固定質問のインデックス |
| follow_up_count | INT | NOT NULL, DEFAULT 0 | 深掘り質問の使用数(最大3) |
| pending_question | VARCHAR(1000) | NULL | 直近にAIが提示した質問文(回答待ち) |
| base_type | VARCHAR(50) | NULL | Step0で選んだ指導スタイルのプリセット |
| gender | VARCHAR(20) | NULL | Step0で選んだキャラクターの性別 |
| qa_history | JSON | NULL | [{question, answer, is_followup}] の配列 |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'in_progress' | in_progress / completed |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| updated_at | DATETIME | NOT NULL, DEFAULT NOW() | |

#### courses
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| character_id | INT | FK(characters.id), NOT NULL | |
| title | VARCHAR(255) | NOT NULL | |
| description | TEXT | NULL | |
| thumbnail_url | VARCHAR(500) | NULL | |
| category | VARCHAR(100) | NULL | 例:TOEIC / IELTS / 英文法 |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'draft' | draft / review / published / unpublished |
| price | INT | NOT NULL, DEFAULT 0 | 買い切りコースの場合の価格(円) |
| is_free | BOOLEAN | NOT NULL, DEFAULT FALSE | |
| goal | VARCHAR(255) | NULL | 30日伴走コースのゴール |
| target_learner | TEXT | NULL | 対象学習者像 |
| intensity | VARCHAR(100) | NULL | 学習強度(コース生成のインプット) |
| study_materials | TEXT | NULL | 使用教材(テキスト記述、コース生成のインプット) |
| pace | VARCHAR(50) | NULL | 進行速度(コース生成のインプット) |
| personality_profile_id | INT | FK(personality_profiles.id), NULL | |
| days_generation_status | VARCHAR(20) | NOT NULL, DEFAULT 'idle' | idle / generating / completed / failed |
| days_generation_error | TEXT | NULL | |
| tier_a_price | INT | NULL | Tier A月額(円) |
| tier_b_price | INT | NULL | Tier B月額(円) |
| is_suspended | BOOLEAN | NOT NULL, DEFAULT FALSE | 管理者専用エンドポイントでのみ変更可 |
| suspension_reason | TEXT | NULL | |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| updated_at | DATETIME | NOT NULL, DEFAULT NOW() | |

※ Tier区分のENUM('A','B')はcourses本体には存在しない。Tier別の価格列(`tier_a_price`/`tier_b_price`)を両方NULLにすれば買い切り(`price`/`is_free`)コースとして運用できる構造になっている。

#### course_days (Layer1: コース骨格)
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| course_id | INT | FK(courses.id), NOT NULL | |
| day_number | INT | NOT NULL | 1〜30 |
| week_number | INT | NOT NULL | 1〜4 |
| theme | VARCHAR(255) | NULL | |
| task_types | JSON | NULL | タスク種別と標準時間の型データ。例: [{"type":"vocabulary","label":"単語学習","base_minutes":15}] |
| is_rest_day | BOOLEAN | NOT NULL, DEFAULT FALSE | |
| is_edited_by_creator | BOOLEAN | NOT NULL, DEFAULT FALSE | |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| updated_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| | | UNIQUE(course_id, day_number) | |

※ 旧設計にあった`ai_message_morning`/`ai_message_evening`/`ai_message_completion`カラムは廃止済み。メッセージ文は学習者ごとにLayer3（チャット時にAIが都度生成）で作られるため、Layer1は「型」のみを持つ。

#### learner_course_days (Layer2: 個人化タスク配分)
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| learner_profile_id | INT | FK(learner_profiles.id), NOT NULL | |
| day_number | INT | NOT NULL | 1〜30 |
| adjusted_tasks | JSON | NOT NULL | 例: [{"type":"vocabulary","minutes":15}] |
| personalize_reason | TEXT | NULL | |
| carryover_tasks | JSON | NULL | 前日に未完了だったタスクの繰越 |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| | | UNIQUE(learner_profile_id, day_number) | |

#### daily_summaries
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| user_id | INT | FK(customers.id), NOT NULL | |
| course_id | INT | FK(courses.id), NOT NULL | |
| day_number | INT | NOT NULL | |
| summary | TEXT | NOT NULL | Layer3が直近3日分の文脈として参照する圧縮済みサマリー(100トークン以内) |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| | | UNIQUE(user_id, course_id, day_number) | |

#### lessons / lesson_progress / purchases（買い切りコース）
| テーブル | 主な役割 |
|---|---|
| lessons | コース内の個別レッスン(text/video)。`is_preview`で未購入でも閲覧可能なレッスンを指定可能 |
| lesson_progress | (user_id, lesson_id)単位の完了状態 |
| purchases | 買い切りコースの購入履歴(`stripe_payment_intent_id`でStripeと連携、status: pending/succeeded/failed/refunded) |

#### course_subscriptions
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| user_id | INT | FK(customers.id), NOT NULL | |
| course_id | INT | FK(courses.id), NOT NULL | |
| tier | VARCHAR(1) | NOT NULL | "A" / "B" |
| stripe_customer_id | VARCHAR(255) | NULL | |
| stripe_subscription_id | VARCHAR(255) | NULL | |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'incomplete' | incomplete / active / past_due / canceled |
| current_period_end | DATETIME | NULL | |
| past_due_since | DATETIME | NULL | past_dueになった時刻(3日間の猶予期間の起点) |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| updated_at | DATETIME | NOT NULL, DEFAULT NOW() | |

※ 解約後の再契約で履歴として複数行が残るため、`(user_id, course_id)`のUNIQUE制約は撤廃済み。同時に有効な契約が1件のみであることはアプリケーション側（`POST /payments/subscribe`の存在チェック）で保証する。

#### learner_profiles
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| user_id | INT | FK(customers.id), NOT NULL | |
| course_id | INT | FK(courses.id), NOT NULL | |
| current_score | INT | NULL | 廃止済み(固定7問の名残、未使用) |
| target_score | INT | NULL | 廃止済み(NULL許容化済み、未使用) |
| exam_date | VARCHAR(50) | NULL | 廃止済み(未使用) |
| daily_study_time | VARCHAR(50) | NULL | 廃止済み(未使用) |
| weak_areas | JSON | NULL | 廃止済み(未使用) |
| study_history | TEXT | NULL | |
| materials | TEXT | NULL | |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| | | UNIQUE(user_id, course_id) | |

※ Day1診断は現在クリエイターが設定するカスタム質問(`course_diagnosis_questions`)のみで構成されており、固定7問は廃止済み。上記の旧カラムはアプリケーションコードから参照されていない。

#### learner_roadmaps
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| learner_profile_id | INT | FK(learner_profiles.id), UNIQUE, NOT NULL | |
| level_analysis | JSON | NOT NULL | |
| roadmap_reason | TEXT | NOT NULL | 「なぜこのロードマップになったのか」 |
| weekly_plan | JSON | NOT NULL | 週単位のテーマ・マイルストーン・理由の配列 |
| day1_tasks | JSON | NOT NULL | Day1の具体的タスク配列 |
| creator_message | TEXT | NOT NULL | 人格プロファイルを適用したメッセージ |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |

#### day_logs
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| user_id | INT | FK(customers.id), NOT NULL | |
| course_id | INT | FK(courses.id), NOT NULL | |
| day_number | INT | NOT NULL | |
| is_completed | BOOLEAN | NOT NULL, DEFAULT FALSE | |
| completed_at | DATETIME | NULL | |
| memo | TEXT | NULL | |
| completed_task_types | JSON | NULL | 実際に完了したタスク種別(繰越タスク計算に使用)。NULLは全タスク完了とみなす |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| | | UNIQUE(user_id, course_id, day_number) | |

#### notification_settings
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| user_id | INT | FK(customers.id), NOT NULL | |
| course_id | INT | FK(courses.id), NOT NULL | |
| morning_time | VARCHAR(5) | NOT NULL, DEFAULT '07:00' | |
| evening_time | VARCHAR(5) | NOT NULL, DEFAULT '21:00' | |
| is_enabled | BOOLEAN | NOT NULL, DEFAULT TRUE | |
| updated_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| | | UNIQUE(user_id, course_id) | |

#### reports
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| reporter_id | INT | FK(customers.id), NOT NULL | |
| target_type | VARCHAR(20) | NOT NULL | course / creator |
| target_id | INT | NOT NULL | |
| reason | TEXT | NOT NULL | |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'pending' | pending / resolved |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |

#### questions
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| user_id | INT | FK(customers.id), NOT NULL | |
| course_id | INT | FK(courses.id), NOT NULL | |
| tier | VARCHAR(1) | NOT NULL, DEFAULT 'A' | A / B |
| body | TEXT | NOT NULL | |
| category_id | INT | FK(question_categories.id), NULL | |
| status | VARCHAR(30) | NOT NULL, DEFAULT 'pending' | pending / answered_by_ai / answered_by_instructor / pending_instructor |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |

#### answers
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| question_id | INT | FK(questions.id), NOT NULL | UNIQUE制約なし(Tier BではAI下書き+講師確認済みの複数行が存在しうる) |
| answered_by | VARCHAR(20) | NOT NULL | ai / instructor |
| body | TEXT | NOT NULL | |
| linked_content_url | VARCHAR(500) | NULL | |
| is_draft | BOOLEAN | NOT NULL, DEFAULT FALSE | Tier B講師確認前はtrue |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| sent_at | DATETIME | NULL | |

#### question_categories
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| creator_id | INT | FK(creator_profiles.id), NOT NULL | |
| name | VARCHAR(100) | NOT NULL | |
| keywords | JSON | NULL | |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'pending' | pending / approved / rejected。AIが新規提案したカテゴリは承認まで分析・紐付け対象外 |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |

#### category_contents
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| category_id | INT | FK(question_categories.id), NOT NULL | |
| content_type | VARCHAR(20) | NOT NULL | video / article / pdf |
| title | VARCHAR(255) | NOT NULL | |
| url | VARCHAR(500) | NOT NULL | |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |

#### favorites
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| user_id | INT | FK(customers.id), NOT NULL | |
| creator_id | INT | FK(creator_profiles.id), NOT NULL | |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| | | UNIQUE(user_id, creator_id) | |

#### notifications
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| user_id | INT | FK(customers.id), NOT NULL | |
| type | VARCHAR(100) | NOT NULL | 例: new_content / purchase_complete |
| payload | JSON | NULL | |
| is_read | BOOLEAN | NOT NULL, DEFAULT FALSE | |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |

#### learner_reviews
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| user_id | INT | FK(customers.id), NOT NULL | |
| course_id | INT | FK(courses.id), NOT NULL | |
| review_type | VARCHAR(10) | NOT NULL | weekly / monthly |
| period_number | INT | NOT NULL | weekly: 1〜13週、monthly: 1〜3ヶ月 |
| content | JSON | NOT NULL | |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| | | UNIQUE(user_id, course_id, review_type, period_number) | |

#### textbooks / course_textbooks / textbook_day_assignments / learner_textbook_progress（教材機能）
| テーブル | 主な役割 |
|---|---|
| textbooks | プリセット教材マスタ(`is_preset`)。管理者が`/admin`の教材プリセット管理タブで登録・編集 |
| course_textbooks | コースに紐づく教材。プリセット参照(`textbook_id`)または手入力(`custom_name`/`custom_toc`)。単語帳タイプは1日の新規/復習語数、目標周回数(`target_laps`)を持つ |
| textbook_day_assignments | 教材の章・項目(`toc_item`)を30日のうちどの日にやるか割り当て(`day_number`がNULLなら「やらない」) |
| learner_textbook_progress | 学習者がDay1診断で入力した教材ごとの現在進捗。`current_progress`は「1周=100%」単位の累計値 |

#### course_diagnosis_questions / learner_diagnosis_answers
| テーブル | 主な役割 |
|---|---|
| course_diagnosis_questions | クリエイターがコース作成時に追加するDay1診断のカスタム質問(text/number/single/multi) |
| learner_diagnosis_answers | カスタム質問への学習者の回答 |

#### content_drafts
| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| creator_id | INT | FK(creator_profiles.id), NULL | |
| character_id | INT | FK(characters.id), NULL | |
| theme | VARCHAR(255) | NOT NULL | |
| structure | JSON | NULL | 構成案(セクション見出しのリスト) |
| target_level | VARCHAR(50) | NULL | |
| raw_content | TEXT | NULL | Step2: 素材生成結果 |
| voiced_content | TEXT | NULL | Step3: 口調変換結果 |
| script_content | TEXT | NULL | Step4: 台本生成結果 |
| created_at | DATETIME | NOT NULL, DEFAULT NOW() | |
| updated_at | DATETIME | NOT NULL, DEFAULT NOW() | |

---

## 3. API設計

### 3.1 基本方針
- RESTful API(FastAPI)
- 認証: JWTトークン(Bearer)。`sub`にユーザーID(`str`)を格納
- レスポンス形式: JSON
- ロール: `learner` / `creator` / `admin`。`get_current_admin`・`get_current_creator_or_admin`等の依存関数で権限チェック
- ログインセキュリティ: 連続失敗時のアカウントロック(`failed_login_attempts`/`locked_until`)、管理者は二段階認証(メール認証コード)
- 本番環境ではSwagger UI/Redoc/OpenAPI JSONを`DOCS_ENABLED`設定で非公開化可能

---

### 3.2 エンドポイント一覧

#### 認証 (Auth) `/auth`
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| POST | /auth/signup | 会員登録 | 不要 |
| POST | /auth/login | ログイン(二段階認証対象者は仮トークンを返す) | 不要 |
| POST | /auth/verify-2fa | 管理者の二段階認証コード検証 | 不要(仮トークン) |
| POST | /auth/change-password | パスワード変更 | 要 |
| POST | /auth/forgot-password | リセットメール送信 | 不要 |
| POST | /auth/reset-password | パスワードリセット実行 | 不要 |
| GET | /auth/me | 自分の情報取得 | 要 |

#### 顧客管理 (Customers) `/customers`
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| GET | /customers | 顧客一覧 | 要(admin) |
| POST | /customers | 顧客作成 | 要(admin) |
| PATCH | /customers/{customer_id} | 顧客情報更新 | 要(admin) |
| POST | /customers/{customer_id}/reissue-password | パスワード再発行 | 要(admin) |
| DELETE | /customers/{customer_id} | 顧客削除 | 要(admin) |
| POST | /customers/me/withdraw | 退会 | 要 |

#### キャラクター (Characters) `/characters`
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| GET | /characters | キャラクター一覧 | 不要 |
| GET | /characters/{character_id} | キャラクター詳細 | 不要 |
| GET | /characters/theme/{character_id} | キャラクターのUIテーマ設定取得 | 不要 |
| POST | /characters | キャラクター作成 | 要(admin等運用用途) |
| PATCH | /characters/{character_id} | キャラクター更新 | 要(本人/admin) |
| POST | /characters/{character_id}/preview | キャラクターのAI生成プレビュー | 要 |
| POST | /characters/{character_id}/image | アバター画像生成/アップロード | 要(本人) |
| DELETE | /characters/{character_id}/image | アバター画像削除 | 要(本人) |
| DELETE | /characters/{character_id} | キャラクター削除 | 要(admin) |

#### クリエイター (Creators) `/creators`
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| POST | /creators/apply-public | 未ログインからのクリエイター申請(同時に学習者アカウント作成) | 不要 |
| POST | /creators/apply | クリエイター申請 | 要(learner) |
| GET | /creators/me | 自分のクリエイタープロフィール取得 | 要(creator) |
| PUT | /creators/me | クリエイタープロフィール更新 | 要(creator) |
| GET | /creators/me/revenue | 自分の売上集計取得(purchases/course_subscriptionsから動的集計) | 要(creator) |
| POST | /creators/me/generate-intro | AI生成自己紹介文の生成・保存 | 要(creator) |
| GET | /creators | クリエイター一覧(公開プロフィール用) | 不要 |
| GET | /creators/{creator_id} | クリエイター公開プロフィール取得 | 不要 |

#### AIインタビュー (Interview) `/interview`
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| POST | /interview/start | インタビュー開始(Step0込み)・最初の質問を返す | 要(creator) |
| POST | /interview/answer | 回答を送信・次の質問(深掘り含む) or 完了を返す | 要(creator) |
| POST | /interview/generate-profile | 回答をもとに人格プロファイルを生成。**人格(キャラクター)レコードが未作成の場合は同時に自動作成**する | 要(creator) |
| GET | /interview/profile | 人格プロファイル取得 | 要(creator) |
| PUT | /interview/profile | 人格プロファイル手動修正 | 要(creator) |

#### コース (Courses) `/courses` 他
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| GET | /courses | 公開コース一覧(検索・フィルタ対応) | 不要 |
| GET | /stats/public | 公開統計(コース数等) | 不要 |
| GET | /creators/{creator_id}/courses | クリエイター別の公開コース一覧 | 不要 |
| GET | /courses/me/created | 自分が作成したコース一覧 | 要(creator) |
| GET | /courses/{course_id}/enrollments | コースの申込者一覧 | 要(creator/本人) |
| GET | /courses/{course_id} | コース詳細 | 不要 |
| POST | /courses | コース新規作成。`character_id`の指定は不要で、クリエイター本人の人格(キャラクター)に自動的に紐づく | 要(creator) |
| PUT | /courses/{course_id} | コース更新 | 要(creator/本人) |
| GET | /courses/{course_id}/quality-check | AIによるコース内容の品質チェック | 要(creator/本人) |
| POST | /courses/{course_id}/submit-for-review | 管理者レビュー依頼(公開申請) | 要(creator/本人) |
| POST | /courses/{course_id}/lessons | レッスン追加(買い切りコース用) | 要(creator/本人) |
| PUT | /lessons/{lesson_id} | レッスン更新 | 要(creator/本人) |
| DELETE | /lessons/{lesson_id} | レッスン削除 | 要(creator/本人) |
| PUT | /courses/{course_id}/lessons/reorder | レッスン並び替え | 要(creator/本人) |
| POST | /courses/{course_id}/generate-days | 30日コースをAIでバックグラウンド生成開始(202 Accepted) | 要(creator/本人) |
| GET | /courses/{course_id}/generation-status | 30日生成の進行状況取得(ポーリング用) | 要(creator/本人) |
| GET | /courses/{course_id}/days | Layer1: 30日分のコース骨格一覧 | 要 |
| PUT | /courses/{course_id}/days/{day_number} | 特定日の内容を更新 | 要(creator/本人) |
| GET | /courses/{course_id}/materials | 参考資料一覧 | 要(購入済み) |
| POST | /courses/{course_id}/materials | 参考資料追加 | 要(creator/本人) |
| DELETE | /materials/{material_id} | 参考資料削除 | 要(creator/本人) |
| GET | /textbooks | プリセット教材検索 | 要(creator) |
| GET | /courses/{course_id}/textbooks | コースの教材一覧 | 要 |
| POST | /courses/{course_id}/textbooks | コースに教材を追加 | 要(creator/本人) |
| PUT | /course-textbooks/{course_textbook_id} | コース教材の設定更新 | 要(creator/本人) |
| DELETE | /course-textbooks/{course_textbook_id} | コース教材削除 | 要(creator/本人) |
| PUT | /course-textbooks/{course_textbook_id}/day-assignments | 教材の章を日別に割り当て | 要(creator/本人) |
| POST | /courses/{course_id}/textbooks/plan | AIによる教材配分案の生成 | 要(creator/本人) |
| POST | /courses/{course_id}/textbooks/plan/apply | 生成された配分案の適用 | 要(creator/本人) |
| GET | /courses/me/purchased | 自分が購入/契約中のコース一覧 | 要(learner) |
| GET | /courses/{course_id}/progress | 学習進捗取得 | 要(本人) |
| PUT | /lessons/{lesson_id}/complete | レッスン完了登録 | 要(本人) |
| GET | /courses/{course_id}/day-logs | 学習ログ一覧 | 要(本人) |
| PUT | /courses/{course_id}/day-logs/{day_number}/complete | 当日の学習完了を記録 | 要(learner) |
| GET | /courses/{course_id}/diagnosis-questions | Day1診断カスタム質問一覧 | 要(creator/本人) |
| POST | /courses/{course_id}/diagnosis-questions | カスタム質問追加 | 要(creator/本人) |
| PUT | /diagnosis-questions/{question_id} | カスタム質問更新 | 要(creator/本人) |
| DELETE | /diagnosis-questions/{question_id} | カスタム質問削除 | 要(creator/本人) |

#### Day1初回診断・ロードマップ (Diagnosis) `/diagnosis`
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| GET | /diagnosis/{course_id}/questions | 教材進捗質問＋クリエイターのカスタム質問取得 | 要(購入済み学習者) |
| POST | /diagnosis/{course_id}/welcome | クリエイターの人格でウェルカムメッセージ生成 | 要(購入済み学習者) |
| POST | /diagnosis/{course_id}/submit | カスタム質問への回答を保存し、ロードマップとLayer2(個人化タスク)を生成 | 要(購入済み学習者) |
| GET | /diagnosis/{course_id}/learner-days | Layer2: 個人化済み30日タスク配分取得 | 要(購入済み学習者) |
| GET | /diagnosis/{course_id}/roadmap | 生成済みロードマップ取得 | 要(購入済み学習者) |
| GET | /diagnosis/{course_id}/notification-settings | 通知時刻設定取得 | 要(購入済み学習者) |
| PUT | /diagnosis/{course_id}/notification-settings | 通知時刻設定更新 | 要(購入済み学習者) |
| GET | /diagnosis/{course_id}/reviews | 週次・月次レビュー一覧取得 | 要(購入済み学習者) |

#### デイリー伴走チャット・質問分析 (Chat) `/chat`
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| POST | /chat/{course_id}/ask | メッセージ送信・AIが応答(Tier Bは1日1回まで講師に転送) | 要(購入済み) |
| GET | /chat/{course_id}/history | チャット履歴取得 | 要(本人) |
| GET | /chat/{course_id}/today-message | 当日のタスク・メッセージ(Layer3生成)取得 | 要(購入済み) |
| POST | /chat/{course_id}/daily-summary | 当日チャットのサマリーを生成・保存(`daily_summaries`) | 要(購入済み) |
| GET | /chat/creator/pending | Tier B未回答質問一覧(AI下書き付き) | 要(creator) |
| GET | /chat/creator/pending/overdue-count | 24時間超の未回答数取得 | 要(creator) |
| POST | /chat/creator/questions/{question_id}/respond | 回答を承認・送信 | 要(creator/本人) |
| GET | /chat/creator/analytics | 質問カテゴリ別集計 | 要(creator/本人) |
| GET | /chat/creator/categories/pending | 承認待ちカテゴリ一覧 | 要(creator) |
| PUT | /chat/creator/categories/{category_id}/approve | カテゴリ承認 | 要(creator/本人) |
| PUT | /chat/creator/categories/{category_id}/reject | カテゴリ却下 | 要(creator/本人) |
| GET | /chat/creator/categories/{category_id}/questions | カテゴリ別の実際の質問文一覧 | 要(creator/本人) |
| POST | /chat/creator/categories/{category_id}/contents | カテゴリにコンテンツ紐付け | 要(creator) |
| DELETE | /chat/creator/contents/{content_id} | 紐付け解除 | 要(creator/本人) |

#### 通知 (Notifications) `/notifications`
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| GET | /notifications | 通知一覧取得 | 要 |
| PUT | /notifications/{notification_id}/read | 既読化 | 要 |
| PUT | /notifications/read-all | 全件既読化 | 要 |

#### お気に入り (Favorites) `/favorites`
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| POST | /favorites/{creator_id} | お気に入り追加 | 要(learner) |
| DELETE | /favorites/{creator_id} | お気に入り解除 | 要(learner) |
| GET | /favorites | お気に入り一覧取得 | 要(learner) |

#### 決済 (Payments / Stripe) `/payments`
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| POST | /payments/checkout | 買い切りコース購入用Payment Intent作成 | 要(learner) |
| POST | /payments/subscribe | 30日伴走コースのサブスク開始(Tier A/B指定) | 要(learner) |
| POST | /payments/subscriptions/{subscription_id}/cancel | サブスク即時解約 | 要(本人) |
| POST | /payments/subscriptions/{subscription_id}/change-tier | Tierのアップ/ダウングレード(解約せず既存サブスクを更新) | 要(本人) |
| POST | /payments/webhook | Stripe Webhook受信 | Stripe署名検証 |
| POST | /payments/refund/{purchase_id} | 買い切りコースの全額返金 | 要(admin) |

※ `PAYMENTS_TEST_MODE=True`（`.env`設定）の場合、Stripeを呼ばずに即時`succeeded`/`active`扱いの購入・サブスクレコードを作成する開発用フローが`checkout_course`/`subscribe_to_course`に組み込まれている。本番ではStripe Payment Intent / Subscription（価格は`price_data`で動的生成、Tier変更時は`proration_behavior=create_prorations`で按分）を使用する。Stripe Connectによる講師への直接分配は実装されていない。

#### AIコンテンツ生成スタジオ (Studio) `/studio`
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| POST | /studio/generate/character | キャラクター設定のAI生成 | 要(creator) |
| POST | /studio/consult | AI教材プラン相談 | 要(creator) |
| POST | /studio/generate/raw | Step2: 素材生成 | 要(creator) |
| POST | /studio/generate/voiced | Step3: 口調変換 | 要(creator) |
| POST | /studio/generate/script | Step4: 台本生成 | 要(creator) |
| GET | /studio/drafts | 生成下書き一覧 | 要(creator) |
| GET | /studio/drafts/{draft_id} | 下書き詳細取得 | 要(creator) |
| DELETE | /studio/drafts/{draft_id} | 下書き削除 | 要(creator) |

#### 管理者 (Admin) `/admin`
| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| GET | /admin/creator-applications | クリエイター申請一覧 | 要(admin) |
| PUT | /admin/creator-applications/{profile_id}/approve | 申請承認 | 要(admin) |
| PUT | /admin/creator-applications/{profile_id}/reject | 申請却下 | 要(admin) |
| GET | /admin/creators | クリエイター一覧 | 要(admin) |
| PUT | /admin/creators/{profile_id}/suspend | クリエイター停止 | 要(admin) |
| PUT | /admin/creators/{profile_id}/reactivate | クリエイター復帰 | 要(admin) |
| GET | /admin/courses | 全コース一覧 | 要(admin) |
| PUT | /admin/courses/{course_id}/suspend | コース停止 | 要(admin) |
| DELETE | /admin/courses/{course_id} | コース削除 | 要(admin) |
| PUT | /admin/courses/{course_id}/unsuspend | コース停止解除 | 要(admin) |
| PUT | /admin/courses/{course_id}/approve | コース公開承認 | 要(admin) |
| PUT | /admin/courses/{course_id}/reject | コース公開却下 | 要(admin) |
| POST | /admin/reports | 通報を送信 | 要 |
| GET | /admin/reports | 通報一覧 | 要(admin) |
| PUT | /admin/reports/{report_id}/resolve | 通報対応(解決済みに更新) | 要(admin) |
| GET | /admin/tier-b-overdue | Tier B未回答一覧(24時間超) | 要(admin) |
| GET | /admin/textbooks | プリセット教材一覧 | 要(admin) |
| POST | /admin/textbooks | プリセット教材登録 | 要(admin) |
| PUT | /admin/textbooks/{textbook_id} | プリセット教材更新 | 要(admin) |
| DELETE | /admin/textbooks/{textbook_id} | プリセット教材削除 | 要(admin) |

---

## 4. 30日コース生成アーキテクチャ（Layer1/2/3）

3層に分離した構成で、コース全体に共通する骨格と、学習者ごとの個人化、日々のチャット生成を分離している。

| レイヤー | 生成タイミング | 保存先 | 内容 |
|---|---|---|---|
| Layer1 | クリエイターがコース作成時に1回生成(`POST /courses/{id}/generate-days`) | `course_days` | 30日分の週テーマ・タスク種別と標準時間の「型」のみ。全学習者で共通。メッセージ文は持たない |
| Layer2 | 学習者のDay1診断完了時に1回生成(`POST /diagnosis/{id}/submit`内、`personalize_prompts`使用) | `learner_course_days` | クリエイターのカスタム質問への回答・教材進捗をもとに、Layer1のタスクを学習者ごとに個人化(分量調整)。生成失敗時はLayer1の標準タスクをそのままコピーするフォールバックあり |
| Layer3 | 学習者がチャットを開くたび・タスク完了報告のたびに都度生成(`chat_prompts`使用) | DBに永続化しない(その場で生成し返す)。直近3日分の文脈は`daily_summaries`を参照 | 人格プロファイル・当日タスク・直近の会話サマリーを踏まえた朝/夜/応答メッセージ |

`backend/app/core/course_generation_prompts.py`(Layer1)、`backend/app/core/personalize_prompts.py`(Layer2)、`backend/app/core/chat_prompts.py`(Layer3)がそれぞれのプロンプトを担う。教材ベースの個人化（議論サマリー13節）では`learner_textbook_progress`の残タスク量を計算してLayer2生成のインプットに加え、未完了タスクの繰越（議論サマリー15節）は`day_logs.completed_task_types`と`learner_course_days.carryover_tasks`で管理する。

---

## 5. 技術スタック

| レイヤー | 技術 | 備考 |
|---|---|---|
| フロントエンド | Next.js(App Router) | `frontend/app`配下 |
| バックエンド | FastAPI(Python) | `backend/app`配下 |
| DB | MySQL | SQLAlchemy ORM。アプリ起動時の簡易マイグレーション(`main.py`)でカラム追加・リネーム・旧テーブル削除を自動実施(本番はAlembic相当の運用を想定) |
| 決済 | Stripe(Payment Intent + Subscription) | `PAYMENTS_TEST_MODE`設定でStripe未接続のテスト運用が可能。Stripe Connectによる講師への直接分配は未実装 |
| AI | Anthropic API(Claude) | `backend/app/core/llm.py`経由で呼び出し。インタビュー・コース生成・チャット応答・コンテンツ生成スタジオ等で利用 |
| 静的ファイル配信 | FastAPI StaticFiles | `backend/app/static/character_images/`配下にAI生成キャラクター画像を保存(`/static`でマウント) |
| メール配信 | `backend/app/core/email.py` | パスワードリセット・Tier B質問通知・3段階リマインド・週次/月次レビュー通知等 |
| バックグラウンド処理 | FastAPI lifespan + asyncio | 専用ジョブキュー/cronコンテナを追加せず、アプリ内ループで日次通知(1分間隔)・非アクティブリマインド(1時間間隔)・週次/月次レビュー生成(30分間隔)を実行 |
