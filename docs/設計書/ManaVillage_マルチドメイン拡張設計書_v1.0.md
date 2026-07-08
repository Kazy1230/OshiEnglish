# ManaVillage 分野対応設計書

> 最終更新: 2026-07-08（フリーテキスト化対応）
> 旧バージョン（v1.1）では英語/IT/音楽/日本語の固定ENUMだったが、フリーテキスト入力に変更済み。

---

## 1. 現在の仕様：フリーテキスト分野

### 1.1 概要

コース・コンテンツの分野（subject）は固定のENUMではなく、**任意のフリーテキスト**として入力できる。

```
courses.subject VARCHAR(100)
creator_contents.subject VARCHAR(100)
interview_sessions.subject VARCHAR(100)
```

UIはすべて `<input type="text">` によるフリーテキスト入力になっており、分野選択ドロップダウンは存在しない。

### 1.2 入力例

```
TOEIC
英語
マイクラ建築
料理
Python
ヨガ
DTM作曲
ペン字
```

### 1.3 フィルタリング

学習者向けコース一覧・クリエイター一覧での分野絞り込みは、テキスト検索（部分一致）で実装している。固定のタブ切替は廃止済み。

---

## 2. バックエンドの subject 処理

### 2.1 SubjectConfig レジストリ（`backend/app/core/subject_config.py`）

既知の4分野（english/it/music/japanese）については特化設定（インタビュー質問・プロンプトテンプレート等）を `SUBJECT_REGISTRY` に持つ。

未知の分野（フリーテキスト）については `_make_generic_config(subject)` がフォールバックとして汎用設定を動的生成する。

```python
SUBJECT_REGISTRY = {
    "english": SubjectConfig(...),  # 英語特化設定
    "it":      SubjectConfig(...),  # IT/プログラミング特化設定
    "music":   SubjectConfig(...),  # 音楽特化設定
    "japanese":SubjectConfig(...),  # 日本語学習特化設定
}

def get_subject_config(subject: str) -> SubjectConfig:
    return SUBJECT_REGISTRY.get(subject) or _make_generic_config(subject or "スキル学習")
```

`_make_generic_config(subject)` は渡されたテキストを使い、汎用的なインタビュー質問・プロンプト・診断質問を自動生成する。

### 2.2 各関数の挙動

| 関数 | 既知分野 | 未知分野 |
|---|---|---|
| `get_subject_config(subject)` | 特化SubjectConfigを返す | `_make_generic_config(subject)` を返す |
| `get_subject_label(subject)` | 日本語ラベルを返す（例: "英語"） | subject テキストをそのまま返す |
| `get_category_options(subject)` | 分野別カテゴリ選択肢リストを返す | `[]`（空）を返す |

### 2.3 studio_prompts.py の分野対応

コンテンツ生成スタジオでは既知分野のみ分野専門家ラベルを持つ。未知分野ではテキストをそのまま使用する。

```python
_SUBJECT_EXPERT_LABELS = {
    "english": "英語学習",
    "it": "IT・プログラミング学習",
    "music": "音楽学習",
    "japanese": "日本語学習",
}
```

---

## 3. UI の分野入力

### 3.1 各画面での実装

| 画面 | 実装方式 |
|---|---|
| `/creator/courses/new` | `<input type="text" placeholder="例: TOEIC、マイクラ建築、料理、Python">` |
| `/creator/contents` | `<input type="text" placeholder="例: マイクラ建築...">` |
| `/studio` | テキスト入力（フォームステップ内に統合） |
| `/creators`（一覧フィルタ） | テキスト検索入力（部分一致）|
| コンテンツフィルタ | 登録済みコンテンツの分野から動的にリスト表示、選択または検索 |

### 3.2 削除されたUI要素

以下は旧バージョンで存在したが、フリーテキスト化に伴い廃止された。

- 分野選択ドロップダウン（`SUBJECT_OPTIONS` 定数）
- 分野タブ切替（英語/IT/音楽/日本語）
- `SUBJECT_COLOR` / `SUBJECT_LABEL` マッピング（ContentEmbed.tsx）
- `/subjects` GET エンドポイント（フロントから削除済み）

---

## 4. ContentEmbed コンポーネントの分野表示

旧バージョンでは分野ごとに異なる色・ラベルを表示していたが、フリーテキスト化後は統一スタイルでテキストをそのまま表示する。

```typescript
// 旧: SUBJECT_COLOR map で色分け
// 新: 汎用スタイルで subject テキストをそのまま表示
const DEFAULT_SUBJECT_STYLE = { bg: "#f3f4f6", text: "#6b7280" }
```

---

## 5. DBスキーマ

```sql
-- courses.subject: VARCHAR(100), NULL許容, デフォルト ''
ALTER TABLE courses MODIFY subject VARCHAR(100) NULL DEFAULT '';

-- creator_contents.subject: VARCHAR(100), NULL許容
ALTER TABLE creator_contents MODIFY subject VARCHAR(100) NULL DEFAULT '';

-- interview_sessions.subject: VARCHAR(100), NULL許容
ALTER TABLE interview_sessions MODIFY subject VARCHAR(100) NULL;
```

---

## 6. 将来の拡張

SUBJECT_REGISTRY パターンは維持されているため、特化体験が必要な分野が増えた場合は `SubjectConfig` を追加してレジストリに登録するだけでよい。既存の汎用フォールバックに影響しない。

```python
SUBJECT_REGISTRY["cooking"] = SubjectConfig(
    key="cooking",
    label="料理",
    # ... 料理特化の設定
)
```
