# Gerador "Ligar os Pontos"

Utilitário web estático publicado dentro do site Educa4Good em:

`Pagina/pt/ligar-os-pontos.html`
(https://estmat-ufv.github.io/educa4good/pt/ligar-os-pontos.html)

A implementação foi **reconstruída** em julho de 2026. Este arquivo virou um
índice; o conteúdo está nos três documentos abaixo.

| Documento | Para quem |
| --- | --- |
| [Manual de uso](ligar_os_pontos_manual.md) | quem vai gerar as folhas |
| [Arquitetura](ligar_os_pontos_arquitetura.md) | quem vai mexer no código |
| [Auditoria da versão anterior](ligar_os_pontos_auditoria.md) | histórico: o que existia e por que mudou |

## Em uma linha

Três modos independentes — **SVG exato**, **detecção assistida com OpenCV.js** e
**traçado manual com Paper.js** — com validação obrigatória antes de exportar.
Nenhuma imagem sai do navegador, e nenhum contorno duvidoso vira atividade sem
confirmação do usuário.

## Arquivos

- `Pagina/assets/js/connect-dots/` — a aplicação, em ES Modules.
- `Pagina/assets/css/connect-dots.css` — layout e regras `@media print` para A4.
- `Pagina/assets/vendor/` — Paper.js 0.12.18 versionado; veja o `README.md` de lá.
- `Pagina/build.py` — `build_connect_dots_pt()` gera a página; o card em
  `pt/jogos.html` e a URL no sitemap continuam como antes.
- `Pagina/_data/i18n/pt.json` — texto do card "Ligar os Pontos" na página de jogos.
- `tests/connect-dots/` e `tests/connect-dots-fixtures/` — testes e fixtures.
- `examples/connect-dots/` — auditoria visual com folhas geradas.

**Nunca edite `Pagina/pt/ligar-os-pontos.html` à mão:** ele é gerado. Altere
`build.py` e rode `python build.py`.

## Como testar localmente

```powershell
cd C:\Users\Fernando\Documents\GitHub\Educa4Good\Pagina
python build.py
python -m http.server 8931
```

Depois acesse `http://localhost:8931/pt/ligar-os-pontos.html` e confira também
o link em `http://localhost:8931/pt/jogos.html`.

Testes automatizados:

```powershell
cd C:\Users\Fernando\Documents\GitHub\Educa4Good
node --test "tests/connect-dots/*.test.mjs"
python -m http.server 8932
```

Com o servidor da raiz no ar, abra
`http://localhost:8932/tests/connect-dots/browser-tests.html` para os testes que
exigem DOM, canvas, OpenCV.js e Paper.js.

## Idiomas

A interface está em português, porque tem textos de orientação, mensagens de
validação e vocabulário pedagógico. As páginas em inglês e espanhol continuam
com o card "em breve"; uma tradução pode ser acrescentada depois sem mexer no
motor JavaScript — as mensagens estão concentradas nos módulos de interface,
validação e classificação.
