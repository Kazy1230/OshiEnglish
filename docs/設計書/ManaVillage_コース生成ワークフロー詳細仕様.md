# ManaVillage コース作成フロー詳細仕様

> ステータス: v2.0（2026-07-08 更新）
> 前バージョン（v1.2: 30日カレンダー方式）から章/カード構造に全面刷新。

---

## 1. ワークフロー全体像

> 1クリエイター=1人格(キャラクター)。インタビュー完了時にキャラクターが自動作成されるため、コース作成画面に「キャラクターを選択する」操作は存在しない。

```
Step 1: AIインタビュー（人格収集）
  ↓
Step 2: 人格プロファイル生成・確認
  ↓
Step 3: コース新規作成（基本情報 + 壁打ち相談フォーム）
         → AI壁打ち用プロンプト生成 → ChatGPT/Claude 等で章立てを壁打ち
  ↓
Step 4: 章立て入力（/creator/courses/[id]/chapters）
  ↓
Step 5: カリキュラムハブ（/creator/courses/[id]/curriculum）
         各章にカード（動画/課題/クイズ/メッセージ）を追加・編集
  ↓
Step 6: プレビュー確認（/creator/courses/[id]/preview）
  ↓
Step 7: 審査申請（/creator/courses/[id]/publish）
  ↓
Step 8: 運営確認 → 公開
```

---

## 2. Step 1: AIインタビュー（人格収集）

### 設計方針

学習者のセリフ形式で質問することで、クリエイターの生の指導スタイルを引き出すロールプレイ形式。

### 固定質問（7問）

```
1. 先生、最近全然リスニングが伸びなくて…正直心が折れそうです。
2. 初心者です。とりあえず最初の1週間、何から始めればいいですか？
3. 単語も文法もリスニングも全部中途半端で、何を優先すればいいか分かりません。
4. 3ヶ月続けてるのに全然伸びている気がしません…私のやり方、何か間違ってますか？
5. 先生のコースに申し込もうか迷ってるんですけど、他の先生と何が違うんですか？
6. 先生って、昔から得意だったんですか？どんなきっかけで教える側になったんですか？
7. 先生に「よくできました！」って褒めてもらった時、どんな感じで返してもらえると嬉しいですか？
```

各回答後にAIが深掘りの要否を判定（最大3回/問）。深掘り判定は LLM が `{"action": "followup", "question": "…"}` または `{"action": "next"}` を返す。

---

## 3. Step 2: 人格プロファイル生成

`POST /interview/generate-profile` で PersonalityProfile（チャット・コース生成用）と Character.tone_profile（チャット人格再現用）を同時生成する。

```json
{
  "personality_profile": {
    "communication": { "tone": "…", "first_person": "私", "sentence_ending": "…", "catchphrase": "…" },
    "coaching_style": { "strictness": "…", "encouragement": "…", "feedback_method": "…" },
    "learning_philosophy": { "core_value": "…", "priority": ["…"], "judgment_criteria": "…" },
    "thinking_style": { "analogy_tendency": "…", "explanation_method": "…", "problem_solving": "…" }
  }
}
```

---

## 4. Step 3: コース新規作成（3ステップフォーム）

画面パス: `/creator/courses/new`

### Step 0: 基本情報

| 項目 | 内容 | 備考 |
|---|---|---|
| 分野（subject） | フリーテキスト | 例: TOEIC、マイクラ建築、料理、Python。文字数制限なし（DB: VARCHAR(100)）|
| コース名（title） | テキスト | |
| 無料フラグ（is_free） | チェックボックス | |
| Tier A月額（tier_a_price） | 数値 | 980〜1,980円 |
| Tier B月額（tier_b_price） | 数値（任意） | 2,980〜5,000円 |

### Step 1: カリキュラム壁打ち相談フォーム

| フィールド | DBカラム | 説明 |
|---|---|---|
| 講座の目的・ゴール | `curriculum_purpose` | 例: TOEIC800点を3ヶ月で達成 |
| 対象者 | `curriculum_target_audience` | 例: 現在600点前後の社会人 |
| 扱いたいトピック・要素 | `curriculum_topics` | 例: リスニング、語彙1000語 |
| 期間感の目安 | `curriculum_duration` | 例: 12週間、30日間 |
| 講師としてのスタイル・こだわり | `curriculum_style` | 例: 実践重視、毎日短く継続 |
| まだ迷っている・決めきれていない点 | `curriculum_concerns` | 例: どの範囲から始めるか |
| 持っている動画（任意） | `curriculum_existing_videos` | YouTube URL 一覧等 |

フォーム送信時に `POST /courses` と `PUT /courses/{id}/curriculum-meta` を実行。

### Step 2: AI壁打ち用プロンプト表示

`GET /courses/{id}/curriculum-prompt` で以下のテンプレートにデータを埋め込んだプロンプトを生成する。

```
あなたは学習カリキュラム設計の専門家です。
以下の情報を元に、まずはコース全体の章立て（カリキュラムの骨格）を提案してください。

【講座の目的】{purpose}
【対象者】{target_audience}
【扱いたいトピック・要素】{topics}
【期間感の目安】{duration}
【講師としてのスタイル・こだわり】{style}
【まだ迷っている・決めきれていない点】{concerns}
【持っている動画】{existing_videos}
```

クリエイターはこのプロンプトをChatGPT/Claude等にコピーして章立てを相談する。  
「次へ：章立てを入力する」ボタンで `/creator/courses/[id]/chapters` へ遷移。

---

## 5. Step 4: 章立て入力

画面パス: `/creator/courses/[id]/chapters`

AIとの壁打ちで決まった章立てをテキスト入力する。

- 章タイトル（必須）
- この章のゴール（任意）
- ↑↓ ボタンで順序変更
- 「+ 章を追加」ボタンで章追加
- 保存時は既存章を全削除して再作成（全置換方式）

保存後は `/creator/courses/[id]/curriculum` へ遷移。

---

## 6. Step 5: カリキュラムハブ + カード追加

画面パス: `/creator/courses/[id]/curriculum`（ハブ）  
カード編集: `/creator/courses/[id]/chapters/[chapterId]`

### カード種別

| 種別値 | 表示名 | アイコン | 用途 |
|---|---|---|---|
| `video` | 動画 | ▶ | YouTube動画視聴 |
| `build_task` | 課題 | 🔨 | 作品作成・実践課題 |
| `quiz` | クイズ | ❓ | 選択式クイズ（2〜4択、正解1つ） |
| `message` | メッセージ | 💬 | 章完了記念メッセージ等 |

`quiz` カードは `quiz_options: [{text: string, is_correct: boolean}]` のJSON配列で選択肢を保持する。

### カード操作

- 追加: カード種別ボタンをクリック → `POST /courses/{id}/chapters/{chId}/cards`
- 編集: カードを展開してインライン編集 → `PUT /courses/{id}/chapters/{chId}/cards/{cardId}`
- 削除: `DELETE /courses/{id}/chapters/{chId}/cards/{cardId}`
- 並び替え: @dnd-kit DnD → `PUT /courses/{id}/chapters/{chId}/cards/reorder`（`{ids: [...]}`）
- 複製: `POST /courses/{id}/chapters/{chId}/cards/{cardId}/duplicate`
- YouTubeメタ取得: `GET /courses/{id}/chapters/{chId}/cards/{cardId}/youtube-meta`

### 無料プレビュー設定

`is_preview=true` のカードは未購入ユーザーも閲覧可能。カード編集フォームのチェックボックスで設定。

---

## 7. Step 6: プレビュー確認

画面パス: `/creator/courses/[id]/preview`

学習者目線でコース全体を確認するための読み取り専用ページ。

- コース概要（タイトル・分野・目的・対象者・統計）
- 章のアコーディオン展開でカード一覧を確認
- 無料プレビューカードにバッジ表示

---

## 8. Step 7: 審査申請

画面パス: `/creator/courses/[id]/publish`

### 申請前チェックリスト

| 項目 | 判定ロジック |
|---|---|
| 章が1つ以上ある | `chapters.length > 0` |
| カードが1つ以上ある | `totalCards > 0` |
| コースタイトルが設定されている | `title` が空でない |
| 分野が設定されている | `subject` が空でない |

全チェック通過後に「審査に申請する」ボタンが有効化される。

`POST /courses/{id}/submit-for-review` で `status` が `draft` → `under_review` に遷移。

申請後はコース編集不可（審査中状態）。

---

## 9. Step 8: 運営確認 → 公開

- 管理画面（`/admin`）からコース審査タブで確認
- `PUT /admin/courses/{id}/approve` → `status: published`（マーケットプレイスに掲載）
- `PUT /admin/courses/{id}/reject` → `status: draft`（差し戻し、修正後に再申請可能）

---

## 10. データモデル

### Course（courses テーブル）

```
courses
  - id, character_id, title, description, thumbnail_url
  - subject VARCHAR(100)          # フリーテキスト分野
  - category VARCHAR(100)         # 任意サブカテゴリ
  - status                        # draft / under_review / published / unpublished
  - price, is_free
  - tier_a_price, tier_b_price
  - personality_profile_id
  - curriculum_purpose TEXT
  - curriculum_target_audience TEXT
  - curriculum_topics TEXT
  - curriculum_duration VARCHAR(100)
  - curriculum_style TEXT
  - curriculum_concerns TEXT
  - curriculum_existing_videos TEXT
  - completion_video_url          # 全カード完了時に再生
  - is_suspended, suspension_reason
  - created_at, updated_at
```

### CourseChapter（course_chapters テーブル）

```
course_chapters
  - id, course_id
  - order                         # 表示順
  - title, goal TEXT
  - assessment_criteria JSON      # 達成判定基準（任意）
  - created_at, updated_at
```

### ChapterCard（chapter_cards テーブル）

```
chapter_cards
  - id, chapter_id
  - order
  - card_type                     # video / build_task / quiz / message
  - title, body TEXT
  - youtube_url VARCHAR(500)
  - is_preview                    # 無料プレビュー公開
  - quiz_options JSON             # [{text: str, is_correct: bool}]（quiz種別のみ）
  - youtube_available, youtube_checked_at
  - created_at, updated_at
```

### CardProgress（card_progress テーブル）

```
card_progress
  - id, user_id, card_id
  - is_completed, completed_at
  - created_at
```

---

## 11. 削除された機能（v1.2 → v2.0 変更点）

以下は v1.2（30日カレンダー方式）で存在していたが v2.0 では廃止・非使用になった。

| 廃止要素 | 理由 |
|---|---|
| `course_days` テーブル（Layer1 30日骨格生成） | 章/カード方式に変更 |
| `learner_course_days`（Layer2 個人化） | 廃止 |
| `POST /courses/{id}/generate-days`（AI骨格生成） | 廃止 |
| カレンダーUI（`/creator/courses/[id]/calendar`） | 廃止 |
| `goal / target_learner / intensity / study_materials / pace` カラム | 廃止（curriculum_* に置換） |
| 30日コース Layer1/2/3 3層生成アーキテクチャ | 廃止（章/カード手動作成に置換） |
| 教材設定（`/creator/courses/[id]/textbooks`） | 画面は残存するが主フローから外れた |
| 品質チェック（`GET /courses/{id}/quality-check`）| 廃止 |

> ※ `course_days`・`learner_course_days` テーブルはDBに残存するが、v2.0では使用されない。
