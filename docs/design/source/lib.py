import re, os
ICON_DIR = "/home/claude/lucide/package/icons"
G="var(--g)"; S="var(--s)"; INK="var(--ink)"; GR="var(--gr)"; LINE="var(--line)"; SOFT="var(--soft)"
CO="var(--co)"; COT="var(--cot)"
THEMES = {"Light": {"g":"#F6F6F3","s":"#FFFFFF","ink":"#17181C","gr":"#5C606A","line":"#E3E3DE","soft":"#ECECE6","co":"#2E46D1","cot":"#E9ECFB","off":"#C9CAC4","scrim":"rgba(23,24,28,0.45)","cb":"rgba(23,24,28,0.08)","cs":"light"},
          "Dark":  {"g":"#121317","s":"#1B1D22","ink":"#F1F1EC","gr":"#A3A7B0","line":"#2C2F36","soft":"#25282E","co":"#8A9BFF","cot":"#1F2547","off":"#4A4E57","scrim":"rgba(0,0,0,0.62)","cb":"rgba(255,255,255,0.10)","cs":"dark"}}
FONT="'Schibsted Grotesk', system-ui, -apple-system, 'Segoe UI', sans-serif"

def icon(name, size=20, color="currentColor", sw=1.75):
    raw = open(f"{ICON_DIR}/{name}.svg").read()
    inner = raw.split(">", 2)[2] if False else raw[raw.index(">", raw.index("<svg"))+1: raw.rindex("</svg>")]
    inner = re.sub(r"<(\w+)([^>]*?)\s*/>", r"<\1\2></\1>", inner)
    inner = " ".join(inner.split())
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="{sw}" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex: none">{inner}</svg>')

COVERS = {
 "onepiece": ("One Piece", "Eiichirō Oda", "#C9D3DC", "#17181C"),
 "blacksad": ("Blacksad", "Díaz Canales · Guarnido", "#2B2F38", "#F2F2EE"),
 "horde": ("La Horde du Contrevent", "Alain Damasio", "#D8D2C6", "#17181C"),
 "dune": ("Dune", "Frank Herbert", "#D9C9B3", "#17181C"),
 "spy": ("Spy×Family", "Tatsuya Endō", "#CDD6CC", "#17181C"),
 "frieren": ("Frieren", "Kanehito Yamada", "#D3D7E4", "#17181C"),
 "fondation": ("Fondation", "Isaac Asimov", "#BFC6CE", "#17181C"),
 "naussicaa": ("Nausicaä", "Hayao Miyazaki", "#D7DCCB", "#17181C"),
 "monde": ("Le Monde de Narnia", "C. S. Lewis", "#E0D6CA", "#17181C"),
 "berserk": ("Berserk", "Kentarō Miura", "#3A3634", "#F2F2EE"),
 "peste": ("La Peste", "Albert Camus", "#E4E1D8", "#17181C"),
 "asterix": ("Astérix", "Fabcaro · Didier Conrad", "#D6D9C4", "#17181C"),
}

def cover(key, w=120, vol=None, mark=None):
    title, author, bg, fg = COVERS[key]
    h = round(w * 1.5)
    small = w < 96
    t = title + (f" {vol}" if vol else "")
    m = ""
    if mark == "unread":
        m = f'<span style="position: absolute; top: 6px; right: 6px; width: 10px; height: 10px; border-radius: 5px; background: {CO}; box-shadow: 0 0 0 2px {S}" aria-label="Not read yet"></span>'
    elif mark == "reading":
        m = f'<span style="position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: {INK}" aria-label="Reading"></span>'
    elif mark == "lent":
        m = f'<span style="position: absolute; top: 6px; left: 6px; font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 4px; background: {S}; color: {INK}">Lent</span>'
    return (f'<div style="position: relative; width: {w}px; height: {h}px; flex: none; border-radius: 4px; background: {bg}; color: {fg}; '
            f'box-sizing: border-box; padding: {6 if small else 10}px; display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; border: 1px solid var(--cb)">'
            f'<span style="font-size: {10 if small else 13}px; font-weight: 700; line-height: 1.15">{t}</span>'
            f'{"" if small else f"<span style=\"font-size: 10px; margin-top: 4px; opacity: 0.8\">{author}</span>"}{m}</div>')

def spines(items, h=56, w=16, gap=5, label=None, show_nums=True):
    cols = []
    for num, st in items:
        if st == "read":   sty = f"background: {INK}"
        elif st == "owned": sty = f"background: {SOFT}; border: 1.5px solid {INK}"
        elif st == "missing": sty = f"background: transparent; border: 1.5px dashed {GR}"
        elif st == "new": sty = f"background: {CO}"
        else: sty = f"background: transparent; border: 1.5px dashed {CO}"
        n = f'<span style="font-size: 10px; color: {GR}; font-variant-numeric: tabular-nums">{num}</span>' if show_nums else ""
        cols.append(f'<div style="display: flex; flex-direction: column; align-items: center; gap: 4px"><span style="display: block; box-sizing: border-box; width: {w}px; height: {h}px; border-radius: 3px; {sty}"></span>{n}</div>')
    lab = f' role="img" aria-label="{label}"' if label else ""
    return f'<div{lab} style="display: flex; align-items: flex-end; gap: {gap}px; flex-wrap: wrap">{"".join(cols)}</div>'

def spine_legend():
    def it(sty, t):
        return f'<span style="display: inline-flex; align-items: center; gap: 6px"><span style="display: inline-block; box-sizing: border-box; width: 8px; height: 14px; border-radius: 2px; {sty}"></span>{t}</span>'
    return (f'<div style="display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; color: {GR}">'
            + it(f"background: {INK}", "Read") + it(f"background: {SOFT}; border: 1.5px solid {INK}", "Owned, not read")
            + it(f"border: 1.5px dashed {GR}", "Missing") + it(f"background: {CO}", "New") + it(f"border: 1.5px dashed {CO}", "Announced") + "</div>")

def btn(text, kind="primary", ico=None, href=None, full=False, size="m"):
    pad = "0 18px" if size == "m" else "0 14px"
    hgt = 48 if size == "m" else 40
    if kind == "primary": sty = f"background: {INK}; color: {S}; border: 1px solid {INK}"
    elif kind == "accent": sty = f"background: {CO}; color: {S}; border: 1px solid {CO}"
    elif kind == "ghost": sty = f"background: transparent; color: {INK}; border: 1px solid transparent"
    else: sty = f"background: {S}; color: {INK}; border: 1px solid {LINE}"
    w = "width: 100%; " if full else ""
    inner = (icon(ico, 18) if ico else "") + f"<span>{text}</span>"
    base = f'{w}box-sizing: border-box; min-height: {hgt}px; padding: {pad}; border-radius: 10px; font-size: 15px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none; cursor: pointer; {sty}'
    if href:
        return f'<a href="{href}" style="{base}">{inner}</a>'
    return f'<button type="button" style="{base}">{inner}</button>'

def toggle(on=True, label="Toggle"):
    bg = CO if on else "var(--off)"
    x = 22 if on else 2
    return (f'<button type="button" role="switch" aria-checked="{"true" if on else "false"}" aria-label="{label}" style="flex: none; position: relative; width: 48px; height: 28px; border-radius: 14px; border: 0; padding: 0; background: {bg}; cursor: pointer">'
            f'<span style="position: absolute; top: 2px; left: {x}px; width: 24px; height: 24px; border-radius: 12px; background: {S}"></span></button>')

def segmented(options, active):
    out = []
    for o in options:
        on = o == active
        sty = f"background: {S}; color: {INK}; border: 1px solid {LINE}; font-weight: 600" if on else f"background: transparent; color: {GR}; border: 1px solid transparent; font-weight: 500"
        out.append(f'<button type="button" aria-pressed="{"true" if on else "false"}" style="flex: 1; min-height: 40px; border-radius: 8px; font-size: 14px; cursor: pointer; {sty}">{o}</button>')
    return f'<div style="display: flex; gap: 4px; padding: 4px; border-radius: 12px; background: {SOFT}">{"".join(out)}</div>'

def chip(text, active=False, count=None):
    sty = f"background: {INK}; color: {S}; border: 1px solid {INK}" if active else f"background: {S}; color: {INK}; border: 1px solid {LINE}"
    c = f'<span style="opacity: 0.7; font-variant-numeric: tabular-nums">{count}</span>' if count is not None else ""
    return f'<button type="button" aria-pressed="{"true" if active else "false"}" style="flex: none; min-height: 36px; padding: 0 14px; border-radius: 18px; font-size: 13px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; {sty}">{text}{c}</button>'

def tag(text, tone="neutral", ico=None):
    if tone == "accent": sty = f"background: {COT}; color: {CO}"
    elif tone == "dark": sty = f"background: {INK}; color: {S}"
    else: sty = f"background: {SOFT}; color: {INK}"
    i = icon(ico, 13) if ico else ""
    return f'<span style="display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; padding: 4px 8px; border-radius: 6px; {sty}">{i}{text}</span>'

def wordmark(size=20):
    # four volumes as the mark: three spines + one dashed (the missing one)
    sp = (f'<span aria-hidden="true" style="display: inline-flex; align-items: flex-end; gap: 2px; height: {size}px">'
          f'<span style="width: 4px; height: {size}px; background: {INK}; border-radius: 1px"></span>'
          f'<span style="width: 4px; height: {size}px; background: {INK}; border-radius: 1px"></span>'
          f'<span style="box-sizing: border-box; width: 4px; height: {size}px; border: 1.25px dashed {INK}; border-radius: 1px"></span>'
          f'<span style="width: 4px; height: {size}px; background: {CO}; border-radius: 1px"></span></span>')
    return f'<span style="display: inline-flex; align-items: center; gap: 10px; font-size: {size}px; font-weight: 700; letter-spacing: -0.03em; color: {INK}">{sp}atomes</span>'

def card(inner, pad=20, extra=""):
    return f'<div style="background: {S}; border: 1px solid {LINE}; border-radius: 14px; padding: {pad}px; box-sizing: border-box; {extra}">{inner}</div>'

def h1(t, size=32):
    return f'<h1 style="margin: 0; font-size: {size}px; line-height: 1.1; font-weight: 700; letter-spacing: -0.03em; color: {INK}">{t}</h1>'

def h2(t, size=18, extra=""):
    return f'<h2 style="margin: 0; font-size: {size}px; line-height: 1.2; font-weight: 700; letter-spacing: -0.02em; color: {INK}; {extra}">{t}</h2>'

def p(t, size=14, color=GR, extra=""):
    return f'<p style="margin: 0; font-size: {size}px; line-height: 1.5; color: {color}; {extra}">{t}</p>'

def row(inner, gap=12, align="center", justify="flex-start", wrap=False, extra=""):
    return f'<div style="display: flex; align-items: {align}; justify-content: {justify}; gap: {gap}px; {"flex-wrap: wrap; " if wrap else ""}{extra}">{inner}</div>'

def col(inner, gap=12, extra=""):
    return f'<div style="display: flex; flex-direction: column; gap: {gap}px; {extra}">{inner}</div>'

# ---------- navigation
DESK_NAV = [("house", "Home", "home"), ("library", "Library", "library"), ("bell", "New &amp; upcoming", "new"),
            ("shopping-bag", "To Buy", "tobuy"), ("settings", "Settings", "settings")]
MOB_NAV = [("house", "Home", "home"), ("library", "Library", "library"), ("scan-barcode", "Check", "shelf"),
           ("shopping-bag", "To Buy", "tobuy"), ("user", "You", "settings")]

def desktop(title, active, main, scr, **kw):
    items = []
    for ic, label, key in DESK_NAV:
        on = key == active
        sty = f"background: {S}; color: {INK}; border: 1px solid {LINE}; font-weight: 600" if on else f"color: {GR}; border: 1px solid transparent; font-weight: 500"
        cur = ' aria-current="page"' if on else ""
        items.append(f'<a href="{key}-desktop.dc.html"{cur} style="display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 0 12px; border-radius: 10px; font-size: 15px; text-decoration: none; {sty}">{icon(ic, 18)}<span>{label}</span></a>')
    aside = (f'<nav aria-label="Main" style="flex: 1 1 220px; max-width: 100%; box-sizing: border-box; padding: 28px 20px; display: flex; flex-direction: column; gap: 28px; border-right: 1px solid {LINE}">'
             f'<a href="home-desktop.dc.html" style="text-decoration: none; padding: 0 12px">{wordmark(20)}</a>'
             + btn("Check a book", "primary", "scan-barcode", href="shelf-desktop.dc.html", full=True)
             + f'<div style="display: flex; flex-direction: column; gap: 4px">{"".join(items)}</div>'
             f'<div style="margin-top: auto; display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 10px; background: {SOFT}">'
             f'{icon("lock", 16, INK)}<span style="display: flex; flex-direction: column"><span style="font-size: 13px; font-weight: 600; color: {INK}">you.atomes.app</span>'
             f'<span style="font-size: 12px; color: {GR}">Private by default</span></span></div></nav>')
    return page(title, f'<div style="min-height: {scr}px; background: {G}; display: flex; flex-wrap: wrap; font-family: {FONT}; color: {INK}">'
                f'{aside}<main style="flex: 999 1 560px; min-width: 0; box-sizing: border-box; padding: 40px clamp(20px, 4vw, 56px) 56px">'
                f'<div style="max-width: 1040px; display: flex; flex-direction: column; gap: 32px">{main}</div></main></div>', None, **kw)

def mobile(title, active, content, back=None, tabbar=True, bg=G, **kw):
    tabs = ""
    if tabbar:
        t = []
        for ic, label, key in MOB_NAV:
            on = key == active
            if key == "shelf":
                t.append(f'<a href="shelf-mobile.dc.html" aria-label="Check a book" style="flex: 1; display: flex; justify-content: center; text-decoration: none">'
                         f'<span style="width: 52px; height: 52px; border-radius: 26px; background: {INK}; color: {S}; display: flex; align-items: center; justify-content: center">{icon(ic, 24, S)}</span></a>')
                continue
            c = INK if on else GR
            cur = ' aria-current="page"' if on else ""
            t.append(f'<a href="{key}-mobile.dc.html"{cur} style="flex: 1; min-height: 52px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; text-decoration: none; color: {c}; font-size: 11px; font-weight: {600 if on else 500}">{icon(ic, 22, c)}<span>{label}</span></a>')
        tabs = f'<nav aria-label="Main" style="flex: none; display: flex; align-items: center; padding: 8px 8px 22px; background: {S}; border-top: 1px solid {LINE}">{"".join(t)}</nav>'
    top = ""
    if back:
        href, label = back
        top = (f'<div style="flex: none; display: flex; align-items: center; justify-content: space-between; padding: 12px 12px 0">'
               f'<a href="{href}" aria-label="Back to {label}" style="width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; color: {INK}; text-decoration: none">{icon("chevron-left", 24)}</a></div>')
    return page(title, f'<div style="width: 390px; height: 844px; background: {bg}; display: flex; flex-direction: column; overflow: hidden; font-family: {FONT}; color: {INK}">'
                f'{top}<div style="flex: 1; min-height: 0; overflow: hidden; box-sizing: border-box; padding: {8 if back else 28}px 20px 20px; display: flex; flex-direction: column; gap: 24px">{content}</div>{tabs}</div>', (390, 844), **kw)

def page(title, body, preview, js_pre='', js_ret=''):
    import json as _j
    pv = preview or (1280, 900)
    body = re.sub(r'href="([\w-]+)\.dc\.html"', r'href="\1{{sfx}}.dc.html"', body)
    body = re.sub(r'<(button|input)([^>]*?) style="', r'<\1\2 style="font-family: inherit; ', body)
    themes = _j.dumps(THEMES)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700&amp;display=swap" rel="stylesheet">
<style>
body{{margin:0}}
</style>
</helmet>
<div data-theme="{{{{theme}}}}" style="{{{{vars}}}}">
{body}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"theme":{{"editor":"enum","options":["Light","Dark","System"],"default":"Light","section":"Appearance"}},"linkSuffix":{{"editor":null,"default":""}},"$preview":{{"width":{pv[0]},"height":{pv[1]}}}}}'>
class Component extends DCLogic {{
renderVals() {{
var themes = {themes};
var pick = this.props.theme ?? 'Light';
if (pick === 'System') {{
pick = (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'Dark' : 'Light';
}}
var t = themes[pick] || themes.Light;
var vars = '--g:' + t.g + ';--s:' + t.s + ';--ink:' + t.ink + ';--gr:' + t.gr + ';--line:' + t.line + ';--soft:' + t.soft + ';--co:' + t.co + ';--cot:' + t.cot + ';--off:' + t.off + ';--scrim:' + t.scrim + ';--cb:' + t.cb + ';color-scheme:' + t.cs + ';background:' + t.g;
{js_pre}
return {{ theme: pick, vars: vars, sfx: this.props.linkSuffix ?? ''{js_ret} }};
}}
}}
</script>
</body>
</html>
"""
