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


def seed_textbooks(db) -> int:
    """プリセット教材が textbooks テーブルに存在することを保証する。新規作成した件数を返す（commitはしない）。"""
    from app.models.textbook import Textbook

    created = 0
    for preset in TOEFL_ITP_PRESET_TEXTBOOKS:
        existing = db.query(Textbook).filter(Textbook.name == preset["name"]).first()
        if existing is None:
            db.add(Textbook(**preset, is_preset=True))
            created += 1
    return created
