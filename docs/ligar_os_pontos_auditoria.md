# Auditoria da implementação legada — "Ligar os Pontos"

Data: 2026-07-25 · Branch: `codex/rebuild-connect-the-dots`

Documento da **Etapa 1** da reconstrução. Registra o que existia antes da
substituição, onde estava, e por que o resultado era pedagogicamente
inconfiável.

## 1. Arquivos localizados

Nada foi presumido: os caminhos abaixo foram confirmados no repositório.

| Papel | Caminho real |
| --- | --- |
| Página pública (gerada) | `Pagina/pt/ligar-os-pontos.html` |
| **Fonte** da página | `Pagina/build.py`, função `build_connect_dots_pt()` (linhas 744–928) |
| JavaScript do gerador | `Pagina/assets/js/connect-the-dots.js` (1096 linhas, IIFE, ES5) |
| CSS do gerador | `Pagina/assets/css/connect-the-dots.css` (614 linhas, inclui `@media print`) |
| Design system | `Pagina/assets/css/site.css` (tokens em custom properties) |
| Script global | `Pagina/assets/js/site.js` (menu, `reveal`, idioma) |
| Texto do card em "Jogos" | `Pagina/_data/i18n/pt.json` |
| Publicação | `Pagina/.github/workflows/deploy-pages.yml` |
| Sitemap | `Pagina/build.py`, `build_sitemap()` (lista `pt/ligar-os-pontos.html`) |
| Documentação anterior | `docs/ligar_os_pontos.md` |

### Regra de ouro do site

`Pagina/README.md` é explícito: **os `.html` em `pt/`, `en/` e `es/` são gerados
e não devem ser editados à mão.** A fonte é `build.py` + `_data/*.json`.
Portanto toda alteração de marcação da página foi feita em `build.py` e a
página foi regenerada com `python build.py`.

### Publicação

O workflow roda `python build.py` a cada push em `main` e publica a raiz do
projeto (`path: "."`) como artefato do GitHub Pages. Consequências para esta
reconstrução:

- não há etapa de bundling; o que está em `assets/` é servido como está;
- não existe `package.json` nem pipeline npm no site — qualquer dependência de
  build quebraria a publicação;
- `.nojekyll` existe, então diretórios e arquivos não sofrem filtragem do Jekyll;
- ES Modules servidos como `.js` estático funcionam sem configuração adicional.

## 2. Como a implementação legada funcionava

Fluxo único, sem modos, sem confirmação:

1. `handleFile()` → `FileReader.readAsDataURL` → `loadImage()`.
2. `prepareCanvas()` desenha a imagem reduzida para no máximo **560 px**
   (`PROCESS_MAX`).
3. `grayscale()` converte para tons de cinza.
4. `otsuThreshold()` + `borderAverage()` decidem sozinhos o limiar **e** a
   polaridade (claro/escuro).
5. `closeInkMask()` aplica um fechamento morfológico fixo.
6. `traceBoundaryLoops()` percorre as bordas dos pixels de tinta e devolve
   laços fechados.
7. `extractVectorContours()` filtra por `MIN_VECTOR_AREA_RATIO = 0.00035` e
   ordena por área; `contours[0]` vira o contorno "principal" **sem qualquer
   confirmação do usuário**.
8. `allocateCounts()` reparte os pontos entre até 8 contornos
   proporcionalmente ao comprimento.
9. `resampleClosedPath()` reamostra por comprimento de arco.
10. `labelPositions()` empurra rótulos colididos e trunca com `clamp()`.
11. `buildSvg()` monta a folha; `printActivity()` e `downloadPng()` exportam.

## 3. Defeitos confirmados (causa raiz)

| # | Sintoma relatado | Causa no código |
| --- | --- | --- |
| D1 | Escolhe o contorno errado | `extractVectorContours()` ordena por área e assume `contours[0]`. Heurística única, sem alternativa e sem interface de escolha. |
| D2 | Encontra só parte da figura | `MIN_VECTOR_AREA_RATIO` e o corte `length > min(w,h)*0.12` descartam partes legítimas de figuras finas ou fragmentadas. |
| D3 | Pontos em manchas, sombras e detalhes internos | O limiar é decidido por `otsuThreshold()` sem controle do usuário: sombras e texturas viram "tinta". Não há abertura morfológica para remover ruído. |
| D4 | Liga partes que deveriam ficar separadas | `closeInkMask()` funde regiões próximas antes do traçado; e `generatePointsFromImage()` concatena os contornos numa lista única de pontos — a quebra é só visual (`autoBreaks`), a numeração continua atravessando. |
| D5 | Pontos irregulares | A reamostragem é feita sobre a polilinha de **pixels** já suavizada por `smoothClosedPath(path, 2)`; em 560 px o passo de quantização é grosseiro. |
| D6 | Números sobrepostos | `labelPositions()` faz 4 passes de repulsão par-a-par e **clampa** as posições na borda da folha. Quando não há espaço, os rótulos simplesmente empilham na borda — sem erro, sem aviso. |
| D7 | Atividade inválida gerada em silêncio | Não existe validador. `dots-print` e `dots-download` são habilitados sempre que `generateActivity()` não lança exceção. |
| D8 | Moldura da imagem vira a figura | Nenhuma rejeição de contorno coincidente com a borda: uma digitalização com moldura produz um retângulo como "figura". |
| D9 | SVG não é aceito | O `accept` inclui `image/*`, mas um SVG entra pelo caminho raster: é rasterizado a 560 px e perde a geometria exata. |
| D10 | Sem correção manual | Não há editor. Se a detecção falha, não há saída. |

### Observações estruturais

- **Arquivo único de 1096 linhas** com estado global (`var state`) e DOM
  global (`var dom`) — impossível de testar em unidade.
- **Sem testes**: o repositório não tinha `tests/` nem infraestrutura JS.
- **Sem Web Worker**: todo o processamento roda na thread principal.
- Rótulos e pontos não são editáveis após a geração.

## 4. Decisões da reconstrução

| Decisão | Motivo |
| --- | --- |
| Três modos explícitos (SVG exato / raster assistido / traçado manual) | Cada classe de entrada tem um caminho correto; nenhum deles adivinha. |
| SVG como formato interno | Permite `getTotalLength()`/`getPointAtLength()` e exportação sem rasterização. |
| ES Modules em `Pagina/assets/js/connect-dots/` | Sem bundler, servido direto pelo GitHub Pages; módulos testáveis em Node. |
| Paper.js **vendorizado** (208 KB) | Pequeno o bastante para o repositório; garante o editor manual mesmo offline. |
| OpenCV.js por **CDN com versão fixa** + fallback local | 11,4 MB é grande demais para versionar; o loader tenta primeiro o vendor local, depois duas CDNs pinadas. |
| Lógica pura separada da DOM | `contour-classifier`, `label-layout`, `quality-validator`, `path-sampler` e `path-geometry` são funções puras, cobertas por testes Node. |
| Exportação bloqueada por validador | Substitui D7: erro crítico desabilita "Exportar"; aviso exige confirmação. |

## 5. Compatibilidade preservada

- URL pública **inalterada**: `/pt/ligar-os-pontos.html`.
- Cabeçalho, menu, rodapé, `site.css`, `site.js`, metadados e canonical
  reaproveitados de `build.py` (`header()`, `footer()`).
- `build_sitemap()` continua listando a mesma URL.
- Demais páginas, jogos e traduções não foram tocados.
