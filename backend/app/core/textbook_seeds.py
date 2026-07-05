# プリセット教材マスタの初期データ。
# 出典: ManaVillage_議論サマリー_20260626.md 2節「TOEFL ITP特化とプリセット教材」。
# ※パターン名・速読テクニック構成など実物確認待ちの項目は議論サマリー記載の暫定名称をそのまま使用している。
#   実物確認後、textbooksテーブルのtocを更新すること（11節「未解決事項」参照）。

TOEFL_ITP_PRESET_TEXTBOOKS = [
    {
        "name": "はじめて受けるTOEFL ITP TEST総合対策【改訂版】",
        "publisher": "語研",
        "type": "textbook",
        "target": "全セクション",
        "toc": [
            {"item": "Section 1 Listening - Part A Short Conversations 攻略+練習問題(88問)"},
            {"item": "Section 1 Listening - Part B Long Conversations 攻略+練習問題"},
            {"item": "Section 1 Listening - Part C Talks 攻略+練習問題"},
            {"item": "Section 2 Structure and Written Expression 攻略+練習問題(79問)"},
            {"item": "Section 3 Reading Comprehension 攻略+練習問題(54問)"},
            {"item": "模擬試験1回分"},
        ],
    },
    {
        # ※パターン1〜18の正確な名称は実物確認待ち（暫定名称）
        "name": "TOEFL ITP TESTリスニング完全攻略【改訂版】",
        "publisher": "語研",
        "type": "textbook",
        "target": "Section 1",
        "toc": (
            [{"item": f"パターン{i}: Short Conversations"} for i in range(1, 11)]
            + [{"item": f"パターン{i}: Long Conversations"} for i in range(11, 15)]
            + [{"item": f"パターン{i}: Talks"} for i in range(15, 19)]
            + [
                {"item": "模試1回分 Part A (Short Conversations・30問)"},
                {"item": "模試1回分 Part B (Long Conversations・8問)"},
                {"item": "模試1回分 Part C (Talks・12問)"},
            ]
        ),
    },
    {
        "name": "全問正解するTOEFL ITP TEST文法問題対策",
        "publisher": "語研",
        "type": "textbook",
        "target": "Section 2",
        "toc": (
            [{"item": f"Powerful Code {i:02d}"} for i in range(1, 28)]
            + [{"item": f"Practice Test {i}"} for i in range(1, 5)]
        ),
    },
    {
        "name": "全問正解するTOEFL ITP TEST文法問題580問",
        "publisher": "語研",
        "type": "textbook",
        "target": "Section 2",
        "toc": (
            [
                {"item": "出題項目別練習問題①: 文構造"},
                {"item": "出題項目別練習問題②: 動詞形"},
                {"item": "出題項目別練習問題③: 名詞・代名詞"},
                {"item": "出題項目別練習問題④: 形容詞・副詞・比較"},
                {"item": "出題項目別練習問題⑤: 接続詞・関係詞・前置詞・慣用表現"},
                {"item": "出題項目別練習問題⑥: 一致・並列"},
                {"item": "出題項目別練習問題⑦: 語順・欠落・冗語"},
            ]
            + [{"item": f"実力養成問題 第{i}回"} for i in range(1, 13)]
        ),
    },
    {
        # ※速読テクニックの正確な構成・模試の大問数は実物確認待ち（暫定構成）
        "name": "TOEFL ITPテストリーディングスピードマスター",
        "publisher": "語研",
        "type": "textbook",
        "target": "Section 3",
        "toc": (
            [
                {"item": "速読テクニック基礎"},
                {"item": "設問パターン10種の攻略"},
            ]
            + [{"item": f"模擬試験{m}回目 大問{d}"} for m in range(1, 7) for d in range(1, 6)]
        ),
    },
]


IT_PRESET_TEXTBOOKS = [
    {
        "name": "独習Python 第2版",
        "publisher": "翔泳社",
        "type": "textbook",

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

MUSIC_PRESET_TEXTBOOKS = [
    {
        "name": "バイエルピアノ教則本",
        "publisher": "全音楽譜出版社",
        "type": "textbook",

        "target": "ピアノ初心者",
        "toc": (
            [{"item": f"No.{i}: 練習曲（初級）"} for i in range(1, 25)]
            + [{"item": f"No.{i}: 練習曲（中級）"} for i in range(25, 61)]
            + [{"item": f"No.{i}: 練習曲（上級）"} for i in range(61, 107)]
        ),
    },
    {
        "name": "ハノン ピアニストのための60の練習曲",
        "publisher": "全音楽譜出版社",
        "type": "textbook",

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


JAPANESE_PRESET_TEXTBOOKS = [
    {
        "name": "みんなの日本語 初級I 第2版",
        "publisher": "スリーエーネットワーク",
        "type": "textbook",
        "target": "日本語初級（N5〜N4）",
        "toc": [
            {"item": "第1課: はじめまして（自己紹介・です/ます形）"},
            {"item": "第2課: これ・それ・あれ（指示代名詞）"},
            {"item": "第3課: ここ・そこ・あそこ（場所）"},
            {"item": "第4課: 何時に起きますか（時刻・動詞）"},
            {"item": "第5課: 誕生日はいつですか（日付・曜日）"},
            {"item": "第6課: あの人はだれですか（人物紹介）"},
            {"item": "第7課: デパートで（て形・ください）"},
            {"item": "第8課: ゆっくり休んでください（動詞のて形）"},
            {"item": "第9課: 家族の紹介（います/あります）"},
            {"item": "第10課: 先週京都へ行きました（過去形）"},
            {"item": "第11課: 日本語が少し話せます（可能形）"},
            {"item": "第12課: もうお花見をしましたか（たことがある）"},
            {"item": "第13課: 箱の中に何がありますか（存在・位置）"},
            {"item": "第14課: 週末、何をしますか（動詞活用復習）"},
            {"item": "第15課: 少し小さいですが、いい部屋ですね（形容詞）"},
            {"item": "第16課: 雪祭りを見に行きませんか（誘い・目的）"},
            {"item": "第17課: 靴を脱いでください（〜てから・〜ないでください）"},
            {"item": "第18課: 作文を書かなければなりません（義務・禁止）"},
            {"item": "第19課: 体の具合が悪いんです（〜んです・理由）"},
            {"item": "第20課: 荷物を送りたいんですが（依頼・許可）"},
            {"item": "第21課: 電気をつけたまま寝ました（〜たまま）"},
            {"item": "第22課: 部長はもう出かけになりました（敬語入門）"},
            {"item": "第23課: 歌舞伎を見たことがありますか（経験）"},
            {"item": "第24課: 引越しのお知らせが届いています（〜ている）"},
            {"item": "第25課: この荷物を持っていただけませんか（依頼表現）"},
        ],
    },
    {
        "name": "JLPT N3 文法・語彙・読解 完全マスター",
        "publisher": "アスク出版",
        "type": "textbook",
        "target": "JLPT N3対策",
        "toc": [
            {"item": "Chapter 1: N3頻出文法パターン（〜ている・〜てある等）"},
            {"item": "Chapter 2: 接続表現（〜ので・〜から・〜ために）"},
            {"item": "Chapter 3: 条件表現（〜たら・〜ば・〜と・〜なら）"},
            {"item": "Chapter 4: 助詞の使い分け（は/が・に/で等）"},
            {"item": "Chapter 5: 頻出語彙800語（名詞・動詞・形容詞）"},
            {"item": "Chapter 6: 複合動詞・擬音語・擬態語"},
            {"item": "Chapter 7: 読解問題（短文・中文）"},
            {"item": "Chapter 8: 読解問題（長文）"},
            {"item": "Chapter 9: 模擬試験 第1回"},
            {"item": "Chapter 10: 模擬試験 第2回"},
        ],
    },
    {
        "name": "ゼロから始める日本語会話",
        "publisher": "学研プラス",
        "type": "textbook",
        "target": "日本語会話初級〜中級",
        "toc": [
            {"item": "Unit 1: 挨拶・自己紹介"},
            {"item": "Unit 2: 買い物・レストランでの注文"},
            {"item": "Unit 3: 道の聞き方・交通機関"},
            {"item": "Unit 4: 病院・薬局での会話"},
            {"item": "Unit 5: 職場でのビジネス日本語（基礎）"},
            {"item": "Unit 6: 電話での会話"},
            {"item": "Unit 7: 日本の文化・習慣について話す"},
            {"item": "Unit 8: 意見を述べる・議論する"},
            {"item": "Unit 9: 総合復習・ロールプレイ"},
        ],
    },
]


def seed_textbooks(db) -> int:
    """プリセット教材が textbooks テーブルに存在することを保証する。新規作成した件数を返す（commitはしない）。"""
    from app.models.textbook import Textbook

    created = 0
    for preset in TOEFL_ITP_PRESET_TEXTBOOKS + IT_PRESET_TEXTBOOKS + MUSIC_PRESET_TEXTBOOKS + JAPANESE_PRESET_TEXTBOOKS:
        existing = db.query(Textbook).filter(Textbook.name == preset["name"]).first()
        if existing is None:
            db.add(Textbook(**preset, is_preset=True))
            created += 1
    return created
