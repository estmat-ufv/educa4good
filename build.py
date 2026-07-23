# -*- coding: utf-8 -*-
"""
Educa4Good — gerador do site comercial estático (PT/EN/ES).

Uso:            python build.py
Saída:          index.html, 404.html, pt/, en/, es/, sitemap.xml, robots.txt
Dados:          _data/*.json e _data/i18n/{pt,en,es}.json
Publicação:     o resultado é HTML puro — funciona no GitHub Pages (com .nojekyll),
                Netlify, Vercel ou qualquer hospedagem estática.

Arquitetura em camadas:
  MOTOR   = este arquivo (estrutura HTML dos componentes)
  CONTEÚDO= _data/i18n/*.json (todos os textos, por idioma)
  LAYOUT  = assets/css/site.css (design system)
  DADOS   = _data/{site,product,activities,testimonials}.json
"""
import json
import os
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))


def load(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as f:
        return json.load(f)


SITE = load("_data", "site.json")
PRODUCT = load("_data", "product.json")
ACTIVITIES = load("_data", "activities.json")["items"]
TESTIMONIALS = load("_data", "testimonials.json")
LANGS = {code: load("_data", "i18n", f"{code}.json") for code in SITE["languages"]}

PAGE_KEYS = ["home", "activities", "tools", "how", "teachers", "families",
             "about", "faq", "contact", "terms", "privacy"]

# Caminho-base absoluto (ex.: "/educa4good"). O 404 do GitHub Pages é servido em
# QUALQUER profundidade de URL, então precisa de caminhos absolutos com a base.
BASE = urlparse(SITE.get("site_url", "")).path.rstrip("/")

# ---------------------------------------------------------------- ícones SVG
IC = {
    "alfabetizacao": '<svg viewBox="0 0 24 24" fill="none" stroke="#2b6ca3" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="3"/><text x="12" y="16.2" text-anchor="middle" font-size="10.5" font-weight="800" fill="#2b6ca3" stroke="none" font-family="Nunito,sans-serif">Aa</text></svg>',
    "leitura": '<svg viewBox="0 0 24 24" fill="none" stroke="#2b6ca3" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6c3-1.5 6-1.5 9 0 3-1.5 6-1.5 9 0v12c-3-1.5-6-1.5-9 0-3-1.5-6-1.5-9 0Z"/><path d="M12 6v12"/></svg>',
    "matematica": '<svg viewBox="0 0 24 24" fill="none" stroke="#2b6ca3" stroke-width="1.8" stroke-linecap="round"><path d="M5 8h6M8 5v6"/><path d="M14 7h5"/><path d="M14 15h5M14 18h5"/><path d="M5.5 15l4 4M9.5 15l-4 4"/></svg>',
    "coordenacao": '<svg viewBox="0 0 24 24" fill="none" stroke="#2b6ca3" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l2.5-7L17 2.5a2.1 2.1 0 0 1 3 3L9.5 16Z"/><path d="M13 6.5l3 3"/></svg>',
    "logica": '<svg viewBox="0 0 24 24" fill="none" stroke="#2b6ca3" stroke-width="1.8" stroke-linejoin="round"><path d="M9 3h6v4a2 2 0 1 0 4 0h2v6h-4a2 2 0 1 1 0 4h4v4h-6v-3a2 2 0 1 0-4 0v3H3v-6h3a2 2 0 1 0 0-4H3V7h6Z"/></svg>',
    "percepcao": '<svg viewBox="0 0 24 24" fill="none" stroke="#2b6ca3" stroke-width="1.8"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.8"/></svg>',
    "jogos": '<svg viewBox="0 0 24 24" fill="none" stroke="#2b6ca3" stroke-width="1.8"><rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><circle cx="8.4" cy="8.4" r="1.4" fill="#2b6ca3" stroke="none"/><circle cx="15.6" cy="8.4" r="1.4" fill="#2b6ca3" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="#2b6ca3" stroke="none"/><circle cx="8.4" cy="15.6" r="1.4" fill="#2b6ca3" stroke="none"/><circle cx="15.6" cy="15.6" r="1.4" fill="#2b6ca3" stroke="none"/></svg>',
    "criativas": '<svg viewBox="0 0 24 24" fill="none" stroke="#2b6ca3" stroke-width="1.8"><path d="M12 21a9 9 0 1 1 9-9c0 2.5-2 3-3.5 3H15a2.5 2.5 0 0 0-1.8 4.2c.5.6.3 1.8-1.2 1.8Z"/><circle cx="7.5" cy="10.5" r="1.3" fill="#2b6ca3" stroke="none"/><circle cx="12" cy="7.5" r="1.3" fill="#2b6ca3" stroke="none"/><circle cx="16.5" cy="10.5" r="1.3" fill="#2b6ca3" stroke="none"/></svg>',
}
CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="#3e8e58" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5"/></svg>'
CROSS = '<svg viewBox="0 0 24 24" fill="none" stroke="#d66d8c" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'

HERO_IMAGES = ["ligue-sombras.webp", "grafico-barras.webp", "colorir-codigo.webp"]


# ---------------------------------------------------------------- helpers
def href(L, key):
    """Caminho relativo (dentro da pasta do idioma) para uma página."""
    return f'{L["slugs"][key]}.html'


def other_lang_href(L_other, key):
    return f'../{L_other["lang"]}/{L_other["slugs"][key]}.html'


def purchase_link(L):
    url = PRODUCT["purchase_url"].get(L["lang"], "#")
    if url and url != "#":
        return url, L["offer"]["cta"]
    return href(L, "contact"), L["offer"]["cta_pending"]


def sample_link(L):
    url = PRODUCT["sample_url"].get(L["lang"], "#")
    if url and url != "#":
        return url, L["sample"]["cta"], ""
    return href(L, "contact"), L["sample"]["cta_pending"], ""


# ---------------------------------------------------------------- head/header/footer
def head(L, page_key, extra_meta=""):
    m = L["meta"][page_key]
    url_base = SITE.get("site_url", "").rstrip("/")
    links = ""
    if url_base:
        this = f'{url_base}/{L["lang"]}/{L["slugs"][page_key]}.html'
        links += f'  <link rel="canonical" href="{this}">\n'
        for code, LX in LANGS.items():
            links += (f'  <link rel="alternate" hreflang="{code}" '
                      f'href="{url_base}/{code}/{LX["slugs"][page_key]}.html">\n')
        links += (f'  <link rel="alternate" hreflang="x-default" '
                  f'href="{url_base}/{SITE["default_lang"]}/index.html">\n')
        og_url = this
    else:
        og_url = ""
    og_img = (f"{url_base}/assets/images/activities/ligue-sombras.webp"
              if url_base else "../assets/images/activities/ligue-sombras.webp")
    return f"""<!DOCTYPE html>
<html lang="{L['lang']}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{m['title']}</title>
  <meta name="description" content="{m['desc']}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Educa4Good">
  <meta property="og:title" content="{m['title']}">
  <meta property="og:description" content="{m['desc']}">
  <meta property="og:image" content="{og_img}">
  <meta property="og:locale" content="{L['locale']}">
  {f'<meta property="og:url" content="{og_url}">' if og_url else ''}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{m['title']}">
  <meta name="twitter:description" content="{m['desc']}">
{links}{extra_meta}  <link rel="icon" type="image/svg+xml" href="../assets/images/brand/mark.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Nunito:wght@700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../assets/css/site.css">
</head>
<body>
"""


def header(L, active_key):
    nav_items = ""
    for key, label_key in [("activities", "activities"), ("tools", "tools"),
                           ("how", "how"), ("teachers", "teachers"),
                           ("families", "families"),
                           ("faq", "faq"), ("about", "about")]:
        current = ' aria-current="page"' if key == active_key else ""
        nav_items += f'        <li><a href="{href(L, key)}"{current}>{L["nav"][label_key]}</a></li>\n'
    buy_url, buy_label = purchase_link(L)
    langs = ""
    for code, LX in LANGS.items():
        cur = ' aria-current="true"' if code == L["lang"] else ""
        langs += (f'      <a href="{other_lang_href(LX, active_key)}" data-lang="{code}" '
                  f'hreflang="{code}"{cur}>{LX["lang_label"]}</a>\n')
    return f"""<header class="site-header">
  <div class="container site-header__inner">
    <a class="brand" href="index.html" aria-label="Educa4Good — {L['nav']['activities']}">
      <img src="../assets/images/brand/mark.svg" alt="" width="44" height="44">
      <span class="brand__name">Educa<b>4</b>Good</span>
    </a>
    <button class="nav-toggle" aria-expanded="false" aria-controls="main-nav" aria-label="Menu">
      <span></span><span></span><span></span>
    </button>
    <nav class="nav" id="main-nav" aria-label="Main">
      <ul>
{nav_items}        <li><a class="btn btn--accent" href="{buy_url}">{L['nav']['cta']}</a></li>
      </ul>
    </nav>
    <div class="lang-switch" aria-label="{L['footer']['lang_title']}">
{langs}    </div>
  </div>
</header>
<main id="main">
"""


def footer(L):
    F = L["footer"]
    year = "2026"
    email = SITE["contact"].get("email", "")
    contact_line = (f'<li><a href="mailto:{email}">{email}</a></li>' if email
                    else f'<li><a href="{href(L, "contact")}">{F["contact"]}</a></li>')
    socials = ""
    for net, url in SITE["social"].items():
        if url and not net.startswith("_"):
            socials += f'<li><a href="{url}" rel="noopener">{net.capitalize()}</a></li>'
    cats = "".join(
        f'<li><a href="{href(L, "activities")}">{c["title"]}</a></li>'
        for c in L["categories"]["items"][:5]
    )
    return f"""</main>
<footer class="site-footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand">
        <img src="../assets/images/brand/logo-light.svg" alt="Educa4Good">
        <p>{F['tagline']}</p>
      </div>
      <div>
        <h4>{F['nav_title']}</h4>
        <ul>
          <li><a href="index.html">Home</a></li>
          <li><a href="{href(L, 'activities')}">{L['nav']['activities']}</a></li>
          <li><a href="{href(L, 'how')}">{L['nav']['how']}</a></li>
          <li><a href="{href(L, 'faq')}">{L['nav']['faq']}</a></li>
          <li><a href="{href(L, 'about')}">{L['nav']['about']}</a></li>
        </ul>
      </div>
      <div>
        <h4>{F['categories_title']}</h4>
        <ul>{cats}</ul>
      </div>
      <div>
        <h4>{F['info_title']}</h4>
        <ul>
          {contact_line}
          <li><a href="{href(L, 'terms')}">{F['terms']}</a></li>
          <li><a href="{href(L, 'terms')}#license">{F['license']}</a></li>
          <li><a href="{href(L, 'privacy')}">{F['privacy']}</a></li>
          {socials}
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© {year} {F['copyright']}</span>
      <span>{F['made']}</span>
    </div>
  </div>
</footer>
<script src="../assets/js/site.js"></script>
</body>
</html>
"""


# ---------------------------------------------------------------- seções da home
def sec_hero(L):
    imgs = ""
    for i, img in enumerate(HERO_IMAGES):
        alt = L["hero"]["img_alts"][i]
        imgs += f'        <img src="../assets/images/activities/{img}" alt="{alt}" loading="eager">\n'
    return f"""<section class="hero">
  <div class="container hero__inner">
    <div>
      <h1>{L['hero']['title']}</h1>
      <p class="lead">{L['hero']['lead']}</p>
      <div class="hero__cta">
        <a class="btn btn--primary btn--big" href="{href(L, 'activities')}">{L['hero']['cta_primary']}</a>
        <a class="btn btn--ghost btn--big" href="#gallery">{L['hero']['cta_secondary']}</a>
      </div>
      <p class="hero__note">{L['hero']['note']}</p>
    </div>
    <div class="sheet-fan" aria-hidden="false">
{imgs}    </div>
  </div>
</section>
<div class="tagline"><div class="container"><p>{L['tagline']['text']}</p></div></div>
"""


def sec_problem(L):
    P = L["problem"]
    pains = "".join(f'<li>{CROSS}<span>{p}</span></li>' for p in P["pains"])
    return f"""<section class="section" id="problem">
  <div class="container problem-grid">
    <div class="reveal">
      <span class="kicker" style="color:var(--color-accent-dark);font-family:var(--font-display);font-weight:800;text-transform:uppercase;font-size:var(--fs-small);letter-spacing:.08em;">{P['kicker']}</span>
      <h2>{P['title']}</h2>
      <ul class="pain-list">{pains}</ul>
    </div>
    <div class="reveal">
      <div class="solution-box">{P['solution']}</div>
    </div>
  </div>
</section>
"""


def sec_categories(L, link_to_activities=True):
    C = L["categories"]
    cards = ""
    for c in C["items"]:
        icon = IC.get(c["key"], IC["criativas"])
        link = f'<p style="margin-top:.7rem"><a href="{href(L, "activities")}">{C["see_examples"]} →</a></p>' if link_to_activities else ""
        cards += f"""      <div class="card reveal">
        <div class="icon">{icon}</div>
        <h3>{c['title']}</h3>
        <p>{c['desc']}</p>
        {link}
      </div>
"""
    return f"""<section class="section section--alt" id="categories">
  <div class="container">
    <div class="section-head">
      <span class="kicker">{C['kicker']}</span>
      <h2>{C['title']}</h2>
      <p>{C['lead']}</p>
    </div>
    <div class="grid grid--4">
{cards}    </div>
  </div>
</section>
"""


def gallery_figures(L, items):
    G = L["gallery"]
    figs = ""
    for a in items:
        cats = " ".join(a["categories"])
        t = a["title"][L["lang"]]
        d = a["desc"][L["lang"]]
        figs += f"""      <figure data-cat="{cats}" class="reveal">
        <button class="shot" data-title="{t}" aria-label="{G['zoom_hint']}: {t}">
          <img src="../assets/images/activities/{a['image']}" alt="{t} — {d}" loading="lazy" width="780" height="1103">
        </button>
        <figcaption>
          <span class="t">{t}</span><br>
          <span class="m">{d}</span><br>
          <span class="badge">{a['age']} {G['age_prefix']}</span>
        </figcaption>
      </figure>
"""
    return figs


def filter_bar(L):
    G = L["gallery"]
    order = ["all", "alfabetizacao", "matematica", "leitura", "coordenacao", "logica", "jogos", "infantil"]
    btns = "".join(
        f'<button data-filter="{k}" aria-pressed="{"true" if k == "all" else "false"}">{G["filters"][k]}</button>'
        for k in order
    )
    return f'<div class="filter-bar" role="group">{btns}</div>'


def lightbox(L):
    return f"""<dialog class="lightbox" id="lightbox">
  <div class="lightbox__bar"><span class="t"></span>
    <button class="lightbox__close" aria-label="×">×</button>
  </div>
  <img alt="">
</dialog>
"""


def sec_gallery(L, items, with_filters=True, section_id="gallery"):
    G = L["gallery"]
    return f"""<section class="section" id="{section_id}">
  <div class="container">
    <div class="section-head">
      <span class="kicker">{G['kicker']}</span>
      <h2>{G['title']}</h2>
      <p>{G['lead']}</p>
    </div>
    {filter_bar(L) if with_filters else ''}
    <div class="gallery">
{gallery_figures(L, items)}    </div>
    <p class="center muted" style="margin-top:var(--space-3)">{G['more']}</p>
  </div>
</section>
"""


def sec_differentials(L):
    D = L["differentials"]
    cards = ""
    for d in D["items"]:
        status = f' <span class="badge">{d["status"]}</span>' if d.get("status") else ""
        cards += f"""      <div class="card reveal">
        <div class="icon">{CHECK}</div>
        <h3>{d['title']}{status}</h3>
        <p>{d['desc']}</p>
      </div>
"""
    return f"""<section class="section section--alt" id="differentials">
  <div class="container">
    <div class="section-head">
      <span class="kicker">{D['kicker']}</span>
      <h2>{D['title']}</h2>
    </div>
    <div class="grid grid--3">
{cards}    </div>
  </div>
</section>
"""


def audience_split(L, key, img, reverse=False):
    A = L[key]
    lis = "".join(f'<li>{CHECK}<span>{b}</span></li>' for b in A["benefits"])
    note = f'<p class="muted"><em>{A["note"]}</em></p>' if A.get("note") else ""
    rev = " split--reverse" if reverse else ""
    return f"""<section class="section{' section--alt' if reverse else ''}" id="{key}">
  <div class="container split{rev}">
    <div class="reveal">
      <span class="kicker" style="color:var(--color-accent-dark);font-family:var(--font-display);font-weight:800;text-transform:uppercase;font-size:var(--fs-small);letter-spacing:.08em;">{A['kicker']}</span>
      <h2>{A['title']}</h2>
      <p class="muted">{A['lead']}</p>
      <ul class="pain-list">{lis}</ul>
      {note}
      <p style="margin-top:var(--space-2)"><a class="btn btn--primary" href="{href(L, 'activities')}">{A['cta']}</a></p>
    </div>
    <div class="split__img reveal"><img src="../assets/images/activities/{img}" alt="" loading="lazy"></div>
  </div>
</section>
"""


def sec_offline(L):
    O = L["offline"]
    pts = "".join(f'<li>{CHECK}<span>{p}</span></li>' for p in O["points"])
    return f"""<section class="section section--alt" id="offline">
  <div class="container split">
    <div class="split__img reveal"><img src="../assets/images/activities/caminhos-tracados.webp" alt="" loading="lazy"></div>
    <div class="reveal">
      <span class="kicker" style="color:var(--color-accent-dark);font-family:var(--font-display);font-weight:800;text-transform:uppercase;font-size:var(--fs-small);letter-spacing:.08em;">{O['kicker']}</span>
      <h2>{O['title']}</h2>
      <p class="muted">{O['lead']}</p>
      <ul class="pain-list">{pts}</ul>
    </div>
  </div>
</section>
"""


def sec_how(L):
    H = L["how"]
    steps = "".join(
        f'<div class="step reveal"><div class="num">{i + 1}</div><h3>{s["title"]}</h3><p class="muted">{s["desc"]}</p></div>'
        for i, s in enumerate(H["steps"])
    )
    return f"""<section class="section" id="how">
  <div class="container">
    <div class="section-head">
      <span class="kicker">{H['kicker']}</span>
      <h2>{H['title']}</h2>
    </div>
    <div class="steps">{steps}</div>
  </div>
</section>
"""


def sec_stats(L):
    S = L["stats"]
    st = SITE["stats"]
    return f"""<section class="section section--alt" id="stats">
  <div class="container">
    <div class="section-head">
      <span class="kicker">{S['kicker']}</span>
      <h2>{S['title']}</h2>
    </div>
    <div class="stats">
      <div class="stat reveal"><div class="n">{st['activities_count']}</div><div class="l">{S['labels']['activities']}</div></div>
      <div class="stat reveal"><div class="n">{st['categories_count']}</div><div class="l">{S['labels']['categories']}</div></div>
      <div class="stat reveal"><div class="n">{st['formats']}</div><div class="l">{S['labels']['format']}</div></div>
    </div>
  </div>
</section>
"""


def sec_offer(L):
    O = L["offer"]
    price = PRODUCT["price"][L["lang"]]
    name = PRODUCT["product_name"][L["lang"]]
    buy_url, buy_label = purchase_link(L)
    lis = "".join(f'<li>{CHECK}<span>{x}</span></li>' for x in O["product_includes"])
    return f"""<section class="section" id="offer">
  <div class="container">
    <div class="section-head">
      <span class="kicker">{O['kicker']}</span>
      <h2>{O['title']}</h2>
    </div>
    <div class="offer reveal">
      <div class="offer__head"><h3>{name}</h3></div>
      <div class="offer__body">
        <ul class="offer__list">{lis}</ul>
        <div class="offer__price">
          <div class="p">{price['display']}</div>
          <div class="d">{price['note']}</div>
          <a class="btn btn--accent btn--big" href="{buy_url}">{buy_label}</a>
        </div>
      </div>
    </div>
    <p class="center muted" style="margin-top:var(--space-2)">{O['guarantee']}</p>
  </div>
</section>
"""


def sec_sample(L):
    S = L["sample"]
    url, label, _ = sample_link(L)
    return f"""<section class="section section--alt" id="sample">
  <div class="container center">
    <div class="section-head">
      <span class="kicker">{S['kicker']}</span>
      <h2>{S['title']}</h2>
      <p>{S['lead']}</p>
    </div>
    <a class="btn btn--primary btn--big" href="{url}">{label}</a>
  </div>
</section>
"""


def sec_testimonials(L):
    if not TESTIMONIALS.get("enabled"):
        # Estrutura pronta; ativada via _data/testimonials.json quando houver
        # depoimentos REAIS. Nunca publicar depoimentos fictícios.
        return ""
    T = L["testimonials"]
    cards = ""
    for t in TESTIMONIALS["items"]:
        cards += (f'<div class="card testimonial reveal"><p>“{t["text"][L["lang"]]}”</p>'
                  f'<div class="who">{t["who"][L["lang"]]}</div></div>')
    return f"""<section class="section" id="testimonials">
  <div class="container">
    <div class="section-head"><span class="kicker">{T['kicker']}</span><h2>{T['title']}</h2></div>
    <div class="grid grid--3">{cards}</div>
  </div>
</section>
"""


def sec_faq(L, limit=None):
    F = L["faq"]
    items = F["items"][:limit] if limit else F["items"]
    dts = "".join(
        f'<details><summary>{i["q"]}</summary><div class="a">{i["a"]}</div></details>'
        for i in items
    )
    more = (f'<p class="center" style="margin-top:var(--space-2)"><a href="{href(L, "faq")}">FAQ →</a></p>'
            if limit else "")
    return f"""<section class="section" id="faq">
  <div class="container">
    <div class="section-head"><span class="kicker">{F['kicker']}</span><h2>{F['title']}</h2></div>
    <div class="faq reveal">{dts}</div>
    {more}
  </div>
</section>
"""


def sec_final(L):
    FN = L["final"]
    buy_url, _ = purchase_link(L)
    return f"""<section class="section final-cta">
  <div class="container">
    <h2>{FN['title']}</h2>
    <p>{FN['lead']}</p>
    <p style="margin-top:var(--space-3)"><a class="btn btn--accent btn--big" href="{buy_url}">{FN['cta']}</a></p>
  </div>
</section>
"""


def page_hero(title, lead):
    return f"""<section class="page-hero">
  <div class="container"><h1>{title}</h1><p>{lead}</p></div>
</section>
"""


# ---------------------------------------------------------------- páginas
def build_home(L):
    body = (sec_hero(L) + sec_problem(L) + sec_categories(L)
            + sec_gallery(L, ACTIVITIES[:8]) + sec_differentials(L)
            + audience_split(L, "teachers", "multipla-escolha-ciencias.webp")
            + audience_split(L, "families", "emocoes.webp", reverse=True)
            + sec_offline(L) + sec_how(L) + sec_stats(L) + sec_offer(L)
            + sec_sample(L) + sec_testimonials(L) + sec_faq(L, limit=4)
            + sec_final(L) + lightbox(L))
    return head(L, "home") + header(L, "home") + body + footer(L)


def build_activities(L):
    P = L["pages"]["activities"]
    body = (page_hero(P["hero_title"], P["hero_lead"])
            + sec_gallery(L, ACTIVITIES, with_filters=True, section_id="all-activities")
            + sec_sample(L) + sec_final(L) + lightbox(L))
    return head(L, "activities") + header(L, "activities") + body + footer(L)


def build_how(L):
    P = L["pages"]["how"]
    receive = f"""<section class="section section--alt">
  <div class="container">
    <div class="section-head"><h2>{P['receive_title']}</h2><p>{P['receive_lead']}</p></div>
    {'' }
  </div>
</section>
"""
    body = (page_hero(P["hero_title"], P["hero_lead"]) + sec_how(L)
            + receive + sec_differentials(L) + sec_faq(L, limit=4)
            + sec_final(L))
    return head(L, "how") + header(L, "how") + body + footer(L)


def build_audience(L, key):
    P = L["pages"][key]
    img = "multipla-escolha-ciencias.webp" if key == "teachers" else "emocoes.webp"
    prose = f"""<section class="section">
  <div class="container prose reveal">
    <h2>{P['body_title']}</h2>
    <p>{P['body']}</p>
  </div>
</section>
"""
    body = (page_hero(P["hero_title"], P["hero_lead"])
            + audience_split(L, key, img)
            + prose + sec_offline(L) + sec_offer(L) + sec_final(L))
    return head(L, key) + header(L, key) + body + footer(L)


def build_about(L):
    P = L["pages"]["about"]
    paras = "".join(f"<p>{p}</p>" for p in P["body"])
    body = (page_hero(P["hero_title"], P["hero_lead"])
            + f'<section class="section"><div class="container prose reveal">{paras}</div></section>'
            + sec_stats(L) + sec_final(L))
    return head(L, "about") + header(L, "about") + body + footer(L)


def build_faq_page(L):
    body = (page_hero(L["faq"]["title"], "")
            + sec_faq(L) + sec_final(L))
    return head(L, "faq") + header(L, "faq") + body + footer(L)


def build_contact(L):
    P = L["pages"]["contact"]
    email = SITE["contact"].get("email", "")
    email_html = (f'<p><strong>{P["email_label"]}:</strong> <a href="mailto:{email}">{email}</a></p>'
                  if email else f'<p class="muted">{P["email_pending"]}</p>')
    socials = "".join(
        f'<li><a href="{u}" rel="noopener">{n.capitalize()}</a></li>'
        for n, u in SITE["social"].items() if u and not n.startswith("_")
    )
    socials_html = f'<h2>{P["social_label"]}</h2><ul>{socials}</ul>' if socials else ""
    body = (page_hero(P["hero_title"], P["hero_lead"])
            + f'<section class="section"><div class="container prose reveal">{email_html}{socials_html}</div></section>'
            + sec_final(L))
    return head(L, "contact") + header(L, "contact") + body + footer(L)


def build_legal(L, key):
    P = L["pages"][key]
    secs = "".join(f'<h2{" id=\"license\"" if i == 1 and key == "terms" else ""}>{s["h"]}</h2><p>{s["p"]}</p>'
                   for i, s in enumerate(P["sections"]))
    body = (page_hero(P["hero_title"], P["hero_lead"])
            + f'<section class="section"><div class="container prose">'
              f'<p class="muted"><em>{P["note"]}</em></p>{secs}</div></section>')
    return head(L, key) + header(L, key) + body + footer(L)


# ---------------------------------------------------------------- Jogos e Utilidades
def build_tools(L):
    P = L["pages"]["tools"]
    Q = P["puzzle"]
    D = P["pdf"]
    S = P["soon"]

    puzzle = f"""<section class="section" id="puzzle-tool">
  <div class="container">
    <div class="section-head">
      <span class="kicker">{Q['kicker']}</span>
      <h2>{Q['title']}</h2>
      <p>{Q['lead']}</p>
    </div>
    <div class="qc reveal" id="qc">
      <div class="qc__controls">
        <div class="qc__field">
          <label for="qc-file">{Q['upload_label']}</label>
          <input type="file" id="qc-file" accept="image/*">
          <small class="muted">{Q['upload_hint']}</small>
        </div>
        <div class="qc__field">
          <label for="qc-n">{Q['size_label']}: <b id="qc-n-label">3</b> {Q['size_suffix']}</label>
          <input type="range" id="qc-n" min="1" max="5" step="1" value="3">
        </div>
        <button type="button" class="btn btn--primary" id="qc-shuffle">{Q['shuffle']}</button>
      </div>
      <div class="qc__stage">
        <div class="qc__board-wrap">
          <h3 class="qc__label">{Q['board_title']}</h3>
          <div class="qc__board" id="qc-board" style="--qc-n:3">
            <p class="qc__empty" id="qc-empty">{Q['empty_hint']}</p>
          </div>
          <p class="qc__hint" id="qc-hint">{Q['move_hint']}</p>
          <p class="qc__win" id="qc-win" hidden>{Q['win']}</p>
        </div>
        <aside class="qc__model">
          <h3 class="qc__label">{Q['model_title']}</h3>
          <div class="qc__model-img" id="qc-model">{Q['model_title']}</div>
          <button type="button" class="btn btn--ghost qc__download" id="qc-download" hidden>{Q['download']}</button>
        </aside>
      </div>
    </div>
  </div>
</section>
"""

    points = "".join(f'<li>{CHECK}<span>{p}</span></li>' for p in D["points"])
    pdf = f"""<section class="section section--alt" id="puzzle-pdf">
  <div class="container split">
    <div class="reveal">
      <span class="kicker" style="color:var(--color-accent-dark);font-family:var(--font-display);font-weight:800;text-transform:uppercase;font-size:var(--fs-small);letter-spacing:.08em;">{D['kicker']}</span>
      <h2>{D['title']}</h2>
      <p class="muted">{D['lead']}</p>
      <ul class="pain-list">{points}</ul>
      <div class="qc-price">
        <div class="qc-price__tag"><span class="qc-price__value">{D['price']}</span><span class="qc-price__note">{D['price_note']}</span></div>
        <a class="btn btn--accent btn--big" href="{href(L, 'contact')}">{D['cta']}</a>
      </div>
      <p class="muted"><em>{D['note']}</em></p>
    </div>
    <div class="split__img reveal">
      <div class="qc-adshot" id="qc-adshot"><span class="qc-adshot__badge">PDF &middot; Adobe Reader</span><span class="qc-adshot__ph">{Q['model_title']}</span></div>
    </div>
  </div>
</section>
"""

    cards = ""
    for it in S["items"]:
        card_class = "card reveal tool-card" if it.get("href") else "card reveal"
        action = (f'\n        <p class="tool-card__action"><a class="btn btn--ghost" '
                  f'href="{it["href"]}">{it.get("cta", "Abrir")}</a></p>'
                  if it.get("href") else "")
        cards += f"""      <div class="{card_class}">
        <div class="icon">{IC['jogos']}</div>
        <h3>{it['title']} <span class="badge">{it['badge']}</span></h3>
        <p>{it['desc']}</p>{action}
      </div>
"""
    tools_grid = "grid--4" if len(S["items"]) >= 4 else "grid--3"
    soon = f"""<section class="section" id="more-tools">
  <div class="container">
    <div class="section-head">
      <span class="kicker">{S['kicker']}</span>
      <h2>{S['title']}</h2>
      <p>{S['lead']}</p>
    </div>
    <div class="grid {tools_grid}">
{cards}    </div>
  </div>
</section>
"""

    body = (page_hero(P["hero_title"], P["hero_lead"]) + puzzle + pdf + soon
            + '<script src="../assets/js/puzzle.js"></script>\n')
    return head(L, "tools") + header(L, "tools") + body + footer(L)


def build_connect_dots_pt(L):
    title = "Ligar os Pontos — Educa4Good"
    desc = "Gere folhas de ligar os pontos a partir de uma figura, direto no navegador e sem enviar a imagem para servidores."
    url_base = SITE.get("site_url", "").rstrip("/")
    canonical = f"{url_base}/pt/ligar-os-pontos.html" if url_base else ""
    links = f'  <link rel="canonical" href="{canonical}">\n' if canonical else ""
    og_url = f'  <meta property="og:url" content="{canonical}">\n' if canonical else ""
    og_img = (f"{url_base}/assets/images/activities/caminhos-tracados.webp"
              if url_base else "../assets/images/activities/caminhos-tracados.webp")
    head_html = f"""<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <meta name="description" content="{desc}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Educa4Good">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{desc}">
  <meta property="og:image" content="{og_img}">
  <meta property="og:locale" content="pt_BR">
{og_url}  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{title}">
  <meta name="twitter:description" content="{desc}">
{links}  <link rel="icon" type="image/svg+xml" href="../assets/images/brand/mark.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Nunito:wght@700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../assets/css/site.css">
  <link rel="stylesheet" href="../assets/css/connect-the-dots.css">
</head>
<body>
"""
    body = """<section class="page-hero dots-hero">
  <div class="container">
    <h1>Ligar os Pontos</h1>
    <p>Gere uma folha A4 numerada a partir de uma figura. A imagem fica no seu navegador: nada é enviado, armazenado ou processado fora do seu aparelho.</p>
  </div>
</section>
<section class="section dots" id="ligar-os-pontos">
  <div class="container">
    <div class="section-head dots__intro reveal">
      <span class="kicker">Gerador local</span>
      <h2>Da imagem para a atividade impressa</h2>
      <p>Para melhores resultados, use desenhos com contorno nítido, fundo simples e bom contraste. Fotografias muito detalhadas podem gerar pontos menos previsíveis.</p>
    </div>

    <div class="dots__workspace">
      <div class="dots__controls">
        <section class="dots__panel reveal" aria-labelledby="dots-upload-title">
          <h2 id="dots-upload-title">1. Escolha uma imagem</h2>
          <label class="dots__dropzone" id="dots-dropzone" for="dots-file">
            <span class="dots__drop-icon" aria-hidden="true">+</span>
            <strong>Arraste uma imagem aqui</strong>
            <span>ou clique para selecionar no computador</span>
          </label>
          <input class="dots__file" type="file" id="dots-file" accept="image/png,image/jpeg,image/webp,image/*" aria-describedby="dots-file-help">
          <p class="dots__note" id="dots-file-help">PNG, JPG, WebP e formatos aceitos pelo navegador, até 12 MB.</p>
          <p class="dots__message" id="dots-message" role="status" aria-live="polite"></p>
          <figure class="dots__original" id="dots-original" hidden>
            <img id="dots-original-img" alt="Imagem original escolhida">
            <figcaption>Imagem original</figcaption>
          </figure>
        </section>

        <form class="dots__panel dots__settings reveal" id="dots-settings" aria-labelledby="dots-settings-title">
          <h2 id="dots-settings-title">2. Configure a atividade</h2>

          <div class="dots__field">
            <label for="dots-title">Título da atividade</label>
            <input type="text" id="dots-title" value="Ligar os pontos" maxlength="80">
          </div>

          <div class="dots__grid-2">
            <div class="dots__field">
              <label for="dots-count">Total de pontos <output id="dots-count-output">45</output></label>
              <input type="range" id="dots-count" min="8" max="140" step="1" value="45">
            </div>
            <div class="dots__field">
              <label for="dots-start">Numeração inicial</label>
              <input type="number" id="dots-start" min="0" step="1" value="1">
            </div>
          </div>

          <div class="dots__grid-2">
            <div class="dots__field">
              <label for="dots-point-size">Tamanho dos pontos <output id="dots-point-output">5</output></label>
              <input type="range" id="dots-point-size" min="2" max="12" step="1" value="5">
            </div>
            <div class="dots__field">
              <label for="dots-number-size">Tamanho dos números <output id="dots-number-output">16</output></label>
              <input type="range" id="dots-number-size" min="10" max="28" step="1" value="16">
            </div>
          </div>

          <div class="dots__grid-2">
            <div class="dots__field">
              <label for="dots-line-width">Espessura do traço guia <output id="dots-line-output">0.8</output></label>
              <input type="range" id="dots-line-width" min="0" max="3" step="0.2" value="0.8">
            </div>
            <div class="dots__field">
              <label for="dots-line-color">Cor do traço guia</label>
              <input type="color" id="dots-line-color" value="#9aa9b7">
            </div>
          </div>

          <div class="dots__field">
            <label for="dots-paper">Formato do papel</label>
            <select id="dots-paper">
              <option value="portrait">A4 retrato</option>
              <option value="landscape">A4 paisagem</option>
            </select>
          </div>

          <fieldset class="dots__fieldset">
            <legend>Identificação opcional</legend>
            <div class="dots__grid-3">
              <div class="dots__field">
                <label for="dots-child">Nome</label>
                <input type="text" id="dots-child" maxlength="40" placeholder="Nome da criança">
              </div>
              <div class="dots__field">
                <label for="dots-date">Data</label>
                <input type="text" id="dots-date" maxlength="20" placeholder="__/__/____">
              </div>
              <div class="dots__field">
                <label for="dots-class">Turma</label>
                <input type="text" id="dots-class" maxlength="24" placeholder="Turma">
              </div>
            </div>
          </fieldset>

          <div class="dots__field dots__check">
            <input type="checkbox" id="dots-show-inspiration" checked>
            <label for="dots-show-inspiration">Mostrar imagem de inspiração na prévia</label>
          </div>

          <div class="dots__field">
            <label for="dots-hidden-pairs">Conexões que não devem aparecer</label>
            <textarea id="dots-hidden-pairs" rows="3" placeholder="5-6, 12-13" aria-describedby="dots-hidden-help"></textarea>
            <p class="dots__note" id="dots-hidden-help">Exemplo: <code>12-13, 28-29</code> remove apenas as linhas entre esses pares consecutivos. Os pontos e números continuam aparecendo.</p>
          </div>

          <div class="dots__actions">
            <button type="button" class="btn btn--primary" id="dots-generate"><span aria-hidden="true">↻</span> Gerar/Atualizar atividade</button>
            <button type="button" class="btn btn--ghost" id="dots-print" disabled><span aria-hidden="true">⎙</span> Imprimir atividade</button>
            <button type="button" class="btn btn--ghost" id="dots-download" disabled><span aria-hidden="true">↓</span> Baixar PNG</button>
          </div>
        </form>
      </div>

      <section class="dots__preview-panel reveal" aria-labelledby="dots-preview-title">
        <div class="dots__preview-head">
          <span class="kicker">Pré-visualização</span>
          <h2 id="dots-preview-title">Atividade gerada</h2>
        </div>
        <p class="dots__status" id="dots-status" role="status" aria-live="polite">Envie uma imagem para começar.</p>
        <div class="dots__print-area" id="dots-print-area">
          <div class="dots__print-page dots__print-page--portrait dots__print-page--no-reference" id="dots-print-page">
            <div class="dots__print-layout">
              <div class="dots__activity" id="dots-activity" aria-label="Pré-visualização da atividade">
                <div class="dots__placeholder">
                  <div class="dots__placeholder-dots" aria-hidden="true">
                    <span></span><span></span><span></span><span></span><span></span><span></span>
                  </div>
                  <p>Escolha uma imagem e gere a atividade.</p>
                </div>
              </div>
              <aside class="dots__reference" id="dots-reference" hidden>
                <span>Imagem de inspiração</span>
                <img id="dots-reference-img" alt="Imagem de inspiração">
              </aside>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</section>
<script src="../assets/js/connect-the-dots.js"></script>
"""
    return head_html + header(L, "tools") + body + footer(L)


def build_word_search_pt(L):
    title = "Caça-palavras — Educa4Good"
    desc = "Crie caça-palavras personalizados com até 10 palavras e imprima uma folha A4 com gabarito opcional."
    url_base = SITE.get("site_url", "").rstrip("/")
    canonical = f"{url_base}/pt/caca-palavras.html" if url_base else ""
    links = f'  <link rel="canonical" href="{canonical}">\n' if canonical else ""
    og_url = f'  <meta property="og:url" content="{canonical}">\n' if canonical else ""
    og_img = (f"{url_base}/assets/images/activities/palavras-que-rimam.webp"
              if url_base else "../assets/images/activities/palavras-que-rimam.webp")
    head_html = f"""<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <meta name="description" content="{desc}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Educa4Good">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{desc}">
  <meta property="og:image" content="{og_img}">
  <meta property="og:locale" content="pt_BR">
{og_url}  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{title}">
  <meta name="twitter:description" content="{desc}">
{links}  <link rel="icon" type="image/svg+xml" href="../assets/images/brand/mark.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Nunito:wght@700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../assets/css/site.css">
  <link rel="stylesheet" href="../assets/css/word-search.css">
</head>
<body>
"""
    body = """<section class="page-hero ws-hero">
  <div class="container">
    <h1>Caça-palavras</h1>
    <p>Monte uma atividade pronta para imprimir com as suas próprias palavras. A lista fica no seu navegador, a grade é criada automaticamente e o gabarito pode sair junto no mesmo PDF.</p>
  </div>
</section>
<section class="section ws" id="caca-palavras">
  <div class="container">
    <div class="section-head ws__intro reveal">
      <span class="kicker">Gerador local</span>
      <h2>Da lista de palavras para a folha A4</h2>
      <p>Digite até 10 palavras, escolha o nível e gere uma folha no padrão Educa4Good para imprimir ou salvar como PDF pelo navegador.</p>
    </div>

    <div class="ws__workspace">
      <div class="ws__controls">
        <section class="ws__panel reveal" aria-labelledby="ws-words-title">
          <h2 id="ws-words-title">1. Escreva as palavras</h2>
          <div class="ws__field">
            <label for="ws-words">Palavras do caça-palavras</label>
            <textarea id="ws-words" rows="8" aria-describedby="ws-words-help">LEITURA
ESCOLA
AMIZADE
NATUREZA
NUMERO
BRINCAR
CRIAR
APRENDER</textarea>
            <p class="ws__note" id="ws-words-help">Use uma palavra por linha ou separe por vírgulas. A grade usa letras maiúsculas, sem acentos e sem espaços.</p>
            <p class="ws__counter" id="ws-counter"><span><strong id="ws-word-count">0</strong>/<span id="ws-word-limit">10</span> palavras</span><span>máximo 18 letras por palavra</span></p>
            <p class="ws__message" id="ws-message" role="status" aria-live="polite"></p>
          </div>
          <div class="ws__examples" aria-label="Sugestões rápidas">
            <button type="button" data-ws-preset="natureza">Natureza</button>
            <button type="button" data-ws-preset="leitura">Leitura</button>
            <button type="button" data-ws-preset="gentileza">Convivência</button>
          </div>
        </section>

        <form class="ws__panel ws__settings reveal" id="ws-settings" aria-labelledby="ws-settings-title">
          <h2 id="ws-settings-title">2. Configure a atividade</h2>

          <div class="ws__field">
            <label for="ws-title">Título da folha</label>
            <input type="text" id="ws-title" value="Caça-palavras" maxlength="80">
          </div>

          <div class="ws__grid-2">
            <div class="ws__field">
              <label for="ws-level">Nível</label>
              <select id="ws-level">
                <option value="facil">Fácil: horizontal e vertical</option>
                <option value="medio" selected>Médio: com diagonais</option>
                <option value="desafio">Desafio: todas as direções</option>
              </select>
            </div>
            <div class="ws__field">
              <label for="ws-size">Tamanho da grade</label>
              <select id="ws-size">
                <option value="auto" selected>Automático</option>
                <option value="10">10 x 10</option>
                <option value="12">12 x 12</option>
                <option value="14">14 x 14</option>
                <option value="16">16 x 16</option>
                <option value="18">18 x 18</option>
              </select>
            </div>
          </div>

          <fieldset class="ws__fieldset">
            <legend>Identificação opcional</legend>
            <div class="ws__grid-3">
              <div class="ws__field">
                <label for="ws-child">Nome</label>
                <input type="text" id="ws-child" maxlength="40" placeholder="Nome da criança">
              </div>
              <div class="ws__field">
                <label for="ws-date">Data</label>
                <input type="text" id="ws-date" maxlength="20" placeholder="__/__/____">
              </div>
              <div class="ws__field">
                <label for="ws-class">Turma</label>
                <input type="text" id="ws-class" maxlength="24" placeholder="Turma">
              </div>
            </div>
          </fieldset>

          <div class="ws__field ws__check">
            <input type="checkbox" id="ws-answer" checked>
            <label for="ws-answer">Incluir gabarito em uma segunda página</label>
          </div>

          <div class="ws__actions">
            <button type="button" class="btn btn--primary" id="ws-generate"><span aria-hidden="true">↻</span> Gerar caça-palavras</button>
            <button type="button" class="btn btn--ghost" id="ws-shuffle" disabled><span aria-hidden="true">✦</span> Nova grade</button>
            <button type="button" class="btn btn--ghost" id="ws-print" disabled><span aria-hidden="true">⎙</span> Imprimir / salvar PDF</button>
          </div>
        </form>
      </div>

      <section class="ws__preview-panel reveal" aria-labelledby="ws-preview-title">
        <div class="ws__preview-head">
          <span class="kicker">Pré-visualização</span>
          <h2 id="ws-preview-title">Atividade gerada</h2>
        </div>
        <p class="ws__status" id="ws-status" role="status" aria-live="polite">Gerando uma grade inicial...</p>

        <div class="ws__print-area" id="ws-print-area">
          <article class="ws__page ws__page--activity" id="ws-activity-page" aria-label="Página do caça-palavras">
            <header class="ws__sheet-header">
              <div class="ws__brand"><img src="../assets/images/brand/mark.svg" alt=""><span>Educa4Good</span></div>
              <span class="ws__sheet-kind">Caça-palavras</span>
            </header>
            <div class="ws__meta" id="ws-activity-meta"></div>
            <h2 class="ws__page-title" id="ws-activity-title">Caça-palavras</h2>
            <p class="ws__instruction" id="ws-activity-instruction">Encontre as palavras na grade.</p>
            <div class="ws__grid-wrap" id="ws-activity-grid">
              <div class="ws__placeholder">
                <div class="ws__mini-grid" aria-hidden="true"><span>C</span><span>A</span><span>Ç</span><span>A</span><span>R</span><span>P</span><span>A</span><span>L</span><span>A</span><span>V</span><span>R</span><span>A</span><span>S</span><span>E</span><span>!</span></div>
                <p>Digite as palavras e gere a atividade.</p>
              </div>
            </div>
            <section class="ws__word-bank" id="ws-word-bank" aria-label="Banco de palavras"></section>
            <footer class="ws__sheet-footer"><span id="ws-activity-footer">Educa4Good</span></footer>
          </article>

          <article class="ws__page ws__page--answer" id="ws-answer-page" aria-label="Página do gabarito" hidden>
            <header class="ws__sheet-header">
              <div class="ws__brand"><img src="../assets/images/brand/mark.svg" alt=""><span>Educa4Good</span></div>
              <span class="ws__sheet-kind">Gabarito</span>
            </header>
            <div class="ws__meta" id="ws-answer-meta"></div>
            <h2 class="ws__page-title" id="ws-answer-title">Caça-palavras - gabarito</h2>
            <p class="ws__instruction" id="ws-answer-instruction">Confira as palavras destacadas.</p>
            <div class="ws__grid-wrap" id="ws-answer-grid"></div>
            <section class="ws__word-bank" aria-label="Lista de respostas">
              <h3>Posição das palavras</h3>
              <div id="ws-answer-list"></div>
            </section>
            <footer class="ws__sheet-footer"><span id="ws-answer-footer">Gabarito do professor</span></footer>
          </article>
        </div>
      </section>
    </div>
  </div>
</section>
<script src="../assets/js/word-search.js"></script>
"""
    return head_html + header(L, "tools") + body + footer(L)


def build_memory_game_pt(L):
    title = "Jogo da memória — Educa4Good"
    desc = "Crie cartas de memória imprimíveis com até 5 imagens ou até 5 palavras, no layout Educa4Good."
    url_base = SITE.get("site_url", "").rstrip("/")
    canonical = f"{url_base}/pt/jogo-da-memoria.html" if url_base else ""
    links = f'  <link rel="canonical" href="{canonical}">\n' if canonical else ""
    og_url = f'  <meta property="og:url" content="{canonical}">\n' if canonical else ""
    og_img = (f"{url_base}/assets/images/activities/ache-o-igual.webp"
              if url_base else "../assets/images/activities/ache-o-igual.webp")
    head_html = f"""<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <meta name="description" content="{desc}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Educa4Good">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{desc}">
  <meta property="og:image" content="{og_img}">
  <meta property="og:locale" content="pt_BR">
{og_url}  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{title}">
  <meta name="twitter:description" content="{desc}">
{links}  <link rel="icon" type="image/svg+xml" href="../assets/images/brand/mark.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Nunito:wght@700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../assets/css/site.css">
  <link rel="stylesheet" href="../assets/css/memory-game.css?v=20260722-cardfix2">
</head>
<body>
"""
    body = """<section class="page-hero mg-hero">
  <div class="container">
    <h1>Jogo da memória</h1>
    <p>Crie cartas de memória com imagens ou palavras, prontas para imprimir, recortar e jogar. Tudo acontece no seu navegador: suas imagens não são enviadas para servidores.</p>
  </div>
</section>
<section class="section mg" id="jogo-da-memoria">
  <div class="container">
    <div class="section-head mg__intro reveal">
      <span class="kicker">Gerador local</span>
      <h2>De imagens ou palavras para cartas A4</h2>
      <p>Escolha até 5 imagens ou escreva até 5 palavras. Cada item vira um par de cartas no layout do Educa4Good.</p>
    </div>

    <div class="mg__workspace">
      <div class="mg__controls">
        <section class="mg__panel reveal" aria-labelledby="mg-items-title">
          <h2 id="mg-items-title">1. Escolha o tipo de cartas</h2>
          <div class="mg__mode" role="radiogroup" aria-label="Tipo de jogo da memória">
            <label>
              <input type="radio" name="mg-mode" value="words" checked>
              <strong>Palavras</strong>
              <span>Até 5 palavras, duplicadas em pares.</span>
            </label>
            <label>
              <input type="radio" name="mg-mode" value="images">
              <strong>Imagens</strong>
              <span>Até 5 imagens do seu computador.</span>
            </label>
          </div>

          <div class="mg__words" id="mg-words-panel">
            <div class="mg__field">
              <label for="mg-words">Palavras do jogo</label>
              <textarea id="mg-words" rows="6" aria-describedby="mg-items-help"></textarea>
            </div>
          </div>

          <div class="mg__upload" id="mg-upload-panel" hidden>
            <div class="mg__field">
              <label for="mg-file">Imagens do jogo</label>
              <input type="file" id="mg-file" accept="image/png,image/jpeg,image/webp,image/*" multiple aria-describedby="mg-items-help">
            </div>
            <div class="mg__thumbs" id="mg-thumbs" aria-label="Prévia das imagens escolhidas"></div>
          </div>

          <p class="mg__note" id="mg-items-help">Para a versão gratuita, use no máximo 5 itens. Cada item aparece duas vezes na folha.</p>
          <p class="mg__counter" id="mg-counter"><span><strong id="mg-item-count">0</strong>/<span id="mg-item-limit">5</span> itens</span><span>2 cartas por item</span></p>
          <p class="mg__message" id="mg-message" role="status" aria-live="polite"></p>
        </section>

        <form class="mg__panel mg__settings reveal" id="mg-settings" aria-labelledby="mg-settings-title">
          <h2 id="mg-settings-title">2. Configure a folha</h2>

          <div class="mg__field">
            <label for="mg-title">Título da folha</label>
            <input type="text" id="mg-title" value="Jogo da memória" maxlength="80">
          </div>

          <div class="mg__field">
            <label for="mg-card-size">Tamanho das cartas</label>
            <select id="mg-card-size">
              <option value="compact">Pequeno: até 12 cartas por página</option>
              <option value="medium" selected>Médio: até 6 cartas por página</option>
              <option value="large">Grande: até 4 cartas por página</option>
              <option value="xlarge">Extra grande: até 2 cartas por página</option>
            </select>
            <p class="mg__note">As cartas ficam quadradas e não são espremidas. Nos tamanhos maiores, o jogo é dividido automaticamente em mais folhas A4.</p>
          </div>

          <fieldset class="mg__fieldset">
            <legend>Identificação opcional</legend>
            <div class="mg__grid-3">
              <div class="mg__field">
                <label for="mg-child">Nome</label>
                <input type="text" id="mg-child" maxlength="40" placeholder="Nome da criança">
              </div>
              <div class="mg__field">
                <label for="mg-date">Data</label>
                <input type="text" id="mg-date" maxlength="20" placeholder="__/__/____">
              </div>
              <div class="mg__field">
                <label for="mg-class">Turma</label>
                <input type="text" id="mg-class" maxlength="24" placeholder="Turma">
              </div>
            </div>
          </fieldset>

          <div class="mg__field mg__check">
            <input type="checkbox" id="mg-shuffle" checked>
            <label for="mg-shuffle">Embaralhar a ordem das cartas na folha</label>
          </div>

          <div class="mg__field mg__check">
            <input type="checkbox" id="mg-pair-numbers">
            <label for="mg-pair-numbers">Mostrar número pequeno do par para conferência</label>
          </div>

          <div class="mg__actions">
            <button type="button" class="btn btn--primary" id="mg-generate"><span aria-hidden="true">↻</span> Gerar jogo</button>
            <button type="button" class="btn btn--ghost" id="mg-new-order" disabled><span aria-hidden="true">✦</span> Nova ordem</button>
            <button type="button" class="btn btn--ghost" id="mg-print" disabled><span aria-hidden="true">⎙</span> Imprimir / salvar PDF</button>
          </div>
        </form>
      </div>

      <section class="mg__preview-panel reveal" aria-labelledby="mg-preview-title">
        <div class="mg__preview-head">
          <span class="kicker">Pré-visualização</span>
          <h2 id="mg-preview-title">Cartas geradas</h2>
        </div>
        <p class="mg__status" id="mg-status" role="status" aria-live="polite">Gerando um jogo inicial com palavras...</p>

        <div class="mg__print-area" id="mg-print-area">
          <article class="mg__page" id="mg-page" aria-label="Folha do jogo da memória">
            <header class="mg__sheet-header">
              <div class="mg__brand"><img src="../assets/images/brand/mark.svg" alt=""><span>Educa4Good</span></div>
              <span class="mg__sheet-kind">Jogo da memória</span>
            </header>
            <div class="mg__meta" id="mg-meta"></div>
            <h2 class="mg__page-title" id="mg-page-title">Jogo da memória</h2>
            <p class="mg__instruction">Recorte as cartas, embaralhe com a face virada para baixo e encontre os pares.</p>
            <div class="mg__cards" id="mg-cards">
              <div class="mg__placeholder">
                <div class="mg__mini-cards" aria-hidden="true"><span>1A</span><span>1B</span><span>2A</span><span>2B</span><span>3A</span><span>3B</span></div>
                <p>Escolha imagens ou palavras e gere as cartas.</p>
              </div>
            </div>
            <footer class="mg__sheet-footer"><span id="mg-footer">Educa4Good</span></footer>
          </article>
        </div>
      </section>
    </div>
  </div>
</section>

<section class="section mg-offer" id="jogo-memoria-encomenda">
  <div class="container">
    <div class="mg-offer__box reveal">
      <div>
        <span class="kicker" style="color:var(--color-accent-dark);font-family:var(--font-display);font-weight:800;text-transform:uppercase;font-size:var(--fs-small);letter-spacing:.08em;">Sob encomenda</span>
        <h2>Precisa de um jogo da memória maior?</h2>
        <p class="muted">O Educa4Good também prepara jogos personalizados com até 100 imagens ou até 100 palavras, em PDF organizado para imprimir, recortar e usar em sala ou em casa.</p>
        <ul class="pain-list">
          <li><svg viewBox="0 0 24 24" fill="none" stroke="#3e8e58" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5"/></svg><span>Até 100 imagens ou até 100 palavras</span></li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="#3e8e58" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5"/></svg><span>PDF no layout Educa4Good, pronto para impressão</span></li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="#3e8e58" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5"/></svg><span>Pagamento via Pix e envio dos arquivos por Google Forms</span></li>
        </ul>
      </div>
      <div>
        <div class="mg-offer__price">
          <strong>R$ 19,90</strong>
          <span>por jogo personalizado</span>
        </div>
        <div class="mg-offer__actions">
          <span class="btn btn--accent mg-offer__soon" aria-disabled="true">Google Forms em breve</span>
          <a class="btn btn--ghost" href="contato.html">Quero ser avisado</a>
        </div>
        <p class="mg__note">O link do formulário ainda não está disponível. Assim que for liberado, o pedido poderá seguir por Pix e envio das imagens ou palavras pelo Google Forms.</p>
      </div>
    </div>
  </div>
</section>
<script src="../assets/js/memory-game.js?v=20260722-cardfix2"></script>
"""
    return head_html + header(L, "tools") + body + footer(L)


def build_spot_difference_pt(L):
    title = "Encontre as Diferenças — Educa4Good"
    desc = "Transforme uma imagem em uma atividade de encontre as diferenças para jogar online ou imprimir em A4."
    url_base = SITE.get("site_url", "").rstrip("/")
    canonical = f"{url_base}/pt/encontre-as-diferencas.html" if url_base else ""
    links = f'  <link rel="canonical" href="{canonical}">\n' if canonical else ""
    og_url = f'  <meta property="og:url" content="{canonical}">\n' if canonical else ""
    og_img = (f"{url_base}/assets/images/activities/ache-o-igual.webp"
              if url_base else "../assets/images/activities/ache-o-igual.webp")
    head_html = f"""<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <meta name="description" content="{desc}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Educa4Good">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{desc}">
  <meta property="og:image" content="{og_img}">
  <meta property="og:locale" content="pt_BR">
{og_url}  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{title}">
  <meta name="twitter:description" content="{desc}">
{links}  <link rel="icon" type="image/svg+xml" href="../assets/images/brand/mark.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Nunito:wght@700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../assets/css/site.css">
  <link rel="stylesheet" href="../assets/css/spot-the-difference.css?v=20260722-diff1">
</head>
<body>
"""
    body = """<section class="page-hero diff-hero">
  <div class="container">
    <h1>Encontre as Diferenças</h1>
    <p>Envie uma imagem, gere uma segunda versão com diferenças e crie um desafio de observação para jogar online ou imprimir. Tudo acontece no seu navegador.</p>
  </div>
</section>
<section class="section diff" id="encontre-diferencas">
  <div class="container">
    <div class="section-head diff__intro reveal">
      <span class="kicker">Gerador local</span>
      <h2>Da imagem para o desafio de observação</h2>
      <p>Use uma imagem própria ou comece por uma demonstração. O Educa4Good cria diferenças distribuídas, registra as áreas corretas e prepara a folha A4 com gabarito separado.</p>
    </div>

    <div class="diff__workspace">
      <div class="diff__controls">
        <section class="diff__panel reveal" aria-labelledby="diff-image-title">
          <h2 id="diff-image-title">1. Escolha uma imagem</h2>
          <label class="diff__dropzone" id="diff-dropzone" for="diff-file">
            <span class="diff__drop-icon" aria-hidden="true">+</span>
            <strong>Arraste uma imagem aqui</strong>
            <span>ou clique para selecionar no computador</span>
          </label>
          <input class="diff__file" type="file" id="diff-file" accept="image/png,image/jpeg,image/webp,image/*" aria-describedby="diff-file-help">
          <p class="diff__note" id="diff-file-help">PNG, JPG, WebP e formatos aceitos pelo navegador, até 12 MB. A imagem fica apenas no seu aparelho.</p>
          <div class="diff__demo" aria-label="Imagens demonstrativas">
            <button type="button" class="btn btn--ghost" data-diff-demo="park">Usar paisagem</button>
            <button type="button" class="btn btn--ghost" data-diff-demo="classroom">Usar sala de aula</button>
          </div>
          <p class="diff__message" id="diff-message" role="status" aria-live="polite"></p>
          <figure class="diff__original" id="diff-original" hidden>
            <img id="diff-original-img" alt="Imagem original escolhida">
            <figcaption>Imagem original</figcaption>
          </figure>
        </section>

        <form class="diff__panel diff__settings reveal" id="diff-settings" aria-labelledby="diff-settings-title">
          <h2 id="diff-settings-title">2. Configure a atividade</h2>

          <div class="diff__field">
            <label for="diff-title">Título da folha</label>
            <input type="text" id="diff-title" value="Encontre as diferenças" maxlength="80">
          </div>

          <div class="diff__field">
            <label for="diff-count">Quantidade de diferenças</label>
            <select id="diff-count">
              <option value="3">3 diferenças — Fácil</option>
              <option value="5" selected>5 diferenças — Médio</option>
              <option value="7">7 diferenças — Difícil</option>
              <option value="10">10 diferenças — Desafio</option>
            </select>
          </div>

          <fieldset class="diff__fieldset">
            <legend>Identificação opcional</legend>
            <div class="diff__grid-3">
              <div class="diff__field">
                <label for="diff-child">Nome</label>
                <input type="text" id="diff-child" maxlength="40" placeholder="Nome da criança">
              </div>
              <div class="diff__field">
                <label for="diff-date">Data</label>
                <input type="text" id="diff-date" maxlength="20" placeholder="__/__/____">
              </div>
              <div class="diff__field">
                <label for="diff-class">Turma</label>
                <input type="text" id="diff-class" maxlength="24" placeholder="Turma">
              </div>
            </div>
          </fieldset>

          <div class="diff__actions">
            <button type="button" class="btn btn--primary" id="diff-generate"><span aria-hidden="true">↻</span> Criar atividade</button>
            <button type="button" class="btn btn--ghost" id="diff-regenerate" disabled><span aria-hidden="true">✦</span> Gerar novas diferenças</button>
            <button type="button" class="btn btn--ghost" id="diff-solution" disabled><span aria-hidden="true">◎</span> Mostrar solução</button>
            <button type="button" class="btn btn--ghost" id="diff-reset" disabled><span aria-hidden="true">↺</span> Reiniciar jogo</button>
            <button type="button" class="btn btn--ghost" id="diff-print" disabled><span aria-hidden="true">⎙</span> Imprimir atividade</button>
            <button type="button" class="btn btn--ghost" id="diff-print-answer" disabled><span aria-hidden="true">#</span> Imprimir gabarito</button>
          </div>
        </form>
      </div>

      <section class="diff__preview-panel reveal" aria-labelledby="diff-preview-title">
        <div class="diff__preview-head">
          <span class="kicker">Jogue online</span>
          <h2 id="diff-preview-title">Imagem A | Imagem B</h2>
        </div>
        <p class="diff__status" id="diff-status" role="status" aria-live="polite">Carregando uma demonstração para começar...</p>
        <div class="diff__score" id="diff-score" aria-live="polite">
          <span>Diferenças encontradas: <strong id="diff-found">0</strong> de <strong id="diff-total">5</strong></span>
        </div>

        <div class="diff__playground" id="diff-playground">
          <figure class="diff__scene">
            <figcaption>Imagem A</figcaption>
            <canvas id="diff-canvas-original" width="900" height="620" role="img" aria-label="Imagem original do desafio"></canvas>
          </figure>
          <figure class="diff__scene">
            <figcaption>Imagem B</figcaption>
            <canvas id="diff-canvas-modified" width="900" height="620" role="img" aria-label="Imagem modificada do desafio. Clique nas diferenças encontradas."></canvas>
          </figure>
        </div>

        <div class="diff__print-area" id="diff-print-area">
          <article class="diff__page diff__page--activity" aria-label="Folha da atividade Encontre as Diferenças">
            <header class="diff__sheet-header">
              <div class="diff__brand"><img src="../assets/images/brand/mark.svg" alt=""><span>Educa4Good</span></div>
              <span class="diff__sheet-kind">Encontre as diferenças</span>
            </header>
            <div class="diff__meta" id="diff-print-meta"></div>
            <h2 class="diff__page-title" id="diff-print-title">Encontre as diferenças</h2>
            <p class="diff__instruction">Observe atentamente as duas imagens e encontre as <strong id="diff-print-count">5</strong> diferenças.</p>
            <div class="diff__print-pair">
              <figure><img id="diff-print-original" alt="Imagem A da atividade"><figcaption>Imagem A</figcaption></figure>
              <figure><img id="diff-print-modified" alt="Imagem B da atividade"><figcaption>Imagem B</figcaption></figure>
            </div>
            <footer class="diff__sheet-footer"><span>Educa4Good · Atividade para observação visual</span></footer>
          </article>

          <article class="diff__page diff__page--answer" aria-label="Gabarito da atividade Encontre as Diferenças">
            <header class="diff__sheet-header">
              <div class="diff__brand"><img src="../assets/images/brand/mark.svg" alt=""><span>Educa4Good</span></div>
              <span class="diff__sheet-kind">Gabarito</span>
            </header>
            <div class="diff__meta" id="diff-answer-meta"></div>
            <h2 class="diff__page-title" id="diff-answer-title">Gabarito — Encontre as diferenças</h2>
            <p class="diff__instruction">As áreas numeradas indicam onde estão as diferenças na imagem modificada.</p>
            <figure class="diff__answer-figure">
              <img id="diff-answer-img" alt="Gabarito com diferenças numeradas">
              <figcaption>Gabarito para o educador</figcaption>
            </figure>
            <footer class="diff__sheet-footer"><span>Educa4Good · Gabarito separado</span></footer>
          </article>
        </div>
      </section>
    </div>
  </div>
</section>
<script src="../assets/js/spot-the-difference.js?v=20260722-diff1"></script>
"""
    return head_html + header(L, "tools") + body + footer(L)


def build_color_by_number_pt(L):
    title = "Colorir por Números — Educa4Good"
    desc = "Transforme uma imagem em uma atividade infantil de colorir por números, com contornos, legenda editável e impressão A4."
    url_base = SITE.get("site_url", "").rstrip("/")
    canonical = f"{url_base}/pt/colorir-por-numeros.html" if url_base else ""
    links = f'  <link rel="canonical" href="{canonical}">\n' if canonical else ""
    og_url = f'  <meta property="og:url" content="{canonical}">\n' if canonical else ""
    og_img = (f"{url_base}/assets/images/activities/colorir-codigo.webp"
              if url_base else "../assets/images/activities/colorir-codigo.webp")
    head_html = f"""<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <meta name="description" content="{desc}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Educa4Good">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{desc}">
  <meta property="og:image" content="{og_img}">
  <meta property="og:locale" content="pt_BR">
{og_url}  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{title}">
  <meta name="twitter:description" content="{desc}">
{links}  <link rel="icon" type="image/svg+xml" href="../assets/images/brand/mark.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Nunito:wght@700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../assets/css/site.css">
  <link rel="stylesheet" href="../assets/css/color-by-number.css?v=20260723-cbn1">
</head>
<body>
"""
    body = """<section class="page-hero cbn-hero">
  <div class="container">
    <h1>Colorir por Números</h1>
    <p>Envie uma imagem e transforme-a em uma folha de colorir com contornos, números e legenda de cores. A atividade é criada no seu navegador, sem enviar a imagem para servidores.</p>
  </div>
</section>
<section class="section cbn" id="colorir-por-numeros">
  <div class="container">
    <div class="section-head cbn__intro reveal">
      <span class="kicker">Gerador local</span>
      <h2>Da imagem para a atividade pronta para imprimir</h2>
      <p>Reduza as cores, simplifique detalhes, edite a paleta e gere uma folha A4 legível para crianças pintarem com lápis de cor.</p>
    </div>

    <div class="cbn__workspace">
      <div class="cbn__controls">
        <section class="cbn__panel reveal" aria-labelledby="cbn-image-title">
          <h2 id="cbn-image-title">1. Escolha uma imagem</h2>
          <label class="cbn__dropzone" id="cbn-dropzone" for="cbn-file">
            <span class="cbn__drop-icon" aria-hidden="true">+</span>
            <strong>Arraste uma imagem aqui</strong>
            <span>ou clique para selecionar no computador</span>
          </label>
          <input class="cbn__file" type="file" id="cbn-file" accept="image/png,image/jpeg,image/webp,image/*" aria-describedby="cbn-file-help">
          <p class="cbn__note" id="cbn-file-help">PNG, JPG, WebP e formatos aceitos pelo navegador, até 12 MB. Sua imagem é processada diretamente no navegador e não é enviada para nossos servidores.</p>
          <div class="cbn__demo" aria-label="Imagens demonstrativas">
            <button type="button" class="btn btn--ghost" data-cbn-demo="garden">Usar jardim</button>
            <button type="button" class="btn btn--ghost" data-cbn-demo="rocket">Usar foguete</button>
          </div>
          <p class="cbn__message" id="cbn-message" role="status" aria-live="polite"></p>
          <figure class="cbn__original" id="cbn-original" hidden>
            <img id="cbn-original-img" alt="Imagem original escolhida">
            <figcaption>Imagem original</figcaption>
          </figure>
        </section>

        <form class="cbn__panel cbn__settings reveal" id="cbn-settings" aria-labelledby="cbn-settings-title">
          <h2 id="cbn-settings-title">2. Configure a atividade</h2>

          <div class="cbn__field">
            <label for="cbn-title">Título da folha</label>
            <input type="text" id="cbn-title" value="Colorir por números" maxlength="80">
          </div>

          <div class="cbn__grid-2">
            <div class="cbn__field">
              <label for="cbn-preset">Dificuldade</label>
              <select id="cbn-preset">
                <option value="easy">Fácil: 4 cores</option>
                <option value="medium" selected>Médio: 6 cores</option>
                <option value="hard">Difícil: 8 cores</option>
                <option value="challenge">Desafio: 10 cores</option>
              </select>
            </div>
            <div class="cbn__field">
              <label for="cbn-colors">Quantidade de cores</label>
              <select id="cbn-colors">
                <option value="4">4 cores</option>
                <option value="6" selected>6 cores</option>
                <option value="8">8 cores</option>
                <option value="10">10 cores</option>
              </select>
            </div>
          </div>

          <div class="cbn__grid-2">
            <div class="cbn__field">
              <label for="cbn-detail">Detalhamento</label>
              <select id="cbn-detail">
                <option value="low">Baixo: regiões grandes</option>
                <option value="medium" selected>Médio: equilíbrio</option>
                <option value="high">Alto: mais detalhes</option>
              </select>
            </div>
            <div class="cbn__field">
              <label for="cbn-palette-preset">Paleta</label>
              <select id="cbn-palette-preset">
                <option value="auto" selected>Automática</option>
                <option value="basic">Cores básicas</option>
                <option value="soft">Tons suaves</option>
                <option value="vibrant">Cores vibrantes</option>
                <option value="gray">Preto, branco e cinzas</option>
              </select>
            </div>
          </div>

          <fieldset class="cbn__fieldset">
            <legend>Ajuste e enquadramento</legend>
            <div class="cbn__grid-3">
              <div class="cbn__field">
                <label for="cbn-zoom">Zoom <output id="cbn-zoom-output">100%</output></label>
                <input type="range" id="cbn-zoom" min="100" max="220" step="5" value="100">
              </div>
              <div class="cbn__field">
                <label for="cbn-pan-x">Horizontal <output id="cbn-pan-x-output">0</output></label>
                <input type="range" id="cbn-pan-x" min="-100" max="100" step="2" value="0">
              </div>
              <div class="cbn__field">
                <label for="cbn-pan-y">Vertical <output id="cbn-pan-y-output">0</output></label>
                <input type="range" id="cbn-pan-y" min="-100" max="100" step="2" value="0">
              </div>
            </div>
            <div class="cbn__field cbn__check">
              <input type="checkbox" id="cbn-simplify-bg">
              <label for="cbn-simplify-bg">Simplificar fundo claro ou dominante</label>
            </div>
            <button type="button" class="btn btn--ghost" id="cbn-reset-frame">Redefinir enquadramento</button>
          </fieldset>

          <fieldset class="cbn__fieldset">
            <legend>Identificação opcional</legend>
            <div class="cbn__grid-3">
              <div class="cbn__field">
                <label for="cbn-child">Nome</label>
                <input type="text" id="cbn-child" maxlength="40" placeholder="Nome da criança">
              </div>
              <div class="cbn__field">
                <label for="cbn-date">Data</label>
                <input type="text" id="cbn-date" maxlength="20" placeholder="__/__/____">
              </div>
              <div class="cbn__field">
                <label for="cbn-class">Turma</label>
                <input type="text" id="cbn-class" maxlength="24" placeholder="Turma">
              </div>
            </div>
          </fieldset>

          <div class="cbn__actions">
            <button type="button" class="btn btn--primary" id="cbn-generate"><span aria-hidden="true">↻</span> Gerar atividade</button>
            <button type="button" class="btn btn--ghost" id="cbn-regenerate" disabled><span aria-hidden="true">✦</span> Gerar novamente</button>
            <button type="button" class="btn btn--ghost" id="cbn-solution" disabled><span aria-hidden="true">◎</span> Ver solução</button>
            <button type="button" class="btn btn--ghost" id="cbn-reset-paint" disabled><span aria-hidden="true">↺</span> Limpar pintura</button>
            <button type="button" class="btn btn--ghost" id="cbn-print" disabled><span aria-hidden="true">⎙</span> Imprimir atividade</button>
            <button type="button" class="btn btn--ghost" id="cbn-print-answer" disabled><span aria-hidden="true">#</span> Imprimir gabarito</button>
          </div>
        </form>
      </div>

      <section class="cbn__preview-panel reveal" aria-labelledby="cbn-preview-title">
        <div class="cbn__preview-head">
          <span class="kicker">Pré-visualização</span>
          <h2 id="cbn-preview-title">Atividade gerada</h2>
        </div>
        <p class="cbn__status" id="cbn-status" role="status" aria-live="polite">Carregando uma demonstração para começar...</p>
        <div class="cbn__progress" id="cbn-progress" aria-live="polite">
          <span><strong id="cbn-painted-count">0</strong> de <strong id="cbn-region-count">0</strong> regiões coloridas</span>
        </div>

        <div class="cbn__tabs" role="tablist" aria-label="Modo de visualização">
          <button type="button" class="is-active" data-cbn-view="activity">Atividade</button>
          <button type="button" data-cbn-view="original">Original</button>
          <button type="button" data-cbn-view="simplified">Simplificada</button>
          <button type="button" data-cbn-view="colored">Resultado colorido</button>
        </div>

        <div class="cbn__stage">
          <canvas id="cbn-canvas" width="900" height="660" role="img" aria-label="Pré-visualização da atividade de colorir por números"></canvas>
        </div>

        <div class="cbn__legend-panel">
          <div class="cbn__legend-head">
            <h3>Legenda e edição de cores</h3>
            <span id="cbn-selected-label">Número selecionado: 1</span>
          </div>
          <div class="cbn__palette" id="cbn-palette" aria-label="Legenda editável de cores"></div>
          <p class="cbn__note">Clique em uma cor para escolher o número. Use o seletor para trocar a cor sem recalcular as regiões.</p>
        </div>

        <div class="cbn__print-area" id="cbn-print-area">
          <article class="cbn__page cbn__page--activity" aria-label="Folha Colorir por Números">
            <header class="cbn__sheet-header">
              <div class="cbn__brand"><img src="../assets/images/brand/mark.svg" alt=""><span>Educa4Good</span></div>
              <span class="cbn__sheet-kind">Colorir por números</span>
            </header>
            <div class="cbn__meta" id="cbn-print-meta"></div>
            <h2 class="cbn__page-title" id="cbn-print-title">Colorir por números</h2>
            <p class="cbn__instruction">Pinte cada região usando a cor correspondente ao número indicado.</p>
            <img class="cbn__print-img" id="cbn-print-activity-img" alt="Atividade de colorir por números com contornos e números">
            <div class="cbn__print-legend" id="cbn-print-legend"></div>
            <footer class="cbn__sheet-footer"><span>Educa4Good · Atividade para colorir</span></footer>
          </article>

          <article class="cbn__page cbn__page--answer" aria-label="Gabarito Colorir por Números">
            <header class="cbn__sheet-header">
              <div class="cbn__brand"><img src="../assets/images/brand/mark.svg" alt=""><span>Educa4Good</span></div>
              <span class="cbn__sheet-kind">Gabarito</span>
            </header>
            <div class="cbn__meta" id="cbn-answer-meta"></div>
            <h2 class="cbn__page-title" id="cbn-answer-title">Gabarito — Colorir por números</h2>
            <p class="cbn__instruction">Resultado colorido com a mesma legenda da atividade.</p>
            <img class="cbn__print-img" id="cbn-answer-img" alt="Resultado colorido da atividade">
            <div class="cbn__print-legend" id="cbn-answer-legend"></div>
            <footer class="cbn__sheet-footer"><span>Educa4Good · Gabarito separado</span></footer>
          </article>
        </div>
      </section>
    </div>
  </div>
</section>
<script src="../assets/js/color-by-number.js?v=20260723-cbn1"></script>
"""
    return head_html + header(L, "tools") + body + footer(L)


def build_complete_drawing_pt(L):
    title = "Complete o Desenho — Educa4Good"
    desc = ("Envie uma imagem, esconda metade da figura e gere uma atividade A4 para a "
            "criança completar o desenho trabalhando simetria e coordenação motora.")
    url_base = SITE.get("site_url", "").rstrip("/")
    canonical = f"{url_base}/pt/complete-o-desenho.html" if url_base else ""
    links = f'  <link rel="canonical" href="{canonical}">\n' if canonical else ""
    og_url = f'  <meta property="og:url" content="{canonical}">\n' if canonical else ""
    og_img = (f"{url_base}/assets/images/activities/ligue-sombras.webp"
              if url_base else "../assets/images/activities/ligue-sombras.webp")
    head_html = f"""<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <meta name="description" content="{desc}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Educa4Good">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{desc}">
  <meta property="og:image" content="{og_img}">
  <meta property="og:locale" content="pt_BR">
{og_url}  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{title}">
  <meta name="twitter:description" content="{desc}">
{links}  <link rel="icon" type="image/svg+xml" href="../assets/images/brand/mark.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Nunito:wght@700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../assets/css/site.css">
  <link rel="stylesheet" href="../assets/css/complete-drawing.css">
</head>
<body>
"""
    body = """<section class="page-hero cd-hero">
  <div class="container">
    <h1>Complete o desenho</h1>
    <p>Escolha uma imagem, esconda metade da figura e imprima uma folha A4 para a criança completar o desenho. A imagem é processada no seu navegador e não vai para servidor nenhum.</p>
  </div>
</section>
<section class="section cd" id="complete-o-desenho">
  <div class="container">
    <div class="section-head cd__intro reveal">
      <span class="kicker">Gerador local</span>
      <h2>De uma imagem para uma atividade de simetria</h2>
      <p>A metade que ficar visível serve de modelo; a outra metade sai em branco, com eixo e grade opcionais, para a criança desenhar.</p>
    </div>

    <div class="cd__workspace">
      <div class="cd__controls">
        <section class="cd__panel reveal" aria-labelledby="cd-image-title">
          <h2 id="cd-image-title">1. Escolha a imagem</h2>
          <div class="cd__field">
            <label for="cd-file">Imagem da atividade</label>
            <input type="file" id="cd-file" accept="image/png,image/jpeg,image/webp,image/*" aria-describedby="cd-file-help">
            <p class="cd__note" id="cd-file-help">PNG, JPG, JPEG ou WebP, de até 12 MB. Desenhos com fundo claro e traços definidos funcionam melhor.</p>
          </div>
          <div class="cd__actions">
            <button type="button" class="btn btn--ghost" id="cd-example"><span aria-hidden="true">✦</span> Usar imagem de exemplo</button>
            <button type="button" class="btn btn--ghost" id="cd-reset"><span aria-hidden="true">↺</span> Reiniciar</button>
          </div>
          <p class="cd__privacy"><span aria-hidden="true">🔒</span> <span>Sua imagem é processada diretamente no navegador e não é enviada para nossos servidores. Nada fica armazenado.</span></p>
          <p class="cd__message" id="cd-message" role="status" aria-live="polite"></p>
        </section>

        <section class="cd__panel reveal" aria-labelledby="cd-frame-title">
          <h2 id="cd-frame-title">2. Ajuste o enquadramento</h2>
          <div class="cd__field">
            <label for="cd-zoom">Zoom: <b id="cd-zoom-output">1x</b></label>
            <input type="range" id="cd-zoom" min="1" max="3" step="0.05" value="1">
          </div>
          <p class="cd__hint" id="cd-frame-hint">Arraste a figura na pré-visualização para mover o enquadramento.</p>
          <div class="cd__actions">
            <button type="button" class="btn btn--ghost" id="cd-center">Centralizar</button>
            <button type="button" class="btn btn--ghost" id="cd-reset-frame">Redefinir enquadramento</button>
          </div>
        </section>

        <section class="cd__panel reveal" aria-labelledby="cd-activity-title">
          <h2 id="cd-activity-title">3. Monte a atividade</h2>

          <div class="cd__field">
            <label for="cd-mode">Tipo de atividade</label>
            <select id="cd-mode">
              <option value="simetria" selected>Completar por simetria — a criança desenha o reflexo</option>
              <option value="continuar">Continuar o desenho — a criança reproduz a parte que sumiu</option>
            </select>
            <p class="cd__note">Para atividades de simetria, prefira imagens vistas de frente e com formato aproximadamente simétrico. O modo “continuar” funciona com qualquer figura.</p>
          </div>

          <div class="cd__grid-2">
            <div class="cd__field">
              <label for="cd-side">Parte que será escondida</label>
              <select id="cd-side">
                <option value="direita" selected>Metade direita</option>
                <option value="esquerda">Metade esquerda</option>
                <option value="baixo">Metade inferior</option>
                <option value="cima">Metade superior</option>
                <option value="diagonal">Metade na diagonal</option>
              </select>
            </div>
            <div class="cd__field">
              <label for="cd-level">Dificuldade</label>
              <select id="cd-level">
                <option value="facil">Fácil: grade grande e pistas</option>
                <option value="medio" selected>Médio: grade intermediária</option>
                <option value="dificil">Difícil: sem grade</option>
              </select>
            </div>
          </div>

          <div class="cd__grid-2">
            <div class="cd__field">
              <label for="cd-style">Estilo da figura</label>
              <select id="cd-style">
                <option value="original">Original</option>
                <option value="cinza">Escala de cinza</option>
                <option value="contorno" selected>Contorno</option>
                <option value="contorno-suave">Contorno suave</option>
              </select>
            </div>
            <div class="cd__field">
              <label for="cd-grid">Grade de apoio</label>
              <select id="cd-grid">
                <option value="nenhuma">Sem grade</option>
                <option value="grande">Grade grande</option>
                <option value="media" selected>Grade média</option>
                <option value="pequena">Grade pequena</option>
              </select>
            </div>
          </div>

          <div class="cd__grid-2">
            <div class="cd__field">
              <label for="cd-axis">Eixo de simetria</label>
              <select id="cd-axis">
                <option value="nenhuma">Sem linha</option>
                <option value="continua">Linha contínua</option>
                <option value="tracejada" selected>Linha tracejada</option>
              </select>
            </div>
            <div class="cd__field">
              <label for="cd-orientation">Folha A4</label>
              <select id="cd-orientation">
                <option value="auto" selected>Automática</option>
                <option value="portrait">Retrato</option>
                <option value="landscape">Paisagem</option>
              </select>
              <p class="cd__note" id="cd-orientation-hint"></p>
            </div>
          </div>

          <div class="cd__check">
            <input type="checkbox" id="cd-dots">
            <label for="cd-dots">Mostrar pontos de referência<span>Marcas discretas no eixo e nos cruzamentos da grade para as crianças menores.</span></label>
          </div>
          <div class="cd__check">
            <input type="checkbox" id="cd-hint">
            <label for="cd-hint">Complete com ajuda (traçado guiado)<span>A parte escondida aparece bem clarinha, para a criança passar o lápis por cima.</span></label>
          </div>

          <div class="cd__actions">
            <button type="button" class="btn btn--ghost" id="cd-swap"><span aria-hidden="true">⇄</span> Trocar lado</button>
          </div>
        </section>

        <form class="cd__panel reveal" id="cd-sheet-form" aria-labelledby="cd-sheet-title">
          <h2 id="cd-sheet-title">4. Ajuste a folha</h2>

          <div class="cd__field">
            <label for="cd-title">Título da atividade</label>
            <select id="cd-title">
              <option value="Complete o desenho" selected>Complete o desenho</option>
              <option value="Complete a outra metade">Complete a outra metade</option>
              <option value="Desenhe a parte que está faltando">Desenhe a parte que está faltando</option>
              <option value="Complete a figura">Complete a figura</option>
              <option value="Complete usando a simetria">Complete usando a simetria</option>
              <option value="custom">Título personalizado…</option>
            </select>
          </div>

          <div class="cd__field" id="cd-title-custom-field" hidden>
            <label for="cd-title-custom">Título personalizado</label>
            <input type="text" id="cd-title-custom" maxlength="60" placeholder="Escreva o título da folha">
          </div>

          <div class="cd__field">
            <label for="cd-instruction">Instrução impressa</label>
            <textarea id="cd-instruction" rows="3" maxlength="220"></textarea>
            <div class="cd__actions">
              <button type="button" class="btn btn--ghost" id="cd-instruction-reset">Voltar à instrução automática</button>
            </div>
          </div>

          <fieldset class="cd__fieldset">
            <legend>Identificação opcional</legend>
            <div class="cd__grid-2">
              <div class="cd__field">
                <label for="cd-child">Nome</label>
                <input type="text" id="cd-child" maxlength="40" placeholder="Nome da criança">
              </div>
              <div class="cd__field">
                <label for="cd-date">Data</label>
                <input type="text" id="cd-date" maxlength="24" placeholder="__/__/____">
              </div>
            </div>
          </fieldset>

          <div class="cd__actions">
            <button type="button" class="btn btn--primary" id="cd-print"><span aria-hidden="true">⎙</span> Imprimir atividade</button>
            <button type="button" class="btn btn--ghost" id="cd-print-solution"><span aria-hidden="true">✓</span> Imprimir gabarito</button>
          </div>
        </form>
      </div>

      <section class="cd__preview-panel reveal" aria-labelledby="cd-preview-title">
        <div class="cd__preview-head">
          <span class="kicker">Pré-visualização</span>
          <h2 id="cd-preview-title">Folha A4</h2>
        </div>
        <p class="cd__status" id="cd-status" role="status" aria-live="polite">Envie uma imagem ou use o exemplo para começar.</p>

        <div class="cd__views" role="group" aria-label="O que mostrar na pré-visualização">
          <button type="button" data-cd-view="activity" class="is-active" aria-pressed="true">Atividade</button>
          <button type="button" data-cd-view="original" aria-pressed="false">Original</button>
          <button type="button" data-cd-view="solution" aria-pressed="false">Solução</button>
          <button type="button" id="cd-draw-toggle" aria-pressed="false">Desenhar na tela</button>
        </div>

        <div class="cd__print-area" id="cd-print-area">
          <div class="cd__stage" id="cd-stage" data-view="activity">
            <div class="cd__page cd__page--activity">
              <canvas id="cd-activity" class="cd__canvas" aria-label="Pré-visualização da atividade"></canvas>
              <canvas id="cd-overlay" class="cd__overlay" aria-label="Área para desenhar na tela"></canvas>
            </div>
            <div class="cd__page cd__page--original">
              <canvas id="cd-original" aria-label="Imagem original enviada"></canvas>
            </div>
            <div class="cd__page cd__page--solution">
              <canvas id="cd-solution" aria-label="Gabarito com a figura completa"></canvas>
            </div>
          </div>
        </div>

        <div class="cd__draw-tools" id="cd-draw-tools" hidden>
          <div class="cd__field">
            <label for="cd-tool">Ferramenta</label>
            <select id="cd-tool">
              <option value="lapis" selected>Lápis</option>
              <option value="borracha">Borracha</option>
            </select>
          </div>
          <div class="cd__field">
            <label for="cd-pen-size">Espessura</label>
            <input type="range" id="cd-pen-size" min="1" max="12" step="1" value="4">
          </div>
          <button type="button" class="btn btn--ghost" id="cd-undo">Desfazer</button>
          <button type="button" class="btn btn--ghost" id="cd-clear">Limpar desenho</button>
        </div>
      </section>
    </div>
  </div>
</section>
<script src="../assets/js/complete-drawing.js"></script>
"""
    return head_html + header(L, "tools") + body + footer(L)


# ---------------------------------------------------------------- raiz e extras
def build_root_index():
    default = SITE["default_lang"]
    links = " · ".join(
        f'<a href="{code}/index.html">{LX["lang_name"]}</a>' for code, LX in LANGS.items()
    )
    return f"""<!DOCTYPE html>
<html lang="{default}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Educa4Good</title>
  <meta name="robots" content="noindex">
  <link rel="icon" type="image/svg+xml" href="assets/images/brand/mark.svg">
  <script>
    (function () {{
      var langs = {json.dumps(SITE["languages"])};
      var pick = null;
      try {{ pick = localStorage.getItem("e4g-lang"); }} catch (e) {{}}
      if (langs.indexOf(pick) === -1) {{
        var nav = (navigator.language || "{default}").slice(0, 2).toLowerCase();
        pick = langs.indexOf(nav) !== -1 ? nav : "{default}";
      }}
      location.replace(pick + "/index.html");
    }})();
  </script>
</head>
<body>
  <p style="font-family:sans-serif;text-align:center;margin-top:3rem">
    Educa4Good — {links}
  </p>
</body>
</html>
"""


def build_404():
    links = "".join(
        f'<p><a href="{BASE}/{code}/index.html">{LX["lang_name"]}</a></p>' for code, LX in LANGS.items()
    )
    return f"""<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>404 — Educa4Good</title>
  <link rel="icon" type="image/svg+xml" href="{BASE}/assets/images/brand/mark.svg">
  <style>body{{font-family:system-ui,sans-serif;text-align:center;padding:4rem 1rem;color:#223344}}
  h1{{color:#2b6ca3;font-size:3rem;margin-bottom:.3em}}a{{color:#2b6ca3}}</style>
</head>
<body>
  <h1>404</h1>
  <p>Página não encontrada · Page not found · Página no encontrada</p>
  {links}
</body>
</html>
"""


def build_sitemap():
    base = SITE.get("site_url", "").rstrip("/")
    urls = ""
    for code, L in LANGS.items():
        for key in PAGE_KEYS:
            loc = f"{base}/{code}/{L['slugs'][key]}.html" if base else f"{code}/{L['slugs'][key]}.html"
            urls += f"  <url><loc>{loc}</loc></url>\n"
    for extra_path in ["pt/ligar-os-pontos.html", "pt/caca-palavras.html", "pt/jogo-da-memoria.html", "pt/encontre-as-diferencas.html", "pt/colorir-por-numeros.html", "pt/complete-o-desenho.html"]:
        extra = f"{base}/{extra_path}" if base else extra_path
        urls += f"  <url><loc>{extra}</loc></url>\n"
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}</urlset>\n'


# ---------------------------------------------------------------- main
def main():
    builders = {
        "home": build_home,
        "activities": build_activities,
        "tools": build_tools,
        "how": build_how,
        "teachers": lambda L: build_audience(L, "teachers"),
        "families": lambda L: build_audience(L, "families"),
        "about": build_about,
        "faq": build_faq_page,
        "contact": build_contact,
        "terms": lambda L: build_legal(L, "terms"),
        "privacy": lambda L: build_legal(L, "privacy"),
    }
    count = 0
    for code, L in LANGS.items():
        outdir = os.path.join(ROOT, code)
        os.makedirs(outdir, exist_ok=True)
        for key, fn in builders.items():
            html = fn(L)
            fname = f"{L['slugs'][key]}.html"
            with open(os.path.join(outdir, fname), "w", encoding="utf-8") as f:
                f.write(html)
            count += 1

    with open(os.path.join(ROOT, "pt", "ligar-os-pontos.html"), "w", encoding="utf-8") as f:
        f.write(build_connect_dots_pt(LANGS["pt"]))
    count += 1

    with open(os.path.join(ROOT, "pt", "caca-palavras.html"), "w", encoding="utf-8") as f:
        f.write(build_word_search_pt(LANGS["pt"]))
    count += 1

    with open(os.path.join(ROOT, "pt", "jogo-da-memoria.html"), "w", encoding="utf-8") as f:
        f.write(build_memory_game_pt(LANGS["pt"]))
    count += 1

    with open(os.path.join(ROOT, "pt", "encontre-as-diferencas.html"), "w", encoding="utf-8") as f:
        f.write(build_spot_difference_pt(LANGS["pt"]))
    count += 1

    with open(os.path.join(ROOT, "pt", "colorir-por-numeros.html"), "w", encoding="utf-8") as f:
        f.write(build_color_by_number_pt(LANGS["pt"]))
    count += 1

    with open(os.path.join(ROOT, "pt", "complete-o-desenho.html"), "w", encoding="utf-8") as f:
        f.write(build_complete_drawing_pt(LANGS["pt"]))
    count += 1

    with open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8") as f:
        f.write(build_root_index())
    with open(os.path.join(ROOT, "404.html"), "w", encoding="utf-8") as f:
        f.write(build_404())
    with open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write(build_sitemap())
    with open(os.path.join(ROOT, "robots.txt"), "w", encoding="utf-8") as f:
        base = SITE.get("site_url", "").rstrip("/")
        f.write("User-agent: *\nAllow: /\n"
                + (f"Sitemap: {base}/sitemap.xml\n" if base else ""))
    with open(os.path.join(ROOT, ".nojekyll"), "w") as f:
        f.write("")

    print(f"OK: {count} páginas + index raiz + 404 + sitemap + robots gerados.")


if __name__ == "__main__":
    main()
