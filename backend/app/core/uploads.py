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


# 添削提出（スピーキング）用の音声・動画。.webm はMediaRecorderの録音・録画どちらでも
# 出力されうるため両方の拡張子セットに含め、media_type_hint（フロントから明示送信）で判定を補う。
_ALLOWED_AUDIO_EXT = {".mp3", ".wav", ".m4a", ".webm", ".ogg"}
_ALLOWED_VIDEO_EXT = {".mp4", ".webm", ".mov"}
_ALLOWED_MEDIA_EXT = _ALLOWED_AUDIO_EXT | _ALLOWED_VIDEO_EXT
MAX_MEDIA_SIZE = 50 * 1024 * 1024  # 50MB


def validate_media_ext(ext: str, media_type_hint: str | None = None) -> str:
    """拡張子（と任意のヒント）から media_type ("audio" / "video") を判定する。

    対応していない拡張子の場合は400エラー。
    """
    ext = ext.lower()
    if media_type_hint == "video" and ext in _ALLOWED_VIDEO_EXT:
        return "video"
    if media_type_hint == "audio" and ext in _ALLOWED_AUDIO_EXT:
        return "audio"
    if ext in _ALLOWED_AUDIO_EXT:
        return "audio"
    if ext in _ALLOWED_VIDEO_EXT:
        return "video"
    raise HTTPException(
        status_code=400,
        detail="対応していない音声・動画形式です（mp3/wav/m4a/webm/ogg/mp4/mov のみ）",
    )
