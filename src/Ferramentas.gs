/**
 * Ferramentas do painel para o mês escolhido, sempre na planilha de destino:
 * - análise: quantas vezes cada descrição aparece nas linhas com o técnico do app
 * - formatação: espaços, maiúsculas, datas, alinhamento e cabeçalho da aba do mês
 * - ortografia: corrige acentos e erros comuns nas palavras de manutenção e nas marcas
 */

// Palavras sem acento ou escritas errado → forma certa (comparação em maiúsculas, palavra inteira)
const ORTOGRAFIA = {
  'FORMATACAO': 'FORMATAÇÃO', 'FORMATAÇAO': 'FORMATAÇÃO', 'FORMATACÃO': 'FORMATAÇÃO', 'FORMATAÇOES': 'FORMATAÇÕES',
  'MANUTENCAO': 'MANUTENÇÃO', 'MANUTENÇAO': 'MANUTENÇÃO', 'MANUNTENÇÃO': 'MANUTENÇÃO', 'MANUTENCOES': 'MANUTENÇÕES',
  'INICIALIZACAO': 'INICIALIZAÇÃO', 'INICIALIZAÇAO': 'INICIALIZAÇÃO', 'CONFIGURACAO': 'CONFIGURAÇÃO',
  'CONFIGURAÇAO': 'CONFIGURAÇÃO', 'INSTALACAO': 'INSTALAÇÃO', 'INSTALAÇAO': 'INSTALAÇÃO', 'ATUALIZACAO': 'ATUALIZAÇÃO',
  'ATUALIZAÇAO': 'ATUALIZAÇÃO', 'SUBSTITUICAO': 'SUBSTITUIÇÃO', 'SUBSTITUIÇAO': 'SUBSTITUIÇÃO',
  'AUDIO': 'ÁUDIO', 'VIDEO': 'VÍDEO', 'MEMORIA': 'MEMÓRIA', 'CARCACA': 'CARCAÇA', 'DOBRADICA': 'DOBRADIÇA',
  'DOBRADICAS': 'DOBRADIÇAS', 'TECLDO': 'TECLADO', 'TECALDO': 'TECLADO', 'BATERRIA': 'BATERIA', 'BATARIA': 'BATERIA',
  'CONECTRO': 'CONECTOR', 'TOUCHPED': 'TOUCHPAD', 'TOUCH-PAD': 'TOUCHPAD',
  'WI-FI': 'WIFI', 'WIRELLES': 'WIRELESS', 'SISTEM': 'SISTEMA', 'SITEMA': 'SISTEMA', 'LIMPESA': 'LIMPEZA',
  'INTERFACI': 'INTERFACE',
  'INTEFACE': 'INTERFACE', 'ÁUDO': 'ÁUDIO', 'AUDO': 'ÁUDIO', 'SISTMENA': 'SISTEMA', 'CAPTACAO': 'CAPTAÇÃO', 'CAPTAÇAO': 'CAPTAÇÃO', 'ROUCHPAD': 'TOUCHPAD', 'TOCUH': 'TOUCH', 'MOMORIA': 'MEMÓRIA', 'CARÇA': 'CARCAÇA', 'RAPARO': 'REPARO', 'ESTETICA': 'ESTÉTICA',
  'ELETRICA': 'ELÉTRICA', 'TERMICA': 'TÉRMICA', 'PASTA TERMICA': 'PASTA TÉRMICA'
};

function abaDoMes_(mes) {
  const aba = abrirSimulacao_().getSheetByName(mes);
  if (!aba || aba.getLastRow() < 2) throw new Error('A aba "' + mes + '" não existe ou está vazia na planilha de destino.');
  return aba;
}

// Sem acento, em maiúsculas e com espaços simples (para comparar textos)
function semAcento_(t) {
  return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

// Grava os valores corrigidos sem transformar fórmulas em valor fixo: célula com fórmula volta com a fórmula
function regravarMantendoFormulas_(faixa, valores, formulas) {
  faixa.setValues(valores.map((l, r) => l.map((c, i) => formulas[r][i] ? formulas[r][i] : c)));
}

// Chamado pelo painel: descrições repetidas do mês, só nas linhas com o técnico do app
function painelAnalise(mes) {
  const aba = abaDoMes_(mes), col = colunas_(aba);
  if (col.tecnico < 0 || col.desc < 0) throw new Error('Na aba "' + mes + '" falta a coluna TÉCNICO ou DESCRIÇÃO.');
  const tecnico = semAcento_(TECNICO), conta = {};
  let total = 0;
  aba.getRange(2, 1, aba.getLastRow() - 1, aba.getLastColumn()).getValues().forEach(l => {
    if (semAcento_(l[col.tecnico]) !== tecnico) return;
    const d = String(l[col.desc] || '').replace(/\s+/g, ' ').trim().toUpperCase() || '(sem descrição)';
    conta[d] = (conta[d] || 0) + 1;
    total++;
  });
  const lista = Object.keys(conta).map(d => ({ desc: d, n: conta[d] })).sort((a, b) => b.n - a.n || a.desc.localeCompare(b.desc));
  return { mes, total, lista };
}

// Chamado pelo painel: arruma a formatação da aba do mês
function painelFormatar(mes) {
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(30000)) throw new Error('Outra rodada está em andamento. Tente de novo em 1 minuto.');
  try {
    const aba = abaDoMes_(mes), col = colunas_(aba);
    const n = aba.getLastRow() - 1, largura = aba.getLastColumn();
    const faixa = aba.getRange(2, 1, n, largura);
    const valores = faixa.getValues(), formulas = faixa.getFormulas();
    let mudou = 0;
    valores.forEach((l, r) => l.forEach((c, i) => {
      if (typeof c !== 'string' || formulas[r][i]) return; // fórmula fica como está
      let novo = c.replace(/\s+/g, ' ').trim();
      if (i === col.tecnico || i === col.marca) novo = novo.toUpperCase();
      if (i === col.marca) novo = MARCAS_IGUAIS[novo] || novo;
      if (i === col.data) {
        const d = lerData_(novo);
        if (d) novo = d;
      }
      if (novo !== c) { l[i] = novo; mudou++; }
    }));
    if (mudou) regravarMantendoFormulas_(faixa, valores, formulas);
    const cab = aba.getRange(1, 1, 1, largura);
    cab.setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle');
    faixa.setFontWeight('normal').setHorizontalAlignment('center').setVerticalAlignment('middle')
      .setFontFamily(cab.getFontFamily()).setFontSize(cab.getFontSize());
    if (col.data >= 0) aba.getRange(2, col.data + 1, n, 1).setNumberFormat('dd/MM/yyyy');
    aba.setFrozenRows(1);
    ajustarLarguras_(aba);
    colocarBordas_(aba);
    return 'Formatação arrumada em ' + mes + ': ' + mudou + ' célula(s) corrigida(s), alinhamento, fonte, datas, largura das colunas e bordas padronizados.';
  } finally {
    trava.releaseLock();
  }
}

// Chamado pelo painel: corrige ortografia das colunas de texto (marca, modelo fica como está)
function painelOrtografia(mes) {
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(30000)) throw new Error('Outra rodada está em andamento. Tente de novo em 1 minuto.');
  try {
    const aba = abaDoMes_(mes), col = colunas_(aba);
    const faixa = aba.getRange(2, 1, aba.getLastRow() - 1, aba.getLastColumn());
    const valores = faixa.getValues(), formulas = faixa.getFormulas();
    const pular = [col.serial, col.modelo, col.data];
    let mudou = 0;
    valores.forEach((l, r) => l.forEach((c, i) => {
      if (typeof c !== 'string' || !c.trim() || pular.indexOf(i) >= 0 || formulas[r][i]) return;
      let novo = c.replace(/[A-Za-zÀ-ÿ-]+/g, p => {
        const certo = ORTOGRAFIA[p.toUpperCase()];
        if (!certo || certo === p.toUpperCase()) return p;
        return p === p.toLowerCase() ? certo.toLowerCase() : certo;
      });
      if (i === col.marca) novo = MARCAS_IGUAIS[novo.toUpperCase()] || novo;
      if (novo !== c) { l[i] = novo; mudou++; }
    }));
    if (mudou) regravarMantendoFormulas_(faixa, valores, formulas);
    return mudou ? 'Ortografia corrigida em ' + mes + ': ' + mudou + ' célula(s).' : 'Nenhum erro de ortografia encontrado em ' + mes + '.';
  } finally {
    trava.releaseLock();
  }
}
