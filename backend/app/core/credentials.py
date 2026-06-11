import secrets
import string


def generate_temp_password(length: int = 12) -> str:
    """推測されにくい一時パスワードを生成する（英大小文字・数字・一部記号）"""
    alphabet = string.ascii_letters + string.digits + "!@#%"
    while True:
        pwd = "".join(secrets.choice(alphabet) for _ in range(length))
        # 最低限の複雑さ（大文字・小文字・数字を1つ以上）を保証
        if any(c.islower() for c in pwd) and any(c.isupper() for c in pwd) and any(c.isdigit() for c in pwd):
            return pwd


def generate_username(prefix: str = "user") -> str:
    """衝突しにくいアカウント名を生成する（決済完了後の自動アカウント発行用）"""
    return f"{prefix}_{secrets.token_hex(4)}"
