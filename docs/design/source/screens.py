from lib import *
S_ = {}  # name -> (html, w, h, title, expand)

def onepiece_spines(start=101, end=110, missing=(107,), new=(), upcoming=(110,), read_upto=104):
    items = []
    for n in range(start, end + 1):
        if n in upcoming: st = "upcoming"
        elif n in new: st = "new"
        elif n in missing: st = "missing"
        elif n <= read_upto: st = "read"
        else: st = "owned"
        items.append((n, st))
    return items

# ======================================================== 1. Sign in
def signin_body(mobile=False):
    sp = spines([(1,"read"),(2,"read"),(3,"read"),(4,"missing"),(5,"read"),(6,"owned"),(7,"owned"),(8,"new"),(9,"upcoming")],
                h=88 if not mobile else 64, w=22 if not mobile else 18, gap=6,
                label="A series of nine volumes: five read, two owned but not read, volume 4 missing, volume 8 new, volume 9 announced")
    form = col(
        f'<label for="handle" style="font-size: 14px; font-weight: 600">Your handle</label>'
        f'<input id="handle" type="text" inputmode="email" autocomplete="username" placeholder="you.bsky.social" style="box-sizing: border-box; width: 100%; min-height: 52px; padding: 0 16px; border-radius: 12px; border: 1px solid {LINE}; background: {S}; font-size: 16px; color: {INK}">'
        + p("Atomes signs you in with your AT Protocol account. Your library is stored on your own server, private unless you share it.", 13)
        + btn("Continue", "primary", href="home-mobile.dc.html" if mobile else "home-desktop.dc.html", full=True)
        + f'<a href="#pds" style="font-size: 14px; font-weight: 600; color: {CO}; text-decoration: none; min-height: 44px; display: inline-flex; align-items: center">I don’t have a PDS yet</a>', 12)
    head = col(wordmark(22) + f'<div style="height: {16 if mobile else 28}px"></div>' + sp, 0)
    title = h1("Know what you own, what you’ve read, and what’s next.", 30 if mobile else 40)
    if mobile:
        return col(head + title + form, 28, "padding-top: 24px")
    return (f'<div style="min-height: 820px; background: {G}; font-family: {FONT}; color: {INK}; display: flex; align-items: center; justify-content: center; padding: 48px 24px; box-sizing: border-box">'
            f'<div style="width: 100%; max-width: 440px; display: flex; flex-direction: column; gap: 32px">{head}{title}{form}</div></div>')

S_["Main"] = (page("Sign in · desktop", signin_body(), (1280, 820)), 1280, 820, "Sign in · desktop", True)
S_["signin-mobile"] = (mobile("Sign in · mobile", None, signin_body(True), tabbar=False), 390, 844, "Sign in · mobile", False)

# ======================================================== 2. Home
def newitem(key, vol, when, pub, tone, w=56):
    t, a, _, _ = COVERS[key]
    badge = tag("Out now", "accent") if tone == "new" else tag(when)
    return (f'<a href="series-{{dev}}.dc.html" style="display: flex; align-items: center; gap: 14px; text-decoration: none; color: {INK}; min-height: 44px">'
            f'{cover(key, w, vol)}<span style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px">'
            f'<span style="font-size: 15px; font-weight: 600">{t}, vol. {vol}</span><span style="font-size: 13px; color: {GR}">{pub}</span></span>{badge}</a>')

def home_desktop():
    check = card(row(
        col(h2("Check a book", 22) + p("Point your camera at a cover or barcode. Works in shops with no signal.", 15), 8, "flex: 1 1 280px")
        + row(btn("Check a book", "primary", "scan-barcode", href="shelf-desktop.dc.html") + btn("Type an ISBN", "secondary", "keyboard", href="quickadd-desktop.dc.html"), 8, wrap=True),
        24, justify="space-between", wrap=True), 28)
    new = card(col(row(h2("New &amp; upcoming") + f'<a href="new-desktop.dc.html" style="font-size: 14px; font-weight: 600; color: {CO}; text-decoration: none">See all</a>', justify="space-between")
                   + newitem("blacksad", 7, "", "Dargaud · in shops since 24 Oct", "new").replace("{dev}", "desktop")
                   + f'<div style="height: 1px; background: {LINE}"></div>'
                   + newitem("onepiece", 110, "[DATE]", "Glénat · announced", "up").replace("{dev}", "desktop"), 16), 24, "flex: 1 1 360px")
    reading = card(col(h2("Reading now") + row(cover("frieren", 88, 9, "reading") + cover("dune", 88, None, "reading"), 14)
                       + p("2 books in progress", 13), 16), 24, "flex: 1 1 260px")
    unread = col(row(h2("Owned, not read yet") + f'<a href="library-desktop.dc.html" style="font-size: 14px; font-weight: 600; color: {CO}; text-decoration: none">14 books</a>', justify="space-between")
                 + row("".join(cover(k, 104, v, "unread") for k, v in [("onepiece", 105), ("onepiece", 106), ("spy", 12), ("fondation", None), ("peste", None), ("asterix", 40)]), 16, wrap=True), 16)
    return col(h1("Home") , 0) + check + row(new + reading, 24, "stretch", wrap=True) + unread

S_["home-desktop"] = (desktop("Home · desktop", "home", home_desktop(), 900), 1280, 900, "Home · desktop", True)

def home_mobile():
    hero = (f'<a href="shelf-mobile.dc.html" style="display: flex; align-items: center; gap: 16px; padding: 20px; border-radius: 16px; background: {INK}; color: {S}; text-decoration: none">'
            f'<span style="width: 48px; height: 48px; border-radius: 12px; background: rgba(255,255,255,0.12); display: flex; align-items: center; justify-content: center">{icon("scan-barcode", 26, S)}</span>'
            f'<span style="display: flex; flex-direction: column; gap: 2px"><span style="font-size: 18px; font-weight: 700">Check a book</span>'
            f'<span style="font-size: 13px; opacity: 0.75">Cover or barcode · works offline</span></span></a>')
    new = col(row(h2("New &amp; upcoming") + f'<a href="new-mobile.dc.html" style="font-size: 14px; font-weight: 600; color: {CO}; text-decoration: none">See all</a>', justify="space-between")
              + newitem("blacksad", 7, "", "Dargaud · in shops", "new", 48).replace("{dev}", "mobile")
              + newitem("onepiece", 110, "[DATE]", "Glénat · announced", "up", 48).replace("{dev}", "mobile"), 14)
    unread = col(row(h2("Owned, not read yet") + f'<a href="library-mobile.dc.html" style="font-size: 14px; font-weight: 600; color: {CO}; text-decoration: none">14</a>', justify="space-between")
                 + row("".join(cover(k, 96, v, "unread") for k, v in [("onepiece", 105), ("spy", 12), ("fondation", None)]), 12), 14)
    return row(wordmark(18) + f'<a href="settings-mobile.dc.html" aria-label="Settings" style="width: 44px; height: 44px; display: flex; align-items: center; justify-content: flex-end; color: {INK}">{icon("settings", 22)}</a>', justify="space-between") + hero + new + unread

S_["home-mobile"] = (mobile("Home · mobile", "home", home_mobile()), 390, 844, "Home · mobile", False)

# ======================================================== 3. Shelf Check
def result_panel(compact=False):
    sp = spines(onepiece_spines(101, 110), h=44 if compact else 56, w=16 if compact else 20, gap=5,
                label="One Piece volumes 101 to 110: 101 to 104 read, 105, 106 and 108 owned, 107 missing, 110 announced")
    return col(
        row(cover("onepiece", 64 if compact else 80, 107)
            + col(tag("Recognised from the cover", "neutral", "image") + h2("One Piece, vol. 107", 20) + p("Glénat · French · your edition line", 13), 6), 16, "flex-start")
        + f'<div style="display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-radius: 12px; background: {COT}; color: {CO}">{icon("circle-dashed", 20, CO)}<span style="font-size: 15px; font-weight: 700">You don’t own this one</span></div>'
        + sp
        + row(btn("Add to To Buy", "secondary", "shopping-bag", full=True) + btn("I bought it", "primary", "check", href="quickadd-mobile.dc.html" if compact else "quickadd-desktop.dc.html", full=True), 10), 16)

def viewport(h, mobile=False):
    corner = lambda pos: f'<span style="position: absolute; {pos}; width: 28px; height: 28px; border-color: #FFFFFF; border-style: solid; border-width: 0"></span>'
    frame = (f'<div style="position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%); width: {200 if mobile else 280}px; height: {280 if mobile else 360}px">'
             f'<span style="position: absolute; top: 0; left: 0; width: 28px; height: 28px; border-top: 3px solid #FFFFFF; border-left: 3px solid #FFFFFF; border-top-left-radius: 8px"></span>'
             f'<span style="position: absolute; top: 0; right: 0; width: 28px; height: 28px; border-top: 3px solid #FFFFFF; border-right: 3px solid #FFFFFF; border-top-right-radius: 8px"></span>'
             f'<span style="position: absolute; bottom: 0; left: 0; width: 28px; height: 28px; border-bottom: 3px solid #FFFFFF; border-left: 3px solid #FFFFFF; border-bottom-left-radius: 8px"></span>'
             f'<span style="position: absolute; bottom: 0; right: 0; width: 28px; height: 28px; border-bottom: 3px solid #FFFFFF; border-right: 3px solid #FFFFFF; border-bottom-right-radius: 8px"></span>'
             f'<div style="position: absolute; inset: 40px 36px; opacity: 0.9">{cover("onepiece", 128 if mobile else 208, 107)}</div></div>')
    pill = (f'<div style="position: absolute; top: 16px; left: 16px; display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 20px; background: rgba(255,255,255,0.14); color: #FFFFFF; font-size: 13px; font-weight: 600">'
            f'{icon("zap-off", 15, "#FFFFFF")}Offline · using your Library on this device</div>')
    hint = f'<p style="position: absolute; left: 0; right: 0; bottom: 20px; margin: 0; text-align: center; color: #FFFFFF; font-size: 14px; opacity: 0.85">Point at the cover or the barcode</p>'
    return f'<div aria-label="Camera view" role="img" style="position: relative; height: {h}px; border-radius: {0 if mobile else 16}px; background: #23252B; overflow: hidden; flex: none">{pill}{frame}{hint}</div>'

def shelf_desktop():
    isbn = col(f'<label for="isbn" style="font-size: 14px; font-weight: 600">Or type an ISBN</label>'
               + row(f'<input id="isbn" type="text" inputmode="numeric" placeholder="978…" style="flex: 1; min-width: 0; box-sizing: border-box; min-height: 48px; padding: 0 14px; border-radius: 10px; border: 1px solid {LINE}; background: #FFFFFF; font-size: 16px">' + btn("Check", "secondary"), 8), 8)
    return (h1("Check a book") + row(f'<div style="flex: 1 1 420px; min-width: 0">{viewport(520)}</div>'
            + f'<div style="flex: 1 1 340px; min-width: 0; display: flex; flex-direction: column; gap: 20px">{card(result_panel(), 24)}{isbn}</div>', 24, "flex-start", wrap=True))

S_["shelf-desktop"] = (desktop("Shelf Check · desktop", None, shelf_desktop(), 900), 1280, 900, "Shelf Check · desktop", True)

def shelf_mobile():
    sheet = (f'<div style="position: absolute; left: 0; right: 0; bottom: 0; background: #FFFFFF; border-radius: 20px 20px 0 0; padding: 12px 20px 28px; box-sizing: border-box; display: flex; flex-direction: column; gap: 14px">'
             f'<span style="align-self: center; width: 40px; height: 4px; border-radius: 2px; background: {LINE}"></span>{result_panel(True)}</div>')
    close = f'<a href="home-mobile.dc.html" aria-label="Close" style="position: absolute; top: 12px; right: 12px; width: 44px; height: 44px; border-radius: 22px; background: rgba(255,255,255,0.14); color: #FFFFFF; display: flex; align-items: center; justify-content: center">{icon("x", 22, "#FFFFFF")}</a>'
    body = f'<div style="position: relative; width: 390px; height: 844px; overflow: hidden; background: #23252B; font-family: {FONT}; color: {INK}">{viewport(440, True)}{close}{sheet}</div>'
    return page("Shelf Check · mobile", body, (390, 844))

S_["shelf-mobile"] = (shelf_mobile(), 390, 844, "Shelf Check · mobile", False)

# ======================================================== 4. Quick Add
def quickadd_form(mobile=False):
    vis = row(icon("lock", 18, INK) + col(f'<span style="font-size: 15px; font-weight: 600">Private</span>' + p("Only you can see this book. You can share your reading status later.", 13), 2, "flex: 1") , 12, "flex-start",
              extra=f"padding: 14px 16px; border-radius: 12px; background: {SOFT}")
    return col(
        row(cover("blacksad", 88 if mobile else 104, 7) + col(tag("Scanned · ISBN 978-2-205-[…]", "neutral", "scan-barcode") + h2("Blacksad, vol. 7", 22) + p("Díaz Canales · Guarnido", 14) + p("Dargaud · French · hardcover", 13), 6), 16, "flex-start")
        + col(f'<span style="font-size: 14px; font-weight: 600">Have you read it?</span>' + segmented(["Not yet", "Reading", "Read"], "Not yet"), 8)
        + vis
        + p("Blacksad is new in your Library. Next, tell us which other volumes you have.", 13)
        + btn("Add to Library", "primary", "book-plus", href="onboarding-mobile.dc.html" if mobile else "onboarding-desktop.dc.html", full=True), 20)

def quickadd_desktop():
    dialog = (f'<div role="dialog" aria-labelledby="qa-title" style="width: 100%; max-width: 480px; background: {S}; border-radius: 18px; border: 1px solid {LINE}; padding: 28px; box-sizing: border-box; display: flex; flex-direction: column; gap: 20px">'
              + row(f'<h2 id="qa-title" style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em">Add to your Library</h2>'
                    + f'<a href="home-desktop.dc.html" aria-label="Close" style="width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; color: {INK}">{icon("x", 20)}</a>', justify="space-between")
              + quickadd_form() + "</div>")
    return (f'<div style="min-height: 860px; background: var(--scrim); font-family: {FONT}; color: {INK}; display: flex; align-items: center; justify-content: center; padding: 40px 24px; box-sizing: border-box">{dialog}</div>')

S_["quickadd-desktop"] = (page("Quick Add · desktop", quickadd_desktop(), (1280, 860)), 1280, 860, "Quick Add · desktop", True)
S_["quickadd-mobile"] = (mobile("Quick Add · mobile", None, h1("Add to your Library", 26) + quickadd_form(True), back=("shelf-mobile.dc.html", "Shelf Check"), tabbar=False), 390, 844, "Quick Add · mobile", False)

# ======================================================== 5. Series Onboarding
def stepper(label, value, idv):
    b = lambda ic, lab: f'<button type="button" aria-label="{lab}" style="width: 44px; height: 44px; border-radius: 10px; border: 1px solid {LINE}; background: {S}; color: {INK}; display: flex; align-items: center; justify-content: center; cursor: pointer">{icon(ic, 18)}</button>'
    minus = f'<button type="button" aria-label="One less" style="width: 44px; height: 44px; border-radius: 10px; border: 1px solid {LINE}; background: {S}; color: {INK}; font-size: 22px; line-height: 1; cursor: pointer">−</button>'
    return row(f'<span id="{idv}" style="flex: 1; font-size: 15px; font-weight: 600">{label}</span>' + minus
               + f'<output aria-labelledby="{idv}" style="min-width: 44px; text-align: center; font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums">{value}</output>' + b("plus", "One more"), 8)

def tiles(items, size=44):
    out = []
    for n, st in items:
        if st == "read": sty = f"background: {INK}; color: {S}; border: 1px solid {INK}"
        elif st == "owned": sty = f"background: {SOFT}; color: {INK}; border: 1.5px solid {INK}"
        elif st == "missing": sty = f"background: transparent; color: {GR}; border: 1.5px dashed {GR}"
        elif st == "new": sty = f"background: {CO}; color: {S}; border: 1px solid {CO}"
        else: sty = f"background: transparent; color: {CO}; border: 1.5px dashed {CO}"
        names = {"read": "read", "owned": "owned, not read", "missing": "missing", "new": "new", "upcoming": "announced"}
        out.append(f'<button type="button" aria-label="Volume {n}, {names[st]}" style="width: {size}px; height: {size}px; box-sizing: border-box; border-radius: 8px; font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; cursor: pointer; {sty}">{n}</button>')
    return f'<div style="display: flex; flex-wrap: wrap; gap: 8px">{"".join(out)}</div>'

def onboarding(mobile=False):
    items = [(1,"read"),(2,"read"),(3,"read"),(4,"missing"),(5,"read"),(6,"read"),(7,"owned")]
    follow = row(icon("bell", 20, INK) + col(f'<span style="font-size: 15px; font-weight: 600">Tell me when a new volume is out</span>' + p("In this edition: Dargaud · French · hardcover", 13), 2, "flex: 1") + toggle(True, "New volume alerts"), 12,
                 extra=f"padding: 14px 16px; border-radius: 12px; background: {S}; border: 1px solid {LINE}")
    return col(
        col(tag("New series", "neutral", "layers") + h1("Which volumes of Blacksad do you have?", 26 if mobile else 34) + p("Set the range, then tap a volume to fix a gap.", 14), 10)
        + card(col(stepper("I own volumes 1 to", 7, "own-" + ("m" if mobile else "d")) + stepper("I’ve read up to", 6, "read-" + ("m" if mobile else "d")), 12), 16)
        + col(tiles(items, 44) + spine_legend(), 14)
        + follow
        + row(btn("Skip", "ghost") + btn("Save series", "primary", "check", href="series-mobile.dc.html" if mobile else "series-desktop.dc.html"), 8, justify="flex-end"), 22)

S_["onboarding-desktop"] = (page("Series Onboarding · desktop",
    f'<div style="min-height: 860px; background: {G}; font-family: {FONT}; color: {INK}; display: flex; justify-content: center; padding: 56px 24px; box-sizing: border-box"><div style="width: 100%; max-width: 560px">{onboarding()}</div></div>', (1280, 860)),
    1280, 860, "Series Onboarding · desktop", True)
S_["onboarding-mobile"] = (mobile("Series Onboarding · mobile", None, onboarding(True), back=("quickadd-mobile.dc.html", "Quick Add"), tabbar=False), 390, 844, "Series Onboarding · mobile", False)


BOOK_LABELS = {"onepiece":["Manga"],"blacksad":["Comics","Crime"],"horde":["Sci-fi"],"dune":["Sci-fi","Classics"],"spy":["Manga"],
               "frieren":["Manga","Fantasy"],"fondation":["Sci-fi","Classics"],"naussicaa":["Manga","Sci-fi"],"berserk":["Manga","Fantasy"],
               "peste":["Classics"],"asterix":["Comics"],"monde":["Fantasy","Classics"]}
LABEL_COUNTS = [("Manga", 61), ("Sci-fi", 32), ("Comics", 44), ("Classics", 18), ("Fantasy", 21), ("Crime", 9), ("To re-read", 6)]

def label_chip(text, active=False, count=None):
    sty = f"background: {CO}; color: {S}; border: 1px solid {CO}" if active else f"background: transparent; color: {INK}; border: 1px solid {LINE}"
    c = f'<span style="opacity: 0.7; font-variant-numeric: tabular-nums">{count}</span>' if count is not None else ""
    return f'<button type="button" aria-pressed="{"true" if active else "false"}" style="flex: none; min-height: 36px; padding: 0 12px; border-radius: 8px; font-size: 13px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; {sty}">{icon("tag", 14)}{text}{c}</button>'

def label_row(mobile=False, active=None):
    chips = "".join(label_chip(n, n == active, c) for n, c in (LABEL_COUNTS[:4] if mobile else LABEL_COUNTS))
    more = "" if mobile else f'<button type="button" style="flex: none; min-height: 36px; padding: 0 12px; border-radius: 8px; border: 1px dashed {LINE}; background: transparent; color: {GR}; font-size: 13px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; cursor: pointer">{icon("plus", 14)}Manage labels</button>'
    return f'<div role="group" aria-label="Filter by label" style="display: flex; gap: 8px; {"overflow: hidden" if mobile else "flex-wrap: wrap"}">{chips}{more}</div>'

def view_switch(active, dev):
    def b(ic, label, key, href):
        on = key == active
        sty = f"background: {S}; color: {INK}; border: 1px solid {LINE}" if on else f"background: transparent; color: {GR}; border: 1px solid transparent"
        cur = ' aria-current="page"' if on else ""
        return f'<a href="{href}-{dev}.dc.html"{cur} aria-label="{label}" title="{label}" style="width: 44px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; text-decoration: none; {sty}">{icon(ic, 18)}</a>'
    return f'<div role="group" aria-label="View" style="display: flex; gap: 4px; padding: 4px; border-radius: 12px; background: {SOFT}">{b("layout-grid", "Grid", "grid", "library")}{b("gallery-horizontal", "Cover flow", "flow", "library-coverflow")}</div>'

# ======================================================== 6. Library
LIB = [("onepiece",106,"unread"),("onepiece",104,None),("blacksad",7,"unread"),("horde",None,None),("dune",None,"reading"),("spy",12,"unread"),
       ("frieren",9,"reading"),("fondation",None,"unread"),("naussicaa",None,"lent"),("berserk",41,None),("peste",None,"unread"),("asterix",40,"unread")]

def library(mobile=False):
    filters = row(chip("All", True, 248) + chip("Not read yet", False, 14) + chip("Reading", False, 2) + chip("Read", False, 231) + chip("Lent out", False, 1), 8, wrap=not mobile,
                  extra="overflow: hidden" if mobile else "")
    search = (f'<div style="position: relative; flex: 1 1 260px; min-width: 0"><label for="q-{"m" if mobile else "d"}" style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0)">Search your Library</label>'
              f'<span style="position: absolute; left: 14px; top: 14px; color: {GR}">{icon("search", 18, GR)}</span>'
              f'<input id="q-{"m" if mobile else "d"}" type="search" placeholder="Title, author, series" style="box-sizing: border-box; width: 100%; min-height: 48px; padding: 0 14px 0 42px; border-radius: 10px; border: 1px solid {LINE}; background: {S}; font-size: 15px"></div>')
    view = segmented(["Books", "Series"], "Books")
    w = 104 if mobile else 140
    items = LIB[:9] if mobile else LIB
    grid = (f'<div style="display: grid; grid-template-columns: repeat({3 if mobile else 6}, minmax(0, 1fr)); gap: {14 if mobile else 24}px">'
            + "".join(f'<a href="book-{"mobile" if mobile else "desktop"}.dc.html" style="text-decoration: none; color: {INK}; display: flex; flex-direction: column; gap: 8px">{cover(k, w, v, m)}'
                      + ("" if mobile else f'<span style="font-size: 13px; font-weight: 600">{COVERS[k][0]}{", vol. " + str(v) if v else ""}</span>') + "</a>" for k, v, m in items) + "</div>")
    legend = row(f'<span style="display: inline-flex; align-items: center; gap: 6px"><span style="width: 10px; height: 10px; border-radius: 5px; background: {CO}"></span>Not read yet</span>'
                 f'<span style="display: inline-flex; align-items: center; gap: 6px"><span style="width: 14px; height: 4px; background: {INK}"></span>Reading</span>', 16, extra=f"font-size: 12px; color: {GR}")
    if mobile:
        return row(h1("Library", 28) + view_switch("grid", "mobile"), justify="space-between") + search + filters + label_row(True) + grid
    return (row(h1("Library") + row(f'<div style="width: 220px">{view}</div>' + view_switch("grid", "desktop"), 12), justify="space-between", wrap=True)
            + row(search + legend, 20, wrap=True) + filters + label_row() + grid)

S_["library-desktop"] = (desktop("Library · desktop", "library", library(), 1060), 1280, 1060, "Library · desktop", True)
S_["library-mobile"] = (mobile("Library · mobile", "library", library(True)), 390, 844, "Library · mobile", False)


# ======================================================== 6b. Library · Cover flow
import json as _json
CF_KEYS = [("onepiece",104),("blacksad",7),("horde",None),("dune",None),("frieren",9),("fondation",None),("naussicaa",None),("berserk",41),("peste",None),("spy",12),("asterix",40),("monde",None)]
CF_STATUS = {"onepiece":"Read","blacksad":"Not read yet","horde":"Read","dune":"Reading","frieren":"Reading","fondation":"Not read yet","naussicaa":"Read · lent to Camille","berserk":"Read","peste":"Not read yet","spy":"Not read yet","asterix":"Not read yet","monde":"Read"}
CF_DATA = [{"key":k,"title":COVERS[k][0] + (f", vol. {v}" if v else ""),"author":COVERS[k][1],"bg":COVERS[k][2],"fg":COVERS[k][3],"status":CF_STATUS[k],"labels":BOOK_LABELS[k]} for k,v in CF_KEYS]

def cf_js(cw, ch, step1, step2):
    return f"""var st = this.state || {{}};
var all = {_json.dumps(CF_DATA, ensure_ascii=False)};
var labelNames = ['All', 'Manga', 'Sci-fi', 'Comics', 'Classics', 'Fantasy'];
var active = st.label || 'All';
var books = active === 'All' ? all : all.filter(function (b) {{ return b.labels.indexOf(active) !== -1; }});
var n = books.length;
var i = Math.min(st.i == null ? Math.floor(n / 2) : st.i, n - 1);
var self = this;
var reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
var shown = books.map(function (b, k) {{
  var o = k - i, a = Math.abs(o), dir = o > 0 ? 1 : -1;
  var x = o === 0 ? 0 : dir * ({step1} + (a - 1) * {step2});
  var ry = o === 0 ? 0 : -dir * 58;
  var sc = o === 0 ? 1 : 0.8;
  var vis = a > 4 ? 0 : 1;
  return {{
    title: b.title, author: b.author, bg: b.bg, fg: b.fg,
    label: o === 0 ? b.title + ', current book' : 'Show ' + b.title,
    style: 'position:absolute;left:50%;top:20px;width:{cw}px;height:{ch}px;margin-left:-{cw//2}px;padding:0;border:0;background:none;cursor:pointer;'
      + 'transform:translateX(' + x + 'px) rotateY(' + ry + 'deg) scale(' + sc + ');z-index:' + (100 - a) + ';opacity:' + vis + ';'
      + (vis ? '' : 'pointer-events:none;') + (reduce ? '' : 'transition:transform 360ms cubic-bezier(.2,.7,.2,1),opacity 220ms;'),
    face: 'width:100%;height:100%;box-sizing:border-box;border-radius:6px;padding:14px;display:flex;flex-direction:column;justify-content:flex-end;text-align:left;'
      + 'background:' + b.bg + ';color:' + b.fg + ';border:1px solid var(--cb);box-shadow:0 ' + (o === 0 ? '24px 48px' : '10px 24px') + ' rgba(0,0,0,' + (o === 0 ? '0.28' : '0.16') + ');'
      + (o === 0 ? '' : 'filter:brightness(0.92);'),
    pick: function () {{ self.setState({{ i: k }}); }}
  }};
}});
var cur = books[i] || all[0];
var chips = labelNames.map(function (name) {{
  var on = name === active;
  return {{ name: name, pressed: on ? 'true' : 'false',
    style: 'flex:none;min-height:36px;padding:0 12px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;'
      + (on ? 'background:var(--co);color:var(--s);border:1px solid var(--co);' : 'background:transparent;color:var(--ink);border:1px solid var(--line);'),
    pick: function () {{ self.setState({{ label: name, i: null }}); }} }};
}});"""

CF_RET = (", books: shown, cur: cur, curLabels: cur.labels.join(' · '), chips: chips, pos: (i + 1) + ' of ' + n, max: n - 1, i: i,"
          " prev: function () { self.setState({ i: Math.max(0, i - 1) }); }, next: function () { self.setState({ i: Math.min(n - 1, i + 1) }); },"
          " onSlide: function (e) { self.setState({ i: Number(e.target.value) }); }")

def cf_stage(h):
    return (f'<div style="position: relative; height: {h}px; perspective: 1100px; overflow: hidden">'
            f'<sc-for list="{{{{books}}}}" as="b" hint-placeholder-count="7">'
            f'<button type="button" aria-label="{{{{b.label}}}}" onClick="{{{{b.pick}}}}" style="{{{{b.style}}}}">'
            f'<span style="{{{{b.face}}}}"><span style="font-size: 14px; font-weight: 700; line-height: 1.15">{{{{b.title}}}}</span>'
            f'<span style="font-size: 11px; margin-top: 4px; opacity: 0.8">{{{{b.author}}}}</span></span></button></sc-for></div>')

def cf_chips():
    return (f'<div role="group" aria-label="Filter by label" style="display: flex; gap: 8px; flex-wrap: wrap">'
            f'<sc-for list="{{{{chips}}}}" as="c" hint-placeholder-count="6"><button type="button" aria-pressed="{{{{c.pressed}}}}" onClick="{{{{c.pick}}}}" style="{{{{c.style}}}}">{{{{c.name}}}}</button></sc-for></div>')

def cf_controls(mobile=False):
    nb = lambda ic, lab, fn: f'<button type="button" aria-label="{lab}" onClick="{{{{{fn}}}}}" style="flex: none; width: 44px; height: 44px; border-radius: 22px; border: 1px solid {LINE}; background: {S}; color: {INK}; display: flex; align-items: center; justify-content: center; cursor: pointer">{icon(ic, 20)}</button>'
    slider = (f'<label for="cf-slide-{"m" if mobile else "d"}" style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0)">Browse your Library</label>'
              f'<input id="cf-slide-{"m" if mobile else "d"}" type="range" min="0" max="{{{{max}}}}" value="{{{{i}}}}" onChange="{{{{onSlide}}}}" style="flex: 1; min-width: 0; accent-color: {INK}">')
    return row(nb("chevron-left", "Previous book", "prev") + slider + nb("chevron-right", "Next book", "next"), 12)

def cf_info(mobile=False):
    return col(f'<span style="font-size: 13px; color: {GR}; font-variant-numeric: tabular-nums">{{{{pos}}}}</span>'
               + f'<a href="book-{"mobile" if mobile else "desktop"}.dc.html" style="font-size: {20 if mobile else 24}px; font-weight: 700; letter-spacing: -0.02em; color: {INK}; text-decoration: none">{{{{cur.title}}}}</a>'
               + f'<span style="font-size: 14px; color: {GR}">{{{{cur.author}}}}</span>'
               + row(f'<span style="font-size: 12px; font-weight: 600; padding: 4px 8px; border-radius: 6px; background: {SOFT}; color: {INK}">{{{{cur.status}}}}</span>'
                     + f'<span style="display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: {GR}">{icon("tag", 13)}{{{{curLabels}}}}</span>', 10, justify="center", wrap=True),
               6, "align-items: center; text-align: center")

def coverflow_desktop():
    return (row(h1("Library") + view_switch("flow", "desktop"), justify="space-between", wrap=True)
            + cf_chips() + cf_stage(420) + cf_info() + f'<div style="max-width: 560px; width: 100%; align-self: center">{cf_controls()}</div>')

def coverflow_mobile():
    return (row(h1("Library", 28) + view_switch("flow", "mobile"), justify="space-between")
            + cf_chips() + cf_stage(320) + cf_info(True) + cf_controls(True))

S_["library-coverflow-desktop"] = (desktop("Library · cover flow · desktop", "library", coverflow_desktop(), 900, js_pre=cf_js(240, 360, 230, 70), js_ret=CF_RET), 1280, 900, "Library · cover flow · desktop", True)
S_["library-coverflow-mobile"] = (mobile("Library · cover flow · mobile", "library", coverflow_mobile(), js_pre=cf_js(170, 255, 128, 34), js_ret=CF_RET), 390, 844, "Library · cover flow · mobile", False)

# ======================================================== 7. Book
def book(mobile=False):
    meta = col(tag("In your Library", "dark", "check") + h1("La Horde du Contrevent", 26 if mobile else 36) + p("Alain Damasio", 16, INK), 8)
    status = col(f'<span style="font-size: 14px; font-weight: 600">Reading status</span>' + segmented(["Not yet", "Reading", "Read", "Abandoned"], "Read")
                 + p("Finished [DATE]", 13), 8)
    copyrow = card(col(
        row(icon("book-open", 18) + col(f'<span style="font-size: 15px; font-weight: 600">Folio SF · paperback</span>' + p("ISBN 978-2-07-[…]", 13), 2, "flex: 1") + tag("Lent", "neutral", "handshake"), 12)
        + f'<div style="height: 1px; background: {LINE}"></div>'
        + row(f'<label for="lent-{"m" if mobile else "d"}" style="font-size: 14px; font-weight: 600; flex: none">Lent to</label>'
              + f'<input id="lent-{"m" if mobile else "d"}" type="text" value="Camille" style="flex: 1; min-width: 0; min-height: 44px; padding: 0 12px; border-radius: 10px; border: 1px solid {LINE}; font-size: 15px">'
              + f'<span style="display: inline-flex; color: {GR}" title="Only on this device until private spaces are released">{icon("lock", 16, GR)}</span>', 10), 14), 16)
    share = row(icon("eye-off", 18, INK) + col(f'<span style="font-size: 15px; font-weight: 600">Reading status is private</span>' + p("Share it to show it on your public profile.", 13), 2, "flex: 1") + toggle(False, "Share reading status"), 12,
                extra=f"padding: 14px 16px; border-radius: 12px; background: {SOFT}")
    lab = lambda n: f'<span style="display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 4px 0 12px; border-radius: 8px; border: 1px solid {LINE}; font-size: 13px; font-weight: 600">{icon("tag", 14)}{n}<button type="button" aria-label="Remove label {n}" style="width: 32px; height: 32px; border: 0; background: transparent; color: {GR}; display: flex; align-items: center; justify-content: center; cursor: pointer">{icon("x", 14)}</button></span>'
    labels = col(row(h2("Labels", 16) + p("Private, like the rest of your Library", 13), 10, "baseline", wrap=True)
                 + row(lab("Sci-fi") + lab("To re-read") + f'<button type="button" style="min-height: 36px; padding: 0 12px; border-radius: 8px; border: 1px dashed {LINE}; background: transparent; color: {INK}; font-size: 13px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; cursor: pointer">{icon("plus", 14)}Add label</button>', 8, wrap=True)
                 + ("" if mobile else p("Suggested from the Catalog: Philosophy · French literature", 13)), 10)
    copies = col(h2("Your copy", 16) + copyrow + row(btn("Add another copy", "secondary", "plus", size="s") + btn("Remove copy", "ghost", "trash-2", size="s"), 8, wrap=True), 12)
    if mobile:
        return row(cover("horde", 96) + meta, 16, "flex-end") + status + labels + share + copies
    return row(cover("horde", 240) + col(meta + status + labels + share + copies, 24, "flex: 1 1 360px; min-width: 0"), 40, "flex-start", wrap=True)

S_["book-desktop"] = (desktop("Book · desktop", "library", f'<a href="library-desktop.dc.html" style="display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; color: {GR}; text-decoration: none; min-height: 44px">{icon("arrow-left", 16)}Library</a>' + book(), 900), 1280, 900, "Book · desktop", True)
S_["book-mobile"] = (mobile("Book · mobile", "library", book(True), back=("library-mobile.dc.html", "Library")), 390, 844, "Book · mobile", False)

# ======================================================== 8. Series
def op_tiles(start, end):
    return [(n, "upcoming" if n == 110 else "missing" if n in (57, 88, 107) else "read" if n <= 104 else "owned") for n in range(start, end + 1)]

def series(mobile=False):
    head = col(row(tag("Following", "accent", "bell") + tag("Glénat · French · standard"), 8, wrap=True) + h1("One Piece", 28 if mobile else 40) + p("Eiichirō Oda", 15, INK), 8)
    summary = row("".join(f'<div style="flex: 1 1 100px; display: flex; flex-direction: column; gap: 2px"><span style="font-size: {22 if mobile else 28}px; font-weight: 700; font-variant-numeric: tabular-nums">{n}</span><span style="font-size: 13px; color: {GR}">{l}</span></div>'
                      for n, l in [("106", "owned"), ("104", "read"), ("3", "missing"), ("110", "next, [DATE]")]), 12, "flex-start", wrap=True)
    missing = card(row(icon("circle-dashed", 20, INK) + col(f'<span style="font-size: 15px; font-weight: 600">Missing: vol. 57, 88, 107</span>' + p("All three are on your To Buy list.", 13), 2, "flex: 1")
                       + (btn("To Buy", "secondary", size="s", href="tobuy-desktop.dc.html") if not mobile else ""), 12), 16)
    grid = col(row(h2("Volumes", 16) + f'<span style="font-size: 13px; color: {GR}">Showing {"91–110" if mobile else "71–110"} of 110</span>', justify="space-between") + tiles(op_tiles(91 if mobile else 71, 110), 40) + spine_legend(), 12)
    actions = row(btn("Switch edition line", "secondary", "layers", size="s") + btn("Stop following", "ghost", "bell", size="s"), 8, wrap=True)
    if mobile:
        return head + summary + missing + grid
    return (f'<a href="library-desktop.dc.html" style="display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; color: {GR}; text-decoration: none; min-height: 44px">{icon("arrow-left", 16)}Library</a>'
            + row(cover("onepiece", 160, 106) + col(head + summary + actions, 20, "flex: 1 1 420px; min-width: 0"), 32, "flex-start", wrap=True) + missing + grid)

S_["series-desktop"] = (desktop("Series · desktop", "library", series(), 1000), 1280, 1000, "Series · desktop", True)
S_["series-mobile"] = (mobile("Series · mobile", "library", series(True), back=("library-mobile.dc.html", "Library")), 390, 844, "Series · mobile", False)

# ======================================================== 9. New & upcoming
def nrow(key, vol, pub, right, dev, w=56):
    t = COVERS[key][0]
    return (f'<div style="display: flex; align-items: center; gap: 14px; padding: 14px 0; border-bottom: 1px solid {LINE}">'
            f'{cover(key, w, vol)}<a href="series-{dev}.dc.html" style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; text-decoration: none; color: {INK}">'
            f'<span style="font-size: 15px; font-weight: 600">{t}, vol. {vol}</span><span style="font-size: 13px; color: {GR}">{pub}</span></a>{right}</div>')

def newpage(mobile=False):
    dev = "mobile" if mobile else "desktop"
    w = 44 if mobile else 56
    act = (lambda: f'<button type="button" aria-label="I bought it" style="width: 44px; height: 44px; border-radius: 10px; border: 1px solid {LINE}; background: {S}; color: {INK}; display: flex; align-items: center; justify-content: center; cursor: pointer">{icon("check", 18)}</button>') if mobile else (lambda: row(btn("Add to To Buy", "secondary", size="s") + btn("I bought it", "primary", size="s"), 8))
    out = col(row(tag("Out now", "accent") + p("In shops in your edition lines", 13), 10)
              + nrow("blacksad", 7, "Dargaud · French · hardcover", act(), dev, w)
              + nrow("spy", 13, "Kurokawa · French", act(), dev, w), 0)
    up = col(row(tag("Announced") + p("Dates can still move", 13), 10)
             + nrow("onepiece", 110, "Glénat · French · standard", f'<span style="font-size: 14px; font-weight: 600; white-space: nowrap">[DATE]</span>', dev, w)
             + nrow("frieren", 14, "Ki-oon · French", f'<span style="font-size: 14px; font-weight: 600; white-space: nowrap">[DATE]</span>', dev, w), 0)
    note = row(icon("info", 18, GR) + p("Release dates come from open book databases and from readers’ reports, so some may be missing.", 13, extra="flex: 1"), 10, "flex-start")
    report = btn("Report a release", "secondary", "plus", size="s")
    if mobile:
        return h1("New &amp; upcoming", 28) + out + up + note
    return row(h1("New &amp; upcoming") + report, justify="space-between", wrap=True) + card(col(out + up, 28), 24) + note

S_["new-desktop"] = (desktop("New & upcoming · desktop", "new", newpage(), 900), 1280, 900, "New & upcoming · desktop", True)
S_["new-mobile"] = (mobile("New & upcoming · mobile", "home", newpage(True), back=("home-mobile.dc.html", "Home")), 390, 844, "New & upcoming · mobile", False)

# ======================================================== 10. To Buy
def tobuy(mobile=False):
    dev = "mobile" if mobile else "desktop"
    w = 44 if mobile else 56
    bought = lambda: f'<button type="button" aria-label="Mark as bought" style="flex: none; width: 44px; height: 44px; border-radius: 22px; border: 1.5px solid {INK}; background: {S}; color: {INK}; display: flex; align-items: center; justify-content: center; cursor: pointer">{icon("check", 18)}</button>'
    def r(key, vol, pub, why):
        t = COVERS[key][0]
        name = f"{t}, vol. {vol}" if vol else t
        return (f'<div style="display: flex; align-items: center; gap: 14px; padding: 12px 0; border-bottom: 1px solid {LINE}">{cover(key, w, vol)}'
                f'<div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px"><span style="font-size: 15px; font-weight: 600">{name}</span>'
                f'<span style="font-size: 13px; color: {GR}">{pub}</span>{"" if mobile else why}</div>{bought()}</div>')
    auto = col(row(h2("Missing volumes", 16) + p("Added automatically from series you follow", 13), 10, "baseline", wrap=True)
               + r("onepiece", 57, "Glénat · French · standard", tag("Gap in your series"))
               + r("onepiece", 107, "Glénat · French · standard", tag("Gap in your series"))
               + r("blacksad", 8 if False else 7, "Dargaud · New volume", tag("New volume", "accent")) if False else
               col(row(h2("Missing volumes", 16) + p("From series you follow", 13), 10, "baseline", wrap=True)
                   + r("onepiece", 57, "Glénat · French", tag("Gap in your series"))
                   + r("onepiece", 88, "Glénat · French", tag("Gap in your series"))
                   + r("onepiece", 107, "Glénat · French", tag("Gap in your series"))
                   + r("spy", 13, "Kurokawa · out now", tag("New volume", "accent")), 0), 0)
    mine = col(h2("Added by you", 16) + r("horde", None, "La Volte · hardcover edition", tag("Added by hand")), 0)
    off = row(icon("zap-off", 16, GR) + p("Available offline in shops", 13), 8)
    if mobile:
        return row(h1("To Buy", 28) + f'<span style="font-size: 14px; color: {GR}">5 books</span>', justify="space-between", align="baseline") + auto + mine
    return row(h1("To Buy") + off, justify="space-between", wrap=True) + card(auto, 24) + card(mine, 24)

S_["tobuy-desktop"] = (desktop("To Buy · desktop", "tobuy", tobuy(), 900), 1280, 900, "To Buy · desktop", True)
S_["tobuy-mobile"] = (mobile("To Buy · mobile", "tobuy", tobuy(True)), 390, 844, "To Buy · mobile", False)

# ======================================================== 11. Settings & privacy
def settings(mobile=False):
    def line(ic, title, sub, right):
        return row(icon(ic, 20, INK) + col(f'<span style="font-size: 15px; font-weight: 600">{title}</span>' + (p(sub, 13) if sub else ""), 2, "flex: 1; min-width: 0") + right, 12,
                   extra=f"padding: 12px 0; border-bottom: 1px solid {LINE}")
    locked = f'<span style="display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: {GR}; white-space: nowrap">{icon("lock", 14, GR)}Always private</span>'
    priv = col(h2("What others can see", 16) + p("Everything is private unless you share it. Shared items are public on the AT Protocol network.", 13)
               + line("book-open", "Reading statuses", "Hide single books from each book’s page", toggle(False, "Share reading statuses"))
               + line("layers", "Followed series", None, toggle(False, "Share followed series"))
               + line("tag", "Labels", None, toggle(False, "Share labels"))
               + line("library", "Books you own", None, locked)
               + line("shopping-bag", "To Buy list", None, locked)
               + line("handshake", "Who you lent books to", None, locked), 8)
    acct = col(h2("Account", 16)
               + line("user", "you.atomes.app", "Signed in with AT Protocol", "")
               + line("server", "Your PDS", "[YOUR PDS ADDRESS]", f'<span style="font-size: 13px; color: {GR}">Self-hosted</span>'), 8)
    notif = col(h2("Alerts", 16)
                + line("bell", "New volume alerts", "One notification when a volume reaches shops", toggle(True, "New volume alerts"))
                + p("On iPhone, add Atomes to your Home Screen to receive alerts.", 13), 8)
    appear = col(h2("Appearance", 16) + segmented(["System", "Light", "Dark"], "System") + p("System follows your phone or computer setting.", 13), 10)
    data = row(btn("Export my records", "secondary", "share-2", size="s") + btn("Sign out", "ghost", "log-out", size="s", href="signin-mobile.dc.html" if mobile else "Main.dc.html"), 8, wrap=True)
    if mobile:
        return h1("You", 28) + appear + priv + notif
    return h1("Settings") + row(card(priv, 24, "flex: 1 1 420px; min-width: 0") + col(card(acct, 24) + card(appear, 24) + card(notif, 24) + data, 24, "flex: 1 1 320px; min-width: 0"), 24, "flex-start", wrap=True)

S_["settings-desktop"] = (desktop("Settings · desktop", "settings", settings(), 900), 1280, 900, "Settings · desktop", True)
S_["settings-mobile"] = (mobile("Settings · mobile", "settings", settings(True)), 390, 844, "Settings · mobile", False)
