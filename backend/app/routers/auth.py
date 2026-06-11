import asyncio
import secrets
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.config import settings
from app.core.security import verify_password, create_access_token, hash_password, get_current_user
from app.core.intimacy import get_intimacy_settings
from app.core.rewards import check_and_unlock_rewards
from app.core.email import send_email
from app.models.customer import Customer
from pydantic import BaseModel
from pydantic import field_validator

# パスワード再発行リンクの有効期限
RESET_TOKEN_EXPIRE_MINUTES = 60

router = APIRouter(prefix="/auth", tags=["認証"])

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    is_password_reset_required: bool

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

@router.post("/login", response_model=TokenResponse)
async def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """
    ブルートフォース対策：
    - 認証失敗時に意図的に0.5秒遅延させる
    - ユーザーが存在するかどうかを区別しないエラーメッセージ
    """
    user = db.query(Customer).filter(Customer.username == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        await asyncio.sleep(0.5)  # タイミング攻撃・ブルートフォース抑止
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="ユーザー名またはパスワードが正しくありません"
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="アカウントが無効です")

    # ログインボーナス：1日1回だけ親密度ポイントを加算する（連打・連続ログインでの稼ぎを防ぐ）
    if not user.is_admin:
        today = date.today()
        if user.last_login_bonus_date != today:
            settings_row = get_intimacy_settings(db)
            user.intimacy_points = (user.intimacy_points or 0) + settings_row.points_per_login
            user.last_login_bonus_date = today
            check_and_unlock_rewards(db, user)

    token = create_access_token({"sub": str(user.id), "is_admin": user.is_admin})
    db.commit()
    return {
        "access_token": token,
        "token_type": "bearer",
        "is_password_reset_required": user.is_password_reset_required,
    }

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
    return {"message": "パスワードを再設定しました"}


@router.get("/me")
def get_me(current_user: Customer = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "is_admin": current_user.is_admin,
        "is_password_reset_required": current_user.is_password_reset_required,
        "character_id": current_user.character_id,
        "theme_config": current_user.theme_config,
        "email": current_user.email,
        "free_content_claimed": current_user.free_content_claimed,
    }
