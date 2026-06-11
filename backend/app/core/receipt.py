import io
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas

FONT_NAME = "HeiseiKakuGo-W5"
pdfmetrics.registerFont(UnicodeCIDFont(FONT_NAME))

SERVICE_NAME = "Oshi English（推しEnglish）"


def format_amount(amount_total: int | None, currency: str | None) -> str:
    """Stripeの金額（最小通貨単位）を表示用文字列に変換する。JPYは小数点を持たない。"""
    if amount_total is None:
        return "-"
    currency = (currency or "jpy").lower()
    if currency == "jpy":
        return f"¥{amount_total:,}"
    return f"{amount_total / 100:,.2f} {currency.upper()}"


def generate_receipt_pdf(
    *,
    order_id: int,
    issued_at: datetime,
    addressee: str,
    description: str,
    amount_total: int | None,
    currency: str | None,
    payment_method: str,
) -> bytes:
    """領収書・請求書PDFをサーバーサイドで生成する。

    記載内容: 発行日 / サービス名 / 購入内容・金額 / 宛名（ニックネーム） / 支払い方法
    """
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    x_left = 25 * mm
    x_right = width - 25 * mm
    y = height - 30 * mm

    # タイトル
    c.setFont(FONT_NAME, 22)
    c.drawCentredString(width / 2, y, "領収書 / 請求書")
    y -= 14 * mm

    # 発行日（右寄せ）
    c.setFont(FONT_NAME, 10)
    c.drawRightString(x_right, y, f"発行日: {issued_at.strftime('%Y年%m月%d日')}")
    c.drawRightString(x_right, y - 6 * mm, f"管理番号: No.{order_id:06d}")
    y -= 20 * mm

    # 宛名
    c.setFont(FONT_NAME, 14)
    c.drawString(x_left, y, f"{addressee} 様")
    c.line(x_left, y - 2 * mm, x_left + 80 * mm, y - 2 * mm)
    y -= 18 * mm

    # 但し書き
    c.setFont(FONT_NAME, 11)
    c.drawString(x_left, y, "下記の通り、ご請求金額を領収いたしました。")
    y -= 14 * mm

    # 金額
    c.setFont(FONT_NAME, 12)
    c.drawString(x_left, y, "ご請求金額")
    c.setFont(FONT_NAME, 20)
    c.drawString(x_left + 35 * mm, y - 1 * mm, f"{format_amount(amount_total, currency)}（税込）")
    y -= 6 * mm
    c.line(x_left, y, x_right, y)
    y -= 12 * mm

    # 購入内容テーブル
    c.setFont(FONT_NAME, 11)
    c.drawString(x_left, y, "購入内容")
    c.drawRightString(x_right, y, "金額")
    y -= 4 * mm
    c.line(x_left, y, x_right, y)
    y -= 8 * mm

    c.setFont(FONT_NAME, 10)
    c.drawString(x_left, y, description)
    c.drawRightString(x_right, y, format_amount(amount_total, currency))
    y -= 4 * mm
    c.line(x_left, y, x_right, y)
    y -= 16 * mm

    # 支払い方法
    c.setFont(FONT_NAME, 11)
    c.drawString(x_left, y, f"支払い方法: {payment_method}")
    y -= 20 * mm

    # 発行者情報
    c.setFont(FONT_NAME, 11)
    c.drawString(x_left, y, "【発行者】")
    y -= 6 * mm
    c.setFont(FONT_NAME, 10)
    c.drawString(x_left, y, SERVICE_NAME)

    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer.read()
