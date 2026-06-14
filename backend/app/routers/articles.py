import os
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from typing import List
from app.core.database import get_db
from app.core.security import get_current_user, get_current_admin
from app.core.uploads import validate_media_ext, MAX_MEDIA_SIZE
from app.models.article import Article
from app.models.message import Message
from app.models.correction_request import CorrectionRequest
from app.models.access_log import AccessLog
from app.models.customer import Customer
from app.models.character import Character
from app.core.intimacy import get_intimacy_settings
from app.core.character_voice import customer_display_name
from app.core.welcome_articles import claim_welcome_article_for_customer, swap_welcome_article_if_character_ready
from app.core.template_articles import distribute_template_article_if_due
from app.core.rewards import check_and_unlock_rewards
from app.core.credits import consume_credits, get_credit_settings, ARTICLE_REQUEST_FEE
from pydantic import BaseModel, model_validator
from typing import Optional

router = APIRouter(prefix="/articles", tags=["記事"])

# リスニング演習問題用の音声ファイル保存先（main.py で /static にマウントされているディレクトリ配下）
_EXERCISE_AUDIO_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static", "exercise_audio")
os.makedirs(_EXERCISE_AUDIO_DIR, exist_ok=True)

class ArticleOut(BaseModel):
    id: int
    title: str
    content: Optional[str] = None
    tips: Optional[list] = None
    example_sentences: Optional[list[str]] = None
    status: str
    article_type: str = "request"
    exercise_format: Optional[str] = None
    exercise_category: Optional[str] = None
    exercise_data: Optional[dict] = None
    grammar_master_id: Optional[int] = None
    character_id: int
    customer_id: Optional[int] = None
    unlock_cost: int = 0
    opened_at: Optional[str] = None
    locked: bool = False

    class Config:
        from_attributes = True


def _sanitized_exercise_data_for_customer(article: Article) -> Optional[dict]:
    """顧客向けに演習問題データを返す際、出題者側だけが見るべき情報を隠す。

    - 選択式（multiple_choice）：「正解・解説」を隠す。
      顧客側ではまず自力で解いてもらい、採点エンドポイント経由で結果と解説を受け取る流れにしたいため、
      一覧取得・詳細取得の時点では答えを含めない。
    - 記述式（written_response）：「evaluation_notes（添削時の採点観点メモ）」を隠す。
      これは運営・キャラクターが添削時に参照する内部メモであり、生徒に見せるものではない。
    """
    data = article.exercise_data
    if not data:
        return data
    if article.exercise_format == "multiple_choice":
        sanitized = dict(data)
        questions = []
        for q in (data.get("questions") or []):
            questions.append({
                "prompt": q.get("prompt"),
                "choices": q.get("choices"),
            })
        sanitized["questions"] = questions
        return sanitized
    if article.exercise_format == "written_response":
        sanitized = dict(data)
        sanitized.pop("evaluation_notes", None)
        return sanitized
    return data


def _serialize_article_for_customer(article: Article) -> dict:
    """顧客向けに記事をシリアライズする。未開封の有料記事（unlock_cost > 0 かつ未開封）は
    本文等を省略し、locked=True として返す（本棚・詳細画面でロック表示するため）。
    """
    locked = (article.unlock_cost or 0) > 0 and article.opened_at is None
    data = {
        "id": article.id,
        "title": article.title,
        "status": article.status,
        "article_type": article.article_type,
        "exercise_format": article.exercise_format,
        "exercise_category": article.exercise_category,
        "grammar_master_id": article.grammar_master_id,
        "character_id": article.character_id,
        "customer_id": article.customer_id,
        "unlock_cost": article.unlock_cost or 0,
        "opened_at": article.opened_at.isoformat() if article.opened_at else None,
        "locked": locked,
    }
    if locked:
        data.update({"content": None, "tips": None, "example_sentences": None, "exercise_data": None})
    else:
        data.update({
            "content": article.content,
            "tips": article.tips,
            "example_sentences": article.example_sentences,
            "exercise_data": _sanitized_exercise_data_for_customer(article),
        })
    return data

# ===== 顧客向け =====

@router.get("/", response_model=List[ArticleOut])
def get_my_articles(
    current_user: Customer = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """ログイン中の顧客自身の公開記事のみ返す（他顧客の記事は絶対に返さない）

    演習問題（選択式）の正解・解説は、一覧表示の時点では含めない
    （詳細表示・採点エンドポイントと同じ方針：自力で解いてから答え合わせをしてもらう）。

    取得のたびに、定期便プールから配布間隔（3〜5日のランダム）に応じた
    新しい定期便記事が無料で本棚に追加される（あれば）。
    """
    distribute_template_article_if_due(db, current_user)
    db.commit()

    articles = db.query(Article).filter(
        Article.customer_id == current_user.id,
        Article.status == "published"
    ).all()
    return [_serialize_article_for_customer(a) for a in articles]

@router.get("/character/{character_id}/blog-posts")
def get_character_blog_posts(
    character_id: int,
    current_user: Customer = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """記事閲覧画面のサイドバー表示用：そのキャラクターが書いている「ブログ記事」一覧
    （あたかもキャラクターが趣味でブログを書いているかのような世界観演出のため、
    公開済みのものを最新5件だけ返す。特定の顧客に紐付かない記事のため誰でも閲覧可）
    """
    posts = db.query(Article).filter(
        Article.character_id == character_id,
        Article.article_type == "blog",
        Article.status == "published",
    ).order_by(Article.created_at.desc()).limit(5).all()
    return [
        {
            "id": p.id,
            "title": p.title,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in posts
    ]


@router.get("/{article_id}", response_model=ArticleOut)
def get_article(
    article_id: int,
    request: Request,
    current_user: Customer = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """記事詳細取得。
    通常の「依頼記事」は必ず自分の記事かをチェックする。
    「ブログ記事」はキャラクターが書いている公開コンテンツという位置づけのため、
    公開済みであれば顧客の紐付けに関わらず閲覧できる（世界観演出・サイドバー導線用）。
    """
    article = db.query(Article).filter(
        Article.id == article_id,
        Article.status == "published"
    ).first()
    if not article:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="記事が見つかりません")

    # ブログ記事は公開コンテンツ（誰でも閲覧可）、それ以外（依頼記事・演習問題）は自分の記事のみ
    is_own_article = article.article_type != "blog" and article.customer_id == current_user.id
    is_public_blog_article = article.article_type == "blog"
    if not (is_own_article or is_public_blog_article):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="記事が見つかりません")

    # アクセスログは「自分宛ての記事・演習問題を開いた」場合のみ記録する
    # （ブログ記事は customer_id を持たず、進捗集計の対象でもないため対象外）
    if is_own_article:
        log = AccessLog(
            customer_id=current_user.id,
            article_id=article_id,
            ip_address=request.client.host if request.client else None
        )
        db.add(log)
        db.commit()

    # 演習問題（選択式）は、答え・解説を見せる前にまず自力で解いてもらいたいので、
    # 詳細表示の時点では問題文・選択肢のみを返し、正解・解説は採点エンドポイント経由で渡す
    return _serialize_article_for_customer(article)


@router.post("/{article_id}/unlock", response_model=ArticleOut)
def unlock_article(
    article_id: int,
    current_user: Customer = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """未開封の記事を開封する。unlock_costが設定されている場合はクレジットを消費する
    （残高不足の場合は402）。既に開封済みの場合はそのまま現在の記事データを返す（冪等）。
    """
    article = db.query(Article).filter(
        Article.id == article_id,
        Article.customer_id == current_user.id,
    ).first()
    if not article:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="記事が見つかりません")

    if article.opened_at is None:
        if (article.unlock_cost or 0) > 0:
            consume_credits(db, current_user, article.unlock_cost, reason="article_unlock")
        article.opened_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(article)

    return _serialize_article_for_customer(article)


class ExerciseSubmitMC(BaseModel):
    answers: list[Optional[int]]  # 各設問への回答（選択肢インデックス）。未回答は null


class ExerciseSubmitWritten(BaseModel):
    answer: str


class ExerciseCheckAnswer(BaseModel):
    question_index: int
    chosen_index: Optional[int] = None


@router.post("/{article_id}/check-answer")
def check_multiple_choice_answer(
    article_id: int,
    data: ExerciseCheckAnswer,
    current_user: Customer = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """選択式演習の1問だけを即時採点する（解答直後の○/✕の軽いフィードバック用）。

    全設問の正解をまとめて返すと未回答の設問の答えまで見えてしまうため、
    選んだ1問の正誤だけをその場で返す。解説・キャラクターコメントは
    引き続き「採点する」（/submit-mc）でまとめて返す。
    """
    article = db.query(Article).filter(
        Article.id == article_id,
        Article.status == "published",
        Article.article_type == "exercise",
        Article.exercise_format == "multiple_choice",
    ).first()
    if not article:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="演習問題が見つかりません")
    if article.customer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="演習問題が見つかりません")

    questions = (article.exercise_data or {}).get("questions") or []
    if not (0 <= data.question_index < len(questions)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="設問が見つかりません")

    correct_index = questions[data.question_index].get("correct_index")
    is_correct = data.chosen_index is not None and data.chosen_index == correct_index
    return {"is_correct": is_correct}


@router.post("/{article_id}/submit-mc")
def submit_multiple_choice_exercise(
    article_id: int,
    data: ExerciseSubmitMC,
    current_user: Customer = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """選択式の演習問題を採点する（自動採点・即時フィードバック）。

    結果と一緒に各設問の正解・解説を返す。これによって、答えを見る前に
    まず自力で取り組んでもらう、という体験を保ちながら即座に振り返りができる。
    """
    article = db.query(Article).filter(
        Article.id == article_id,
        Article.status == "published",
        Article.article_type == "exercise",
        Article.exercise_format == "multiple_choice",
    ).first()
    if not article:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="演習問題が見つかりません")
    if article.customer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="演習問題が見つかりません")

    questions = (article.exercise_data or {}).get("questions") or []
    results = []
    correct_count = 0
    for i, q in enumerate(questions):
        chosen = data.answers[i] if i < len(data.answers) else None
        correct_index = q.get("correct_index")
        is_correct = chosen is not None and chosen == correct_index
        if is_correct:
            correct_count += 1
        # 正解・不正解で異なる解説を出し分ける（世界観を保つため、キャラクターの反応も変える）。
        # explanation_correct / explanation_incorrect が用意されていればそれを優先し、
        # 旧データ・片方しか無いデータのフォールバックとして共通の explanation を使う。
        if is_correct:
            explanation = q.get("explanation_correct") or q.get("explanation")
        else:
            explanation = q.get("explanation_incorrect") or q.get("explanation")
        results.append({
            "chosen_index": chosen,
            "correct_index": correct_index,
            "is_correct": is_correct,
            "explanation": explanation,
        })

    # スコア帯に応じたキャラクターからの一言コメント。
    # 「採点して終わり」ではなく、結果に応じてキャラクターが反応してくれることで世界観・没入感を保つ。
    # score_comments は作問時（LLMプロンプト経由）に用意してもらう想定で、
    # perfect（満点）／good（半分以上正解）／encourage（半分未満）の3段階で出し分ける。
    score_comments = (article.exercise_data or {}).get("score_comments") or {}
    total = len(questions)
    character_comment = None
    if total > 0:
        if correct_count == total:
            character_comment = score_comments.get("perfect")
        elif correct_count * 2 >= total:
            character_comment = score_comments.get("good")
        else:
            character_comment = score_comments.get("encourage")

    # 演習問題に取り組んだことでキャラクターとの絆が少し深まる
    settings_row = get_intimacy_settings(db)
    current_user.intimacy_points = (current_user.intimacy_points or 0) + settings_row.points_per_exercise_submit
    check_and_unlock_rewards(db, current_user)
    db.commit()

    return {
        "score": correct_count,
        "total": total,
        "results": results,
        "character_comment": character_comment,
    }


@router.post("/{article_id}/submit-written")
def submit_written_exercise(
    article_id: int,
    data: ExerciseSubmitWritten,
    current_user: Customer = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """記述式の演習問題（ライティング・スピーキング等）の解答をキャラクターへ提出する。

    自動採点が難しい領域のため、解答をそのままDMでキャラクター（運営）へ送り、
    手動でのフィードバックにつなげる（料金表の「マニュアル＋キャラフィードバック」に対応）。
    """
    article = db.query(Article).filter(
        Article.id == article_id,
        Article.status == "published",
        Article.article_type == "exercise",
        Article.exercise_format == "written_response",
    ).first()
    if not article:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="演習問題が見つかりません")
    if article.customer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="演習問題が見つかりません")

    if not data.answer or not data.answer.strip():
        raise HTTPException(status_code=400, detail="解答を入力してください")

    content = (
        f"【演習問題「{article.title}」への解答を提出します】\n\n"
        f"{data.answer.strip()}"
    )
    msg = Message(
        customer_id=current_user.id,
        character_id=article.character_id,
        sender="customer",
        content=content,
        is_exercise_submission=True,
        article_id=article.id,
    )
    db.add(msg)
    # 演習への回答提出でも親密度を加算（学習への取り組みで絆が深まる）
    settings_row = get_intimacy_settings(db)
    current_user.intimacy_points = (current_user.intimacy_points or 0) + settings_row.points_per_exercise_submit
    check_and_unlock_rewards(db, current_user)
    db.commit()
    return {"message": "解答を提出しました。キャラクターからのフィードバックをお待ちください。"}

# ===== 管理者向け =====


def _validate_exercise_data(exercise_format: Optional[str], exercise_data: Optional[dict]):
    if not exercise_data:
        raise ValueError("演習問題には exercise_data（問題内容）の指定が必須です")
    if exercise_format == "multiple_choice":
        questions = exercise_data.get("questions")
        if not isinstance(questions, list) or len(questions) == 0:
            raise ValueError("選択式の演習問題には、少なくとも1問の questions が必要です")
        for i, q in enumerate(questions, start=1):
            if not isinstance(q, dict) or not q.get("prompt"):
                raise ValueError(f"設問{i}：prompt（問題文）が必要です")
            choices = q.get("choices")
            if not isinstance(choices, list) or len(choices) < 2:
                raise ValueError(f"設問{i}：choices（選択肢）は2つ以上必要です")
            ci = q.get("correct_index")
            if not isinstance(ci, int) or not (0 <= ci < len(choices)):
                raise ValueError(f"設問{i}：correct_index（正解の選択肢番号）が不正です")
            # 正解時・不正解時で異なる解説を出し分けたいので、どちらかは必須にする
            # （explanation_correct / explanation_incorrect が無い場合は、共通の explanation を許容する＝旧データ互換）
            if not (q.get("explanation_correct") or q.get("explanation_incorrect") or q.get("explanation")):
                raise ValueError(f"設問{i}：explanation_correct（正解時の解説）または explanation_incorrect（不正解時の解説）が必要です")
    elif exercise_format == "written_response":
        if not exercise_data.get("prompt"):
            raise ValueError("記述式の演習問題には prompt（お題・設問文）が必要です")
    else:
        raise ValueError("exercise_format は 'multiple_choice'（選択式）か 'written_response'（記述式）を指定してください")


class ArticleCreate(BaseModel):
    article_type: str = "request"  # request（依頼記事）/ blog（ブログ記事）/ exercise（演習問題）
    customer_id: Optional[int] = None
    character_id: int
    grammar_master_id: Optional[int] = None
    title: str
    content: str = ""
    tips: Optional[list] = None
    example_sentences: Optional[list[str]] = None
    status: str = "draft"
    is_llm_drafted: bool = False
    exercise_format: Optional[str] = None
    exercise_category: Optional[str] = None
    exercise_data: Optional[dict] = None
    request_message_id: Optional[int] = None  # 元になった記事リクエストメッセージ（公開時にステータス自動更新に使う）
    correction_request_id: Optional[int] = None  # 元になった添削リクエスト（公開時にステータス自動更新に使う）
    is_welcome_template: bool = False  # ウェルカムページ用テンプレートかどうか
    template_character_id: Optional[int] = None  # 公式キャラ専用テンプレートの場合、対象キャラのID（汎用テンプレートはNULL）
    unlock_cost: Optional[int] = None  # 開封に必要なクレジット（未指定時はrequest_message_id/article_typeから自動算出）

    @model_validator(mode="after")
    def _validate_by_type(self):
        VALID_TYPES = ("request", "blog", "exercise", "writing_feedback", "speaking_feedback", "welcome", "template")
        if self.article_type not in VALID_TYPES:
            raise ValueError(
                "article_type は 'request'（依頼記事）/ 'blog'（ブログ記事）/ 'exercise'（演習問題）"
                "/ 'writing_feedback'（ライティングフィードバック）"
                "/ 'speaking_feedback'（スピーキングフィードバック）"
                "/ 'welcome'（ウェルカムページ）/ 'template'（定期便プール）のいずれかを指定してください"
            )
        if self.article_type == "request":
            if self.customer_id is None or self.grammar_master_id is None:
                raise ValueError("依頼記事には「顧客」と「文法マスター」の指定が必須です")
            if not self.content:
                raise ValueError("依頼記事には本文の入力が必須です")
            self.exercise_format = None
            self.exercise_category = None
            self.exercise_data = None
        elif self.article_type == "blog":
            if not self.content:
                raise ValueError("ブログ記事には本文の入力が必須です")
            # ブログ記事は特定の顧客・文法トピックに紐付けない（趣味で書いている体の簡易記事のため）
            self.customer_id = None
            self.grammar_master_id = None
            self.exercise_format = None
            self.exercise_category = None
            self.exercise_data = None
        elif self.article_type in ("writing_feedback", "speaking_feedback"):
            # ライティング／スピーキングフィードバック：
            # 記述式演習に提出した答案を採点・添削したフィードバック記事として顧客の本棚に届ける。
            # 文法マスター・演習データは不要（フィードバック本文をそのまま content に入れる）。
            if self.customer_id is None:
                raise ValueError("フィードバック記事には「顧客」の指定が必須です")
            if not self.content:
                raise ValueError("フィードバック記事には本文の入力が必須です")
            self.grammar_master_id = None
            self.exercise_format = None
            self.exercise_category = None
            self.exercise_data = None
        elif self.article_type == "welcome":
            # ウェルカムページ：新規顧客の本棚に最初に届くテンプレート記事。
            # 公式キャラ専用（template_character_id=キャラID）または汎用（NULL）として登録する。
            # 「対象顧客」を指定した場合は、テンプレートではなくその顧客の本棚に直接届く
            # 個別ウェルカムページとして登録する（自動配布の対象外になっている既存顧客向け）。
            if not self.content:
                raise ValueError("ウェルカムページには本文の入力が必須です")
            self.grammar_master_id = None
            self.exercise_format = None
            self.exercise_category = None
            self.exercise_data = None
            if self.customer_id is not None:
                self.is_welcome_template = False
                self.template_character_id = None
            else:
                self.is_welcome_template = True
        elif self.article_type == "template":
            # 定期便プール：customer_id=NULLで保管し、配布時にコピーして各顧客の本棚に追加する。
            if not self.content:
                raise ValueError("定期便記事には本文の入力が必須です")
            self.customer_id = None
            self.grammar_master_id = None
            self.exercise_format = None
            self.exercise_category = None
            self.exercise_data = None
        else:
            # 演習問題：特定の顧客に向けて出題する（依頼記事と同様、顧客の本棚に届く）
            if self.customer_id is None:
                raise ValueError("演習問題には「顧客」の指定が必須です")
            self.grammar_master_id = None
            _validate_exercise_data(self.exercise_format, self.exercise_data)
            if not self.content:
                self.content = ""
        return self

class ArticleUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    tips: Optional[list] = None
    example_sentences: Optional[list[str]] = None
    status: Optional[str] = None
    character_id: Optional[int] = None
    grammar_master_id: Optional[int] = None
    article_type: Optional[str] = None
    customer_id: Optional[int] = None
    exercise_format: Optional[str] = None
    exercise_category: Optional[str] = None
    exercise_data: Optional[dict] = None
    request_message_id: Optional[int] = None  # 元になった記事リクエストメッセージ（公開時にステータス自動更新に使う）
    correction_request_id: Optional[int] = None  # 元になった添削リクエスト（公開時にステータス自動更新に使う）
    is_welcome_template: Optional[bool] = None
    template_character_id: Optional[int] = None
    unlock_cost: Optional[int] = None  # 開封に必要なクレジット
    # template_character_id を NULL に戻したい場合、exclude_none=True では None が無視されるため
    # このフラグで明示的にクリアする
    clear_template_character_id: bool = False

    @model_validator(mode="after")
    def _validate_exercise_on_update(self):
        # article_type の変更は作成後に許可しない（タイプが変わるとexercise_dataなどが不整合になるため）
        # フロントエンドでも変更不可UIにしているが、API側でも明示的に無視する
        self.article_type = None  # 更新時は article_type フィールドを無視（変更不可）
        # 演習問題の更新時、exercise_data または exercise_format のどちらかが送られてきたら整合性を検証する
        if self.exercise_data is not None and self.exercise_format is not None:
            _validate_exercise_data(self.exercise_format, self.exercise_data)
        return self

@router.get("/admin/all", tags=["管理者"])
def admin_get_all_articles(
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """記事一覧（顧客名・キャラクター名付き）"""
    articles = db.query(Article).options(
        joinedload(Article.customer),
        joinedload(Article.character),
        joinedload(Article.grammar_master),
    ).order_by(Article.created_at.desc()).all()

    return [
        {
            "id": a.id,
            "title": a.title,
            "content": a.content,
            "tips": a.tips,
            "example_sentences": a.example_sentences,
            "status": a.status,
            "article_type": a.article_type,
            "exercise_format": a.exercise_format,
            "exercise_category": a.exercise_category,
            "exercise_data": a.exercise_data,
            "grammar_master_id": a.grammar_master_id,
            "character_id": a.character_id,
            "customer_id": a.customer_id,
            "is_llm_drafted": a.is_llm_drafted,
            "is_welcome_template": a.is_welcome_template,
            "template_character_id": a.template_character_id,
            "correction_request_id": a.correction_request_id,
            "request_message_id": a.request_message_id,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "updated_at": a.updated_at.isoformat() if a.updated_at else None,
            # 結合データ
            "customer_name": customer_display_name(a.customer) if a.customer else None,
            "character_name": a.character.name if a.character else None,
            "grammar_topic": a.grammar_master.topic_name if a.grammar_master else None,
        }
        for a in articles
    ]

@router.post("/me/claim-welcome", status_code=status.HTTP_201_CREATED)
def claim_welcome_article(
    current_user: Customer = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """ウェルカムページ向け：「最初の1つ無料」キャンペーンとして、事前に用意したテンプレート記事を
    1件だけ本棚にコピーする（LLM呼び出しは行わない）。

    公式キャラ（is_preset=True）の場合はそのキャラクター専用のテンプレート記事を、
    それ以外（キャラクタービルダーで作成したカスタムキャラ）の場合は
    汎用テンプレート記事（template_character_id=NULL）をコピーする。
    """
    if current_user.free_content_claimed:
        raise HTTPException(status_code=400, detail="無料コンテンツは既にご利用いただいています")

    article = claim_welcome_article_for_customer(db, current_user)
    if not article:
        raise HTTPException(status_code=404, detail="ウェルカム記事のテンプレートが見つかりません")

    db.commit()
    db.refresh(article)

    return {"id": article.id, "title": article.title, "article_type": article.article_type}


@router.post("/admin/exercise-audio", tags=["管理者"])
async def admin_upload_exercise_audio(
    file: UploadFile = File(...),
    admin=Depends(get_current_admin),
):
    """リスニング演習問題用の音声ファイルをアップロードする。

    返ってきた audio_url を exercise_data の audio_url（設問共通の音声）や
    questions[].audio_url（設問ごとの音声）に貼り付けて使う。
    """
    ext = os.path.splitext(file.filename or "")[1].lower()
    media_type = validate_media_ext(ext, "audio")
    if media_type != "audio":
        raise HTTPException(status_code=400, detail="音声ファイル（mp3/wav/m4a/webm/ogg）をアップロードしてください")

    raw = await file.read()
    if len(raw) > MAX_MEDIA_SIZE:
        raise HTTPException(status_code=400, detail="ファイルサイズが大きすぎます（50MBまで）")

    filename = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(_EXERCISE_AUDIO_DIR, filename)
    with open(path, "wb") as f:
        f.write(raw)

    return {"audio_url": f"/static/exercise_audio/{filename}"}


@router.post("/admin/", tags=["管理者"], status_code=status.HTTP_201_CREATED)
def admin_create_article(
    data: ArticleCreate,
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    article = Article(**data.model_dump(exclude={"unlock_cost"}))

    # 開封コスト（unlock_cost）の決定：
    # 1. 管理者が明示的に指定していればそれを使う
    # 2. 記事リクエストに紐付く場合は、合意した総額（credit_cost）から依頼時の固定費を引いた残額
    # 3. 定期便記事の場合は、デフォルトの開封コストを使う
    if data.unlock_cost is not None:
        article.unlock_cost = data.unlock_cost
    elif data.request_message_id is not None:
        req_msg = db.query(Message).filter(Message.id == data.request_message_id).first()
        if req_msg and req_msg.credit_cost:
            article.unlock_cost = max(0, req_msg.credit_cost - ARTICLE_REQUEST_FEE)
    elif data.article_type == "template":
        article.unlock_cost = get_credit_settings(db).template_unlock_cost

    db.add(article)
    # 「依頼記事」の作成は記事依頼回数カウントの対象になるため、報酬解放チェックを行う
    if article.article_type == "request" and article.customer_id:
        customer = db.query(Customer).filter(Customer.id == article.customer_id).first()
        if customer:
            db.flush()
            check_and_unlock_rewards(db, customer)

    # キャラクター専用のウェルカムテンプレートが新たに登録された場合、
    # 既にキャラが割り当て済みで汎用ウェルカム記事を受け取っている顧客の本棚を専用版に差し替える
    if article.article_type == "welcome" and article.is_welcome_template and article.template_character_id is not None:
        db.flush()
        customers = db.query(Customer).filter(
            Customer.character_id == article.template_character_id,
            Customer.free_content_claimed == True,  # noqa: E712
        ).all()
        for customer in customers:
            swap_welcome_article_if_character_ready(db, customer)

    db.commit()
    db.refresh(article)
    return article

@router.patch("/admin/{article_id}", tags=["管理者"])
def admin_update_article(
    article_id: int,
    data: ArticleUpdate,
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="記事が見つかりません")

    prev_status = article.status  # 公開状態の変化を検知するために保存

    clear_template = data.clear_template_character_id
    for key, val in data.model_dump(exclude_none=True, exclude={"clear_template_character_id"}).items():
        setattr(article, key, val)
    if clear_template:
        article.template_character_id = None

    # request_message_idが（このPATCHで）紐付けられ、unlock_costが明示指定されていない場合は、
    # 作成時と同様に合意した総額（credit_cost）から依頼時の固定費を引いた残額を自動算出する。
    if data.request_message_id is not None and data.unlock_cost is None:
        req_msg = db.query(Message).filter(Message.id == data.request_message_id).first()
        if req_msg and req_msg.credit_cost:
            article.unlock_cost = max(0, req_msg.credit_cost - ARTICLE_REQUEST_FEE)

    # キャラクター専用のウェルカムテンプレートに更新された場合も、create時と同様に
    # 既にキャラが割り当て済みで汎用ウェルカム記事を受け取っている顧客の本棚を専用版に差し替える
    if article.article_type == "welcome" and article.is_welcome_template and article.template_character_id is not None:
        customers = db.query(Customer).filter(
            Customer.character_id == article.template_character_id,
            Customer.free_content_claimed == True,  # noqa: E712
        ).all()
        for customer in customers:
            swap_welcome_article_if_character_ready(db, customer)

    db.commit()
    db.refresh(article)

    # 記事が「公開」に切り替わった瞬間、顧客に自動DMで通知する。
    # - ブログ記事（customer_id = None）は通知不要
    # - 依頼記事・演習問題（customer_id あり）のみ対象
    # これにより、管理者が公開ボタンを押すだけで顧客へのお知らせが届き、
    # 「通知し忘れ」による顧客体験の低下を防ぐ。
    # 管理者が既読にした後でも adminDeleteMessage でこのDMを削除・差し替え可能。
    notification_sent = False
    if (
        data.status == "published"
        and prev_status != "published"
        and article.customer_id is not None
    ):
        char = db.query(Character).filter(Character.id == article.character_id).first()
        char_name = char.name if char else "先生"
        _TYPE_LABEL = {
            "exercise":         "演習問題",
            "writing_feedback": "ライティングフィードバック",
            "speaking_feedback": "スピーキングフィードバック",
            "welcome":          "ウェルカムページ",
        }
        article_type_label = _TYPE_LABEL.get(article.article_type, "記事")
        notification_msg = Message(
            customer_id=article.customer_id,
            character_id=article.character_id,
            sender="character",
            content=(
                f"📚 新しい{article_type_label}が届いています！\n"
                f"「{article.title}」を本棚に追加しました。ぜひ確認してみてね。"
            ),
        )
        db.add(notification_msg)
        notification_sent = True

    # 記事が「公開」に切り替わった瞬間、紐付けられた記事リクエストのステータスを
    # 自動で completed にする（手動更新漏れの防止）。
    if (
        data.status == "published"
        and prev_status != "published"
        and article.request_message_id is not None
    ):
        req_msg = db.query(Message).filter(Message.id == article.request_message_id).first()
        if req_msg and req_msg.request_status != "completed":
            req_msg.request_status = "completed"

    # 記事が「公開」に切り替わった瞬間、紐付けられた添削リクエスト（お題のない自由提出の
    # ライティング/スピーキング）を完了状態にし、この記事への参照を記録する。
    correction_updated = False
    if (
        data.status == "published"
        and prev_status != "published"
        and article.correction_request_id is not None
    ):
        cr = db.query(CorrectionRequest).filter(CorrectionRequest.id == article.correction_request_id).first()
        if cr:
            cr.status = "completed"
            cr.feedback_article_id = article.id
            correction_updated = True

    # 記事が「公開」に切り替わった瞬間、親密度レベル・記事依頼回数の達成状況をもとに
    # 未解放の報酬を解放する（admin_create_article時のチェックだけでは、作成〜公開の
    # 間に親密度ポイントが伸びていた場合の解放漏れが起こり得るため）。
    rewards_unlocked = False
    if (
        data.status == "published"
        and prev_status != "published"
        and article.customer_id is not None
    ):
        customer = db.query(Customer).filter(Customer.id == article.customer_id).first()
        if customer:
            newly_unlocked = check_and_unlock_rewards(db, customer)
            rewards_unlocked = bool(newly_unlocked)

    if notification_sent or correction_updated or rewards_unlocked or (
        data.status == "published"
        and prev_status != "published"
        and article.request_message_id is not None
    ):
        db.commit()

    return {
        "id": article.id,
        "title": article.title,
        "status": article.status,
        "article_type": article.article_type,
        "customer_id": article.customer_id,
        "character_id": article.character_id,
        "grammar_master_id": article.grammar_master_id,
        "exercise_format": article.exercise_format,
        "exercise_category": article.exercise_category,
        "notification_sent": notification_sent,
    }

@router.delete("/admin/{article_id}", tags=["管理者"])
def admin_delete_article(
    article_id: int,
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="記事が見つかりません")
    db.query(AccessLog).filter(AccessLog.article_id == article_id).delete()
    db.delete(article)
    db.commit()
    return {"message": "削除しました"}
