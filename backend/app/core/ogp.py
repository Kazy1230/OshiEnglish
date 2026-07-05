"""URLからOGPメタデータを取得するユーティリティ。"""
import re
from html.parser import HTMLParser
from typing import Optional
import httpx


class _OGPParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title: Optional[str] = None
        self.description: Optional[str] = None
        self.image: Optional[str] = None
        self._in_title = False
        self._title_buf: list[str] = []

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        if tag == "title":
            self._in_title = True
        if tag == "meta":
            prop = attrs_dict.get("property") or attrs_dict.get("name") or ""
            content = attrs_dict.get("content", "")
            if prop == "og:title" and not self.title:
                self.title = content
            elif prop == "og:description" and not self.description:
                self.description = content
            elif prop == "og:image" and not self.image:
                self.image = content
            elif prop in ("description", "twitter:description") and not self.description:
                self.description = content
            elif prop == "twitter:image" and not self.image:
                self.image = content

    def handle_data(self, data):
        if self._in_title:
            self._title_buf.append(data)

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
            if not self.title and self._title_buf:
                self.title = "".join(self._title_buf).strip()


def detect_content_type(url: str) -> str:
    u = url.lower()
    if "youtube.com" in u or "youtu.be" in u:
        return "youtube"
    if "twitter.com" in u or "x.com" in u:
        return "x"
    if "instagram.com" in u:
        return "instagram"
    if "threads.net" in u:
        return "threads"
    if "tiktok.com" in u:
        return "tiktok"
    if "note.com" in u or "note.mu" in u:
        return "note"
    return "other"


def _youtube_oembed(url: str) -> Optional[dict]:
    try:
        r = httpx.get(
            "https://www.youtube.com/oembed",
            params={"url": url, "format": "json"},
            timeout=6,
            headers={"User-Agent": "ManaVillage/1.0"},
        )
        if r.status_code == 200:
            data = r.json()
            return {
                "title": data.get("title"),
                "description": None,
                "thumbnail_url": data.get("thumbnail_url"),
            }
    except Exception:
        pass
    return None


def fetch_ogp(url: str) -> dict:
    """URLからtitle・description・thumbnail_urlを取得して返す。失敗時はURLをtitleとして返す。"""
    content_type = detect_content_type(url)

    if content_type == "youtube":
        result = _youtube_oembed(url)
        if result:
            return result

    try:
        r = httpx.get(
            url,
            timeout=8,
            follow_redirects=True,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; ManaVillage/1.0; +https://manavillage.online)",
                "Accept": "text/html",
            },
        )
        if r.status_code == 200:
            parser = _OGPParser()
            parser.feed(r.text[:50000])
            return {
                "title": parser.title or url,
                "description": parser.description,
                "thumbnail_url": parser.image,
            }
    except Exception:
        pass

    return {"title": url, "description": None, "thumbnail_url": None}


def extract_youtube_id(url: str) -> Optional[str]:
    patterns = [
        r"youtube\.com/watch\?v=([A-Za-z0-9_-]{11})",
        r"youtu\.be/([A-Za-z0-9_-]{11})",
        r"youtube\.com/shorts/([A-Za-z0-9_-]{11})",
        r"youtube\.com/embed/([A-Za-z0-9_-]{11})",
    ]
    for pat in patterns:
        m = re.search(pat, url)
        if m:
            return m.group(1)
    return None


def extract_tweet_id(url: str) -> Optional[str]:
    m = re.search(r"(?:twitter|x)\.com/\w+/status/(\d+)", url)
    return m.group(1) if m else None
