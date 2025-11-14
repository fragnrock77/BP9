/**
 * Application "Analyseur de fichiers CSV & XLSX"
 * - Mode Analyse d'un fichier
 * - Mode Comparaison de fichiers
 * - Import CSV/XLSX fiable (FileReader + SheetJS)
 * - Filtrage par colonne (checkbox en tête)
 * - Colonne "Mots-clés trouvés"
 */

const state = {
  mode: 'analyse',
  analyse: null,
  comparaison: {
    ref: null,
    cmp: null,
    keywords: [],
  },
  selectedColumns: new Set(),
  caseSensitive: false,
  filters: {
    keywords: [],
  },
};

// --- Initialisation de l'application ---
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', init);
}

function init() {
  setupEventListeners();
}

function setupEventListeners() {
  const modeRadios = document.querySelectorAll('input[name="mode"]');
  modeRadios.forEach((radio) => {
    radio.addEventListener('change', (event) => {
      const selectedMode = event.target.value;
      if (selectedMode !== state.mode) {
        state.mode = selectedMode;
        toggleMode(selectedMode);
        resetTableAndStatus();
        if (selectedMode === 'analyse' && state.analyse) {
          renderAnalyseTable();
        } else if (selectedMode === 'comparaison' && state.comparaison.cmp) {
          renderComparisonTable();
        }
      }
    });
  });

  document.getElementById('file-analyse').addEventListener('change', async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    try {
      showStatus('Import du fichier en cours...');
      state.analyse = await importFile(file);
      state.selectedColumns = new Set(state.analyse.headers);
      renderAnalyseTable();
      showStatus(`Fichier \"${file.name}\" importé avec succès.`);
    } catch (error) {
      console.error(error);
      showStatus(`Erreur lors de l'import : ${error.message}`, true);
    }
  });

  document.getElementById('file-ref').addEventListener('change', async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    try {
      showStatus('Import du fichier de référence...');
      state.comparaison.ref = await importFile(file);
      state.comparaison.keywords = extractKeywordsFromReference(state.comparaison.ref);
      updateKeywordSummary();
      showStatus(`Fichier de référence \"${file.name}\" importé (${state.comparaison.keywords.length} mots-clés).`);
      if (state.comparaison.cmp) {
        renderComparisonTable();
      }
    } catch (error) {
      console.error(error);
      showStatus(`Erreur lors de l'import du fichier de référence : ${error.message}`, true);
    }
  });

  document.getElementById('file-cmp').addEventListener('change', async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    try {
      showStatus('Import du fichier à comparer...');
      state.comparaison.cmp = await importFile(file);
      state.selectedColumns = new Set(state.comparaison.cmp.headers);
      renderComparisonTable();
      showStatus(`Fichier à comparer \"${file.name}\" importé.`);
    } catch (error) {
      console.error(error);
      showStatus(`Erreur lors de l'import du fichier à comparer : ${error.message}`, true);
    }
  });

  const keywordInput = document.getElementById('keywords');
  keywordInput.addEventListener('input', (event) => {
    const resolvedValue = handleKeywordInputChange(event.target.value);
    if (event.target.value !== resolvedValue) {
      event.target.value = resolvedValue;
    }
    refreshTable();
  });

  document.getElementById('case-sensitive').addEventListener('change', (event) => {
    state.caseSensitive = event.target.checked;
    refreshTable();
  });
}

function toggleMode(mode) {
  const analyseImport = document.querySelector('.analyse-import');
  const comparaisonImport = document.querySelector('.comparaison-import');
  if (mode === 'analyse') {
    analyseImport.classList.remove('hidden');
    comparaisonImport.classList.add('hidden');
    document.getElementById('keyword-summary').style.display = 'none';
  } else {
    analyseImport.classList.add('hidden');
    comparaisonImport.classList.remove('hidden');
    updateKeywordSummary();
  }
}

function resetTableAndStatus() {
  document.querySelector('#data-table thead').innerHTML = '';
  document.querySelector('#data-table tbody').innerHTML = '';
  showStatus('');
}

function refreshTable() {
  if (state.mode === 'analyse' && state.analyse) {
    renderAnalyseTable();
  } else if (state.mode === 'comparaison' && state.comparaison.cmp) {
    renderComparisonTable();
  }
}

// --- Fonctions utilitaires d'import et parsing ---
function getFileExtension(name) {
  const m = name.toLowerCase().match(/\.([^.]+)$/);
  return m ? m[1] : '';
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function detectCSVSeparator(text) {
  const separators = [';', ',', '\t', '|'];
  const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 5);
  let bestSeparator = ',';
  let bestScore = -Infinity;

  separators.forEach((sep) => {
    let score = 0;
    lines.forEach((line) => {
      const parts = line.split(sep);
      score += parts.length;
    });
    if (score > bestScore) {
      bestScore = score;
      bestSeparator = sep;
    }
  });

  return bestSeparator;
}

function parseCSV(text) {
  const separator = detectCSVSeparator(text);
  const rows = [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = splitCSVLine(lines[0], separator).map((h, index) =>
    h ? h.trim() : `Colonne ${index + 1}`
  );

  for (let i = 1; i < lines.length; i++) {
    const parts = splitCSVLine(lines[i], separator);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = parts[index] != null ? parts[index] : '';
    });
    rows.push(row);
  }

  return { headers, rows };
}

function splitCSVLine(line, separator) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === separator && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function parseXLSX(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const headers = (json[0] || []).map((h, i) => (h && String(h).trim()) || `Colonne ${i + 1}`);
  const rows = [];

  for (let i = 1; i < json.length; i++) {
    const rowArray = json[i];
    if (!rowArray) continue;
    const rowObj = {};
    headers.forEach((h, colIndex) => {
      rowObj[h] = rowArray[colIndex] != null ? rowArray[colIndex] : '';
    });
    rows.push(rowObj);
  }

  return { headers, rows };
}

async function importFile(file) {
  const ext = getFileExtension(file.name);
  if (ext === 'csv') {
    const text = await readFileAsText(file);
    return parseCSV(text);
  } else if (ext === 'xlsx') {
    const buffer = await readFileAsArrayBuffer(file);
    return parseXLSX(buffer);
  }
  throw new Error('Type de fichier non supporté : ' + ext);
}

// --- Gestion des mots-clés et filtrage ---
function parseKeywords(raw) {
  return raw
    .split(',')
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0);
}

function extractKeywordsFromReference(refData) {
  if (!refData) return [];
  const unique = new Set();
  refData.rows.forEach((row) => {
    Object.values(row).forEach((value) => {
      if (value != null && String(value).trim() !== '') {
        unique.add(String(value).trim());
      }
    });
  });
  return Array.from(unique);
}

function updateKeywordSummary() {
  const summary = document.getElementById('keyword-summary');
  if (state.mode !== 'comparaison' || !state.comparaison.keywords.length) {
    summary.style.display = 'none';
    summary.textContent = '';
    return;
  }
  summary.style.display = 'block';
  summary.textContent = `${state.comparaison.keywords.length} mots-clés extraits du fichier de référence.`;
}

function updateSelectedColumns(header, checked) {
  if (checked) {
    state.selectedColumns.add(header);
  } else {
    state.selectedColumns.delete(header);
  }

  if (state.selectedColumns.size === 0) {
    showStatus('Aucune colonne sélectionnée, réinitialisation sur toutes les colonnes.');
    const headers = currentHeaders();
    state.selectedColumns = new Set(headers);
    renderColumnCheckboxes(headers);
  }

  refreshTable();
}

function currentHeaders() {
  if (state.mode === 'analyse' && state.analyse) {
    return state.analyse.headers;
  }
  if (state.mode === 'comparaison' && state.comparaison.cmp) {
    return state.comparaison.cmp.headers;
  }
  return [];
}

function filterRowsByKeywords(rows, headers) {
  const keywords = state.filters.keywords;
  if (!keywords.length && state.mode === 'analyse') {
    // En mode analyse, si aucun mot-clé, on affiche toutes les lignes
    return rows.map((row) => ({ row, matches: [] }));
  }

  const selectedHeaders = headers.filter((header) => state.selectedColumns.has(header));
  const compare = state.caseSensitive
    ? (value, keyword) => value.includes(keyword)
    : (value, keyword) => value.toLowerCase().includes(keyword.toLowerCase());

  const preparedKeywords = state.caseSensitive ? keywords : keywords.map((k) => k.toLowerCase());

  const filtered = [];

  rows.forEach((row) => {
    const matches = [];
    selectedHeaders.forEach((header) => {
      const cellValue = row[header];
      if (cellValue == null) return;
      const textValue = String(cellValue);
      const comparable = state.caseSensitive ? textValue : textValue.toLowerCase();

      preparedKeywords.forEach((keyword, index) => {
        if (keyword.length === 0) return;
        if (compare(comparable, keyword)) {
          matches.push({ keyword: keywords[index], header });
        }
      });
    });

    if (state.mode === 'analyse') {
      if (!keywords.length || matches.length > 0) {
        filtered.push({ row, matches });
      }
    } else {
      // En mode comparaison, seules les lignes avec au moins un mot-clé sont conservées
      if (matches.length > 0) {
        filtered.push({ row, matches });
      }
    }
  });

  return filtered;
}

function handleKeywordInputChange(rawValue) {
  const parsed = parseKeywords(rawValue);

  if (
    parsed.length === 0 &&
    state.mode === 'comparaison' &&
    state.comparaison.keywords.length > 0
  ) {
    // En comparaison, si l'utilisateur efface la recherche, on revient
    // automatiquement aux mots-clés extraits du fichier de référence.
    state.filters.keywords = [...state.comparaison.keywords];
    return state.comparaison.keywords.join(', ');
  }

  state.filters.keywords = parsed;
  return rawValue;
}

// --- Rendu des tableaux ---
function renderAnalyseTable() {
  if (!state.analyse) return;
  const { headers, rows } = state.analyse;
  const filteredRows = filterRowsByKeywords(rows, headers);
  renderTable(headers, filteredRows);
}

function renderComparisonTable() {
  if (!state.comparaison.cmp) return;
  const { headers, rows } = state.comparaison.cmp;
  const keywords = state.comparaison.keywords;
  if (keywords.length && state.filters.keywords.length === 0) {
    state.filters.keywords = [...keywords];
    document.getElementById('keywords').value = keywords.join(', ');
  }
  const filteredRows = filterRowsByKeywords(rows, headers);
  renderTable(headers, filteredRows);
}

function renderTable(headers, filteredRows) {
  const thead = document.querySelector('#data-table thead');
  const tbody = document.querySelector('#data-table tbody');

  thead.innerHTML = '';
  tbody.innerHTML = '';

  renderColumnCheckboxes(headers);

  filteredRows.forEach(({ row, matches }) => {
    const tr = document.createElement('tr');
    headers.forEach((header) => {
      const td = document.createElement('td');
      td.textContent = row[header] != null ? row[header] : '';
      tr.appendChild(td);
    });

    const matchTd = document.createElement('td');
    matchTd.className = 'matched-keywords';
    matchTd.textContent = formatMatches(matches);
    tr.appendChild(matchTd);

    tbody.appendChild(tr);
  });
}

function renderColumnCheckboxes(headers) {
  const thead = document.querySelector('#data-table thead');
  thead.innerHTML = '';

  const headerRow = document.createElement('tr');
  headers.forEach((header) => {
    const th = document.createElement('th');
    const wrapper = document.createElement('div');
    wrapper.className = 'header-content';

    const title = document.createElement('span');
    title.textContent = header;

    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.selectedColumns.has(header);
    checkbox.addEventListener('change', (event) => {
      updateSelectedColumns(header, event.target.checked);
    });

    const span = document.createElement('span');
    span.textContent = 'Inclure dans la recherche';

    label.appendChild(checkbox);
    label.appendChild(span);
    wrapper.appendChild(title);
    wrapper.appendChild(label);
    th.appendChild(wrapper);
    headerRow.appendChild(th);
  });

  const matchTh = document.createElement('th');
  matchTh.textContent = 'Mots-clés trouvés';
  headerRow.appendChild(matchTh);

  thead.appendChild(headerRow);
}

function formatMatches(matches) {
  if (!matches.length) return '';
  const grouped = matches.reduce((acc, current) => {
    if (!acc[current.keyword]) {
      acc[current.keyword] = new Set();
    }
    acc[current.keyword].add(current.header);
    return acc;
  }, {});

  return Object.entries(grouped)
    .map(([keyword, headers]) => `${keyword} (${Array.from(headers).join(', ')})`)
    .join('\n');
}

// --- Utilitaires d'interface ---
function showStatus(message, isError = false) {
  const status = document.getElementById('status-message');
  status.textContent = message;
  status.style.color = isError ? '#dc2626' : '';
}

// --- Tests manuels recommandés ---
// 1. Importer un petit fichier .xlsx en mode Analyse → vérifier l'affichage des colonnes et la recherche.
// 2. Importer un fichier .csv en mode Analyse → vérifier le parsing et la colonne "Mots-clés trouvés".
// 3. Importer un fichier de référence + un fichier à comparer en mode Comparaison → vérifier le nombre de mots-clés et le filtrage.
// 4. Cocher/décocher des colonnes → vérifier que seules les colonnes cochées sont utilisées pour la recherche.
// 5. Décochez toutes les colonnes → vérifier la réactivation automatique et le message d'état.

if (typeof window !== 'undefined') {
  window.__CSVAnalyzer__ = {
    state,
    parseCSV,
    parseKeywords,
    filterRowsByKeywords,
    detectCSVSeparator,
    splitCSVLine,
    extractKeywordsFromReference,
    handleKeywordInputChange,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    state,
    parseCSV,
    parseKeywords,
    filterRowsByKeywords,
    detectCSVSeparator,
    splitCSVLine,
    extractKeywordsFromReference,
    handleKeywordInputChange,
  };
}
