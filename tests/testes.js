// Testes do app de Notebooks: node tests/testes.js
// Usa o simulador (planilhas em memória). A planilha de qualidade e a original ficam "só leitura":
// qualquer escrita nelas faz o teste falhar.
'use strict';
process.env.TZ = 'America/Sao_Paulo';
const assert = require('assert');
const { criarAmbiente } = require('./simulador');
// Compara valores vindos do simulador (outro "mundo" do JavaScript) pelo conteúdo
const igual = (a, b, msg) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b, msg);

const ORIGEM_ID = '1JHONHaipHAKmtkcQ_7mm8VXA-h-LBQuu-I8uzPhjgDQ';
const TESTE_ID = '1yofc6A_iIdjozQZGpeIpoh9hlP9ZKUyJmFO9d-Bdg70';
const HISTORICO_ID = '10zHHWjV6Xva7ojDr7GpGRe_NuJufYZ62qhpwhMU3Hcs';
const CAB_DESTINO = ['TÉCNICO', 'MARCA', 'MODELO', 'SERIAL', 'DATA', 'DESCRIÇÃO'];
const CAB_HIST = ['TÉCNICO', 'MARCA', 'MODELO', 'SÉRIE', 'DATA', 'DESCRIÇÃO', 'ESTADO'];

let ok = 0, falhas = 0;
function teste(nome, fn) {
  try { fn(); ok++; console.log('ok   ' + nome); }
  catch (e) { falhas++; console.log('FALHOU ' + nome + '\n     ' + (e.stack || e).split('\n').slice(0, 3).join('\n     ')); }
}

// Cenário padrão: qualidade com notebooks em outubro e novembro, histórico com descrições, destino vazio
function cenario(op) {
  op = op || {};
  const amb = criarAmbiente();
  const d = amb.data;
  const qualidade = [['MARCA', 'MODELO', 'SERIAL', 'EAN', 'DATA', 'NOTA FINAL', 'DESCRIÇÃO']];
  for (let i = 0; i < (op.out || 10); i++) qualidade.push(['ACER', 'A315-510P', 'OUT' + (1000 + i), '', d(2026, 10, 1 + i), '', 'NOTEBOOK ACER']);
  for (let i = 0; i < (op.nov || 20); i++) qualidade.push(['DELL', 'INSPIRON', 'NOV' + (1000 + i), '', d(2026, 11, 1 + (i % 3)), '', 'NOTEBOOK DELL']);
  amb.novaPlanilha(ORIGEM_ID, 'QUALIDADE', 'outro@gmail.com', { TabelaQualidade: qualidade }, true);
  const hist = op.historico ? op.historico(d) : [
    ['BRUNO', 'ACER', 'A315', 'H001', d(2026, 1, 5), 'TROCA DE BATERIA'],
    ['BRUNO', 'ACER', 'A315', 'H002', d(2026, 1, 6), 'TROCA DE BATERIA'],
    ['BRUNO', 'ACER', 'A315', 'H003', d(2026, 1, 7), 'TROCA DE BATERIA'],
    ['BRUNO', 'ACER', 'A315', 'H004', d(2026, 2, 7), 'REPARO NA INTERFACE DE VÍDEO E TROCA DE BATERIA'],
    ['BRUNO', 'ACER', 'A315', 'H005', d(2026, 2, 8), 'REPARO NA INTERFACE DE VIDEO, REDE E AUDIO'],
    ['BRUNO', 'ACER', 'A315', 'H006', d(2026, 2, 9), 'REPARO WIFI NÃO FUNCIONA'],
    ['BRUNO', 'ACER', 'A315', 'H007', d(2026, 3, 9), 'TROCA DE BATERIA'],
    ['BRUNO', 'ACER', 'A315', 'H008', d(2026, 4, 9), 'TROCA DE MÓDULO DA CÂMERA']
  ];
  amb.novaPlanilha(HISTORICO_ID, 'MANUTENÇÕES INFORMATICA GERAL', 'emanxti@gmail.com',
    { 'PRODUÇÃO 2026': [CAB_HIST].concat(hist) }, !op.historicoGravavel);
  amb.novaPlanilha(TESTE_ID, 'Cópia de TESTE', 'jpaapw@gmail.com', op.destino ? op.destino(d) : { 'OUTUBRO 2026': [CAB_DESTINO] });
  return amb;
}

const banco = amb => amb.rodar('lerBanco_()');
const item = (amb, id) => banco(amb).itens[id];

// ---------- correções 1, 2 e 3 ----------

teste('Correção 1: "controle de brilho" não tira um notebook Dell', () => {
  const amb = cenario();
  assert.strictEqual(amb.rodar(`ehNotebook_('DELL', 'INSPIRON', 'CONTROLE DE BRILHO NAO FUNCIONA')`), true);
  assert.strictEqual(amb.rodar(`ehNotebook_('DELL', 'INSPIRON', 'SWITCH DE ENERGIA COM DEFEITO')`), true);
  assert.strictEqual(amb.rodar(`ehNotebook_('SONY', 'CUH-2215A', 'CONTROLE DE VIDEO GAME')`), false);
  assert.strictEqual(amb.rodar(`ehNotebook_('NINTENDO', 'HAC-001', '')`), false);
});

teste('Correção 1: LG Gram e Sony Vaio entram; LG e Sony sem sinal de notebook ficam fora', () => {
  const amb = cenario();
  assert.strictEqual(amb.rodar(`ehNotebook_('LG', '15Z90', 'NOTEBOOK LG GRAM')`), true);
  assert.strictEqual(amb.rodar(`ehNotebook_('LG', '17Z90Q GRAM', '')`), true);
  assert.strictEqual(amb.rodar(`ehNotebook_('SONY', 'VPCEH', 'NOTEBOOK SONY VAIO')`), true);
  assert.strictEqual(amb.rodar(`ehNotebook_('LG', '24MK430H', 'MONITOR LG')`), false);
  assert.strictEqual(amb.rodar(`ehNotebook_('SONY', 'CUH-2215A', '')`), false);
});

teste('Correção 2: impressora HP fica fora; notebook HP entra', () => {
  const amb = cenario();
  assert.strictEqual(amb.rodar(`ehNotebook_('HP', 'DESKJET 2774', '')`), false);
  assert.strictEqual(amb.rodar(`ehNotebook_('HP', '', 'IMPRESSORA HP')`), false);
  assert.strictEqual(amb.rodar(`ehNotebook_('HP', '250 G9', '')`), true);
  assert.strictEqual(amb.rodar(`ehNotebook_('HP', 'ELITEBOOK 840', 'TROCA DE TECLADO')`), true);
});

teste('Correção 3: Formatação e Ortografia mantêm as fórmulas da aba', () => {
  const amb = cenario({ destino: () => ({ 'OUTUBRO 2026': [CAB_DESTINO.concat(['TOTAL']),
    ['JOÃO PEDRO', 'acer', 'A315', 'S0001', '01/10/2026', 'REPARO NA INTERFACE DE AUDIO', ''],
    ['JOÃO PEDRO', 'dell', 'X', 'S0002', '02/10/2026', 'TROCA DE BATERRIA', '']] }) });
  const aba = amb.planilhas[TESTE_ID].getSheetByName('OUTUBRO 2026');
  aba.getRange(2, 7, 1, 1).setValues([['=COUNTA(A2:A3)']]);
  aba.getRange(3, 6, 1, 1).setValues([['=F2']]);
  amb.rodar(`painelFormatar('OUTUBRO 2026')`);
  amb.rodar(`painelOrtografia('OUTUBRO 2026')`);
  assert.strictEqual(aba.formulas['2,7'], '=COUNTA(A2:A3)');
  assert.strictEqual(aba.formulas['3,6'], '=F2');
  assert.strictEqual(aba.dados[1][1], 'ACER'); // formatação continua funcionando
  assert.strictEqual(aba.dados[1][5], 'REPARO NA INTERFACE DE ÁUDIO'); // ortografia continua funcionando
});

// ---------- testes obrigatórios do mandato ----------

teste('1. Sorteio individual: peso maior sai mais que peso menor, na proporção dos pesos', () => {
  const amb = cenario();
  const r = amb.rodar(`(() => {
    const itens = [{ desc: 'A', peso: calcularPeso_(100, 1) }, { desc: 'B', peso: calcularPeso_(0, 1) }];
    const c = { A: 0, B: 0 };
    for (let i = 0; i < 40000; i++) c[sortearPorPeso_(itens).desc]++;
    return { c, pa: itens[0].peso, pb: itens[1].peso };
  })()`);
  const esperado = r.pa / (r.pa + r.pb), visto = r.c.A / 40000;
  assert.ok(r.pa > r.pb, 'peso maior');
  assert.ok(Math.abs(visto - esperado) < 0.01, 'proporção ' + visto + ' x ' + esperado);
  // pesos iguais → probabilidades iguais
  const iguais = amb.rodar(`(() => { const it = [{ desc: 'A', peso: 4 }, { desc: 'B', peso: 4 }]; let a = 0;
    for (let i = 0; i < 40000; i++) if (sortearPorPeso_(it).desc === 'A') a++; return a / 40000; })()`);
  assert.ok(Math.abs(iguais - 0.5) < 0.01, 'pesos iguais ' + iguais);
});

teste('2. Combinações respeitam 30% e a soma bate com o total', () => {
  const amb = cenario();
  amb.rodar('atualizarBancoSemTrava_(true)');
  [1, 2, 3, 7, 10, 11, 33, 100].forEach(n => {
    const r = amb.rodar(`(() => { const b = lerBanco_(); const nbs = Array.from({ length: ${n} }, () => ({}));
      const d = atribuirDescricoes_(nbs, b);
      const comb = nbs.filter(x => Object.values(b.itens).some(it => it.tipo === 'C' && it.desc === x.desc)).length;
      return { d, comb, total: nbs.filter(x => x.desc).length }; })()`);
    assert.strictEqual(r.d.comb, Math.round(n * 0.3), 'n=' + n);
    assert.strictEqual(r.d.comb + r.d.ind, n);
    assert.strictEqual(r.comb, r.d.comb);
    assert.strictEqual(r.total, n);
  });
  // Sem combinações: completa com individuais e registra no log
  const r = amb.rodar(`(() => { const b = lerBanco_(); Object.keys(b.itens).forEach(id => { if (b.itens[id].tipo === 'C') delete b.itens[id]; });
    const nbs = Array.from({ length: 10 }, () => ({})); const d = atribuirDescricoes_(nbs, b);
    return { d, log: lerGrande_('LOG')[0].msg }; })()`);
  igual(r.d, { ind: 10, comb: 0 });
  assert.ok(/Sem combinações/.test(r.log));
});

teste('3. Pesos com frequências muito diferentes: entre 1 e 10, crescentes, nunca zero', () => {
  const amb = cenario();
  const p = amb.rodar(`[0, 1, 2, 5, 10, 100, 1000, 100000].map(f => calcularPeso_(f, 5))`);
  p.forEach(x => assert.ok(x >= 1 && x <= 10, 'fora da escala: ' + x));
  for (let i = 1; i < p.length; i++) assert.ok(p[i] > p[i - 1], 'não cresce');
  assert.ok(Math.abs(amb.rodar('calcularPeso_(5, 5)') - 5.5) < 1e-9, 'na mediana o peso é 5,5');
  assert.ok(amb.rodar('calcularPeso_(0, 1e9)') >= 1);
});

teste('4. Frequências acima de 1.000: pesos relativos ficam praticamente iguais', () => {
  const amb = cenario();
  const r = amb.rodar(`(() => {
    const base = [1200, 3000, 5000, 9000, 20000];
    const pesos = fs => { const b = bancoVazio_(); fs.forEach((f, i) => { b.itens['I:' + i] = { id: 'I:' + i, tipo: 'I', freq: f }; });
      recalcularPesos_(b); return fs.map((f, i) => b.itens['I:' + i].peso); };
    return [pesos(base), pesos(base.map(f => f * 10))];
  })()`);
  r[0].forEach((p, i) => assert.ok(Math.abs(p - r[1][i]) < 0.01, 'mudou ' + p + ' → ' + r[1][i]));
});

teste('5. Combinações com dois e três componentes', () => {
  const amb = cenario();
  const tres = amb.rodar(`interpretarDescricao_('REPARO NA INTERFACE DE VÍDEO, REDE E ÁUDIO').map(c => c.texto)`);
  igual(tres, ['REPARO NA INTERFACE DE VÍDEO', 'REPARO NA INTERFACE DE REDE', 'REPARO NA INTERFACE DE ÁUDIO']);
  const dois = amb.rodar(`interpretarDescricao_('REPARO NA INTERFACE DE VÍDEO E TROCA DE BATERIA').map(c => c.texto)`);
  igual(dois, ['REPARO NA INTERFACE DE VÍDEO', 'TROCA DE BATERIA']);
  // "E" dentro de palavra não separa
  igual(amb.rodar(`interpretarDescricao_('TROCA DE TECLADO').map(c => c.texto)`), ['TROCA DE TECLADO']);
  // texto não seguro: não inventa componentes
  assert.strictEqual(amb.rodar(`interpretarDescricao_('REPARO WIFI NÃO FUNCIONA')`), null);
  assert.strictEqual(amb.rodar(`interpretarDescricao_('TROCA DE SSD E LIMPEZA DE MOMORIA RAM ( DESFRAGMENTAÇÃO DE MEMORIA)')`), null);
  // frase oficial
  assert.strictEqual(amb.rodar(`escreverCombinacao_(['REPARO NA INTERFACE DE ÁUDIO', 'REPARO NA INTERFACE DE VÍDEO', 'REPARO NA INTERFACE DE REDE'])`),
    'REPARO NA INTERFACE DE ÁUDIO, VÍDEO E REDE');
  assert.strictEqual(amb.rodar(`escreverCombinacao_(['REPARO NA INTERFACE DE REDE', 'TROCA DE SSD'])`), 'REPARO NA INTERFACE DE REDE E TROCA DE SSD');
  amb.rodar('atualizarBancoSemTrava_(true)');
  const b = banco(amb);
  const c3 = b.itens['C:REPARO NA INTERFACE DE AUDIO + REPARO NA INTERFACE DE REDE + REPARO NA INTERFACE DE VIDEO'];
  assert.ok(c3 && c3.comp.length === 3, 'combinação de 3 cadastrada');
  assert.strictEqual(c3.freq, 1);
  const c2 = b.itens['C:REPARO NA INTERFACE DE VIDEO + TROCA DE BATERIA'];
  assert.ok(c2 && c2.comp.length === 2 && c2.freq === 1, 'combinação de 2 com frequência própria');
  assert.strictEqual(c2.desc, 'REPARO NA INTERFACE DE VÍDEO E TROCA DE BATERIA');
});

teste('6. Descrições e combinações duplicadas viram um cadastro só', () => {
  const amb = cenario({ historico: d => [
    ['A', 'ACER', 'A315', 'H101', d(2026, 1, 5), 'reparo na interface de audio'],
    ['A', 'ACER', 'A315', 'H102', d(2026, 1, 5), 'REPARO  NA INTERFACE DE ÁUDIO.'],
    ['A', 'ACER', 'A315', 'H103', d(2026, 1, 5), 'REPARO NA INTERFACE DE REDE E VÍDEO'],
    ['A', 'ACER', 'A315', 'H104', d(2026, 1, 5), 'REPARO NA INTERFACE DE VÍDEO E REDE'],
    ['A', 'ACER', 'A315', 'H104', d(2026, 1, 5), 'REPARO NA INTERFACE DE VÍDEO E REDE'] // mesma linha repetida
  ] });
  amb.rodar('atualizarBancoSemTrava_(true)');
  const b = banco(amb);
  const audio = Object.values(b.itens).filter(i => i.id === 'I:REPARO NA INTERFACE DE AUDIO');
  assert.strictEqual(audio.length, 1);
  assert.strictEqual(audio[0].freq, 2);
  assert.strictEqual(audio[0].desc, 'REPARO NA INTERFACE DE ÁUDIO'); // descrição oficial preservada
  const redeVideo = Object.values(b.itens).filter(i => i.tipo === 'C' && i.comp.length === 2 &&
    i.comp.indexOf('I:REPARO NA INTERFACE DE REDE') >= 0 && i.comp.indexOf('I:REPARO NA INTERFACE DE VIDEO') >= 0);
  assert.strictEqual(redeVideo.length, 1, 'ordem dos componentes não importa');
  assert.strictEqual(redeVideo[0].freq, 2, 'linha repetida em outra aba conta uma vez');
  const antes = Object.keys(b.itens).length;
  amb.rodar('atualizarBancoSemTrava_(true)');
  assert.strictEqual(Object.keys(banco(amb).itens).length, antes, 'reprocessar não duplica');
});

teste('7. Descrição inédita é cadastrada sozinha, sem ocorrências inventadas', () => {
  const amb = cenario();
  amb.rodar('atualizarBancoSemTrava_(true)');
  const it = item(amb, 'I:TROCA DE MODULO DA CAMERA');
  assert.ok(it, 'cadastrada');
  assert.strictEqual(it.freq, 0, 'só aparece depois de 28/02/2026');
  assert.ok(it.peso >= 1 && it.peso <= 10);
  assert.ok(/COLUNA F/.test(it.origem) && it.descoberto, 'origem e data da descoberta');
  assert.ok(banco(amb).naoInterpretadas['REPARO WIFI NAO FUNCIONA'], 'texto não interpretado guardado para diagnóstico');
});

teste('8. Histórico só até 28/02/2026', () => {
  const amb = cenario();
  amb.rodar('atualizarBancoSemTrava_(true)');
  // 3 em janeiro contam; a de 09/03/2026 não
  assert.strictEqual(item(amb, 'I:TROCA DE BATERIA').freq, 3);
  const amb2 = cenario({ historico: d => [['B', 'ACER', 'A315', 'H1', d(2026, 2, 28), 'TROCA DE SSD'],
    ['B', 'ACER', 'A315', 'H2', d(2026, 3, 1), 'TROCA DE SSD']] });
  amb2.rodar('atualizarBancoSemTrava_(true)');
  assert.strictEqual(item(amb2, 'I:TROCA DE SSD').freq, 1, '28/02 conta, 01/03 não');
});

teste('9. Lançamentos do app não entram na contagem', () => {
  // Destino = a própria planilha original (pior caso): o app grava janeiro e o histórico não muda
  const amb = cenario({ historicoGravavel: true, out: 0, nov: 0 });
  const d = amb.data;
  const q = amb.planilhas[ORIGEM_ID].getSheetByName('TabelaQualidade');
  for (let i = 0; i < 10; i++) q.dados.push(['ACER', 'A315', 'JAN' + (1000 + i), '', d(2026, 1, 10), '', 'NOTEBOOK']);
  amb.props.DESTINO_ID = HISTORICO_ID;
  amb.rodar('atualizarBancoSemTrava_(true)');
  const antes = JSON.stringify(Object.values(banco(amb).itens).map(i => [i.id, i.freq]));
  const n = amb.rodar(`gerar_(['JANEIRO 2026'], false)`);
  assert.strictEqual(n, 5);
  amb.rodar('atualizarBancoSemTrava_(true)');
  const depois = JSON.stringify(Object.values(banco(amb).itens).map(i => [i.id, i.freq]));
  assert.strictEqual(depois, antes, 'frequências mudaram com lançamentos do app');
  assert.strictEqual(banco(amb).leitura.foraDoApp, 5);
});

teste('10. Nenhum serial repetido no destino', () => {
  const amb = cenario({ destino: d => ({ 'NOVEMBRO 2026': [CAB_DESTINO, ['OUTRO', 'DELL', 'X', 'NOV1000', d(2026, 11, 1), 'TROCA DE TELA']] }) });
  amb.rodar(`gerar_(['NOVEMBRO 2026'], false)`);
  amb.rodar(`gerar_(['NOVEMBRO 2026'], false)`);
  const seriais = amb.planilhas[TESTE_ID].getSheetByName('NOVEMBRO 2026').dados.slice(1).map(l => l[3]);
  assert.strictEqual(new Set(seriais).size, seriais.length, 'serial repetido');
  assert.strictEqual(seriais.filter(s => s !== 'NOV1000').length, 10, 'metade de 20');
});

teste('11. Automático escreve só no mês atual', () => {
  const amb = cenario();
  amb.props.MESES_AUTO = JSON.stringify(['OUTUBRO 2026']); // mês gerado antes pelo painel
  amb.rodar('automatico()');
  const p = amb.planilhas[TESTE_ID];
  assert.strictEqual(p.getSheetByName('OUTUBRO 2026').getLastRow(), 1, 'outubro foi escrito pelo automático');
  assert.strictEqual(p.getSheetByName('NOVEMBRO 2026').getLastRow() - 1, 10);
  assert.strictEqual(amb.rodar(`gerar_(['OUTUBRO 2026', 'DEZEMBRO 2026'], true)`), 0);
  // Painel continua podendo gerar outubro
  assert.strictEqual(amb.rodar(`gerar_(['OUTUBRO 2026'], false)`), 5);
});

teste('12. Virada do mês: automático passa para o mês novo e relê a coluna F', () => {
  const amb = cenario();
  amb.rodar('automatico()');
  assert.strictEqual(banco(amb).leitura.mes, '2026-11');
  const q = amb.planilhas[ORIGEM_ID].getSheetByName('TabelaQualidade');
  amb.mudarRelogio('2026-12-01T09:00:00-03:00');
  for (let i = 0; i < 4; i++) q.dados.push(['DELL', 'INSPIRON', 'DEZ' + (1000 + i), '', amb.data(2026, 12, 1), '', 'NOTEBOOK']);
  amb.rodar('automatico()');
  const p = amb.planilhas[TESTE_ID];
  assert.strictEqual(p.getSheetByName('DEZEMBRO 2026').getLastRow() - 1, 2);
  assert.strictEqual(p.getSheetByName('NOVEMBRO 2026').getLastRow() - 1, 10, 'novembro não mudou');
  assert.strictEqual(banco(amb).leitura.mes, '2026-12');
});

teste('13. Falha na leitura: banco anterior fica, mês não é marcado, nova tentativa funciona', () => {
  const amb = cenario();
  amb.rodar('atualizarBancoSemTrava_(true)');
  const antes = amb.rodar('JSON.stringify(lerBanco_())');
  amb.mudarRelogio('2026-12-02T09:00:00-03:00');
  amb.falhar.add(HISTORICO_ID);
  amb.rodar('atualizarBancoMensal_()'); // não lança
  assert.strictEqual(amb.rodar('JSON.stringify(lerBanco_())'), antes, 'banco mudou depois de falha');
  assert.strictEqual(banco(amb).leitura.mes, '2026-11', 'mês marcado mesmo com falha');
  assert.ok(/falhou/.test(amb.rodar(`lerGrande_('LOG')[0].msg`)));
  // sorteio continua com o banco anterior
  assert.ok(amb.rodar(`gerar_(['DEZEMBRO 2026'], false)`) >= 0);
  amb.falhar.delete(HISTORICO_ID);
  amb.rodar('atualizarBancoMensal_()');
  assert.strictEqual(banco(amb).leitura.mes, '2026-12');
});

teste('14. Dados existentes preservados e nenhuma aba além dos meses', () => {
  let linhaAntiga;
  const amb = cenario({ destino: d => { linhaAntiga = ['MARIA', 'ACER', 'A315', 'OLD0001', d(2026, 11, 1), 'TROCA DE TELA'];
    return { 'NOVEMBRO 2026': [CAB_DESTINO, linhaAntiga.slice()], 'Página1': [] }; } });
  const p = amb.planilhas[TESTE_ID];
  const abasAntes = p.getSheets().map(a => a.getName());
  amb.rodar('automatico()');
  amb.rodar(`painelGerar('OUTUBRO 2026')`);
  const nov = p.getSheetByName('NOVEMBRO 2026').dados;
  assert.ok(nov.some(l => JSON.stringify(l) === JSON.stringify(linhaAntiga)), 'linha antiga sumiu ou mudou');
  const novas = p.getSheets().map(a => a.getName()).filter(n => abasAntes.indexOf(n) < 0);
  novas.forEach(n => assert.ok(amb.rodar(`ehAbaDeMes_(${JSON.stringify(n)})`), 'aba que não é de mês: ' + n));
  assert.strictEqual(amb.planilhas[ORIGEM_ID].escritas, 0, 'escreveu na qualidade');
  assert.strictEqual(amb.planilhas[HISTORICO_ID].escritas, 0, 'escreveu na planilha original');
  // Descrições escritas são sempre nomes do banco (nada inventado)
  const nomes = new Set(Object.values(banco(amb).itens).map(i => i.desc));
  p.getSheets().forEach(a => a.dados.slice(1).filter(l => l[0] === 'JOÃO PEDRO')
    .forEach(l => assert.ok(nomes.has(l[5]), 'descrição fora do banco: ' + l[5])));
  // técnico do app
  assert.ok(p.getSheetByName('OUTUBRO 2026').dados.slice(1).every(l => l[0] === 'JOÃO PEDRO'));
});

teste('Painel: consulta ao banco e resumo', () => {
  const amb = cenario();
  amb.rodar('atualizarBancoSemTrava_(true)');
  const r = amb.rodar('painelBanco()');
  assert.ok(r.individuais.length > 0 && r.combinacoes.length > 0);
  assert.ok(r.combinacoes.every(c => c.comp.length >= 2));
  assert.ok(r.individuais.every(i => /^\d+\.\d\d$/.test(i.peso)), 'peso com duas casas');
  const d = amb.rodar('painelDados()');
  assert.ok(d.banco.individuais > 0 && d.banco.leitura);
});

teste('Propriedades: banco grande cabe no limite de 9 KB por pedaço (acentos)', () => {
  const amb = cenario();
  amb.rodar(`(() => { const b = bancoVazio_(); for (let i = 0; i < 400; i++) b.itens['I:' + i] = { id: 'I:' + i, tipo: 'I', desc: 'REPARO NA INTERFACE DE ÁÉÍÓÚ ÇÃÕ ' + i, freq: i, peso: 1 };
    gravarGrande_('BANCO', b); })()`);
  assert.strictEqual(Object.keys(amb.rodar('lerBanco_()').itens).length, 400);
  assert.strictEqual(amb.rodar(`lerBanco_().itens['I:7'].desc`), 'REPARO NA INTERFACE DE ÁÉÍÓÚ ÇÃÕ 7');
});

console.log('\n' + ok + ' passaram, ' + falhas + ' falharam');
process.exit(falhas ? 1 : 0);
