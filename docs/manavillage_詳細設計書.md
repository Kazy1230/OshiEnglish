# ManaVillage 詳細設計書

> ドメイン: manavillage.online
> ステータス: ドラフト v0.1
> 関連ドキュメント: ManaVillage 基本設計書 / ManaVillage マーケットプレイス化 要件定義書

---

## 1. 認証フロー詳細

### 1.1 JWT設計

| 項目 | 仕様 |
|---|---|
| アルゴリズム | HS256 |
| Accessトークン有効期限 | 30分 |
| Refreshトークン有効期限 | 30日 |
| 保存場所(フロント) | AccessトークンはメモリのみかつHttpOnly Cookie。LocalStorageには保存しない(XSS対策) |
| Refreshトークン保存 | HttpOnly Cookie |

**JWTペイロード**
```json
{
  "sub": "user_id",
  "role": "learner | instructor | admin",
  "exp": 1234567890
}
```

---

### 1.2 会員登録フロー

```
1. POST /auth/register
   - email / password / display_name を受け取る
   - passwordはbcryptでハッシュ化してDBに保存
   - roleはデフォルト 'learner'
   - Accessトークン + Refreshトークンを返却

バリデーション:
  - email: RFC5322準拠、255文字以内、重複チェック
  - password: 8文字以上、英数字混在
  - display_name: 1〜100文字
```

---

### 1.3 ログインフロー

```
1. POST /auth/login
   - email / password を受け取る
   - DBからユーザーを取得しbcryptで照合
   - 失敗5回でアカウントを30分ロック(Redis で試行回数管理)
   - 成功時: Accessトークン + Refreshトークンを返却

2. Accessトークン期限切れ時:
   - フロントエンドがRefreshトークンを使ってPOST /auth/refresh
   - 新しいAccessトークンを返却
   - Refreshトークンもローテーション(旧トークンは無効化)
```

---

### 1.4 パスワードリセットフロー

```
1. POST /auth/forgot-password
   - emailを受け取る
   - DBにユーザーが存在する場合のみリセットメールを送信
     (存在しない場合も同じレスポンスを返しメールの存在を漏らさない)
   - リセットトークン(UUID v4)を生成しRedisに保存(有効期限: 30分)
   - リセットURL: https://manavillage.online/reset-password?token={token}

2. POST /auth/reset-password
   - token / new_password を受け取る
   - Redisでトークンの有効性を確認
   - パスワードをbcryptでハッシュ化して更新
   - 使用済みトークンはRedisから即時削除
```

---

## 2. 決済フロー詳細

### 2.1 コンテンツ購入フロー

```
[フロントエンド]
1. ユーザーが「購入する」ボタンをクリック
2. POST /payments/checkout にcourse_idを送信

[バックエンド]
3. course_idからコース情報(title, price)を取得
4. purchasesテーブルを確認し、status='succeeded'の重複購入をチェック
   → 既に購入済みの場合は 409 Conflict を返す
5. Stripe Payment Intentを作成
   - amount: courses.price (円)
   - currency: 'jpy'
   - metadata: { user_id, course_id }
   - idempotency_key: "{user_id}_{course_id}_{timestamp}" (二重課金防止)
6. purchasesテーブルにstatus='pending'でレコード挿入
7. client_secretをフロントエンドに返却

[フロントエンド]
8. Stripe.js でクレジットカード情報を入力させ決済実行
9. 決済完了後、/purchase-complete?course_id={id} にリダイレクト

[Webhook]
10. POST /payments/webhook でStripeからイベントを受信
11. Stripe署名を検証(stripe.webhook.construct_event)
12. イベント種別が 'payment_intent.succeeded' の場合:
    - purchasesテーブルのstatusを'succeeded'に更新
    - コース内の全lessonに対してlesson_progressの初期レコードを挿入(is_completed=FALSE)
13. イベント種別が 'payment_intent.payment_failed' の場合:
    - purchasesテーブルのstatusを'failed'に更新
```

---

### 2.2 購入済み判定ロジック

```python
def is_purchased(user_id: int, course_id: int, db: Session) -> bool:
    return db.query(Purchase).filter(
        Purchase.user_id == user_id,
        Purchase.course_id == course_id,
        Purchase.status == "succeeded"
    ).first() is not None
```

コース詳細APIでこの関数を呼び出し、未購入かつ有料の場合はlessonsの`youtube_url`を`null`、テキストレッスンの`body`を`null`にして返す。

---

## 3. AI二段階生成エンジン詳細

### 3.1 処理フロー概要

```
Step 0: キャラクター設定生成 (POST /studio/generate/character)
  入力: キャラクターのイメージ説明(例: "ツンデレな女性先輩キャラ。英語が得意で少し上から目線だが根は優しい")
  処理: Anthropic APIにプロンプトを送信
  出力: TONE_PROFILE JSONの提案(名前案・一人称・口調・語尾・口癖・NG表現)
  用途: キャラクタービルダー(SCR-07)でAI生成→手動修正→保存の流れに使用

Step 1: コンテンツ相談 (POST /studio/consult)
  入力: テーマ(例: "仮定法過去完了")
  処理: Anthropic APIにプロンプトを送信
  出力: タイトル案3件 / 構成案 / 想定学習者レベル

Step 2: 素材生成 (POST /studio/generate/raw)
  入力: テーマ + 構成案(Step 1の結果 or 手動入力)
  処理: Anthropic APIで生の教材素材を生成
  出力: 文法解説 + 例文セット + 練習問題
  保存: content_drafts.raw_content に保存

Step 3: 口調変換 (POST /studio/generate/voiced)
  入力: draft_id + character_id
  処理: characters.tone_profileを取得し変換プロンプトを構築
        Anthropic APIでraw_contentをキャラクター口調に変換
  出力: 口調変換済み本文
  保存: content_drafts.voiced_content に保存

Step 4: 台本生成(オプション) (POST /studio/generate/script)
  入力: draft_id + character_id
  処理: voiced_contentをYouTube台本フォーマットに変換
  出力: イントロ / 本編 / アウトロ 構成の台本テキスト
```

---

### 3.2 プロンプト設計

#### Step 0: キャラクター設定生成プロンプト
```
system:
あなたはアニメ・ライトノベル風キャラクターの設定デザイナーです。
ユーザーが入力したキャラクターのイメージをもとに、英語学習コンテンツに使用するキャラクター設定を提案してください。
著作権で保護された既存キャラクターをそのまま模倣することなく、オリジナルのキャラクター設定を作成してください。
以下のJSON形式のみで返答してください。

{
  "name_suggestions": ["名前案1", "名前案2", "名前案3"],
  "first_person": "一人称(例: 私、僕、俺、あたし)",
  "tone": "口調の説明(例: 少し上から目線だが丁寧。敬語は使わない)",
  "personality": "性格の説明(例: ツンデレ。本当は親切だが素直に表現できない)",
  "sentence_ending": "語尾の特徴(例: 〜でしょ、〜じゃない、〜だけど？)",
  "catchphrase": "口癖(例: 「別に教えてあげてもいいけど」「感謝しなさいよ」)",
  "ng_words": ["使ってはいけない表現1", "使ってはいけない表現2"],
  "sample_lines": ["サンプルセリフ1", "サンプルセリフ2", "サンプルセリフ3"]
}

user:
キャラクターのイメージ: {character_concept}
```

#### Step 1: 相談プロンプト
```
system:
あなたは英語教育コンテンツの企画アドバイザーです。
講師が入力したテーマをもとに、英語学習者向けコンテンツの企画案を提案してください。
以下のJSON形式のみで返答してください。

{
  "titles": ["タイトル案1", "タイトル案2", "タイトル案3"],
  "structure": ["セクション1", "セクション2", "セクション3"],
  "target_level": "初級 | 中級 | 上級",
  "target_audience": "想定学習者の説明"
}

user:
テーマ: {theme}
```

#### Step 2: 素材生成プロンプト
```
system:
あなたは英語教育の専門家です。
与えられたテーマと構成に従い、正確でわかりやすい英語学習教材を作成してください。
口調・キャラクター性は一切加えず、事実と解説のみをプレーンな文章で書いてください。

user:
テーマ: {theme}
構成: {structure}
対象レベル: {target_level}
```

#### Step 3: 口調変換プロンプト
```
system:
あなたはキャラクターの口調変換専門家です。
以下のキャラクター設定に厳密に従い、入力されたテキストをそのキャラクターが話すように書き直してください。
内容・情報の正確性は必ず保持してください。変えるのは口調・表現のみです。

【キャラクター設定】
名前: {character.name}
一人称: {tone_profile.first_person}
口調: {tone_profile.tone}
性格: {tone_profile.personality}
語尾の特徴: {tone_profile.sentence_ending}
口癖: {tone_profile.catchphrase}
NG表現: {tone_profile.ng_words}

user:
以下のテキストを上記キャラクターの口調に変換してください:

{raw_content}
```

#### Step 4: 台本生成プロンプト
```
system:
あなたはYouTube動画の台本作成専門家です。
与えられたコンテンツをYouTube動画用の台本形式に変換してください。
以下の構成で出力してください:

【イントロ】(視聴者への挨拶、動画の内容紹介、30秒程度)
【本編】(コンテンツの内容をそのまま台本化)
【アウトロ】(まとめ、チャンネル登録・いいねへの誘導、20秒程度)

キャラクターの口調は維持してください。

user:
{voiced_content}
```

---

### 3.3 ストリーミング実装

AI生成の待機体験を改善するため、Anthropic APIのstreamingを使用する。

```python
# FastAPI側(例: /studio/generate/raw)
from anthropic import Anthropic
from fastapi.responses import StreamingResponse

client = Anthropic()

async def stream_generation(prompt: str):
    with client.messages.stream(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}]
    ) as stream:
        for text in stream.text_stream:
            yield f"data: {text}\n\n"

@router.post("/studio/generate/raw")
async def generate_raw(request: GenerateRawRequest):
    prompt = build_raw_prompt(request.theme, request.structure)
    return StreamingResponse(
        stream_generation(prompt),
        media_type="text/event-stream"
    )
```

```typescript
// Next.js側(フロントエンド)
const response = await fetch('/api/studio/generate/raw', {
  method: 'POST',
  body: JSON.stringify({ theme, structure }),
});

const reader = response.body?.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader!.read();
  if (done) break;
  const chunk = decoder.decode(value);
  setGeneratedText(prev => prev + chunk); // リアルタイムで表示を更新
}
```

---

## 4. 主要APIリクエスト/レスポンス仕様

### 4.1 POST /auth/register

**Request**
```json
{
  "email": "user@example.com",
  "password": "Password123",
  "display_name": "テストユーザー"
}
```

**Response 200**
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "display_name": "テストユーザー",
    "role": "learner"
  }
}
```

**Error**
```json
// 400: バリデーションエラー
{ "detail": "このメールアドレスはすでに登録されています" }
```

---

### 4.2 GET /courses/{id}

**Response 200(未購入)**
```json
{
  "id": 1,
  "title": "仮定法マスターコース",
  "description": "仮定法過去・仮定法過去完了を基礎から応用まで解説します",
  "thumbnail_url": "/uploads/course1_thumb.png",
  "category": "英文法",
  "price": 980,
  "is_free": false,
  "character": {
    "id": 1,
    "name": "白河雪菜",
    "avatar_url": "/uploads/yukina_avatar.png"
  },
  "lessons": [
    {
      "id": 1,
      "order": 1,
      "title": "仮定法とは？基礎編",
      "content_type": "text",
      "is_preview": true,
      "body": "仮定法とは...(プレビュー可なので全文返却)"
    },
    {
      "id": 2,
      "order": 2,
      "title": "仮定法過去を動画で解説",
      "content_type": "video",
      "is_preview": false,
      "youtube_url": null
    }
  ],
  "is_purchased": false
}
```

**Response 200(購入済み)**
```json
{
  ...同上,
  "lessons": [
    {
      "id": 2,
      "order": 2,
      "title": "仮定法過去を動画で解説",
      "content_type": "video",
      "is_preview": false,
      "youtube_url": "https://www.youtube.com/embed/XXXXXXXXXX"
    }
  ],
  "is_purchased": true
}
```

---

### 4.3 POST /studio/generate/character

**Request**
```json
{
  "character_concept": "ツンデレな女性先輩キャラ。英語が得意で少し上から目線だが根は優しい"
}
```

**Response 200**
```json
{
  "name_suggestions": ["白河雪菜", "氷川涼子", "霧島彩"],
  "first_person": "私",
  "tone": "少し上から目線だが丁寧。敬語は使わない。本音を隠すために皮肉っぽく話す",
  "personality": "ツンデレ。本当は親切で後輩思いだが、素直に表現できない",
  "sentence_ending": "〜でしょ、〜じゃない、〜だけど？",
  "catchphrase": "別に教えてあげてもいいけど",
  "ng_words": ["バカ", "死ね"],
  "sample_lines": [
    "別にあなたのために教えるわけじゃないけど、仮定法くらい覚えておきなさい",
    "これくらい分かって当然でしょ。…まあ、つまずくのも無理はないけど",
    "ちゃんと理解できた？…良かった。べ、別に心配してたわけじゃないけど"
  ]
}
```

---

### 4.4 POST /studio/consult

**Request**
```json
{
  "theme": "仮定法過去完了"
}
```

**Response 200**
```json
{
  "titles": [
    "仮定法過去完了を10分でマスター",
    "もし〜だったら...を英語で言えますか？仮定法過去完了入門",
    "TOEIC頻出! 仮定法過去完了の使い方完全ガイド"
  ],
  "structure": [
    "仮定法過去完了とは何か(定義・基本形)",
    "基本例文で理解する(5例文)",
    "よくあるミスと注意点",
    "練習問題(穴埋め3問)"
  ],
  "target_level": "中級",
  "target_audience": "TOEIC600〜730点を目指す社会人英語学習者"
}
```

---

### 4.5 POST /payments/checkout

**Request**
```json
{
  "course_id": 1
}
```

**Response 200**
```json
{
  "client_secret": "pi_xxx_secret_yyy",
  "amount": 980,
  "currency": "jpy",
  "course_title": "仮定法マスターコース"
}
```

**Error**
```json
// 409: 購入済み
{ "detail": "このコースはすでに購入済みです" }

// 400: 無料コース
{ "detail": "このコースは無料です" }
```

---

### 4.6 POST /characters/{id}/preview

**Request**
```json
{
  "sample_text": "仮定法過去完了は、過去の事実に反する仮定を表す表現です。"
}
```

**Response 200**
```json
{
  "original": "仮定法過去完了は、過去の事実に反する仮定を表す表現です。",
  "previewed": "...っていうか、仮定法過去完了くらい知ってるでしょ？過去の事実に反する仮定を表すやつよ。別に教えてあげてもいいけど。"
}
```

---

## 5. フロントエンドコンポーネント設計

### 5.1 主要コンポーネント一覧

| コンポーネント名 | 役割 | 使用画面 |
|---|---|---|
| `<CharacterCard />` | 講師カード(アイコン・名前・カテゴリタグ) | SCR-01, SCR-02 |
| `<ContentCard />` | コンテンツカード(タイトル・価格・無料バッジ) | SCR-01, SCR-03 |
| `<ContentBody />` | コンテンツ本文表示(プレビュー時はフェードアウト) | SCR-04 |
| `<PurchaseCTA />` | 購入CTAボタン(スクロール追従) | SCR-04 |
| `<ToneProfileForm />` | TONE_PROFILE設定フォーム | SCR-07 |
| `<PreviewPanel />` | 口調変換リアルタイムプレビュー | SCR-07 |
| `<StudioStepper />` | 生成スタジオのStep進行管理 | SCR-08 |
| `<StreamingText />` | AIストリーミングテキスト表示 | SCR-08 |
| `<ChatBubble />` | キャラクターとのチャットUI | SCR-03 |
| `<NotificationBell />` | 通知アイコン + 未読バッジ | 全画面(ヘッダー) |

---

### 5.2 ContentBodyコンポーネント(プレビュー制御)

```tsx
interface ContentBodyProps {
  body: string;
  isPreview: boolean;
  price: number;
  contentId: number;
}

export const ContentBody = ({
  body, isPreview, price, contentId
}: ContentBodyProps) => {
  return (
    <div className="relative">
      <div className={isPreview ? "max-h-48 overflow-hidden" : ""}>
        <article className="prose">{body}</article>
      </div>

      {isPreview && (
        <>
          {/* フェードアウト */}
          <div className="absolute bottom-0 w-full h-24
            bg-gradient-to-t from-white to-transparent" />

          {/* 購入CTA */}
          <PurchaseCTA price={price} contentId={contentId} />
        </>
      )}
    </div>
  );
};
```

---

### 5.3 StreamingTextコンポーネント

```tsx
interface StreamingTextProps {
  endpoint: string;
  payload: object;
  onComplete: (text: string) => void;
}

export const StreamingText = ({
  endpoint, payload, onComplete
}: StreamingTextProps) => {
  const [text, setText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const startStream = async () => {
    setIsLoading(true);
    setText("");

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    }

    setIsLoading(false);
    onComplete(fullText);
  };

  return (
    <div>
      <button onClick={startStream} disabled={isLoading}>
        {isLoading ? "生成中..." : "生成する"}
      </button>
      {text && <pre className="whitespace-pre-wrap">{text}</pre>}
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
| 重複購入 | 409 | 「購入済みです。マイページで確認できます」トースト表示 |
| AI生成エラー | 500 | 「生成に失敗しました。もう一度試してください」+再試行ボタン。下書きは自動保存済みである旨を表示 |
| Stripe決済エラー | 402 | 「決済に失敗しました。カード情報を確認してください」トースト表示 |
| ネットワークエラー | - | 「通信エラーが発生しました。接続を確認してください」トースト表示 |

---

## 7. コース・レッスン作成フロー詳細

### 7.1 フロー概要

```
Step 1: コース基本情報の作成 (POST /courses)
  入力: タイトル・説明・カテゴリ・価格・サムネイル・キャラクターID
  処理: coursesテーブルにstatus='draft'で保存
  出力: course_id

Step 2: レッスンの追加 (POST /courses/{id}/lessons)
  入力: タイトル・content_type(text/video)・本文 or YouTube URL・is_preview
  処理: lessonsテーブルにorder=最大値+1で保存
  出力: lesson_id
  ※ レッスンは1コースに複数追加可能。Step 2を繰り返す

Step 3: レッスン並び替え (PUT /courses/{id}/lessons/reorder)
  入力: lesson_idの配列(新しい並び順)
  処理: 各lessonのorderを更新
  出力: 更新後のレッスン一覧

Step 4: コース公開 (PUT /courses/{id})
  入力: status='published'
  処理: coursesテーブルのstatusを更新
        お気に入り登録済みユーザー全員にnotificationsレコードを生成(type='new_course')
  出力: 公開済みコース情報
```

---

### 7.2 AIスタジオとの連携フロー

コース・レッスン作成はAIスタジオ(Section 3)と連携して進める。標準的な流れは以下の通り。

```
① /studio/generate/character でキャラクター設定をAI生成 → 手動修正 → 保存
  ↓
② /studio/consult でコーステーマを相談 → 構成案・タイトル案を取得
  ↓
③ POST /courses でコース基本情報を作成(status='draft')
  ↓
④ レッスンごとに繰り返す:
   - /studio/generate/raw で教材素材を生成
   - /studio/generate/voiced でキャラクター口調に変換
   - (動画レッスンの場合) /studio/generate/script で台本を生成
   - POST /courses/{id}/lessons でレッスンを追加
  ↓
⑤ PUT /courses/{id}/lessons/reorder でレッスン順を調整
  ↓
⑥ PUT /courses/{id} でstatus='published'にしてコース公開
```

---

### 7.3 APIリクエスト/レスポンス仕様

#### POST /courses

**Request**
```json
{
  "character_id": 1,
  "title": "仮定法マスターコース",
  "description": "仮定法過去・過去完了を基礎から応用まで解説します",
  "category": "英文法",
  "price": 980,
  "is_free": false,
  "thumbnail_url": "/uploads/course1_thumb.png"
}
```

**Response 201**
```json
{
  "id": 1,
  "status": "draft",
  "title": "仮定法マスターコース",
  "lessons": []
}
```

---

#### POST /courses/{id}/lessons

**Request(テキストレッスン)**
```json
{
  "title": "仮定法とは？基礎編",
  "content_type": "text",
  "body": "仮定法とは、現実とは異なる仮定を表す表現です...(キャラクター口調変換済み)",
  "is_preview": true
}
```

**Request(動画レッスン)**
```json
{
  "title": "仮定法過去を動画で解説",
  "content_type": "video",
  "youtube_url": "https://www.youtube.com/embed/XXXXXXXXXX",
  "is_preview": false
}
```

**Response 201**
```json
{
  "id": 2,
  "course_id": 1,
  "order": 2,
  "title": "仮定法過去を動画で解説",
  "content_type": "video",
  "is_preview": false,
  "created_at": "2026-06-20T12:00:00"
}
```

---

#### PUT /courses/{id}/lessons/reorder

**Request**
```json
{
  "lesson_ids": [3, 1, 2]
}
```

**Response 200**
```json
{
  "lessons": [
    { "id": 3, "order": 1, "title": "イントロダクション" },
    { "id": 1, "order": 2, "title": "仮定法とは？基礎編" },
    { "id": 2, "order": 3, "title": "仮定法過去を動画で解説" }
  ]
}
```

---

### 7.4 バリデーション

| 対象 | ルール |
|---|---|
| コースのレッスン数 | 最低1件以上でないと公開不可 |
| is_previewのレッスン | コース内に最低1件のis_preview=trueを推奨(強制はしない) |
| youtube_url | サーバー側は `https://www.youtube.com/embed/` 形式のみ受け付ける。フロントエンド側で通常の視聴URL(`https://www.youtube.com/watch?v=XXXX`)を入力した場合、自動的にembed形式に変換してから送信する |
| price | is_free=falseの場合、100円以上を必須とする |
| 並び替え | lesson_idsに含まれるIDが全てそのコースに属するものかサーバー側で検証 |

---

### 7.5 YouTube URL自動変換(フロントエンド)

講師が通常の視聴URLを貼り付けた場合、フロントエンド側でembed形式に自動変換してから送信する。

```typescript
const toEmbedUrl = (input: string): string | null => {
  // 通常の視聴URL: https://www.youtube.com/watch?v=XXXX
  const watchMatch = input.match(
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/
  );
  if (watchMatch) return `https://www.youtube.com/embed/${watchMatch[1]}`;

  // 短縮URL: https://youtu.be/XXXX
  const shortMatch = input.match(
    /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/
  );
  if (shortMatch) return `https://www.youtube.com/embed/${shortMatch[1]}`;

  // すでにembed形式の場合はそのまま返す
  if (input.startsWith("https://www.youtube.com/embed/")) return input;

  return null; // 無効なURL
};
```
