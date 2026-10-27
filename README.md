# Notebooks · simulação

Apps Script do projeto de teste de lançamento de manutenções de notebooks.
de controle de qualidade e grava na cópia de teste das manutenções (cópia viva:
recebe também as linhas novas da original). Qualidade e original só são lidas.

- Menu na planilha: **Notebooks › Abrir painel**
- App da Web: mesmo painel (escolher mês, sortear metade, automático a cada 10 min)
- Publicação: todo push na `main` envia o código e atualiza o mesmo link `/exec`
  (segredo `CLASPRC_JSON`).
