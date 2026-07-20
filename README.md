# Site comercial do Educa4Good

Site estático multilíngue (PT · EN · ES) que apresenta e vende a biblioteca de
atividades do Educa4Good. **Nenhuma dependência além de Python 3** — o HTML é
gerado por `build.py` e pode ser servido em qualquer hospedagem estática
(GitHub Pages, Netlify, Vercel...).

## Estrutura

```
Pagina/
├── build.py                  ← gerador (MOTOR: estrutura HTML dos componentes)
├── _data/
│   ├── site.json             ← configuração central (contagens, e-mail, redes, site_url)
│   ├── product.json          ← nome do produto, PREÇOS e URLs DE COMPRA por idioma
│   ├── activities.json       ← itens da GALERIA (imagem, categorias, idade, textos)
│   ├── testimonials.json     ← depoimentos (desativado até haver depoimentos REAIS)
│   └── i18n/
│       ├── pt.json           ← TODOS os textos em português
│       ├── en.json           ← ... em inglês
│       └── es.json           ← ... em espanhol
├── assets/
│   ├── css/site.css          ← design system (tokens em CSS custom properties)
│   ├── js/site.js            ← menu, filtros, lightbox, idioma, animações
│   └── images/
│       ├── brand/            ← logo.svg, logo-light.svg (rodapé), mark.svg (favicon)
│       └── activities/       ← previews reais das atividades (WebP ~780px)
├── pt/ en/ es/               ← páginas GERADAS (não edite à mão!)
├── index.html                ← raiz gerada: detecta/lembra o idioma e redireciona
├── 404.html, sitemap.xml, robots.txt, .nojekyll   ← gerados
└── README.md
```

**Regra de ouro:** nunca edite os `.html` gerados. Edite os `.json` (textos/dados)
ou o `build.py`/`site.css` (estrutura/estilo) e rode:

```powershell
python build.py
```

## Como testar localmente

```powershell
cd Pagina
python build.py
python -m http.server 8931
# abra http://localhost:8931/
```

## Como editar os textos

Todos os textos visíveis estão em `_data/i18n/{pt,en,es}.json`, organizados por
seção (`hero`, `problem`, `categories`, `faq`...). Edite os três idiomas de forma
correspondente (as chaves são idênticas) e rode `python build.py`.

## Como adicionar uma atividade à galeria

1. Gere o preview: compile o kit, renderize a página desejada e converta:
   ```powershell
   pdftoppm -png -r 110 -f 2 -l 2 build/pdfs/SEU_KIT.pdf preview
   ```
   Depois converta para WebP com Pillow (~780px de largura) e salve em
   `Pagina/assets/images/activities/nome-curto.webp`.
2. Acrescente uma entrada em `_data/activities.json` com `image`, `categories`
   (entre: `alfabetizacao`, `matematica`, `leitura`, `coordenacao`, `logica`,
   `jogos`, `infantil`), `age` e `title`/`desc` nos 3 idiomas.
3. `python build.py`.

## Como alterar preço e URL de compra

Edite `_data/product.json`:

- `price.pt.display` → ex.: `"R$ 19,90"`
- `purchase_url.pt` → URL do checkout (Hotmart, Kiwify, Gumroad, Amazon...).
  Enquanto for `"#"`, o botão leva à página de contato com o rótulo
  "Falar com a gente" (comportamento intencional de pré-lançamento).
- `sample_url.*` → URL do PDF da amostra grátis por idioma (mesma lógica).

## Como adicionar um idioma

1. Copie `_data/i18n/pt.json` para, ex., `_data/i18n/fr.json` e traduza tudo
   (inclusive os `slugs` — eles viram nomes de arquivo).
2. Acrescente `"fr"` em `languages` no `_data/site.json`.
3. Acrescente os campos `fr` em `product.json` e nos `title`/`desc` de
   `activities.json`.
4. `python build.py` — o seletor de idiomas, hreflang e sitemap se ajustam sozinhos.

## Como publicar (GitHub Pages)

1. Preencha `site_url` em `_data/site.json` com a URL pública final
   (isso ativa canonical, hreflang e og:url absolutos) e rode `python build.py`.
2. Faça commit da pasta `Pagina/` e publique-a via Settings → Pages
   (branch + pasta), ou copie o conteúdo para o branch/repositório de Pages.
   O arquivo `.nojekyll` já evita processamento Jekyll.

## Pendências comerciais (placeholders a preencher)

- `_data/site.json` → `contact.email`, redes sociais e `site_url`;
- `_data/product.json` → preços definitivos e URLs de compra/amostra;
- `_data/testimonials.json` → depoimentos REAIS (mantenha `enabled: false` até lá);
- Termos e Privacidade estão marcados como **[RASCUNHO]** nos i18n — revisar
  juridicamente antes do lançamento;
- Gerar a amostra grátis por idioma (há 10 atividades listadas em
  `dados/amostra_gratis_ids.csv` na raiz do projeto).

## Créditos e licenças

- Previews: páginas reais das atividades do próprio Educa4Good.
- Logo, ícones e ilustrações: SVGs originais criados para o projeto.
- Fontes: [Nunito](https://fonts.google.com/specimen/Nunito) e
  [Inter](https://fonts.google.com/specimen/Inter) via Google Fonts (licença OFL).
- Nenhum código ou asset foi reutilizado do tema de referência
  (business-jekyll-theme), que não possui licença explícita — apenas a
  filosofia arquitetural (site empresarial multipágina) serviu de inspiração.
