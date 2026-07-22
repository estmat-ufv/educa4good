# Gerador "Ligar os Pontos"

Utilitário web estático publicado dentro do site Educa4Good em:

`Pagina/pt/ligar-os-pontos.html`

## Arquivos

- `Pagina/assets/js/connect-the-dots.js`: upload local, processamento da imagem em canvas, seleção dos pontos, validação das conexões omitidas, renderização em SVG, impressão e exportação PNG.
- `Pagina/assets/css/connect-the-dots.css`: layout responsivo do gerador e regras `@media print` para A4 retrato/paisagem.
- `Pagina/build.py`: gera a página portuguesa extra, adiciona o card em `pt/jogos.html` e inclui a URL no sitemap.
- `Pagina/_data/i18n/pt.json`: texto do card "Ligar os Pontos" na página de jogos.
- `Pagina/pt/ligar-os-pontos.html`, `Pagina/pt/jogos.html` e `Pagina/sitemap.xml`: saídas geradas por `python build.py`.

## Funcionamento

O processamento acontece integralmente no navegador. A imagem é carregada com `FileReader`, desenhada em um canvas reduzido, convertida para escala de cinza e separada do fundo com um limiar automático. Em seguida, o script fecha pequenas falhas nas linhas e percorre as bordas dos pixels de tinta para criar contornos vetoriais fechados.

Os pontos são distribuídos por distância ao longo desses caminhos SVG, sempre na ordem do próprio contorno. Quando há uma silhueta dominante, detalhes internos contidos nela são descartados; isso evita que a numeração salte entre rosto, corpo e outros traços internos.

Quando há múltiplos contornos externos relevantes, o gerador usa os maiores primeiro, distribui pontos proporcionalmente ao comprimento de cada caminho e quebra automaticamente a linha entre um contorno e outro para evitar conexões atravessando a folha.

As conexões omitidas são informadas como pares consecutivos, por exemplo:

`5-6, 12-13`

Essas linhas deixam de aparecer, mas os pontos e números continuam na atividade.

## Limitações

A conversão não promete fidelidade perfeita para toda fotografia. Os melhores resultados vêm de desenhos, ícones, silhuetas e figuras com contornos nítidos, fundo simples e alto contraste. Fotos muito detalhadas, sombras fortes, fundos texturizados ou imagens com muitos elementos pequenos podem gerar pontos ruidosos ou uma sequência menos natural.

## Como Usar

1. Abra `pt/ligar-os-pontos.html` no site.
2. Envie uma imagem em PNG, JPG, WebP ou outro formato aceito pelo navegador.
3. Ajuste quantidade de pontos, numeração inicial, tamanhos, cor/espessura dos traços, orientação A4, título e identificação.
4. Opcionalmente, informe pares de conexões a esconder.
5. Clique em **Gerar/Atualizar atividade**.
6. Use **Imprimir atividade** para gerar a folha A4 ou **Baixar PNG** para salvar a prévia.

## Como Testar Localmente

```powershell
cd C:\Users\Fernando\Documents\GitHub\Educa4Good\Pagina
python build.py
python -m http.server 8931
```

Depois acesse:

`http://localhost:8931/pt/ligar-os-pontos.html`

Teste também o link em:

`http://localhost:8931/pt/jogos.html`

## Idiomas

A primeira versão foi integrada em português porque a interface tem textos de orientação, validações e documentação pedagógica. As páginas em inglês e espanhol permanecem com o card "em breve"; uma tradução completa pode ser adicionada depois sem alterar o motor JavaScript.
