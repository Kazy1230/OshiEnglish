# 親密度（キャラクターとの関係性）に関する共通ロジック。
# 「会話を重ねるほど、距離が縮まっていく」という体験を演出するための仕組み。
# ポイントを段階（レベル）に変換し、それぞれに「呼び方・話し方の段階」のラベルを割り当てる。
# このラベルは、管理者がDM返信を書く際の「今はこのくらいの距離感で話しかけよう」という
# 目安として表示される（実際の文章は引き続き管理者が手で書くため、強制はしない）。

# レベルしきい値（このポイント数に到達すると、そのレベルになる）
_LEVEL_THRESHOLDS = [0, 15, 40, 80, 140, 220]

_STAGE_LABELS = [
    {"level": 0, "label": "敬語期",     "hint": "まだ出会ったばかり。丁寧語・敬語を中心に、礼儀正しく接する段階。"},
    {"level": 1, "label": "やわらぎ期", "hint": "少し慣れてきた頃。敬語が和らぎ、ところどころ親しみのある言葉が混ざる段階。"},
    {"level": 2, "label": "タメ口期",   "hint": "すっかり打ち解けた段階。フランクなタメ口で、気軽に話しかけるようになる。"},
    {"level": 3, "label": "あだ名期",   "hint": "かなり親密になった段階。「〇〇くん／〇〇ちゃん」のような、あだ名や愛称で呼び始める。"},
    {"level": 4, "label": "親友期",     "hint": "もはや親友のような関係。冗談を言い合ったり、軽口を叩き合えるくらいの距離感。"},
    {"level": 5, "label": "特別な存在期", "hint": "誰よりも信頼し合っている、特別な関係。何でも話せる、かけがえのない相手として接する。"},
]

MAX_LEVEL = len(_STAGE_LABELS) - 1

# 会話のやり取り1往復あたりに加算するポイント（控えめにし、長く育成を楽しめるようにする）
# キャラクターからの返信分は管理画面での設定対象外のため、定数のまま据え置く。
POINTS_PER_CUSTOMER_MESSAGE = 1
POINTS_PER_CHARACTER_REPLY = 1


def get_intimacy_settings(db):
    """親密度ポイントの自動加算設定（シングルトン行）を取得する。存在しない場合はデフォルト値で作成する。"""
    from app.models.intimacy_settings import IntimacySettings

    settings_row = db.query(IntimacySettings).filter(IntimacySettings.id == 1).first()
    if not settings_row:
        settings_row = IntimacySettings(id=1)
        db.add(settings_row)
        db.commit()
        db.refresh(settings_row)
    return settings_row


def compute_intimacy_level(points: int) -> int:
    points = max(0, points or 0)
    level = 0
    for i, threshold in enumerate(_LEVEL_THRESHOLDS):
        if points >= threshold:
            level = i
    return min(level, MAX_LEVEL)


def intimacy_info(points: int) -> dict:
    """ポイントから、レベル・呼び方の段階・次のレベルまでの進捗を一括で算出する。"""
    points = max(0, points or 0)
    level = compute_intimacy_level(points)
    stage = _STAGE_LABELS[level]

    if level < MAX_LEVEL:
        current_threshold = _LEVEL_THRESHOLDS[level]
        next_threshold = _LEVEL_THRESHOLDS[level + 1]
        points_to_next = max(0, next_threshold - points)
    else:
        current_threshold = _LEVEL_THRESHOLDS[level]
        next_threshold = None
        points_to_next = 0

    return {
        "points": points,
        "level": level,
        "max_level": MAX_LEVEL,
        "stage_label": stage["label"],
        "stage_hint": stage["hint"],
        "current_level_threshold": current_threshold,
        "next_level_threshold": next_threshold,
        "points_to_next_level": points_to_next,
    }
