from sqlalchemy.orm import Session
from app.models.article import Article
from app.models.character import Character
from app.models.customer import Customer


def claim_welcome_article_for_customer(db: Session, customer: Customer) -> Article | None:
    """「最初の1つ無料」ウェルカム記事のテンプレートを1件コピーして顧客の本棚に追加する。

    公式キャラ（is_preset=True）が割り当てられている場合はそのキャラクター専用のテンプレートを、
    それ以外（キャラクタービルダー使用・キャラ未割り当て含む）の場合は
    汎用テンプレート記事（template_character_id=NULL）をコピーする。

    既に利用済みの場合、または対応するテンプレートが存在しない場合は None を返す（呼び出し元で db.commit() すること）。
    """
    if customer.free_content_claimed:
        return None

    character = None
    if customer.character_id:
        character = db.query(Character).filter(Character.id == customer.character_id).first()

    template = None
    if character and character.is_preset:
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
    )
    db.add(article)
    customer.free_content_claimed = True
    return article
