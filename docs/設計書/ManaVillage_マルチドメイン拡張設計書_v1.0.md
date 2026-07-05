# ManaVillage マルチドメイン拡張設計書 v1.1

> 対象バージョン: v1.2（英語特化 v1.1 からの拡張）
> 作成日: 2026-07-05 / 更新: 2026-07-05（未決事項を全確定）
> 方針: **拡張性と汎用性を考慮した特化型**（英語・IT・音楽の3分野に深く特化し、将来の分野追加を容易にする）

---

## 1. 概要・設計方針

### 1.1 目的

現在「英語学習」に特化しているプロンプト・UI・データモデルを、**分野レジストリパターン**によって英語・IT・音楽の3分野に対応させる。

「汎用プラットフォーム化」（どんな分野でも作れる）とは異なり、**各分野に深く特化した体験を維持しながら**、コード上の拡張ポイントを統一することで将来の分野追加コストを最小化する。

### 1.2 設計の核心：SubjectConfig レジストリパターン

```
SUBJECT_REGISTRY = {
  "english": SubjectConfig(...),
  "it":      SubjectConfig(...),
  "music":   SubjectConfig(...),
}
```

各プロンプトファイル・エンドポイントは `course.subject` を受け取り、`SUBJECT_REGISTRY[subject]` から分野固有の設定を引いて処理する。

新分野を追加するときは `SubjectConfig` を一つ追加してレジストリに登録するだけでよい（既存コードへの変更なし）。

### 1.3 各分野の位置づけ

| 分野 | key | ラベル | コアユーザー像 |
|------|-----|--------|--------------|
| 英語 | `english` | 英語 | TOEIC/IELTS受験者、英会話学習者 |
| IT・プログラミング | `it` | IT・プログラミング | エンジニア転職希望、副業・スキルアップ目的 |
| 音楽 | `music` | 音楽 | 楽器習得者、音楽理論学習者、DTM/作曲 |

---

## 2. データモデル変更

### 2.1 Course テーブルへの subject カラム追加

```sql
ALTER TABLE courses
  ADD COLUMN subject VARCHAR(20) NOT NULL DEFAULT 'english';
```

**変更後の Course モデル（抜粋）:**

```python
subject = Column(
    String(20),
    nullable=False,
    default="english",
    index=True,
    comment="english | it | music",
)
category = Column(String(100), nullable=True)
# category の役割が変わる：
# 旧: "TOEIC / IELTS / 英文法 など" (英語カテゴリ)
# 新: subject 内のサブカテゴリ（例: english → "TOEIC", it → "Python", music → "ピアノ"）
```

**マイグレーション:** Alembic で `add_subject_to_courses` を作成。既存レコードはすべて `english` にデフォルト設定。

### 2.2 subject × category の対応表（UI のサブカテゴリ選択肢）

| subject | category 選択肢 |
|---------|----------------|
| english | TOEIC / TOEFL / IELTS / 英検 / 英会話 / ビジネス英語 / 英文法 / 英作文 |
| it | Python / JavaScript / TypeScript / AWS / データベース / アルゴリズム / セキュリティ / Web開発 / モバイル開発 |
| music | ピアノ / ギター / DTM / 音楽理論 / ボーカル / ドラム / ベース / 作曲・編曲 |

---

## 3. バックエンドアーキテクチャ

### 3.1 新規ファイル: `backend/app/core/subject_config.py`

```python
from dataclasses import dataclass, field

@dataclass
class TaskTypeConfig:
    key: str
    label: str      # UI表示名
    icon: str       # 絵文字アイコン
    color: str      # UIカラー（HEX）

@dataclass
class SubjectConfig:
    key: str
    label: str
    task_types: list[TaskTypeConfig]

    # プロンプトテンプレート（{変数} 形式）
    course_day_generation_system: str
    classify_system: str
    answer_style_by_type: dict[str, str]
    diagnosis_welcome_system: str
    roadmap_generation_system: str
    toc_chat_system_template: str  # {textbook_name} を埋め込む


# ========== 英語 ==========
ENGLISH_CONFIG = SubjectConfig(
    key="english",
    label="英語",
    task_types=[
        TaskTypeConfig("vocabulary",  "単語",         "📚", "#6366f1"),
        TaskTypeConfig("listening",   "リスニング",   "🎧", "#0891b2"),
        TaskTypeConfig("grammar",     "文法",         "📐", "#16a34a"),
        TaskTypeConfig("reading",     "読解",         "📖", "#ca8a04"),
        TaskTypeConfig("shadowing",   "シャドーイング","🗣️", "#dc2626"),
        TaskTypeConfig("practice",    "演習",         "✏️", "#9333ea"),
    ],
    course_day_generation_system="""あなたは英語学習コースの設計専門家です。
クリエイターの人格プロファイルとコース基本情報をもとに、30日分のコース骨格をJSON配列で生成してください。
...(現行の COURSE_DAY_GENERATION_SYSTEM の内容)...
""",
    classify_system="""あなたは英語学習サービスの質問分類アシスタントです。...""",
    answer_style_by_type={
        "emotion": "学習者の気持ちに共感し、英語学習における自信回復につながる言葉をかける",
        "content": "結論を最初に伝え、英語の具体例を1つ挙げ、次にとるべき学習アクションを示す",
        "report": "学習の取り組みを労い、明日の英語学習への橋渡しになる一言で締める",
    },
    diagnosis_welcome_system="あなたは以下の人格プロファイルを持つ英語学習コーチです。...",
    roadmap_generation_system="あなたは英語学習の専門コーチです。...",
    toc_chat_system_template="""あなたは英語教材の専門家です。
クリエイターが「{textbook_name}」を30日学習カレンダーに組み込むために...（現行の parse_toc_chat のプロンプト）""",
)


# ========== IT・プログラミング ==========
IT_CONFIG = SubjectConfig(
    key="it",
    label="IT・プログラミング",
    task_types=[
        TaskTypeConfig("reading",  "技術文書読解", "📖", "#0ea5e9"),
        TaskTypeConfig("coding",   "実装・演習",   "💻", "#8b5cf6"),
        TaskTypeConfig("quiz",     "知識確認",     "❓", "#f59e0b"),
        TaskTypeConfig("project",  "制作課題",     "🏗️", "#10b981"),
        TaskTypeConfig("review",   "コードレビュー","🔍", "#ef4444"),
        TaskTypeConfig("video",    "動画・講義",   "🎬", "#6366f1"),
    ],
    course_day_generation_system="""あなたはITエンジニア育成コースの設計専門家です。
クリエイターの人格プロファイルとコース基本情報をもとに、30日分のコース骨格をJSON配列で生成してください。

必ず以下のJSON形式のみで出力してください:
{
  "days": [
    {
      "day": 1,
      "week": 1,
      "theme": "その日の学習テーマ（15文字以内）",
      "task_types": [
        {"type": "reading", "label": "技術文書読解", "base_minutes": 30}
      ],
      "is_rest_day": false
    }
  ]
}

【IT学習の設計原則】
- task_typesのtypeはreading/coding/quiz/project/review/videoから選ぶ
- Week1=環境構築・基礎インプット Week2=コア技術習得 Week3=実践・演習 Week4=総合制作・アウトプット
- coding（実装）は毎日最低1タスク含める（手を動かすことがIT習得の要）
- projectは週に1〜2回、1日の成果物が明確になるテーマを設定する
- 休息日は7日ごとに1日（is_rest_day=true）
- テーマはプログラミング言語・技術スタック名・具体的な機能名まで落とす（「Pythonのリスト内包表記を書く」など）
- 指定された教材（書籍・Udemyコース等）の章・セクションをthemeに反映する
""",
    classify_system="""あなたはITプログラミング学習サービスの質問分類アシスタントです。
学習者からの質問を読み、以下のJSONで返してください。

1. category_name: 技術軸での分類（例:「Pythonエラー」「SQLクエリ最適化」「環境構築」「モチベーション」）
2. message_type: "emotion" | "content" | "report"

{"category_name": "...", "message_type": "..."}
""",
    answer_style_by_type={
        "emotion": "エンジニアとしての成長を肯定し、詰まった箇所をデバッグする思考プロセスそのものが学習だと伝える",
        "content": "まずエラーや概念を一言で解説し、コード例を示し、次に試すべきことを1ステップで伝える",
        "report": "実装の取り組みを具体的に称え、明日のコーディングへの意欲をつなげる一言で締める",
    },
    diagnosis_welcome_system="""あなたは以下の人格プロファイルを持つITエンジニアリングコーチです。
この口調・指導スタイルを反映して、これから現状を把握するための初回ヒアリングを始めます。
学習者への最初のウェルカムメッセージを生成してください。

以下を含めること:
- 挨拶とコーチ自身の簡単な自己紹介
- IT学習の現状・目標を聞かせてほしいという案内
- 気軽に話してほしいという一言

200文字程度の自然な会話文のみを出力してください。
""",
    roadmap_generation_system="""あなたはITエンジニア育成の専門コーチです。
学習者の診断データとコース情報をもとに、その学習者専用の30日ロードマップを生成してください。

【IT学習ロードマップの原則】
- アウトプット（動くコード・成果物）を週ごとに設定する
- エラーへの対処・デバッグスキルを早期に鍛える日程を組む
- 「何が作れるようになるか」を具体的に記述（「Pythonで簡単なWebスクレイパーが完成する」等）

以下のJSON形式のみで出力:
{
  "level_analysis": {
    "current_level": "現在のITスキルレベル",
    "target_level": "30日後の到達目標",
    "gap": "現在地と目標の差",
    "trial_date": "約30日後",
    "strengths": ["得意・経験あり"],
    "weaknesses": ["未経験・苦手"],
    "predicted_milestone": "Week3時点での中間成果物の見込み"
  },
  "roadmap_reason": "この構成にした理由",
  "weekly_plan": [...]
}
""",
    toc_chat_system_template="""あなたはIT技術書・学習コンテンツの専門家です。
クリエイターが「{textbook_name}」を30日学習カレンダーに組み込むために、
教材の全章リストと「何日目に何を学習するか」の30日分割り当て計画を作成します。

## 返答形式（JSONのみ）
{{
  "ai_message": "ユーザーへの確認・説明（日本語・2〜3文以内）",
  "toc_items": ["章名・セクション名1", "章名・セクション名2", ...],
  "day_assignments": [
    {{"day": 1, "items": ["章名1", "章名2"]}},
    ...
  ]
}}

## Rules
- toc_itemsは教材の全章・セクションをリストアップ（有名な技術書はAIの知識から正確に）
- 有名教材（独習Python、Pythonクラッシュコース、AWS認定試験対策本等）はAIの知識から実際の目次を調べる
- day_assignmentsはユーザー指定のペース（1日N章等）に従い30日に均等配分
- 実装・演習系の日は "ハンズオン演習" "復習＆課題実装" 等のラベルも割り当て可
- ペース指定がなければ1日1〜2セクションを目安に配分
""",
)


# ========== 音楽 ==========
MUSIC_CONFIG = SubjectConfig(
    key="music",
    label="音楽",
    task_types=[
        TaskTypeConfig("theory",       "楽典・理論",   "🎼", "#8b5cf6"),
        TaskTypeConfig("ear_training", "聴音・音感",   "👂", "#0ea5e9"),
        TaskTypeConfig("practice",     "基礎練習",     "🎸", "#16a34a"),
        TaskTypeConfig("performance",  "曲の演奏",     "🎵", "#f59e0b"),
        TaskTypeConfig("analysis",     "楽曲分析",     "🔬", "#ef4444"),
        TaskTypeConfig("composition",  "作曲・編曲",   "✍️", "#ec4899"),
    ],
    course_day_generation_system="""あなたは音楽教育コースの設計専門家です。
クリエイターの人格プロファイルとコース基本情報をもとに、30日分のコース骨格をJSON配列で生成してください。

必ず以下のJSON形式のみで出力してください:
{
  "days": [
    {
      "day": 1,
      "week": 1,
      "theme": "その日の学習テーマ（15文字以内）",
      "task_types": [
        {"type": "practice", "label": "基礎練習", "base_minutes": 30}
      ],
      "is_rest_day": false
    }
  ]
}

【音楽学習の設計原則】
- task_typesのtypeはtheory/ear_training/practice/performance/analysis/compositionから選ぶ
- Week1=基礎・フォーム Week2=技術習得 Week3=表現・応用 Week4=仕上げ・演奏
- practiceは毎日含める（楽器の身体化には毎日の積み重ねが必須）
- theoryとear_trainingは連動させる（理論→耳で確認のセット）
- performanceは週後半に配置（その週の習得を演奏で統合）
- 休息日は7日ごとに1日（is_rest_day=true）
- テーマには具体的な曲名・スケール名・奏法を含める（「ドミナント7thコードの押さえ方」等）
""",
    classify_system="""あなたは音楽学習サービスの質問分類アシスタントです。
学習者からの質問を読み、以下のJSONで返してください。

1. category_name: 音楽軸での分類（例:「コードの押さえ方」「スケール理論」「練習時間の確保」「曲が弾けない」）
2. message_type: "emotion" | "content" | "report"

{"category_name": "...", "message_type": "..."}
""",
    answer_style_by_type={
        "emotion": "音楽の上達に必要な「反復と気づき」を伝え、詰まっている箇所を小さなステップに分解して励ます",
        "content": "奏法・理論の要点を一言で示し、練習方法・フォームのポイントを具体的に伝え、次の練習でやることを1つ提示する",
        "report": "今日の練習の積み重ねを称え、明日の演奏への期待感をつなげる一言で締める",
    },
    diagnosis_welcome_system="""あなたは以下の人格プロファイルを持つ音楽コーチです。
この口調・指導スタイルを反映して、これから現状を把握するための初回ヒアリングを始めます。
学習者への最初のウェルカムメッセージを生成してください。

以下を含めること:
- 挨拶
- 楽器・音楽歴・目標を聞かせてほしいという案内
- 一緒に成長していきたいという一言

200文字程度の自然な会話文のみを出力してください。
""",
    roadmap_generation_system="""あなたは音楽教育の専門コーチです。
学習者の診断データとコース情報をもとに、その学習者専用の30日ロードマップを生成してください。

【音楽ロードマップの原則】
- 毎日の練習メニューを具体的に（曲名・スケール・奏法まで落とす）
- 「弾けるようになる曲」「習得できる技術」を週ごとに設定する
- 上達の「気づき」が起きやすいタイミングを示す（「Week2末には○○が自然に弾けている」）

以下のJSON形式のみで出力:
{
  "level_analysis": {
    "current_level": "現在の演奏レベル",
    "target_level": "30日後の演奏目標",
    "gap": "現在地と目標の差",
    "trial_date": "約30日後",
    "strengths": ["得意・習得済み"],
    "weaknesses": ["未習得・苦手"],
    "predicted_milestone": "Week2末の演奏到達見込み"
  },
  "roadmap_reason": "この構成にした理由",
  "weekly_plan": [...]
}
""",
    toc_chat_system_template="""あなたは音楽教材・楽譜の専門家です。
クリエイターが「{textbook_name}」を30日練習カレンダーに組み込むために、
教材の全章・セクションリストと「何日目に何を練習するか」の30日分割り当て計画を作成します。

## 返答形式（JSONのみ）
{{
  "ai_message": "ユーザーへの確認・説明（日本語・2〜3文以内）",
  "toc_items": ["章名・曲名・練習項目1", "章名・曲名・練習項目2", ...],
  "day_assignments": [
    {{"day": 1, "items": ["練習項目1", "練習項目2"]}},
    ...
  ]
}}

## Rules
- toc_itemsは教材の全章・曲・練習項目をリストアップ（有名教材はAIの知識から正確に）
- 有名教材（バイエル、ハノン、メトードローズ等）はAIの知識から実際の曲・練習番号を調べる
- day_assignmentsはユーザー指定のペースに従い30日に配分
- 同じ曲・練習を複数日にまたがらせても良い（反復練習が音楽の本質）
- 練習量の目安：初心者は1日1〜2アイテム、中級以上は3〜5アイテム
""",
)


# ========== レジストリ ==========
SUBJECT_REGISTRY: dict[str, SubjectConfig] = {
    "english": ENGLISH_CONFIG,
    "it":      IT_CONFIG,
    "music":   MUSIC_CONFIG,
}

SUBJECT_CHOICES = [
    {"key": "english", "label": "英語"},
    {"key": "it",      "label": "IT・プログラミング"},
    {"key": "music",   "label": "音楽"},
]

def get_subject_config(subject: str) -> SubjectConfig:
    if subject not in SUBJECT_REGISTRY:
        raise ValueError(f"Unknown subject: {subject}. Valid: {list(SUBJECT_REGISTRY.keys())}")
    return SUBJECT_REGISTRY[subject]
```

---

## 4. 変更が必要なファイル一覧

### 4.1 バックエンド

| ファイル | 変更内容 |
|---------|---------|
| `backend/app/models/course.py` | `subject` カラム追加（String, default="english", index=True） |
| `backend/alembic/versions/xxxx_add_subject_to_courses.py` | マイグレーション新規作成 |
| `backend/app/core/subject_config.py` | **新規作成**（上記 3.1 のコード） |
| `backend/app/core/course_generation_prompts.py` | `COURSE_DAY_GENERATION_SYSTEM` を `subject_config.course_day_generation_system` に差し替え。`TASK_TYPES` 定数を削除し `subject_config.task_types` から生成 |
| `backend/app/core/chat_prompts.py` | `CLASSIFY_SYSTEM`、`ANSWER_STYLE_BY_TYPE` を `subject_config` から取得するよう変更 |
| `backend/app/core/diagnosis_prompts.py` | `WELCOME_MESSAGE_SYSTEM`、`ROADMAP_GENERATION_SYSTEM` を `subject_config` から取得 |
| `backend/app/routers/courses.py` | `parse_toc_chat` が `subject` を受け取り `subject_config.toc_chat_system_template` を使う |
| `backend/app/routers/courses.py` | コース作成エンドポイントで `subject` を受け取り保存 |

### 4.2 フロントエンド

| ファイル | 変更内容 |
|---------|---------|
| `frontend/app/creator/courses/new/page.tsx` | **分野選択UIを最初のステップに追加**（英語/IT・プログラミング/音楽のカード選択） |
| `frontend/app/creator/courses/[id]/calendar/page.tsx` | `TASK_TYPE_OPTIONS` を `course.subject` に応じてAPIから取得or静的マップで切り替え |
| `frontend/app/creator/courses/[id]/textbooks/page.tsx` | `parseTocChat` 呼び出し時に `subject` を送信 |
| `frontend/app/courses/[id]/page.tsx` | コース詳細に分野バッジ（英語/IT/音楽）表示 |
| `frontend/app/creators/page.tsx` | 分野フィルター追加（すべて/英語/IT/音楽） |
| `frontend/lib/api.ts` | `subject` フィールドを含む型定義・API呼び出しに更新 |

---

## 5. プロンプト変更の詳細

### 5.1 コース生成プロンプト（course_generation_prompts.py）

**変更前:**
```python
TASK_TYPES = ["vocabulary", "listening", "grammar", "reading", "shadowing", "practice"]
COURSE_DAY_GENERATION_SYSTEM = """あなたは英語学習コースの設計専門家です。..."""
```

**変更後:**
```python
def get_task_types_for_subject(subject: str) -> list[str]:
    config = get_subject_config(subject)
    return [t.key for t in config.task_types]

def get_course_day_generation_system(subject: str) -> str:
    return get_subject_config(subject).course_day_generation_system

# build_course_day_generation_messages に subject 引数を追加
def build_course_day_generation_messages(
    personality_profile: dict,
    course_title: str,
    goal: str,
    target_learner: str,
    intensity: str,
    subject: str = "english",  # ← 追加
    ...
) -> list[dict]:
    system = get_course_day_generation_system(subject)
    allowed_task_types = set(get_task_types_for_subject(subject))
    ...
```

### 5.2 チャット分類プロンプト（chat_prompts.py）

**変更後:**
```python
def get_classify_system(subject: str) -> str:
    return get_subject_config(subject).classify_system

def get_answer_style(subject: str, message_type: str) -> str:
    styles = get_subject_config(subject).answer_style_by_type
    return styles.get(message_type, styles["content"])

def build_answer_system(
    personality_profile: dict,
    message_type: str,
    subject: str = "english",
    tone_profile: dict | None = None,
) -> list[dict]:
    style = get_answer_style(subject, message_type)
    ...
```

### 5.3 TOC チャット（routers/courses.py の parse_toc_chat）

**変更後:**
```python
class TocChatRequest(BaseModel):
    textbook_name: str
    message: str
    history: list[dict] = []
    subject: str = "english"  # ← 追加

@router.post("/courses/{course_id}/parse-toc-chat")
async def parse_toc_chat(data: TocChatRequest, ...):
    config = get_subject_config(data.subject)
    SYSTEM = config.toc_chat_system_template.format(
        textbook_name=data.textbook_name
    )
    ...
```

---

## 6. フロントエンドの分野選択 UI（コース新規作成）

コース作成の最初のステップとして分野を選ばせる。選択後に当該分野のカテゴリ選択肢が動的に変わる。

```
┌─────────────────────────────────────────────────────┐
│ どの分野のコースを作成しますか？                       │
│                                                     │
│  ┌─────────┐  ┌──────────────┐  ┌────────┐         │
│  │   英語   │  │ IT・プログラミング│  │  音楽  │      │
│  │  📚     │  │    💻        │  │  🎵   │         │
│  └─────────┘  └──────────────┘  └────────┘         │
│                                                     │
│ カテゴリ（選択した分野に応じて変わる）                  │
│  ▼ TOEIC / IELTS / 英会話 / ...                    │
└─────────────────────────────────────────────────────┘
```

---

## 7. 実装フェーズ

### Phase 1：基盤（DB + subject_config）
1. `subject_config.py` 新規作成
2. `Course` モデルに `subject` 追加
3. Alembic マイグレーション実行
4. コース作成・取得 API に `subject` を反映

### Phase 2：プロンプト差し替え（バックエンド）
5. `course_generation_prompts.py` を subject 対応に変更
6. `chat_prompts.py` を subject 対応に変更
7. `diagnosis_prompts.py` を subject 対応に変更
8. `parse_toc_chat` を subject 対応に変更
9. 各エンドポイントで `course.subject` を引数として渡す

### Phase 3：フロントエンド
10. コース作成フローに分野選択を追加
11. カレンダー画面の TASK_TYPE_OPTIONS を subject に応じて切り替え
12. textbooks の parseTocChat に subject を渡す
13. コース一覧・詳細ページに分野バッジ・フィルター追加

### Phase 4：検証・調整
14. 各分野でコースを1つずつ実際に作成してプロンプト品質を確認
15. プロンプトの微調整

---

## 8. 将来の分野追加方法（拡張手順）

例: 「資格・簿記」を追加する場合

1. `subject_config.py` に `BOKI_CONFIG = SubjectConfig(...)` を定義
2. `SUBJECT_REGISTRY["boki"] = BOKI_CONFIG` を追加
3. `SUBJECT_CHOICES` に `{"key": "boki", "label": "資格・簿記"}` を追加
4. DBマイグレーション不要（`subject` は VARCHAR 型なので値を追加するだけ）
5. フロントエンドの `SUBJECT_CHOICES` を `/api/subject-choices` から取得する設計にしておけばフロントエンド変更も不要

**→ 既存コードへの変更はゼロ。**

---

## 9. 確定事項（旧・未決事項）

| # | 事項 | **確定方針** |
|---|------|------------|
| 1 | テキストシードプリセット | **対応する**。IT・音楽の代表的教材を `textbook_seeds.py` に追加（詳細は §10） |
| 2 | 分野をまたぐクリエイターのコース管理 | **可能**。制限なし。1クリエイターが英語・IT・音楽を混在して持てる |
| 3 | subject の追加 | **管理者のみ**。`subject_config.py` への追加 + 管理者画面から有効化（v1.3以降UIを追加） |
| 4 | カテゴリ入力方式 | **選択肢のみ**（自由入力なし）。プルダウンから選ぶ。選択肢は §2.2 の対応表通り |
| 5 | subject 作成後の変更 | **ロック**（変更不可）。カレンダー・教材・task_types の不整合を防ぐ |
| 6 | キャラクター × subject | **キャラクターは subject 横断**（現行通り）。1キャラクターが複数分野を担当可 |
| 7 | task_type 一覧のフロント取得 | **フロント静的定義**（subject キーのマップ）。subject 追加時のみ追記する |
| 8 | 学習者のコース検索フィルター | **分野・カテゴリ・価格帯・クリエイター名**の4軸（詳細は §11） |
| 9 | 既存コースの subject 移行 | **全件 `english` にデフォルト設定**（マイグレーション時に自動適用） |

---

## 10. テキストシードプリセット拡張（`textbook_seeds.py`）

### 10.1 IT・プログラミング

```python
IT_PRESET_TEXTBOOKS = [
    {
        "name": "独習Python 第2版",
        "publisher": "翔泳社",
        "type": "textbook",
        "subject": "it",
        "target": "Python基礎〜中級",
        "toc": [
            {"item": "Chapter 1: Python入門・環境構築"},
            {"item": "Chapter 2: 変数・データ型・演算子"},
            {"item": "Chapter 3: 制御構造（if/for/while）"},
            {"item": "Chapter 4: 関数"},
            {"item": "Chapter 5: リスト・タプル・辞書・セット"},
            {"item": "Chapter 6: 文字列操作"},
            {"item": "Chapter 7: ファイル操作・例外処理"},
            {"item": "Chapter 8: クラスとオブジェクト指向"},
            {"item": "Chapter 9: モジュール・パッケージ"},
            {"item": "Chapter 10: 標準ライブラリ"},
            {"item": "付録: 総合演習問題"},
        ],
    },
    {
        "name": "AWS認定ソリューションアーキテクト アソシエイト教科書",
        "publisher": "翔泳社",
        "type": "textbook",
        "subject": "it",
        "target": "AWS SAA",
        "toc": [
            {"item": "Chapter 1: AWSの基礎・IAM"},
            {"item": "Chapter 2: EC2・EBS・ELB"},
            {"item": "Chapter 3: S3・CloudFront"},
            {"item": "Chapter 4: VPC・セキュリティ"},
            {"item": "Chapter 5: RDS・DynamoDB"},
            {"item": "Chapter 6: Lambda・API Gateway"},
            {"item": "Chapter 7: CloudWatch・CloudTrail"},
            {"item": "Chapter 8: 高可用性アーキテクチャ"},
            {"item": "模擬試験（65問）×2回"},
        ],
    },
    {
        "name": "改訂新版 JavaScript本格入門",
        "publisher": "技術評論社",
        "type": "textbook",
        "subject": "it",
        "target": "JavaScript基礎",
        "toc": [
            {"item": "Chapter 1: JavaScriptの概要"},
            {"item": "Chapter 2: 基本的な書き方"},
            {"item": "Chapter 3: 値・変数・演算子"},
            {"item": "Chapter 4: 制御構文"},
            {"item": "Chapter 5: 関数"},
            {"item": "Chapter 6: 配列・オブジェクト"},
            {"item": "Chapter 7: 組み込みオブジェクト"},
            {"item": "Chapter 8: DOM操作"},
            {"item": "Chapter 9: イベント"},
            {"item": "Chapter 10: 非同期処理・Promise"},
            {"item": "Chapter 11: ES2015+新機能"},
        ],
    },
]
```

### 10.2 音楽

```python
MUSIC_PRESET_TEXTBOOKS = [
    {
        "name": "バイエルピアノ教則本",
        "publisher": "全音楽譜出版社",
        "type": "textbook",
        "subject": "music",
        "target": "ピアノ初心者",
        "toc": (
            [{"item": f"No.{i}: 練習曲"} for i in range(1, 25)]
            + [{"item": f"No.{i}: 練習曲（中級）"} for i in range(25, 61)]
            + [{"item": f"No.{i}: 練習曲（上級）"} for i in range(61, 107)]
        ),
    },
    {
        "name": "ハノン ピアニストのための60の練習曲",
        "publisher": "全音楽譜出版社",
        "type": "textbook",
        "subject": "music",
        "target": "ピアノ基礎テクニック",
        "toc": (
            [{"item": f"No.{i}: 指の独立練習"} for i in range(1, 21)]
            + [{"item": f"No.{i}: スケール・アルペジオ"} for i in range(21, 41)]
            + [{"item": f"No.{i}: 高度な演奏技術"} for i in range(41, 61)]
        ),
    },
    {
        "name": "楽典―理論と実習",
        "publisher": "音楽之友社",
        "type": "textbook",
        "subject": "music",
        "target": "音楽理論全般",
        "toc": [
            {"item": "第1章: 音・音名・階名"},
            {"item": "第2章: 音符・休符・拍子"},
            {"item": "第3章: 音階（長調・短調）"},
            {"item": "第4章: 音程"},
            {"item": "第5章: 和音・コード"},
            {"item": "第6章: 転調・調性"},
            {"item": "第7章: 和声法の基礎"},
            {"item": "第8章: 対位法の基礎"},
            {"item": "第9章: 楽式論"},
            {"item": "第10章: 総合演習"},
        ],
    },
    {
        "name": "コード進行で覚える! ギター入門",
        "publisher": "リットーミュージック",
        "type": "textbook",
        "subject": "music",
        "target": "ギター初心者",
        "toc": [
            {"item": "Chapter 1: ギターの持ち方・チューニング"},
            {"item": "Chapter 2: 基本コード（C・G・Am・Em）"},
            {"item": "Chapter 3: ストロークパターン"},
            {"item": "Chapter 4: バレーコード（F・Bm）"},
            {"item": "Chapter 5: よく使うコード進行"},
            {"item": "Chapter 6: アルペジオ"},
            {"item": "Chapter 7: ペンタトニックスケール"},
            {"item": "Chapter 8: 練習曲（ポップス5曲）"},
        ],
    },
]
```

---

## 11. 学習者コース検索フィルター（確定）

フィルター軸: **分野 → カテゴリ → 価格帯 → クリエイター名テキスト検索**

```
[すべて | 英語 | IT・プログラミング | 音楽]  ← 分野タブ（上位フィルター）
  ↓ 分野を選ぶとサブカテゴリが出る
[すべて | TOEIC | IELTS | 英会話 | ...]     ← カテゴリ（スクロール可能なチップ）
  ↓
[すべて | 無料 | 有料（買い切り）| 月額サブスク]  ← 価格帯
[クリエイター名を検索...              🔍]   ← テキスト検索
```

- 分野タブは画面上部に固定表示
- カテゴリは分野選択後にのみ表示（未選択時は非表示）
- 価格帯と名前検索は常時表示
