#!/usr/bin/env python3
"""
Genera il sito 曙宝 Shubao a partire da:
  tools/template.html  modello della pagina
  tools/symbols.svg    icone SVG
  tools/site.json      contratto, link, video, indirizzo del sito
  i18n/*.json          testi nelle quattro lingue

Uscita (nella cartella del sito, pronta da caricare):
  index.html (inglese), zh/index.html, ko/index.html, ja/index.html,
  404.html, sitemap.xml, robots.txt, manifest.webmanifest,
  assets/fonts/ con i font ridotti ai soli caratteri usati.

Uso:  python3 tools/build.py            (scarica i font se mancano)
      python3 tools/build.py --offline  (non scarica nulla)
"""
import hashlib, html, json, re, sys, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / "tools"
OFFLINE = "--offline" in sys.argv

site = json.loads((TOOLS / "site.json").read_text(encoding="utf-8"))
LANGS = site["languages"]
DICT = {l: json.loads((ROOT / "i18n" / f"{l}.json").read_text(encoding="utf-8")) for l in LANGS}
TEMPLATE = (TOOLS / "template.html").read_text(encoding="utf-8")
SYMBOLS = (TOOLS / "symbols.svg").read_text(encoding="utf-8")
SITE = site["siteUrl"].rstrip("/")
OG_LOCALE = {"en": "en_US", "zh": "zh_CN", "ko": "ko_KR", "ja": "ja_JP"}
LOCALE = {"en": "en-US", "zh": "zh-CN", "ko": "ko-KR", "ja": "ja-JP"}

# Testi usati dal JavaScript (messaggi che compaiono dopo un'azione)
DYNAMIC_KEYS = ["ca.copy", "ca.copied", "ca.added", "ca.noWallet", "ca.walletError",
                "sticky.copy", "egg", "watch.play", "hero.age", "time.t4"]


def esc(s):
    return html.escape(s, quote=True)


def page_path(lang):
    return "" if lang == LANGS[0] else f"{lang}/"


def asset_version():
    h = hashlib.sha1()
    for p in ["css/style.css", "js/main.js"]:
        h.update((ROOT / p).read_bytes())
    return h.hexdigest()[:8]


def render(lang):
    d = DICT[lang]
    base = "" if lang == LANGS[0] else "../"
    canonical = f"{SITE}/{page_path(lang)}"

    def t(m):
        key = m.group(1)
        if key not in d:
            raise KeyError(f"[{lang}] testo mancante: {key}")
        return esc(d[key])

    hreflang = "\n".join(
        f'  <link rel="alternate" hreflang="{site["htmlLang"][l]}" href="{SITE}/{page_path(l)}">' for l in LANGS
    ) + f'\n  <link rel="alternate" hreflang="x-default" href="{SITE}/">'

    switch = "".join(
        f'<a href="{(base + page_path(l)) or "./"}" hreflang="{site["htmlLang"][l]}" lang="{site["htmlLang"][l]}" data-lang="{l}"'
        + (' aria-current="true"' if l == lang else "") + f'>{esc(site["langNames"][l])}</a>'
        for l in LANGS
    )

    jsonld = json.dumps({
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": "曙宝 Shubao",
        "alternateName": ["Shubao", "Shu Bao", "슈바오"],
        "url": canonical,
        "inLanguage": site["htmlLang"][lang],
        "description": d["meta.description"],
        "sameAs": [site["links"]["x"], site["links"]["telegram"], site["links"]["dexscreener"]],
    }, ensure_ascii=False)

    videos = "".join(
        f'<figure class="video reveal"><button class="video__btn js-video" type="button" data-id="{esc(v["id"])}" '
        f'aria-label="{esc(d["watch.play"])}: {esc(d[v["label"]])}">'
        f'<img data-src="https://i.ytimg.com/vi/{esc(v["id"])}/hqdefault.jpg" alt="" width="480" height="360" hidden onerror="this.hidden=true">'
        f'<span class="video__play"><svg aria-hidden="true"><use href="#i-play"/></svg></span></button>'
        f'<figcaption><b>{esc(d[v["label"]])}</b><span lang="ko">{esc(v["title"])}</span></figcaption></figure>'
        for v in site.get("videos", [])
    )

    share = urllib.parse.quote(f'{d["share.text"]}\n{canonical}\n#曙宝 #Shubao #BNBChain', safe="")

    token = site.get("cloudflareAnalyticsToken", "").strip()
    analytics = (f"  <script defer src='https://static.cloudflareinsights.com/beacon.min.js' "
                 f"data-cf-beacon='{{\"token\": \"{esc(token)}\"}}'></script>") if token else ""

    pagejson = json.dumps({
        "lang": lang, "locale": LOCALE[lang], "base": base,
        "contract": site["contract"], "pair": site["pair"],
        "t": {k: d[k] for k in DYNAMIC_KEYS},
    }, ensure_ascii=False).replace("</", "<\\/")

    out = TEMPLATE
    out = re.sub(r"\{\{t:([\w.]+)\}\}", t, out)
    out = re.sub(r"\{\{link:(\w+)\}\}", lambda m: esc(site["links"][m.group(1)]), out)
    out = re.sub(r"\{\{everland:(\w+)\}\}", lambda m: esc(site["everland"][m.group(1)]), out)
    repl = {
        "htmllang": site["htmlLang"][lang], "lang": lang, "base": base, "canonical": canonical,
        "hreflang": hreflang, "langswitch": switch, "jsonld": jsonld, "videos": videos,
        "share": share, "analytics": analytics, "pagejson": pagejson, "symbols": SYMBOLS,
        "ca": esc(site["contract"]), "pair": esc(site["pair"]), "oglocale": OG_LOCALE[lang],
        "ogimage": f"{SITE}/assets/og-{lang}.jpg", "v": VERSION,
        "legalnote": (f' · <span class="muted">{esc(d["legal.note"])}</span>' if d.get("legal.note") else ""),
    }
    for k, v in repl.items():
        out = out.replace("{{" + k + "}}", v)
    left = re.findall(r"\{\{[^}]+\}\}", out)
    if left:
        raise ValueError(f"[{lang}] segnaposto non sostituiti: {sorted(set(left))}")
    return out


# ---------------------------------------------------------------- font
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
FONT_DIR = ROOT / "assets" / "fonts"
ASCII = "".join(chr(c) for c in range(32, 127)) + "“”‘’…·—–€✓↗🐼"
NUMBERS = "0123456789.,%+-$€KMBTkmb万亿億만억천千兆조"


def is_han(c): return 0x3400 <= ord(c) <= 0x9FFF or 0xF900 <= ord(c) <= 0xFAFF
def is_kana(c): return 0x3040 <= ord(c) <= 0x30FF or 0x31F0 <= ord(c) <= 0x31FF
def is_hangul(c): return 0xAC00 <= ord(c) <= 0xD7AF or 0x1100 <= ord(c) <= 0x11FF or 0x3130 <= ord(c) <= 0x318F
def is_cjk_punct(c): return 0x3000 <= ord(c) <= 0x303F or 0xFF00 <= ord(c) <= 0xFFEF


def page_chars(lang, page_html):
    text = re.sub(r"<script.*?</script>", " ", page_html, flags=re.S)
    text = re.sub(r"<style.*?</style>", " ", text, flags=re.S)
    text = html.unescape(re.sub(r"<[^>]+>", " ", text))
    text += "".join(DICT[lang].values()) + ASCII + NUMBERS
    return set(text)


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def font_face(family, weight, chars, style="normal"):
    """Scarica (o riusa) un font ridotto ai caratteri indicati e restituisce la regola @font-face."""
    chars = "".join(sorted(chars))
    key = hashlib.sha1(f"{family}|{weight}|{style}|{chars}".encode()).hexdigest()[:10]
    slug = re.sub(r"[^a-z0-9]+", "-", family.lower()).strip("-")
    fname = f"{slug}-{weight}{'i' if style == 'italic' else ''}-{key}.woff2"
    path = FONT_DIR / fname
    if not path.exists():
        if OFFLINE:
            print(f"  ! font mancante (offline): {fname}")
        else:
            axis = f"ital,wght@1,{weight}" if style == "italic" else f"wght@{weight}"
            url = (f"https://fonts.googleapis.com/css2?family={urllib.parse.quote(family)}:{axis}"
                   f"&text={urllib.parse.quote(chars)}&display=swap")
            css = fetch(url).decode()
            m = re.search(r"src:\s*url\(([^)]+)\)", css)
            if not m:
                raise RuntimeError(f"font non trovato: {family} {weight}")
            path.write_bytes(fetch(m.group(1)))
            print(f"  + {fname} ({path.stat().st_size // 1024} KB)")
    return (f"@font-face{{font-family:'{family}';font-style:{style};font-weight:{weight};"
            f"font-display:swap;src:url('{fname}') format('woff2');}}"), fname


def build_fonts(lang, chars):
    latin = {c for c in chars if ord(c) < 0x2E80 and not is_hangul(c)}
    han = {c for c in chars if is_han(c) or is_cjk_punct(c)}
    kana = {c for c in chars if is_kana(c)}
    hangul = {c for c in chars if is_hangul(c) or is_cjk_punct(c)}
    rules, used = [], []

    def add(*a, **k):
        r, f = font_face(*a, **k)
        rules.append(r); used.append(f)

    for w in (400, 600, 800, 900):
        add("Nunito", w, latin)
    add("Nunito", 800, latin, style="italic")
    add("JetBrains Mono", 500, set("0123456789abcdefABCDEFx"))
    brush_han = set("曙宝寶") | (set(DICT[lang]["story.p1a"]) if lang == "zh" else set())
    add("Ma Shan Zheng", 400, brush_han)
    brush_ko = set("슈바오 ·Shubao") | (set(DICT[lang]["story.p1a"]) if lang in ("en", "ko") else set())
    add("Nanum Brush Script", 400, brush_ko)
    if lang == "ja":
        for w in (400, 700, 900):
            add("Noto Sans JP", w, han | kana)
    elif han:
        for w in (400, 700, 900):
            add("Noto Sans SC", w, han)
    if hangul:
        for w in (400, 700, 900):
            add("Noto Sans KR", w, hangul)
    (FONT_DIR / f"fonts-{lang}.css").write_text("\n".join(rules) + "\n", encoding="utf-8")
    return used


# ---------------------------------------------------------------- extra
def write_extras():
    urls = "".join(
        f"  <url><loc>{SITE}/{page_path(l)}</loc>"
        + "".join(f'<xhtml:link rel="alternate" hreflang="{site["htmlLang"][x]}" href="{SITE}/{page_path(x)}"/>' for x in LANGS)
        + "</url>\n" for l in LANGS)
    (ROOT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
        + urls + f"  <url><loc>{SITE}/legal/</loc></url>\n</urlset>\n", encoding="utf-8")
    (ROOT / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n", encoding="utf-8")
    (ROOT / "manifest.webmanifest").write_text(json.dumps({
        "name": "曙宝 Shubao", "short_name": "曙宝", "start_url": "/", "display": "standalone",
        "background_color": "#283016", "theme_color": "#283016",
        "description": DICT["en"]["meta.description"],
        "icons": [
            {"src": "/assets/icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "/assets/icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
        ],
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    d = DICT["en"]
    links = " · ".join(f'<a href="/{page_path(l)}" lang="{site["htmlLang"][l]}">{esc(DICT[l]["e404.home"])}</a>' for l in LANGS)
    (ROOT / "404.html").write_text(f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{esc(d["e404.title"])} | 曙宝 Shubao</title>
  <meta name="robots" content="noindex">
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/icons/favicon-32.png">
  <link rel="stylesheet" href="/assets/fonts/fonts-en.css?v={VERSION}">
  <link rel="stylesheet" href="/css/style.css?v={VERSION}">
</head>
<body class="page-404">
  <main class="e404">
    <img src="/assets/img/sticker-crawl-800.webp" alt="" width="800" height="800">
    <h1>{esc(d["e404.title"])}</h1>
    <p>{esc(d["e404.p"])}</p>
    <p class="e404__links">{links}</p>
  </main>
</body>
</html>
""", encoding="utf-8")


def write_legal():
    """Pagina legale (solo inglese): termini, rischi, privacy."""
    src = (TOOLS / "legal.html").read_text(encoding="utf-8")
    email = site.get("contactEmail", "").strip()
    contact = (f'<a href="mailto:{esc(email)}">{esc(email)}</a>' if email
               else f'through the <a href="{esc(site["links"]["telegram"])}">official Telegram group</a>')
    analytics = ("<li><strong>Statistics:</strong> we use Cloudflare Web Analytics, which counts visits "
                 "in aggregate without cookies and without identifying you.</li>"
                 if site.get("cloudflareAnalyticsToken", "").strip() else "")
    repl = {
        "site": SITE, "v": VERSION, "ca": esc(site["contract"]), "updated": esc(site.get("legalUpdated", "")),
        "x": esc(site["links"]["x"]), "telegram": esc(site["links"]["telegram"]), "contact": contact,
        "rpcs": "bsc-dataseed.bnbchain.org, bsc-rpc.publicnode.com", "analyticsPrivacy": analytics,
    }
    for k, v in repl.items():
        src = src.replace("{{" + k + "}}", v)
    left = re.findall(r"\{\{[^}]+\}\}", src)
    if left:
        raise ValueError(f"[legal] segnaposto non sostituiti: {sorted(set(left))}")
    out = ROOT / "legal" / "index.html"
    out.parent.mkdir(exist_ok=True)
    out.write_text(src, encoding="utf-8")
    print("ok legal/index.html")


# ---------------------------------------------------------------- main
VERSION = asset_version()
FONT_DIR.mkdir(parents=True, exist_ok=True)
used_fonts = set()
for lang in LANGS:
    page = render(lang)
    out = ROOT / page_path(lang) / "index.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page, encoding="utf-8")
    used_fonts.update(build_fonts(lang, page_chars(lang, page)))
    print(f"ok {out.relative_to(ROOT)}")
write_extras()
write_legal()
# rimuove i font vecchi non più usati
for f in FONT_DIR.glob("*.woff2"):
    if f.name not in used_fonts:
        f.unlink()
total = sum(f.stat().st_size for f in FONT_DIR.glob("*.woff2"))
print(f"font: {len(used_fonts)} file, {total // 1024} KB in totale · versione {VERSION}")
