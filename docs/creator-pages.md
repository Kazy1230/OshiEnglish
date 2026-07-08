# ManaVillage クリエイター関連ページ仕様

> 最終更新: 2026-07-08（コース作成フロー刷新・分野フリーテキスト化対応）

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
- 分野（subject）に応じた質問セット（任意のテキスト分野に対応。既知分野は英語/IT/音楽/日本語用の特化セット、それ以外は汎用セットを自動選択）
- 深掘り質問自動判定（LLM）
- 完了後 PersonalityProfile 自動生成・保存
- キャラクター自動作成（存在しない場合）

### API
- `GET /interview/profile`（再開チェック）
- `POST /interview/start`（開始・再開、body: `{base_type, gender}`）
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

### API
- `GET /interview/profile`
- `PUT /interview/profile`
- `POST /creators/me/generate-intro`
- `GET /creators/me`

---

## 4. ダッシュボード `/dashboard`

**役割**: クリエイター向けホーム画面。全機能へのナビゲーションと状態サマリー。

### API
- `GET /characters/`
- `GET /purchases/my`
- `GET /chat/creator/pending/overdue-count`
- `GET /creators/me`

---

## 5. キャラクター編集 `/dashboard/characters/[id]`

**役割**: AIキャラクター（分身）の人格・口調・アイコン画像の設定

### API
- `GET /characters/{id}`
- `POST /characters/{id}/image`（アップロード）
- `DELETE /characters/{id}/image`
- `PATCH /characters/{id}`

---

## 6. コース一覧 `/creator/courses`

**役割**: 作成済みコース一覧。ステータス管理。

### レイアウト
```
AppHeader
─ 「新しいコースを作る」ボタン
─ コースグリッド（2列）
  └ コースカード × N
      ├ タイトル
      ├ ステータスバッジ（下書き/審査中/公開/非公開）
      ├ 章数・カード数
      └ リンク（カリキュラム編集 / 申込者一覧）
```

### API
- `GET /courses/me/created`

---

## 7. 新規コース作成 `/creator/courses/new`

**役割**: コース新規作成 + カリキュラム壁打ち用プロンプト生成（3ステップ）

### フロー
```
Step 0: 基本情報
  ├ 分野（フリーテキスト。例: TOEIC、マイクラ建築、料理）
  ├ コース名
  └ 料金設定（無料/Tier A月額/Tier B月額）

Step 1: カリキュラム壁打ち相談フォーム
  ├ 講座の目的・ゴール
  ├ 対象者
  ├ 扱いたいトピック・要素
  ├ 期間感の目安
  ├ 講師としてのスタイル・こだわり
  ├ まだ迷っている・決めきれていない点
  └ 持っている動画（YouTube URLリスト等）

Step 2: プロンプト確認
  ├ 生成されたAI壁打ち用プロンプトを表示
  ├ 「コピー」ボタン（ChatGPT / Claude 等に貼り付けて使う）
  └ 「次へ：章立てを入力する」→ /creator/courses/[id]/chapters へ遷移
```

Step 1 完了時に `POST /courses` と `PUT /courses/{id}/curriculum-meta` を同時実行。コースIDが確定してから `GET /courses/{id}/curriculum-prompt` でプロンプトを取得する。

### API
- `GET /characters/`（キャラクター存在確認）
- `GET /creators/me`（申請承認確認）
- `POST /courses`
- `PUT /courses/{id}/curriculum-meta`
- `GET /courses/{id}/curriculum-prompt`

---

## 8. 章立て入力 `/creator/courses/[id]/chapters`

**役割**: AIとの壁打ちで決まった章立てをテキスト入力する（Screen 2）

### レイアウト
```
AppHeader
─ コースタイトル表示
─ 説明文（「AIとの壁打ちで決めた章立てを入力してください」）
─ 章カードリスト（順序付き）
  └ 章カード × N
      ├ 第N章バッジ
      ├ 章タイトル（テキスト入力）
      ├ この章のゴール（任意テキスト）
      └ ↑↓ 並び替えボタン / 削除ボタン
─ 「+ 章を追加」ボタン（破線ボーダー）
─ 「保存してカリキュラムへ」ボタン → /creator/courses/[id]/curriculum へ遷移
```

保存時は既存章を全削除して再作成する（シンプルな全置換方式）。

### API
- `GET /courses/{id}` （タイトル取得）
- `GET /courses/{id}/chapters`（既存章確認）
- `DELETE /courses/{id}/chapters/{chId}`（全削除）
- `POST /courses/{id}/chapters`（全作成）

---

## 9. カリキュラムハブ `/creator/courses/[id]/curriculum`

**役割**: コースの全体像確認・章管理・審査申請の起点（Screen 3）

### レイアウト
```
AppHeader
─ コースヘッダーカード
  ├ ステータスバッジ（下書き/審査中/公開/非公開）
  ├ 分野タグ
  ├ コースタイトル
  ├ 章数・カード数サマリー
  ├ 「プレビュー」ボタン → /creator/courses/[id]/preview
  ├ 「審査申請」ボタン（draft/unpublished 時のみ）
  └ AI壁打ち用プロンプト表示トグル（▼ 展開 / コピーボタン付き）
─ 章一覧セクション
  └ 章カード × N
      ├ 第N章バッジ + タイトル + ゴール
      ├ カードチップ（▶動画 / 🔨課題 / ❓クイズ / 💬メッセージ）
      └ 「編集」ボタン → /creator/courses/[id]/chapters/[chId]
         「削除」ボタン
─ 卒業動画URLセクション（任意。全カード完了時に再生）
─ 下部ボタン群（プレビュー確認 / 審査申請）
```

### API
- `GET /courses/{id}`
- `GET /courses/{id}/chapters`
- `GET /courses/{id}/curriculum-prompt`
- `PUT /courses/{id}/curriculum-meta`（卒業動画URL保存）
- `DELETE /courses/{id}/chapters/{chId}`
- `POST /courses/{id}/submit-for-review`

---

## 10. 章詳細・カードビルダー `/creator/courses/[id]/chapters/[chapterId]`

**役割**: 章内のカードを追加・編集・並び替えする（Screen 4）

### カード種別

| 種別値 | 表示名 | アイコン | 用途 |
|---|---|---|---|
| `video` | 動画 | ▶ | YouTube動画視聴 |
| `build_task` | 課題 | 🔨 | 作品作成・実践課題 |
| `quiz` | クイズ | ❓ | 選択式クイズ（最大4択） |
| `message` | メッセージ | 💬 | 章完了記念メッセージ等 |

### レイアウト
```
AppHeader
─ ← カリキュラムへ戻るリンク
─ 章情報カード（タイトル・ゴール・カード数）
─ カード追加ボタン群（▶動画を追加 / 🔨課題を追加 / ❓クイズを追加 / 💬メッセージを追加）
─ カードリスト（@dnd-kit DnD 並び替え）
  └ カードアイテム × N
      ├ ドラッグハンドル（⠿）
      ├ 種別アイコン + タイトル + 種別ラベル
      ├ 「無料」バッジ（is_preview=true 時）
      ├ 「編集」トグル（展開するとフォームが表示）
      │   ├ 種別切替ボタン
      │   ├ タイトル入力
      │   ├ YouTubeURL入力（video種別のみ）
      │   ├ 本文テキストエリア（message/build_task種別）
      │   ├ 問題文 + 選択肢ラジオ（quiz種別。2〜4択、正解1つ）
      │   ├ 「無料プレビューとして公開する」チェック
      │   └ 「保存」ボタン
      ├ 「複製」ボタン
      └ 「削除」ボタン
```

### API
- `GET /courses/{id}/chapters`
- `POST /courses/{id}/chapters/{chId}/cards`
- `PUT /courses/{id}/chapters/{chId}/cards/{cardId}`
- `DELETE /courses/{id}/chapters/{chId}/cards/{cardId}`
- `PUT /courses/{id}/chapters/{chId}/cards/reorder`
- `POST /courses/{id}/chapters/{chId}/cards/{cardId}/duplicate`

---

## 11. コースプレビュー `/creator/courses/[id]/preview`

**役割**: 学習者目線でのコース全体確認（Screen 5）

### レイアウト
```
AppHeader
─ ← カリキュラムへ戻る / 「公開設定へ」ボタン
─ コース概要カード
  ├ 分野タグ・コースタイトル
  ├ 目的・対象者
  └ 章数・カード数・無料公開カード数・Tier A月額
─ 「カリキュラム」セクション
  └ 章アコーディオン × N
      ├ 第N章バッジ + タイトル + ゴール + カード数
      └ 展開時: カードリスト（種別アイコン・タイトル・無料バッジ）
─ 下部ボタン群（編集に戻る / 公開設定へ進む）
```

### API
- `GET /courses/{id}`
- `GET /courses/{id}/chapters`

---

## 12. 公開設定・審査申請 `/creator/courses/[id]/publish`

**役割**: 公開前チェックリスト確認と審査申請（Screen 6）

### レイアウト
```
AppHeader
─ ← プレビューへ戻る
─ コース情報サマリー（タイトル・ステータス・章数・カード数・料金）
─ 公開前チェックリスト
  ├ 章が1つ以上ある ✓/✕
  ├ カードが1つ以上ある ✓/✕
  ├ コースタイトルが設定されている ✓/✕
  └ 分野が設定されている ✓/✕
─ 審査申請についての注意事項
─ 「審査に申請する」ボタン（全チェック通過時のみ有効）
─ 申請完了後: 完了メッセージ + 「コース一覧に戻る」ボタン
```

### API
- `GET /courses/{id}`
- `GET /courses/{id}/chapters`
- `POST /courses/{id}/submit-for-review`

---

## 13. 申込者一覧 `/creator/courses/[id]/enrollments`

**役割**: コース申込者のリスト表示

### API
- `GET /courses/{id}/enrollments`

---

## 14. コンテンツプール `/creator/contents`

**役割**: クリエイターが投稿したSNS/YouTube等のコンテンツ管理

### レイアウト
```
AppHeader
─ URL登録フォーム（YouTube/X/note/Instagram/TikTok）
  ├ URL入力
  ├ 分野テキスト入力（フリーテキスト。例: マイクラ建築、TOEIC）
  └ 公開/非公開設定
─ 分野フィルタ（テキスト検索。登録済みコンテンツから分野一覧を動的抽出）
─ コンテンツグリッド
  └ ContentEmbedコンポーネント × N
      ├ 埋め込みプレビュー（種別別）
      ├ 分野テキスト表示
      ├ タグ
      ├ いいね数
      └ 削除ボタン
```

### API
- `GET /contents/my`
- `POST /contents/`
- `DELETE /contents/{id}`
- `POST /contents/{id}/like`

---

## 15. 質問分析 `/creator/analytics`

**役割**: 学習者チャットの質問をAIがカテゴリ分類し、クリエイターが確認・コンテンツ紐付けを行う

### API
- `GET /chat/creator/analytics`
- `GET /chat/creator/categories/pending`
- `PUT /chat/creator/categories/{id}/approve`
- `PUT /chat/creator/categories/{id}/reject`
- `GET /chat/creator/categories/{id}/questions`
- `POST /chat/creator/categories/{id}/contents`
- `DELETE /chat/creator/contents/{contentId}`

---

## 16. 収益 `/creator/revenue`

**役割**: 売上・手数料・振込予定額のサマリー

### API
- `GET /creators/me/revenue`

---

## 17. Tier B未回答質問 `/creator/inbox`

**役割**: Tier B学習者からの質問でAI下書き済み・クリエイター未承認のもの管理

### API
- `GET /chat/creator/pending`
- `POST /chat/creator/questions/{id}/respond`

---

## 18. スタジオ `/studio`

**役割**: AIによるSNS/YouTube向けコンテンツ一括生成

### レイアウト
```
サイドバーナビ（3タブ）
  ├ 作成（CreatePanel）
  ├ 下書き（DraftsPanel）
  └ 戦略メモ（MarketingPanel）

[CreatePanel]
─ 分野テキスト入力（フリーテキスト）
─ フォーマット選択（6種）
  ├ X（ツイート）
  ├ Threads
  ├ Instagram投稿
  ├ Instagram Reels
  ├ YouTubeショート
  └ YouTube動画
─ ネタ提案AI（6案）→ 選択
─ 切り口提案AI（3案）→ 選択
─ ストリーミング生成 → 結果表示
─ 「コンテンツ案に保存」ボタン
```

### API
- `GET /characters/`
- `POST /studio/ideas`
- `POST /studio/angles`
- `GET /studio/drafts`
- `DELETE /studio/drafts/{id}`
- `GET /studio/marketing-strategy`
- `PUT /studio/marketing-strategy`
- `POST /studio/marketing-strategy/chat`

---

## 19. クリエイター一覧（公開） `/creators`

**役割**: 学習者向けクリエイター検索・一覧

### レイアウト
```
AppHeader
─ 分野フィルタ（テキスト入力。登録済みクリエイターの分野から部分一致検索）
─ クリエイターカードリスト
  └ カード × N
      ├ アバター + 名前 + 人格タイプ
      ├ 総学習者数
      ├ 自己紹介文（先頭100文字）
      └ 会話サンプルプレビュー
```

### API
- `GET /creators/`

---

## 20. クリエイター詳細（公開） `/creators/[id]`

**役割**: 学習者向けクリエイター詳細ページ。コース購入の起点。

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
| `ContentEmbed` | URL種別判定による埋め込み表示（YouTube/X/Instagram等）。分野は汎用スタイルで表示 |
| `Skeleton` | ローディングスケルトン |
| `Toast` | 成功/エラー/情報通知 |
| `DarkModeToggle` | ダークモード切替ボタン |
