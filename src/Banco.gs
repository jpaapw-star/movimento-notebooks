/**
 * Banco de descrições: manutenções individuais, combinações e pesos do sorteio.
 *
 * - Fica guardado nas propriedades do script (a planilha só tem abas de mês: nenhuma aba nova é criada).
 * - Frequência histórica: só a coluna F da planilha original (HISTORICO_ID), só linhas com data
 *   até 28/02/2026, sem os lançamentos feitos pelo app. A planilha de destino nunca é fonte de frequência.
 * - Uma vez por mês o app relê a coluna F, cadastra descrições novas (sem inventar ocorrências) e
 *   recalcula os pesos. Se a leitura falhar, o banco anterior fica como está e o mês não é marcado.
 * - Peso de 1 a 10: P = 5,5 + 4,5 × tanh(ln((F + 1) / (M + 1)) / ln(10)), com a mediana M de cada grupo.
 * - Sorteio: 70% individuais e 30% combinações (de 2 ou mais manutenções), com pesos separados.
 */

// Planilha original das manutenções (só leitura): fonte do histórico e das descrições da coluna F
const HISTORICO_ID = '10zHHWjV6Xva7ojDr7GpGRe_NuJufYZ62qhpwhMU3Hcs';
const HISTORICO_COL_DESC = 5; // coluna F (contando de 0)
const HISTORICO_ATE = new Date(2026, 1, 28); // 28/02/2026, inclusive
const PARTE_COMBINACOES = 0.3; // 30% combinações, 70% individuais
const MAX_NAO_INTERPRETADAS = 150; // textos guardados para diagnóstico (os mais frequentes)
const MAX_LOG = 40;

// Começo oficial de cada manutenção. Uma parte sem começo herda o da anterior
// ("REPARO NA INTERFACE DE VÍDEO, REDE E ÁUDIO" → VÍDEO, REDE e ÁUDIO com o mesmo começo).
const PREFIXOS = ['REPARO NA INTERFACE DE', 'FORMATAÇÃO DO SISTEMA', 'TROCA DE', 'TROCA DO', 'TROCA DA',
  'RETIRADA DE', 'REMOÇÃO DE', 'LIMPEZA DE'];
// Começos que já são a manutenção inteira (não aceitam complemento nem passam o começo adiante)
const PREFIXOS_COMPLETOS = ['FORMATAÇÃO DO SISTEMA'];
// Palavras de sintoma ou diagnóstico: o texto não é uma manutenção padronizada
const PROIBIDAS = /\b(NAO|NN|ERRO|ERROR|DEFEITO|FUNCIONA|FUNCIONANDO|PAROU|APARECE|APARECEM|RECONHECE|RECONHECEM|ESTOURADO|ESTOURA|TRAVADO|TRAVANDO|SEM|COM|PARA|POR)\b|[()\/:;?!+=]|\d/;
const MAX_PALAVRAS_COMPONENTE = 4;
const ORIGEM_OFICIAL = 'LISTA OFICIAL DO APP';

// Nomes diferentes para a mesma manutenção: contam e são escritos como um só.
// emCombinacao: forma curta usada dentro de uma combinação ("FORMATAÇÃO DO SISTEMA E REPARO NA INTERFACE DE ÁUDIO").
const SINONIMOS = [
  { nomes: ['REPARO NA INTERFACE DE INICIALIZAÇÃO', 'FORMATAÇÃO DO SISTEMA'],
    oficial: 'REPARO NA INTERFACE DE INICIALIZAÇÃO E FORMATAÇÃO DO SISTEMA', emCombinacao: 'FORMATAÇÃO DO SISTEMA' }
];
const ORIGEM_TRADUCAO = 'TRADUÇÃO DO HISTÓRICO';
const MAX_TRADUCOES = 80; // exemplos de tradução guardados para conferência no painel

// Tradução do texto livre antigo (até 28/02/2026) para os nomes oficiais, só para contar frequência.
// Cada parte do texto (separada por vírgula ou "E") precisa virar pelo menos um nome oficial; se alguma
// parte não vira, o texto não é traduzido (nada é inventado). Comparação sem acento, em maiúsculas.
// Partes que começam com TROCA (ou seguem uma TROCA sem verbo próprio) só usam as regras de troca.
// Para ensinar uma tradução nova, acrescente uma linha aqui.
const TRADUCOES = [
  { troca: true, re: /\bBATERIA\b/, nome: 'TROCA DE BATERIA' },
  { troca: true, re: /\b(MEMORIA|RAM)\b/, nome: 'TROCA DE MEMÓRIA RAM' },
  { troca: true, re: /\b(SSD|HDD?)\b/, nome: 'TROCA DE SSD' },
  { troca: true, re: /\bPLACA (DE )?(REDE|WIFI|WI-FI|WIRELESS)\b/, nome: 'TROCA DE PLACA DE REDE' },
  { troca: true, re: /\b(AUTO ?FALANTES?|ALTO ?FALANTES?|FALANTES?)\b/, nome: 'TROCA DE AUTOFALANTE' },
  { troca: true, re: /\bTOUCH ?PAD\b/, nome: 'TROCA DE TOUCH PAD' },
  { troca: true, re: /\bSUB ?-?PLACA\b/, nome: 'TROCA DE SUB-PLACA' },
  { troca: true, re: /\b(TELA|DISPLAY)\b/, nome: 'TROCA DE TELA' },
  { re: /\b(AUDIO|SOM|SON|AUTO ?FALANTES?|ALTO ?FALANTES?|FALANTES?|MIC|MICROFONES?|CHIADOS?)\b/, nome: 'REPARO NA INTERFACE DE ÁUDIO' },
  { re: /\b(REDES?|WIFI|WI-FI|WIRELESS|WIRELLES)\b/, nome: 'REPARO NA INTERFACE DE REDE' }, // WIFI é REDE
  { re: /\b(VIDEO|IMAGEM|TELA PRETA)\b/, nome: 'REPARO NA INTERFACE DE VÍDEO' },
  { re: /\b(TECLADO|TECLAS?|REMAPEAMENTO)\b/, nome: 'REPARO NA INTERFACE DE TECLADO' },
  { re: /\b(TOUCH ?PAD|TOCUH ?PAD)\b/, nome: 'REPARO NA INTERFACE DE TOUCHPAD' },
  { re: /\b(BIOS|BOOT|INICIALIZACAO|NAO LIGA|BIPS?|EFI|SHELL)\b|\b(SSD|HDD?)\b.*\bNAO (APARECE|RECONHECE|ENCONTRA)|\bNAO (APARECE|RECONHECE|ENCONTRA)\b.*\b(SSD|HDD?)\b/, nome: 'REPARO NA INTERFACE DE INICIALIZAÇÃO' },
  { re: /\b(FORMATACAO|FORMATAR|WINDOWS|LINUX|UBUNTU|UNBUNTO|SISTEMA OPERACIONAL|CORROMPIDO)\b|\bS\/O\b/, nome: 'FORMATAÇÃO DO SISTEMA' }
];

// ---------- texto ----------

// Maiúsculas, espaços e erros comuns corrigidos (usa a lista ORTOGRAFIA do painel)
function textoOficial_(t) {
  const base = String(t || '').replace(/\s+/g, ' ').trim().toUpperCase().replace(/[.\s]+$/, '');
  return base.replace(/[A-Za-zÀ-ÿ-]+/g, p => (typeof ORTOGRAFIA !== 'undefined' && ORTOGRAFIA[p]) || p)
    .replace(/FORMATAÇÃO (NO|DE) SISTEMA/g, 'FORMATAÇÃO DO SISTEMA')
    .replace(/\bINTERFACE DE (WIFI|WIRELESS)\b/g, 'INTERFACE DE REDE') // WIFI e REDE são a mesma manutenção
    .replace(/(,\s*|\sE\s)(WIFI|WIRELESS)\b/g, '$1REDE');
}

// Lê uma descrição e devolve seus componentes, ou null se não der para interpretar com segurança.
// Cada componente: { chave (sem acento, para comparar), texto (forma oficial) }
function interpretarDescricao_(descricao) {
  const t = textoOficial_(descricao);
  if (!t) return null;
  // "E" só separa quando é palavra solta; vírgula sempre separa
  const partes = t.split(/\s*,\s*|\s+E\s+/);
  const comps = [];
  let prefixoAnterior = null;
  for (const bruta of partes) {
    const parte = bruta.trim();
    if (!parte) return null;
    let prefixo = PREFIXOS.find(p => {
      const sp = semAcento_(p), sa = semAcento_(parte);
      return sa === sp || sa.indexOf(sp + ' ') === 0;
    });
    let resto;
    if (prefixo) {
      resto = parte.slice(prefixo.length).trim();
    } else if (prefixoAnterior && PREFIXOS_COMPLETOS.indexOf(prefixoAnterior) < 0) {
      prefixo = prefixoAnterior;
      resto = parte;
    } else {
      return null;
    }
    const completo = PREFIXOS_COMPLETOS.indexOf(prefixo) >= 0;
    if (completo ? resto : !resto) return null;
    if (resto && (resto.split(' ').length > MAX_PALAVRAS_COMPONENTE || PROIBIDAS.test(semAcento_(resto)))) return null;
    const c = componente_(resto ? prefixo + ' ' + resto : prefixo);
    if (!comps.some(x => x.chave === c.chave)) comps.push(c);
    prefixoAnterior = prefixo;
  }
  return comps.length ? comps : null;
}

// Um componente { chave, texto } já com os sinônimos trocados pelo nome oficial
function componente_(texto) {
  const k = semAcento_(texto);
  const s = SINONIMOS.find(x => x.nomes.concat(x.oficial).some(n => semAcento_(n) === k));
  return s ? { chave: semAcento_(s.oficial), texto: s.oficial } : { chave: k, texto };
}

// Devolve os nomes oficiais de um texto livre antigo, ou null se alguma parte não tiver tradução
function traduzirDescricao_(descricao) {
  const t = semAcento_(textoOficial_(descricao));
  if (!t) return null;
  const nomes = [];
  let troca = false;
  for (const parte of t.split(/\s*,\s*|\s+E\s+/)) {
    if (!parte) return null;
    if (/^TROCA\b/.test(parte)) troca = true;
    else if (/^(REPARO|RETIRADA|REMOCAO|FORMATACAO|AJUSTE|LIMPEZA|INSTALACAO)\b/.test(parte)) troca = false;
    const achados = TRADUCOES.filter(r => !!r.troca === troca && r.re.test(parte)).map(r => r.nome);
    if (!achados.length) return null;
    achados.forEach(n => { const o = componente_(n).texto; if (nomes.indexOf(o) < 0) nomes.push(o); });
  }
  return nomes.length ? nomes : null;
}

function idCombinacao_(chaves) {
  return 'C:' + chaves.slice().sort().join(' + ');
}

// Frase com os nomes oficiais: mesmo começo junta ("REPARO NA INTERFACE DE ÁUDIO, VÍDEO E REDE")
function escreverCombinacao_(textos) {
  const grupos = [];
  textos.map(t => { const s = SINONIMOS.find(x => x.oficial === t); return s ? s.emCombinacao : t; }).forEach(texto => {
    const prefixo = PREFIXOS.find(p => texto === p || texto.indexOf(p + ' ') === 0);
    const resto = prefixo && PREFIXOS_COMPLETOS.indexOf(prefixo) < 0 ? texto.slice(prefixo.length).trim() : '';
    const g = resto && grupos.find(x => x.prefixo === prefixo);
    if (g) g.restos.push(resto);
    else grupos.push(resto ? { prefixo, restos: [resto] } : { prefixo: null, restos: [texto] });
  });
  // Só o primeiro de cada grupo leva o começo; vírgulas entre os itens e "E" antes do último
  const partes = [].concat(...grupos.map(g => g.restos.map((r, i) => g.prefixo && !i ? g.prefixo + ' ' + r : r)));
  return partes.length < 2 ? partes[0] : partes.slice(0, -1).join(', ') + ' E ' + partes[partes.length - 1];
}

// ---------- pesos ----------

function mediana_(numeros) {
  if (!numeros.length) return 0;
  const v = numeros.slice().sort((a, b) => a - b), m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// P = 5,5 + 4,5 × tanh(ln((F + 1) / (M + 1)) / ln(10)), entre 1 e 10, nunca zero
function calcularPeso_(f, m) {
  const p = 5.5 + 4.5 * Math.tanh(Math.log((f + 1) / (m + 1)) / Math.LN10);
  return Math.min(10, Math.max(1, p));
}

// Recalcula medianas e pesos de cada grupo, sem misturar individuais e combinações.
// A mediana é do grupo que pode sair no sorteio; os outros recebem peso só para consulta.
function recalcularPesos_(banco) {
  const itens = Object.keys(banco.itens).map(id => banco.itens[id]);
  banco.medianas = {};
  ['I', 'C'].forEach(tipo => {
    const grupo = itens.filter(it => it.tipo === tipo);
    const sorteaveis = grupo.filter(it => it.sorteavel !== false);
    const m = mediana_((sorteaveis.length ? sorteaveis : grupo).map(it => it.freq));
    banco.medianas[tipo] = m;
    grupo.forEach(it => { it.peso = calcularPeso_(it.freq, m); });
  });
  banco.pesosEm = agora_();
}

// ---------- banco ----------

function agora_() {
  return Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');
}

function bancoVazio_() {
  return { versao: 1, itens: {}, naoInterpretadas: {}, medianas: { I: 0, C: 0 }, pesosEm: '', leitura: null };
}

// Cadastra (se ainda não existe) e devolve o item. Nunca apaga nem renomeia cadastro antigo.
function cadastrar_(banco, comps, origem, novos) {
  const quando = agora_();
  const individual = c => {
    const id = 'I:' + c.chave;
    if (!banco.itens[id]) {
      banco.itens[id] = { id, tipo: 'I', desc: c.texto, freq: 0, peso: 1, sorteavel: origem === ORIGEM_OFICIAL || origem === ORIGEM_TRADUCAO, descoberto: quando, origem, atualizado: quando };
      if (novos) novos.push(c.texto);
    }
    return banco.itens[id];
  };
  if (comps.length === 1) return individual(comps[0]);
  const partes = comps.map(individual);
  const id = idCombinacao_(partes.map(p => p.id.slice(2)));
  if (!banco.itens[id]) {
    const desc = escreverCombinacao_(partes.map(p => p.desc));
    banco.itens[id] = { id, tipo: 'C', desc, comp: partes.map(p => p.id), freq: 0, peso: 1, sorteavel: origem === ORIGEM_OFICIAL || origem === ORIGEM_TRADUCAO, descoberto: quando, origem, atualizado: quando };
    if (novos) novos.push(desc);
  }
  return banco.itens[id];
}

// Lista oficial inicial (as descrições que o app já usava)
function semearBanco_(banco) {
  DESCRICOES.forEach(d => {
    const comps = interpretarDescricao_(d);
    if (comps) cadastrar_(banco, comps, ORIGEM_OFICIAL);
  });
  // Destinos das traduções também são nomes oficiais
  TRADUCOES.forEach(r => cadastrar_(banco, interpretarDescricao_(r.nome), ORIGEM_OFICIAL));
}

function lerBanco_() {
  const b = lerGrande_('BANCO');
  return b && b.itens ? b : null;
}

// Banco pronto para sortear: o guardado, ou a lista oficial com pesos iguais se nunca foi lido
function bancoParaSortear_() {
  const salvo = lerBanco_();
  if (salvo && Object.keys(salvo.itens).length) return salvo;
  const b = bancoVazio_();
  semearBanco_(b);
  recalcularPesos_(b);
  return b;
}

function mesDeLeitura_() {
  return Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM');
}

// Lê a coluna F da planilha original (só leitura). Devolve as linhas aceitas ou lança erro.
function lerHistorico_() {
  let planilha;
  try {
    planilha = SpreadsheetApp.openById(HISTORICO_ID);
  } catch (e) {
    throw new Error('Não consegui abrir a planilha original das manutenções. Confira se você ainda tem acesso a ela.');
  }
  const doApp = new Set(lerGrande_('APP_SERIAIS') || []);
  const tecnico = semAcento_(TECNICO);
  const vistos = new Set(), linhas = [];
  let foraDoApp = 0;
  planilha.getSheets().forEach(aba => {
    if (aba.getLastRow() < 2 || aba.getLastColumn() <= HISTORICO_COL_DESC) return;
    const col = colunas_(aba);
    const iData = col.data >= 0 ? col.data : 4;
    aba.getRange(2, 1, aba.getLastRow() - 1, aba.getLastColumn()).getValues().forEach(l => {
      const desc = String(l[HISTORICO_COL_DESC] || '').trim();
      if (!desc) return;
      const marca = col.marca >= 0 ? String(l[col.marca] || '').trim() : '';
      const modelo = col.modelo >= 0 ? String(l[col.modelo] || '').trim() : '';
      if (!ehNotebook_(marca, modelo, desc)) return;
      const serial = col.serial >= 0 ? normSerial_(l[col.serial]) : '';
      // Lançamento feito pelo app (serial gravado pelo app com o técnico do app): não conta
      if (serial && doApp.has(serial) && col.tecnico >= 0 && semAcento_(l[col.tecnico]) === tecnico) { foraDoApp++; return; }
      const data = lerData_(l[iData], true);
      // Mesma linha repetida em outra aba (ex.: PRODUÇÃO 2026 e FEVEREIRO 2026) conta uma vez
      const chave = serial + '|' + (data ? data.getTime() : '') + '|' + semAcento_(desc);
      if (serial && vistos.has(chave)) return;
      vistos.add(chave);
      linhas.push({ desc, aba: aba.getName(), historica: !!data && data <= HISTORICO_ATE, recente: !!data && data > HISTORICO_ATE });
    });
  });
  return { linhas, foraDoApp };
}

// Monta o banco novo a partir do antigo e das linhas lidas. Não apaga nada do antigo.
function montarBanco_(antigo, linhas) {
  const banco = antigo ? JSON.parse(JSON.stringify(antigo)) : bancoVazio_();
  semearBanco_(banco); // não duplica: só cadastra o que falta da lista oficial
  const novos = [], freq = {}, nao = {}, recentes = new Set(), traduzidas = {}, porTraducao = {};
  const oficial = c => { const it = banco.itens['I:' + c.chave]; return !!it && it.origem === ORIGEM_OFICIAL; };
  linhas.forEach(l => {
    const comps = interpretarDescricao_(l.desc);
    let item = null;
    if (comps && comps.every(oficial)) {
      item = cadastrar_(banco, comps, 'COLUNA F · ' + l.aba, novos); // já está em nomes oficiais
    } else if (l.historica) {
      // Texto livre antigo: traduz para os nomes oficiais só para contar a frequência
      const nomes = traduzirDescricao_(l.desc);
      if (nomes) {
        item = cadastrar_(banco, nomes.map(componente_), ORIGEM_TRADUCAO, novos);
        const k = semAcento_(l.desc);
        traduzidas[k] = traduzidas[k] || { texto: textoOficial_(l.desc), para: item.desc, n: 0 };
        traduzidas[k].n++;
        porTraducao[item.id] = (porTraducao[item.id] || 0) + 1;
      }
    }
    // Nome no padrão que ainda não é da lista: cadastra como está (sai no sorteio se usado depois de 28/02/2026)
    if (!item && comps) item = cadastrar_(banco, comps, 'COLUNA F · ' + l.aba, novos);
    if (!item) {
      const k = semAcento_(l.desc);
      nao[k] = nao[k] || { texto: textoOficial_(l.desc), n: 0, aba: l.aba };
      if (l.historica) nao[k].n++;
      return;
    }
    if (l.historica) freq[item.id] = (freq[item.id] || 0) + 1;
    if (l.recente) recentes.add(item.id);
  });
  const quando = agora_();
  Object.keys(banco.itens).forEach(id => {
    const it = banco.itens[id], f = freq[id] || 0;
    if (it.freq !== f) { it.freq = f; it.atualizado = quando; }
    it.freqTraduzida = porTraducao[id] || 0; // quanto da frequência veio de texto livre traduzido
    // Só sai no sorteio o que é nome oficial: a lista do app ou o que já foi usado depois de 28/02/2026,
    // quando as descrições passaram a ser padronizadas. Texto livre antigo fica só no histórico.
    const pode = it.origem === ORIGEM_OFICIAL || it.origem === ORIGEM_TRADUCAO || recentes.has(id) || it.sorteavel === true;
    if (it.sorteavel !== pode) { it.sorteavel = pode; it.atualizado = quando; }
  });
  banco.traducoes = Object.keys(traduzidas).sort((a, b) => traduzidas[b].n - traduzidas[a].n).slice(0, MAX_TRADUCOES)
    .map(k => traduzidas[k]);
  banco.naoInterpretadas = {};
  Object.keys(nao).sort((a, b) => nao[b].n - nao[a].n).slice(0, MAX_NAO_INTERPRETADAS)
    .forEach(k => { banco.naoInterpretadas[k] = nao[k]; });
  recalcularPesos_(banco);
  return { banco, novos };
}

// Lê a coluna F e grava o banco. Sem trava: quem chama segura a trava do script.
// forcar: lê mesmo que o mês já esteja concluído.
function atualizarBancoSemTrava_(forcar) {
  const mes = mesDeLeitura_();
  const antigo = lerBanco_();
  if (!forcar && antigo && antigo.leitura && antigo.leitura.mes === mes) return { feito: false, banco: antigo };
  let lido;
  try {
    lido = lerHistorico_();
  } catch (e) {
    // Mês não fica concluído: tenta de novo na próxima rodada. Banco anterior continua igual.
    registrarLog_('ERRO', 'Leitura da coluna F falhou: ' + e.message);
    throw e;
  }
  const r = montarBanco_(antigo, lido.linhas);
  const historicas = lido.linhas.filter(l => l.historica).length;
  r.banco.leitura = { mes, quando: agora_(), linhas: lido.linhas.length, historicas, foraDoApp: lido.foraDoApp, novos: r.novos.length };
  gravarGrande_('BANCO', r.banco);
  registrarLog_('BANCO', 'Coluna F lida: ' + lido.linhas.length + ' linhas (' + historicas + ' até 28/02/2026), ' +
    r.novos.length + ' cadastro(s) novo(s)' + (r.novos.length ? ': ' + r.novos.slice(0, 5).join('; ') : '') + '.');
  return { feito: true, banco: r.banco };
}

// ---------- sorteio ----------

function sortearPorPeso_(itens) {
  const total = itens.reduce((t, it) => t + it.peso, 0);
  let r = Math.random() * total;
  for (const it of itens) {
    if ((r -= it.peso) < 0) return it;
  }
  return itens[itens.length - 1];
}

// Decide quantos de cada tipo: 30% combinações (arredondado), o resto individuais; soma sempre n
function divisaoDoSorteio_(n) {
  const comb = Math.round(n * PARTE_COMBINACOES);
  return { comb, ind: n - comb };
}

// Manutenções que não existem para uma marca (comparação sem acento, vale também dentro de combinações).
// Para acrescentar outra regra, copie a linha e troque a marca e a manutenção.
const PROIBIDAS_POR_MARCA = [
  { marca: /^POSITIVO\b/, manutencao: /\bTROCA D[EOA] TECLADO\b/ } // Positivo não tem troca de teclado
];

function permitidaPara_(item, marca, banco) {
  const m = semAcento_(marca);
  const regras = PROIBIDAS_POR_MARCA.filter(r => r.marca.test(m));
  if (!regras.length) return true;
  const textos = [item.desc].concat((item.comp || []).map(c => banco.itens[c] ? banco.itens[c].desc : ''));
  return !regras.some(r => textos.some(t => r.manutencao.test(semAcento_(t))));
}

// Dá uma descrição a cada notebook: primeiro o tipo (70/30), depois o item pelo peso do tipo
function atribuirDescricoes_(notebooks, banco) {
  const todos = Object.keys(banco.itens).map(id => banco.itens[id]).filter(it => it.sorteavel !== false);
  const ind = todos.filter(it => it.tipo === 'I'), comb = todos.filter(it => it.tipo === 'C');
  const n = notebooks.length;
  if (!n) return { ind: 0, comb: 0 };
  let { comb: nComb, ind: nInd } = divisaoDoSorteio_(n);
  if (nComb && !comb.length) {
    registrarLog_('AVISO', 'Sem combinações cadastradas: ' + nComb + ' notebook(s) receberam manutenção individual.');
    nInd += nComb; nComb = 0;
  }
  if (!ind.length && nInd) {
    if (!comb.length) throw new Error('O banco de descrições está vazio.');
    registrarLog_('AVISO', 'Sem manutenções individuais cadastradas: ' + nInd + ' notebook(s) receberam combinação.');
    nComb += nInd; nInd = 0;
  }
  const tipos = new Array(nComb).fill('C').concat(new Array(nInd).fill('I'));
  embaralhar_(tipos);
  let feitosI = 0, feitosC = 0;
  notebooks.forEach((nb, i) => {
    const ok = it => permitidaPara_(it, nb.marca, banco);
    let lista = (tipos[i] === 'C' ? comb : ind).filter(ok);
    if (!lista.length) lista = ind.concat(comb).filter(ok); // nada permitido no tipo sorteado: usa o outro
    if (!lista.length) throw new Error('Nenhuma manutenção permitida para a marca ' + nb.marca + '.');
    const it = sortearPorPeso_(lista);
    nb.desc = it.desc;
    if (it.tipo === 'C') feitosC++; else feitosI++;
  });
  return { ind: feitosI, comb: feitosC };
}

// Seriais gravados pelo app (para nunca entrarem no histórico)
function anotarSeriaisDoApp_(seriais) {
  if (!seriais.length) return;
  const set = new Set(lerGrande_('APP_SERIAIS') || []);
  seriais.forEach(s => { const n = normSerial_(s); if (n) set.add(n); });
  gravarGrande_('APP_SERIAIS', Array.from(set));
}

// ---------- log ----------

function registrarLog_(tipo, msg) {
  try {
    const log = lerGrande_('LOG') || [];
    log.unshift({ quando: agora_(), tipo, msg: String(msg).slice(0, 300) });
    gravarGrande_('LOG', log.slice(0, MAX_LOG));
  } catch (e) { /* log nunca derruba a rodada */ }
}

// ---------- painel ----------

function resumoBanco_() {
  const b = lerBanco_();
  if (!b) return null;
  const itens = Object.keys(b.itens).map(id => b.itens[id]);
  const s = itens.filter(i => i.sorteavel !== false);
  return { individuais: s.filter(i => i.tipo === 'I').length, combinacoes: s.filter(i => i.tipo === 'C').length,
    soHistorico: itens.length - s.length,
    leitura: b.leitura ? b.leitura.quando : '', pesosEm: b.pesosEm, naoInterpretadas: Object.keys(b.naoInterpretadas || {}).length };
}

// Chamado pelo painel: o banco inteiro para consulta
function painelBanco() {
  const b = bancoParaSortear_();
  const todos = Object.keys(b.itens).map(id => b.itens[id]);
  const itens = todos.filter(i => i.sorteavel !== false);
  const linha = it => ({ desc: it.desc, freq: it.freq, peso: it.peso.toFixed(2), descoberto: it.descoberto, origem: it.origem,
    comp: (it.comp || []).map(c => b.itens[c] ? b.itens[c].desc : c) });
  const ordem = (x, y) => y.peso - x.peso || x.desc.localeCompare(y.desc);
  return {
    individuais: itens.filter(i => i.tipo === 'I').sort(ordem).map(linha),
    combinacoes: itens.filter(i => i.tipo === 'C').sort(ordem).map(linha),
    soHistorico: todos.filter(i => i.sorteavel === false).sort(ordem).slice(0, 60).map(linha),
    medianas: b.medianas, pesosEm: b.pesosEm, leitura: b.leitura,
    naoInterpretadas: Object.keys(b.naoInterpretadas || {}).map(k => b.naoInterpretadas[k]).slice(0, 30),
    traducoes: (b.traducoes || []).slice(0, 40),
    log: (lerGrande_('LOG') || []).slice(0, 10)
  };
}

// Chamado pelo painel: relê a coluna F agora, mesmo que o mês já esteja feito
function painelAtualizarBanco() {
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(30000)) throw new Error('Outra rodada está em andamento. Tente de novo em 1 minuto.');
  try {
    const r = atualizarBancoSemTrava_(true);
    const l = r.banco.leitura;
    return 'Banco atualizado: ' + l.linhas + ' linhas lidas, ' + l.novos + ' cadastro(s) novo(s).';
  } finally {
    trava.releaseLock();
  }
}
