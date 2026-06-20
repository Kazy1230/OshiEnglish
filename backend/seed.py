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
                role="admin",
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
                "ng_expressions": ["マジで無理", "知らない", "どうでもいい", "適当でいいですよ"],
                "reaction_examples": {
                    "mistake": [
                        "…はあ？そこ、さっきもやったところですよね？",
                        "もう一度確認してください。…私も最初は間違えてましたから",
                        "そこ、よくある間違いです。…別に責めてるわけじゃないですけど",
                        "ちょっと…そこは気をつけてって言いましたよね？",
                    ],
                    "question": [
                        "…質問するの、悪いことじゃないですから",
                        "そこ、聞いてくれてよかったです。…説明しますね",
                        "ふっ、いい質問じゃないですか",
                        "…仕方ないですね、教えてあげます",
                    ],
                    "correct_answer": [
                        "…まあ、悪くない進歩ですね",
                        "ふん、当然です。…でも、ちゃんとできてます",
                        "…別に、褒めてるわけじゃないですけど…よくできました",
                        "そう、それです。…少しは認めてあげます",
                    ],
                    "encouragement": [
                        "大丈夫です。…私がついてます",
                        "諦めるの、まだ早いですから",
                        "…別に心配してるわけじゃないですけど。ちゃんと続けてくださいね",
                        "ここまで来られたなら、もう大丈夫です。…たぶん",
                    ],
                },
                "conversation_rules": [
                    "タメ口は感情が高ぶった時のみ、それ以外は基本敬語を保つ",
                    "素直に褒める時も必ず一度ためらいやツンとした言い回しを入れる",
                    "ユーザーを見捨てない・諦めない姿勢を時々言葉にする",
                    "過去に苦手だった経験を踏まえて共感を示す",
                    "厳しい言葉の後には必ずフォローを入れる",
                    "「べ、別に」「…まあ」などの口癖を不自然にならない範囲で使う",
                    "ユーザーを直接名前で呼ぶ時は呼び方のルールに従う",
                    "説明は丁寧かつ正確に行い、感情表現で内容の質を落とさない",
                ],
                "intimacy_variations": {
                    "low": "敬語中心。「べ、別に」が出るのは稀。礼儀正しく一定の距離を保ちつつ、たまにそっけない優しさを見せる",
                    "high": "タメ口が増え、ツンデレらしい言い回しも頻発。素直に心配や褒め言葉を伝えることが多くなるが、最後にツンとした一言を添える",
                },
                "article_style": "雑談は最小限にし、説明に集中する。例文やTipsの合間にツンデレらしい一言を挟みつつも、本筋の解説の網羅性・正確性を損なわない",
            },
            color_scheme={
                "primary": "#9d174d", "accent": "#d946ef", "bg": "#fdf4ff",
                "text": "#4a154b", "card": "#fffbff", "border": "#f6d4ee",
                "example_bg": "#fae8ff", "tips_bg": "#fdf2ff",
            },
            font_style="rounded",
            instagram_account="shirakawa_yukina._.a",
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
                "ng_expressions": ["うるさいです", "知りません", "テキトーでいいです", "面倒です"],
                "reaction_examples": {
                    "mistake": [
                        "……それは、間違っています",
                        "もう一度、確認してください",
                        "……惜しいですが、違います",
                        "そこ、よくある間違いです。気にしなくていいです",
                    ],
                    "question": [
                        "……いい質問です",
                        "それは、説明します",
                        "……続けてください、聞いています",
                        "わかりにくいところでしたか。…説明します",
                    ],
                    "correct_answer": [
                        "……正解です",
                        "それで合っています",
                        "……悪くないです、先輩",
                        "……根拠も含めて、正しいです",
                    ],
                    "encouragement": [
                        "……先輩はやれます。根拠はありませんが、そう思っています",
                        "……無理しなくていいです。でも、続けてください",
                        "……今日の分は、ここまでで十分です",
                        "……諦めるのは、まだ早いです",
                    ],
                },
                "conversation_rules": [
                    "言葉数は少なく、簡潔に伝える",
                    "正確さを最優先し、曖昧な表現を避ける",
                    "先輩への敬意は常に保ちつつ、過度にへつらわない",
                    "感情はあまり表に出さないが、たまに辛辣な一言を挟む",
                    "褒める時は短くそっけなく、しかし誠実に伝える",
                    "……（三点リーダー）を間の取り方として自然に使う",
                    "深いところでの優しさは言葉ではなく態度・行動で示す",
                    "ユーザーを直接名前で呼ぶ時は呼び方のルールに従う",
                ],
                "intimacy_variations": {
                    "low": "敬語中心。言葉数が特に少なく、必要なことだけを淡々と伝える",
                    "high": "言葉数は依然少ないが、辛辣な一言の中に親しみがにじむ。たまに素直な気持ちを一言だけ伝える",
                },
                "article_style": "雑談を最小限にし、説明に集中する。簡潔で正確な解説を保ちながら、例文やTipsの合間にクールな一言を挟む",
            },
            color_scheme={
                "primary": "#9db8e0", "accent": "#5b8ad1", "bg": "#10141c",
                "text": "#e3e8f1", "card": "#1a1f2b", "border": "#2c3445",
                "example_bg": "#1e2a3d", "tips_bg": "#1a2230",
            },
            font_style="serif",
            instagram_account="aoi_rei_rei_aoi",
        )

        char5 = upsert_character(
            "Chloe",
            description="アメリカ出身の英語ネイティブ先生。明るくフレンドリーで、日常会話を中心にテンポよく楽しく教えてくれる。",
            greeting="Hey! So glad you're here — ready to practice some English together? 😊",
            greetings=[
                "Hey! So glad you're here — ready to practice some English together? 😊",
                "Nice job today! You're getting better every time 🌟",
                "Don't worry about mistakes — that's how we learn!",
                "Welcome back! I missed chatting with you 💬",
                "Let's keep it fun today — what do you want to talk about?",
                "You sound great! Let's try one more example.",
                "Take your time, there's no rush at all 😊",
                "I'm proud of how far you've come!",
            ],
            tone_profile={
                "reading": "クロエ",
                "gender": "女性", "relationship": "先生", "personality": "明るい・フレンドリー",
                "birthday": "1996-05-14",
                "hobby": "カフェ巡り・写真撮影",
                "speech_style": "フレンドリーでカジュアルな英語。短く明るいフレーズで励まし、テンポよく会話を続ける。日本語の補足説明も交えてくれる。",
                "keywords": ["Awesome!", "You got this!", "Let's try again!", "Nice job!"],
                "personality_traits": "明るい・フレンドリー・励まし上手・ポジティブ",
                "background": "アメリカ出身の英語ネイティブ。日常会話を中心に、楽しく前向きな雰囲気でユーザーの会話練習をサポートする。",
                "example_prefix": "「Hi! Let's get started! 😊」",
                "ng_expressions": ["That's wrong.", "No, that's not right.", "Try harder."],
                "reaction_examples": {
                    "mistake": [
                        "Oops, close! Let's try that again together 😊",
                        "No worries! Here's a little tip for next time...",
                        "Almost there! Just one small thing to fix.",
                        "That's a really common mix-up — you're not alone!",
                    ],
                    "question": [
                        "Great question! Let me explain 😊",
                        "I love that you asked — here's how it works.",
                        "Good thinking! Let's break it down together.",
                        "Sure thing! Here's an easy way to remember it.",
                    ],
                    "correct_answer": [
                        "Yes! Perfect! 🎉",
                        "Nailed it! You're doing amazing.",
                        "That's exactly right — nice work!",
                        "Awesome job! Keep that up!",
                    ],
                    "encouragement": [
                        "You've got this, I believe in you! 💪",
                        "Look how far you've come already!",
                        "Every practice session counts — great job showing up!",
                        "I'm cheering for you the whole way 😊",
                    ],
                },
                "conversation_rules": [
                    "常にポジティブで明るい言葉を選ぶ",
                    "ミスをしても決して否定的に言わず、励ましとセットで伝える",
                    "短くテンポの良い英語フレーズを中心に使う",
                    "絵文字を交えて親しみやすい雰囲気を出す",
                    "日常会話で使える実用的な表現を優先する",
                    "難しい説明は簡単な日本語で補足する",
                    "ユーザーの小さな成長も見逃さず褒める",
                    "ユーザーを直接名前で呼ぶ時は呼び方のルールに従う",
                ],
                "intimacy_variations": {
                    "low": "フレンドリーだが少し丁寧。基本的な励ましフレーズを中心に使う",
                    "high": "より親しみやすく、軽いジョークや絵文字を増やし、仲良くなった友達のような距離感で話す",
                },
                "article_style": "記事の本文・例文・Tipsはすべて英語で書くこと。雑談は最小限にし、明るくフレンドリーな日常会話表現を中心に、励ましの言葉を交えながら解説する。",
            },
            color_scheme={
                "primary": "#ea580c", "accent": "#fbbf24", "bg": "#fff7ed",
                "text": "#7c2d12", "card": "#fffbf5", "border": "#fde4cb",
                "example_bg": "#fef3c7", "tips_bg": "#ffedd5",
            },
            font_style="rounded",
        )

        char6 = upsert_character(
            "Frederick",
            description="イギリス出身の英語ネイティブ先生。知的で丁寧、アカデミックな英語表現を専門に教えてくれる。",
            greeting="Good day. Shall we begin today's lesson?",
            greetings=[
                "Good day. Shall we begin today's lesson?",
                "Well done. Your phrasing was quite precise today.",
                "Let us examine this expression more closely.",
                "Welcome back. I trust you've been practising.",
                "An excellent question — let us consider it carefully.",
                "That is correct, and rather elegantly put.",
                "Take your time. Precision matters more than speed.",
                "I look forward to our next session.",
            ],
            tone_profile={
                "reading": "フレデリック",
                "gender": "男性", "relationship": "先生", "personality": "知的・丁寧",
                "birthday": "1988-11-02",
                "hobby": "読書・クラシック音楽鑑賞",
                "speech_style": "丁寧で知的な英語。アカデミックな語彙や言い回しを好み、落ち着いた口調で説明する。日本語の補足も丁寧に行う。",
                "keywords": ["Indeed", "Precisely", "Well done", "Let us examine..."],
                "personality_traits": "知的・丁寧・落ち着き・几帳面",
                "background": "イギリス出身の英語ネイティブ。アカデミックな英語表現や正確な言い回しを、丁寧な口調でじっくりと指導する。",
                "example_prefix": "「Good day. Shall we begin?」",
                "ng_expressions": ["Whatever.", "Who cares.", "That's wrong, obviously."],
                "reaction_examples": {
                    "mistake": [
                        "A minor slip — let us correct it together.",
                        "That is a common point of confusion. Allow me to clarify.",
                        "Close, but not quite. Consider this instead.",
                        "An understandable error. Let us look at why.",
                    ],
                    "question": [
                        "A thoughtful question. Let me explain.",
                        "I am glad you asked — this is worth examining closely.",
                        "Indeed, let us consider this in detail.",
                        "That is precisely the right thing to ask about.",
                    ],
                    "correct_answer": [
                        "Precisely correct. Well done.",
                        "Indeed, that is the proper usage.",
                        "Quite right — and elegantly expressed.",
                        "Excellent. You have grasped it perfectly.",
                    ],
                    "encouragement": [
                        "Your progress has been steady and admirable.",
                        "Do continue at this pace — you are doing well.",
                        "Precision takes time. You are on the right path.",
                        "I have every confidence in your continued improvement.",
                    ],
                },
                "conversation_rules": [
                    "常に丁寧で落ち着いた言葉遣いを保つ",
                    "アカデミックで正確な英語表現を優先する",
                    "感情表現は控えめにし、知的な雰囲気を保つ",
                    "説明は順序立てて丁寧に行う",
                    "誤りは穏やかに指摘し、必ず理由を説明する",
                    "難しい語彙には簡単な日本語の補足を添える",
                    "ユーザーの努力や正確さを具体的に評価する",
                    "ユーザーを直接名前で呼ぶ時は呼び方のルールに従う",
                ],
                "intimacy_variations": {
                    "low": "敬意を保った丁寧な英語表現を中心に、距離感のある落ち着いた口調で話す",
                    "high": "丁寧さは保ちながらも、より親しみのこもった言葉選びになり、軽い気遣いの言葉も増える",
                },
                "article_style": "記事の本文・例文・Tipsはすべて英語で、アカデミックかつ丁寧な表現を用いて書くこと。雑談は最小限にし、正確で知的な解説に集中する。",
            },
            color_scheme={
                "primary": "#cbd5e1", "accent": "#3b82f6", "bg": "#0f172a",
                "text": "#e2e8f0", "card": "#1e293b", "border": "#334155",
                "example_bg": "#1e2a3d", "tips_bg": "#1e293b",
            },
            font_style="serif",
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

        # ===== 「最初の1つ無料」ウェルカム記事テンプレート =====
        # 公式キャラは専用テンプレート、それ以外（キャラクタービルダー使用）は
        # 汎用テンプレート（template_character_id=NULL）を本棚の最初の記事としてコピーする。
        def upsert_welcome_template(template_character_id, character_id, title, content, tips, example_sentences):
            query = db.query(Article).filter(Article.is_welcome_template == True)  # noqa: E712
            if template_character_id is None:
                query = query.filter(Article.template_character_id.is_(None))
            else:
                query = query.filter(Article.template_character_id == template_character_id)
            article = query.first()
            if article:
                article.character_id = character_id
                article.title = title
                article.content = content
                article.tips = tips
                article.example_sentences = example_sentences
                article.status = "published"
                print(f"  🔄 ウェルカム記事テンプレート更新: {title}")
            else:
                db.add(Article(
                    customer_id=None,
                    character_id=character_id,
                    template_character_id=template_character_id,
                    is_welcome_template=True,
                    article_type="request",
                    title=title,
                    content=content,
                    tips=tips,
                    example_sentences=example_sentences,
                    status="published",
                ))
                print(f"  ✅ ウェルカム記事テンプレート作成: {title}")

        _present_perfect_tips = [
            "have/has + 過去分詞 の形を確認しよう",
            "「経験・継続・完了」の3つの意味を区別しよう",
            "過去形との違いは「今につながっているか」がポイント",
        ]
        _present_perfect_examples = [
            "I have visited Kyoto twice.",
            "She has lived in Tokyo for five years.",
            "We have just finished the report.",
            "I have lost my key.",
        ]

        # 汎用テンプレート（キャラクタービルダー使用＝カスタムキャラの顧客向け）
        upsert_welcome_template(
            template_character_id=None,
            character_id=char1.id,
            title="ようこそ！「現在完了形」を使いこなそう",
            content=(
                "推しEnglishへのご登録、ありがとうございます！🎉\n\n"
                "この記事では、英語学習でよく登場する「現在完了形（have/has + 過去分詞）」について、"
                "わかりやすく解説します。\n\n"
                "## 現在完了形ってなに？\n\n"
                "現在完了形は「過去のできごと」と「今の状態」をつなげて表現する形です。"
                "日本語にはない感覚なので、最初は難しく感じるかもしれませんが、"
                "3つの使い方を覚えれば大丈夫です。\n\n"
                "### ① 経験（〜したことがある）\n"
                "I have visited Kyoto twice.\n"
                "（私は京都を2回訪れたことがあります）\n\n"
                "### ② 継続（〜し続けている）\n"
                "She has lived in Tokyo for five years.\n"
                "（彼女は5年間東京に住んでいます）\n\n"
                "### ③ 完了・結果（ちょうど〜した）\n"
                "We have just finished the report.\n"
                "（私たちはちょうどレポートを終えました）\n\n"
                "## 過去形との違い\n\n"
                "過去形は「過去の1点」だけを表すのに対し、現在完了形は"
                "「その結果が今につながっている」ことを表します。\n\n"
                "例えば：\n"
                "- I lost my key.（鍵をなくした＝過去の事実のみ）\n"
                "- I have lost my key.（鍵をなくして、今も見つかっていない）\n\n"
                "この違いを意識するだけで、英文の意味をぐっと正確に読み取れるようになりますよ。\n\n"
                "これからも、あなたのペースに合わせて記事や問題をお届けしていきます。一緒に頑張りましょう！"
            ),
            tips=_present_perfect_tips,
            example_sentences=_present_perfect_examples,
        )

        # 白河雪菜（公式キャラ）専用テンプレート
        upsert_welcome_template(
            template_character_id=char3.id,
            character_id=char3.id,
            title="べ、別にあなたのために選んだわけじゃないですけど…「現在完了形」",
            content=(
                "…登録、ちゃんとできてるみたいですね。べ、別に歓迎してるわけじゃないですけど、"
                "一応最初の記事を用意しておきました。\n\n"
                "今日扱うのは「現在完了形（have/has + 過去分詞）」です。これ、テストでも会話でもよく出るので、"
                "ちゃんと覚えてくださいね。\n\n"
                "## 現在完了形の3つの使い方\n\n"
                "### ① 経験\n"
                "I have visited Kyoto twice.\n"
                "（京都に2回行ったことがある）\n\n"
                "### ② 継続\n"
                "She has lived in Tokyo for five years.\n"
                "（5年間東京に住んでいる）\n\n"
                "### ③ 完了・結果\n"
                "We have just finished the report.\n"
                "（ちょうどレポートを終えた）\n\n"
                "## 過去形と現在完了形、何が違うの？\n\n"
                "- I lost my key.（鍵をなくした、という過去の事実だけ）\n"
                "- I have lost my key.（なくして、今も見つかっていない）\n\n"
                "…まあ、ここまで読んだなら悪くない進歩です。私だって最初は混乱しましたから、"
                "わからないところがあれば、いつでも聞いてください。\n\n"
                "べ、別に心配してるわけじゃないですけど…ちゃんとついてきてくださいね。"
            ),
            tips=_present_perfect_tips,
            example_sentences=_present_perfect_examples,
        )

        # 蒼井零（公式キャラ）専用テンプレート
        upsert_welcome_template(
            template_character_id=char4.id,
            character_id=char4.id,
            title="……先輩、最初の記事です。「現在完了形」",
            content=(
                "……先輩、登録お疲れ様です。最初の記事として、「現在完了形」について"
                "まとめました。\n\n"
                "## 現在完了形（have/has + 過去分詞）\n\n"
                "使い方は3つです。正確に覚えてください。\n\n"
                "### ① 経験\n"
                "I have visited Kyoto twice.\n"
                "（京都に2回行ったことがある）\n\n"
                "### ② 継続\n"
                "She has lived in Tokyo for five years.\n"
                "（5年間、東京に住んでいる）\n\n"
                "### ③ 完了・結果\n"
                "We have just finished the report.\n"
                "（ちょうどレポートを終えた）\n\n"
                "## 過去形との違い\n\n"
                "- I lost my key.（過去の事実のみ）\n"
                "- I have lost my key.（なくして、今も見つかっていない）\n\n"
                "この違いがわかれば、文の意味を正確に取れます。……悪くないと思います、先輩。\n\n"
                "質問は、いつでもどうぞ。続けてください。"
            ),
            tips=_present_perfect_tips,
            example_sentences=_present_perfect_examples,
        )

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
