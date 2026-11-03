/**
 * Integrações com a Memória Global (porta pela internet), usadas pela cópia de teste:
 * - padroniza marca e modelo dos notebooks sorteados (pelo EAN)
 * - confere cada serial da qualidade com o que o SCAN já leu (resultado no painel, sem criar aba)
 * Sem a chave (segredo MG_CHAVE), tudo isso fica desligado e o resto funciona igual.
 */

const MG_URL = 'https://script.google.com/macros/s/AKfycbzL7PBVhj04P720XeUq3bvamGtrKZpDmtzvimc6kH1H7LpBf7s1SU6Bq7Q957Nvf4BXTg/exec';
// Aba que versões antigas criavam: é apagada se estiver vazia (o app só usa abas de mês)
const ABA_SCAN = 'CONFERÊNCIA SCAN';
const SCAN_PEDACO = 8000; // tamanho de cada pedaço guardado nas propriedades do script
const SCAN_POR_RODADA = 120;
const MG_POR_VEZ = 10; // consultas em paralelo (mais que isso a porta recusa por excesso)

// Nomes de fábrica que aparecem de vários jeitos
const MARCAS_IGUAIS = {
  'ASUSTEK COMPUTER INC.': 'ASUS', 'ASUSTEK': 'ASUS', 'ASU': 'ASUS', 'DELL INC.': 'DELL',
  'ACERE': 'ACER', 'POSITIVO INFORMÁTICA': 'POSITIVO', 'POSITIVO VAIO': 'VAIO',
  'LENOVO GROUP': 'LENOVO', 'SAMSUNG ELECTRONICS': 'SAMSUNG', 'SOMY': 'SONY'
};

function chaveMG_() {
  return (typeof SEGREDOS !== 'undefined' && SEGREDOS.mgChave) || '';
}

// Uma consulta por notebook (EAN + SERIAL), em paralelo e com cache de 6 h.
// Devolve { serial: { porEan: candidato|null, porSerial: candidato|null } }
function consultarMG_(itens) {
  const chave = chaveMG_();
  const cache = CacheService.getScriptCache();
  const res = {}, faltam = [];
  itens.forEach(it => {
    const s = normSerial_(it.serial);
    if (!s || res[s]) return;
    const c = cache.get('mg:' + s);
    if (c) res[s] = JSON.parse(c); else { res[s] = null; faltam.push(it); }
  });
  if (!chave || !faltam.length) return res;
  let erro = '';
  for (let i = 0; i < faltam.length; i += MG_POR_VEZ) {
    const lote = faltam.slice(i, i + MG_POR_VEZ);
    let respostas;
    try {
      respostas = UrlFetchApp.fetchAll(lote.map(it => ({
        url: MG_URL, method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        payload: JSON.stringify({ acao: 'consultar', chave, pedido: {
          tipo_leitura: 'produto',
          identificadores: [/^\d{8,14}$/.test(it.ean) ? { tipo: 'EAN', valor: it.ean } : null,
            { tipo: 'SERIAL', valor: it.serial }].filter(Boolean) } })
      })));
    } catch (e) {
      erro = 'fora do ar'; // memória fora do ar: segue sem ela
      break;
    }
    respostas.forEach((r, j) => {
      let corpo = null;
      try { corpo = JSON.parse(r.getContentText()); } catch (e) { /* resposta inválida */ }
      if (!corpo || corpo.ok === false || !Array.isArray(corpo.candidatos)) {
        erro = corpo && corpo.erro ? corpo.erro.codigo + ': ' + corpo.erro.mensagem : 'resposta inválida (HTTP ' + r.getResponseCode() + ')';
        return;
      }
      const achar = tipo => corpo.candidatos.find(c => c.encontrado_por === tipo) || null;
      const resumo = c => c && {
        id: c.item_id, aceita: !!c.pode_aceitar_sozinho,
        marca: c.campos && c.campos.marca ? c.campos.marca.valor : '',
        modelo: c.campos && c.campos.modelo ? c.campos.modelo.valor : ''
      };
      const s = normSerial_(lote[j].serial);
      res[s] = { porEan: resumo(achar('EAN')), porSerial: resumo(achar('SERIAL')) };
      cache.put('mg:' + s, JSON.stringify(res[s]), 21600);
    });
  }
  // Fica no painel para dar para saber por que a memória não respondeu
  if (erro) props_().setProperty('ERRO_MG', erro); else props_().deleteProperty('ERRO_MG');
  return res;
}

// Marca padronizada sempre; marca e modelo da Memória Global quando ela tem certeza pelo EAN
function padronizarMarcaModelo_(itens) {
  if (!itens.length) return;
  const mg = consultarMG_(itens);
  itens.forEach(it => {
    const m = String(it.marca || '').trim().toUpperCase();
    it.marca = MARCAS_IGUAIS[m] || m;
    const p = mg[normSerial_(it.serial)];
    if (p && p.porEan && p.porEan.aceita) {
      if (p.porEan.marca) it.marca = MARCAS_IGUAIS[p.porEan.marca.toUpperCase()] || p.porEan.marca.toUpperCase();
      if (p.porEan.modelo) it.modelo = p.porEan.modelo;
    }
  });
}

// Situação de cada serial: { serial: [situação, conferido em (ms), descrição] }, guardada em pedaços
function lerScan_() {
  const props = props_(), n = Number(props.getProperty('SCAN_N') || 0);
  let texto = '';
  for (let i = 0; i < n; i++) texto += props.getProperty('SCAN_' + i) || '';
  try { return texto ? JSON.parse(texto) : {}; } catch (e) { return {}; }
}

function gravarScan_(mapa) {
  const props = props_(), texto = JSON.stringify(mapa), antes = Number(props.getProperty('SCAN_N') || 0);
  const pedacos = {};
  let n = 0;
  for (let i = 0; i < texto.length; i += SCAN_PEDACO) pedacos['SCAN_' + n++] = texto.slice(i, i + SCAN_PEDACO);
  pedacos.SCAN_N = String(n);
  props.setProperties(pedacos);
  for (let i = n; i < antes; i++) props.deleteProperty('SCAN_' + i);
}

// Confere os seriais dos meses acompanhados com o que o SCAN já leu.
// Cada serial é conferido uma vez; "não passou pelo SCAN" é conferido de novo depois de 1 dia.
function conferirScan_(meses) {
  if (!chaveMG_()) return;
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(30000)) return;
  try {
    const teste = abrirSimulacao_();
    const velha = teste.getSheetByName(ABA_SCAN);
    if (velha && velha.getLastRow() <= 1) teste.deleteSheet(velha);
    const plano = montarPlano_(teste, []);
    const todos = [].concat(...meses.map(m => (plano.listaMes || {})[m] || []));
    const mapa = lerScan_();
    const umDia = Date.now() - 864e5;
    const pendentes = todos.filter(it => {
      const v = mapa[normSerial_(it.serial)];
      return !v || (v[0] === 'FORA' && v[1] < umDia);
    }).slice(0, SCAN_POR_RODADA);
    if (pendentes.length) {
      const mg = consultarMG_(pendentes);
      let mudou = false;
      pendentes.forEach(it => {
        const p = mg[normSerial_(it.serial)];
        if (!p) return; // memória não respondeu: tenta na próxima rodada
        let v;
        if (!p.porSerial) v = ['FORA', Date.now()];
        else if (p.porEan && p.porEan.id !== p.porSerial.id) {
          v = ['CONFERIR', Date.now(), [p.porSerial.marca, p.porSerial.modelo].filter(Boolean).join(' ')];
        } else v = ['OK', Date.now()];
        mapa[normSerial_(it.serial)] = v;
        mudou = true;
      });
      if (mudou) gravarScan_(mapa);
    }
    const valores = Object.keys(mapa).map(s => [s, mapa[s]]);
    const conta = t => valores.filter(x => x[1][0] === t).length;
    const lista = valores.filter(x => x[1][0] === 'CONFERIR').slice(0, 10)
      .map(x => x[0] + (x[1][2] ? ' (SCAN leu como ' + x[1][2] + ')' : ''));
    props_().setProperty('RESUMO_SCAN', JSON.stringify({ ok: conta('OK'), conferir: conta('CONFERIR'), fora: conta('FORA'), lista }));
  } finally {
    trava.releaseLock();
  }
}
