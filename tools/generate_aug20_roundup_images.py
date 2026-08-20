from __future__ import annotations

import re
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
MARKDOWN = ROOT / "src/content/roundups/texoma-weekend-roundup-august-20-23-2026.md"
OUT = ROOT / "public/images"
LOGO = OUT / "logo.jpg"

NAVY = "#06233d"
NAVY_2 = "#0c3a59"
GREEN = "#6ea51f"
WHITE = "#ffffff"
PAPER = "#fffdfa"
TEXT = "#0a2746"
MUTED = "#415266"
LINE = "#dde3e7"
ACCENTS = ["#1875b5", "#16878d", "#783594", "#e76d0b", "#4d901d"]

FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    path = FONT_BOLD if bold else FONT_REGULAR
    try:
        return ImageFont.truetype(path, size=size)
    except OSError:
        return ImageFont.load_default()


def parse_roundup() -> dict[str, list[dict[str, str]]]:
    text = MARKDOWN.read_text(encoding="utf-8")
    sections: dict[str, list[dict[str, str]]] = {}
    current: str | None = None
    for line in text.splitlines():
        m = re.match(r"^## (Thursday|Friday|Saturday|Sunday),", line)
        if m:
            current = m.group(1)
            sections[current] = []
            continue
        if not current:
            continue
        m = re.match(r"^(\d+)\. \*\*(.+?)\*\* — (.+?) — (.+)$", line)
        if not m:
            continue
        sections[current].append({
            "number": m.group(1),
            "title": m.group(2),
            "time": m.group(3),
            "venue": m.group(4),
        })
    expected = {"Thursday": 24, "Friday": 22, "Saturday": 41, "Sunday": 10}
    for day, count in expected.items():
        found = len(sections.get(day, []))
        if found != count:
            raise RuntimeError(f"{day}: expected {count} entries, parsed {found}")
    return sections


def load_logo(max_size: tuple[int, int]) -> Image.Image:
    image = Image.open(LOGO).convert("RGB")
    image.thumbnail(max_size, Image.Resampling.LANCZOS)
    mask = Image.new("L", image.size, 0)
    md = ImageDraw.Draw(mask)
    md.ellipse((0, 0, image.width - 1, image.height - 1), fill=255)
    rgba = image.convert("RGBA")
    rgba.putalpha(mask)
    return rgba


def wrap(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.ImageFont, width: int, max_lines: int = 2) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        trial = word if not current else f"{current} {word}"
        if draw.textlength(trial, font=fnt) <= width:
            current = trial
            continue
        if current:
            lines.append(current)
        current = word
        if len(lines) >= max_lines - 1:
            break
    if current and len(lines) < max_lines:
        lines.append(current)
    used_words = len(" ".join(lines).split())
    if used_words < len(words):
        last = lines[-1]
        while last and draw.textlength(last + "…", font=fnt) > width:
            last = last[:-1]
        lines[-1] = last.rstrip() + "…"
    return lines


def badge(draw: ImageDraw.ImageDraw, x: int, y: int, number: str, color: str, size: int = 34) -> None:
    draw.rounded_rectangle((x, y, x + size, y + size), radius=6, fill=color)
    f = font(max(14, int(size * 0.52)), True)
    box = draw.textbbox((0, 0), number, font=f)
    tw, th = box[2] - box[0], box[3] - box[1]
    draw.text((x + (size - tw) / 2, y + (size - th) / 2 - 2), number, font=f, fill=WHITE)


def header(draw: ImageDraw.ImageDraw, image: Image.Image, title: str, date_text: str, count: int, width: int, height: int) -> int:
    header_h = int(height * 0.18)
    draw.rectangle((0, 0, width, header_h), fill=NAVY)
    for y in range(0, header_h, 7):
        draw.line((0, y, width, y), fill="#082a49", width=1)

    logo = load_logo((int(header_h * 0.84), int(header_h * 0.84)))
    image.paste(logo, (20, (header_h - logo.height) // 2), logo)

    left = 20 + logo.width + 28
    draw.text((left, 22), "TEXOMA WEEKEND GUIDE", font=font(int(header_h * 0.13), True), fill=WHITE)
    draw.text((left, int(header_h * 0.25)), title, font=font(int(header_h * 0.27), True), fill=WHITE)
    draw.text((left, int(header_h * 0.63)), date_text, font=font(int(header_h * 0.16), True), fill=GREEN)

    bw = int(header_h * 0.78)
    bx1 = width - 18
    bx0 = bx1 - bw
    by0 = 12
    by1 = header_h + 14
    mid = (bx0 + bx1) // 2
    draw.polygon([(bx0, by0), (bx1, by0), (bx1, by1 - 22), (mid, by1), (bx0, by1 - 22)], fill="#4f8f1d")
    draw.rounded_rectangle((bx0 + 7, by0 + 7, bx1 - 7, by1 - 30), radius=7, outline="#8eb733", width=2)
    count_font = font(int(header_h * 0.32), True)
    ct = str(count)
    tw = draw.textlength(ct, font=count_font)
    draw.text((mid - tw / 2, int(header_h * 0.25)), ct, font=count_font, fill=WHITE)
    event_font = font(int(header_h * 0.13), True)
    et = "EVENTS"
    ew = draw.textlength(et, font=event_font)
    draw.text((mid - ew / 2, int(header_h * 0.62)), et, font=event_font, fill=WHITE)
    return header_h


def footer(draw: ImageDraw.ImageDraw, width: int, height: int, footer_h: int) -> None:
    y0 = height - footer_h
    draw.rectangle((0, y0, width, height), fill=NAVY)
    f1 = font(max(17, int(footer_h * 0.24)), True)
    f2 = font(max(17, int(footer_h * 0.24)), True)
    lead = "Find more events & submit your event at"
    site = "TEXOMAWEEKENDGUIDE.COM"
    lead_w = draw.textlength(lead, font=f1)
    site_w = draw.textlength(site, font=f2)
    gap = 18
    total = lead_w + gap + site_w
    x = max(20, (width - total) / 2)
    draw.text((x, y0 + footer_h * 0.28), lead, font=f1, fill=WHITE)
    draw.text((x + lead_w + gap, y0 + footer_h * 0.28), site, font=f2, fill=GREEN)


def render_day(day: str, events: list[dict[str, str]], filename: str) -> None:
    if day == "Saturday":
        width, height = 1200, 1650
        columns = 2
    else:
        width, height = 1200, 1500
        columns = 1
    footer_h = 78
    image = Image.new("RGB", (width, height), PAPER)
    draw = ImageDraw.Draw(image)
    date_map = {
        "Thursday": "THURSDAY, AUGUST 20, 2026",
        "Friday": "FRIDAY, AUGUST 21, 2026",
        "Saturday": "SATURDAY, AUGUST 22, 2026",
        "Sunday": "SUNDAY, AUGUST 23, 2026",
    }
    header_h = header(draw, image, f"{day.upper()} ROUNDUP", date_map[day], len(events), width, height)

    body_top = header_h + 10
    body_bottom = height - footer_h - 8
    draw.rounded_rectangle((16, body_top, width - 16, body_bottom), radius=20, fill=WHITE, outline="#e3e6e8", width=2)

    if columns == 1:
        left, right = 38, width - 38
        available_h = body_bottom - body_top - 22
        row_h = available_h / len(events)
        time_x = 136
        text_x = 335
        for i, event in enumerate(events):
            y = body_top + 10 + int(i * row_h)
            if i:
                draw.line((left, y, right, y), fill=LINE, width=1)
            color = ACCENTS[i % len(ACCENTS)]
            badge(draw, left + 3, y + 8, event["number"], color, 34)
            draw.text((time_x, y + 8), event["time"], font=font(21, True), fill=color)
            draw.text((text_x, y + 6), event["title"], font=font(22, True), fill=TEXT)
            draw.text((text_x, y + 33), event["venue"], font=font(16), fill=MUTED)
    else:
        split = 21
        sets = [events[:split], events[split:]]
        col_w = (width - 70) // 2
        for col, subset in enumerate(sets):
            x0 = 30 + col * (col_w + 10)
            x1 = x0 + col_w
            available_h = body_bottom - body_top - 20
            row_h = available_h / len(subset)
            for i, event in enumerate(subset):
                y = body_top + 10 + int(i * row_h)
                if i:
                    draw.line((x0 + 4, y, x1 - 4, y), fill=LINE, width=1)
                color = ACCENTS[(i + col) % len(ACCENTS)]
                badge(draw, x0 + 4, y + 7, event["number"], color, 31)
                tx = x0 + 48
                draw.text((tx, y + 5), event["time"], font=font(16, True), fill=color)
                title_lines = wrap(draw, event["title"], font(17, True), col_w - 55, 2)
                ty = y + 25
                for line in title_lines:
                    draw.text((tx, ty), line, font=font(17, True), fill=TEXT)
                    ty += 19
                draw.text((tx, min(ty + 1, y + row_h - 17)), event["venue"], font=font(12), fill=MUTED)

    footer(draw, width, height, footer_h)
    image.save(OUT / filename, "WEBP", quality=92, method=6)


def render_hero(sections: dict[str, list[dict[str, str]]]) -> None:
    width, height = 1600, 1000
    image = Image.new("RGB", (width, height), NAVY)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, width, 180), fill=NAVY)
    logo = load_logo((145, 145))
    image.paste(logo, (22, 17), logo)
    draw.text((195, 18), "TEXOMA WEEKEND GUIDE", font=font(31, True), fill=WHITE)
    draw.text((190, 50), "4-DAY ROUNDUP", font=font(78, True), fill=WHITE)
    draw.text((195, 132), "THURSDAY – SUNDAY • AUGUST 20–23, 2026", font=font(31, True), fill=GREEN)

    total = sum(len(v) for v in sections.values())
    bx0, by0, bx1, by1 = 1390, 10, 1578, 174
    draw.polygon([(bx0, by0), (bx1, by0), (bx1, by1 - 20), ((bx0 + bx1) // 2, by1), (bx0, by1 - 20)], fill="#4f8f1d")
    draw.text((1432, 29), str(total), font=font(61, True), fill=WHITE)
    draw.text((1419, 100), "EVENTS", font=font(29, True), fill=WHITE)

    panel_y = 192
    gap = 12
    panel_w = (width - 40 - 3 * gap) // 4
    days = ["Thursday", "Friday", "Saturday", "Sunday"]
    for idx, day in enumerate(days):
        x0 = 10 + idx * (panel_w + gap)
        x1 = x0 + panel_w
        draw.rounded_rectangle((x0, panel_y, x1, 925), radius=18, fill=WHITE)
        draw.rectangle((x0, panel_y, x1, panel_y + 70), fill=NAVY_2)
        day_font = font(30, True)
        dw = draw.textlength(day.upper(), font=day_font)
        draw.text((x0 + (panel_w - dw) / 2, panel_y + 10), day.upper(), font=day_font, fill=WHITE)
        count_text = f"{len(sections[day])} EVENTS"
        cf = font(18, True)
        cw = draw.textlength(count_text, font=cf)
        draw.rounded_rectangle((x0 + panel_w / 2 - cw / 2 - 10, panel_y + 47, x0 + panel_w / 2 + cw / 2 + 10, panel_y + 71), radius=10, fill=GREEN)
        draw.text((x0 + (panel_w - cw) / 2, panel_y + 48), count_text, font=cf, fill=WHITE)

        if day == "Saturday":
            draw.text((x0 + 35, panel_y + 220), "41", font=font(115, True), fill=TEXT)
            draw.text((x0 + 55, panel_y + 350), "EVENTS", font=font(42, True), fill=TEXT)
            draw.text((x0 + 34, panel_y + 465), "See the full Saturday", font=font(22, True), fill=TEXT)
            draw.text((x0 + 47, panel_y + 495), "listing below.", font=font(22, True), fill=TEXT)
            continue

        y = panel_y + 92
        max_rows = len(sections[day])
        row_h = (810 - 90) / max_rows
        for j, event in enumerate(sections[day]):
            color = ACCENTS[j % len(ACCENTS)]
            badge(draw, x0 + 12, int(y + j * row_h), event["number"], color, 25)
            title = event["title"]
            f = font(13, True)
            while draw.textlength(title, font=f) > panel_w - 55 and len(title) > 18:
                title = title[:-2].rstrip() + "…"
            draw.text((x0 + 44, int(y + j * row_h + 3)), title, font=f, fill=TEXT)

    draw.rectangle((0, 935, width, height), fill=NAVY)
    draw.text((50, 952), "Find more events & submit your event at", font=font(22, True), fill=WHITE)
    draw.text((478, 952), "TEXOMAWEEKENDGUIDE.COM", font=font(22, True), fill=GREEN)
    image.save(OUT / "texoma-weekend-roundup-august-20-23-2026.webp", "WEBP", quality=92, method=6)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    sections = parse_roundup()
    render_hero(sections)
    render_day("Thursday", sections["Thursday"], "texoma-thursday-roundup-august-20-2026.webp")
    render_day("Friday", sections["Friday"], "texoma-friday-roundup-august-21-2026.webp")
    render_day("Saturday", sections["Saturday"], "texoma-saturday-roundup-august-22-2026.webp")
    render_day("Sunday", sections["Sunday"], "texoma-sunday-roundup-august-23-2026.webp")
    print("Generated Aug. 20–23 roundup images.")


if __name__ == "__main__":
    main()
