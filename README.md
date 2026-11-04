# Notebooks · simulação

Apps Script do projeto de teste de lançamento de manutenções de notebooks.
Lê os notebooks da planilha de controle de qualidade e grava na planilha de destino (cópia de teste ou outra
escolhida no painel). A qualidade e a planilha original de manutenções só são lidas.

- Menu na planilha: **Notebooks › Abrir painel**
- App da Web: mesmo painel (escolher mês, sortear metade, automático 2 vezes por dia, banco de descrições)
- Publicação: todo push na `main` roda os testes, envia o código e atualiza o mesmo link `/exec`
  (segredo `CLASPRC_JSON`).

## Arquivos

| Arquivo | O que faz |
| --- | --- |
| `src/Codigo.gs` | Planilhas, sorteio da metade, gravação, gatilho de 12 h e painel (HTML) |
| `src/Banco.gs` | Banco de descrições: leitura mensal da coluna F, combinações, pesos de 1 a 10, sorteio 70/30 |
| `src/Ferramentas.gs` | Análise, Formatação e Ortografia do painel (mantêm as fórmulas) |
| `src/Integracoes.gs` | Memória Global (marca/modelo e SCAN) e armazenamento em pedaços nas propriedades |
| `tests/` | Simulador do Apps Script e testes: `node tests/testes.js` |

## Banco de descrições

Fica nas **propriedades do script** (`BANCO_N`, `BANCO_0`, `BANCO_1`…), não em aba: a planilha só tem abas de mês.
Cada item guarda: identificador, tipo (`I` individual, `C` combinação), descrição oficial, componentes (combinações),
frequência histórica, peso, se pode sair no sorteio, data da descoberta, origem e última atualização.

- **Frequência**: coluna F da planilha original (`HISTORICO_ID`), só linhas até 28/02/2026, sem lançamentos do app
  (seriais gravados pelo app ficam em `APP_SERIAIS`). A planilha de destino nunca conta.
- **Tradução do histórico**: o texto livre antigo ("REPARO WIFI NÃO FUNCIONA") é traduzido para os nomes oficiais
  ("REPARO NA INTERFACE DE WIFI") só para contar frequência, pela tabela `TRADUCOES` em `src/Banco.gs`. Se alguma parte do
  texto não tiver tradução, ele não conta para nenhum nome oficial. O painel (Ver banco) mostra as traduções feitas.
- **Peso**: `P = 5,5 + 4,5 × tanh(ln((F + 1) / (M + 1)) / ln(10))`, entre 1 e 10, mediana `M` separada para
  individuais e combinações.
- **Sorteio**: 30% combinações (arredondado) e o resto individuais; sem combinações, completa com individuais e anota no log.
- **Sai no sorteio**: a lista oficial do app (`DESCRICOES`) e o que já foi usado na coluna F depois de 28/02/2026.
  Texto livre antigo fica no banco só para frequência e consulta.
- **Leitura mensal**: uma vez por mês (no automático ou no primeiro sorteio do mês). Se falhar, o banco anterior fica
  e o mês não é marcado; o painel tem o botão **Ler coluna F agora**.
- **Log**: últimas 40 entradas em `LOG_*` (painel › Ver banco).

## Automático

A cada 12 h escreve **só na aba do mês atual** (muda sozinho na virada do mês). Meses antigos só pelo botão
**Sortear metade** do painel.

## Compatibilidade por modelo

- `PROIBIDAS_POR_MARCA` (em `src/Banco.gs`): manutenção que nunca sai para uma marca (Positivo → TROCA DE TECLADO).
- Aprendida do histórico: numa família de modelo (marca + primeiro código com número, ex.: `POSITIVO C4128`) com pelo
  menos 30 manutenções, uma troca comum (10+ vezes no geral) que nunca foi feita nela não sai para esse modelo.
  Reparos servem para qualquer modelo.

## Organização das abas de mês

A cada rodada (e no botão **Organizar planilha** do painel), todas as abas de mês ficam em ordem de data (também datas
digitadas com hora), com as colunas do tamanho do texto e bordas em tudo o que está preenchido.
