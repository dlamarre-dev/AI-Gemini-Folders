"""
generate_af_icons.py
Generates icon16.png, icon48.png, icon128.png for AI Folders using Pillow.

Design: multicolor gradient background (blue→green→orange→cyan) with a
rounded-square shape and two white Gemini-style 4-pointed stars — one in the
top-right quadrant, one in the bottom-left — matching the logo spec.

Requires: pip install pillow
"""
import os, sys, math

OUT_DIR = os.path.join('extensions', 'ai-folders')
SIZES   = [16, 48, 128]


def lerp_color(c1, c2, t):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))


def gradient_pixel(x, y, w, h):
    """Diagonal gradient: blue → teal → orange → cyan."""
    stops = [
        (0.00, (66,  133, 244)),   # Google blue  #4285F4
        (0.33, (16,  163, 127)),   # ChatGPT green #10a37f
        (0.66, (201, 100,  66)),   # Claude orange #C96442
        (1.00, (34,  184, 205)),   # Perplexity teal #22B8CD
    ]
    t = (x / w + y / h) / 2        # diagonal blend 0→1
    for i in range(len(stops) - 1):
        t0, c0 = stops[i]
        t1, c1 = stops[i + 1]
        if t <= t1:
            local = (t - t0) / (t1 - t0)
            return lerp_color(c0, c1, local)
    return stops[-1][1]


def make_rounded_mask(size, radius):
    from PIL import Image, ImageDraw
    mask = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([(0, 0), (size - 1, size - 1)], radius=radius, fill=255)
    return mask


def star_points(cx, cy, outer, inner, n=4, angle_offset=0):
    """Return (x,y) polygon points for a smooth n-pointed star."""
    pts = []
    for i in range(n * 2):
        angle = math.radians(angle_offset + i * 180 / n)
        r = outer if i % 2 == 0 else inner
        pts.append((cx + r * math.sin(angle), cy - r * math.cos(angle)))
    return pts


def make_icon(size):
    from PIL import Image, ImageDraw

    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    px  = img.load()

    # Draw gradient
    for y in range(size):
        for x in range(size):
            r, g, b = gradient_pixel(x, y, size, size)
            px[x, y] = (r, g, b, 255)

    # Apply rounded corners
    radius = max(2, size // 5)
    mask   = make_rounded_mask(size, radius)
    img.putalpha(mask)

    draw = ImageDraw.Draw(img)

    # Star size scales with icon
    star_outer = size * 0.195
    star_inner = size * 0.065

    # Top-right star  (centre at ~69%, 27% of icon)
    cx1, cy1 = size * 0.685, size * 0.265
    pts1 = star_points(cx1, cy1, star_outer, star_inner)
    draw.polygon(pts1, fill=(255, 255, 255, 242))

    # Bottom-left star (centre at ~31%, 73%)
    cx2, cy2 = size * 0.315, size * 0.735
    pts2 = star_points(cx2, cy2, star_outer, star_inner)
    draw.polygon(pts2, fill=(255, 255, 255, 242))

    return img


def main():
    try:
        from PIL import Image  # noqa: F401
    except ImportError:
        print('Pillow not found. Install it with:  pip install pillow')
        sys.exit(1)

    os.makedirs(OUT_DIR, exist_ok=True)

    for size in SIZES:
        img      = make_icon(size)
        out_path = os.path.join(OUT_DIR, f'icon{size}.png')
        img.save(out_path, 'PNG')
        print(f'  OK  {out_path}  ({size}×{size})')

    print(f'\nDone — {len(SIZES)} icons written to {OUT_DIR}/')


if __name__ == '__main__':
    main()
