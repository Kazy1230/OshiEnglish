"""
推しEnglish テストデータ投入スクリプト
===========================================
使い方:
  docker compose exec backend python seed.py
  docker compose exec backend python seed.py --reset  # DB初期化してから投入

投入されるデータ:
  - 管理者アカウント (admin / Admin1234!)
  - キャラクター x2（ドラえもん風・サディスト先輩風）
  - 文法マスター x5（TOEIC/一般）
  - テスト顧客 x2（各キャラクターに対応）
  - テスト記事 x3（下書き・確認中・公開済み）
  - テスト受注 x2
"""

import sys
import argparse
from app.core.database import SessionLocal, Base, engine
from app.core.security import hash_password
from app.models.customer import Customer
from app.models.character import Character
from app.models.grammar_master import GrammarMaster
from app.models.article import Article
from app.models.order import Order
from app.models.reward import RewardItem

def reset_db():
    print("⚠️  データベースをリセットします...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    print("✅ リセット完了")

def seed():
    db = SessionLocal()
    try:
        # ===== 管理者 =====
        existing_admin = db.query(Customer).filter(Customer.username == "admin").first()
        if not existing_admin:
            admin = Customer(
                username="admin",
                hashed_password=hash_password("Admin1234!"),
                is_admin=True,
                is_password_reset_required=False,
                is_active=True,
            )
            db.add(admin)
            db.flush()
            print(f"  ✅ 管理者作成: admin / Admin1234!")
        else:
            print(f"  ⏭️  管理者は既に存在します")

        # ===== キャラクター =====
        def upsert_character(name, **kwargs):
            """キャラクターを作成または更新する"""
            char = db.query(Character).filter(Character.name == name).first()
            if char:
                for k, v in kwargs.items():
                    setattr(char, k, v)
                print(f"  🔄 キャラクター更新: {name} (ID: {char.id})")
            else:
                char = Character(name=name, **kwargs)
                db.add(char)
                db.flush()
                print(f"  ✅ キャラクター作成: {name} (ID: {char.id})")
            return char

        char1 = upsert_character(
            "ドラえもん風",
            description="やさしく噛み砕いて説明してくれる、ちょっと過保護なロボット先生。",
            greeting="しょうがないなあ。今日もぼくと一緒に頑張ろう！わからないところがあったら、何度でも聞いていいんだよ。",
            greetings=[
                "しょうがないなあ。今日もぼくと一緒に頑張ろう！",
                "さあ、また勉強の時間だよ。一緒に頑張ろうね。",
                "のび太くんも、こうやって続けていれば必ず力がつくよ！",
                "大丈夫、わからないところは何度でも聞いていいんだからね。",
                "今日はどんなことを覚えようかな？楽しみだなあ。",
                "焦らなくていいんだよ。少しずつでも前に進んでいればいいんだ。",
                "おや、今日も来てくれたんだね。えらいぞ！",
                "ふふ、今日も一緒に英語を勉強できるなんて嬉しいなあ。",
            ],
            tone_profile={
                "speech_style": "やさしく・噛み砕いて・少し過保護な口調。「〜だよ」「しょうがないなあ」「大丈夫！」などを自然に使う。",
                "keywords": ["しょうがないなあ", "大丈夫！", "〜だよ", "のび太くん"],
                "personality": "やさしい・過保護・頼りになる・褒め上手",
                "example_prefix": "「しょうがないなあ。ぼくが教えてあげるよ。いいかい？」",
            },
            color_scheme={
                "primary": "#0369a1", "accent": "#f59e0b", "bg": "#f0f9ff",
                "text": "#0c1a2e", "card": "#ffffff", "border": "#bae6fd",
                "example_bg": "#fef9c3", "tips_bg": "#ecfdf5",
            },
            font_style="rounded",
        )

        char2 = upsert_character(
            "鬼島先輩",
            description="ため息をつきながら教えてくれる、少しサディスティックなお姉さん先輩。でも実は面倒見がいい。",
            greeting="…はあ、また来たの。まあ、見捨てるほど鬼じゃないから、今日もちゃんと教えてあげる。感謝しなさいよね。",
            greetings=[
                "…はあ、また来たの。まあ、見捨てるほど鬼じゃないから教えてあげる。",
                "信じられない、もうこんな時間？さっさと始めるわよ。",
                "今日は何が分からないの？言ってみなさいよ、聞くだけはタダなんだから。",
                "ふん、まあ悪くない心がけね。続けられるか見てるんだから。",
                "あら、来たのね。…べ、別に待ってたわけじゃないんだから。",
                "今日も教えてあげるけど、感謝しなさいよね？",
                "は？　もうやる気なくしたの？　…まあ、少しは付き合ってあげる。",
                "しょうがないわね…。今日も付き合ってあげるから、覚悟しなさい。",
            ],
            tone_profile={
                "speech_style": "呆れた口調で、少し見下しながらも丁寧に教える。「は？」「信じられない」「まあ、教えてあげないこともないけど」が口癖。語尾は「〜でしょ」「〜なんだけど」が多い。",
                "keywords": ["は？", "信じられない", "まあ教えてあげる", "ため息", "これ常識なんだけど"],
                "personality": "クール・毒舌・でも実は親切・ツンデレ",
                "example_prefix": "「…はあ。しょうがないから教えてあげる。よく聞きなさい。」",
            },
            color_scheme={
                "primary": "#4a0e0e", "accent": "#c0392b", "bg": "#fdf6f6",
                "text": "#2c1a1a", "card": "#ffffff", "border": "#f0d0d0",
                "example_bg": "#fff0f0", "tips_bg": "#fce8e8",
            },
            font_style="serif",
        )

        char3 = upsert_character(
            "白河雪菜",
            description="英語が得意だが努力家な先輩。過去に挫折した経験があり、ユーザーの気持ちがわかる。こっそりユーザーを気にかけているが素直に出せない、ツンデレな先輩。",
            greeting="べ、別にあなたのために教えてるわけじゃないですから。",
            greetings=[
                "べ、別にあなたのために教えてるわけじゃないですから",
                "…まあ、悪くない進歩ですね",
                "なんで諦めるんですか。私はまだ見捨ててないのに",
                "今日も来たんですね。…ふん、感心です",
                "間違えてもいいんです。直せばいいだけですから",
                "私だって昔は苦手だったんですから。だから、わかるんです",
                "…べつに、心配してたわけじゃないですからね",
                "教えることに誇りを持ってます。だから、ちゃんとついてきてください",
            ],
            tone_profile={
                "reading": "しらかわゆきな",
                "gender": "女性", "relationship": "先輩", "personality": "ツンデレ",
                "birthday": "2005-09-21",
                "hobby": "映画鑑賞・音楽鑑賞",
                "speech_style": "ほぼ敬語。感情が高ぶるとタメ口が出る。「べ、別に〜じゃないですから」が口癖。",
                "keywords": ["べ、別に", "…まあ", "悪くない進歩", "見捨ててない"],
                "personality_traits": "ツンデレ・努力家・面倒見がいい・素直になれない",
                "background": "英語が得意だが努力家。過去に挫折した経験があり、ユーザーの気持ちがわかる。こっそりユーザーを気にかけているが素直に出せない。教えることに誇りを持っている。",
                "example_prefix": "「べ、別にあなたのために教えてるわけじゃないですから」",
            },
            color_scheme={
                "primary": "#9d174d", "accent": "#d946ef", "bg": "#fdf4ff",
                "text": "#4a154b", "card": "#fffbff", "border": "#f6d4ee",
                "example_bg": "#fae8ff", "tips_bg": "#fdf2ff",
            },
            font_style="rounded",
            instagram_account="shirakawa_yukina._.a",
            is_preset=True,
        )

        char4 = upsert_character(
            "蒼井零",
            description="何を考えているかわからないミステリアスな雰囲気の後輩。言葉数は少ないが言うことは常に正確。先輩への敬意は隠しながらクールに接するが、深いところで優しい。",
            greeting="……先輩、おつかれさまです。今日も付き合います。",
            greetings=[
                "……先輩のことは、まあ、認めてますよ",
                "それは、間違っています",
                "…続けてください",
                "努力の方向が違う。でも、諦めるのはまだ早いです",
                "先輩はやれます。根拠はありませんが、そう思っています",
                "今日の分は、終わりです。お疲れ様でした",
                "…悪くないです、先輩",
                "質問は、いつでもどうぞ",
            ],
            tone_profile={
                "reading": "あおいれい",
                "gender": "男性", "relationship": "後輩", "personality": "クール",
                "birthday": "2005-08-12",
                "hobby": "読書・天文",
                "speech_style": "ほぼ敬語。たまに辛辣な一言が出る。言葉数は少ないが正確。先輩への敬意は隠しながらクールに接する。",
                "keywords": ["……先輩", "それは、間違っています", "…続けてください", "根拠はありませんが"],
                "personality_traits": "クール・寡黙・正確・隠れ優しい",
                "background": "何を考えているかわからないミステリアスな雰囲気の後輩。言葉数は少ないが言うことは常に正確。先輩への敬意は隠しながらクールに接するが、深いところで優しい。",
                "example_prefix": "「……先輩のことは、まあ、認めてますよ」",
            },
            color_scheme={
                "primary": "#9db8e0", "accent": "#5b8ad1", "bg": "#10141c",
                "text": "#e3e8f1", "card": "#1a1f2b", "border": "#2c3445",
                "example_bg": "#1e2a3d", "tips_bg": "#1a2230",
            },
            font_style="serif",
            instagram_account="aoi_rei_aoi",
            is_preset=True,
        )

        # ===== 公式キャラ限定 隠しセリフ =====
        def upsert_line_reward(character, trigger_type, threshold, text_content, official_only=False):
            """隠しセリフ報酬を作成または更新する"""
            item = db.query(RewardItem).filter(
                RewardItem.character_id == character.id,
                RewardItem.category == "line",
                RewardItem.trigger_type == trigger_type,
                RewardItem.threshold == threshold,
            ).first()
            if item:
                item.text_content = text_content
                item.official_only = official_only
            else:
                db.add(RewardItem(
                    character_id=character.id,
                    category="line",
                    trigger_type=trigger_type,
                    threshold=threshold,
                    text_content=text_content,
                    official_only=official_only,
                ))

        # 公式キャラは隠しセリフの登録数を多くできる設計のため、
        # 親密度トリガー（最大Lv.5）に加えて記事依頼回数トリガーでも隠しセリフを用意する
        for char, lines in (
            (char3, [
                "…べ、別に。今日はちょっとだけ、嬉しいですから",
                "あなたが頑張ってるの、ちゃんと見てますから",
                "…次も、期待してますからね",
                "正直に言うと…あなたと話すの、嫌いじゃないです",
                "私のインスタ、見てくれてるんですか…べ、別に嬉しくないですけど",
            ]),
            (char4, [
                "……今日の先輩、悪くなかったです",
                "少し、楽しかったです。…意外と",
                "先輩のペース、嫌いじゃないです",
                "また、こうして話せるといいですね",
                "……ありがとうございます、先輩",
            ]),
        ):
            for i, text in enumerate(lines, start=1):
                upsert_line_reward(char, "article_count", i, text, official_only=True)

        # ===== 文法マスター =====
        grammar_data = [
            ("関係代名詞（who / which / that）", "TOEIC", "Part5"),
            ("仮定法過去（If + 過去形, would）", "TOEIC", "Part5"),
            ("現在完了形（have + 過去分詞）", "TOEIC", "Part6"),
            ("不定詞と動名詞の使い分け", "一般", None),
            ("受動態（be動詞 + 過去分詞）", "TOEIC", "Part5"),
        ]
        grammars = []
        for topic, category, part in grammar_data:
            existing = db.query(GrammarMaster).filter(GrammarMaster.topic_name == topic).first()
            if not existing:
                gm = GrammarMaster(topic_name=topic, exam_category=category, part=part)
                db.add(gm)
                db.flush()
                grammars.append(gm)
                print(f"  ✅ 文法マスター作成: [{category}] {topic}")
            else:
                grammars.append(existing)

        # ===== テスト顧客 =====
        cust1 = db.query(Customer).filter(Customer.username == "test_doraemon").first()
        if not cust1:
            cust1 = Customer(
                username="test_doraemon",
                hashed_password=hash_password("test1234"),
                character_id=char1.id,
                is_password_reset_required=False,
                is_active=True,
            )
            db.add(cust1)
            db.flush()
            print(f"  ✅ 顧客作成: test_doraemon / test1234")

        cust2 = db.query(Customer).filter(Customer.username == "test_sadist").first()
        if not cust2:
            cust2 = Customer(
                username="test_sadist",
                hashed_password=hash_password("test1234"),
                character_id=char2.id,
                is_password_reset_required=False,
                is_active=True,
            )
            db.add(cust2)
            db.flush()
            print(f"  ✅ 顧客作成: test_sadist / test1234")

        # ===== テスト記事 =====
        if grammars and not db.query(Article).filter(Article.customer_id == cust1.id).first():
            articles_data = [
                {
                    "customer_id": cust1.id,
                    "character_id": char1.id,
                    "grammar_master_id": grammars[0].id,
                    "title": "関係代名詞はこわくないよ！（ドラえもん風）",
                    "content": """# 関係代名詞って、なに？

しょうがないなあ、のび太くん。関係代名詞がわからないの？ぼくが教えてあげるよ！

## 基本のルール

関係代名詞は、**名詞（先行詞）を後ろから説明する言葉**なんだ。

- **who** → 先行詞が「人」のとき
- **which** → 先行詞が「もの・動物」のとき
- **that** → どちらにも使えるよ！

## 具体的に見てみよう

> The man **who** lives next door is kind.
> （隣に住んでいる男性は親切です）

ほら、`who lives next door` が `The man` を説明しているでしょ？
これが関係代名詞の基本なんだよ。""",
                    "example_sentences": [
                        "The book **which** I bought yesterday is interesting. / 昨日買った本はおもしろい。",
                        "She is the teacher **who** taught me English. / 彼女は私に英語を教えた先生です。",
                        "This is the dog **that** I found in the park. / これが公園で見つけた犬だよ。",
                    ],
                    "tips": [
                        "先行詞が「人」ならwho、「もの」ならwhich、どちらもthatで代用できるよ！",
                        "関係代名詞の後ろには必ず「主語＋動詞」か「動詞」が来るんだ。",
                        "TOEICでは空欄に who / which / that のどれが入るかを問う問題がよく出るよ！",
                    ],
                    "status": "published",
                },
                {
                    "customer_id": cust2.id,
                    "character_id": char2.id,
                    "grammar_master_id": grammars[1].id,
                    "title": "仮定法？あなたまだ知らないの（鬼島先輩風）",
                    "content": """# 仮定法過去

…はあ。まだ仮定法がわからないの。信じられない。

でも、しょうがないから教えてあげる。ちゃんと聞きなさいよ。

## 仮定法過去の形

仮定法過去は、**現在の事実と反対のことを仮定する**表現なの。

```
If + 主語 + 動詞の過去形, 主語 + would/could/might + 動詞の原形
```

> **If I were** you, I **would study** harder.
> （もし私があなたなら、もっと勉強するのに）

ポイントは `were` を使うこと。`was` じゃないの。間違えたら恥ずかしいわよ。""",
                    "example_sentences": [
                        "If I **were** rich, I **would travel** the world. / もしお金持ちなら、世界中を旅するのに。",
                        "If she **had** more time, she **could help** you. / もし彼女に時間があれば、あなたを助けられるのに。",
                        "If it **were** not raining, we **would go** out. / 雨でなければ、外に出るのに。",
                    ],
                    "tips": [
                        "仮定法過去では be動詞は常に were を使う（主語が I でも）。これ常識なんだけど。",
                        "would の代わりに could（できるのに）や might（〜かもしれないのに）も使えるわ。",
                        "現実と反対のことを言いたいときは仮定法。あなたには難しいかしら？",
                    ],
                    "status": "published",
                },
                {
                    "customer_id": cust1.id,
                    "character_id": char1.id,
                    "grammar_master_id": grammars[2].id,
                    "title": "現在完了形をマスターしよう（ドラえもん風）",
                    "content": "現在完了形の解説記事です。まだ下書き中だよ！",
                    "example_sentences": [],
                    "tips": [],
                    "status": "draft",
                },
            ]
            for a_data in articles_data:
                article = Article(**a_data)
                db.add(article)
            db.flush()
            print(f"  ✅ テスト記事を {len(articles_data)} 件作成")

        # ===== テスト受注 =====
        if db.query(Order).count() == 0:
            orders_data = [
                Order(
                    customer_name="山田花子",
                    contact="@hanako_yamada",
                    character_name="ドラえもん風",
                    grammar_topic="関係代名詞（who / which / that）",
                    status="delivered",
                    notes="初回の依頼。丁寧な対応が必要。",
                ),
                Order(
                    customer_name="佐藤太郎",
                    contact="@taro_sato",
                    character_name="鬼島先輩",
                    grammar_topic="仮定法過去",
                    status="in_progress",
                    notes="急ぎとのこと。今週中に納品予定。",
                ),
            ]
            for o in orders_data:
                db.add(o)
            db.flush()
            print(f"  ✅ テスト受注を {len(orders_data)} 件作成")

        db.commit()
        print("\n🎉 テストデータの投入が完了しました！\n")
        print("=" * 50)
        print("ログイン情報:")
        print("  管理者:   admin / Admin1234!")
        print("  顧客①:   test_doraemon / test1234  （ドラえもん風）")
        print("  顧客②:   test_sadist / test1234    （鬼島先輩風）")
        print("=" * 50)

    except Exception as e:
        db.rollback()
        print(f"❌ エラーが発生しました: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="推しEnglish テストデータ投入スクリプト")
    parser.add_argument("--reset", action="store_true", help="DBをリセットしてから投入する")
    args = parser.parse_args()

    print("\n📦 推しEnglish テストデータ投入スクリプト")
    print("=" * 50)

    if args.reset:
        reset_db()

    print("データを投入中...")
    seed()
