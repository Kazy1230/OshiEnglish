# ManaVillage Day1 初回診断フロー詳細仕様

> ステータス: ドラフト v1.1（2026-07-08 注記追加）
> 関連ドキュメント: ManaVillage 要件定義書 v1.1 / コース生成ワークフロー詳細仕様

> **[v2.0 対応状況メモ]** 本ドキュメントは v1.x の30日カレンダー方式を前提として書かれている。
> v2.0（chapters/cards 方式）では `course_days` / `learner_course_days` / `weekly_plan`（30日ロードマップ）は
> 廃止される予定だが、Day1 診断フロー（welcome → custom questions → textbook_progress → submit → notification設定）
> の基本構造自体は引き継ぐ設計。ロードマップ生成・Layer2個人化の部分は v2.0 用に再設計が必要（未実装）。

---

## 1. 概要

Day1は学習者がManaVillageで最初に体験するフロー。
クリエイターのAIが学習者に寄り添い、現状把握→30日計画提示→通知設定まで一気通貫で完結する。

診断の質問内容は固定ではなく、**クリエイターがコース作成時に自由に設定するカスタム質問**と、
**コースで使用する教材ごとの進捗確認**で構成される（詳細は4節）。
また、本フローはTOEICのようなスコア試験のみを前提とせず、会話力・発話量・習慣化など
様々な評価軸を持つコースに対応する汎用的な設計になっている。

**所要時間目安**: 5〜10分

---

## 2. フロー全体像

実際のフロントエンド画面（`frontend/app/courses/[id]/diagnosis/page.tsx`）のphase遷移は以下の通り。
カスタム質問・教材進捗質問のいずれもコースに設定されていない場合は、該当フェーズをスキップして
直接ロードマップ生成に進む。

```
Phase 1: ウェルカムメッセージ (welcome)
  ↓
Phase 2: カスタム診断チャット (questions) ※コースに質問が設定されている場合のみ
  ↓
Phase 3: 教材進捗確認 (textbook_progress) ※コースに教材が設定されている場合のみ
  ↓
Phase 4: AIによる分析・30日ロードマップ生成 (generating)
  ↓
Phase 5: 30日計画の提示 (result / detail)
  ↓
Phase 6: 通知時刻の設定 (notif)
  ↓
Phase 7: 本日のタスク提示 (today)
  ↓
Day1 完了 (done)
```

---

## 3. Phase 1: ウェルカムメッセージ

AIがクリエイターの人格で学習者に挨拶する。

エンドポイント: `POST /diagnosis/{course_id}/welcome`（`backend/app/routers/diagnosis.py`）。
クリエイターの人格プロファイル（`PersonalityProfile`）を`diagnosis_prompts.WELCOME_MESSAGE_SYSTEM`に適用し、
LLMがメッセージ本文のみ（JSON形式ではない）を生成して返す。

**表示内容**
- クリエイターのアバター画像
- ウェルカムメッセージ(人格プロファイルを適用してAIが生成)

**メッセージ例(継続重視・優しめのクリエイターの場合)**
```
はじめまして！今日からあなたの英語学習を一緒に進めていきましょう。

まず、今のあなたの状況を教えてもらえますか？
いくつか質問するので、気軽に答えてくださいね。
```

---

## 4. Phase 2: カスタム診断質問 + 教材進捗確認

固定質問セットは廃止されている。`GET /diagnosis/{course_id}/questions`が返す内容は以下の2種類のみ。

- `custom_questions`: クリエイターがコース作成時に`CourseDiagnosisQuestion`として設定した質問一覧
  (`question_text` / `answer_type` / `options` / `is_required`)
- `textbook_questions`: コースに紐づく教材(`CourseTextbook`)ごとの進捗確認項目
  (`course_textbook_id` / `name` / `target_laps`)

いずれも0件の場合があり、その場合は対応するフェーズ自体を表示せず次に進む
（`startQuestions()` / `nextQuestion()` のフォールバック処理）。

### 4.1 カスタム質問(questions フェーズ)

クリエイターが`answer_type`ごとに以下の回答形式を設定できる。

| answer_type | 回答形式 |
|---|---|
| text | テキスト入力(自由記述) |
| number | 数値入力 |
| single | 単一選択(ボタン形式・`options`配列から1つ選択) |
| multi | 複数選択(ボタン形式・`options`配列から複数選択可) |

- `is_required = true`の質問は回答必須。未回答のままでは次へ進めない
  (`CustomQuestionCard`の`canProceed()`)
- `is_required = false`の質問には「スキップ」ボタンを表示
- 質問は`order`昇順でチャット形式に1問ずつ提示される
- 回答送信時(`submit_diagnosis`)、必須質問に未回答がある場合は`400`エラーで弾かれる

クリエイターは管理画面(`frontend/app/creator/courses/[id]/calendar/page.tsx`)から、
あらかじめ用意された質問テンプレート(例:「TOEFL ITP推奨質問セット」「汎用推奨質問セット」)を
一括適用することも、個別にカスタム質問を追加することもできる。
テンプレートはあくまで作成時の補助であり、特定の試験形式を必須前提とするものではない。

### 4.2 教材進捗確認(textbook_progress フェーズ)

コースに教材(`CourseTextbook`)が設定されている場合、教材ごとに現在の進捗を確認する。

- 「未着手」「途中」「{target_laps}周済み」の3択(ボタン形式)
- 「途中」を選択した場合、追加で「何周目か」(教材の目標周回数が2以上のときのみ表示)と
  「その周の進捗(0〜100%)」を入力する
- 回答は`learner_textbook_progress`テーブルに保存され、進捗率は
  `(周回数-1)*100 + 当該周のパーセント`という「1周=100%」単位の累計値として記録される

---

## 5. Phase 3: AIによる分析・30日ロードマップ生成

エンドポイント: `POST /diagnosis/{course_id}/submit`(`submit_diagnosis`)。

### ローディング表示

診断回答送信後、AIが分析中であることを示すアニメーションを表示する(`generating`フェーズ)。

```
表示メッセージ例:
「あなたの状況を分析しています…」
「あなた専用の学習プランを作成中です…」
「20〜25秒ほどお待ちください…」
```

### AIへの入力

`diagnosis_prompts.ROADMAP_GENERATION_SYSTEM` / `build_roadmap_generation_messages`に
以下を渡してAIが30日ロードマップを生成する。

- クリエイターが設定したカスタム質問への回答(`custom_qa`: 「Q: ... → A: ...」形式の文章リスト。
  質問が1件も設定されていない場合は「回答データはありません」という旨を渡し、
  人格プロファイルとコース構造から一般的なプランを生成させる)
- クリエイターの人格プロファイル
- 既存のコース構造（v1.x: 週単位テーマ `course_days` から取得 / v2.0: chapters/cards 対応は未実装）

教材の進捗状況(`learner_textbook_progress`)は、この後段で行われる学習者ごとのタスク個人化
(Layer2、`_generate_learner_course_days`)の入力として別途使用される。

### 評価軸に関する重要な原則

`ROADMAP_GENERATION_SYSTEM`には以下が明示されている。

> このコースの目標・評価軸は、点数化された試験（TOEIC等）に限らない（会話力・発話量・習慣化など様々な形がある）。
> 学習者の回答やコースのゴールから、そのコースに合った現在地・目標の表現方法を自分で判断して使うこと。
> スコアの言及が無いコースに対して、勝手にTOEIC等の試験スコアを想定して出力してはならない。

つまりレベル分析は**TOEICスコアを前提としない**。`current_level` / `target_level`という
汎用的なフィールドに、コースの性質に応じた表現（例: 「TOEIC580点」「日常会話で詰まらず話せるレベル」
「単語帳1周目」など）を自由に格納する設計になっている。

### 生成内容

クリエイターが設定した30日コース構造をベースに、`weekly_plan`の`focus_reason`(強調ポイント)を
学習者の回答に応じてパーソナライズする。

※ 30日のカリキュラム(週数・テーマ構成)自体は大きく変更しない。
  学習者ごとに変わるのは「強調ポイント」「週次アドバイスの優先順位」「声かけの内容」が中心。

### 生成結果のJSONスキーマ

```json
{
  "level_analysis": {
    "current_level": "現在地の説明（このコースの評価軸に合った表現）",
    "target_level": "目標の説明（同上の評価軸で）",
    "gap": "現在地と目標の差を一言で（例: +220点 / あと3段階 / 残り2周）",
    "trial_date": "約30日後",
    "strengths": ["得意・既習の分野"],
    "weaknesses": ["苦手・未着手の分野"],
    "predicted_milestone": "Week6時点での中間目標の見込み（このコースの評価軸で）"
  },
  "roadmap_reason": "なぜこの配分にしたかの理由",
  "weekly_plan": [
    { "weeks": "1〜2", "theme": "...", "milestone": "...", "focus_reason": "..." }
  ],
  "day1_tasks": ["診断チャットへの回答(完了済み)", "..."],
  "creator_message": "人格プロファイルを適用したメッセージ"
}
```

`level_analysis`は`learner_roadmaps.level_analysis`、その他も対応するカラムに
そのまま保存される(`_serialize_roadmap`)。

このAPIは学習者が既にDay1診断を完了している場合は`409`エラーを返し、再診断はできない
(`learner_profiles`はuser×courseで一意)。

---

## 6. Phase 4: 30日計画の提示

### 表示構成（result フェーズ）

#### ① レベル分析サマリー

`roadmap.level_analysis`の各キー・値をそのまま整形して表示する(現行UIは固定レイアウトではなく、
オブジェクトのキー・値を順に列挙する簡易表示)。

```
【あなたの現在地分析】

current_level: ○○○
target_level: ○○○
gap: ○○○
trial_date: 約30日後
strengths: ○○・○○
weaknesses: ○○・○○
predicted_milestone: ○○○
```

※ スコア前提の固定フォーマットではなく、コースの評価軸に応じた値がそのまま入る。

#### ② ロードマップの根拠(サマリー直下に表示)

`roadmap.roadmap_reason`をそのまま表示する。

```
【このプランの理由】
（AIが学習者の回答・コース構造をもとに生成した1〜数行の説明文）
```

#### ③ クリエイターからのメッセージ

`roadmap.creator_message`を人格プロファイル適用済みのメッセージとして表示する。

#### ④ アクションボタン

```
[この計画で始める] ← メインCTA。通知設定フェーズ(notif)へ進む
[計画の詳細を見る] ← 30日ロードマップの詳細(detail)フェーズへ進む
```

### 「計画の詳細を見る」押下時の表示（detail フェーズ）

```
【30日ロードマップ（週単位）】
(roadmap.weekly_plan を週ごとに theme / milestone / focus_reason で表示)

【今日のタスク（Day1）】
(roadmap.day1_tasks を箇条書きで表示)

[この計画で始める]
```

---

## 7. Phase 5: 通知時刻の設定

エンドポイント: `GET / PUT /diagnosis/{course_id}/notification-settings`。

### 設定項目

| 通知種別 | 内容 | デフォルト |
|---|---|---|
| 朝の声かけ | AIからの励ましメッセージ+今日のタスク通知 | 7:00 |
| 夜のリマインド | 学習報告の促し | 21:00 |

### UI

- 時刻は`<input type="time">`で選択
- デフォルト時刻を表示する際に、その理由を一言添えて納得感を高める

```
朝 7:00(通勤・通学の時間帯に合わせたデフォルトです)
夜 21:00(就寝前の振り返りに合わせたデフォルトです)
```

- 「後で設定する」でスキップ可能
- スキップした場合もデフォルト時刻(7:00/21:00・`is_enabled: true`)が保存される

### 設定完了メッセージ(today フェーズ)

```
設定完了！
毎日 {morningTime} に声かけします。学習報告は {eveningTime} にリマインドするね。

いつでもマイページから変更できるよ。
```

---

## 8. Phase 6: 本日のタスク提示

Day1のタスクを`roadmap.day1_tasks`の箇条書きとして提示する(today フェーズ)。

### 表示内容

```
【今日のタスク】
(roadmap.day1_tasks を箇条書きで表示)

[完了！]
```

### タスク完了の報告

「完了！」ボタン押下で`POST /diagnosis/{course_id}/day-logs/1/complete`相当の
Day1完了APIが呼ばれ(`completeDayLog`)、完了後にdoneフェーズへ遷移する。

```
お疲れ様！初日をやり切ったね。
この調子で続けましょう。明日も一緒に頑張ろう！
```

---

## 9. Day1完了後の状態

| 項目 | 状態 |
|---|---|
| learner_profiles | 診断完了レコードが作成されている（user×courseで一意） |
| learner_diagnosis_answers | カスタム質問への回答が保存されている |
| learner_textbook_progress | 教材ごとの進捗が保存されている |
| learner_roadmaps | パーソナライズされた30日計画が保存されている |
| learner_course_days | Layer2個人化済みの30日タスク配分が保存されている |
| notification_settings | 通知時刻が設定されている |
| day_logs(Day1) | 完了フラグがONになっている |
| 翌日からのPush通知 | スケジュール済み |

---

## 10. データモデル

実装は`backend/app/models/`配下の各モデルを参照。固定質問(Q1〜Q7)を前提とした列は
廃止済みのため使用しない点に注意。

```
course_diagnosis_questions   (CourseDiagnosisQuestion)
  - id
  - course_id
  - question_text
  - answer_type        (text / number / single / multi)
  - options             (JSON: single/multiの選択肢配列)
  - is_required
  - order
  - created_at

learner_diagnosis_answers   (LearnerDiagnosisAnswer)
  - id
  - learner_profile_id
  - question_id         (course_diagnosis_questions.id)
  - answer
  - created_at
  ※ (learner_profile_id, question_id) で一意

learner_profiles   (LearnerProfile)
  - id
  - user_id
  - course_id
  ※ (user_id, course_id) で一意。Day1診断完了の事実とタイムスタンプのみを保持する。
    質問本体・回答はCourseDiagnosisQuestion/LearnerDiagnosisAnswerで管理する。
  - current_score / target_score / exam_date / daily_study_time / weak_areas /
    study_history / materials は固定7問時代の名残列であり、現行の診断フローでは使用しない
  - created_at

learner_textbook_progress   (LearnerTextbookProgress)
  - id
  - learner_profile_id
  - course_textbook_id
  - current_progress    (「1周=100%」単位の累計値)
  - note
  ※ Day1診断時の入力に加え、その後の進捗報告でも更新される

learner_roadmaps   (LearnerRoadmap)
  - id
  - learner_profile_id
  - level_analysis      (JSON: current_level/target_level/gap/strengths/weaknesses等)
  - roadmap_reason       (TEXT: このプランにした理由)
  - weekly_plan          (JSON: 週ごとのtheme/milestone/focus_reason)
  - day1_tasks           (JSON: Day1のタスク配列)
  - creator_message
  - created_at

learner_course_days   (LearnerCourseDay)
  - id
  - learner_profile_id
  - day_number          (1〜30)
  - adjusted_tasks       (JSON: 個人化済みタスク配列)
  - personalize_reason
  - carryover_tasks      (JSON: 前日未完了タスクの繰越)
  ※ (learner_profile_id, day_number) で一意。Day1診断完了時に一括生成される(Layer2)

notification_settings   (NotificationSetting)
  - id
  - user_id
  - course_id
  - morning_time       (例: "07:00")
  - evening_time       (例: "21:00")
  - is_enabled
  - updated_at

day_logs
  - id
  - user_id
  - course_id
  - day_number
  - is_completed
  - completed_at
  - memo               (任意: 学習メモ)
  - created_at
```

---

## 11. 未決定事項

| 項目 | 内容 |
|---|---|
| メール通知の配信インフラ | SendGrid / AWS SES / その他 |
| 学習者が途中で現在地・目標を更新した場合の計画修正 | 再診断フローの設計（現行は再診断不可・`409`エラー） |
| サブスク解約後の学習データ保持期間 | |

## 12. 将来的な拡張(Phase 2以降)

**学習開始30日目の自動再診断**

`learner_profiles`・`learner_diagnosis_answers`に構造化された診断データが保存されているため、
将来的に以下の実装が可能。

- 学習開始30日目・60日目に自動で再診断を促す通知を送信
- AIとの会話の中で自然に現在地の近況を聞き出す(例:「そういえば最近どう?」)
- 再診断結果をもとに`learner_roadmaps`を更新し、残り期間の計画を修正する

これにより伴走の質が継続的に向上し、解約率の低下にも貢献する。
