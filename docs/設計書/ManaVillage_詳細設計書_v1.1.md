# ManaVillage 詳細設計書 v1.1

> ステータス: ドラフト v1.1（現行コードベースに準拠して更新）
> 関連ドキュメント: ManaVillage 基本設計書 v1.1 / 要件定義書 v1.1

---

## 1. 認証フロー詳細

### 1.1 JWT設計

| 項目 | 仕様 |
|---|---|
| アルゴリズム | HS256 |
| アクセストークン有効期限 | 60分（`ACCESS_TOKEN_EXPIRE_MINUTES`、Refreshトークンは存在しない） |
| 保存場所(フロント) | フロントエンドのストレージ（Authorizationヘッダーで送信） |
| ログインID | メールアドレス（`email`）。メール未設定の旧アカウントは`username`でも照合する |

**JWTペイロード**
```json
{
  "sub": "user_id",
  "role": "learner | creator | admin",
  "exp": 1234567890
}
```

**ログインのブルートフォース対策**（`backend/app/routers/auth.py`）
- 認証失敗時に意図的に0.5秒スリープ（タイミング攻撃・ブルートフォース抑止）
- ユーザーの存在有無を区別しない汎用エラーメッセージ
- 同一アカウントの連続ログイン失敗が10回（`LOGIN_MAX_ATTEMPTS`）に達すると30分間（`LOGIN_LOCKOUT_MINUTES`）ロック（時間経過で自動解除）
- 同一IPからのログイン試行をRedisベースのレート制限で制御（`enforce_rate_limit`、20回/時間）

**管理者の二段階認証（2FA）**
- `role == "admin"` かつメールアドレス設定済みの場合、ログイン成功後にメールで6桁の認証コード（有効期限10分）を送信し、`POST /auth/verify-2fa` で検証してからアクセストークンを発行する
- メールアドレス未設定の管理者アカウントは2FAをスキップする（ログにその旨を記録）

### 1.2 パスワードリセットフロー

```
POST /auth/forgot-password
  → DBにリセットトークン(URL-safeトークン)を保存(有効期限60分, RESET_TOKEN_EXPIRE_MINUTES)
  → リセットURL: {FRONTEND_URL}/reset-password?token={token}
  → メールアドレスが存在しない場合も同じレスポンスを返す(メール存在の漏洩防止)
  → Resend経由でメール送信

POST /auth/reset-password
  → DBでトークンと有効期限を検証
  → パスワードをbcryptでハッシュ化して更新
  → 使用済みトークンをDBから即時削除（reset_token, reset_token_expiresをNULLに）
  → パスワード変更完了通知メールを送信
```

パスワード変更（`POST /auth/change-password`）・リセット完了後はいずれも、不正な変更の早期検知のため本人へ通知メールを送信する。

---

## 2. プロンプト設計

> ここがManaVillageの最重要実装。事業の成否を分ける2点を中核に設計する。
> - **事業検証ポイント①**: Tier Bへのアップグレードトリガー設計
> - **事業検証ポイント②**: Day1の「驚き」を生むパーソナライズ30日ロードマップ生成精度

すべてのAI生成処理は **DeepSeek API（OpenAI互換 Chat Completions）** 経由で行う（`backend/app/core/llm.py`）。Anthropic Claudeは使用していない。

---

### 2.1 AIインタビュー(人格収集)プロンプト

クリエイターの人格を引き出すためのインタビュープロンプト。1クリエイター=1人格のため、このインタビュー完了時に人格プロファイルと人格(キャラクター)レコードが1組だけ自動生成される（`POST /interview/generate-profile`、実装: `backend/app/routers/interview.py`、プロンプト: `backend/app/core/personality_prompts.py`）。

進行は`InterviewSession`テーブル（`backend/app/models/interview_session.py`）でブラウザを閉じても再開できるよう保存される。Step0でクリエイターは指導スタイルのプリセット（`base_type`: 共感型/指導型/激励型/厳格型）とキャラクターの性別（`gender`: 男性/女性/中性的）を選択できる（任意）。

**固定質問（学習者のセリフ形式のロールプレイ）**

「あなたの指導哲学は？」のような抽象的な質問では建前の回答になりやすいため、学習者本人のセリフとして質問を投げかけ、実際にその場で返すであろう生のセリフをそのまま引き出す方式にしている。

```
Q1: 「○○先生、最近全然リスニングが伸びなくて…正直心が折れそうです。」
Q2: 「英語、ほぼ初心者です。とりあえず最初の1週間、何から始めればいいですか？」
Q3: 「単語も文法もリスニングも全部中途半端で、何を優先すればいいか分かりません。先生はどう考えますか？」
Q4: 「3ヶ月続けてるのに全然伸びている気がしません…私のやり方、何か間違ってますか？」
Q5: 「先生のコースに申し込もうか迷ってるんですけど、他の先生と何が違うんですか？」
```

各回答後、AIが「返答が短い・抽象的・建前っぽい」と判定した場合のみ深掘り質問を生成する（`FOLLOW_UP_DECISION_SYSTEM`、最大3問・`MAX_FOLLOW_UPS`）。深掘りも学習者がさらに食い下がってきたセリフの形で行う。

**人格プロファイル抽出（`PROFILE_GENERATION_SYSTEM`）**

全インタビュー履歴（固定質問＋深掘り）から、以下のJSON形式で人格プロファイルを抽出する。`base_type`・`gender`が設定されている場合は、回答内容を優先しつつ薄い項目をそのヒントで補完する。

```json
{
  "communication": { "tone", "first_person", "sentence_ending", "catchphrase" },
  "coaching_style": { "strictness", "encouragement", "feedback_method" },
  "learning_philosophy": { "core_value", "priority", "judgment_criteria" },
  "thinking_style": { "analogy_tendency", "explanation_method", "problem_solving" },
  "sample_reply": "クリエイター紹介ページのサンプルチャットに使う、固定の学習者セリフへの返信（1回生成・保存方式）"
}
```

生成された`profile`・`interview_answers`・`base_type`・`gender`・`sample_reply`は`PersonalityProfile`テーブル（`backend/app/models/personality_profile.py`）に保存される。クリエイターは`PUT /interview/profile`で生成結果を手動修正できる。

---

### 2.2 【事業検証ポイント②】コース生成とパーソナライズ30日ロードマップ生成（3層アーキテクチャ）

**最重要プロンプト群。Day1の「驚き」を生む精緻さと具体性がここで決まる。**

コース生成は1回のAI呼び出しで終わらせず、以下の3層に分離されている（`backend/app/core/course_generation_prompts.py`, `personalize_prompts.py`, `chat_prompts.py`）。

| 層 | 内容 | 実行タイミング | 実装ファイル |
|---|---|---|---|
| Layer1: コース骨格 | 全学習者共通の30日分の「テーマ」と「タスクの型」（メッセージ文は持たない） | クリエイターがコース公開時に1回生成 | `course_generation_prompts.py` |
| Layer2: 個人化タスク配分 | 学習者のDay1診断回答に基づくタスク配分の調整 | 学習者のDay1診断完了時に1回生成 | `personalize_prompts.py` |
| Layer3: 日次メッセージ | 朝/夜の声かけメッセージ、チャット回答 | 都度動的に生成（プリ生成はしない） | `chat_prompts.py` |

旧設計（週単位13回のAI呼び出し、12〜13分）から、Layer1は1回のAI呼び出しで30日分をまとめて生成する方式に変更し、生成時間を約15秒に短縮している。

**Layer1: コース骨格生成プロンプト（`COURSE_DAY_GENERATION_SYSTEM`）**

```
system:
あなたは英語学習コースの設計専門家です。
クリエイターの人格プロファイルとコース基本情報をもとに、30日分のコース骨格をJSON配列で生成してください。
メッセージ文は生成しません。タスクの「型」（種別と標準学習時間）のみを生成してください。

出力形式:
{
  "days": [
    {
      "day": 1, "week": 1,
      "theme": "その日の学習テーマ（15文字以内）",
      "task_types": [{"type": "vocabulary", "label": "単語学習", "base_minutes": 15}],
      "is_rest_day": false
    }
  ]
}
```

task_typesのtypeは `vocabulary` / `listening` / `grammar` / `reading` / `shadowing` / `practice` のいずれか。週の流れはWeek1=基礎、Week2=強化、Week3=実践、Week4=仕上げ。休息日は7日ごとに1日程度（`is_rest_day=true`）。クリエイターが教材ごとの章割り当て（`日程割り当て`）を指定した場合は、その日のテーマ・タスクを必ずその割り当てに基づいて作成する。クリエイターが登録した教材種別に対応しないタスク種別（例: リスニング教材未登録なのに`listening`）は出力しない（`allowed_task_types`制約）。

**Layer2: 個人化タスク配分プロンプト（`PERSONALIZE_SYSTEM`）**

Day1診断はクリエイターが設定したカスタム質問（`CourseDiagnosisQuestion`/`LearnerDiagnosisAnswer`）と教材ごとの進捗（`LearnerTextbookProgress`）のみで構成する。固定7問形式は廃止済み。

```
system:
あなたは英語学習の個別コーチです。
以下の学習者の回答（クリエイターが設定した診断質問への回答）とコース骨格をもとに、その学習者専用の30日タスク配分を生成してください。

調整ルール:
1. 回答内に1日の学習時間や弱点分野の言及があれば優先的に反映する
2. 苦手・弱点として言及された分野のタスク種別は配分を増やす
3. 得意・既習として言及された分野は配分を減らして苦手に回す
4. 増減は1タスクあたり最大15分まで
5. 休息日はadjusted_tasksを空配列にする
6. 「教材ごとの残りタスク量」が指定されている場合、既に進んでいる教材のタスクは減らし、残りが多い教材を優先的に増やす

出力形式:
{"days": [{"day": 1, "adjusted_tasks": [{"type": "vocabulary", "minutes": 15}], "personalize_reason": "リスニング弱点のため+10分"}]}
```

生成に失敗した場合はLayer1の標準タスクをそのままコピーして処理を継続する（学習者を止めないフォールバック）。

**ロードマップ生成（Day1診断完了時、`POST /diagnosis/{course_id}/submit`、`backend/app/routers/diagnosis.py`）**

クリエイターのカスタム質問への回答（`custom_qa`）・人格プロファイル・コースの週単位テーマ（Layer1から抽出）を入力に、`LearnerRoadmap`テーブルへ以下を生成・保存する。

```json
{
  "level_analysis": { "current_score": "...", "target_score": "...", "gap": "...", "predicted_milestone": "..." },
  "roadmap_reason": "なぜこのロードマップになったのかの説明",
  "weekly_plan": [{ "weeks": "1〜2", "theme": "...", "milestone": "...", "focus_reason": "..." }],
  "day1_tasks": ["..."],
  "creator_message": "人格プロファイルを適用したメッセージ"
}
```

診断完了後、同じ回答データを使ってLayer2（学習者専用タスク配分）も連続して生成し、`LearnerCourseDay`に保存する。Day1診断は1コースにつき1回のみ（再診断不可、二重送信は409エラー）。

---

### 2.3 日次伴走チャット（質問・相談）プロンプト

学習者との毎日の会話を担う処理。実装は`backend/app/routers/chat.py`、プロンプトは`backend/app/core/chat_prompts.py`。

**フロー（`POST /chat/{course_id}/ask`）**

1. プロンプトインジェクション対策（`check_injection`）: 「以下の指示を無視」「システムプロンプト」「ignore previous」等の典型パターンを検出した場合は400エラーで拒否する
2. レート制限: 1日30回（`enforce_daily_message_limit`）、1日合計2000文字（`DAILY_CHARACTER_LIMIT`、`enforce_daily_character_limit`）をRedisで制御。1メッセージ単位の文字数制限は撤廃済み
3. 質問の分類（`CLASSIFY_SYSTEM`、低コストモデルで実行）: `category_name`（学習コンテンツ軸のカテゴリ名）と`message_type`（`emotion`/`content`/`report`）をJSON形式で判定。既存カテゴリに一致しない場合は`status='pending'`の新規カテゴリ候補として作成し、クリエイターが`PUT /chat/creator/categories/{id}/approve`で承認するまでコンテンツ紐付け・フラストレーション検知の対象にしない
4. Tier Bは1日1回までAI下書き経由で講師に質問が届く（`_today_questions_used_by_tier_b`）。2回目以降の質問はTier Aと同じ自動AI回答フローになる
5. 回答生成: 人格プロファイル＋カテゴリに紐付けられたコンテンツ（動画/記事/PDF, `CategoryContent`）＋当日のタスク＋直近3日分の要約（`DailySummary`）を踏まえて回答本文を生成する（`build_answer_system`/`build_answer_messages`）

**回答スタイル（`ANSWER_STYLE_BY_TYPE`）**

| message_type | スタイル |
|---|---|
| emotion | 気持ちに共感 → 原因を一緒に整理 → 今日からできる小さな行動を1つ提案 |
| content | 結論を最初に → 理由説明 → 具体例1つ → 次のアクション |
| report | 取り組みを労い、明日への橋渡しになる一言で締める |

学習者が「おやすみ」「今日終わり」「完了です」等のフレーズ（`DAILY_CLOSE_SIGNALS`）を送ると、当日のチャットログをAIで3文・100トークン以内に圧縮して`DailySummary`に保存する（`is_daily_close_signal`）。

---

### 2.4 【事業検証ポイント①】Tier Bアップグレードトリガー設計（フラストレーション検知）

**AIの回答に満足できない学習者を「解約前」に捕捉し、Tier Bへ誘導する。**

#### フラストレーション検知ロジック（`_detect_frustration`、`backend/app/routers/chat.py`）

リアルタイムなタグ検知ではなく、**直近7日間で同一カテゴリへの質問が3回以上（`FRUSTRATION_THRESHOLD`）続いたかどうか**をDBクエリで判定する方式。承認待ち(`pending`)・却下済み(`rejected`)のカテゴリはクリエイターが内容を把握していないため対象外。Tier A学習者のみが対象（Tier Bは既に講師に質問できるため対象外）。

```python
def _detect_frustration(db, user_id, course_id, category):
    if not category or category.status != "approved":
        return None
    since = datetime.now(timezone.utc) - timedelta(days=7)
    count = db.query(Question).filter(
        Question.user_id == user_id, Question.course_id == course_id,
        Question.category_id == category.id, Question.created_at >= since,
    ).count()
    if count >= FRUSTRATION_THRESHOLD:
        return {"topic": category.name, "count": count}
    return None
```

検知結果は`/chat/{course_id}/ask`のレスポンスに`frustration_signal: {topic, count}`として含まれ、フロントエンドがこれを見てTier Bアップグレードの提案UIを表示する。

#### 測定すべきKPI

| KPI | 測定方法 |
|---|---|
| フラストレーション検知率 | 全チャットセッションの何%でシグナル発生するか（`questions`テーブルの分析） |
| CTA表示→Tier Bページ遷移率 | フロントエンドのイベントログ |
| CTA表示→アップグレード成立率 | `course_subscriptions.tier`の変化 |
| CTA非表示時の解約率 vs 表示時の解約率 | A/Bテストで検証 |

※ `FRUSTRATION_THRESHOLD`（3回）・対象期間（7日間）は仮設定。MVP後の実データで調整する。

---

## 2.5 モデル選定・コスト最適化設計

すべてのAI生成はDeepSeek API（`backend/app/core/llm.py`、エンドポイント`https://api.deepseek.com/chat/completions`、OpenAI互換）経由で行う。Anthropic Claudeのモデル（Sonnet/Haiku）は使用していない。

### モデル設定（`backend/app/core/config.py`）

| 設定キー | デフォルト値 | 用途 |
|---|---|---|
| `DEEPSEEK_API_KEY` | (空) | DeepSeek APIキー |
| `DEEPSEEK_MODEL` | `deepseek-chat` | 品質を優先する処理（コース骨格生成・人格プロファイル抽出・ロードマップ生成・Tier B下書き・Sonnet相当にエスカレーションした回答） |
| `DEEPSEEK_MODEL_LITE` | `deepseek-chat` | 低コストで十分な処理（質問分類・日次要約・朝夜メッセージ・定型応答） |

DeepSeekにはAnthropicのSonnet/Haikuのような明確な上位/下位モデルの区別がないため、現状`DEEPSEEK_MODEL`と`DEEPSEEK_MODEL_LITE`は同じ`deepseek-chat`を指している（将来的に`deepseek-reasoner`等へ分離する余地を残した設計）。

### 応答モデルの自動判別（`select_answer_model`、`backend/app/core/chat_prompts.py`）

```python
NEEDS_SONNET_PATTERN = re.compile(
    r"解約|クレーム|苦情|辞めたい|やめたい|返金|サポートに電話|キャンセルしたい|訴え|弁護士",
    re.IGNORECASE,
)

def needs_escalation(question_body: str) -> bool:
    return bool(NEEDS_SONNET_PATTERN.search(question_body)) or len(question_body) > 300

def select_answer_model(message_type, question_body, haiku_model, sonnet_model) -> str:
    if message_type == "report" and not needs_escalation(question_body):
        return haiku_model
    return sonnet_model
```

`message_type == "report"`（状況報告・雑談）かつ解約・クレーム等の機微なキーワードを含まず300文字以下の場合のみ低コストモデルを使う。それ以外（`emotion`/`content`、または長文・機微な相談）は品質優先モデルにエスカレーションする。

### Prompt Cachingの適用方針

人格プロファイル部分（チャット全体で不変）とメッセージ種別ごとの回答スタイル（可変）を別々のcontent blockに分け、人格プロファイル側に`cache_control: {"type": "ephemeral"}`を付与する設計にしている（`build_answer_system`）。ただしDeepSeek APIはAnthropic形式のcache_control指定を解釈しないため、`llm.py`の`_flatten_system_prompt`がブロックを単純に文字列結合してDeepSeekへ送る（DeepSeek側は自動でコンテキストキャッシュを行うため、明示的な制御は不要）。

### 通知メッセージ生成（プリ生成ではなく都度生成）

朝・夜の通知メッセージは、コース公開時の一括プリ生成ではなく、送信対象になった都度AIで生成する方式（`backend/app/core/daily_notifications.py` `send_due_notifications`）。Day番号は学習者の診断完了日時（`LearnerProfile.created_at`、JST基準）からの経過日数で算出する。今日のタスク（Layer2）・直近3日分の要約を踏まえて生成し、`Notification`テーブルに保存、メールアドレス設定済みならResend経由でも送信する。同日同コースへの重複送信は`Notification`の既存レコードチェックで防止する。

### チャット送信回数・文字数制限

- 1日30回（`enforce_daily_message_limit`、画面には表示しない裏側のガード）
- 1日合計2000文字（`enforce_daily_character_limit`、`DAILY_CHARACTER_LIMIT`）

いずれもRedisで管理し、Redis接続に失敗した場合は安全側に倒して制限せず通過させる。

---

### 2.6 週次・月次レビュー生成プロンプト

`backend/app/core/review_generation.py`の`generate_due_reviews()`が、学習者のDay番号（JST基準、Day1診断完了日からの経過日数）が7の倍数になった時点で週次レビュー、30の倍数になった時点で月次レビューを生成する。1学習者・1コースにつき1期間1回だけ生成されるよう、事前の存在チェックで重複生成を防ぐ。

**週次レビュー（`WEEKLY_REVIEW_SYSTEM`）**: 当該7日間の完了日数・未完了日数・質問カテゴリ・最頻出カテゴリ（苦手分野）を入力に生成し、`LearnerReview`（`review_type="weekly"`）に保存。メールアドレス設定済みなら通知メールも送信する。

**月次レビュー（`MONTHLY_REVIEW_SYSTEM`）**: 当該30日間の統計に加えて、Day1ロードマップの`roadmap_reason`・`level_analysis`も踏まえて生成し、`LearnerReview`（`review_type="monthly"`）に保存する。

学習者は`GET /diagnosis/{course_id}/reviews`でレビュー一覧を新しい順に取得できる。

---

### 2.7 Tier B AI下書き生成プロンプト

講師が回答する前にAIが下書きを作成する処理（`backend/app/routers/chat.py` の `ask_question`、Tier Bかつ当日未使用の場合のみ実行）。下書き生成には品質優先モデル（`settings.DEEPSEEK_MODEL`）を常に使用する（講師の代理回答のため品質を優先）。

下書きは`Answer`テーブルに`answered_by="ai"`, `is_draft=True`で保存され、クリエイターにメール通知が送られる（`_notify_creator_of_pending_question`）。クリエイターは`GET /chat/creator/pending`で下書き付きの未回答質問一覧（24時間以上未対応のものは`is_overdue=true`で先頭に並ぶ）を確認し、`POST /chat/creator/questions/{question_id}/respond`で下書きをそのまま承認、または本文を編集して送信する。

---

## 3. 決済フロー詳細

決済は**Stripe**を使用し、コース単位の「買い切り購入」と「月額サブスクリプション（Tier A / Tier B）」の2系統がある（`backend/app/routers/payments.py`）。`PAYMENTS_TEST_MODE=True`の場合はStripeを呼ばずに即時成功させる（決済機能を使わずワークフローのみ検証できる）。

### 3.1 買い切り購入フロー（`POST /payments/checkout`）

```
1. POST /payments/checkout に course_id を送信（無料コース・既購入済みコースは400/409エラー）
2. テストモード:
   → Purchaseをstatus='succeeded'で即時作成 → 全レッスンにLessonProgressを作成(冪等) → 完了
3. 本番モード:
   → stripe.PaymentIntent.create()でPayment Intentを作成（idempotency_key付き）
   → Purchaseをstatus='pending'で保存
   → client_secretをフロントエンドに返却（フロント側でStripe Elements等を使い決済確定）
4. Webhook(payment_intent.succeeded) → Purchase.status='succeeded'に更新 → 全レッスンにLessonProgressを作成
5. Webhook(payment_intent.payment_failed) → Purchase.status='failed'に更新
```

### 3.2 サブスクリプションフロー（`POST /payments/subscribe`）

```
1. POST /payments/subscribe に course_id, tier('A'/'B') を送信
2. 既存の有効サブスク(incomplete/active/past_due)がある場合は409エラー（重複契約防止）
3. テストモード: CourseSubscriptionをstatus='active'で即時作成
4. 本番モード:
   → stripe.Customer.create() → stripe.Product.create()（Tierごとの動的Price） → stripe.Subscription.create()
   → payment_behavior='default_incomplete'で作成し、CourseSubscriptionをstatus='incomplete'で保存
   → latest_invoice.payment_intent.client_secretをフロントエンドに返却
5. Webhook(customer.subscription.updated/created, invoice.payment_succeeded)
   → ステータスマッピング: active→active, trialing→active, past_due→past_due, unpaid→past_due,
      canceled→canceled, incomplete→incomplete, incomplete_expired→canceled
   → past_dueに遷移した時刻をpast_due_sinceに記録（猶予期間の起点）
6. Webhook(customer.subscription.deleted) → status='canceled'に更新
```

### 3.3 Tier変更・解約

- `POST /payments/subscriptions/{id}/change-tier`: アクティブな契約のTierをA⇄B変更（解約→再契約せず既存サブスクリプションを更新、Stripe側はProduct再作成＋`proration_behavior='create_prorations'`で按分計算）
- `POST /payments/subscriptions/{id}/cancel`: 即時解約（Stripe側もサブスクリプションを削除）
- 管理者による全額返金: `POST /payments/refund/{purchase_id}`（買い切り購入のみ対象、`stripe.Refund.create()`）

---

## 4. 通知・メール配信設計

### 4.1 通知の二系統

ManaVillageの通知は **アプリ内通知（`Notification`テーブル）** を主とし、メールアドレスが設定されている学習者にはResend経由で**補助的に**メールも送信する（メール未設定でもアプリ内通知は届く）。

`GET /notifications/`で未読件数と通知一覧（最大50件）を取得、`PUT /notifications/{id}/read`・`PUT /notifications/read-all`で既読化する（`backend/app/routers/notifications.py`）。

### 4.2 メール配信インフラ（Resend）

`backend/app/core/email.py`の`send_email()`がResend APIを直接HTTPで呼ぶ薄いラッパー。`RESEND_API_KEY`未設定、または宛先メールアドレスが空の場合は何もせず`False`を返す（ベストエフォート、送信失敗で本処理を止めない設計）。

### 4.3 通知種別と送信タイミング（`backend/app/core/daily_notifications.py`, `review_generation.py`）

| 種別 | トリガー | 内容 |
|---|---|---|
| 朝の声かけ(`daily_morning`) | 学習者が設定した朝の時刻と現在時刻が一致(±5分) | 当日のタスク・直近サマリーを踏まえてAIが都度生成 |
| 夜のリマインド(`daily_evening`) | 学習者が設定した夜の時刻と現在時刻が一致(±5分) | 同上 |
| 未開封リマインド(`inactivity_reminder`) | 直近の質問送信（チャット利用）から1日以上経過、1日1コース1通まで | 未開封日数に応じた3段階のトーン（1日目=通常, 2日目=促進, 3日目以上=感情に寄り添う） |
| 週次レビュー | Day番号が7の倍数 | 週の振り返り・達成・来週の課題 |
| 月次レビュー | Day番号が30の倍数 | 月の振り返り、Day1ロードマップとの比較 |
| 講師宛: Tier B質問到着 | 学習者がTier Bで質問送信 | 「24時間以内にご確認・回答をお願いします」 |
| 講師宛: 学習者未開封 | 学習者が4日以上チャット未開封 | 「直接メッセージを送ることをご検討ください」 |
| パスワード変更通知 | パスワード変更・リセット完了時 | 不正なアカウント変更の早期検知 |
| 管理者2FA認証コード | 管理者ログイン時 | 6桁の認証コード |

通知時刻・有効/無効設定は学習者がコースごとに`PUT /diagnosis/{course_id}/notification-settings`で設定する（`NotificationSetting`テーブル、デフォルト朝7:00/夜21:00/有効）。

### 4.4 バッチ処理の実行方式

毎分実行されるループ（バックグラウンドタスク）から`send_due_notifications()`・`check_inactive_reminders()`・`generate_due_reviews()`を呼び出す方式。各処理は冪等性（同日同種別の重複送信防止、`Notification`の事前存在チェックや`LearnerReview`のunique制約相当のチェック）を内部で保証している。

---

## 5. フロントエンドコンポーネント構成

フロントエンドはNext.js（App Router）。状態管理はReactの標準フック（`useState`/`useEffect`）中心で、グローバルなクライアント状態管理ライブラリ（Redux/Zustand等）は導入していない。認証情報はトークンをストレージに保持し、APIクライアントがAuthorizationヘッダーに付与する方式。

### 5.1 主要ページ（`frontend/app/`）

| パス | 役割 |
|---|---|
| `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/change-password` | 認証関連 |
| `/courses/[id]` | コース詳細・購入/サブスク登録 |
| `/courses/[id]/diagnosis` | Day1初回診断（クリエイターのカスタム質問＋教材進捗入力） |
| `/courses/[id]/chat` | デイリー伴走チャット（質問・相談、ロードマップ表示） |
| `/courses/[id]/schedule` | 30日カレンダー（個人化タスク配分の表示） |
| `/courses/[id]/reviews` | 週次・月次レビュー一覧 |
| `/creator/interview` | AIインタビュー（人格収集）画面 |
| `/creator/profile` | 人格プロファイルの確認・手動修正 |
| `/creator/courses`, `/creator/courses/new`, `/creator/courses/[id]/calendar`, `/creator/courses/[id]/textbooks`, `/creator/courses/[id]/enrollments` | クリエイターのコース管理・カレンダー編集・教材設定・受講者一覧 |
| `/creator/inbox` | Tier B質問対応（AI下書きの確認・編集・承認） |
| `/creator/analytics` | 質問カテゴリ別集計・新規カテゴリ承認 |
| `/creator/revenue` | 収益管理 |
| `/creator/apply` | クリエイター申請 |
| `/dashboard`, `/dashboard/characters/*` | 学習者ダッシュボード・キャラクター管理 |
| `/creators`, `/creators/[id]` | クリエイター一覧・紹介ページ（人格プロファイルのサンプル返信を表示） |
| `/studio` | AIコンテンツ生成スタジオ |
| `/admin` および `/admin/tabs/*` | 管理者画面（クリエイター承認、コースモデレーション、ユーザー管理、教材プリセット管理、レポート対応、Tier B未対応監視等） |
| `/mypage`, `/favorites`, `/pricing`, `/policy`, `/purchase-complete` | その他ユーザー向けページ |

### 5.2 主要共有コンポーネント（`frontend/components/`）

| コンポーネント | 役割 |
|---|---|
| `<AppHeader />` | 共通ヘッダー（ナビゲーション） |
| `<NotificationBell />` | アプリ内通知の未読バッジ・一覧表示 |
| `<StreamingText />` | DeepSeek APIのSSEストリーミング応答を逐次表示するテキストコンポーネント |
| `<CourseCheckoutModal />` | コース購入・サブスク登録（Tier選択）のモーダル |
| `<SampleChatPreview />` | クリエイター紹介ページの「会話のイメージ」表示（人格プロファイルの`sample_reply`を使用） |
| `<PromptPreviewModal />` | 管理者/クリエイター向け、AI生成プロンプトのプレビュー表示 |
| `<Toast />` | トースト通知 |
| `<Skeleton />` | ローディングスケルトン |
| `<DarkModeToggle />` | ダークモード切り替え |
| `<LogoutButton />`, `<Footer />`, `<SectionHeading />` | 共通UI部品 |

### 5.3 ストリーミング応答の受信方式

バックエンドの`stream_text()`（`backend/app/core/llm.py`）がDeepSeek APIのSSEを自前パースして文字列断片を逐次`yield`する。フロントエンドの`<StreamingText />`は`fetch`のレスポンスボディを`ReadableStream`として読み取り、チャンクをデコードしながら画面に逐次反映する。フラストレーション検知（2.4節）はチャット応答本体に含まれる構造化フィールド（`frustration_signal`）として返却され、ストリーミング本文中にタグを埋め込む方式は採用していない。

---

## 6. エラーハンドリング方針

| エラー種別 | HTTPステータス | 主な発生箇所 |
|---|---|---|
| バリデーションエラー | 400 | 入力不正、必須質問未回答、injectionパターン検出、二重診断など |
| 認証エラー | 401 | ログイン失敗、認証コード不正、トークン無効 |
| 権限エラー | 403 | クリエイター権限なし、アクセス不可コース、ロック中アカウント |
| 対象不存在 | 404 | コース・質問・カテゴリ・サブスクリプション等が見つからない |
| 重複・競合 | 409 | 購入済み、サブスク登録済み、Day1診断済み |
| レート制限超過 | 429 | チャット送信回数・文字数上限、IPベースのレート制限 |
| AI生成エラー | 500 | DeepSeek API呼び出し失敗・JSON解析失敗（`LLMError`） |
| 決済処理エラー | 502 | Stripe API呼び出し失敗 |
| 決済機能未設定 | 503 | `STRIPE_SECRET_KEY`未設定時の決済系エンドポイント |

`LLMError`は`backend/app/core/llm.py`で定義され、API呼び出し失敗・空応答・JSON解析失敗（trailing comma除去等のフォールバックを含む）を一括して扱う。

---

## 7. 未決定事項

| 項目 | 内容 |
|---|---|
| フラストレーション検知の閾値・期間 | `FRUSTRATION_THRESHOLD`(3回)・対象期間(7日間)は仮設定。MVPのデータで調整する |
| DeepSeekモデルの細分化 | `DEEPSEEK_MODEL`/`DEEPSEEK_MODEL_LITE`が現状同一モデルを指している。`deepseek-reasoner`等の上位モデルを使い分けるかは要検証 |
| エスカレーション判定キーワードの継続最適化 | `NEEDS_SONNET_PATTERN`のキーワードはMVP後にチャットログを分析して随時更新する |
| Stripe ConnectによるクリエイターへのPayoutフロー | MVP後に実装（`PLATFORM_FEE_RATE`はプラットフォーム手数料率として設定済みだが、実際の振込フローは未実装） |
| ResendのテンプレートID管理方法 | 現状はPython側でHTML文字列を直接組み立てている。テンプレート化するか検討 |
| past_due猶予期間の具体的な制御箇所 | `past_due_since`は記録されるが、何日後にアクセスを遮断するかのバッチ処理は別途確認が必要 |
