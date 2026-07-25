# Ligar os Pontos — arquitetura

Documentação técnica do gerador publicado em
`https://estmat-ufv.github.io/educa4good/pt/ligar-os-pontos.html`.

Para o passo a passo de uso, veja [o manual](ligar_os_pontos_manual.md).
Para o que existia antes e por que foi substituído, veja
[a auditoria](ligar_os_pontos_auditoria.md).

## 1. Princípio

Tudo acontece no navegador. Nenhuma imagem é enviada, armazenada ou processada
fora do aparelho do usuário: não há `fetch` de upload, não há API externa, não
há servidor. As únicas requisições de rede são o download das bibliotecas
(OpenCV.js por CDN pinada) e as fontes do site.

O segundo princípio é o que motivou a reconstrução: **nenhuma imagem ambígua
vira atividade sem confirmação visual.** O programa pode sugerir; quem decide é
quem vai imprimir.

## 2. Onde ficam os arquivos

| Papel | Caminho |
| --- | --- |
| Página pública (gerada) | `Pagina/pt/ligar-os-pontos.html` |
| **Fonte** da página | `Pagina/build.py`, função `build_connect_dots_pt()` |
| Aplicação | `Pagina/assets/js/connect-dots/` |
| Estilos | `Pagina/assets/css/connect-dots.css` |
| Paper.js versionado | `Pagina/assets/vendor/paper/paper-core-0.12.18.min.js` |
| Vendor (versões, licenças) | `Pagina/assets/vendor/README.md` |
| Testes em Node | `tests/connect-dots/*.test.mjs` |
| Testes de navegador | `tests/connect-dots/browser-tests.html` |
| Fixtures | `tests/connect-dots-fixtures/` |
| Auditoria visual | `examples/connect-dots/` |

> **Regra de ouro do site:** os `.html` em `pt/`, `en/` e `es/` são **gerados**.
> Nunca edite a página diretamente — altere `build.py` e rode `python build.py`.

## 3. Módulos

ES Modules servidos como arquivos estáticos, sem bundler. `package.json` com
`{"type":"module"}` dentro de `connect-dots/` existe só para o runner de testes
do Node; o navegador o ignora.

```
Pagina/assets/js/connect-dots/
├── app.js                 ponto de entrada (<script type="module">)
├── ui-controller.js       liga controles ↔ estado ↔ pipeline
├── state.js               estado central, histórico, recursos não serializáveis
├── constants.js           A4 em mm, limites, padrões para crianças
├── util/geometry.js       vetores, matrizes, área, centroide, colisão
│
├── image-loader.js        leitura local, orientação EXIF, alfa, cópia reduzida
├── svg-sanitizer.js       lista de permissões estrita (modo 1)
├── svg-importer.js        formas → `d` com transforms acumuladas (modo 1)
├── path-geometry.js       parser de `d`, arcos→cúbicas, matriz, achatamento
├── path-measure.js        medidor nativo do SVG ou de polilinha
├── path-normalizer.js     separa subcaminhos, limpa, mede, encaixa
├── path-sampler.js        amostragem uniforme e adaptativa
│
├── opencv-loader.js       OpenCV 4.11.0 pinado, vendor → jsDelivr → unpkg
├── raster-worker.js       Web Worker clássico (modo 2)
├── contour-extractor.js   binarização + findContours (script clássico)
├── raster-pipeline.js     fachada Worker/thread principal
├── contour-classifier.js  nota composta dos candidatos (puro)
├── contour-selector.js    seleção visual dos candidatos
│
├── path-editor.js         editor Paper.js (modo 3 e correção dos modos 1 e 2)
├── label-layout.js        posicionamento dos números (puro)
├── quality-validator.js   laudo que libera ou bloqueia a exportação (puro)
├── worksheet-renderer.js  plano da folha + SVG final (puro)
├── svg-exporter.js        arquivo SVG autônomo
├── png-exporter.js        PNG a partir do SVG final
└── print-manager.js       montagem da folha e regra @page
```

### Por que dois arquivos não são ES Modules

`contour-extractor.js` e `raster-worker.js` são **scripts clássicos** de
propósito: `importScripts()` não coexiste com ES Modules dentro de um Worker, e
o `opencv.js` distribuído é UMD. O extrator publica sua API em
`self.CdContourExtractor`, o que permite carregá-lo tanto no Worker quanto por
tag `<script>` no caminho alternativo. Toda a lógica que vale a pena testar
ficou fora desses dois arquivos.

## 4. Dependências

| Biblioteca | Versão fixa | Entrega | Licença |
| --- | --- | --- | --- |
| Paper.js (`paper-core`) | **0.12.18** | vendor local (204 KB) → jsDelivr | MIT |
| OpenCV.js | **4.11.0** (`@techstark/opencv-js@4.11.0-release.1`) | vendor local *opcional* → jsDelivr → unpkg | Apache-2.0 |

Nenhuma URL com `latest`. Nenhum framework de interface.

O OpenCV.js tem **11,4 MB** e por isso não é versionado: inflaria o repositório
e cada clone. O carregador tenta primeiro `assets/vendor/opencv/opencv-4.11.0.js`
(ausente por padrão, ignorado pelo `.gitignore` local) e cai para as duas CDNs
pinadas. Para trabalhar offline, baixe a cópia local conforme
`Pagina/assets/vendor/README.md`.

### Como atualizar as bibliotecas

**Paper.js**

1. baixe `paper-core.min.js` da versão desejada;
2. salve como `Pagina/assets/vendor/paper/paper-core-<versão>.min.js`;
3. atualize `PAPER_VERSION` em `path-editor.js`;
4. abra `tests/connect-dots/browser-tests.html` e confira o teste "Paper.js
   carrega da cópia local versionada";
5. teste o modo manual à mão: desenhar, fechar, suavizar, inverter, dividir.

**OpenCV.js**

1. atualize `OPENCV_VERSION` e `OPENCV_PACKAGE` em `opencv-loader.js`;
2. confira o formato do global `cv` na versão nova — o build 4.11 publica uma
   **Promise**, versões anteriores publicam o namespace com
   `onRuntimeInitialized`. `resolveCv()` já aceita as duas formas;
3. rode a página de testes de navegador: os casos 8 a 12 exercitam extração,
   moldura, partes separadas e ruído;
4. confirme no console que o modo continua `"worker"`.

## 5. Modelo de dados

Estado central único, em `state.js`. Só muda por `store.update()`; nada de
variáveis globais espalhadas. Recursos não clonáveis (imagem decodificada,
canvas, SVG sanitizado, cena do Paper.js) ficam em `assets`, fora do histórico.

```js
{
  source:   { type: "svg"|"raster", filename, width, height, bytes },
  mode:     "svg" | "raster" | "manual",
  step:     "upload"|"mode"|"select"|"edit"|"points"|"review"|"export",

  paths: [{
    id, label, selected, closed,
    direction: "forward"|"reverse",
    order, breakAfter,
    svgPathData,          // geometria exata, transforms já aplicadas
    startOffset,          // fração 0..1 do comprimento (caminho fechado)
    source: "svg"|"raster"|"manual",
    frameLike, nearFrame, // marcações do classificador
    metrics: { length, bounds, centroid, vertexCount }
  }],

  hiddenPairs:  [[12, 13]],   // ligações que não devem aparecer
  pathSamples:  { [pathId]: [0.0, 0.13, ...] },  // pontos editados à mão
  pointOffsets: { [pointId]: { dx, dy } },       // ponto arrastado, em mm
  labelOffsets: { [pointId]: { dx, dy } },       // número arrastado, em mm

  settings: {
    pointCount, samplingMode: "uniform"|"adaptive",
    pointRadius, labelFontSize, pointColor, labelColor,
    guideColor, guideWidth, showGuideLines,
    showOriginalImage, originalOpacity,
    pageSize: "A4", orientation, margin, title,
    showFields, fieldName, fieldDate, fieldClass, fieldTeacher,
    showInspiration, inspirationSize, inspirationPosition,
    numbering: "continuous"|"perPath", startNumber
  },

  raster: {
    thresholdMode: "otsu"|"manual"|"adaptive",
    threshold, blockSize, constant, invert,
    open, close, denoise, minAreaRatio,
    candidates: [...], selectedCandidates: [...],
    analysisSize, scaleToSource
  },

  validation: { valid, errors: [], warnings: [], acknowledged: [] }
}
```

Unidade da folha: **milímetro**. O SVG final usa
`width="210mm" viewBox="0 0 210 297"`, então 1 unidade = 1 mm, a impressão sai
na escala certa e o PNG pode nascer em qualquer DPI do mesmo arquivo.

## 6. Os três modos

### Modo 1 — SVG exato

```
arquivo → sanitizeSvg → importSvg → normalizePaths → seleção → samplePaths → folha
```

1. **Sanitização** (seção 7).
2. **Importação**: `path`, `circle`, `ellipse`, `rect`, `line`, `polygon` e
   `polyline`, cada um convertido em `d` e multiplicado pela matriz acumulada
   do grupo. Arcos e quadráticas viram cúbicas antes da transformação, para que
   qualquer matriz afim se aplique exatamente aos pontos de controle.
3. **Fundo do arquivo**: um retângulo simples que cobre o viewBox inteiro é
   marcado e vem **desmarcado** — era exatamente a forma que o gerador antigo
   escolhia por ser "a maior".
4. **Amostragem** por comprimento de arco, com `getTotalLength()` e
   `getPointAtLength()` nativos. A distribuição não depende da quantidade de nós
   do SVG original.

Determinístico: mesma entrada e mesmas opções geram exatamente a mesma folha.
Há teste para isso.

### Modo 2 — Raster assistido

```
arquivo → loadRaster → Worker(OpenCV) → classifyContours → seleção do usuário → caminhos
```

1. Decodificação com `createImageBitmap(..., {imageOrientation:"from-image"})`,
   respeitando orientação EXIF e transparência.
2. Cópia de trabalho com no máximo **1800 px** no maior lado; o original fica
   guardado e `scaleToSource` devolve os caminhos à escala original.
3. Binarização com **Otsu**, **manual** ou **adaptativo**, mais inversão,
   abertura, fechamento e remoção de ruído. Em imagem com transparência o canal
   alfa é usado direto: é o sinal mais limpo para uma silhueta.
4. `findContours` com `RETR_CCOMP`, o que dá a hierarquia pai/filho.
5. **Classificação** (seção 9). Todos os candidatos aparecem sobre a imagem com
   cor e número próprios.
6. **Confirmação obrigatória.** Nada é selecionado sozinho; o botão "Confirmar
   contornos" fica desabilitado até haver marcação.

O processamento roda em Web Worker. Se o Worker falhar (navegador antigo,
política de segurança, `file://`), o pipeline cai para a thread principal de
forma assíncrona, cedendo o controle antes e depois do trabalho pesado.

### Modo 3 — Traçado manual

Editor sobre Paper.js, disponível sempre — inclusive para corrigir o resultado
dos modos 1 e 2. Ferramentas: desenhar, mover, inserir ponto, remover ponto,
definir início, selecionar. Comandos: suavizar, inverter sentido, abrir/fechar,
unir extremidades, dividir, apagar, reordenar, limpar.

Botões explícitos em vez de modificadores de teclado, para funcionar em tablet.

## 7. Sanitização do SVG

O arquivo enviado é conteúdo **não confiável**. A estratégia é a mais restritiva
possível: o documento original é lido com `DOMParser` (que não executa scripts)
e depois **descartado**. Nada dele entra na página — construímos uma árvore
nova com `createElementNS`, copiando apenas nomes e valores que passam pela
lista de permissões. Em nenhum momento usamos `innerHTML`.

**Elementos aceitos:** `svg`, `g`, `path`, `circle`, `ellipse`, `rect`, `line`,
`polygon`, `polyline`, `title`, `desc`.

**Recusados sempre:** `script`, `foreignObject`, `image`, `use`, `a`, `style`,
`animate*`, `filter`, `mask`, `clipPath`, `pattern`, `marker`, gradientes,
`defs`, `text`, `symbol`, `switch`, `iframe`, `object`, `embed`.

**Atributos:** apenas geometria e aparência. `on*`, `href` e `xlink:href` saem
sem discussão. Qualquer valor contendo `url(`, `javascript:`, `data:`,
`expression(`, `<` ou `>` é recusado inteiro. O atributo `style` é filtrado
declaração por declaração.

**Limitação conhecida:** `<use>` e `<defs>` são descartados, então um SVG que
desenha por referência perde conteúdo — o usuário é avisado no relatório de
importação. `<svg>` aninhado também é recusado, porque criaria um novo viewport
e distorceria a geometria.

## 8. Normalização e amostragem

**Normalização** (`path-normalizer.js`): aplica transforms, **separa
subcaminhos** (um `d` com vários `M` vira vários caminhos independentes),
remove pontos duplicados e segmentos curtos demais, identifica aberto/fechado e
calcula comprimento, caixa e centroide.

> O fim de um caminho **nunca** é ligado ao início de outro. Os segmentos-guia
> só existem dentro do mesmo caminho, e o validador tem uma checagem defensiva
> (`cross-path-segment`) para o caso de alguém quebrar essa regra no futuro.

A tolerância de achatamento é **proporcional à diagonal da geometria**. Uma
tolerância fixa erraria nos dois extremos: num `viewBox="0 0 1 1"` achataria
tudo em duas retas; numa figura de milhares de unidades gastaria pontos à toa.

**Amostragem** (`path-sampler.js`):

- **uniforme** (padrão): passo igual em comprimento de arco. Em caminho fechado
  o primeiro ponto não é duplicado no fim; em caminho aberto as duas
  extremidades recebem ponto.
- **adaptativa**: mais pontos onde a curvatura é alta, menos nos trechos quase
  retos, mantendo exatamente a quantidade pedida. O sinal é a curvatura local
  normalizada pelo comprimento total — medida invariante à escala. Medir só o
  ângulo entre tangentes vizinhas não funciona: numa curva suave amostrada de
  perto o ângulo tende a zero e a adaptação não acontece.

Entre vários caminhos, os pontos são repartidos proporcionalmente ao
comprimento, com mínimo por caminho. Quando o total pedido não cabe, os
caminhos que ficam sem ponto viram **erro** no validador — não um silêncio.

## 9. Classificação dos contornos

O gerador antigo pegava o contorno de maior área. Era a causa principal dos
resultados errados: moldura de digitalização, sombra de fundo e mancha grande
venciam a figura.

Cada candidato recebe uma nota a partir de sinais independentes:

| Sinal | Peso | O que mede |
| --- | --- | --- |
| área | 0,20 | pico em 25% da imagem |
| perímetro | 0,18 | relevância em relação ao quadro |
| centralidade | 0,12 | figura desenhada tende a ficar centralizada |
| distância da borda | 0,18 | longe da borda é melhor |
| proporção | 0,10 | nem fio de cabelo, nem faixa |
| preenchimento | 0,08 | silhueta cheia é mais confiável que casca fina |
| suavidade | 0,09 | nem círculo puro, nem serrilha de ruído |
| buracos | 0,05 | um ou dois são normais |

Depois vêm penalidades multiplicativas: moldura (`×0,05`), área ínfima
(`×0,25`), contorno serrilhado (`×0,5`), forma muito alongada (`×0,6`), detalhe
interno (`×0,75`) e borda dupla (`×0,4`).

**Moldura.** `bboxRatio > 0,9` e contato com a borda acima de 0,35 marcam o
candidato como moldura: nota quase zerada, aviso forte na lista e **erro** no
validador se o usuário insistir. A margem de contato é proporcional ao tamanho
da imagem (1,2%), não fixa em 1 ou 2 px — moldura de digitalização quase nunca
cai exatamente na coluna zero.

**Borda dupla.** Num desenho de contorno, o `findContours` devolve a borda
externa **e** a interna do mesmo traço. A interna é filha e tem quase a mesma
área (`> 0,7`); marcá-la evita que o usuário escolha as duas e produza pares de
pontos colados pela folha inteira.

`summarizeCandidates()` é honesto sobre a confiança: quando o líder é moldura,
quando a nota é baixa ou quando os dois primeiros empatam, a interface diz que
não dá para confiar e sugere o modo manual.

## 10. Posicionamento dos números

Para cada ponto: tangente local → normal → lado externo em relação ao centroide
do caminho. Depois testa candidatos em ordem (4 distâncias × 8 ângulos) até
achar um livre de colisão com outros rótulos, com os pontos, com o traçado e com
os limites da página. Se nenhum candidato serve, o ponto é devolvido **marcado**
— quem decide é o validador, não este módulo.

O encaixe da figura reserva uma faixa proporcional ao tamanho do número: se o
traçado encostar na área útil, os rótulos das extremidades não têm para onde ir
e acabam por dentro da figura. "Ocupar a maior área possível" vale para pontos
**mais** números.

Qualquer número pode ser arrastado na prévia; a posição manual passa a ter
prioridade absoluta e não é reavaliada.

## 11. Validação

`quality-validator.js` roda antes de qualquer exportação. **Erro crítico
bloqueia; aviso exige confirmação explícita.**

| Código | Tipo | Verifica |
| --- | --- | --- |
| `no-source` | erro | imagem carregada |
| `invalid-scale` | erro | escala calculada válida |
| `no-path` | erro | ao menos um caminho selecionado |
| `inconsistent-order` | erro | ordem sem duplicidade |
| `empty-path` | erro | caminho vazio |
| `path-too-short` | erro | comprimento mínimo |
| `path-outside` | erro | dentro da área útil |
| `frame-contour` | erro | contorno coincidente com a borda |
| `too-few-points` | erro | quantidade mínima de pontos |
| `point-outside` | erro | pontos dentro da folha |
| `points-too-close` | erro/aviso | distância mínima entre consecutivos |
| `points-overlapping` | erro/aviso | pontos de caminhos diferentes no mesmo lugar |
| `cross-path-segment` | erro | ligação entre caminhos diferentes |
| `label-outside` | erro | números dentro da folha |
| `label-overlap` | erro | sobreposição grave de números |
| `starved-paths` | erro/aviso | caminhos selecionados sem nenhum ponto |
| `near-frame` | aviso | caminho encostando na borda |
| `fragmented` | aviso | caminho muito fragmentado |
| `long-jump` | aviso | salto muito maior que a mediana do próprio caminho |
| `label-tight` | aviso | números apertados |
| `low-contrast` | aviso | cor clara demais para imprimir |

Duas mensagens são fixas e literais:

> "Esta figura não comporta a quantidade solicitada com boa legibilidade.
> Reduza o número de pontos ou diminua o tamanho dos rótulos."

> "Não foi possível confirmar um caminho confiável. Selecione outro contorno ou
> utilize o modo manual."

## 12. Exportação e impressão

**SVG** é o formato principal: arquivo autônomo, com declaração XML, sem nada
apontando para fora, sem atributos de interação.

**PNG** nasce do **SVG final** — nunca do canvas de edição. As dimensões em mm
são trocadas por pixels (o `viewBox` não muda) e a rasterização acontece a 150
ou 300 DPI. A4 retrato dá 1240×1754 e 2480×3508 px.

**Impressão** monta o mesmo SVG num contêiner dedicado, via `DOMParser` +
`importNode` (sem `innerHTML`), e ajusta a regra `@page` conforme a orientação.
O CSS de impressão esconde cabeçalho, rodapé e toda a interface, deixando uma
folha por página. O SVG não é rasterizado no caminho da impressora.

## 13. Desempenho

- imagens acima de 1800 px são reduzidas para análise; o original fica guardado
  e os caminhos voltam à escala certa;
- OpenCV roda em Web Worker; a interface nunca congela;
- arquivos acima de 4 MB geram aviso; acima de 12 MB são recusados;
- os ajustes de binarização são reprocessados com atraso de 260 ms, para não
  disparar uma extração por movimento de controle deslizante.

## 14. Compatibilidade

Testado em Chrome/Edge (Chromium 141). As APIs usadas — ES Modules, Web Worker,
`createImageBitmap`, `structuredClone`, Pointer Events, `canvas.toBlob`,
`getPointAtLength` — estão disponíveis nas versões atuais de Chrome, Edge,
Firefox e Safari.

Reservas onde a API pode faltar: `structuredClone` cai para JSON, o Worker cai
para a thread principal, `createImageBitmap` cai para `<img>`, o medidor nativo
cai para polilinha e a impressão não depende só de `requestAnimationFrame`
(suspenso em aba oculta).

## 15. Limitações conhecidas

1. **`<use>`, `<defs>` e `<svg>` aninhado** são descartados na sanitização. Um
   SVG que desenha por referência perde conteúdo; o usuário é avisado.
2. **`<text>` não vira atividade.** Converta texto em contorno antes de exportar.
3. **OpenCV.js não é versionado** (11,4 MB). Sem rede e sem a cópia local, o
   modo raster não abre — os modos SVG e manual continuam funcionando.
4. **Fotografias** raramente dão bom resultado na detecção automática. O modo
   manual é a saída recomendada, e a interface diz isso.
5. **Nota do classificador é heurística.** Ela ordena e destaca; não decide.
6. **Fontes na exportação.** O SVG declara a pilha `Nunito, Segoe UI,
   system-ui, sans-serif`. Aberto em outro programa sem Nunito, cai para a
   fonte de sistema — o traçado e as medidas não mudam.
7. **Edição fina em telemóvel** é desconfortável. Visualizar e configurar
   funcionam; a interface recomenda tela maior para o editor.
8. **Ajustes manuais de ponto** são descartados quando a geometria do caminho
   muda (sentido, início, abrir/fechar) ou quando o total de pontos muda.

## 16. Testes

```bash
# lógica pura — 78 testes
node --test "tests/connect-dots/*.test.mjs"

# DOM, canvas, OpenCV e Paper.js — 28 testes
python -m http.server 8932
# abra http://localhost:8932/tests/connect-dots/browser-tests.html
```

Sem dependências npm: o runner é o do próprio Node e a página de navegador é um
arquivo estático. Nada disso é publicado — `tests/` fica fora de `Pagina/`.

As fixtures raster são geradas por
`node tests/connect-dots-fixtures/make-raster-fixtures.mjs`, com um codificador
PNG próprio sobre `node:zlib`. Todas as figuras são sintéticas e próprias.
