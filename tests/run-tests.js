const assert = require('assert');
const { state, parseCSV, filterRowsByKeywords, handleKeywordInputChange } = require('../app.js');

function resetState() {
  state.mode = 'analyse';
  state.analyse = null;
  state.comparaison = { ref: null, cmp: null, keywords: [] };
  state.selectedColumns = new Set();
  state.caseSensitive = false;
  state.filters = { keywords: [] };
}

function testParseCSV() {
  const csv = 'Nom;Valeur\n"Alpha;Beta";42\nGamma;"Texte, avec, virgules"';
  const result = parseCSV(csv);
  assert.deepStrictEqual(result.headers, ['Nom', 'Valeur']);
  assert.strictEqual(result.rows.length, 2);
  assert.strictEqual(result.rows[0]['Nom'], 'Alpha;Beta');
  assert.strictEqual(result.rows[1]['Valeur'], 'Texte, avec, virgules');
}

function testKeywordFallback() {
  resetState();
  state.mode = 'comparaison';
  state.comparaison.keywords = ['Alpha', 'Beta'];
  state.filters.keywords = [];

  const returnedValue = handleKeywordInputChange('   ');
  assert.strictEqual(returnedValue, 'Alpha, Beta');
  assert.deepStrictEqual(state.filters.keywords, ['Alpha', 'Beta']);
}

function testFilterRows() {
  resetState();
  state.mode = 'comparaison';
  state.comparaison.keywords = ['test'];
  state.filters.keywords = ['test'];
  state.selectedColumns = new Set(['Col1', 'Col2']);

  const rows = [
    { Col1: 'Une valeur', Col2: 'autre' },
    { Col1: 'Test en majuscule', Col2: 'quelque chose' },
  ];

  const filtered = filterRowsByKeywords(rows, ['Col1', 'Col2']);
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].row.Col1, 'Test en majuscule');
  assert.strictEqual(filtered[0].matches[0].keyword, 'test');
}

function run() {
  testParseCSV();
  testKeywordFallback();
  testFilterRows();
  console.log('All tests passed');
}

run();
