# ManaVillage 詳細設計書 v1.1

> ステータス: ドラフト v1.1
> 関連ドキュメント: ManaVillage 基本設計書 v1.1 / 要件定義書 v1.1

---

## 1. 認証フロー詳細

### 1.1 JWT設計

| 項目 | 仕様 |
|---|---|
| アルゴリズム | HS256 |
| Accessトークン有効期限 | 30分 |
| Refreshトークン有効期限 | 30日 |
| 保存場所(フロント) | HttpOnly Cookie(XSS対策。LocalStorageには保存しない) |

**JWTペイロード**
```json
{
  "sub": "user_id",
  "role": "learner | creator | admin",
  "exp": 1234567890
}
```

### 1.2 パスワードリセットフロー

```
POST /auth/forgot-password
  → Redisにリセットトークン(UUID v4)を保存(有効期限30分)
  → リセットURL: https://manavillage.online/reset-password?token={token}
  → メールアドレスが存在しない場合も同じレスポンスを返す(メール存在の漏洩防止)

POST /auth/reset-password
  → Redisでトークン検証
  → パスワードをbcryptでハッシュ化して更新
  → 使用済みトークンをRedisから即時削除
```

---

## 2. プロンプト設計

> ここがManaVillageの最重要実装。事業の成否を分ける2点を中核に設計する。
> - **事業検証ポイント①**: Tier Bへのアップグレードトリガー設計
> - **事業検証ポイント②**: Day1の「驚き」を生む90日ロードマップ生成精度

---

### 2.1 AIインタビュー(人格収集)プロンプト

クリエイターの人格を引き出すためのインタビュープロンプト。

**固定質問プロンプト**
```
system:
あなたは優秀なコーチングデザイナーです。
英語学習コーチのクリエイターから、その人固有の指導哲学・コミュニケーションスタイル・
判断基準を引き出すインタビューを行います。

以下の質問を1問ずつ行い、回答に応じて深掘り質問を追加してください。
深掘りは回答が短い・抽象的・一般論に見える場合のみ追加します(最大3問まで)。

【固定質問】
Q1: 「英語学習者が挫折しそうになったとき、どのように声をかけますか？
      できるだけ実際に使うセリフで教えてください。」
Q2: 「TOEIC初心者に最初の1週間で何をさせますか？その理由も教えてください。」
Q3: 「単語・文法・リスニング・読解のうち、最も重視するものはどれですか？
      なぜそれを最優先にするのですか？」
Q4: 「あなたの指導を受けた学習者が成果を出せないとき、
      原因はどこにあると思いますか？」
Q5: 「あなたの指導で一番大切にしていることを一言で表すとしたら何ですか？」

回答から以下の人格プロファイルをJSON形式で抽出してください:
{
  "communication": { "tone", "first_person", "sentence_ending", "catchphrase" },
  "coaching_style": { "strictness", "encouragement", "feedback_method" },
  "learning_philosophy": { "core_value", "priority", "judgment_criteria" },
  "thinking_style": { "analogy_tendency", "explanation_method", "problem_solving" }
}
```

---

### 2.2 【事業検証ポイント②】90日ロードマップ生成プロンプト

**最重要プロンプト。Day1の「驚き」を生む精緻さと具体性がここで決まる。**

```
system:
あなたは英語学習の専門コーチです。
以下の学習者の診断データとクリエイターの人格プロファイルをもとに、
その学習者専用の90日ロードマップを生成してください。

【生成の3原則】
1. 具体性: 「リスニングを強化する」ではなく「Part 3のディクテーションを毎日10分」のように
           教材名・時間・具体的な行動まで落とす
2. 制約への言及: 学習時間・苦手分野・使用教材などの制約を計画の中で明示的に活かす
3. 予測スコアの提示: 「このペースで続ければWeek6に○○点ライン突破の見込み」という
                    中間予測を必ず含める

【出力形式】
{
  "level_analysis": {
    "current_score": "580点",
    "target_score": "800点",
    "gap": "+220点",
    "trial_date": "約90日後",
    "strengths": ["読解"],
    "weaknesses": ["リスニング", "語彙"],
    "predicted_milestone": "Week6時点で推定650点突破の見込み"
  },
  "roadmap_reason": "読解はすでに得意なため、スコア伸長余地の大きいリスニングと語彙に重点配分しています。学習時間30分/日という制約のもと、無理なく継続できる量に調整しました。",
  "weekly_plan": [
    {
      "weeks": "1〜2",
      "theme": "学習習慣の確立・現状把握",
      "milestone": "毎日30分の継続",
      "focus_reason": "まず継続を最優先。量より習慣を作る期間"
    }
    // ...Week 13まで
  ],
  "day1_tasks": [
    "診断チャットへの回答(完了済み)",
    "{使用教材名}のPart 1 Set 1を解く",
    "単語アプリで20語学習"
  ],
  "creator_message": "人格プロファイルを適用したメッセージ"
}

【診断データ】
現在スコア: {current_score}
目標スコア: {target_score}
試験予定: {exam_date}
1日の学習時間: {daily_study_time}
苦手分野: {weak_areas}
学習歴: {study_history}
使用教材: {materials}  ← Q7の回答。具体的な教材名があれば必ずタスクに組み込む

【クリエイターの人格プロファイル】
{personality_profile}

【クリエイターが設定した90日コース構造(週単位テーマ)】
{course_week_themes}
```

**チューニングポイント**

| チューニング項目 | 内容 | 測定指標 |
|---|---|---|
| 予測スコアの精度 | Week6時点の予測が外れすぎると信頼を失う。保守的な予測値にする | Day30時点の実スコアとの乖離 |
| 使用教材の反映率 | Q7で教材名を入力した学習者のDay1タスクに教材名が入っているか | Q7入力率 × タスクへの反映率 |
| ロードマップ根拠の明示 | `roadmap_reason`が汎用的すぎないか | 学習者の計画開始率 |
| 制約への言及 | 学習時間15分の学習者と2時間の学習者でタスク量が明確に違うか | タスク完了率 |

---

### 2.3 日次伴走チャットプロンプト

学習者との毎日の会話を担うプロンプト。Tier Aの中核。

```
system:
あなたは以下のクリエイターの人格を持つ英語学習コーチのAIです。
学習者との会話を通じて、学習の継続と目標達成をサポートしてください。

【クリエイターの人格プロファイル】
{personality_profile}

【学習者の情報】
名前: {learner_name}
現在スコア: {current_score} → 目標: {target_score}
今日はDay {day_number} / 90
今週のテーマ: {week_theme}
今日のタスク: {today_tasks}
苦手分野: {weak_areas}
これまでの学習ログ: {recent_day_logs}  ← 直近7日分

【会話のガイドライン】
- 学習報告には必ず具体的な労いを返す(「頑張った」ではなく何が良かったかを具体的に)
- 質問には人格プロファイルの口調・説明スタイルで答える
- モチベーション系の相談には共感→原因の整理→小さな行動提案の順で返す
- 同じトピックで3回以上質問が続いた場合は下記のフラストレーション検知フラグを立てる

【重要】フラストレーション検知:
学習者が同じトピックについて3回以上質問した、または以下のフレーズが含まれる場合、
レスポンスの末尾に JSON タグを追加する:
<frustration_signal topic="{topic}" count="{count}">

このシグナルをフロントエンドが検知してTier Bアップグレードのサジェストを表示する。
```

---

### 2.4 【事業検証ポイント①】Tier Bアップグレードトリガー設計

**AIの回答に満足できない学習者を「解約前」に捕捉し、Tier Bへ誘導する。**

#### フラストレーション検知ロジック

```python
def detect_frustration(messages: list, course_id: int, user_id: int) -> FrustrationSignal | None:
    """
    直近のチャット履歴から同一トピックの繰り返し質問を検知する
    """
    # 直近10メッセージから学習者のメッセージを抽出
    learner_messages = [m for m in messages[-10:] if m.sender == "learner"]

    # AIがタグを返していた場合はそのシグナルを使用
    ai_messages = [m for m in messages[-10:] if m.sender == "ai"]
    for msg in ai_messages:
        if "<frustration_signal" in msg.body:
            return parse_frustration_signal(msg.body)

    return None
```

#### Tier Bアップグレード表示のトリガー条件

| 条件 | 表示するCTA |
|---|---|
| 同一トピックで3回以上質問 | 「○○先生に直接聞いてみませんか?」 |
| 否定的感情フレーズの検出(「わからない」「やっぱり無理」等) | 「困ったときは先生に頼ってOKです」 |
| AIの回答後に「でも...」「それでも...」と続く | 「先生なら別の角度から教えられるかも」 |

#### フロントエンドの表示仕様

```typescript
// チャットメッセージ受信後にシグナルを検知
const checkFrustrationSignal = (aiMessage: string) => {
  const match = aiMessage.match(/<frustration_signal topic="(.+)" count="(\d+)">/);
  if (match && parseInt(match[2]) >= 3) {
    showTierBUpgradeSuggestion(match[1]); // トピック名をCTAに表示
  }
};

// Tier BアップグレードCTA
const TierBUpgradeCTA = ({ topic }: { topic: string }) => (
  <div className="upgrade-cta">
    <p>「{topic}」について、先生に直接聞いてみませんか？</p>
    <p className="sub">Tier Bなら先生が明日までに回答します。</p>
    <button onClick={() => router.push(`/courses/${courseId}/upgrade`)}>
      先生に聞く → Tier Bを見る
    </button>
    <button onClick={dismissCTA}>今はいい</button>
  </div>
);
```

#### 測定すべきKPI

| KPI | 目標値 | 測定方法 |
|---|---|---|
| フラストレーション検知率 | 全チャットセッションの○%でシグナル発生 | questions.statusの分析 |
| CTA表示→Tier Bページ遷移率 | ○% | フロントエンドのイベントログ |
| CTA表示→アップグレード成立率 | ○% | subscriptions.tierの変化 |
| CTA非表示時の解約率 vs 表示時の解約率 | CTA表示時の解約率が低いことを確認 | A/Bテストで検証 |

※ 目標値はMVP後の実データで設定する

---

## 2.5 モデル選定・コスト最適化設計

### モデル使い分け方針

| 処理 | 使用モデル | 理由 |
|---|---|---|
| 90日ロードマップ生成 | **Sonnet 4.6** | Day1の「驚き」を生む最重要プロンプト。品質最優先 |
| AIインタビュー(人格収集) | **Sonnet 4.6** | クリエイターの人格を正確に抽出する必要がある |
| 日次チャット(複雑な相談・質問) | **Sonnet 4.6** | 学習内容の質問・感情系の相談は品質が継続率に直結 |
| 週次・月次レビュー生成 | **Sonnet 4.6** | フィードバックの品質が解約率に直結 |
| Tier B AI下書き生成 | **Sonnet 4.6** | 講師の代理回答なので品質が重要 |
| 日次チャット(学習報告・定型応答) | **Haiku 4.5** | 「お疲れ様！」などの短い労いはHaikuで十分 |
| フラストレーション検知 | **Haiku 4.5** | テキスト分類タスクなのでHaikuで十分かつ安価 |
| Push通知メッセージ | **Batch API + Sonnet 4.6** | コース作成時に一括生成。リアルタイムAPI不要 |

### 応答タイプの自動判別フロー

発想を逆転させ、**デフォルトをHaiku**とし、Sonnetが本当に必要な条件に当てはまる場合のみ昇格させる。文字数・キーワードリストへの一致ではなく「Sonnetが必要な条件」で判定することで、「おしゃー」「なるほど」「すごい！」「ありがとう」などあらゆる雑談・感想・報告がHaikuで処理される。

```python
def get_model_for_chat(message: str) -> str:
    """
    デフォルトHaiku。以下の条件に該当する場合のみSonnetに昇格。
    """

    NEEDS_SONNET = [
        # 疑問文(学習内容への質問)
        lambda m: any(k in m for k in ["？", "ですか", "ますか", "のか", "かな", "教えて"]),
        # 学習内容に関するキーワード
        lambda m: any(k in m for k in [
            "文法", "意味", "使い方", "違い", "なぜ", "どうして", "どうやって",
            "わからない", "理解", "説明", "例文", "覚え方"
        ]),
        # モチベーション・感情系の相談
        lambda m: any(k in m for k in [
            "やめたい", "つらい", "無理", "不安", "自信", "続けられ",
            "モチベ", "やる気", "しんどい", "疲れた"
        ]),
    ]

    if any(check(message) for check in NEEDS_SONNET):
        return "claude-sonnet-4-6"

    # 上記に該当しないすべてのメッセージはHaiku
    # 例: 「おしゃー」「なるほど」「やった！」「ありがとう」
    #     「今日30分勉強した」「おやすみ」「明日また頑張る」
    return "claude-haiku-4-5-20251001"
```

**コスト影響**: 日常の雑談・報告・感想の大半がHaikuになるため、チャットのAPI単価が大幅に下がる。Sonnetが呼ばれるのは質問・相談・モチベーション系に絞られる。

### Prompt Cachingの適用

システムプロンプト(人格プロファイル)は全チャットで同一のため、Prompt Cachingを必ず適用する。

```python
# APIコール時にキャッシュコントロールを指定
messages_payload = {
    "model": model,
    "system": [
        {
            "type": "text",
            "text": personality_system_prompt,  # 人格プロファイル ~1,500トークン
            "cache_control": {"type": "ephemeral"}  # 5分間キャッシュ
        }
    ],
    "messages": conversation_history
}
```

**効果**: 同一セッション内の2回目以降のチャットで、システムプロンプト部分のコストが90%削減される。

### Push通知のプリ生成(コース公開時に一括処理)

朝・夜の通知メッセージを毎回AI生成すると月$0.50/ユーザーのコストがかかる。コース公開時に90日分を一括生成して`course_days`テーブルに保存することで、通知送信時のAPIコストをゼロにする。

```python
async def pre_generate_notifications(course_id: int, personality_profile: dict):
    """
    コース公開時に90日分の通知メッセージをBatch APIで一括生成
    course_days.ai_message_morning / ai_message_evening に保存
    """
    batch_requests = []

    for day_number in range(1, 91):
        day_info = get_course_day(course_id, day_number)

        # 朝の通知
        batch_requests.append({
            "custom_id": f"morning_{course_id}_{day_number}",
            "params": {
                "model": "claude-sonnet-4-6",
                "max_tokens": 200,
                "system": build_personality_prompt(personality_profile),
                "messages": [{
                    "role": "user",
                    "content": f"Day{day_number}の朝の声かけメッセージを生成してください。"
                               f"今日のテーマ: {day_info.theme}"
                               f"今日のタスク: {day_info.tasks}"
                }]
            }
        })

        # 夜のリマインド
        batch_requests.append({
            "custom_id": f"evening_{course_id}_{day_number}",
            "params": {
                "model": "claude-sonnet-4-6",
                "max_tokens": 150,
                "messages": [...]
            }
        })

    # Batch APIで一括送信(50%オフ・非同期・24時間以内に完了)
    batch_result = await anthropic.messages.batches.create(requests=batch_requests)

    # 結果をcourse_daysに保存
    await save_generated_messages(course_id, batch_result)
```

**コスト比較**:
- 変更前: $0.50/ユーザー/月(毎回AI生成)
- 変更後: コース1本あたり約$0.10の一時コスト → 以降は0円/ユーザー/月

### 1日10メッセージ制限

Tier A/Bともに、学習者1人あたり1日10メッセージを上限とする。チャットコストの青天井を防ぐ。

```python
DAILY_CHAT_LIMIT = 10
LIMIT_MESSAGE = "今日はたくさん話したね。続きは明日！今日学んだことを復習して、明日また話しかけてね。"

async def handle_chat(user_id: int, course_id: int, message: str, db: Session) -> ChatResponse:
    # 当日のメッセージ数をRedisで高速チェック
    today_key = f"chat_count:{user_id}:{course_id}:{date.today()}"
    count = await redis.incr(today_key)
    await redis.expire(today_key, 86400)  # 24時間で自動リセット

    if count > DAILY_CHAT_LIMIT:
        return ChatResponse(
            body=LIMIT_MESSAGE,
            sender="ai",
            is_limit_reached=True
        )

    # 通常のチャット処理
    model = get_model_for_chat(message)
    return await generate_chat_response(user_id, course_id, message, model)
```

**フロントエンドの表示**:
- 10件目のメッセージ送信後、制限メッセージを表示
- 入力フィールドを非活性化し「明日また話そう」の表示に切り替える
- 残りメッセージ数は表示しない(カウントダウンがプレッシャーになるため)

### 最適化後のコスト試算

| 処理 | 対策 | 月額コスト/ユーザー |
|---|---|---|
| 日次チャット(上限10件 + キャッシュ + モデル混在) | Sonnet/Haiku + Prompt Caching | ~$0.35 |
| Push通知(90日分プリ生成) | Batch API → 以降ゼロ | ~$0(初回のみ) |
| 週次・月次レビュー | Sonnet + Batch API | ~$0.03 |
| **合計(Tier A)** | | **~$0.38(約55円)** |
| Tier B追加(AI下書き) | Sonnet | +~$0.22 |
| **合計(Tier B)** | | **~$0.60(約86円)** |

980円(Tier A最低価格)に対してAPIコスト55円は約5.6%。十分な利益率を確保できる。

---

### 2.6 週次レビュー生成プロンプト

```
system:
以下の学習ログをもとに、学習者への週次フィードバックを生成してください。
クリエイターの人格プロファイルの口調で返してください。

【分析データ】
今週の学習日数: {completed_days} / 7日
完了タスク数: {completed_tasks}
未完了タスク数: {incomplete_tasks}
チャットでの質問カテゴリ: {question_categories}
最も苦手な分野(質問頻度): {top_weakness}

【出力形式】
{
  "weekly_summary": "今週の振り返り文(クリエイター口調)",
  "achievement": "良かった点を具体的に",
  "challenge": "来週の課題を1点に絞る",
  "next_week_focus": "来週のテーマと重点タスク",
  "encouragement": "クリエイター口調の励ましメッセージ"
}
```

---

### 2.7 Tier B AI下書き生成プロンプト

講師が回答する前にAIが下書きを作成するプロンプト。

```
system:
あなたは以下のクリエイターの人格を持つ英語学習コーチのAIです。
学習者からの質問に対する回答の下書きを作成してください。
講師がこの下書きを確認・編集して最終的な回答を送信します。

【クリエイターの人格プロファイル】
{personality_profile}

【学習者の情報】
{learner_context}

【質問】
{question_body}

【このカテゴリに紐付けられたコンテンツ】
{linked_contents}  ← 存在する場合は回答に含める

下書きの末尾に「※ この下書きを編集して送信してください」と添える。
```

---

## 3. 決済フロー詳細(サブスク)

```
[フロントエンド]
1. 学習者がコース詳細でティアを選択(Tier A / Tier B)
2. POST /subscriptions にcourse_idとtierを送信

[バックエンド]
3. Stripe Price IDをtierから取得(環境変数で管理)
4. 既存の有効サブスクがないか確認(重複契約防止)
5. stripe.subscriptions.create()でサブスクを作成
6. subscriptionsテーブルにstatus='active'で保存
7. Stripeのcheckout URLをフロントエンドに返却

[Webhook]
8. POST /payments/webhook でStripeからイベントを受信
9. invoice.payment_succeeded → subscriptions.statusを'active'に確認
10. invoice.payment_failed → subscriptions.statusを'past_due'に更新
    → 学習者にメール通知
11. customer.subscription.deleted → subscriptions.statusを'canceled'に更新
    → canceled_atを記録
    → チャット・コンテンツへのアクセスをcurrent_period_end以降にブロック
```

---

## 4. メール通知設計

### 4.1 メール配信インフラ

**採用: Resend**

理由:
- シンプルなAPIで実装コストが低い
- Next.js / React Emailとの親和性が高い
- 無料枠(3,000通/月)でMVP検証が可能
- 配信スケジューリングはCronジョブ側で制御する

### 4.2 メール種別と送信タイミング

| 種別 | トリガー | 内容 |
|---|---|---|
| 朝の声かけ | 学習者が設定した朝の時刻(Cronで実行) | 今日のタスク + クリエイターからのメッセージ |
| 夜のリマインド | 学習者が設定した夜の時刻かつ当日未学習報告 | 「今日の学習はできた?」+ チャットへのリンク |
| 週次レビュー | 毎週同じ曜日 | 週の振り返りサマリー |
| 決済失敗通知 | Stripe Webhook(invoice.payment_failed) | カード情報確認のお願い |
| Tier B回答通知 | 講師が回答を承認した時点 | 回答内容 + チャットへのリンク |

### 4.3 Cronジョブ設計

```python
# Redis上にスケジュールを保持
# 毎分実行のCronジョブが対象ユーザーを抽出してメール送信

def send_morning_notifications():
    current_time = datetime.now().strftime("%H:%M")
    target_settings = db.query(NotificationSetting).filter(
        NotificationSetting.morning_time == current_time,
        NotificationSetting.is_enabled == True
    ).all()

    for setting in target_settings:
        # course_daysテーブルからプリ生成済みのメッセージを取得(APIコールなし)
        day_number = get_current_day_number(setting.user_id, setting.course_id)
        course_day = db.query(CourseDay).filter_by(
            course_id=setting.course_id,
            day_number=day_number
        ).first()
        # Resend APIでメール送信(プリ生成済みメッセージをそのまま使用)
        send_morning_email(setting.user_id, course_day.ai_message_morning)
```

---

## 5. フロントエンドコンポーネント設計

### 5.1 主要コンポーネント一覧

| コンポーネント | 役割 | 使用画面 |
|---|---|---|
| `<ChatWindow />` | チャット履歴表示・メッセージ送信 | SCR-03 |
| `<StreamingMessage />` | AIレスポンスをストリーミング表示 | SCR-03 |
| `<TierBUpgradeCTA />` | フラストレーション検知時のアップグレード誘導 | SCR-03 |
| `<RoadmapCard />` | 90日ロードマップのサマリー表示 | SCR-03, Day1 |
| `<DayProgress />` | 90日中の現在位置と進捗バー | SCR-03 |
| `<TodayTasks />` | 当日のタスクリスト | SCR-03 |
| `<InterviewChat />` | AIインタビューのチャットUI | SCR-13 |
| `<CalendarEditor />` | 90日カレンダー編集 | SCR-17 |
| `<QuestionAnalytics />` | 質問カテゴリ別集計グラフ | SCR-18 |
| `<DraftAnswerPanel />` | Tier B AI下書き確認・編集 | SCR-19 |

### 5.2 StreamingMessageコンポーネント

```tsx
export const StreamingMessage = ({
  endpoint, payload, onComplete, onFrustrationSignal
}: Props) => {
  const [text, setText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const startStream = async () => {
    setIsStreaming(true);
    const response = await fetch(endpoint, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullText = "";

    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;
      const chunk = decoder.decode(value);
      fullText += chunk;
      setText(fullText);

      // フラストレーションシグナルの検知
      const frustrationMatch = fullText.match(
        /<frustration_signal topic="(.+)" count="(\d+)">/
      );
      if (frustrationMatch && parseInt(frustrationMatch[2]) >= 3) {
        onFrustrationSignal?.(frustrationMatch[1]);
      }
    }

    // シグナルタグを除いた本文を最終表示
    const cleanText = fullText.replace(/<frustration_signal[^>]*>/g, "");
    setText(cleanText);
    setIsStreaming(false);
    onComplete?.(cleanText);
  };

  return (
    <div className="message ai">
      <pre className="whitespace-pre-wrap">{text}</pre>
      {isStreaming && <span className="typing-indicator">...</span>}
    </div>
  );
};
```

---

## 6. エラーハンドリング方針

| エラー種別 | HTTPステータス | フロントエンドの対応 |
|---|---|---|
| バリデーションエラー | 400 | フォームの該当フィールド下にメッセージ表示 |
| 認証エラー | 401 | ログインページにリダイレクト |
| 権限エラー | 403 | 「アクセス権限がありません」画面を表示 |
| 重複サブスク | 409 | 「すでに購入済みです」トースト表示 |
| AI生成エラー | 500 | 「少し時間をおいてもう一度試してください」+ 再試行ボタン |
| Stripe決済エラー | 402 | 「決済に失敗しました。カード情報を確認してください」 |
| ネットワークエラー | - | 「通信エラーが発生しました。接続を確認してください」 |

---

## 7. 未決定事項

| 項目 | 内容 |
|---|---|
| Tier Bアップグレードトリガーの閾値 | フラストレーション検知の「3回」は仮設定。MVPのデータで調整 |
| 週次・月次レビューの送信曜日・時刻 | 学習者が設定するか固定にするか |
| 学習開始30日目の自動再診断フロー | Day1フロー詳細仕様 Section 12に記載 |
| Stripe ConnectによるクリエイターへのPayoutフロー | MVP後に実装 |
| ResendのテンプレートID管理方法 | 環境変数 vs DBで管理するか |
| モデル判別キーワードリストの継続最適化 | `NEEDS_SONNET`のキーワードリストはMVP後にチャットログを分析して随時更新する。「どう暗記すればいい？」「コツある？」など、キーワード未登録のまま意図せずHaikuで処理されているケースを定期的にサンプリングして追加・修正を行う |
