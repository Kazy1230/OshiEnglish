import io

from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError

# 拡張子の偽装（例: 実行可能ファイルに .png を付けてアップロード）を防ぐため、
# 拡張子チェックに加えて実際の画像データであることを検証する。
_PIL_FORMAT_TO_EXT = {
    "PNG": {".png"},
    "JPEG": {".jpg", ".jpeg"},
    "WEBP": {".webp"},
}


def validate_image_content(contents: bytes, ext: str) -> None:
    """アップロードされたバイト列が、拡張子に対応する実際の画像データであることを検証する。

    検証に失敗した場合は400エラーを返す。
    """
    try:
        with Image.open(io.BytesIO(contents)) as img:
            img.verify()
            fmt = img.format
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail="画像ファイルとして読み込めません")

    if fmt not in _PIL_FORMAT_TO_EXT or ext not in _PIL_FORMAT_TO_EXT[fmt]:
        raise HTTPException(status_code=400, detail="ファイルの内容が拡張子と一致しません")
