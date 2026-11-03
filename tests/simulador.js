// Simulador do Apps Script para testar o código de src/ no computador (node tests/testes.js).
// Planilhas, propriedades, trava, gatilhos e relógio ficam em memória. Nada acessa o Google.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

function criarAmbiente() {
  const planilhas = {};
  let agora = Date.parse('2026-11-03T12:00:00-03:00');

  class FakeDate extends Date {
    constructor(...a) { if (!a.length) super(agora); else super(...a); }
    static now() { return agora; }
  }

  class Faixa {
    constructor(aba, r, c, nr, nc) { Object.assign(this, { aba, r, c, nr, nc }); }
    getValues() {
      const v = [];
      for (let i = 0; i < this.nr; i++) {
        const l = [];
        for (let j = 0; j < this.nc; j++) {
          const linha = this.aba.dados[this.r - 1 + i] || [];
          const x = linha[this.c - 1 + j];
          l.push(x === undefined || x === null ? '' : x);
        }
        v.push(l);
      }
      return v;
    }
    getFormulas() {
      const v = [];
      for (let i = 0; i < this.nr; i++) {
        const l = [];
        for (let j = 0; j < this.nc; j++) l.push(this.aba.formulas[(this.r + i) + ',' + (this.c + j)] || '');
        v.push(l);
      }
      return v;
    }
    setValues(v) {
      this.aba.planilha.escrever();
      if (v.length !== this.nr || v.some(l => l.length !== this.nc)) throw new Error('setValues: tamanho errado');
      v.forEach((l, i) => l.forEach((x, j) => {
        const r = this.r + i, c = this.c + j;
        while (this.aba.dados.length < r) this.aba.dados.push([]);
        const k = r + ',' + c;
        if (typeof x === 'string' && x[0] === '=') { this.aba.formulas[k] = x; this.aba.dados[r - 1][c - 1] = 'calc:' + x; }
        else { delete this.aba.formulas[k]; this.aba.dados[r - 1][c - 1] = x; }
      }));
      return this;
    }
    sort(o) {
      this.aba.planilha.escrever();
      const linhas = this.aba.dados.slice(this.r - 1, this.r - 1 + this.nr);
      const k = o.column - 1;
      linhas.sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (o.ascending ? 1 : -1));
      linhas.forEach((l, i) => { this.aba.dados[this.r - 1 + i] = l; });
      return this;
    }
    getFontFamily() { return 'Arial'; }
    getFontSize() { return 10; }
  }
  ['setNumberFormat', 'setFontWeight', 'setHorizontalAlignment', 'setVerticalAlignment', 'setFontFamily', 'setFontSize']
    .forEach(m => { Faixa.prototype[m] = function () { this.aba.planilha.escrever(); return this; }; });

  class Aba {
    constructor(planilha, nome, dados) { Object.assign(this, { planilha, nome, dados: dados || [], formulas: {} }); }
    getName() { return this.nome; }
    getLastRow() {
      for (let i = this.dados.length - 1; i >= 0; i--) if ((this.dados[i] || []).some(x => x !== '' && x !== undefined && x !== null)) return i + 1;
      return 0;
    }
    getLastColumn() {
      let m = 0;
      this.dados.forEach(l => (l || []).forEach((x, j) => { if (x !== '' && x !== undefined && x !== null) m = Math.max(m, j + 1); }));
      return m;
    }
    getRange(r, c, nr, nc) { return new Faixa(this, r, c, nr || 1, nc || 1); }
    getDataRange() { return new Faixa(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
    setFrozenRows() { this.planilha.escrever(); }
  }

  class Planilha {
    constructor(id, nome, dono, abas, somenteLeitura) {
      Object.assign(this, { id, nome, dono, somenteLeitura, escritas: 0, abas: [] });
      Object.keys(abas || {}).forEach(n => this.abas.push(new Aba(this, n, abas[n])));
    }
    escrever() {
      if (this.somenteLeitura) throw new Error('ESCRITA PROIBIDA na planilha ' + this.nome);
      this.escritas++;
    }
    getSheets() { return this.abas.slice(); }
    getSheetByName(n) { return this.abas.find(a => a.nome === n) || null; }
    insertSheet(n) { this.escrever(); const a = new Aba(this, n, []); this.abas.push(a); return a; }
    deleteSheet(a) { this.escrever(); this.abas = this.abas.filter(x => x !== a); }
    getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id; }
    getName() { return this.nome; }
    getOwner() { return { getEmail: () => this.dono }; }
  }

  const props = {};
  const falhar = new Set();
  const gatilhos = [];
  const log = [];
  const ctx = {
    console, Math, JSON, Object, Array, String, Number, Set, Map, Error, RegExp, isNaN, parseInt,
    Date: FakeDate,
    SpreadsheetApp: {
      openById(id) {
        if (falhar.has(id) || !planilhas[id]) throw new Error('Não encontrado: ' + id);
        return planilhas[id];
      },
      getUi() { throw new Error('sem interface no teste'); }
    },
    PropertiesService: {
      getScriptProperties() {
        const total = () => Object.keys(props).reduce((t, k) => t + Buffer.byteLength(k + props[k]), 0);
        const conferir = (k, v) => {
          if (Buffer.byteLength(String(v)) > 9 * 1024) throw new Error('Propriedade ' + k + ' passou de 9 KB');
        };
        const api = {
          getProperty: k => (k in props ? props[k] : null),
          setProperty: (k, v) => { conferir(k, v); props[k] = String(v); if (total() > 500 * 1024) throw new Error('Propriedades passaram de 500 KB'); return api; },
          setProperties: o => { Object.keys(o).forEach(k => conferir(k, o[k])); Object.assign(props, Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)]))); if (total() > 500 * 1024) throw new Error('Propriedades passaram de 500 KB'); return api; },
          deleteProperty: k => { delete props[k]; return api; }
        };
        return api;
      }
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    ScriptApp: {
      getProjectTriggers: () => gatilhos.slice(),
      deleteTrigger: t => { const i = gatilhos.indexOf(t); if (i >= 0) gatilhos.splice(i, 1); },
      newTrigger: f => ({ timeBased: () => ({ everyHours: () => ({ create: () => { const t = { getHandlerFunction: () => f }; gatilhos.push(t); return t; } }) }) })
    },
    Utilities: {
      DigestAlgorithm: { MD5: 'md5' },
      computeDigest: (alg, s) => Array.from(crypto.createHash(alg).update(s).digest()),
      base64Encode: b => Buffer.from(b.map(x => x & 255)).toString('base64'),
      formatDate(d, tz, fmt) {
        const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
          .formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {});
        return fmt.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute);
      }
    },
    UrlFetchApp: { fetchAll: () => { throw new Error('sem internet no teste'); } },
    HtmlService: {}
  };
  vm.createContext(ctx);
  const dir = path.join(__dirname, '..', 'src');
  const codigo = fs.readdirSync(dir).filter(f => f.endsWith('.gs') && f !== 'zz_Segredos.gs').sort()
    .map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n;\n');
  vm.runInContext(codigo, ctx, { filename: 'src' });

  return {
    ctx,
    rodar: js => vm.runInContext(js, ctx),
    planilhas, props, gatilhos, falhar, log,
    novaPlanilha: (id, nome, dono, abas, somenteLeitura) => (planilhas[id] = new Planilha(id, nome, dono, abas, somenteLeitura)),
    data: (a, m, d) => new FakeDate(a, m - 1, d),
    mudarRelogio: iso => { agora = Date.parse(iso); }
  };
}

module.exports = { criarAmbiente };
