"""Generate extension icons: blue rounded square with white あ and ✨ sparkle."""

from PIL import Image, ImageDraw, ImageFont
import os

SIZES = [16, 48, 128]
BG_COLOR = (74, 108, 247)  # #4a6cf7 — extension accent blue
TEXT_COLOR = (255, 255, 255)
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "public", "icons")

JP_FONT_PATHS = [
    "C:/Windows/Fonts/YuGothB.ttc",
    "C:/Windows/Fonts/YuGothM.ttc",
    "C:/Windows/Fonts/msgothic.ttc",
    "C:/Windows/Fonts/meiryo.ttc",
]
EMOJI_FONT_PATHS = [
    "C:/Windows/Fonts/seguiemj.ttf",
    "C:/Windows/Fonts/seguisym.ttf",
]


def find_font(paths: list[str], size: int) -> ImageFont.FreeTypeFont:
    for fp in paths:
        if os.path.exists(fp):
            try:
                return ImageFont.truetype(fp, size)
            except Exception:
                continue
    return ImageFont.load_default()


def generate_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded rectangle background
    radius = max(2, size // 8)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=BG_COLOR)

    # Draw あ — nudged slightly right/down to balance with sparkle
    jp_font = find_font(JP_FONT_PATHS, int(size * 0.6))
    bbox = draw.textbbox((0, 0), "あ", font=jp_font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - tw) / 2 - bbox[0] + size * 0.08
    y = (size - th) / 2 - bbox[1] + size * 0.08
    draw.text((x, y), "あ", fill=TEXT_COLOR, font=jp_font)

    # Draw ✨ sparkle in the top-left
    if size >= 48:
        sparkle_font = find_font(EMOJI_FONT_PATHS, int(size * 0.3))
        draw.text((size * 0.04, size * 0.06), "\u2728", font=sparkle_font, embedded_color=True)
    elif size == 16:
        # Hand-drawn 4-point star at 16px for clarity
        star_color = (255, 255, 200)
        cx, cy = 3, 4
        draw.line([(cx, cy - 2), (cx, cy + 2)], fill=star_color, width=1)
        draw.line([(cx - 2, cy), (cx + 2, cy)], fill=star_color, width=1)
        draw.point((cx, cy), fill=(255, 255, 255))

    return img


if __name__ == "__main__":
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    for size in SIZES:
        icon = generate_icon(size)
        path = os.path.join(OUTPUT_DIR, f"icon-{size}.png")
        icon.save(path)
        print(f"Created {path} ({size}x{size})")
