#!/usr/bin/env python3
"""
Genera le risorse derivate dalle illustrazioni originali:
  assets/stickers/*.png        sticker scaricabili (800 px, sfondo trasparente)
  assets/qr-ca.svg             codice QR del contratto
  assets/icons/icon-192.png    icona per "aggiungi alla schermata Home"
  assets/kit/shubao-meme-kit.zip  kit per meme e social
Richiede Pillow e qrcode (pip install pillow qrcode).
Va eseguito dopo tools/og.cjs, che crea l'anteprima social e il banner per X.
"""
import io, json, zipfile
from pathlib import Path
from PIL import Image, ImageDraw
import qrcode, qrcode.image.svg

ROOT = Path(__file__).resolve().parent.parent
A = ROOT / "assets"
site = json.loads((ROOT / "tools" / "site.json").read_text(encoding="utf-8"))

STICKERS = {
    "shubao-morning": "sticker-morning-800.webp",
    "shubao-loud": "sticker-loud-800.webp",
    "shubao-crawl": "sticker-crawl-800.webp",
    "shubao-choux": "sticker-choux-800.webp",
    "shubao-basket": "shubao-basket-800.webp",
}

(A / "stickers").mkdir(exist_ok=True)
(A / "kit").mkdir(exist_ok=True)
pngs = {}
for name, src in STICKERS.items():
    im = Image.open(A / "img" / src).convert("RGBA")
    out = A / "stickers" / f"{name}.png"
    im.save(out, optimize=True)
    pngs[name] = im
    print("ok", out.relative_to(ROOT))

# Codice QR del contratto, verde scuro su bianco
qr = qrcode.QRCode(border=2, error_correction=qrcode.constants.ERROR_CORRECT_M)
qr.add_data(site["contract"])
qr.make(fit=True)
svg = qr.make_image(image_factory=qrcode.image.svg.SvgPathImage).to_string(encoding="unicode")
svg = svg.replace('fill="#000000"', 'fill="#283016"')
if "<rect" not in svg:
    svg = svg.replace("><path", '><rect width="100%" height="100%" fill="#ffffff"/><path', 1)
(A / "qr-ca.svg").write_text(svg, encoding="utf-8")
print("ok assets/qr-ca.svg")

# Icona 192 px dalla 512 px
Image.open(A / "icons" / "icon-512.png").resize((192, 192), Image.LANCZOS).save(A / "icons" / "icon-192.png", optimize=True)
print("ok assets/icons/icon-192.png")


def tg_sticker(im):
    """Sticker per Telegram: 512 px sul lato lungo, PNG trasparente."""
    s = im.copy()
    s.thumbnail((512, 512), Image.LANCZOS)
    c = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    c.alpha_composite(s, ((512 - s.width) // 2, (512 - s.height) // 2))
    b = io.BytesIO(); c.save(b, "PNG", optimize=True)
    return b.getvalue()


def pfp_frame():
    """Cornice trasparente 1024 px da sovrapporre alla propria foto profilo."""
    S = 1024
    f = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(f)
    d.ellipse((0, 0, S - 1, S - 1), outline=(236, 134, 155, 255), width=44)
    d.ellipse((40, 40, S - 41, S - 41), outline=(247, 241, 230, 255), width=10)
    paw = pngs["shubao-morning"].copy(); paw.thumbnail((330, 330), Image.LANCZOS)
    f.alpha_composite(paw, (S - paw.width - 10, S - paw.height - 10))
    b = io.BytesIO(); f.save(b, "PNG", optimize=True)
    return b.getvalue()


readme = f"""曙宝 Shubao · meme kit

Contenuto / Contents
- stickers/        PNG 800 px, sfondo trasparente / transparent background
- telegram/        PNG 512 px pronti per @Stickers su Telegram / ready for Telegram @Stickers
- x-header-1500x500.jpg   banner per X / X header
- og-*.jpg         immagini 1200x630 per i post / post images
- pfp-frame-1024.png      cornice per la foto profilo / profile picture frame
- logo-512.png     icona / icon

Le illustrazioni sono opere originali create per la community di 曙宝.
Usale liberamente per meme e post sul progetto. Non usarle per spacciarti per Everland
o per altri progetti.
The illustrations are original artwork made for the 曙宝 community. Use them freely for
memes and posts about the project. Don't use them to impersonate Everland or other projects.

Contratto ufficiale / Official contract (BNB Chain):
{site["contract"]}
Sito / Website: {site["siteUrl"]}
"""

kit = A / "kit" / "shubao-meme-kit.zip"
with zipfile.ZipFile(kit, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("LEGGIMI-README.txt", readme)
    for name in STICKERS:
        z.write(A / "stickers" / f"{name}.png", f"stickers/{name}.png")
        z.writestr(f"telegram/{name}-512.png", tg_sticker(pngs[name]))
    z.write(A / "kit" / "x-header-1500x500.jpg", "x-header-1500x500.jpg")
    for l in site["languages"]:
        z.write(A / f"og-{l}.jpg", f"og-{l}.jpg")
    z.writestr("pfp-frame-1024.png", pfp_frame())
    z.write(A / "icons" / "icon-512.png", "logo-512.png")
print(f"ok {kit.relative_to(ROOT)} ({kit.stat().st_size // 1024} KB)")
