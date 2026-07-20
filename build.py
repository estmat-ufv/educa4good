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

ROOT = os.path.dirname(os.path.abspath(__file__))


def load(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as f:
        return json.load(f)


SITE = load("_data", "site.json")
PRODUCT = load("_data", "product.json")
ACTIVITIES = load("_data", "activities.json")["items"]
TESTIMONIALS = load("_data", "testimonials.json")
LANGS = {code: load("_data", "i18n", f"{code}.json") for code in SITE["languages"]}

PAGE_KEYS = ["home", "activities", "how", "teachers", "families",
             "about", "faq", "contact", "terms", "privacy"]

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
    for key, label_key in [("activities", "activities"), ("how", "how"),
                           ("teachers", "teachers"), ("families", "families"),
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
        f'<p><a href="/{code}/index.html">{LX["lang_name"]}</a></p>' for code, LX in LANGS.items()
    )
    return f"""<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>404 — Educa4Good</title>
  <link rel="icon" type="image/svg+xml" href="/assets/images/brand/mark.svg">
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
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}</urlset>\n'


# ---------------------------------------------------------------- main
def main():
    builders = {
        "home": build_home,
        "activities": build_activities,
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
