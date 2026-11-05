#!/usr/bin/env python3
"""Builds preview/fuego.html — the same site as preview/index.html, re-branded from the designer's brand manual:
Fuego #FF6200 (orange-red) + Carbono #1A1A1A + Esencia #F5F5F5, Playfair Display (titles, brand) and Montserrat (text, UI),
logo with an orange K, a white "ulinaria" and an orange "Arte del fuego". Dark only.

It never touches the Liquid theme, the theme CSS or the theme JS: it post-processes the generated preview file.
Run:  node scripts/render/render.mjs && python3 scripts/render/brand/fuego.py
"""
import base64, io, json, os, re, subprocess, sys, tempfile
from collections import deque
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
SRC = os.path.join(ROOT, 'preview', 'index.html')
OUT = os.path.join(ROOT, 'preview', 'fuego.html')
ASSETS = os.path.join(ROOT, 'assets')

# ------------------------------------------------------------------ colours
RAMP = [(0xA8, 0x32, 0x00), (0xFF, 0x62, 0x00), (0xFF, 0x9A, 0x45)]          # dark -> Fuego -> light flame


def ramp(t):
    t = np.clip(t, 0, 1)[..., None]
    a, b, c = (np.array(x, float) for x in RAMP)
    lo = a + (b - a) * np.clip(t * 2, 0, 1)
    hi = b + (c - b) * np.clip(t * 2 - 1, 0, 1)
    return np.where(t < .5, lo, hi)


def lum(rgb):
    return (0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]) / 255.0


def webp_b64(img):
    buf = io.BytesIO(); img.save(buf, 'WEBP', quality=92, method=4)
    return base64.b64encode(buf.getvalue()).decode()


def fuego_logo():
    """K + tagline in Fuego orange (keeping the foil shading of the gold artwork), 'ulinaria' in Esencia white."""
    gold = np.array(Image.open(os.path.join(ASSETS, 'logo.webp')).convert('RGBA'), float)
    cream = np.array(Image.open(os.path.join(ASSETS, 'logo-cream.webp')).convert('RGBA'), float)
    alpha = cream[..., 3]
    h, w = alpha.shape
    mask = alpha > 40
    lab = np.zeros((h, w), int); comps = []
    for y in range(h):
        for x in range(w):
            if mask[y, x] and not lab[y, x]:
                cid = len(comps) + 1; q = deque([(y, x)]); lab[y, x] = cid; pts = []
                while q:
                    cy, cx = q.popleft(); pts.append((cy, cx))
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = cy + dy, cx + dx
                            if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not lab[ny, nx]:
                                lab[ny, nx] = cid; q.append((ny, nx))
                comps.append(pts)
    areas = [len(p) for p in comps]; kid = int(np.argmax(areas)) + 1
    out = np.zeros((h, w, 4), float)
    orange = ramp(0.5 + (lum(gold[..., :3]) - 0.6) * 1.3)
    white = np.array([245, 245, 245], float)
    for i, pts in enumerate(comps, 1):
        cy = np.mean([p[0] for p in pts]); cx = np.mean([p[1] for p in pts])
        use_orange = (i == kid) or cx < 200 or cy > 232          # K (and the flame inside it), the rule and "Arte del fuego"
        ys = np.array([p[0] for p in pts]); xs = np.array([p[1] for p in pts])
        out[ys, xs, :3] = orange[ys, xs] if use_orange else white
    out[..., 3] = alpha
    # soften the cut-out edge pixels (alpha may be partial there)
    return Image.fromarray(out.astype('uint8'), 'RGBA')


def fuego_mark():
    g = np.array(Image.open(os.path.join(ASSETS, 'logo-mark.webp')).convert('RGBA'), float)
    out = g.copy(); out[..., :3] = ramp(0.5 + (lum(g[..., :3]) - 0.6) * 1.3)
    return Image.fromarray(out.astype('uint8'), 'RGBA')


def hue_shift(png_or_webp_bytes, deg=-22, sat=1.12):
    im = Image.open(io.BytesIO(png_or_webp_bytes)).convert('RGB')
    hsv = np.array(im.convert('HSV'), int)
    hsv[..., 0] = (hsv[..., 0] + int(deg * 255 / 360)) % 256
    hsv[..., 1] = np.clip(hsv[..., 1] * sat, 0, 255)
    return Image.fromarray(hsv.astype('uint8'), 'HSV').convert('RGB')


def retint_video(b):
    with tempfile.TemporaryDirectory() as d:
        a, o = os.path.join(d, 'in.mp4'), os.path.join(d, 'out.mp4')
        open(a, 'wb').write(b)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', a, '-vf', 'hue=h=-24:s=1.12', '-an', '-c:v', 'libx264', '-crf', '28',
                        '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', o], check=True)
        return open(o, 'rb').read()


# ------------------------------------------------------------------ css/html replacements
HEX = {  # gold -> Fuego, warm blacks/ivory -> neutral Carbono/Esencia
    'e2c36b': 'ff6200', 'f3e2a6': 'ff9a4d', 'd0a648': 'e05400', 'bc8f2f': 'd94f00', 'f0d684': 'ff8a3d', 'b8913a': 'd94f00',
    'e9cf85': 'ff8a3d', 'b58a35': 'e65a00', '8a6420': 'a33a00', '9a7222': 'b84300', 'f6ebc3': 'ffd2b0', 'eddb9b': 'ffc08a',
    '97701f': 'a33a00', '6b4f15': '6b2a00', 'c9a24a': 'ff6200', 'c79a3a': 'ff6200',
    '0d0c0a': '0e0e0e', '16130f': '1a1a1a', '080706': '080808', 'f3ebd9': 'f5f5f5', 'bdb29a': 'b8b8b8', '1a1405': 'ffffff',
    '120b07': '111111', '2a180d': '1f1f1f', '3a2314': '262626', '1b120b': '141414', '1a110b': '141414', '1a0f09': '121212',
    '4e2f1b': '2b2b2b', '64402a': '3a3a3a', '82583a': '4a4a4a', 'fff7e6': 'f5f5f5', '3a2616': '262626', '1b1210': '141414',
}
RGBA = {
    'rgba(226,195,107': 'rgba(255,98,0', 'rgba(208,166,72': 'rgba(224,84,0', 'rgba(188,143,47': 'rgba(217,79,0',
    'rgba(255,235,205': 'rgba(255,255,255', 'rgba(243,235,217': 'rgba(245,245,245', 'rgba(255,245,225': 'rgba(255,255,255',
    'rgba(255,244,214': 'rgba(255,255,255', 'rgba(255,226,188': 'rgba(255,255,255', 'rgba(13,12,10': 'rgba(14,14,14',
    'rgba(22,19,14': 'rgba(26,26,26', 'rgba(20,18,14': 'rgba(26,26,26', 'rgba(20,13,8': 'rgba(20,20,20', 'rgba(24,16,10': 'rgba(20,20,20',
    'rgba(16,10,6': 'rgba(10,10,10', 'rgba(26,20,5': 'rgba(255,255,255',
}


def recolor(text):
    text = re.sub(r'#([0-9a-fA-F]{6})\b', lambda m: '#' + HEX.get(m.group(1).lower(), m.group(1)), text)
    for a, b in RGBA.items():
        text = text.replace(a, b)
    return text


FUEGO_CSS = r'''
/* ===== Fuego brand (from the designer's brand manual) — applied only to this file ===== */
:root{
  --font-display:"Playfair Display",Georgia,serif;
  --font-heading:"Playfair Display",Georgia,serif;
  --font-body:"Montserrat",system-ui,sans-serif;
  --font-label:"Montserrat",system-ui,sans-serif;
}
:root[data-theme="dark"],:root[data-theme="dark"] .tone-dark{
  color-scheme:dark;
  --bg-base:#0E0E0E; --bg-raised:#1A1A1A; --bg-deep:#080808; --tint:rgba(255,255,255,.04);
  --text:#F5F5F5; --text-muted:#B8B8B8; --text-accent:#FF6200;
  --accent:#FF6200; --accent-hi:#FF8A3D; --accent-lo:#E05400; --ring:rgba(255,98,0,.5); --accent-wash:rgba(255,98,0,.14);
  --brand:#FF6200; --brand-grad:linear-gradient(120deg,#E05400,#FF6200 50%,#FF8A3D);
  --brand-foil:linear-gradient(120deg,#C94A00 0%,#FF8A3D 30%,#FF6200 55%,#FFB070 80%,#E05400 100%); --on-brand:#FFFFFF;
  --border:rgba(245,245,245,.14); --line:rgba(245,245,245,.14); --border-accent:rgba(255,98,0,.55);
  --panel:rgba(255,255,255,.05); --panel-2:rgba(255,255,255,.09); --glass:rgba(14,14,14,.86);
  --reserve-bg:linear-gradient(90deg,rgba(255,98,0,.12),transparent 70%); --arch:#FF6200;
}
body{font-size:16.5px;line-height:1.7;font-weight:400}
h1,h2{font-weight:500;letter-spacing:-.01em}
h3,h4{font-weight:600}
h1 em,h2 em,h3 em,.hero__copy em,.tagline,.hero__sub em{font-style:italic;font-weight:500}
.eyebrow,.btn,.chip,.tier-badge,.app-tab,.arrow-link,.text-link,.label{font-weight:600}
.eyebrow{letter-spacing:.18em}
[data-theme-toggle],.theme-toggle{display:none!important}
::selection{background:#FF6200;color:#fff}
h1 em,h2 em,.hero__copy h1 em,.page-head h1 em,.cta-banner h2 em{color:var(--accent)!important;font-style:italic!important}
:root[data-theme="dark"] .page-head__bg::before,:root[data-theme="dark"] .cta-banner__bg::before{opacity:0}
@media (max-width:760px){
  body:has(.hero) .site-header:not(.is-stuck) .logo,body:has(.page-head) .site-header:not(.is-stuck) .logo{filter:none}
}
'''


def main():
    html = open(SRC, encoding='utf-8').read()
    m = re.search(r'(<script type="application/json" id="kx-assets">)(.*?)(</script>)', html, re.S)
    assets = json.loads(m.group(2))

    # --- brand artwork
    logo = webp_b64(fuego_logo())
    assets['logo.webp'] = logo
    assets['logo-cream.webp'] = logo
    assets['logo-mark.webp'] = webp_b64(fuego_mark())
    for k in ('photo-air-steak-dark.webp', 'photo-air-steak-dark-m.webp', 'video-hero-dark-poster.webp'):
        if k in assets:
            assets[k] = webp_b64(hue_shift(base64.b64decode(assets[k])))
    if 'video-hero-dark.mp4' in assets:
        assets['video-hero-dark.mp4'] = base64.b64encode(retint_video(base64.b64decode(assets['video-hero-dark.mp4']))).decode()

    head, tail = html[:m.start()], html[m.end():]
    head, tail = recolor(head), recolor(tail)
    html = head + m.group(1) + json.dumps(assets, separators=(',', ':')) + m.group(3) + tail

    # --- fonts, theme (dark only, own storage key), brand css
    html = re.sub(r'<link href="https://fonts\.googleapis\.com/css2\?[^"]*" rel="stylesheet">',
                  '<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&display=swap" rel="stylesheet">', html, count=1)
    html = html.replace("localStorage.getItem('kx-theme') || (window.matchMedia && matchMedia('(max-width:760px)').matches ? 'dark' : 'light')", "'dark'")
    html = html.replace("'kx-theme'", "'kx-theme-fuego'")
    html = html.replace('</head>', '<style id="fuego-brand">' + FUEGO_CSS + '</style></head>', 1)
    html = html.replace('<meta name="theme-color" content="#0E0E0E">', '<meta name="theme-color" content="#0E0E0E">')
    open(OUT, 'w', encoding='utf-8').write(html)
    print('wrote', OUT, round(len(html) / 1024), 'KB')


if __name__ == '__main__':
    main()
