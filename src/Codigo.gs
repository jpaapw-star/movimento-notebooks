/**
 * Transportar notebooks
 * Lê os notebooks da planilha "CONTROLE DE QUALIDADE INFORMATICA EMANX"
 * (aba TabelaQualidade) e grava uma SIMULAÇÃO numa planilha nova separada
 * ("SIMULAÇÃO - Manutenções notebooks"), uma aba por mês (ex.: "OUTUBRO 2026").
 * A planilha onde o script está instalado só é lida, nunca alterada.
 *
 * - Por mês: sorteia metade dos notebooks lançados naquele mês
 * - Nunca escolhe serial que já existe nesta planilha ou na simulação
 * - Técnico: JOÃO PEDRO
 * - Descrição: sorteada com pesos (troca de tela sai pouco)
 * - Pula linhas sem data ou sem serial, e o que não é notebook (monitor, console, controle...)
 * - Painel (menu Notebooks › Abrir painel): escolher um mês e gerar na hora,
 *   e ligar o modo automático (a cada 10 min sorteia os notebooks novos do mês atual
 *   e dos meses já gerados, sempre mantendo metade)
 * - App web: o mesmo painel em tela cheia (Implantar › Nova implantação › App da Web)
 */

const ORIGEM_ID = '1JHONHaipHAKmtkcQ_7mm8VXA-h-LBQuu-I8uzPhjgDQ';
const ORIGEM_ABA = 'TabelaQualidade';
const MANUTENCOES_ID = '10zHHWjV6Xva7ojDr7GpGRe_NuJufYZ62qhpwhMU3Hcs';
const TECNICO = 'JOÃO PEDRO';
const SIMULACAO_NOME = 'SIMULAÇÃO - Manutenções notebooks';
const SIMULACAO_CAB = ['TÉCNICO', 'MARCA', 'MODELO', 'SERIAL', 'DATA', 'DESCRIÇÃO'];

// [descrição, peso]: peso maior sai mais vezes
const DESCRICOES = [
  ['REPARO NA INTERFACE DE ÁUDIO', 10],
  ['REPARO NA INTERFACE DE VÍDEO', 10],
  ['REPARO NA INTERFACE DE REDE', 10],
  ['REPARO NA INTERFACE DE VÍDEO, REDE E ÁUDIO', 8],
  ['REPARO NA INTERFACE DE REDE E VÍDEO', 6],
  ['REPARO NA INTERFACE DE INICIALIZAÇÃO E FORMATAÇÃO DO SISTEMA', 8],
  ['FORMATAÇÃO DO SISTEMA E REPARO NA INTERFACE DE REDE', 6],
  ['FORMATAÇÃO DO SISTEMA E REPARO NA INTERFACE DE ÁUDIO', 6],
  ['REPARO NA INTERFACE DE TECLADO', 5],
  ['REPARO NA INTERFACE DE TOUCHPAD', 5],
  ['REPARO NA INTERFACE DE WIFI', 5],
  ['TROCA DE BATERIA', 4],
  ['TROCA DE MEMÓRIA RAM', 4],
  ['TROCA DE SSD', 4],
  ['TROCA DE PLACA DE REDE', 3],
  ['TROCA DE AUTOFALANTE', 3],
  ['TROCA DE TOUCH PAD', 2],
  ['TROCA DE SUB-PLACA', 2],
  ['TROCA DE TELA', 1]
];

const MESES = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO',
  'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];

const FORA = /monitor|console|controle|joystick|playstation|ps5|ps4|xbox|nintendo|switch/i;
const NB = /notebook|laptop|macbook|chromebook|ultrabook/i;
const MARCA_FORA = /^(SONY|SOMY|AOC|LG$|STARLINK|REDRAGON)/;
const MODELO_NB = /NP\d|340X|750X|740V|760V|BOOK|C4128|E1504|E1404|AG15|A315|A515|DC15|15IRH|ELITEBOOK|MACBOOK/i;
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

function planilhaManutencoes_() {
  return SpreadsheetApp.openById(MANUTENCOES_ID);
}

function props_() {
  return PropertiesService.getScriptProperties();
}

// Chamado pelo painel: lista dos meses e estado do automático
function painelDados() {
  const plano = montarPlano_([planilhaManutencoes_(), abrirSimulacao_()], []);
  const meses = Object.keys(plano.resumo)
    .sort((a, b) => plano.resumo[b].ordem - plano.resumo[a].ordem)
    .map(nome => ({ nome, total: plano.resumo[nome].total, feitos: plano.resumo[nome].feitos }));
  return { meses, auto: triggerAuto_() !== null, url: abrirSimulacao_().getUrl(),
    ultima: JSON.parse(props_().getProperty('ULTIMA_RODADA') || 'null') };
}

// Chamado pelo painel: gera um mês e passa a acompanhá-lo no automático
function painelGerar(mes) {
  const props = props_();
  const seguidos = JSON.parse(props.getProperty('MESES_AUTO') || '[]');
  if (seguidos.indexOf(mes) < 0) props.setProperty('MESES_AUTO', JSON.stringify(seguidos.concat(mes)));
  const n = gerar_([mes], false);
  if (n < 0) throw new Error('Outra rodada está em andamento. Tente de novo em 1 minuto.');
  return n ? n + ' notebooks sorteados em ' + mes + '.' : 'Nada novo em ' + mes + ': já está na metade.';
}

function painelAuto(ligar) {
  const t = triggerAuto_();
  if (ligar && !t) ScriptApp.newTrigger('automatico').timeBased().everyMinutes(10).create();
  if (!ligar && t) ScriptApp.deleteTrigger(t);
  return ligar;
}

// Roda sozinho a cada 10 min: mês atual + meses já gerados
function automatico() {
  const hoje = new Date();
  const atual = MESES[hoje.getMonth()] + ' ' + hoje.getFullYear();
  const seguidos = JSON.parse(props_().getProperty('MESES_AUTO') || '[]');
  try {
    gerar_(seguidos.indexOf(atual) < 0 ? seguidos.concat(atual) : seguidos, true);
  } catch (e) {
    // Fica registrado no painel; o erro segue para o Google avisar por e-mail
    registrarRodada_(0, e.message);
    throw e;
  }
}

// Devolve quantos foram sorteados, ou -1 se outra rodada estava em andamento.
// pularSeIgual: no automático, não refaz o trabalho se nada mudou desde a última rodada.
function gerar_(meses, pularSeIgual) {
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(30000)) return -1;
  try {
    const simulacao = abrirSimulacao_();
    const origem = lerOrigem_();
    const assinatura = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,
      JSON.stringify(origem) + '|' + meses.join(',') + '|' + simulacao.getSheets().map(a => a.getLastRow()).join(',')));
    if (pularSeIgual && props_().getProperty('ASSINATURA') === assinatura) return 0;

    const plano = montarPlano_([planilhaManutencoes_(), simulacao], meses, origem);
    let n = 0;
    Object.keys(plano.porAba).forEach(nome => {
      gravarNaAba_(abaSimulacao_(simulacao, nome), plano.porAba[nome]);
      n += plano.porAba[nome].length;
    });
    if (!n) props_().setProperty('ASSINATURA', assinatura);
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
  const props = props_();
  let id = props.getProperty('SIMULACAO_ID');
  if (!id) {
    // versão anterior guardava nas propriedades do documento
    try { id = PropertiesService.getDocumentProperties().getProperty('SIMULACAO_ID'); } catch (e) { /* app web */ }
    if (id) props.setProperty('SIMULACAO_ID', id);
  }
  if (id) {
    // Não cria outra em caso de falha passageira: isso faria sortear tudo de novo
    try { return SpreadsheetApp.openById(id); } catch (e) {
      throw new Error('Não consegui abrir a planilha da simulação. Se ela foi apagada de vez, ' +
        'restaure da lixeira do Google Drive.');
    }
  }
  const nova = SpreadsheetApp.create(SIMULACAO_NOME);
  props.setProperty('SIMULACAO_ID', nova.getId());
  return nova;
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
function montarPlano_(planilhas, meses, origem) {
  const existentes = new Set(), naSimulacao = new Set();
  planilhas.forEach((p, n) => p.getSheets().forEach(aba => {
    const col = colunas_(aba);
    if (col.serial < 0 || aba.getLastRow() < 2) return;
    aba.getRange(2, col.serial + 1, aba.getLastRow() - 1, 1).getValues()
      .forEach(l => {
        const s = normSerial_(l[0]);
        if (s) { existentes.add(s); if (n === planilhas.length - 1) naSimulacao.add(s); }
      });
  }));

  const dados = origem || lerOrigem_();
  const cab = dados[0].map(c => String(c).trim().toUpperCase());
  const iMarca = cab.indexOf('MARCA'), iModelo = cab.indexOf('MODELO'), iSerial = cab.indexOf('SERIAL'),
    iData = cab.indexOf('DATA'), iDesc = cab.indexOf('DESCRIÇÃO');

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
    itens.push({ marca: marcaFinal_(marca, desc), modelo, serial, data });
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
    // Cabeçalho apagado ou trocado à mão: recoloca o padrão na linha 1
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
    l[col.desc] = sortearDescricao_();
    return l;
  });
  aba.getRange(ultima + 1, 1, valores.length, largura).setValues(valores);
  aba.getRange(ultima + 1, col.data + 1, valores.length, 1).setNumberFormat('dd/MM/yyyy');
}

function sortearDescricao_() {
  const total = DESCRICOES.reduce((t, d) => t + d[1], 0);
  let r = Math.random() * total;
  for (const [texto, peso] of DESCRICOES) {
    if ((r -= peso) < 0) return texto;
  }
  return DESCRICOES[0][0];
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
  if (FORA.test(desc) && !NB.test(desc)) return false;
  if (NB.test(desc) || MODELO_NB.test(modelo)) return true;
  return MARCAS_NB.indexOf(m) >= 0;
}

function marcaFinal_(marca, desc) {
  const m = marca.toUpperCase();
  if (m && m !== 'MARCA DESCONHECIDA') return m;
  const achada = MARCAS_TEXTO.find(x => new RegExp('\\b' + x + '\\b', 'i').test(desc));
  return achada || m;
}

// Aceita data do Sheets, "dd/mm/aaaa" ou "aaaa-mm-dd"; recusa data impossível ou no futuro
function lerData_(v) {
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
  return d.getFullYear() >= 2024 && d <= amanha ? d : null;
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
  select, button { width:100%; box-sizing:border-box; font:inherit; border-radius:10px; padding:10px 12px; }
  select { background:var(--fundo); color:var(--texto); border:1px solid var(--linha); }
  button { margin-top:10px; border:0; background:var(--botao); color:var(--botao-txt); font-weight:600; cursor:pointer; }
  button:disabled { opacity:.4; }
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
  <div class="linha"><span>Automático</span><input type="checkbox" id="auto" disabled></div>
  <div class="suave">A cada 10 minutos sorteia os notebooks novos do mês atual e dos meses já gerados.</div>
  <div class="suave" id="ultima"></div>
  <div class="suave"><a id="link" href="#" target="_blank" hidden>Abrir planilha da simulação</a></div>
<script>
  const $ = id => document.getElementById(id);
  function carregar() {
    google.script.run.withSuccessHandler(d => {
      $('mes').innerHTML = d.meses.map(m =>
        '<option value="' + m.nome + '">' + m.nome + ' · ' + m.feitos + ' de ' + m.total + '</option>').join('');
      $('auto').checked = d.auto; $('auto').disabled = false; $('gerar').disabled = !d.meses.length;
      $('link').href = d.url; $('link').hidden = false;
      const u = d.ultima;
      $('ultima').textContent = !u ? '' : 'Última rodada: ' + u.quando + ' · ' +
        (u.erro ? 'erro: ' + u.erro : u.n + ' sorteados');
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
  carregar();
</script></body></html>`;
