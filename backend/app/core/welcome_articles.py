from sqlalchemy.orm import Session
from app.models.article import Article
from app.models.character import Character
from app.models.customer import Customer


def claim_welcome_article_for_customer(db: Session, customer: Customer) -> Article | None:
    """「最初の1つ無料」ウェルカム記事のテンプレートを1件コピーして顧客の本棚に追加する。

    顧客にキャラクターが割り当てられている場合（公式キャラ・オリジナルキャラいずれも）は
    そのキャラクター専用のテンプレートを優先し、なければ
    汎用テンプレート記事（template_character_id=NULL）をコピーする。

    既に利用済みの場合、または対応するテンプレートが存在しない場合は None を返す（呼び出し元で db.commit() すること）。
    """
    if customer.free_content_claimed:
        return None

    character = None
    if customer.character_id:
        character = db.query(Character).filter(Character.id == customer.character_id).first()

    template = None
    if character:
        template = db.query(Article).filter(
            Article.is_welcome_template == True,  # noqa: E712
            Article.template_character_id == character.id,
        ).first()
    if not template:
        template = db.query(Article).filter(
            Article.is_welcome_template == True,  # noqa: E712
            Article.template_character_id.is_(None),
        ).first()
    if not template:
        return None

    article = Article(
        customer_id=customer.id,
        character_id=character.id if character else template.character_id,
        article_type=template.article_type,
        title=template.title,
        content=template.content,
        tips=template.tips,
        example_sentences=template.example_sentences,
        status="published",
        is_llm_drafted=False,
        template_source_id=template.id,
    )
    db.add(article)
    customer.free_content_claimed = True
    return article


def swap_welcome_article_if_character_ready(db: Session, customer: Customer) -> Article | None:
    """汎用ウェルカム記事（キャラクタービルダー使用時の、キャラ完成前に渡した汎用版）を受け取っている顧客に、
    そのキャラクター専用のウェルカム記事テンプレートが用意できたタイミングで、内容を専用版に差し替える。

    顧客の本棚にある「汎用テンプレートからコピーしたウェルカム記事」を、
    キャラクター専用テンプレートの内容で上書きする（記事自体は同じレコードのまま、内容のみ差し替え）。
    差し替え対象が無い場合は None を返す（呼び出し元で変更があった場合のみ db.commit() すること）。
    """
    if not customer.character_id:
        return None

    char_template = db.query(Article).filter(
        Article.is_welcome_template == True,  # noqa: E712
        Article.template_character_id == customer.character_id,
    ).first()
    if not char_template:
        return None

    generic_template_ids = [
        t.id for t in db.query(Article.id).filter(
            Article.is_welcome_template == True,  # noqa: E712
            Article.template_character_id.is_(None),
        ).all()
    ]
    if not generic_template_ids:
        return None

    article = db.query(Article).filter(
        Article.customer_id == customer.id,
        Article.template_source_id.in_(generic_template_ids),
    ).first()
    if not article:
        return None

    article.character_id = customer.character_id
    article.article_type = char_template.article_type
    article.title = char_template.title
    article.content = char_template.content
    article.tips = char_template.tips
    article.example_sentences = char_template.example_sentences
    article.template_source_id = char_template.id
    return article
