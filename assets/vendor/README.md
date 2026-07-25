# Dependências de terceiros (vendor)

Bibliotecas usadas pelo gerador "Ligar os Pontos"
(`assets/js/connect-dots/`). **Versões fixas, nunca `latest`.**

| Biblioteca | Versão | Onde | Licença |
| --- | --- | --- | --- |
| Paper.js (`paper-core`) | 0.12.18 | `paper/paper-core-0.12.18.min.js` (local, 204 KB) | MIT |
| OpenCV.js | 4.11.0 | CDN pinada; vendor local **opcional** em `opencv/opencv-4.11.0.js` | Apache-2.0 |

## Paper.js

Versionada no repositório porque é pequena e garante que o editor manual
funcione mesmo offline. Origem:

```
https://cdn.jsdelivr.net/npm/paper@0.12.18/dist/paper-core.min.js
```

Para atualizar: baixe a nova versão com o nome
`paper-core-<versão>.min.js`, atualize `PAPER_VERSION` em
`assets/js/connect-dots/path-editor.js` e teste o modo manual.

## OpenCV.js

**Não** é versionada: o arquivo tem 11,4 MB, o que inflaria o repositório e
cada clone. O carregamento usa, nesta ordem:

1. `opencv/opencv-4.11.0.js` (local, se existir);
2. `https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.11.0-release.1/dist/opencv.js`;
3. `https://unpkg.com/@techstark/opencv-js@4.11.0-release.1/dist/opencv.js`.

Para deixar o modo raster funcionando **offline**, baixe a cópia local:

```bash
curl -L -o Pagina/assets/vendor/opencv/opencv-4.11.0.js \
  https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.11.0-release.1/dist/opencv.js
```

O `.gitignore` deste diretório mantém esse arquivo fora do controle de
versão de propósito. Para trocar de versão, ajuste `OPENCV_VERSION` e
`OPENCV_PACKAGE` em `assets/js/connect-dots/opencv-loader.js`.
