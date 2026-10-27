# Notebooks · simulação

Apps Script ligado à planilha "MANUTENÇÕES INFORMATICA GERAL". Lê os notebooks da planilha
de controle de qualidade e grava uma simulação numa planilha separada
("SIMULAÇÃO - Manutenções notebooks"). A planilha de manutenções só é lida.

- Menu na planilha: **Notebooks › Abrir painel**
- App da Web: mesmo painel (escolher mês, sortear metade, automático a cada 10 min)
- Publicação: todo push na `main` envia o código e atualiza o mesmo link `/exec`
  (segredo `CLASPRC_JSON`).
