from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session, joinedload
from typing import List
from app.core.database import get_db
from app.core.security import get_current_user, get_current_admin
from app.models.article import Article
from app.models.message import Message
from app.models.access_log import AccessLog
from app.models.customer import Customer
from app.models.character import Character
from app.core.intimacy import get_intimacy_settings
from app.core.rewards import check_and_unlock_rewards
from app.core.llm import generate_text, LLMError
from app.core.content_generation import (
    build_article_generation_prompt,
    build_exercise_generation_prompt,
    parse_json_response,
)
from pydantic import BaseModel, model_validator
from typing import Optional

router = APIRouter(prefix="/articles", tags=["記事"])

class ArticleOut(BaseModel):
    id: int
    title: str
    content: str
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

# ===== 顧客向け =====

@router.get("/", response_model=List[ArticleOut])
def get_my_articles(
    current_user: Customer = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """ログイン中の顧客自身の公開記事のみ返す（他顧客の記事は絶対に返さない）

    演習問題（選択式）の正解・解説は、一覧表示の時点では含めない
    （詳細表示・採点エンドポイントと同じ方針：自力で解いてから答え合わせをしてもらう）。
    """
    articles = db.query(Article).filter(
        Article.customer_id == current_user.id,
        Article.status == "published"
    ).all()
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
            "exercise_data": _sanitized_exercise_data_for_customer(a),
            "grammar_master_id": a.grammar_master_id,
            "character_id": a.character_id,
            "customer_id": a.customer_id,
        }
        for a in articles
    ]

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
    return {
        "id": article.id,
        "title": article.title,
        "content": article.content,
        "tips": article.tips,
        "example_sentences": article.example_sentences,
        "status": article.status,
        "article_type": article.article_type,
        "exercise_format": article.exercise_format,
        "exercise_category": article.exercise_category,
        "exercise_data": _sanitized_exercise_data_for_customer(article),
        "grammar_master_id": article.grammar_master_id,
        "character_id": article.character_id,
        "customer_id": article.customer_id,
    }


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

_VALID_EXERCISE_FORMATS = ("multiple_choice", "written_response")


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

    @model_validator(mode="after")
    def _validate_by_type(self):
        VALID_TYPES = ("request", "blog", "exercise", "writing_feedback", "speaking_feedback")
        if self.article_type not in VALID_TYPES:
            raise ValueError(
                "article_type は 'request'（依頼記事）/ 'blog'（ブログ記事）/ 'exercise'（演習問題）"
                "/ 'writing_feedback'（ライティングフィードバック）"
                "/ 'speaking_feedback'（スピーキングフィードバック）のいずれかを指定してください"
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
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "updated_at": a.updated_at.isoformat() if a.updated_at else None,
            # 結合データ
            "customer_name": a.customer.username if a.customer else None,
            "character_name": a.character.name if a.character else None,
            "grammar_topic": a.grammar_master.topic_name if a.grammar_master else None,
        }
        for a in articles
    ]

_VALID_FREE_CONTENT_EXAM_CATEGORIES = ("TOEIC", "英検", "IELTS", "TOEFL")


class FreeContentRequest(BaseModel):
    kind: str  # article（記事）/ exercise（演習問題）
    exam_category: str  # TOEIC / 英検 / IELTS / TOEFL
    part: Optional[str] = None  # 例: "Part 5"
    exercise_format: Optional[str] = None  # kind=exercise時のみ：multiple_choice / written_response


@router.post("/me/free-content", status_code=status.HTTP_201_CREATED)
def claim_free_content(
    data: FreeContentRequest,
    current_user: Customer = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """ウェルカムページ向け：「最初の1つ無料」キャンペーンで記事・演習問題を1件だけ生成し、本棚に追加する。

    キャラ作成完了前（character_id未設定）の顧客でも体験できるよう、
    その場合は最初に登録されているキャラクターの口調で生成する。
    """
    if current_user.free_content_claimed:
        raise HTTPException(status_code=400, detail="無料コンテンツは既にご利用いただいています")

    if data.exam_category not in _VALID_FREE_CONTENT_EXAM_CATEGORIES:
        raise HTTPException(status_code=400, detail="exam_category は 'TOEIC' / '英検' / 'IELTS' / 'TOEFL' のいずれかを指定してください")

    character = None
    if current_user.character_id:
        character = db.query(Character).filter(Character.id == current_user.character_id).first()
    if not character:
        character = db.query(Character).order_by(Character.id).first()
    if not character:
        raise HTTPException(status_code=404, detail="キャラクターが見つかりません")

    category = f"{data.exam_category} {data.part}".strip() if data.part else data.exam_category

    if data.kind == "exercise":
        if data.exercise_format not in _VALID_EXERCISE_FORMATS:
            raise HTTPException(status_code=400, detail="exercise_format は 'multiple_choice' か 'written_response' を指定してください")
        system_prompt = build_exercise_generation_prompt(character, data.exercise_format, category, None, "normal")
    elif data.kind == "article":
        system_prompt = build_article_generation_prompt(character, "request", category, "normal")
    else:
        raise HTTPException(status_code=400, detail="kind は 'article' か 'exercise' を指定してください")

    try:
        raw = generate_text(
            system_prompt,
            [{"role": "user", "content": "上記の条件でコンテンツを生成してください。"}],
            max_tokens=4096,
        )
        result = parse_json_response(raw)
    except LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))

    article = Article(
        customer_id=current_user.id,
        character_id=character.id,
        article_type="exercise" if data.kind == "exercise" else "request",
        exercise_format=data.exercise_format if data.kind == "exercise" else None,
        exercise_category=category if data.kind == "exercise" else None,
        exercise_data=result.get("exercise_data") if data.kind == "exercise" else None,
        title=result.get("title", category),
        content=result.get("exercise_data", {}).get("instructions", "") if data.kind == "exercise" else result.get("content", ""),
        tips=result.get("tips") if data.kind == "article" else None,
        example_sentences=result.get("example_sentences") if data.kind == "article" else None,
        status="published",
        is_llm_drafted=True,
    )
    db.add(article)
    current_user.free_content_claimed = True
    db.commit()
    db.refresh(article)

    return {"id": article.id, "title": article.title, "article_type": article.article_type}


class ContentGenerateRequest(BaseModel):
    article_type: str  # request（記事）/ blog（ブログ記事）/ exercise（演習問題）
    character_id: int
    theme: Optional[str] = None  # テーマ・文法トピック・追加の出題指定など
    level: Optional[str] = None  # easy / normal / hard
    exercise_format: Optional[str] = None  # exercise時のみ：multiple_choice / written_response
    exercise_category: Optional[str] = None  # exercise時のみ：出題カテゴリ


@router.post("/admin/generate", tags=["管理者"])
def admin_generate_content(data: ContentGenerateRequest, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """管理者向け：テーマ・レベル・種類（記事／演習問題）を指定し、Anthropic APIでコンテンツの下書きを生成する。

    生成結果はそのまま保存されるわけではなく、管理者が確認・編集したうえで
    既存の /admin/ （記事作成）で保存する（半自動化であり全自動化ではない）。
    """
    character = db.query(Character).filter(Character.id == data.character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="キャラクターが見つかりません")

    if data.article_type == "exercise":
        if data.exercise_format not in _VALID_EXERCISE_FORMATS:
            raise HTTPException(status_code=400, detail="exercise_format は 'multiple_choice' か 'written_response' を指定してください")
        system_prompt = build_exercise_generation_prompt(
            character, data.exercise_format, data.exercise_category, data.theme, data.level,
        )
    elif data.article_type in ("request", "blog"):
        system_prompt = build_article_generation_prompt(character, data.article_type, data.theme or "", data.level)
    else:
        raise HTTPException(status_code=400, detail="article_type は 'request' / 'blog' / 'exercise' のいずれかを指定してください")

    try:
        raw = generate_text(
            system_prompt,
            [{"role": "user", "content": "上記の条件でコンテンツを生成してください。"}],
            max_tokens=4096,
        )
        return parse_json_response(raw)
    except LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/admin/", tags=["管理者"], status_code=status.HTTP_201_CREATED)
def admin_create_article(
    data: ArticleCreate,
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    article = Article(**data.model_dump())
    db.add(article)
    # 「依頼記事」の作成は記事依頼回数カウントの対象になるため、報酬解放チェックを行う
    if article.article_type == "request" and article.customer_id:
        customer = db.query(Customer).filter(Customer.id == article.customer_id).first()
        if customer:
            db.flush()
            check_and_unlock_rewards(db, customer)
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

    for key, val in data.model_dump(exclude_none=True).items():
        setattr(article, key, val)
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

    if notification_sent or (
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
