"""Render campaign pieces (JSON) to Instagram-ready JPGs with headless Chromium.

usage: python3 -I render.py pieces.json out_dir [piece_id ...]
Keep each JPG under ~200 KB: larger story frames have failed Instagram publishing.
"""
import html, json, os, subprocess, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.environ.get("CRAVES_ART_DIR", "/tmp/craves-campaign-art")
REPO = os.path.abspath(os.path.join(HERE, "../../../.."))
SRC = os.path.join(REPO, "apps/customer-web-next/public/landing-v20/images")
ART_FILES = {"curry": "curry.png", "dosa": "dosa.png", "cook-pot": "story-grid/cook-pot.png",
             "cook-fresh-pot": "story-grid/cook-fresh-pot.png", "prep": "story-grid/prep-1.png",
             "pack-delivery": "story-grid/pack-delivery.png", "tomato": "chef-letters/tomato.png",
             "carrot": "chef-letters/carrot.png", "onion": "chef-letters/onion.png", "potato": "chef-letters/potato.png",
             "made-with-love": "made-with-love-sticker.png", "feel-like-home": "feel-like-home-sticker.png",
             "logo": "craves-logo.png", "wordmark": "craves-wordmark-white.png"}


def prepare_art():
    """Crop the brand illustrations to their visible area once per machine."""
    os.makedirs(ART, exist_ok=True)
    for name, rel in ART_FILES.items():
        out = os.path.join(ART, name + ".png")
        if os.path.exists(out):
            continue
        im = Image.open(os.path.join(SRC, rel)).convert("RGBA")
        box = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
        if box:
            im = im.crop(box)
        im.thumbnail((1200, 1200))
        im.save(out)
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
SIZE = {"post": (1080, 1350), "story": (1080, 1920)}
SCENES = {"cook-pot", "cook-fresh-pot", "prep", "pack-delivery"}  # illustrations with white backgrounds
EDGE = {"curry": "left", "dosa": "right"}  # half plates that bleed off an edge
RED_LAYOUTS = {"cover", "cta"}

CSS = """
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600;700&family=Noto+Sans+Telugu:wght@500;700;800&display=block');
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:%(w)dpx;height:%(h)dpx;overflow:hidden}
body{font-family:'Inter','Noto Sans Telugu','Noto Color Emoji',sans-serif;position:relative}
.red{background:#F62E18;color:#fff}
.light{background:#F1F3F5;color:#1A1A1A}
.top{position:absolute;left:72px;right:72px;top:%(top)dpx;display:flex;justify-content:space-between;align-items:center}
.top img{height:56px}
.light .top img{height:88px;border-radius:20px}
.count{font:600 28px 'Inter';opacity:.8}
.main{position:absolute;left:72px;right:72px;top:%(main_top)dpx;bottom:%(main_bottom)dpx;display:flex;flex-direction:column;gap:28px}
.kicker{font:700 30px 'Plus Jakarta Sans','Noto Sans Telugu';letter-spacing:.06em;text-transform:uppercase}
.red .kicker{color:#fff;opacity:.92}
.light .kicker{color:#C92716}
.headline{font-family:'Plus Jakarta Sans','Noto Sans Telugu','Noto Color Emoji';font-weight:800;line-height:1.08;letter-spacing:-.01em}
.body{font-weight:500;line-height:1.35}
.red .body{font-weight:600}
ul{list-style:none;display:flex;flex-direction:column;gap:22px}
li{display:flex;gap:22px;align-items:flex-start;font-weight:600;line-height:1.25}
li .dot{flex:0 0 auto;width:1.25em;height:1.25em;border-radius:50%%;background:#F62E18;color:#fff;font:800 .7em 'Inter';display:flex;align-items:center;justify-content:center;margin-top:.02em}
.qa-a{border-left:8px solid #F62E18;padding-left:28px}
.art{position:absolute;pointer-events:none}
.scene{background:#fff;border-radius:36px;padding:18px;box-shadow:0 18px 40px rgba(0,0,0,.18)}
.scene img{display:block;width:100%%;border-radius:24px}
.foot{position:absolute;left:72px;right:72px;bottom:%(foot_bottom)dpx;font:500 26px 'Inter';line-height:1.3}
.light .foot{color:#4A4A4A}
.red .foot span{background:#fff;color:#1A1A1A;padding:8px 16px;border-radius:12px;display:inline-block}
.fit{overflow:hidden}
"""

FIT_JS = """
<script>
document.fonts.ready.then(()=>{
  const main=document.querySelector('.main');
  const parts=[...main.querySelectorAll('[data-size]')];
  let scale=1;
  const apply=()=>parts.forEach(p=>p.style.fontSize=(p.dataset.size*scale)+'px');
  apply();
  while((main.scrollHeight>main.clientHeight||main.scrollWidth>main.clientWidth)&&scale>0.45){scale-=0.03;apply();}
  document.body.dataset.scale=scale.toFixed(2);
  document.title='ready';
});
</script>
"""


def esc(s):
    return html.escape(s or "")


def art_html(key, fmt, layout, w, h, has_sticker):
    if not key or key in ("none", "logo"):
        return ""
    src = f"file://{ART}/{key}.png"
    if key in EDGE:
        flip = "transform:scaleX(-1);" if EDGE[key] == "left" else ""
        width = 300 if fmt == "post" else 360
        bottom = -40 if fmt == "post" else 250
        return f'<img class="art" style="right:-30px;bottom:{bottom}px;width:{width}px;{flip}" src="{src}">'
    if key in SCENES:
        width = 760 if fmt == "post" else 900
        bottom = 96 if fmt == "post" else (380 if not has_sticker else 380)
        if fmt == "story" and has_sticker:
            return ""  # sticker area takes the space
        return f'<div class="art scene" style="left:{(w - width) // 2}px;bottom:{bottom}px;width:{width}px"><img src="{src}"></div>'
    # characters and stickers
    width = 330 if fmt == "post" else 340
    bottom = 70 if fmt == "post" else (380 if not has_sticker else 1500)
    if fmt == "story" and has_sticker:
        return f'<img class="art" style="right:56px;top:250px;width:260px" src="{src}">'
    return f'<img class="art" style="right:48px;bottom:{bottom}px;width:{width}px" src="{src}">'


def slide_html(piece, i, slide, fmt):
    w, h = SIZE[fmt]
    layout = slide.get("layout", "statement")
    theme = "red" if layout in RED_LAYOUTS else "light"
    has_sticker = fmt == "story" and slide.get("sticker", "none") != "none"
    art = slide.get("art", "none")
    scene = art in SCENES and not has_sticker
    big = fmt == "story"
    # vertical budget
    top = 72 if fmt == "post" else 250
    main_top = top + 120
    plain = art in ("none", "logo")
    if fmt == "post":
        main_bottom = 560 if scene else (200 if plain else 470)
    else:
        main_bottom = 760 if has_sticker else (900 if scene else (380 if plain else 1000))
    if slide.get("footnote"):
        main_bottom = max(main_bottom, 260 if fmt == "post" else 440)
    foot_bottom = (72 if fmt == "post" else 360) if not scene else (40 if fmt == "post" else 330)
    if scene and slide.get("footnote"):
        foot_bottom = 40 if fmt == "post" else 300
    css = CSS % dict(w=w, h=h, top=top, main_top=main_top, main_bottom=main_bottom, foot_bottom=foot_bottom)

    hl = slide.get("headline", "")
    if layout in ("cover", "cta"):
        hsize = 112 if len(hl) <= 28 else 96 if len(hl) <= 45 else 84
    else:
        hsize = 96 if len(hl) <= 40 else 84
    if big:
        hsize = int(hsize * 1.2)
    bsize = 60 if big else 48
    parts = []
    if slide.get("kicker"):
        parts.append(f'<div class="kicker" data-size="{32 if big else 30}">{esc(slide["kicker"])}</div>')
    if layout == "qa":
        parts.append(f'<div class="headline" data-size="{hsize}">{esc(hl)}</div>')
        if slide.get("body"):
            parts.append(f'<div class="body qa-a" data-size="{bsize + 4}">{esc(slide["body"])}</div>')
    else:
        parts.append(f'<div class="headline" data-size="{hsize}">{esc(hl)}</div>')
        if slide.get("body"):
            parts.append(f'<div class="body" data-size="{bsize}">{esc(slide["body"])}</div>')
    items = slide.get("items") or []
    if items:
        lis = "".join(f'<li><span class="dot">&#10003;</span><span>{esc(t)}</span></li>' for t in items)
        parts.append(f'<ul data-size="{bsize + 2}">{lis}</ul>')
    logo = "wordmark" if theme == "red" else "logo"
    n = len(piece["slides"])
    count = f'<div class="count">{i}/{n}</div>' if piece["kind"] == "carousel" else ""
    foot_style = "" if art in ("none", "logo") or scene else ' style="right:380px"'
    foot = f'<div class="foot"{foot_style}><span>{esc(slide["footnote"])}</span></div>' if slide.get("footnote") else ""
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{css}</style></head>
<body class="{theme}"><div class="top"><img src="file://{ART}/{logo}.png">{count}</div>
<div class="main" style="{'justify-content:center' if art in ('none', 'logo') else ''}">{''.join(parts)}</div>{art_html(art, fmt, layout, w, h, has_sticker)}{foot}{FIT_JS}</body></html>"""


def render(pieces, out, only=()):
    prepare_art()
    out = os.path.abspath(out)
    os.makedirs(out, exist_ok=True)
    made = []
    for p in pieces:
        if only and p["id"] not in only:
            continue
        fmt = "story" if p["kind"] == "story" else "post"
        w, h = SIZE[fmt]
        d = os.path.join(out, p["id"])
        os.makedirs(d, exist_ok=True)
        for i, s in enumerate(p["slides"], 1):
            base = os.path.join(d, f'{p["id"]}-{i:02d}')
            with open(base + ".html", "w", encoding="utf-8") as f:
                f.write(slide_html(p, i, s, fmt))
            subprocess.run([CHROME, "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
                            "--allow-file-access-from-files", f"--window-size={w},{h + 300}", "--virtual-time-budget=8000",
                            f"--screenshot={base}.png", f"file://{base}.html"],
                           check=True, capture_output=True, timeout=120)
            im = Image.open(base + ".png").convert("RGB")
            assert im.width == w and im.height >= h, im.size  # headless viewport is shorter than the window
            im = im.crop((0, 0, w, h))
            im.save(base + ".jpg", quality=80, optimize=True)
            os.remove(base + ".png")
            made.append(base + ".jpg")
    return made


if __name__ == "__main__":
    data = json.load(open(sys.argv[1], encoding="utf-8"))
    pieces = data["pieces"] if isinstance(data, dict) else data
    for m in render(pieces, sys.argv[2], set(sys.argv[3:])):
        print(m)
