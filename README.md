# Notebooks · simulação

Apps Script do projeto de teste de lançamento de manutenções de notebooks.
de controle de qualidade e grava na planilha de destino (cópia de teste ou outra
escolhida no painel). A qualidade só é lida.

- Menu na planilha: **Notebooks › Abrir painel**
- App da Web: mesmo painel (escolher mês, sortear metade, automático 2 vezes por dia)
- Publicação: todo push na `main` envia o código e atualiza o mesmo link `/exec`
  (segredo `CLASPRC_JSON`).
