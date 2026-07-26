# Ligar os Pontos — manual de uso

Como transformar uma figura numa folha A4 de ligar os pontos, pronta para
imprimir.

**Endereço:** https://estmat-ufv.github.io/educa4good/pt/ligar-os-pontos.html

Tudo acontece no seu navegador. A imagem não é enviada para lugar nenhum, não
fica guardada em servidor e não passa por nenhum serviço externo.

---

## Antes de começar: qual modo usar?

| Você tem | Use | Por quê |
| --- | --- | --- |
| Um arquivo **SVG** (vetor) | **SVG exato** | Usa a geometria do arquivo. É o melhor resultado possível e sempre igual. |
| Um **PNG, JPG ou WebP** de desenho, ícone ou silhueta | **Detecção assistida** | O programa acha os contornos e **você escolhe** qual é a figura. |
| Uma **fotografia**, uma imagem confusa, ou a detecção não convenceu | **Traçado manual** | Você desenha por cima. Sempre funciona. |

O programa nunca decide sozinho qual é a figura. Se ele não tiver certeza, vai
dizer isso e pedir sua confirmação — ou sugerir o modo manual.

**Melhores resultados:** desenhos com contorno nítido, fundo simples e bom
contraste. Uma silhueta preta em PNG com fundo transparente é o caso ideal.

---

## 1. Enviar a imagem

Arraste o arquivo para a área tracejada ou clique para escolher.

Aceita **SVG, PNG, JPEG/JPG e WebP**, até 12 MB. Se quiser experimentar antes
de usar a sua figura, clique em **Usar figura de exemplo**.

---

## 2. Escolher o modo

O programa já sugere o modo adequado ao arquivo. O **traçado manual** está
sempre disponível, inclusive depois, para corrigir o que os outros modos
produzirem.

---

## 3. Selecionar o contorno

### Se você enviou um SVG

Aparece a lista dos caminhos encontrados. Marque os que fazem parte da figura e
desmarque o resto.

Formas que cobrem o arquivo inteiro são reconhecidas como **fundo** e já vêm
desmarcadas — normalmente é o retângulo branco por trás do desenho.

Cada caminho tem botões próprios:

| Botão | Faz |
| --- | --- |
| ↑ ↓ | muda a ordem em que os caminhos são numerados |
| ⇄ | inverte o sentido do traçado |
| ◌ ◍ | abre ou fecha o caminho |
| ⟲ | gira o ponto inicial |
| ⌁ | marca uma interrupção depois deste caminho |

### Se você enviou uma imagem (PNG, JPG, WebP)

O programa mostra todos os contornos candidatos sobre a imagem, cada um com
**cor e número próprios**, e destaca o mais provável — mas **não escolhe por
você**.

Leia as marcações de cada candidato:

- **"Coincide com a borda da imagem (é a moldura)"** — é a borda do papel ou da
  digitalização, não a figura. Não use.
- **"Borda interna do mesmo traço"** — é o outro lado da mesma linha. Escolher
  junto com a externa cria pontos colados aos pares. Escolha só um.
- **"Área muito pequena"** — mancha, sujeira ou ruído.
- **"Encosta na borda da imagem"** — pode estar cortado.
- **"Detalhe interno de outro contorno"** — olho, janela, buraco.

Marque um ou mais candidatos e clique em **Confirmar contornos**.

**Se nenhum candidato estiver bom**, ajuste os controles:

| Controle | Quando mexer |
| --- | --- |
| **Limiar automático (Otsu)** | comece por aqui; funciona na maioria dos desenhos |
| **Limiar manual** | quando o automático pega sombra ou perde parte do traço |
| **Limiar adaptativo** | quando a iluminação é desigual (foto de papel, digitalização torta) |
| **Inverter claro/escuro** | quando a figura é clara sobre fundo escuro |
| **Abertura** | aumente para sumir com pontinhos e ruído |
| **Fechamento** | aumente para costurar falhas no traço |
| **Ruído** | suaviza antes de binarizar |
| **Área mínima** | aumente para descartar manchas pequenas |

Use o seletor **Ver → Imagem binarizada** para enxergar exatamente o que o
programa está vendo. É o ajuste mais útil: se a figura não aparece limpa ali,
nenhum contorno vai sair bom.

Ainda assim ruim? Vá para o **traçado manual**.

---

## 4. Editar o caminho

Clique em **Abrir editor**. Vale para qualquer modo — para desenhar do zero ou
para corrigir o que veio da detecção.

**Ferramentas** (escolha uma e clique no desenho):

| Ferramenta | Faz |
| --- | --- |
| **Desenhar** | cada clique cria um ponto; clique no primeiro ponto para fechar |
| **Mover** | arrasta um ponto de controle |
| **Inserir** | clique sobre o traço para inserir um ponto |
| **Remover** | clique sobre um ponto para apagá-lo |
| **Início** | clique no ponto que deve receber o número 1 |
| **Selecionar** | escolhe qual caminho os comandos vão afetar |

**Comandos:** Suavizar · Inverter sentido · Abrir/fechar · Unir · Dividir ·
Apagar caminho · Limpar tudo.

Terminou? Clique em **Aplicar traçado**.

> Em telemóvel dá para visualizar e configurar, mas a edição ponto a ponto fica
> bem melhor em tela grande.

---

## 5. Configurar os pontos

**Total de pontos.** Para crianças pequenas, 15 a 30. Para mais velhas, 40 a 60.
Muitos pontos numa figura pequena deixam a folha ilegível — o programa avisa
quando isso acontece.

**Distribuição.**
- *Uniforme por comprimento*: espaçamento igual. É o padrão e funciona sempre.
- *Adaptativa por curvatura*: mais pontos nas curvas, menos nas retas. Bom para
  figuras com cantos importantes.

**Numeração.**
- *Contínua entre caminhos*: 1 a 42 atravessando toda a figura.
- *Reiniciar em cada caminho*: cada parte começa no 1.

**Ligações que não devem aparecer.** Digite pares como `12-13, 28-29`. A linha
entre esses números some; os pontos e os números continuam. Serve para separar
partes que não devem ser ligadas.

> As interrupções entre partes diferentes da figura são criadas
> **automaticamente** — e impressas no rodapé da folha, como
> "Não ligue: 23–24, 32–33". Você não precisa fazer nada.

### Ajustar ponto a ponto na prévia

- **arraste um ponto** para movê-lo;
- **arraste um número** para reposicioná-lo;
- **Alt + clique num ponto** para excluí-lo;
- **Restaurar posicionamento automático** desfaz todos os ajustes manuais.

---

## 6. Folha e identificação

Título, orientação (retrato ou paisagem), margem, campos de Nome, Data, Turma e
Professor(a), imagem de inspiração (tamanho e posição) e figura original ao
fundo com opacidade ajustável.

> Se a sua figura for mais larga que alta, experimente **A4 paisagem**: a
> atividade fica bem maior na folha.

---

## 6b. Layout, cores e recorte

**Layout.** Os mesmos quatro do resto do Educa4Good, com as cores idênticas às
dos PDFs:

| Layout | Cara |
| --- | --- |
| **Clássico** | o visual original do projeto |
| **Editorial** | azul e dourado, régua fina sob o título |
| **Infantil** | verde e turquesa, moldura arredondada |
| **Caderno escolar** | folha pautada, margem vermelha e furos |

Trocar de layout também troca as cores dos pontos e dos números — os seletores
de cor passam a mostrar exatamente o que vai imprimir, e você pode ajustar
depois.

**Impressão colorida ou preto e branco.** Em preto e branco tudo vira preto e
cinza, inclusive cores que você escolheu à mão. É a mesma opção `pretoebranco`
dos PDFs: use quando a escola imprime sem cor.

**Margem tracejada.** Marque *Margem tracejada para recortar e colar no
caderno* e a folha ganha um retângulo pontilhado. O conteúdo recua para dentro
dele, então a tesoura não corta ponto, número nem campo de identificação. A
distância da borda é ajustável de 3 a 15 mm.

## 7. Imprimir ou exportar

Antes de liberar os botões, o programa confere a folha inteira.

**Faixa verde** — "Folha validada": pode imprimir.

**Faixa vermelha** — há erro crítico e a exportação fica **bloqueada**. A
mensagem diz o que fazer. Os mais comuns:

| Mensagem | O que fazer |
| --- | --- |
| "não comporta a quantidade solicitada com boa legibilidade" | reduza o total de pontos ou o tamanho dos números |
| "coincide com a borda da imagem: é a moldura" | volte à etapa 3 e escolha outro contorno |
| "ficaram sem nenhum ponto" | aumente o total de pontos ou desmarque os caminhos menores |
| "pontos de caminhos diferentes praticamente no mesmo lugar" | você escolheu a borda externa e a interna do mesmo traço; deixe só uma |
| "números não cabem na folha" | diminua os números ou aumente a margem |

**Faixa amarela** — são avisos. Confira a prévia e marque
*"Eu revisei a prévia e quero continuar mesmo assim"* para liberar.

Depois:

- **Imprimir** — abre a impressão do navegador com a folha A4 sozinha, sem menu
  nem botão. Deixe as margens da impressora em zero ou "tamanho real".
- **Exportar SVG** — arquivo vetorial, ideal para guardar e reimprimir sem perda.
- **Exportar PNG** — imagem em 150 ou 300 DPI. Use 300 para impressão de
  qualidade.

---

## Perguntas rápidas

**A imagem vai para algum servidor?**
Não. Todo o processamento é no seu navegador. Não há upload.

**Posso usar qualquer figura?**
Use figuras suas ou com licença que permita. O programa não verifica direitos.

**A folha saiu com o desenho pequeno.**
A proporção da figura é preservada. Se ela for larga, troque para A4 paisagem
na etapa 6.

**O modo de detecção não abre.**
Ele precisa baixar a biblioteca OpenCV.js (11 MB) na primeira vez. Sem
internet, use SVG ou o traçado manual — os dois funcionam offline.

**Os números ficaram por cima do desenho.**
Arraste-os na prévia, ou reduza o total de pontos. Se estiverem gravemente
sobrepostos, o programa bloqueia a exportação e avisa.

**Dá para reaproveitar depois?**
Exporte em SVG. O arquivo abre em qualquer editor vetorial e imprime sem perda
de qualidade.
