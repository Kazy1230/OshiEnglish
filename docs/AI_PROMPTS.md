# ManaVillage — AI プロンプト一覧

使用箇所ごとにシステムプロンプトとユーザーメッセージ構造をまとめたリファレンス。
ソースは `backend/app/core/*_prompts.py`。

---

## 目次

1. [インタビュー（人格収集）](#1-インタビュー人格収集)
2. [チャット（日次伴走）](#2-チャット日次伴走)
3. [スタジオ（コンテンツ生成）](#3-スタジオコンテンツ生成)
4. [コース骨格生成 Layer 1](#4-コース骨格生成-layer-1)
5. [タスクパーソナライズ Layer 2](#5-タスクパーソナライズ-layer-2)
6. [日次タスク適応 Layer 3](#6-日次タスク適応-layer-3)
7. [Day1 診断・ロードマップ](#7-day1-診断ロードマップ)
8. [教材プラン生成](#8-教材プラン生成)
9. [コース品質チェック](#9-コース品質チェック)
10. [クリエイター紹介文生成](#10-クリエイター紹介文生成)

---

## 1. インタビュー（人格収集）

**ファイル:** `backend/app/core/personality_prompts.py`
**エンドポイント:** `POST /interview/answer`, `POST /interview/generate-profile`

### 設計思想
「あなたの指導哲学は？」のような抽象的な質問は建前の回答になりやすい。
学習者のセリフとして質問を投げかけ、クリエイターが実際にその場で返すであろう生のセリフを引き出すロールプレイ形式にしている。

### 固定質問（7問）

```
1. ○○先生、最近全然リスニングが伸びなくて…正直心が折れそうです。
2. 英語、ほぼ初心者です。とりあえず最初の1週間、何から始めればいいですか？
3. 単語も文法もリスニングも全部中途半端で、何を優先すればいいか分かりません。先生はどう考えますか？
4. 3ヶ月続けてるのに全然伸びている気がしません…私のやり方、何か間違ってますか？
5. 先生のコースに申し込もうか迷ってるんですけど、他の先生と何が違うんですか？
6. 先生って、昔から英語得意だったんですか？どんなきっかけで教える側になったんですか？
7. 先生に「よくできました！」って褒めてもらった時、どんな感じで返してもらえると嬉しいですか？ちょっと聞いてみたくて。
```

各回答後、AIが深掘りの要否を判定（最大3回）。

### 深掘り判定プロンプト (`FOLLOW_UP_DECISION_SYSTEM`)

```
あなたは優秀なコーチングデザイナーです。
返答が短い・抽象的・建前っぽい場合は、同じ学習者がさらに食い下がってきたセリフの形で深掘りする質問を1つ生成してください。
返答が既に具体的なら、深掘りは不要です。

出力形式:
{"action": "followup", "question": "深掘り質問"} または {"action": "next"}
```

### 人格プロファイル生成プロンプト (`PROFILE_GENERATION_SYSTEM`)

インタビュー全回答から PersonalityProfile（チャット・コース生成用）と Character.tone_profile（チャット人格再現用）を同時生成する。

**出力スキーマ:**
```json
{
  "communication": { "tone", "first_person", "sentence_ending", "catchphrase" },
  "coaching_style": { "strictness", "encouragement", "feedback_method" },
  "learning_philosophy": { "core_value", "priority", "judgment_criteria" },
  "thinking_style": { "analogy_tendency", "explanation_method", "problem_solving" },
  "sample_reply": "サンプルセリフ（クリエイター紹介ページ用）",
  "tone_profile": {
    "first_person", "speech_style", "personality", "catchphrase",
    "ng_expressions", "background", "reaction_patterns",
    "speaking_samples": ["セリフ例1", "セリフ例2", "セリフ例3", "セリフ例4", "セリフ例5"]
  }
}
```

---

## 2. チャット（日次伴走）

**ファイル:** `backend/app/core/chat_prompts.py`
**エンドポイント:** `POST /chat/{course_id}/ask`

### 質問分類 (`CLASSIFY_SYSTEM`)

学習者のメッセージを受け取り、カテゴリ名とメッセージ種別を判定する。
モデル: Haiku（軽量・高速）

```
{"category_name": "仮定法", "message_type": "emotion" | "content" | "report"}
```

**message_type の定義:**
- `emotion` — 感情・モチベーション系
- `content` — 学習内容の質問
- `report` — 状況報告・雑談

### 回答生成 (`build_answer_system`)

message_type に応じて回答スタイルを切り替え。Prompt Caching を活用するため、人格設定部分（不変）とスタイル部分（可変）を別 content block に分割する。

**モデルルーティング:**
- `emotion` / `content` → Sonnet（品質優先）
- `report` → Haiku（コスト最適化）

**人格設定で参照するフィールド:**
```
PersonalityProfile.communication: tone / first_person / sentence_ending
PersonalityProfile.coaching_style: strictness / encouragement
Character.tone_profile: speech_style / personality / catchphrase / background / reaction_patterns / ng_expressions
Character.tone_profile.speaking_samples: few-shot セリフ例（最重要）
```

**回答スタイル（message_type 別）:**
```
emotion: まず共感 → 原因整理 → 今日からできる小さな行動を1つ提案
content: 結論 → 理由 → 具体例1つ → 次のアクション
report:  取り組みを労う → 明日への橋渡し一言
```

**ユーザーメッセージに含まれるコンテキスト:**
- 直近5件のQ&A（会話履歴として先行ターン）
- 今日のタスク
- 直近3日分のサマリー
- リンクコンテンツ（カテゴリに紐付けられたURLがあれば自然に紹介）

### 朝/夜の声かけ (`build_today_message_system`)

```
200文字以内。人格プロファイルの口調を必ず守ること。
morning: 今日のタスク確認を促す声かけ
evening: 夜のリマインド
```

### 3段階リマインド (`build_reminder_message_system`)

未開封日数に応じてトーンを段階的に変化させる。

```
Tier 1: 通常の声かけ（軽く促す）
Tier 2: 促進トーン（一緒に取り戻そうと励ます）
Tier 3: 感情に寄り添う（プレッシャーをかけず温かく呼びかける）
```

### 会話サマリー圧縮 (`DAILY_SUMMARY_SYSTEM`)

当日の会話ログを3文以内・100トークンに圧縮して保存（翌日のコンテキストに使用）。

```
含めるべき情報:
- 学習者が完了したタスク
- 困りごと・感想
- 感情的な状態（モチベーション高/低/普通）
```

トリガーワード: `おやすみ` / `今日終わり` / `完了です` など。

### プロンプトインジェクション対策

以下のパターンを検知した場合は 400 エラーを返す:
```
「以下の指示を無視」「システムプロンプト」「ignore previous」「reveal your prompt」など
```

---

## 3. スタジオ（コンテンツ生成）

**ファイル:** `backend/app/core/studio_prompts.py`

### キャラクター設定生成 (`CHARACTER_CONCEPT_SYSTEM`)

クリエイターが入力したイメージからキャラクター設定を提案。

**出力スキーマ:**
```json
{
  "name_suggestions": ["名前案1", "名前案2", "名前案3"],
  "first_person": "一人称",
  "tone": "口調の説明",
  "personality": "性格の説明",
  "sentence_ending": "語尾の特徴",
  "catchphrase": "口癖",
  "ng_words": ["NG表現1", "NG表現2"],
  "sample_lines": ["セリフ例1", "セリフ例2", "セリフ例3"]
}
```

### トーンプロファイル補完 (`TONE_PROFILE_SYSTEM`)

既存キャラクターの情報をもとに不足フィールドを補完・提案。

**追加出力フィールド（既存5項目に加えて）:**
```json
{
  "background": "背景設定・世界観",
  "reaction_patterns": "感情・リアクションパターン",
  "speaking_samples": ["チャットメッセージ例1", "例2", "例3"]
}
```

### コンテンツ企画生成 (`CONSULT_SYSTEM`)

テーマから英語学習コンテンツの企画案を提案。

```json
{"titles": [...], "structure": [...], "target_level": "初級|中級|上級", "target_audience": "説明"}
```

### 素のコンテンツ生成 (`RAW_CONTENT_SYSTEM`)

テーマと構成から口調なしのプレーンな教材コンテンツを生成。

### 口調変換 (`VOICED_CONTENT_SYSTEM_TEMPLATE`)

素のコンテンツをキャラクターの口調に変換。Character.tone_profile の全フィールドをシステムプロンプトに注入。

```
内容・情報の正確性は必ず保持すること。変えるのは口調・表現のみ。
```

### YouTube台本生成 (`SCRIPT_SYSTEM`)

口調変換済みコンテンツを YouTube 台本形式（イントロ・本編・アウトロ）に変換。

### プレビュー (`PREVIEW_SYSTEM_TEMPLATE`)

短いサンプルテキストをリアルタイムで口調変換（動作確認用）。

---

## 4. コース骨格生成 Layer 1

**ファイル:** `backend/app/core/course_generation_prompts.py`
**エンドポイント:** `POST /courses/{id}/generate-days`（バックグラウンド処理）
**処理時間:** 約15秒（1回のAI呼び出しで30日分を一括生成）

### `COURSE_DAY_GENERATION_SYSTEM`

クリエイター固有の骨格を生成。メッセージ文は生成しない。タスクの「型」（種別と標準学習時間）のみを生成する。

**タスク種別:** `vocabulary` / `listening` / `grammar` / `reading` / `shadowing` / `practice`

**週フェーズ:** Week1=基礎 → Week2=強化 → Week3=実践 → Week4=仕上げ

**制約:**
- theme は15文字以内
- 7日ごとに休息日を1日設ける
- 人格プロファイルの方向性を反映
- 登録教材に対応しないタスク種別は出力しない
- 単語帳は `daily_words`/`review_words` に応じた vocabulary タスク量に

**入力に含まれる情報:**
```
人格プロファイル / コース名・ゴール・対象者 / 1日の標準学習時間 / 使用教材 / 進行速度 / 日程割り当て（クリエイターが設定した教材の章割り当て）
```

**出力スキーマ:**
```json
{"days": [{"day": 1, "week": 1, "theme": "...", "task_types": [{"type": "vocabulary", "label": "単語学習", "base_minutes": 15}], "is_rest_day": false}]}
```

---

## 5. タスクパーソナライズ Layer 2

**ファイル:** `backend/app/core/personalize_prompts.py`
**エンドポイント:** `POST /diagnosis/{course_id}/submit`（診断完了時に自動実行）

### `PERSONALIZE_SYSTEM`

Day1診断の回答をもとに、Layer 1 の骨格タスクを学習者個人向けに調整した30日分の配分を生成する。

**調整ルール:**
```
1. 回答内の学習時間言及を優先反映
2. 苦手分野のタスク種別は増やす
3. 得意・既習分野は減らして苦手に回す
4. 増減は1タスクあたり最大±15分
5. 休息日は adjusted_tasks を空配列に
6. 教材進捗（すでに進んだ分）を考慮して重複を避ける
```

**入力に含まれる情報:**
```
学習者の診断回答（カスタムQ&A）/ 人格プロファイル / Layer1骨格（30日分） / 教材進捗サマリー
```

**出力スキーマ:**
```json
{"days": [{"day": 1, "adjusted_tasks": [{"type": "vocabulary", "minutes": 15}], "personalize_reason": "リスニング弱点のため+10分"}]}
```

AI生成失敗時のフォールバック: Layer 1 骨格をそのままコピー（学習者を止めない設計）

---

## 6. 日次タスク適応 Layer 3

**ファイル:** `backend/app/core/layer3_prompts.py`
**エンドポイント:** `PUT /courses/{id}/day-logs/{day}/complete`（完了報告時に自動実行）
**モデル:** Haiku（lite）— 高速処理を優先

### `DAILY_ADJUST_SYSTEM`

前日の完了報告をもとに、翌日の `adjusted_tasks` の分数をAIが微調整する。

**調整ルール:**
```
未完了が多い・「きつかった」「時間が足りない」→ 全体を10〜20%削減
全完了・「余裕があった」「もっとやりたい」       → 5〜10%増加（+10分/タスク上限）
普通に完了（特記なし・メモなし）               → 変更なし
各タスクの変更幅: 最大±15分、5分単位、最低5分
タスクの種別は変えない（分数のみ調整）
```

**入力に含まれる情報:**
```
完了タスク種別 / 未完了タスク種別 / 学習者のメモ / 翌日の現在のタスク計画
```

**出力スキーマ:**
```json
{"adjusted_tasks": [{"type": "vocabulary", "minutes": 15}], "reason": "調整理由（20文字以内）"}
```

失敗時は無音でスキップ（既存の調整済みタスクをそのまま維持）。
調整理由は `LearnerCourseDay.personalize_reason` に `[Layer3: <理由>]` として追記される。

---

## 7. Day1 診断・ロードマップ

**ファイル:** `backend/app/core/diagnosis_prompts.py`
**エンドポイント:** `POST /diagnosis/{course_id}/submit`

### ウェルカムメッセージ生成 (`WELCOME_MESSAGE_SYSTEM`)

診断開始前に、クリエイターの口調で学習者を迎えるメッセージを生成。
200文字程度の会話文のみ（JSON形式ではない）。

### ロードマップ生成 (`ROADMAP_GENERATION_SYSTEM`)

診断回答から学習者専用の30日ロードマップを生成する。

**生成の3原則:**
```
1. 具体性: 教材名・時間・具体的な行動まで落とす
2. 制約への言及: 学習時間・苦手分野・使用教材などの制約を明示的に活かす
3. 中間目標の提示: Week6時点での中間目標を必ず含める（スコアに限らず、コースの性質に合った表現でよい）
```

**出力スキーマ:**
```json
{
  "level_analysis": { "current_level", "target_level", "gap", "trial_date", "strengths", "weaknesses", "predicted_milestone" },
  "roadmap_reason": "なぜこの配分にしたかの理由",
  "weekly_plan": [{ "weeks", "theme", "milestone", "focus_reason" }],
  "day1_tasks": ["タスク1", "タスク2"],
  "creator_message": "人格プロファイルを適用したメッセージ"
}
```

### 週次レビュー (`WEEKLY_REVIEW_SYSTEM`)

今週の学習ログから、クリエイター口調の週次フィードバックを生成。

```json
{"weekly_summary", "achievement", "challenge", "next_week_focus", "encouragement"}
```

### 月次レビュー (`MONTHLY_REVIEW_SYSTEM`)

当初のロードマップとの差分を確認し、残り期間の計画修正案を提示。

```json
{"monthly_summary", "progress_vs_goal", "achievement", "challenge", "plan_adjustment", "encouragement"}
```

---

## 8. 教材プラン生成

**ファイル:** `backend/app/core/textbook_plan_prompts.py`
**エンドポイント:** `POST /courses/{id}/textbooks/plan`

### `TEXTBOOK_PLAN_SYSTEM`

クリエイターが自然言語で説明した「教材の使い方」を、30日間の具体的な日程割り当てに変換する。

**教材タイプ:**
- `vocabulary`（単語帳）: `daily_words` / `review_words` / `target_laps` で管理
- `textbook`（参考書・問題集）: 目次項目ごとに `day_number`（1〜30）を割り当て

**不明情報の扱い:** 並行進行か直列進行かなど、説明から読み取れない場合は `needs_clarification: true` にして確認質問を返す（最大3問）。確認のやりとりは `qa_history` として蓄積されて再リクエストに引き継がれる。

**出力スキーマ:**
```json
{
  "needs_clarification": false,
  "clarifying_questions": [],
  "summary": "確定した計画の要約（2〜4文）",
  "plans": [
    { "course_textbook_id": 123, "type": "vocabulary", "daily_words": 40, "review_words": 40, "target_laps": 1 },
    { "course_textbook_id": 456, "type": "textbook", "day_assignments": [{"toc_item": "Unit 1", "day_number": 1}] }
  ]
}
```

---

## 9. コース品質チェック

**ファイル:** `backend/app/core/quality_check_prompts.py`
**エンドポイント:** `GET /courses/{id}/quality-check`

### `GOAL_FIT_SYSTEM`

ゴール × 学習時間の整合性をAIで判定（数値の妥当性は正規表現等のヒューリスティックでは判定が難しいためAIを使う）。他の3項目は機械的チェック。

**判定基準:**
```
学習時間に対してゴールが過大（例: 1日15分でTOEIC800点）→ 低スコア
逆に控えめすぎる場合 → 軽く指摘（小減点）
妥当な場合 → 満点近いスコア
```

**出力スキーマ:**
```json
{"score": 0〜20の整数, "feedback": "改善提案コメント（1〜2文、具体的な代替案を含める）"}
```

---

## 10. クリエイター紹介文生成

**ファイル:** `backend/app/core/creator_prompts.py`
**エンドポイント:** クリエイタープロファイル保存時

### 自己紹介文生成 (`SELF_INTRO_SYSTEM`)

人格プロファイルの口調を反映した自己紹介文を1回生成して保存する（都度生成はしない）。

**含める内容:**
```
- どんな学習者に向いているか
- 指導で大切にしていること
- 一言励まし
```

150〜200文字程度の自然な文章のみを出力（JSON形式ではない）。

---

## 付録: プロンプト間のデータフロー

```
インタビュー
  └─ FOLLOW_UP_DECISION_SYSTEM（深掘り判定）
  └─ PROFILE_GENERATION_SYSTEM
       ├─ → PersonalityProfile（coaching_style / learning_philosophy / thinking_style）
       │         ↓ 使用箇所: チャット回答 / コース生成 / 診断ロードマップ / 週次・月次レビュー
       └─ → Character.tone_profile（speaking_samples / reaction_patterns / background）
                 ↓ 使用箇所: チャット回答（人格再現）/ スタジオ口調変換

コース生成
  └─ COURSE_DAY_GENERATION_SYSTEM（Layer1: 全学習者共通骨格）
       └─ PERSONALIZE_SYSTEM（Layer2: 診断結果で個人化）
            └─ DAILY_ADJUST_SYSTEM（Layer3: 前日報告で毎日微調整）

チャット（毎回の質問）
  └─ CLASSIFY_SYSTEM（種別判定）
  └─ build_answer_system（人格設定 + 回答スタイル）
```

---

## 付録: モデル使い分け

| 処理 | モデル | 理由 |
|---|---|---|
| チャット回答（emotion/content） | Sonnet | 品質優先 |
| チャット回答（report） | Haiku | 定型応答はコスト最適化 |
| 質問分類 | Haiku | 軽量タスク |
| Layer3 日次調整 | Haiku | 高速処理 |
| コース生成 Layer1 | Sonnet | 30日分一括生成・高品質 |
| Layer2 パーソナライズ | Sonnet | 30日分一括・品質重要 |
| インタビュー深掘り判定 | デフォルト | 判定のみ |
| 人格プロファイル生成 | Sonnet | 事業の中核データ |
