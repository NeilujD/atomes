# Library in three display modes (grid, list, cover flow) sharing one toolbar,
# one label filter design and one search / sort / filter model.
import json
from lib import *

def H(x):
    return "{{" + x + "}}"

# ------------------------------------------------------------------ data
# (cover key, title, volume, volume title, series, author, author sort key, status, lent, labels, added order)
BOOKS = [
    ("onepiece", "One Piece", 104, None, "One Piece", "Eiichirō Oda", "Oda", "read", False, ["Manga"], 3),
    ("onepiece", "One Piece", 105, None, "One Piece", "Eiichirō Oda", "Oda", "unread", False, ["Manga"], 7),
    ("onepiece", "One Piece", 106, None, "One Piece", "Eiichirō Oda", "Oda", "unread", False, ["Manga"], 14),
    ("blacksad", "Blacksad", 7, "Alors, tout tombe, seconde partie", "Blacksad", "Díaz Canales · Guarnido", "Díaz Canales", "unread", False, ["Comics", "Crime"], 16),
    ("asterix", "Astérix", 40, "L’Iris blanc", "Astérix", "Fabcaro · Didier Conrad", "Fabcaro", "unread", False, ["Comics"], 12),
    ("horde", "La Horde du Contrevent", None, None, None, "Alain Damasio", "Damasio", "read", False, ["Sci-fi", "To re-read"], 1),
    ("dune", "Dune", 1, None, "Dune", "Frank Herbert", "Herbert", "reading", False, ["Sci-fi", "Classics"], 9),
    ("frieren", "Frieren", 9, None, "Frieren", "Kanehito Yamada", "Yamada", "reading", False, ["Manga", "Fantasy"], 13),
    ("fondation", "Fondation", 1, None, "Fondation", "Isaac Asimov", "Asimov", "unread", False, ["Sci-fi", "Classics"], 11),
    ("naussicaa", "Nausicaä", 1, None, "Nausicaä", "Hayao Miyazaki", "Miyazaki", "read", True, ["Manga", "Sci-fi"], 4),
    ("berserk", "Berserk", 41, None, "Berserk", "Kentarō Miura", "Miura", "read", False, ["Manga", "Fantasy"], 6),
    ("peste", "La Peste", None, None, None, "Albert Camus", "Camus", "unread", False, ["Classics"], 10),
    ("spy", "Spy×Family", 12, None, "Spy×Family", "Tatsuya Endō", "Endō", "unread", False, ["Manga"], 15),
    ("monde", "Le Monde de Narnia", None, None, None, "C. S. Lewis", "Lewis", "read", False, ["Fantasy", "Classics"], 2),
    ("frieren", "Frieren", 8, None, "Frieren", "Kanehito Yamada", "Yamada", "read", False, ["Manga", "Fantasy"], 8),
    ("dune", "Le Messie de Dune", 2, None, "Dune", "Frank Herbert", "Herbert", "unread", False, ["Sci-fi"], 5),
]
DATA = [{"key": k, "title": t, "vol": v, "volTitle": vt, "series": s, "author": a, "authorSort": asort, "status": st, "lent": lent,
         "labels": lab, "added": add, "bg": COVERS[k][2], "fg": COVERS[k][3]} for k, t, v, vt, s, a, asort, st, lent, lab, add in BOOKS]
AUTHORS = sorted({b["author"] for b in DATA}, key=lambda x: [d for d in DATA if d["author"] == x][0]["authorSort"])
SERIES = sorted({b["series"] for b in DATA if b["series"]})
LABELS = ["Manga", "Sci-fi", "Comics", "Classics", "Fantasy", "Crime", "To re-read"]

COMMON_JS = r"""var st = this.state || {};
var self = this;
var all = __DATA__;
var labelNames = __LABELS__;
var q = (st.q || '').trim().toLowerCase();
var field = st.field || 'all';
var sort = st.sort || 'title';
var status = st.status || 'all';
var label = st.label || 'All';
var author = st.author || 'any';
var series = st.series || 'any';
var showFilters = !!st.showFilters;
function fold(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function hay(b) {
  if (field === 'title') return b.title;
  if (field === 'author') return b.author;
  if (field === 'series') return b.series || '';
  if (field === 'volume') return b.volTitle || '';
  return [b.title, b.author, b.series || '', b.volTitle || ''].join(' ');
}
function statusOk(b, s) {
  if (s === 'all') return true;
  if (s === 'lent') return b.lent;
  return b.status === s;
}
function base(b, skipLabel, skipStatus) {
  return (!q || fold(hay(b)).indexOf(fold(q)) !== -1)
    && (skipStatus || statusOk(b, status))
    && (skipLabel || label === 'All' || b.labels.indexOf(label) !== -1)
    && (author === 'any' || b.author === author)
    && (series === 'any' || b.series === series);
}
var books = all.filter(function (b) { return base(b, false, false); });
var cmp = function (a, b) { return fold(a).localeCompare(fold(b), 'fr'); };
books.sort(function (a, b) {
  if (sort === 'author') return cmp(a.authorSort, b.authorSort) || cmp(a.title, b.title) || (a.vol || 0) - (b.vol || 0);
  if (sort === 'series') return cmp(a.series || a.title, b.series || b.title) || (a.vol || 0) - (b.vol || 0);
  if (sort === 'added') return b.added - a.added;
  return cmp(a.title, b.title) || (a.vol || 0) - (b.vol || 0);
});
var statusLabels = { unread: 'Not read yet', reading: 'Reading', read: 'Read' };
books = books.map(function (b) {
  var name = b.title + (b.vol && b.series === b.title ? ', vol. ' + b.vol : '');
  var meta = b.series && b.series !== b.title ? b.series + ', vol. ' + b.vol : (b.vol ? 'Vol. ' + b.vol : 'Standalone');
  return Object.assign({}, b, {
    name: name,
    seriesLine: b.series ? b.series + ' · vol. ' + b.vol : 'Standalone',
    meta: meta,
    statusText: (statusLabels[b.status] || '') + (b.lent ? ' · lent' : ''),
    labelText: b.labels.join(' · '),
    hasVolTitle: !!b.volTitle,
    isUnread: b.status === 'unread',
    isReading: b.status === 'reading',
    isLent: b.lent,
    face: 'background:' + b.bg + ';color:' + b.fg + ';'
  });
});
function chip(name, count, on, kind, pick) {
  return { name: name, count: count, pressed: on ? 'true' : 'false', pick: pick,
    style: 'flex:none;min-height:36px;padding:0 12px;border-radius:' + (kind === 'label' ? '8px' : '18px') + ';font-size:13px;font-weight:600;display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-family:inherit;'
      + (on ? (kind === 'label' ? 'background:var(--co);color:var(--s);border:1px solid var(--co);' : 'background:var(--ink);color:var(--s);border:1px solid var(--ink);')
            : 'background:' + (kind === 'label' ? 'transparent' : 'var(--s)') + ';color:var(--ink);border:1px solid var(--line);') };
}
var statusDefs = [['all', 'All'], ['unread', 'Not read yet'], ['reading', 'Reading'], ['read', 'Read'], ['lent', 'Lent out']];
var chipsStatus = statusDefs.map(function (d) {
  var c = all.filter(function (b) { return base(b, false, true) && statusOk(b, d[0]); }).length;
  return chip(d[1], c, status === d[0], 'status', function () { self.setState({ status: d[0], i: null }); });
});
var chipsLabel = ['All'].concat(labelNames).map(function (n) {
  var c = all.filter(function (b) { return base(b, true, false) && (n === 'All' || b.labels.indexOf(n) !== -1); }).length;
  return chip(n === 'All' ? 'All labels' : n, c, label === n, 'label', function () { self.setState({ label: n, i: null }); });
});
var filtered = q || status !== 'all' || label !== 'All' || author !== 'any' || series !== 'any';
var countText = filtered ? books.length + ' of ' + all.length + ' books' : all.length + ' books';
var activeFilters = (status !== 'all' ? 1 : 0) + (author !== 'any' ? 1 : 0) + (series !== 'any' ? 1 : 0) + (field !== 'all' ? 1 : 0);
"""

COMMON_RET = (", books: books, chipsStatus: chipsStatus, chipsLabel: chipsLabel, q: st.q || '', field: field, sort: sort, author: author, series: series,"
              " countText: countText, empty: books.length === 0, hasBooks: books.length > 0, filtered: filtered, showFilters: showFilters,"
              " filterBadge: activeFilters ? String(activeFilters) : '', hasFilterBadge: activeFilters > 0,"
              " onQ: function (e) { self.setState({ q: e.target.value, i: null }); },"
              " onField: function (e) { self.setState({ field: e.target.value, i: null }); },"
              " onSort: function (e) { self.setState({ sort: e.target.value, i: null }); },"
              " onAuthor: function (e) { self.setState({ author: e.target.value, i: null }); },"
              " onSeries: function (e) { self.setState({ series: e.target.value, i: null }); },"
              " toggleFilters: function () { self.setState({ showFilters: !showFilters }); },"
              " clearAll: function () { self.setState({ q: '', field: 'all', status: 'all', label: 'All', author: 'any', series: 'any', i: null }); }")

def common_js():
    return COMMON_JS.replace("__DATA__", json.dumps(DATA, ensure_ascii=False)).replace("__LABELS__", json.dumps(LABELS, ensure_ascii=False))

LIST_JS = r"""
function firstLetter(b) {
  var s = sort === 'author' ? b.authorSort : sort === 'series' ? (b.series || b.title) : b.title;
  var c = fold(s).charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
}
var groups = [];
if (sort === 'added') {
  groups = books.length ? [{ letter: 'Recently added', id: 'L-recent', items: books }] : [];
} else {
  books.forEach(function (b) {
    var l = firstLetter(b);
    var g = groups.length ? groups[groups.length - 1] : null;
    if (!g || g.letter !== l) { g = { letter: l, id: 'L-' + l, items: [] }; groups.push(g); }
    g.items.push(b);
  });
}
var present = {};
groups.forEach(function (g) { present[g.letter] = true; });
var rail = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(function (l) {
  var has = !!present[l];
  return { l: l, href: '#L-' + l, has: has, none: !has,
    style: 'display:flex;align-items:center;justify-content:center;width:24px;height:' + __RAILH__ + 'px;font-size:11px;font-weight:' + (has ? '700' : '500') + ';text-decoration:none;color:' + (has ? 'var(--ink)' : 'var(--line)') + ';' };
});
var sortNames = { title: 'by title', author: 'by author', series: 'by series', added: 'by date added' };
"""
LIST_RET = ", groups: groups, rail: rail, sortNote: 'Sorted ' + sortNames[sort]"

FLOW_JS = r"""
var n = books.length;
var i = n ? Math.min(st.i == null ? Math.floor(n / 2) : st.i, n - 1) : 0;
var reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
var shown = books.map(function (b, k) {
  var o = k - i, a = Math.abs(o), dir = o > 0 ? 1 : -1;
  var x = o === 0 ? 0 : dir * (__S1__ + (a - 1) * __S2__);
  var ry = o === 0 ? 0 : -dir * 58;
  var sc = o === 0 ? 1 : 0.8;
  var vis = a > 4 ? 0 : 1;
  return Object.assign({}, b, {
    label: o === 0 ? b.name + ', current book' : 'Show ' + b.name,
    style: 'position:absolute;left:50%;top:20px;width:__CW__px;height:__CH__px;margin-left:-__HW__px;padding:0;border:0;background:none;cursor:pointer;font-family:inherit;'
      + 'transform:translateX(' + x + 'px) rotateY(' + ry + 'deg) scale(' + sc + ');z-index:' + (100 - a) + ';opacity:' + vis + ';'
      + (vis ? '' : 'pointer-events:none;') + (reduce ? '' : 'transition:transform 360ms cubic-bezier(.2,.7,.2,1),opacity 220ms;'),
    flowFace: 'width:100%;height:100%;box-sizing:border-box;border-radius:6px;padding:14px;display:flex;flex-direction:column;justify-content:flex-end;text-align:left;'
      + b.face + 'border:1px solid var(--cb);box-shadow:0 ' + (o === 0 ? '24px 48px' : '10px 24px') + ' rgba(0,0,0,' + (o === 0 ? '0.28' : '0.16') + ');'
      + (o === 0 ? '' : 'filter:brightness(0.92);'),
    pick: function () { self.setState({ i: k }); }
  });
});
var cur = books[i] || { name: 'No book', author: '', statusText: '', labelText: '', meta: '' };
"""
FLOW_RET = (", shown: shown, cur: cur, pos: n ? (i + 1) + ' of ' + n : '0 of 0', max: Math.max(0, n - 1), i: i,"
            " prev: function () { self.setState({ i: Math.max(0, i - 1) }); }, next: function () { self.setState({ i: Math.min(n - 1, i + 1) }); },"
            " onSlide: function (e) { self.setState({ i: Number(e.target.value) }); }")

# ------------------------------------------------------------------ shared markup
def view_switch(active, dev):
    def b(ic, label, key, href):
        on = key == active
        sty = f"background: {S}; color: {INK}; border: 1px solid {LINE}" if on else f"background: transparent; color: {GR}; border: 1px solid transparent"
        cur = ' aria-current="page"' if on else ""
        return f'<a href="{href}-{dev}.dc.html"{cur} aria-label="{label}" title="{label}" style="width: 44px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; text-decoration: none; {sty}">{icon(ic, 18)}</a>'
    return (f'<div role="group" aria-label="View" style="display: flex; gap: 4px; padding: 4px; border-radius: 12px; background: {SOFT}">'
            f'{b("layout-grid", "Grid", "grid", "library")}{b("list", "List", "list", "library-list")}{b("gallery-horizontal", "Cover flow", "flow", "library-coverflow")}</div>')

def chips_row(listname, aria, with_icon, mobile):
    ico = icon("tag", 14) if with_icon else ""
    scroll = "overflow-x: auto; padding-bottom: 2px; margin-right: -20px; padding-right: 20px" if mobile else "flex-wrap: wrap"
    return (f'<div role="group" aria-label="{aria}" style="display: flex; gap: 8px; {scroll}">'
            f'<sc-for list="{H(listname)}" as="c" hint-placeholder-count="6"><button type="button" aria-pressed="{H("c.pressed")}" onClick="{H("c.pick")}" style="{H("c.style")}">'
            f'{ico}<span>{H("c.name")}</span><span style="opacity: 0.7; font-variant-numeric: tabular-nums">{H("c.count")}</span></button></sc-for></div>')

def label_chips(mobile=False):
    return chips_row("chipsLabel", "Filter by label", True, mobile)

def status_chips(mobile=False):
    return chips_row("chipsStatus", "Filter by reading status", False, mobile)

SEL = (f"font-family: inherit; box-sizing: border-box; min-height: 44px; padding: 0 36px 0 12px; border-radius: 10px; border: 1px solid {LINE}; background: {S}; color: {INK}; font-size: 14px; font-weight: 500; cursor: pointer")

def select(id_, label, handler, value, options, hide_label=False, width=None):
    lab_sty = "position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0)" if hide_label else f"font-size: 12px; font-weight: 600; color: {GR}"
    opts = "".join(f'<option value="{v}">{t}</option>' for v, t in options)
    w = f"width: {width}; " if width else ""
    return (f'<div style="display: flex; flex-direction: column; gap: 4px; position: relative; {w}min-width: 0">'
            f'<label for="{id_}" style="{lab_sty}">{label}</label>'
            f'<select id="{id_}" value="{H(value)}" onChange="{H(handler)}" style="{SEL}; width: 100%">{opts}</select></div>')

FIELD_OPTS = [("all", "All fields"), ("title", "Title"), ("author", "Author"), ("series", "Series name"), ("volume", "Volume title")]
SORT_OPTS = [("title", "Title, A to Z"), ("author", "Author"), ("series", "Series and volume"), ("added", "Recently added")]
AUTHOR_OPTS = [("any", "Any author")] + [(a, a) for a in AUTHORS]
SERIES_OPTS = [("any", "Any series")] + [(s, s) for s in SERIES]

def search_box(id_):
    return (f'<div style="position: relative; flex: 1 1 280px; min-width: 0"><label for="{id_}" style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0)">Search your Library</label>'
            f'<span style="position: absolute; left: 14px; top: 13px; color: {GR}; display: flex">{icon("search", 18, GR)}</span>'
            f'<input id="{id_}" type="search" value="{H("q")}" onChange="{H("onQ")}" placeholder="Title, author, series, volume title" '
            f'style="box-sizing: border-box; width: 100%; min-height: 44px; padding: 0 14px 0 42px; border-radius: 10px; border: 1px solid {LINE}; background: {S}; color: {INK}; font-size: 15px"></div>')

def clear_link():
    return (f'<sc-if value="{H("filtered")}" hint-placeholder-val="{H("false")}"><button type="button" onClick="{H("clearAll")}" '
            f'style="min-height: 44px; padding: 0 8px; border: 0; background: transparent; color: {CO}; font-size: 14px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px">{icon("search-x", 16, CO)}Clear all</button></sc-if>')

def toolbar_desktop(mode, sfx):
    return col(
        row(h1("Library") + view_switch(mode, "desktop"), justify="space-between", wrap=True)
        + row(search_box(f"q-{sfx}") + select(f"field-{sfx}", "Search in", "onField", "field", FIELD_OPTS, width="170px")
              + select(f"sort-{sfx}", "Sort by", "onSort", "sort", SORT_OPTS, width="190px"), 12, "flex-end", wrap=True)
        + row(select(f"author-{sfx}", "Author", "onAuthor", "author", AUTHOR_OPTS, width="220px")
              + select(f"series-{sfx}", "Series", "onSeries", "series", SERIES_OPTS, width="200px")
              + f'<div style="flex: 1"></div><span style="font-size: 14px; color: {GR}; font-variant-numeric: tabular-nums; min-height: 44px; display: inline-flex; align-items: center">{H("countText")}</span>' + clear_link(),
              12, "flex-end", wrap=True)
        + status_chips() + label_chips(), 16)

def toolbar_mobile(mode, sfx):
    fbtn = (f'<button type="button" onClick="{H("toggleFilters")}" aria-expanded="{H("showFilters")}" style="flex: none; position: relative; min-height: 44px; padding: 0 12px; border-radius: 10px; border: 1px solid {LINE}; background: {S}; color: {INK}; font-size: 14px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; cursor: pointer">'
            f'{icon("sliders-horizontal", 18)}<span>Sort</span><sc-if value="{H("hasFilterBadge")}" hint-placeholder-val="{H("false")}"><span style="min-width: 18px; height: 18px; border-radius: 9px; background: {CO}; color: {S}; font-size: 11px; display: inline-flex; align-items: center; justify-content: center">{H("filterBadge")}</span></sc-if></button>')
    panel = (f'<sc-if value="{H("showFilters")}" hint-placeholder-val="{H("false")}"><div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 14px; border-radius: 14px; background: {S}; border: 1px solid {LINE}">'
             + select(f"field-{sfx}", "Search in", "onField", "field", FIELD_OPTS) + select(f"sort-{sfx}", "Sort by", "onSort", "sort", SORT_OPTS)
             + select(f"author-{sfx}", "Author", "onAuthor", "author", AUTHOR_OPTS) + select(f"series-{sfx}", "Series", "onSeries", "series", SERIES_OPTS)
             + f'<div style="grid-column: 1 / -1">{status_chips(True)}</div></div></sc-if>')
    return col(
        row(h1("Library", 28) + view_switch(mode, "mobile"), justify="space-between")
        + row(search_box(f"q-{sfx}") + fbtn, 8)
        + panel + label_chips(True)
        + row(f'<span style="font-size: 13px; color: {GR}; font-variant-numeric: tabular-nums">{H("countText")}</span>' + clear_link(), justify="space-between", extra="min-height: 28px"), 12, "flex: none")

def empty_state(dev):
    return (f'<sc-if value="{H("empty")}" hint-placeholder-val="{H("false")}"><div style="display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 48px 16px; text-align: center">'
            f'{icon("search-x", 28, GR)}<span style="font-size: 16px; font-weight: 600">No book matches these filters</span>'
            f'<button type="button" onClick="{H("clearAll")}" style="min-height: 44px; padding: 0 16px; border-radius: 10px; border: 1px solid {LINE}; background: {S}; color: {INK}; font-size: 14px; font-weight: 600; cursor: pointer">Clear all filters</button></div></sc-if>')

def mini_cover(w, holes_prefix="b"):
    h = round(w * 1.5)
    return (f'<span style="position: relative; flex: none; width: {w}px; height: {h}px; border-radius: 4px; box-sizing: border-box; padding: {5 if w < 60 else 10}px; display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; border: 1px solid var(--cb); {H(holes_prefix + ".face")}">'
            + (f'<span style="font-size: {9 if w < 60 else 13}px; font-weight: 700; line-height: 1.15">{H(holes_prefix + ".name")}</span>')
            + f'<sc-if value="{H(holes_prefix + ".isUnread")}" hint-placeholder-val="{H("false")}"><span aria-label="Not read yet" style="position: absolute; top: 5px; right: 5px; width: 9px; height: 9px; border-radius: 5px; background: {CO}; box-shadow: 0 0 0 2px {S}"></span></sc-if>'
            + f'<sc-if value="{H(holes_prefix + ".isReading")}" hint-placeholder-val="{H("false")}"><span aria-label="Reading" style="position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: {INK}"></span></sc-if>'
            + f'<sc-if value="{H(holes_prefix + ".isLent")}" hint-placeholder-val="{H("false")}"><span style="position: absolute; top: 5px; left: 5px; font-size: 9px; font-weight: 600; padding: 2px 5px; border-radius: 4px; background: #FFFFFF; color: #17181C">Lent</span></sc-if>'
            + '</span>')

# ------------------------------------------------------------------ grid
def grid_view(mobile):
    dev = "mobile" if mobile else "desktop"
    w = 104 if mobile else 140
    cols = 3 if mobile else 6
    cell = (f'<a href="book-{dev}.dc.html" style="text-decoration: none; color: {INK}; display: flex; flex-direction: column; gap: 8px; min-width: 0">'
            + mini_cover(w)
            + ("" if mobile else f'<span style="display: flex; flex-direction: column; gap: 2px"><span style="font-size: 13px; font-weight: 600">{H("b.name")}</span><span style="font-size: 12px; color: {GR}">{H("b.author")}</span></span>')
            + "</a>")
    return (f'<sc-if value="{H("hasBooks")}" hint-placeholder-val="{H("true")}"><div style="display: grid; grid-template-columns: repeat({cols}, minmax(0, 1fr)); gap: {14 if mobile else 24}px">'
            f'<sc-for list="{H("books")}" as="b" hint-placeholder-count="{9 if mobile else 12}">{cell}</sc-for></div></sc-if>' + empty_state(dev))

# ------------------------------------------------------------------ list
def list_view(mobile):
    dev = "mobile" if mobile else "desktop"
    if mobile:
        rowm = (f'<a href="book-{dev}.dc.html" style="display: flex; align-items: center; gap: 12px; min-height: 64px; padding: 8px 0; border-bottom: 1px solid {LINE}; text-decoration: none; color: {INK}">'
                + mini_cover(40)
                + f'<span style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px">'
                  f'<span style="font-size: 15px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{H("b.name")}</span>'
                  f'<sc-if value="{H("b.hasVolTitle")}" hint-placeholder-val="{H("false")}"><span style="font-size: 13px; color: {INK}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{H("b.volTitle")}</span></sc-if>'
                  f'<span style="font-size: 13px; color: {GR}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{H("b.author")}</span></span>'
                + f'<span style="flex: none; font-size: 12px; color: {GR}">{H("b.statusText")}</span></a>')
        header = (f'<h3 id="{H("g.id")}" style="position: sticky; top: 0; z-index: 1; margin: 0; padding: 10px 0 6px; background: {G}; font-size: 13px; font-weight: 700; color: {GR}; border-bottom: 1px solid {LINE}">{H("g.letter")}</h3>')
        rail = (f'<nav aria-label="Jump to letter" style="flex: none; display: flex; flex-direction: column; align-items: center; padding-left: 4px">'
                f'<sc-for list="{H("rail")}" as="r" hint-placeholder-count="26"><a href="{H("r.href")}" aria-label="Jump to {H("r.l")}" style="{H("r.style")}">{H("r.l")}</a></sc-for></nav>')
        listing = (f'<div style="flex: 1; min-height: 0; display: flex; gap: 4px">'
                   f'<div style="flex: 1; min-width: 0; overflow-y: auto">'
                   f'<sc-for list="{H("groups")}" as="g" hint-placeholder-count="5"><section aria-labelledby="{H("g.id")}">{header}'
                   f'<sc-for list="{H("g.items")}" as="b" hint-placeholder-count="2">{rowm}</sc-for></section></sc-for>{empty_state(dev)}</div>{rail}</div>')
        return listing
    cellhead = f"font-size: 12px; font-weight: 600; color: {GR}"
    head = (f'<div aria-hidden="true" style="display: grid; grid-template-columns: 56px minmax(0, 2.4fr) minmax(0, 1.4fr) minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1.2fr); gap: 16px; padding: 0 0 8px; border-bottom: 1px solid {LINE}">'
            f'<span></span><span style="{cellhead}">Title</span><span style="{cellhead}">Author</span><span style="{cellhead}">Series</span><span style="{cellhead}">Status</span><span style="{cellhead}">Labels</span></div>')
    rowd = (f'<a href="book-{dev}.dc.html" style="display: grid; grid-template-columns: 56px minmax(0, 2.4fr) minmax(0, 1.4fr) minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1.2fr); gap: 16px; align-items: center; min-height: 76px; padding: 8px 0; border-bottom: 1px solid {LINE}; text-decoration: none; color: {INK}">'
            + mini_cover(44)
            + f'<span style="min-width: 0; display: flex; flex-direction: column; gap: 2px"><span style="font-size: 15px; font-weight: 600">{H("b.name")}</span>'
              f'<sc-if value="{H("b.hasVolTitle")}" hint-placeholder-val="{H("false")}"><span style="font-size: 13px; color: {GR}">{H("b.volTitle")}</span></sc-if></span>'
            + f'<span style="font-size: 14px">{H("b.author")}</span>'
            + f'<span style="font-size: 14px; color: {GR}">{H("b.seriesLine")}</span>'
            + f'<span style="font-size: 13px">{H("b.statusText")}</span>'
            + f'<span style="display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: {GR}">{icon("tag", 13)}<span>{H("b.labelText")}</span></span></a>')
    header = (f'<h3 id="{H("g.id")}" style="position: sticky; top: 0; z-index: 1; margin: 0; padding: 18px 0 8px; background: {G}; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; color: {INK}">{H("g.letter")}</h3>')
    rail = (f'<nav aria-label="Jump to letter" style="flex: none; position: sticky; top: 24px; align-self: flex-start; display: flex; flex-direction: column">'
            f'<sc-for list="{H("rail")}" as="r" hint-placeholder-count="26"><a href="{H("r.href")}" aria-label="Jump to {H("r.l")}" style="{H("r.style")}">{H("r.l")}</a></sc-for></nav>')
    return (f'<div style="display: flex; gap: 16px; align-items: flex-start"><div style="flex: 1; min-width: 0; overflow-x: auto"><div style="min-width: 760px">'
            + f'<sc-if value="{H("hasBooks")}" hint-placeholder-val="{H("true")}">{head}</sc-if>'
            + f'<sc-for list="{H("groups")}" as="g" hint-placeholder-count="6"><section aria-labelledby="{H("g.id")}">{header}'
            + f'<sc-for list="{H("g.items")}" as="b" hint-placeholder-count="2">{rowd}</sc-for></section></sc-for>'
            + f'{empty_state(dev)}</div></div>{rail}</div>')

# ------------------------------------------------------------------ cover flow
def flow_view(mobile):
    dev = "mobile" if mobile else "desktop"
    h = 320 if mobile else 420
    stage = (f'<sc-if value="{H("hasBooks")}" hint-placeholder-val="{H("true")}"><div style="position: relative; height: {h}px; perspective: 1100px; overflow: hidden; flex: none">'
             f'<sc-for list="{H("shown")}" as="b" hint-placeholder-count="7">'
             f'<button type="button" aria-label="{H("b.label")}" onClick="{H("b.pick")}" style="{H("b.style")}">'
             f'<span style="{H("b.flowFace")}"><span style="font-size: 14px; font-weight: 700; line-height: 1.15">{H("b.name")}</span>'
             f'<span style="font-size: 11px; margin-top: 4px; opacity: 0.8">{H("b.author")}</span></span></button></sc-for></div>')
    info = col(f'<span style="font-size: 13px; color: {GR}; font-variant-numeric: tabular-nums">{H("pos")}</span>'
               + f'<a href="book-{dev}.dc.html" style="font-size: {20 if mobile else 24}px; font-weight: 700; letter-spacing: -0.02em; color: {INK}; text-decoration: none">{H("cur.name")}</a>'
               + f'<sc-if value="{H("cur.hasVolTitle")}" hint-placeholder-val="{H("false")}"><span style="font-size: 14px; color: {INK}">{H("cur.volTitle")}</span></sc-if>'
               + f'<span style="font-size: 14px; color: {GR}">{H("cur.author")} · {H("cur.meta")}</span>'
               + row(f'<span style="font-size: 12px; font-weight: 600; padding: 4px 8px; border-radius: 6px; background: {SOFT}; color: {INK}">{H("cur.statusText")}</span>'
                     + f'<span style="display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: {GR}">{icon("tag", 13)}{H("cur.labelText")}</span>', 10, justify="center", wrap=True),
               6, "align-items: center; text-align: center")
    nb = lambda ic, lab, fn: f'<button type="button" aria-label="{lab}" onClick="{H(fn)}" style="flex: none; width: 44px; height: 44px; border-radius: 22px; border: 1px solid {LINE}; background: {S}; color: {INK}; display: flex; align-items: center; justify-content: center; cursor: pointer">{icon(ic, 20)}</button>'
    sid = f"cf-slide-{'m' if mobile else 'd'}"
    slider = (f'<label for="{sid}" style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0)">Browse your Library</label>'
              f'<input id="{sid}" type="range" min="0" max="{H("max")}" value="{H("i")}" onChange="{H("onSlide")}" style="flex: 1; min-width: 0; accent-color: {INK}">')
    controls = row(nb("chevron-left", "Previous book", "prev") + slider + nb("chevron-right", "Next book", "next"), 12, extra="" if mobile else "max-width: 560px; width: 100%; align-self: center")
    return stage + info + controls + "</sc-if>" + empty_state(dev)

# ------------------------------------------------------------------ assemble
def build(S_):
    cj = common_js()
    S_["library-desktop"] = (desktop("Library · grid · desktop", "library", toolbar_desktop("grid", "gd") + grid_view(False), 1180,
                             js_pre=cj, js_ret=COMMON_RET), 1280, 1180, "Library · grid · desktop", True)
    S_["library-mobile"] = (mobile("Library · grid · mobile", "library", toolbar_mobile("grid", "gm") + f'<div style="flex: 1; min-height: 0; overflow-y: auto">{grid_view(True)}</div>',
                            js_pre=cj, js_ret=COMMON_RET), 390, 844, "Library · grid · mobile", False)
    S_["library-list-desktop"] = (desktop("Library · list · desktop", "library", toolbar_desktop("list", "ld") + list_view(False), 1900,
                                  js_pre=cj + LIST_JS.replace("__RAILH__", "22"), js_ret=COMMON_RET + LIST_RET), 1280, 1900, "Library · list · desktop", True)
    S_["library-list-mobile"] = (mobile("Library · list · mobile", "library", toolbar_mobile("list", "lm") + list_view(True),
                                 js_pre=cj + LIST_JS.replace("__RAILH__", "16"), js_ret=COMMON_RET + LIST_RET), 390, 844, "Library · list · mobile", False)
    fd = FLOW_JS.replace("__S1__", "230").replace("__S2__", "70").replace("__CW__", "240").replace("__CH__", "360").replace("__HW__", "120")
    fm = FLOW_JS.replace("__S1__", "128").replace("__S2__", "34").replace("__CW__", "170").replace("__CH__", "255").replace("__HW__", "85")
    S_["library-coverflow-desktop"] = (desktop("Library · cover flow · desktop", "library", toolbar_desktop("flow", "fd") + flow_view(False), 1080,
                                       js_pre=cj + fd, js_ret=COMMON_RET + FLOW_RET), 1280, 1080, "Library · cover flow · desktop", True)
    S_["library-coverflow-mobile"] = (mobile("Library · cover flow · mobile", "library", toolbar_mobile("flow", "fm") + flow_view(True),
                                      js_pre=cj + fm, js_ret=COMMON_RET + FLOW_RET), 390, 844, "Library · cover flow · mobile", False)
