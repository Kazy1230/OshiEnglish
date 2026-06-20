import asyncio
import logging
import secrets
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.config import settings
from app.core.character_voice import customer_display_name
from app.core.security import verify_password, create_access_token, hash_password, get_current_user
from app.core.intimacy import get_intimacy_settings
from app.core.rewards import check_and_unlock_rewards
from app.core.email import send_email
from app.core.rate_limit import enforce_rate_limit
from app.models.customer import Customer
from pydantic import BaseModel
from pydantic import field_validator

logger = logging.getLogger(__name__)

# パスワード再発行リンクの有効期限
RESET_TOKEN_EXPIRE_MINUTES = 60

# ログイン失敗によるアカウントロック設定（時間経過で自動解除）
LOGIN_MAX_ATTEMPTS = 10
LOGIN_LOCKOUT_MINUTES = 30

# 管理者向け二段階認証（メール認証コード）の有効期限
TWO_FACTOR_CODE_EXPIRE_MINUTES = 10

router = APIRouter(prefix="/auth", tags=["認証"])

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    is_password_reset_required: bool

class LoginResponse(BaseModel):
    access_token: str | None = None
    token_type: str | None = None
    is_password_reset_required: bool | None = None
    # True の場合、別途 /auth/verify-2fa への認証コード送信が必要（管理者ログイン時）
    requires_2fa: bool = False

class Verify2FARequest(BaseModel):
    username: str
    code: str


def _is_locked(user: Customer) -> bool:
    return bool(user.locked_until and user.locked_until > datetime.utcnow())


def _record_failed_attempt(db: Session, user: Customer):
    user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
    if user.failed_login_attempts >= LOGIN_MAX_ATTEMPTS:
        user.locked_until = datetime.utcnow() + timedelta(minutes=LOGIN_LOCKOUT_MINUTES)
    db.commit()


def _reset_login_security(user: Customer):
    user.failed_login_attempts = 0
    user.locked_until = None


def _apply_login_bonus(db: Session, user: Customer) -> None:
    """ログインボーナス（親密度ポイント）を1日1回付与する。"""
    if user.role == "admin":
        return
    today = date.today()
    if user.last_login_bonus_date == today:
        return

    settings_row = get_intimacy_settings(db)
    user.intimacy_points = (user.intimacy_points or 0) + settings_row.points_per_login
    user.last_login_bonus_date = today
    check_and_unlock_rewards(db, user)


def _notify_password_changed(user: Customer):
    """パスワード変更・再設定時に通知メールを送る（不正なアカウント変更の早期検知のため）。"""
    if not user.email:
        return
    send_email(
        to=user.email,
        subject="【推しEnglish】パスワードが変更されました",
        html=(
            f"<p>{user.username} 様</p>"
            "<p>このアカウントのパスワードが変更されました。</p>"
            "<p>心当たりがない場合は、お早めにサポートまでご連絡ください。</p>"
        ),
    )


def _issue_token_response(db: Session, user: Customer) -> dict:
    _apply_login_bonus(db, user)
    token = create_access_token({"sub": str(user.id), "role": user.role})
    db.commit()
    return {
        "access_token": token,
        "token_type": "bearer",
        "is_password_reset_required": user.is_password_reset_required,
    }

class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("パスワードは8文字以上にしてください")
        return v

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("パスワードは8文字以上にしてください")
        return v

@router.post("/login", response_model=LoginResponse)
async def login(request: Request, form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """
    ブルートフォース対策：
    - 認証失敗時に意図的に0.5秒遅延させる
    - ユーザーが存在するかどうかを区別しないエラーメッセージ
    - 連続10回失敗したアカウントは30分間ロックする（時間経過で自動解除）
    - 同一IPからのログイン試行回数を制限する（不審なIPアドレスからのアクセス制限）

    管理者アカウントはパスワード認証に加え、メールに送信する認証コードによる
    二段階認証（2FA）が必要（メールアドレス未設定の場合は2FAをスキップする）。
    """
    enforce_rate_limit(request, "login", limit=20, window_seconds=3600)

    # ログインはメールアドレスを使用する（メール未設定の旧アカウントはusernameでも照合する）
    user = db.query(Customer).filter(
        (Customer.email == form.username) | (Customer.username == form.username)
    ).first()

    if user and _is_locked(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ログイン試行回数が多いため、アカウントが一時的にロックされています。しばらくしてから再度お試しください"
        )

    if not user or not verify_password(form.password, user.hashed_password):
        if user:
            _record_failed_attempt(db, user)
        await asyncio.sleep(0.5)  # タイミング攻撃・ブルートフォース抑止
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="メールアドレスまたはパスワードが正しくありません"
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="アカウントが無効です")

    _reset_login_security(user)

    if user.role == "admin" and user.email:
        code = f"{secrets.randbelow(1_000_000):06d}"
        user.two_factor_code = code
        user.two_factor_code_expires = datetime.utcnow() + timedelta(minutes=TWO_FACTOR_CODE_EXPIRE_MINUTES)
        db.commit()
        send_email(
            to=user.email,
            subject="【推しEnglish】管理者ログイン認証コード",
            html=(
                f"<p>管理者ログインのための認証コードです。</p>"
                f"<p style='font-size:24px;font-weight:bold;'>{code}</p>"
                f"<p>このコードの有効期限は{TWO_FACTOR_CODE_EXPIRE_MINUTES}分です。"
                "心当たりがない場合は、このメールを無視してください。</p>"
            ),
        )
        return {"requires_2fa": True}

    if user.role == "admin" and not user.email:
        logger.warning(f"[2FA] 管理者アカウント(username={user.username})にメールアドレスが未設定のため2FAをスキップしました")

    return _issue_token_response(db, user)


@router.post("/verify-2fa", response_model=TokenResponse)
async def verify_2fa(req: Verify2FARequest, request: Request, db: Session = Depends(get_db)):
    """管理者ログインの二段階認証コードを検証し、アクセストークンを発行する。"""
    enforce_rate_limit(request, "verify-2fa", limit=20, window_seconds=3600)

    user = db.query(Customer).filter(Customer.username == req.username).first()

    if user and _is_locked(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ログイン試行回数が多いため、アカウントが一時的にロックされています。しばらくしてから再度お試しください"
        )

    valid = (
        user
        and user.two_factor_code
        and user.two_factor_code == req.code
        and user.two_factor_code_expires
        and user.two_factor_code_expires > datetime.utcnow()
    )
    if not valid:
        if user:
            _record_failed_attempt(db, user)
        await asyncio.sleep(0.5)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="認証コードが正しくないか、有効期限が切れています"
        )

    user.two_factor_code = None
    user.two_factor_code_expires = None
    _reset_login_security(user)

    return _issue_token_response(db, user)

@router.post("/change-password")
def change_password(
    req: PasswordChangeRequest,
    current_user: Customer = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not verify_password(req.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="現在のパスワードが正しくありません")
    current_user.hashed_password = hash_password(req.new_password)
    current_user.is_password_reset_required = False
    db.commit()
    _notify_password_changed(current_user)
    return {"message": "パスワードを変更しました"}

@router.post("/forgot-password")
def forgot_password(req: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """登録済みメールアドレス宛にパスワード再発行リンクを送信する。

    メールアドレスの存在有無を区別せず、常に同じメッセージを返す（ユーザー列挙対策）。
    """
    user = db.query(Customer).filter(Customer.email == req.email).first()
    if user:
        token = secrets.token_urlsafe(32)
        user.reset_token = token
        user.reset_token_expires = datetime.utcnow() + timedelta(minutes=RESET_TOKEN_EXPIRE_MINUTES)
        db.commit()

        reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        send_email(
            to=user.email,
            subject="【推しEnglish】パスワード再設定のご案内",
            html=(
                f"<p>{user.username} 様</p>"
                "<p>パスワード再設定のリクエストを受け付けました。以下のリンクから新しいパスワードを設定してください。</p>"
                f'<p><a href="{reset_url}">{reset_url}</a></p>'
                f"<p>このリンクの有効期限は{RESET_TOKEN_EXPIRE_MINUTES}分です。"
                "心当たりがない場合は、このメールを無視してください。</p>"
            ),
        )

    return {"message": "ご登録のメールアドレス宛に再設定用のリンクを送信しました（ご登録がない場合は届きません）"}


@router.post("/reset-password")
def reset_password(req: ResetPasswordRequest, db: Session = Depends(get_db)):
    """パスワード再発行リンクのトークンを検証し、新しいパスワードを設定する。"""
    user = db.query(Customer).filter(Customer.reset_token == req.token).first()
    now = datetime.utcnow()
    if not user or not user.reset_token_expires or user.reset_token_expires < now:
        raise HTTPException(status_code=400, detail="リンクが無効か、有効期限が切れています。再度パスワード再設定をお試しください")

    user.hashed_password = hash_password(req.new_password)
    user.is_password_reset_required = False
    user.reset_token = None
    user.reset_token_expires = None
    db.commit()
    _notify_password_changed(user)
    return {"message": "パスワードを再設定しました"}


@router.get("/me")
def get_me(current_user: Customer = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "display_name": customer_display_name(current_user),
        "role": current_user.role,
        "is_password_reset_required": current_user.is_password_reset_required,
        "character_id": current_user.character_id,
        "theme_config": current_user.theme_config,
        "email": current_user.email,
        "free_content_claimed": current_user.free_content_claimed,
        "character_ready_announced": current_user.character_ready_announced,
    }
