/**
 * parser.js — Statement parser for BizHealth AI
 * Supports CSV files and plain-text bank/mobile-wallet exports.
 * Returns an array of raw transaction objects with original data preserved.
 * When columns cannot be confidently detected, returns a needsMapping flag
 * so the UI can prompt the user to map columns manually.
 */

'use strict';

const Parser = (() => {

  /**
   * Attempt to detect column indices from a header row.
   * Returns an object with keys: date, description, amount, credit, debit, balance
   * Values are column indices (-1 if not found).
   */
  function detectColumns(headers) {
    const h = headers.map(s => s.toLowerCase().trim());
    const find = (...terms) => h.findIndex(v => terms.some(t => v.includes(t)));
    return {
      date:        find('date', 'trans date', 'posted', 'value date', 'transaction date'),
      description: find('description', 'narration', 'memo', 'details', 'merchant', 'particulars', 'payee', 'reference', 'narrative', 'transaction description'),
      amount:      find('amount', 'transaction amount', 'trans amt', 'net amount'),
      credit:      find('credit', 'deposit', 'money in', 'cr', 'credits', 'inflow'),
      debit:       find('debit', 'withdrawal', 'money out', 'dr', 'debits', 'outflow'),
      balance:     find('balance', 'running balance', 'closing balance'),
    };
  }

  /**
   * Check whether the detected columns are sufficient to parse transactions.
   * Returns true if we have at least date+description+amount (or credit/debit pair).
   */
  function hasRequiredColumns(cols) {
    const hasAmount   = cols.amount >= 0;
    const hasCreditDebit = (cols.credit >= 0 || cols.debit >= 0);
    const hasDesc     = cols.description >= 0;
    // We need at minimum: an amount or credit/debit, and a description
    return hasDesc && (hasAmount || hasCreditDebit);
  }

  /**
   * Parse a dollar/amount string to a float.
   * Handles parentheses for negatives, currency symbols, commas.
   */
  function parseAmount(str) {
    if (!str && str !== 0) return null;
    const s = String(str).trim();
    if (s === '' || s === '-') return null;
    const negative = s.startsWith('(') && s.endsWith(')');
    const cleaned = s.replace(/[^0-9.\-]/g, '');
    const value = parseFloat(cleaned);
    if (isNaN(value)) return null;
    return negative ? -Math.abs(value) : value;
  }

  /**
   * Parse a date string into YYYY-MM-DD format.
   * Tries common formats: MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD, DD-Mon-YYYY.
   */
  function parseDate(str) {
    if (!str) return null;
    const s = str.trim();

    // ISO format
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);

    // MM/DD/YYYY or DD/MM/YYYY
    const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (slashMatch) {
      let [, a, b, y] = slashMatch;
      if (y.length === 2) y = '20' + y;
      // Heuristic: if first part > 12, it must be day
      const month = parseInt(a) > 12 ? b : a;
      const day   = parseInt(a) > 12 ? a : b;
      return `${y}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;
    }

    // DD-Mon-YYYY or DD Mon YYYY
    const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const textMatch = s.match(/^(\d{1,2})[\s\-]([a-zA-Z]{3,})[\s\-](\d{2,4})$/);
    if (textMatch) {
      let [, d, m, y] = textMatch;
      if (y.length === 2) y = '20' + y;
      const mi = monthNames.indexOf(m.toLowerCase().substring(0,3)) + 1;
      if (mi > 0) return `${y}-${String(mi).padStart(2,'0')}-${d.padStart(2,'0')}`;
    }

    return s; // return as-is if format unknown
  }

  /**
   * Split a CSV line respecting quoted fields.
   */
  function splitCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim().replace(/^"|"$/g, ''));
    return result;
  }

  /**
   * Build transactions from parsed rows given explicit column indices.
   */
  function buildTransactions(lines, headerIdx, cols) {
    const transactions = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const parts = splitCSVLine(lines[i]);
      if (parts.length < 2) continue;

      const rawDate = cols.date >= 0 ? parts[cols.date] : '';
      const rawDesc = cols.description >= 0 ? parts[cols.description] : parts[1] || '';

      let amount = null;
      if (cols.amount >= 0) {
        amount = parseAmount(parts[cols.amount]);
      } else if (cols.credit >= 0 || cols.debit >= 0) {
        const credit = cols.credit >= 0 ? parseAmount(parts[cols.credit]) : null;
        const debit  = cols.debit  >= 0 ? parseAmount(parts[cols.debit])  : null;
        if (credit) amount = Math.abs(credit);
        else if (debit) amount = -(Math.abs(debit));
      }

      if (amount === null) continue; // skip rows with no parseable amount

      transactions.push({
        id:          Math.random().toString(36).slice(2) + Date.now().toString(36),
        originalRow: lines[i],
        date:        parseDate(rawDate),
        description: rawDesc.trim(),
        amount:      amount,
        isCredit:    amount > 0,
        balance:     cols.balance >= 0 ? parseAmount(parts[cols.balance]) : null,
        source:      'csv',
      });
    }
    return transactions;
  }

  /**
   * Parse CSV text into transaction rows.
   * Returns { transactions, period } on success.
   * Returns { needsMapping, columns, sampleRows } when column mapping is needed.
   */
  function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length < 2) throw new Error('File appears empty or has only one row.');

    // Find the header row (first row that looks like a header)
    let headerIdx = 0;
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const lower = lines[i].toLowerCase();
      if (lower.includes('date') || lower.includes('amount') || lower.includes('description') ||
          lower.includes('debit') || lower.includes('credit') || lower.includes('narration')) {
        headerIdx = i;
        break;
      }
    }

    const headers = splitCSVLine(lines[headerIdx]);
    const cols    = detectColumns(headers);

    // If we can't confidently map the required columns, ask the user
    if (!hasRequiredColumns(cols)) {
      // Gather a few sample rows for the mapping UI
      const sampleRows = lines.slice(headerIdx + 1, headerIdx + 4).map(l => splitCSVLine(l));
      return {
        needsMapping: true,
        columns:      headers,
        sampleRows,
        headerIdx,
        allLines:     lines,
      };
    }

    const transactions = buildTransactions(lines, headerIdx, cols);
    if (transactions.length === 0) throw new Error('No transactions could be parsed from this file.');

    const period = inferPeriod(transactions);
    return { transactions, period };
  }

  /**
   * Parse using explicitly provided column mapping (from column-mapper UI).
   * mappedColumns: { date, description, amount, credit, debit, balance } — column indices
   */
  function parseWithMapping(text, mappedColumns) {
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length < 2) throw new Error('File appears empty or has only one row.');

    // Find the header row
    let headerIdx = 0;
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const lower = lines[i].toLowerCase();
      if (lower.includes('date') || lower.includes('amount') || lower.includes('description') ||
          lower.includes('debit') || lower.includes('credit') || lower.includes('narration')) {
        headerIdx = i;
        break;
      }
    }

    const transactions = buildTransactions(lines, headerIdx, mappedColumns);
    if (transactions.length === 0) throw new Error('No transactions could be parsed with the selected columns.');

    const period = inferPeriod(transactions);
    return { transactions, period };
  }

  /**
   * Attempt to infer month/year from the transactions.
   */
  function inferPeriod(transactions) {
    const dates = transactions.map(t => t.date).filter(Boolean).sort();
    if (dates.length === 0) return { month: null, year: null, label: 'Unknown Period' };
    const first = dates[0];
    const [year, month] = first.split('-').map(Number);
    const monthNames = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];
    return { year, month, label: `${monthNames[month - 1]} ${year}` };
  }

  /**
   * Main entry point: parse file content.
   * @param {string} text - raw file text
   * @param {string} filename - original filename (used for format hint)
   * @returns {{ transactions, period } | { needsMapping, columns, sampleRows }}
   */
  function parse(text, filename) {
    return parseCSV(text);
  }

  return { parse, parseWithMapping, parseAmount, parseDate };
})();
