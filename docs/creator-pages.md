# ManaVillage クリエイター関連ページ仕様

## 概要

クリエイター関連ページは大きく5カテゴリに分類される。

| カテゴリ | パス | 概要 |
|---|---|---|
| クリエイター申請・設定 | `/creator/` | 申請・インタビュー・プロファイル管理 |
| コース管理 | `/creator/courses/` | コース作成・カリキュラム編集 |
| スタジオ | `/studio/` | AIコンテンツ生成 |
| ダッシュボード | `/dashboard/` | ホーム画面・キャラクター編集 |
| 公開ページ | `/creators/` | 学習者向けクリエイター一覧・詳細 |

---

## 1. クリエイター申請 `/creator/apply`

**役割**: 新規クリエイター登録申請

### レイアウト
- **未ログイン**: センタードカード（ロゴ + フォーム）
- **ログイン済み**: AppHeader + センタードカード

### 機能
- メール/パスワード登録（未ログイン時）
- 専門分野入力（テキスト）
- 指導実績入力（テキスト）
- SNS URL入力（YouTube / Instagram / X）
- 申請送信 → 審査待ち案内

### API
- `POST /creators/apply`
- `POST /creators/apply-public`

---

## 2. AIインタビュー `/creator/interview`

**役割**: AIとのQ&Aで人格プロファイル（TONE_PROFILE）を作成する。クリエイター機能の入口。

### レイアウト
```
AppHeader
─ ヒーローセクション（グラデーション背景 + タイトル）
─ Step 0: 性別選択（男性/女性/中性的） × 指導スタイル選択（共感型/指導型/激励型/厳格型）
─ Step 1: チャット形式Q&A（固定7問 + 深掘り最大3問/問）
  ・プログレスバー（現在問/全問）
  ・AIからの質問表示
  ・テキストエリア + 送信ボタン
─ Step 2: プロファイル生成（ローディング → 完了 → /creator/profile へ）
```

### 機能
- subjectに応じた質問セット（english/it/music/japanese/generic）
- 深掘り質問自動判定（LLM）
- 完了後 PersonalityProfile 自動生成・保存
- キャラクター自動作成（存在しない場合）

### API
- `GET /interview/profile`（再開チェック）
- `POST /interview/start`（開始・再開、body: `{base_type, gender, subject}`）
- `POST /interview/answer`（回答送信）
- `POST /interview/generate-profile`（プロファイル生成）

---

## 3. 人格プロファイル `/creator/profile`

**役割**: AIインタビューで生成されたプロファイルの確認・手動編集・自己紹介文生成

### レイアウト
```
AppHeader
─ 4カテゴリ編集カード（各カテゴリ内にフィールド）
  ├ コミュニケーション（口調/一人称/語尾/口癖）
  ├ 指導スタイル（厳しさ/励まし方/フィードバック）
  ├ 学習哲学（コア価値/優先順位/判断基準）
  └ 思考特性（例え話/説明方法/問題解決）
─ 自己紹介文セクション
  ・現在の自己紹介文表示
  ・「AI生成する」ボタン
```

### 機能
- プロファイル全項目インライン編集
- 保存（PUT /interview/profile）
- AI自己紹介文生成（POST /creators/me/generate-intro）
  - インタビューセッションの subject を自動参照
- 未生成時はインタビューへ誘導

### API
- `GET /interview/profile`
- `PUT /interview/profile`
- `POST /creators/me/generate-intro`
- `GET /creators/me`

---

## 4. ダッシュボード `/dashboard`

**役割**: クリエイター向けホーム画面。全機能へのナビゲーションと状態サマリー。

### レイアウト
```
AppHeader（オーバーデュー件数バッジ）
─ ヒーローバナー
  ├ アバター画像 + 名前 + 人格タイプ + ステータスバッジ
  └ 人格補完プログレス（%）
─ 機能タイルグリッド（2〜3列）
  ├ AIインタビュー（未完了なら強調）
  ├ スタジオ
  ├ コンテンツプール
  ├ 質問分析
  ├ 収益
  └ コース一覧
  ※未承認機能はロック表示
─ アラートバナー
  ├ 未対応質問件数（Tier B）
  └ 審査中コース件数
─ 学習中コースセクション（学習者としての購入コース）
```

### API
- `GET /characters/mine`
- `GET /purchases/my`
- `GET /questions/pending-overdue-count`
- `GET /creators/me`
- `GET /creators/me/courses`

---

## 5. キャラクター編集 `/dashboard/characters/[id]`

**役割**: AIキャラクター（分身）の人格・口調・アイコン画像の設定

### レイアウト
```
AppHeader（← ダッシュボードへ）
─ アイコン画像セクション
  ├ 現在画像プレビュー（角丸正方形）
  ├ アップロードボタン
  └ 削除ボタン
─ TONE_PROFILE編集セクション（8フィールド）
  ├ 一人称
  ├ 口調・話し方・語尾
  ├ 性格・特徴
  ├ 口癖・文末の癖
  ├ NG表現（複数）
  ├ 背景・経歴
  ├ 感情リアクションパターン
  └ セリフサンプル（複数）
─ AI自動生成ボタン（人格プロファイルから生成）
─ プレビューパネル
  ├ テストテキスト入力
  └ キャラクター口調変換結果表示
```

### API
- `GET /characters/{id}`
- `POST /characters/{id}/upload-image`
- `DELETE /characters/{id}/image`
- `POST /characters/{id}/generate-tone`
- `PUT /characters/{id}`
- `POST /characters/{id}/preview-voice`

---

## 6. コース一覧 `/creator/courses`

**役割**: 作成済みコース一覧。ステータス管理。

### レイアウト
```
AppHeader
─ 「新しいコースを作る」ボタン
─ コースグリッド（2列）
  └ コースカード × N
      ├ サムネイル
      ├ タイトル
      ├ ステータスバッジ（下書き/確認中/公開/非公開）
      ├ 申込者数
      └ リンク（カリキュラム編集 / 申込者一覧）
```

### API
- `GET /creators/me/courses`

---

## 7. 新規コース作成 `/creator/courses/new`

**役割**: コース新規作成フォーム

### レイアウト
```
AppHeader
─ Step 1: 分野選択（英語/IT/音楽/日本語）
─ Step 2: 基本情報フォーム
  ├ コース名
  ├ 説明文
  ├ 価格設定（買い切り or Tier A/B月額）
  └ 無料オプション
─ 「作成する」ボタン → カリキュラム編集へ遷移
```

### API
- `GET /characters/mine`（キャラクター存在確認）
- `POST /courses`

---

## 8. カリキュラム編集 `/creator/courses/[id]/curriculum`

**役割**: コースのカリキュラム（章・カード）設計。外部AIとの壁打ち用プロンプト生成も担う。

### レイアウト
```
AppHeader（← コース一覧）
─ タブ切替
  ├ [タブ1] コース情報・プロンプト
  │   ├ 対象学習者テキストエリア
  │   ├ 扱うトピックテキストエリア
  │   ├ 講師スタイルテキストエリア
  │   ├ 「保存」ボタン
  │   ├ 「プロンプトを生成」ボタン
  │   ├ 生成プロンプト表示エリア（読み取り専用）
  │   ├ 「コピー」ボタン（クリップボード）
  │   └ 卒業動画URL入力フィールド
  └ [タブ2] 章・カード構成
      ├ 章一覧（アコーディオン）
      │   ├ 章タイトル・目標表示
      │   ├ カードリスト（card_type別アイコン）
      │   │   ├ カード種別（動画▶/課題✏/テスト📝/メッセージ💬）
      │   │   ├ タイトル・本文・YouTube URL
      │   │   └ 削除ボタン
      │   └ カード追加フォーム（種別/タイトル/本文/URL/プレビュー公開設定）
      └ 「章を追加」フォーム（タイトル・目標）
```

### カード種別
| 種別値 | 表示名 | アイコン | 用途 |
|---|---|---|---|
| `video` | 動画 | ▶ | YouTube動画視聴 |
| `assignment` | 課題 | ✏ | 作品作成・提出 |
| `test` | テスト | 📝 | 確認クイズ |
| `message` | メッセージ | 💬 | 章完了記念メッセージ等 |

### API
- `GET /courses/{id}/curriculum-meta`
- `PUT /courses/{id}/curriculum-meta`
- `GET /courses/{id}/curriculum-prompt`
- `GET /courses/{id}/chapters`
- `POST /courses/{id}/chapters`
- `PUT /courses/{id}/chapters/{chId}`
- `DELETE /courses/{id}/chapters/{chId}`
- `POST /courses/{id}/chapters/{chId}/cards`
- `PUT /courses/{id}/chapters/{chId}/cards/{cardId}`
- `DELETE /courses/{id}/chapters/{chId}/cards/{cardId}`
- `POST /courses/{id}/youtube-check`

---

## 9. 申込者一覧 `/creator/courses/[id]/enrollments`

**役割**: コース申込者のリスト表示

### レイアウト
```
AppHeader
─ 申込者リスト（テーブル形式）
  ├ 学習者名 / メール
  ├ 申込タイプ（購入 / サブスク）
  ├ Tier（A / B）
  └ ステータス（購入済み/決済待ち/契約中/延滞/解約）
```

### API
- `GET /courses/{id}/enrollments`

---

## 10. コンテンツプール `/creator/contents`

**役割**: クリエイターが投稿したSNS/YouTube等のコンテンツ管理

### レイアウト
```
AppHeader
─ URL登録フォーム（YouTube/X/note/Instagram/TikTok）
─ 分野フィルタタブ（全て/英語/IT/音楽/日本語）
─ コンテンツグリッド
  └ ContentEmbedコンポーネント × N
      ├ 埋め込みプレビュー（種別別）
      ├ タグ
      ├ 公開/非公開切替
      ├ いいね数
      └ 削除ボタン
```

### API
- `GET /contents/mine`
- `POST /contents`
- `DELETE /contents/{id}`
- `POST /contents/{id}/like`

---

## 11. 質問分析 `/creator/analytics`

**役割**: 学習者チャットの質問をAIがカテゴリ分類し、クリエイターが確認・コンテンツ紐付けを行う

### レイアウト
```
AppHeader
─ 承認待ちカテゴリセクション
  └ 新規カテゴリカード × N
      ├ カテゴリ名 + 質問数
      ├ 承認ボタン / 却下ボタン
      └ サンプル質問プレビュー
─ 既存カテゴリリスト
  └ カテゴリカード × N
      ├ カテゴリ名 + 質問数
      ├ 紐付きコンテンツ一覧
      ├ コンテンツ追加（コンテンツプールから選択）
      └ 質問リスト展開
```

### API
- `GET /analytics/question-categories`
- `GET /analytics/pending-categories`
- `POST /analytics/categories/{id}/approve`
- `POST /analytics/categories/{id}/reject`
- `GET /analytics/categories/{id}/questions`
- `POST /analytics/categories/{id}/contents`
- `DELETE /analytics/categories/{id}/contents/{contentId}`

---

## 12. 収益 `/creator/revenue`

**役割**: 売上・手数料・振込予定額のサマリー

### レイアウト
```
AppHeader
─ メトリクスカード（4枚）
  ├ 売上総額
  ├ プラットフォーム手数料（%）
  ├ 振込予定額
  └ 有効サブスク数
```

### API
- `GET /creators/me/revenue`

---

## 13. Tier B未回答質問 `/creator/inbox`

**役割**: Tier B学習者からの質問でAI下書き済み・クリエイター未承認のもの管理

### レイアウト
```
AppHeader（オーバーデュー件数バッジ）
─ アラートバナー（24時間超過件数）
─ 質問カードリスト
  └ 質問カード × N
      ├ 学習者名 + 経過時間
      ├ 質問本文
      ├ AI下書き（読み取り専用 → 編集可）
      └ 送信ボタン（下書きのまま送信 / 編集して送信）
```

### API
- `GET /questions/pending`
- `POST /questions/{id}/respond`

---

## 14. スタジオ `/studio`

**役割**: AIによるSNS/YouTube向けコンテンツ一括生成

### レイアウト
```
サイドバーナビ（3タブ）
  ├ 作成（CreatePanel）
  ├ 下書き（DraftsPanel）
  └ 戦略メモ（MarketingPanel）

[CreatePanel]
─ 分野選択
─ フォーマット選択（6種）
  ├ X（ツイート）
  ├ Threads
  ├ Instagram投稿
  ├ Instagram Reels
  ├ YouTubeショート
  └ YouTube動画
─ ネタ提案AI（6案）→ 選択
─ 切り口提案AI（3案）→ 選択
─ キャラクター選択
─ ストリーミング生成 → 結果表示
─ 「コンテンツ案に保存」ボタン

[DraftsPanel]
─ 保存済みコンテンツ一覧
─ 削除ボタン

[MarketingPanel]
─ 戦略メモテキストエリア（保存）
─ AIアドバイザーチャット
```

### API
- `GET /characters/mine`
- `POST /studio/ideas`（ネタ提案）
- `POST /studio/angles`（切り口提案）
- `POST /studio/generate/content`（ストリーミング）
- `POST /studio/drafts`
- `GET /studio/drafts`
- `DELETE /studio/drafts/{id}`
- `GET /studio/marketing-strategy`
- `PUT /studio/marketing-strategy`
- `POST /studio/marketing-strategy/chat`

---

## 15. クリエイター一覧（公開） `/creators`

**役割**: 学習者向けクリエイター検索・一覧

### レイアウト
```
AppHeader
─ 分野フィルタタブ（全て/英語/IT/音楽/日本語）
─ クリエイターカードリスト
  └ カード × N
      ├ アバター + 名前 + 人格タイプ
      ├ 総学習者数
      ├ 自己紹介文（先頭100文字）
      └ 会話サンプルプレビュー（SampleChatPreviewコンポーネント）
```

### API
- `GET /creators?subject=xxx`

---

## 16. クリエイター詳細（公開） `/creators/[id]`

**役割**: 学習者向けクリエイター詳細ページ。コース購入の起点。

### レイアウト
```
ヒーロー背景（グラデーション）
  └ アバター + 名前 + お気に入りボタン

3列レイアウト（左サイドバー + メイン + 右）
  ├ サイドバー
  │   ├ 学習者数 / コース数
  │   ├ お気に入り登録ボタン
  │   ├ 指導実績
  │   └ SNSリンク（YouTube/Instagram/X）
  └ メインコンテンツ
      ├ 自己紹介文
      ├ 教えるスタイル（coaching_tags / skill_tags）
      ├ 会話サンプル（SampleChatPreviewコンポーネント）
      └ コース一覧
          ├ おすすめコース（フィーチャー表示）
          └ その他コースグリッド
```

### API
- `GET /creators/{id}`
- `POST /favorites/{creator_id}`
- `DELETE /favorites/{creator_id}`

---

## 共通コンポーネント

| コンポーネント | 役割 |
|---|---|
| `AppHeader` | 全ページ共通ヘッダー（ロール別メニュー・戻るリンク） |
| `SampleChatPreview` | キャラクターの会話スタイルプレビュー |
| `ContentEmbed` | URL種別判定による埋め込み表示（YouTube/X/Instagram等） |
| `Skeleton` | ローディングスケルトン |
| `Toast` | 成功/エラー/情報通知 |
| `DarkModeToggle` | ダークモード切替ボタン |

---

## 未実装機能（優先実装候補）

| 機能 | 概要 | 関連ドキュメント |
|---|---|---|
| ~~レビュー機能~~ | ~~学習者によるコース評価（2軸: 講座内容 + AIコーチング）~~ | ~~ビジネスモデル再考 論点5~~ |
| ~~卒業時ネクストコース導線~~ | ~~卒業画面に同クリエイターの次コースを表示~~ | ~~ビジネスモデル再考 論点3~~ |

> ※ 2026-07-08 に両機能を実装済み。
