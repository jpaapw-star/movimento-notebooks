// ===================== PLANILHAS =====================
// Todas as planilhas usadas pelo app ficam só aqui (código de compartilhamento = ID do link).
// Qualidade: de onde vêm os notebooks (só leitura, nunca alterada)
const ORIGEM_ID = '1JHONHaipHAKmtkcQ_7mm8VXA-h-LBQuu-I8uzPhjgDQ';
const ORIGEM_ABA = 'TabelaQualidade';
// Cópia de teste: onde o app grava (só nas abas de mês). Pelo painel dá para trocar por outra
// planilha de uma conta aceita (lista abaixo) colando o link; o app lembra a escolha.
const TESTE_ID = '1yofc6A_iIdjozQZGpeIpoh9hlP9ZKUyJmFO9d-Bdg70';
// Contas aceitas como dono da planilha de destino (escolhida no painel).
// Para aceitar outra conta pessoal, acrescente o e-mail na lista, entre aspas e separado por vírgula.
const CONTAS_ACEITAS = [
  'jpaapw@gmail.com',
  'emanxti@gmail.com',
];
// ======================================================

/**
 * Transportar notebooks
 * Lê os notebooks da planilha de qualidade e grava na cópia de teste,
 * nas abas de mês (ex.: "OUTUBRO 2026"), sempre em ordem de data. Não cria nenhuma outra aba.
 *
 * - Por mês: sorteia metade dos notebooks lançados naquele mês
 * - Nunca escolhe serial que já existe na planilha de destino
 * - Técnico: JOÃO PEDRO
 * - Descrição: sorteada pelo banco de descrições (Banco.gs): 70% individuais, 30% combinações,
 *   pesos de 1 a 10 pela frequência histórica da coluna F da planilha original (até 28/02/2026)
 * - Pula linhas sem data ou sem serial, e o que não é notebook (monitor, console, impressora...)
 * - Painel (menu Notebooks › Abrir painel): escolher um mês e gerar na hora,
 *   e ligar o modo automático (2 vezes por dia, a cada 12 h, sorteia os notebooks novos
 *   SÓ do mês atual, sempre mantendo metade; meses antigos só pelo painel)
 * - App web: o mesmo painel em tela cheia
 */

const TECNICO = 'JOÃO PEDRO';
const SIMULACAO_CAB = ['TÉCNICO', 'MARCA', 'MODELO', 'SERIAL', 'DATA', 'DESCRIÇÃO'];

// Lista oficial inicial do banco de descrições (Banco.gs). Os pesos agora vêm do histórico,
// calculados sozinhos; esta lista só garante que os nomes oficiais existam desde o começo.
const DESCRICOES = [
  'REPARO NA INTERFACE DE ÁUDIO',
  'REPARO NA INTERFACE DE VÍDEO',
  'REPARO NA INTERFACE DE REDE',
  'REPARO NA INTERFACE DE VÍDEO, REDE E ÁUDIO',
  'REPARO NA INTERFACE DE REDE E VÍDEO',
  'REPARO NA INTERFACE DE INICIALIZAÇÃO E FORMATAÇÃO DO SISTEMA',
  'FORMATAÇÃO DO SISTEMA E REPARO NA INTERFACE DE REDE',
  'FORMATAÇÃO DO SISTEMA E REPARO NA INTERFACE DE ÁUDIO',
  'REPARO NA INTERFACE DE TECLADO',
  'REPARO NA INTERFACE DE TOUCHPAD',
  'TROCA DE BATERIA',
  'TROCA DE MEMÓRIA RAM',
  'TROCA DE SSD',
  'TROCA DE PLACA DE REDE',
  'TROCA DE AUTOFALANTE',
  'TROCA DE TOUCH PAD',
  'TROCA DE SUB-PLACA',
  'TROCA DE TELA'
];

const MESES = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO',
  'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];

// Na MARCA: qualquer uma destas palavras tira o item
const FORA = /monitor|console|controle|joystick|playstation|ps5|ps4|xbox|nintendo|switch/i;
// Na DESCRIÇÃO e no MODELO: só o aparelho em si tira o item ("controle de brilho" é de notebook)
const FORA_DESC = /\b(monitor|console|joystick|playstation|ps[345]|xbox|nintendo|dualsense|dualshock|controle (de |do )?(video ?game|ps[345]|xbox|joystick)|impressora|multifuncional|toner|cartucho|deskjet|laserjet|officejet|smart tank|ink tank|roteador|celular|smartphone)\b/i;
const NB = /notebook|laptop|macbook|chromebook|ultrabook/i;
// Marcas que nunca são notebook. LG e SONY entram só se a descrição ou o modelo mostrar notebook (Gram, Vaio)
const MARCA_FORA = /^(AOC|STARLINK|REDRAGON)/;
const MODELO_NB = /NP\d|340X|750X|740V|760V|BOOK|C4128|E1504|E1404|AG15|A315|A515|DC15|15IRH|ELITEBOOK|MACBOOK|GRAM|VAIO|VPC|SVF|SVE/i;
const MARCAS_NB = ['ACER', 'ASUS', 'DELL', 'LENOVO', 'POSITIVO', 'VAIO', 'HP', 'MICROSOFT',
  'ACERE', 'ASU', 'POSITIVO VAIO', 'POSITIVO INFORMÁTICA'];
const MARCAS_TEXTO = ['ASUS', 'ACER', 'DELL', 'LENOVO', 'POSITIVO', 'SAMSUNG', 'VAIO', 'APPLE', 'HP'];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Notebooks')
    .addItem('Abrir painel', 'abrirPainel')
    .addToUi();
}

function abrirPainel() {
  SpreadsheetApp.getUi().showSidebar(
    HtmlService.createHtmlOutput(PAINEL_HTML).setTitle('Notebooks'));
}

// App web: mesmo painel, para abrir no celular ou no computador
function doGet() {
  return HtmlService.createHtmlOutput(PAINEL_HTML).setTitle('Notebooks')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function props_() {
  return PropertiesService.getScriptProperties();
}

// Chamado pelo painel: lista dos meses e estado do automático
function painelDados() {
  ajustarTriggerAuto_();
  const plano = montarPlano_(abrirSimulacao_(), []);
  const meses = Object.keys(plano.resumo)
    .sort((a, b) => plano.resumo[b].ordem - plano.resumo[a].ordem)
    .map(nome => ({ nome, total: plano.resumo[nome].total, feitos: plano.resumo[nome].feitos }));
  const destino = abrirSimulacao_();
  return { meses, auto: triggerAuto_() !== null, url: destino.getUrl(), destino: destino.getName(),
    ultima: JSON.parse(props_().getProperty('ULTIMA_RODADA') || 'null'),
    scan: JSON.parse(props_().getProperty('RESUMO_SCAN') || 'null'), memoria: !!chaveMG_(),
    erroMg: props_().getProperty('ERRO_MG') || '', banco: resumoBanco_() };
}

// Chamado pelo painel: troca a planilha onde o app grava (link ou ID colado pelo usuário)
function painelDestino(link) {
  const m = String(link || '').trim().match(/\/d\/([\w-]{20,})/) || String(link || '').trim().match(/^([\w-]{20,})$/);
  if (!m) throw new Error('Não reconheci o link. Cole o endereço da planilha (docs.google.com/spreadsheets/d/...).');
  const id = m[1];
  // A qualidade só é lida: nunca vira destino
  if (id === ORIGEM_ID) {
    throw new Error('Essa planilha só é lida pelo app. Escolha uma cópia sua.');
  }
  let nova;
  try {
    nova = SpreadsheetApp.openById(id);
  } catch (e) {
    throw new Error('Não consegui abrir essa planilha. Confira o link e se você tem acesso a ela.');
  }
  // Só planilhas de contas da lista CONTAS_ACEITAS
  const dono = p => { try { const u = p.getOwner(); return u ? u.getEmail().toLowerCase() : ''; } catch (e) { return ''; } };
  const donoNova = dono(nova);
  const aceitas = CONTAS_ACEITAS.map(c => String(c).trim().toLowerCase());
  if (!donoNova || aceitas.indexOf(donoNova) < 0) {
    throw new Error('Essa planilha não é de uma conta aceita. Use uma cópia sua (Arquivo › Fazer uma cópia).');
  }
  const props = props_();
  if (id === TESTE_ID) props.deleteProperty('DESTINO_ID'); else props.setProperty('DESTINO_ID', id);
  props.deleteProperty('ASSINATURA'); // próxima rodada trabalha na planilha nova
  return 'Pronto: o app agora grava em "' + nova.getName() + '".';
}

// Chamado pelo painel: gera um mês na hora, passa a acompanhá-lo e liga o automático
function painelGerar(mes) {
  const props = props_();
  const seguidos = JSON.parse(props.getProperty('MESES_AUTO') || '[]');
  if (seguidos.indexOf(mes) < 0) props.setProperty('MESES_AUTO', JSON.stringify(seguidos.concat(mes)));
  if (!triggerAuto_()) criarTriggerAuto_(); // sortear liga o automático (2 vezes por dia)
  atualizarBancoMensal_(); // primeira leitura da coluna F do mês, se ainda não houve
  const n = gerar_([mes], false);
  if (n < 0) throw new Error('Outra rodada está em andamento. Tente de novo em 1 minuto.');
  let aviso = '';
  try {
    conferirScan_([mes]);
  } catch (e) {
    aviso = ' A conferência SCAN falhou e tenta de novo na próxima rodada.';
  }
  return (n ? n + ' notebooks sorteados em ' + mes + '.' : 'Nada novo em ' + mes + ': já está na metade.') + aviso;
}

function painelAuto(ligar) {
  const t = triggerAuto_();
  if (ligar && !t) criarTriggerAuto_();
  if (!ligar && t) ScriptApp.deleteTrigger(t);
  return ligar;
}

const AUTO_HORAS = 12; // automático roda 2 vezes por dia

function criarTriggerAuto_() {
  ScriptApp.newTrigger('automatico').timeBased().everyHours(AUTO_HORAS).create();
  props_().setProperty('AUTO_HORAS', String(AUTO_HORAS));
}

// Gatilho criado por versão antiga (a cada 10 min): troca pelo de 12 h
function ajustarTriggerAuto_() {
  const t = triggerAuto_();
  if (!t || props_().getProperty('AUTO_HORAS') === String(AUTO_HORAS)) return;
  ScriptApp.deleteTrigger(t);
  criarTriggerAuto_();
}

// Nome da aba do mês atual (ex.: "NOVEMBRO 2026"); muda sozinho na virada do mês
function mesAtual_(agora) {
  const hoje = agora || new Date();
  return MESES[hoje.getMonth()] + ' ' + hoje.getFullYear();
}

// Roda sozinho 2 vezes por dia. Escreve SÓ no mês atual; meses antigos só pelo painel.
// A conferência SCAN (que não escreve na planilha) continua nos meses acompanhados.
function automatico() {
  ajustarTriggerAuto_();
  const atual = mesAtual_();
  const seguidos = JSON.parse(props_().getProperty('MESES_AUTO') || '[]');
  try {
    atualizarBancoMensal_();
    gerar_([atual], true);
    conferirScan_(seguidos.indexOf(atual) < 0 ? seguidos.concat(atual) : seguidos);
  } catch (e) {
    // Fica registrado no painel; o erro segue para o Google avisar por e-mail
    registrarRodada_(0, e.message);
    throw e;
  }
}

// Leitura mensal da coluna F (uma vez por mês). Se falhar, o mês não fica concluído e o
// sorteio segue com o banco anterior; o erro fica no log do painel.
function atualizarBancoMensal_() {
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(30000)) return;
  try {
    atualizarBancoSemTrava_(false);
  } catch (e) {
    // já registrado no log; tenta de novo na próxima rodada
  } finally {
    trava.releaseLock();
  }
}

// Devolve quantos foram sorteados, ou -1 se outra rodada estava em andamento.
// pularSeIgual: no automático, não refaz o trabalho se nada mudou desde a última rodada.
// No automático (pularSeIgual) só o mês atual pode ser escrito, venha o que vier em meses.
function gerar_(meses, pularSeIgual) {
  if (pularSeIgual) {
    const atual = mesAtual_();
    const bloqueados = meses.filter(m => m !== atual);
    if (bloqueados.length) registrarLog_('AVISO', 'Automático não escreve fora do mês atual: ' + bloqueados.join(', ') + ' ignorado(s).');
    meses = meses.filter(m => m === atual);
    if (!meses.length) return 0;
  }
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(30000)) return -1;
  try {
    const simulacao = abrirSimulacao_();
    const origem = lerOrigem_();
    const banco = bancoParaSortear_();
    const linhas = p => p.getSheets().map(a => a.getLastRow()).join(',');
    const assinatura = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,
      JSON.stringify(origem) + '|' + meses.join(',') + '|' + linhas(simulacao) + '|' + (banco.pesosEm || '')));
    if (pularSeIgual && props_().getProperty('ASSINATURA') === assinatura) return 0;

    const tocadas = new Set();
    const plano = montarPlano_(simulacao, meses, origem);
    let n = 0;
    padronizarMarcaModelo_([].concat(...Object.values(plano.porAba)));
    Object.keys(plano.porAba).forEach(nome => {
      const d = atribuirDescricoes_(plano.porAba[nome], banco);
      gravarNaAba_(abaSimulacao_(simulacao, nome), plano.porAba[nome]);
      anotarSeriaisDoApp_(plano.porAba[nome].map(it => it.serial));
      registrarLog_('SORTEIO', nome + ': ' + plano.porAba[nome].length + ' notebook(s), ' + d.ind + ' individual(is) e ' + d.comb + ' combinação(ões).');
      n += plano.porAba[nome].length;
      tocadas.add(nome);
    });
    ordenarTodasAsAbas_(simulacao); // toda a planilha, não só as abas que receberam linhas
    if (!n && !tocadas.size) props_().setProperty('ASSINATURA', assinatura);
    registrarRodada_(n, '');
    return n;
  } finally {
    trava.releaseLock();
  }
}

function registrarRodada_(n, erro) {
  props_().setProperty('ULTIMA_RODADA', JSON.stringify({
    quando: Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM HH:mm'), n, erro }));
}

// Lê a aba da planilha de qualidade e confere se as colunas necessárias existem
function lerOrigem_() {
  let aba;
  try {
    aba = SpreadsheetApp.openById(ORIGEM_ID).getSheetByName(ORIGEM_ABA);
  } catch (e) {
    throw new Error('Não consegui abrir a planilha de qualidade. Confira se você ainda tem acesso a ela.');
  }
  if (!aba) throw new Error('A aba "' + ORIGEM_ABA + '" não existe mais na planilha de qualidade.');
  const dados = aba.getDataRange().getValues();
  const cab = dados[0].map(c => String(c).trim().toUpperCase());
  const faltam = ['MARCA', 'MODELO', 'SERIAL', 'DATA', 'DESCRIÇÃO'].filter(c => cab.indexOf(c) < 0);
  if (faltam.length) throw new Error('Na planilha de qualidade sumiu a coluna: ' + faltam.join(', ') + '.');
  return dados;
}

function triggerAuto_() {
  return ScriptApp.getProjectTriggers().find(t => t.getHandlerFunction() === 'automatico') || null;
}

function abrirSimulacao_() {
  try {
    return SpreadsheetApp.openById(props_().getProperty('DESTINO_ID') || TESTE_ID);
  } catch (e) {
    throw new Error('Não consegui abrir a planilha de destino. Confira se ela existe ou escolha outra no painel.');
  }
}

function ehAbaDeMes_(nome) {
  const m = String(nome).trim().toUpperCase().match(/^(\S+) (\d{4})$/);
  return !!m && MESES.indexOf(m[1]) >= 0;
}

// Momento da DATA para ordenar (em minutos): aceita data do Sheets ou texto "dd/mm/aaaa",
// com ou sem hora ("31/10/2026 08:56"). Sem data reconhecida: null.
function momentoDaData_(v) {
  const d = lerData_(v, true);
  if (!d) return null;
  let min = 0;
  if (v instanceof Date) min = v.getHours() * 60 + v.getMinutes();
  else {
    const h = String(v).match(/\b(\d{1,2}):(\d{2})\b/);
    if (h) min = +h[1] * 60 + +h[2];
  }
  return Math.round(d.getTime() / 6e4) + min;
}

// Ordena as linhas da aba pela DATA (cabeçalho fica na linha 1). Datas em texto e com hora entram na
// ordem certa; linhas sem data vão para o fim; empate mantém a ordem atual. Os valores não mudam.
// Usa uma coluna auxiliar temporária com a chave, para o Sheets mover junto formatação e fórmulas.
// Devolve true se mudou a ordem.
function ordenarPorData_(aba) {
  const col = colunas_(aba);
  if (col.data < 0) return false;
  const largura = aba.getLastColumn();
  const ultima = ultimaLinhaComDados_(aba, largura);
  if (ultima < 3) return false;
  const datas = aba.getRange(2, col.data + 1, ultima - 1, 1).getValues();
  const chaves = datas.map((l, i) => {
    const m = momentoDaData_(l[0]);
    return (m === null ? 9e7 : m) * 1e5 + i; // sem data no fim; i desempata
  });
  if (chaves.every((k, i) => !i || k > chaves[i - 1])) return false; // já está em ordem
  const auxiliar = largura + 1;
  const inseriu = aba.getMaxColumns() < auxiliar;
  if (inseriu) aba.insertColumnsAfter(largura, 1);
  try {
    aba.getRange(2, auxiliar, chaves.length, 1).setValues(chaves.map(k => [k]));
    aba.getRange(2, 1, ultima - 1, auxiliar).sort({ column: auxiliar, ascending: true });
  } finally {
    if (inseriu) aba.deleteColumn(auxiliar); else aba.getRange(2, auxiliar, chaves.length, 1).clearContent();
  }
  return true;
}

const FOLGA_COLUNA = 16; // pixels a mais depois de ajustar a largura ao texto

// Cada coluna da aba fica da largura do texto mais comprido (com uma pequena folga)
function ajustarLarguras_(aba) {
  const n = aba.getLastColumn();
  if (!n) return;
  aba.autoResizeColumns(1, n);
  for (let c = 1; c <= n; c++) aba.setColumnWidth(c, aba.getColumnWidth(c) + FOLGA_COLUNA);
}

// Todas as bordas (por fora e entre as células) em tudo o que está preenchido, do cabeçalho à última linha
function colocarBordas_(aba) {
  const largura = aba.getLastColumn();
  if (!largura) return;
  const ultima = ultimaLinhaComDados_(aba, largura);
  aba.getRange(1, 1, ultima, largura).setBorder(true, true, true, true, true, true);
}

// Ordena por data, ajusta a largura das colunas e coloca as bordas em todas as abas de mês. Devolve quantas mudaram de ordem.
function ordenarTodasAsAbas_(planilha) {
  const abas = planilha.getSheets().filter(a => ehAbaDeMes_(a.getName()));
  const n = abas.filter(ordenarPorData_).length;
  abas.forEach(a => { ajustarLarguras_(a); colocarBordas_(a); });
  return n;
}

// Chamado pelo painel: ordena por data todas as abas de mês
function painelOrdenar() {
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(30000)) throw new Error('Outra rodada está em andamento. Tente de novo em 1 minuto.');
  try {
    const n = ordenarTodasAsAbas_(abrirSimulacao_());
    return (n ? n + ' aba(s) de mês colocada(s) em ordem de data.' : 'Todas as abas de mês já estavam em ordem de data.') +
      ' Colunas ajustadas ao tamanho do texto e bordas colocadas.';
  } finally {
    trava.releaseLock();
  }
}

function abaSimulacao_(planilha, nome) {
  let aba = planilha.getSheetByName(nome);
  if (aba) return aba;
  aba = planilha.insertSheet(nome);
  aba.getRange(1, 1, 1, SIMULACAO_CAB.length).setValues([SIMULACAO_CAB]).setFontWeight('bold');
  aba.setFrozenRows(1);
  const vazia = planilha.getSheetByName('Página1') || planilha.getSheetByName('Sheet1');
  if (vazia && vazia.getLastRow() === 0) planilha.deleteSheet(vazia);
  return aba;
}

// meses: lista de abas para sortear ([] = só calcula o resumo, sem sortear)
function montarPlano_(destino, meses, origem) {
  // existentes = todos os seriais do destino; naSimulacao = os lançados com o técnico do app
  const existentes = new Set(), naSimulacao = new Set();
  const semAcento = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
  const tecnico = semAcento(TECNICO);
  destino.getSheets().forEach(aba => {
    if (aba.getName() === ABA_SCAN) return; // aba antiga de conferência, não são lançamentos
    const col = colunas_(aba);
    if (col.serial < 0 || aba.getLastRow() < 2) return;
    aba.getRange(2, 1, aba.getLastRow() - 1, aba.getLastColumn()).getValues().forEach(l => {
      const s = normSerial_(l[col.serial]);
      if (!s) return;
      existentes.add(s);
      if (col.tecnico >= 0 && semAcento(l[col.tecnico]) === tecnico) naSimulacao.add(s);
    });
  });

  const dados = origem || lerOrigem_();
  const cab = dados[0].map(c => String(c).trim().toUpperCase());
  const iMarca = cab.indexOf('MARCA'), iModelo = cab.indexOf('MODELO'), iSerial = cab.indexOf('SERIAL'),
    iData = cab.indexOf('DATA'), iDesc = cab.indexOf('DESCRIÇÃO'), iEan = cab.indexOf('EAN');

  const plano = { porAba: {}, resumo: {}, jaExiste: 0, repetidos: 0, semData: 0, semSerial: 0, naoNotebook: 0 };
  const itens = [];
  dados.slice(1).forEach(l => {
    const marca = String(l[iMarca] || '').trim(), modelo = String(l[iModelo] || '').trim(),
      desc = String(l[iDesc] || '');
    if (!marca && !modelo && !l[iSerial]) return;
    if (!ehNotebook_(marca, modelo, desc)) { plano.naoNotebook++; return; }
    const serial = String(l[iSerial] || '').trim();
    if (!normSerial_(serial)) { plano.semSerial++; return; }
    // A data às vezes cai na coluna seguinte (NOTA FINAL): procura ali e depois no resto da linha
    const data = lerData_(l[iData]) || lerData_(l[iData + 1]) || l.map(lerData_).find(Boolean) || null;
    if (!data) { plano.semData++; return; }
    itens.push({ marca: marcaFinal_(marca, desc), modelo, serial, data, ean: iEan < 0 ? '' : String(l[iEan] || '').trim() });
  });

  // Agrupa por mês (um serial conta uma vez por mês)
  const porMes = {};
  itens.forEach(it => {
    const nome = MESES[it.data.getMonth()] + ' ' + it.data.getFullYear();
    const mes = porMes[nome] = porMes[nome] ||
      { vistos: new Set(), lista: [], ordem: it.data.getFullYear() * 12 + it.data.getMonth() };
    const s = normSerial_(it.serial);
    if (mes.vistos.has(s)) { plano.repetidos++; return; }
    mes.vistos.add(s);
    mes.lista.push(it);
  });

  // Metade dos lançados no mês, sorteada só entre os que ainda não existem
  Object.keys(porMes).forEach(nome => {
    const lista = porMes[nome].lista;
    const feitos = lista.filter(it => naSimulacao.has(normSerial_(it.serial))).length;
    plano.resumo[nome] = { total: lista.length, feitos, ordem: porMes[nome].ordem };
    (plano.listaMes = plano.listaMes || {})[nome] = lista;
    if (meses.indexOf(nome) < 0) return;
    // Quem já foi sorteado antes conta na metade (rodar de novo não passa da metade)
    const meta = Math.round(lista.length / 2) - feitos;
    const livres = lista.filter(it => {
      const s = normSerial_(it.serial);
      if (existentes.has(s)) { plano.jaExiste++; return false; }
      return true;
    });
    embaralhar_(livres);
    const escolhidos = [];
    livres.forEach(it => {
      const s = normSerial_(it.serial);
      if (escolhidos.length >= meta || existentes.has(s)) return;
      existentes.add(s);
      escolhidos.push(it);
    });
    if (!escolhidos.length) return;
    escolhidos.sort((a, b) => a.data - b.data);
    plano.porAba[nome] = escolhidos;
  });
  return plano;
}

function gravarNaAba_(aba, itens) {
  let col = colunas_(aba);
  if ([col.tecnico, col.marca, col.modelo, col.serial, col.data, col.desc].some(i => i < 0)) {
    // Cabeçalho apagado: recoloca o padrão. Cabeçalho diferente: não mexe, só avisa.
    if (aba.getRange(1, 1, 1, Math.max(aba.getLastColumn(), 1)).getValues()[0].some(c => String(c).trim())) {
      throw new Error('Na aba "' + aba.getName() + '" falta uma das colunas TÉCNICO, MARCA, MODELO, SÉRIE, DATA ou DESCRIÇÃO.');
    }
    aba.getRange(1, 1, 1, SIMULACAO_CAB.length).setValues([SIMULACAO_CAB]).setFontWeight('bold');
    col = colunas_(aba);
  }
  const largura = Math.max(col.tecnico, col.marca, col.modelo, col.serial, col.data, col.desc) + 1;
  const ultima = ultimaLinhaComDados_(aba, largura);
  const valores = itens.map(it => {
    const l = new Array(largura).fill('');
    l[col.tecnico] = TECNICO;
    l[col.marca] = it.marca;
    l[col.modelo] = it.modelo;
    l[col.serial] = it.serial;
    l[col.data] = it.data;
    l[col.desc] = it.desc;
    return l;
  });
  aba.getRange(ultima + 1, 1, valores.length, largura).setValues(valores);
  aba.getRange(ultima + 1, col.data + 1, valores.length, 1).setNumberFormat('dd/MM/yyyy');
}

function embaralhar_(lista) {
  for (let i = lista.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
}

function colunas_(aba) {
  const cab = aba.getRange(1, 1, 1, Math.max(aba.getLastColumn(), 1)).getValues()[0]
    .map(c => String(c).trim().toUpperCase());
  const achar = re => cab.findIndex(c => re.test(c));
  return {
    tecnico: achar(/^T[ÉE]CNICO/), marca: achar(/^MARCA/), modelo: achar(/^MODELO/),
    serial: achar(/^(SERIAL|S[ÉE]RIE)/), data: achar(/^DATA/), desc: achar(/^(DESCRI|DEFEITO)/)
  };
}

function ultimaLinhaComDados_(aba, largura) {
  const n = aba.getLastRow();
  if (n < 2) return 1;
  const v = aba.getRange(1, 1, n, largura).getValues();
  for (let i = v.length - 1; i >= 0; i--) {
    if (v[i].some(c => String(c).trim() !== '')) return i + 1;
  }
  return 1;
}

function ehNotebook_(marca, modelo, desc) {
  const m = marca.toUpperCase();
  if (FORA.test(m) || MARCA_FORA.test(m)) return false;
  if (FORA_DESC.test(desc + ' ' + modelo) && !NB.test(desc)) return false;
  if (NB.test(desc) || MODELO_NB.test(modelo)) return true;
  return MARCAS_NB.indexOf(m) >= 0;
}

function marcaFinal_(marca, desc) {
  const m = marca.toUpperCase();
  if (m && m !== 'MARCA DESCONHECIDA') return m;
  const achada = MARCAS_TEXTO.find(x => new RegExp('\\b' + x + '\\b', 'i').test(desc));
  return achada || m;
}

// Aceita data do Sheets, "dd/mm/aaaa" ou "aaaa-mm-dd"; recusa data impossível ou no futuro.
// qualquerAno: aceita também datas antes de 2024 (histórico da planilha original)
function lerData_(v, qualquerAno) {
  let d = null;
  if (v instanceof Date && !isNaN(v)) d = new Date(v.getFullYear(), v.getMonth(), v.getDate());
  else {
    const t = String(v || '');
    let m = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (m) d = new Date(+m[3], +m[2] - 1, +m[1]);
    else if ((m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) d = new Date(+m[1], +m[2] - 1, +m[3]);
  }
  if (!d || isNaN(d)) return null;
  const amanha = new Date(Date.now() + 864e5);
  return (qualquerAno || d.getFullYear() >= 2024) && d <= amanha ? d : null;
}

// Serial só com letras e números; "N/A", "sem serial", "0" e parecidos contam como vazio
function normSerial_(s) {
  const n = String(s || '').normalize('NFD').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  return n.length < 4 || /^(SEMSERIAL|NAOENCONTRADO|NAOTEM|NAOPOSSUI|0+)$/.test(n) ? '' : n;
}

const PAINEL_HTML = `<!doctype html>
<html><head><base target="_top"><style>
  :root { --fundo:#fff; --texto:#000; --suave:#6e6e73; --linha:#e5e5ea; --botao:#000; --botao-txt:#fff; }
  @media (prefers-color-scheme: dark) {
    :root { --fundo:#000; --texto:#fff; --suave:#98989d; --linha:#2c2c2e; --botao:#fff; --botao-txt:#000; }
  }
  body { margin:0 auto; max-width:480px; padding:16px; background:var(--fundo); color:var(--texto);
    font:14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  h1 { font-size:22px; font-weight:700; margin:0 0 16px; }
  label { display:block; color:var(--suave); font-size:12px; margin-bottom:6px; }
  select, button, input[type=text] { width:100%; box-sizing:border-box; font:inherit; border-radius:10px; padding:10px 12px; }
  select, input[type=text] { background:var(--fundo); color:var(--texto); border:1px solid var(--linha); }
  button { margin-top:10px; border:0; background:var(--botao); color:var(--botao-txt); font-weight:600; cursor:pointer; }
  button:disabled { opacity:.4; }
  button.leve { background:transparent; color:var(--texto); border:1px solid var(--linha); font-weight:500; }
  .botoes { display:flex; gap:8px; }
  .botoes button { flex:1; }
  #analise { margin-top:8px; }
  #analise div, #banco div.item { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--linha); gap:12px; }
  #banco h2 { font-size:13px; margin:14px 0 4px; }
  #banco .comp { color:var(--suave); font-size:11px; }
  .linha { display:flex; justify-content:space-between; align-items:center;
    padding:14px 0; border-top:1px solid var(--linha); margin-top:20px; }
  .suave { color:var(--suave); font-size:12px; margin-top:8px; min-height:16px; }
  input[type=checkbox] { width:42px; height:24px; appearance:none; background:var(--linha); border-radius:12px;
    position:relative; cursor:pointer; margin:0; }
  input[type=checkbox]::after { content:""; position:absolute; top:2px; left:2px; width:20px; height:20px;
    border-radius:50%; background:var(--fundo); transition:left .2s; }
  input[type=checkbox]:checked { background:var(--botao); }
  input[type=checkbox]:checked::after { left:20px; }
  a { color:var(--texto); }
</style></head><body>
  <h1>Notebooks</h1>
  <label for="mes">Mês</label>
  <select id="mes"><option>Carregando…</option></select>
  <button id="gerar" disabled>Sortear metade</button>
  <div class="suave" id="msg"></div>
  <div class="botoes">
    <button class="leve" id="analisar" disabled>Análise</button>
    <button class="leve" id="formatar" disabled>Formatação</button>
    <button class="leve" id="ortografia" disabled>Ortografia</button>
  </div>
  <div class="botoes">
    <button class="leve" id="ordenar">Organizar planilha (data, largura e bordas)</button>
  </div>
  <div class="suave" id="msgFerr"></div>
  <div id="analise"></div>
  <div class="linha"><span>Automático</span><input type="checkbox" id="auto" disabled></div>
  <div class="suave">Duas vezes por dia (a cada 12 horas) sorteia os notebooks novos só do mês atual. Meses antigos só pelo botão acima.</div>
  <div class="suave" id="ultima"></div>
  <div class="suave" id="scan"></div>
  <div class="linha"><span>Banco de descrições</span></div>
  <div class="suave" id="bancoResumo"></div>
  <div class="botoes">
    <button class="leve" id="verBanco">Ver banco</button>
    <button class="leve" id="lerBanco">Ler coluna F agora</button>
  </div>
  <div class="suave" id="msgBanco"></div>
  <div id="banco"></div>
  <div class="linha"><span>Planilha de destino</span></div>
  <div class="suave"><a id="link" href="#" target="_blank" hidden></a></div>
  <input type="text" id="destino" placeholder="Cole o link de outra planilha sua">
  <button id="trocar">Usar esta planilha</button>
  <div class="suave" id="msgDestino"></div>
<script>
  const $ = id => document.getElementById(id);
  function carregar() {
    google.script.run.withSuccessHandler(d => {
      $('mes').innerHTML = d.meses.map(m =>
        '<option value="' + m.nome + '">' + m.nome + ' · ' + m.feitos + ' de ' + m.total + '</option>').join('');
      $('auto').checked = d.auto; $('auto').disabled = false; $('gerar').disabled = !d.meses.length;
      ['analisar', 'formatar', 'ortografia'].forEach(b => $(b).disabled = !d.meses.length);
      $('link').href = d.url; $('link').textContent = d.destino; $('link').hidden = false;
      const u = d.ultima;
      $('ultima').textContent = !u ? '' : 'Última rodada: ' + u.quando + ' · ' +
        (u.erro ? 'erro: ' + u.erro : u.n + ' sorteados');
      const c = d.scan;
      $('scan').textContent = !d.memoria ? 'Memória Global: falta a chave (marca/modelo e SCAN desligados).' :
        d.erroMg ? 'Memória Global não respondeu: ' + d.erroMg :
        !c ? '' : 'Conferência SCAN: ' + c.ok + ' ok · ' + c.conferir + ' para conferir · ' + c.fora + ' não passaram pelo SCAN' +
          (c.lista && c.lista.length ? '. Conferir: ' + c.lista.join(', ') : '');
      const b = d.banco;
      $('bancoResumo').textContent = !b ? 'Ainda não lido: o primeiro sorteio lê a coluna F da planilha original.' :
        b.individuais + ' manutenções · ' + b.combinacoes + ' combinações · última leitura ' + (b.leitura || '—') +
        ' · pesos de ' + (b.pesosEm || '—') + (b.soHistorico ? ' · ' + b.soHistorico + ' só no histórico' : '') +
        (b.naoInterpretadas ? ' · ' + b.naoInterpretadas + ' textos não interpretados' : '');
    }).withFailureHandler(e => $('msg').textContent = e.message).painelDados();
  }
  $('gerar').onclick = () => {
    const mes = $('mes').value;
    $('gerar').disabled = true; $('msg').textContent = 'Sorteando…';
    google.script.run.withSuccessHandler(t => { $('msg').textContent = t; carregar(); })
      .withFailureHandler(e => { $('msg').textContent = e.message; $('gerar').disabled = false; })
      .painelGerar(mes);
  };
  $('auto').onchange = () => {
    $('auto').disabled = true;
    $('msg').textContent = $('auto').checked ? 'Ligando o automático…' : 'Desligando…';
    google.script.run.withSuccessHandler(v => {
      $('auto').checked = v; $('auto').disabled = false;
      $('msg').textContent = v ? 'Automático ligado.' : 'Automático desligado.';
    })
      .withFailureHandler(e => { $('msg').textContent = e.message; $('auto').disabled = false; })
      .painelAuto($('auto').checked);
  };
  function ferramenta(botao, funcao, aguarde, pronto) {
    $(botao).onclick = () => {
      const mes = $('mes').value;
      $(botao).disabled = true; $('msgFerr').textContent = aguarde; $('analise').innerHTML = '';
      google.script.run.withSuccessHandler(r => { $(botao).disabled = false; pronto(r); })
        .withFailureHandler(e => { $(botao).disabled = false; $('msgFerr').textContent = e.message; })[funcao](mes);
    };
  }
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  ferramenta('analisar', 'painelAnalise', 'Analisando…', r => {
    $('msgFerr').textContent = r.mes + ': ' + r.total + ' manutenções com o seu nome.';
    $('analise').innerHTML = r.lista.map(x => '<div><span>' + esc(x.desc) + '</span><span>' + x.n + '</span></div>').join('');
  });
  ferramenta('formatar', 'painelFormatar', 'Arrumando a formatação…', t => $('msgFerr').textContent = t);
  ferramenta('ortografia', 'painelOrtografia', 'Corrigindo a ortografia…', t => $('msgFerr').textContent = t);
  ferramenta('ordenar', 'painelOrdenar', 'Organizando todas as abas de mês…', t => $('msgFerr').textContent = t);
  const lista = (titulo, itens) => '<h2>' + esc(titulo) + '</h2>' + itens.map(x =>
    '<div class="item"><span>' + esc(x.desc) + (x.comp && x.comp.length ? '<br><span class="comp">' + x.comp.map(esc).join(' + ') + '</span>' : '') +
    '</span><span>' + x.freq + ' · ' + x.peso + '</span></div>').join('');
  $('verBanco').onclick = () => {
    $('verBanco').disabled = true; $('msgBanco').textContent = 'Carregando o banco…';
    google.script.run.withSuccessHandler(r => {
      $('verBanco').disabled = false;
      $('msgBanco').textContent = 'Frequência até 28/02/2026 · peso (1 a 10). Medianas: individuais ' + r.medianas.I + ', combinações ' + r.medianas.C + '.';
      $('banco').innerHTML = lista('Manutenções individuais', r.individuais) + lista('Combinações', r.combinacoes) +
        (r.soHistorico.length ? lista('Só no histórico (texto livre antigo, não sai no sorteio)', r.soHistorico) : '') +
        (r.traducoes.length ? '<h2>Traduções do histórico (texto antigo → nome oficial)</h2>' + r.traducoes.map(x =>
          '<div class="item"><span>' + esc(x.texto) + '<br><span class="comp">→ ' + esc(x.para) + '</span></span><span>' + x.n + '</span></div>').join('') : '') +
        (r.naoInterpretadas.length ? '<h2>Não interpretados (diagnóstico)</h2>' + r.naoInterpretadas.map(x =>
          '<div class="item"><span>' + esc(x.texto) + '</span><span>' + x.n + '</span></div>').join('') : '') +
        (r.log.length ? '<h2>Log</h2>' + r.log.map(x => '<div class="item"><span>' + esc(x.tipo + ': ' + x.msg) + '</span><span>' + esc(x.quando) + '</span></div>').join('') : '');
    }).withFailureHandler(e => { $('verBanco').disabled = false; $('msgBanco').textContent = e.message; }).painelBanco();
  };
  $('lerBanco').onclick = () => {
    $('lerBanco').disabled = true; $('msgBanco').textContent = 'Lendo a coluna F da planilha original…';
    google.script.run.withSuccessHandler(t => { $('lerBanco').disabled = false; $('msgBanco').textContent = t; carregar(); })
      .withFailureHandler(e => { $('lerBanco').disabled = false; $('msgBanco').textContent = e.message; }).painelAtualizarBanco();
  };
  $('trocar').onclick = () => {
    $('trocar').disabled = true; $('msgDestino').textContent = 'Conferindo a planilha…';
    google.script.run.withSuccessHandler(t => {
      $('msgDestino').textContent = t; $('destino').value = ''; $('trocar').disabled = false; carregar();
    })
      .withFailureHandler(e => { $('msgDestino').textContent = e.message; $('trocar').disabled = false; })
      .painelDestino($('destino').value);
  };
  carregar();
</script></body></html>`;
