/**
 * app.js — Application state, routing, and orchestration for BizHealth AI
 */

'use strict';

const App = (() => {

  const SESSIONS_KEY     = 'bizhealth_sessions';
  const BUSINESS_TYPE_KEY = 'bizhealth_business_type';

  // ─── State ────────────────────────────────────────────────────────────────
  let state = {
    view:         'upload',    // 'upload' | 'review' | 'pnl' | 'history' | 'rules' | 'settings' | 'marketday' | 'taxi'
    sessions:     [],          // all saved monthly sessions
    current:      null,        // active session being worked on
    businessType: '',          // optional business type
    marketDay:    null,        // active market day (from MarketDay.loadActiveDay())
    taxiView:     'dashboard', // sub-view within 'taxi': 'dashboard' | 'fares' | 'expense' | 'pnl'
  };

  function getState() { return state; }

  // ─── Sessions (localStorage persistence) ─────────────────────────────────
  function loadSessions() {
    try {
      const raw = localStorage.getItem(SESSIONS_KEY);
      state.sessions = raw ? JSON.parse(raw) : [];
    } catch {
      state.sessions = [];
    }
  }

  function saveSessions() {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(state.sessions));
  }

  function findSession(periodKey) {
    return state.sessions.find(s => s.periodKey === periodKey);
  }

  // ─── Business type ────────────────────────────────────────────────────────
  function loadBusinessType() {
    state.businessType = localStorage.getItem(BUSINESS_TYPE_KEY) || '';
  }

  function setBusinessType(type) {
    state.businessType = type;
    if (type) {
      localStorage.setItem(BUSINESS_TYPE_KEY, type);
    } else {
      localStorage.removeItem(BUSINESS_TYPE_KEY);
    }
  }

  // ─── Navigation ───────────────────────────────────────────────────────────
  function navigate(view) {
    state.view = view;
    UI.render(state);
  }

  // ─── File upload handler ───────────────────────────────────────────────────
  function handleFileUpload(file) {
    if (!file) return;

    const allowedTypes = ['text/csv', 'text/plain', 'application/csv',
                          'application/vnd.ms-excel', ''];
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'txt', 'tsv'].includes(ext) && !allowedTypes.includes(file.type)) {
      UI.showError('Please upload a CSV or plain-text statement file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const result = Parser.parse(text, file.name);

        // If the parser needs column mapping, show the mapping UI
        if (result.needsMapping) {
          UI.showColumnMapper(result.columns, result.sampleRows, file.name, (mappedColumns) => {
            try {
              const { transactions, period } = Parser.parseWithMapping(text, mappedColumns);
              finishUpload(file, transactions, period);
            } catch (err) {
              UI.showError('Could not parse this file. ' + err.message);
            }
          });
          return;
        }

        const { transactions, period } = result;
        finishUpload(file, transactions, period);

      } catch (err) {
        UI.showError('Could not parse this file. ' + err.message);
      }
    };
    reader.onerror = () => UI.showError('Could not read the file.');
    reader.readAsText(file);
  }

  function finishUpload(file, transactions, period) {
    const categorized = Categorizer.categorizeAll(transactions, state.businessType);
    const pKey        = Trends.periodKey(period);

    state.current = {
      periodKey:    pKey,
      period,
      fileName:     file.name,
      uploadedAt:   new Date().toISOString(),
      transactions: categorized,
      statement:    null,
      comparison:   null,
      trendAnalysis:null,
      suggestions:  [],
    };

    // Compute P&L immediately (user can still change it via review)
    refreshPnL();

    // If there are items needing review, go to review view
    const needsReview = categorized.filter(t => t.needsReview);
    if (needsReview.length > 0) {
      navigate('review');
    } else {
      navigate('pnl');
    }
  }

  // ─── Re-compute P&L and save ───────────────────────────────────────────────
  function refreshPnL() {
    if (!state.current) return;
    const { transactions, period } = state.current;
    const statement = PnL.buildStatement(transactions, period);
    const summary   = PnL.toSummary(statement);
    Trends.saveSummary(summary);

    const comparison    = Trends.compareWithPrevious(summary);
    const trendAnalysis = Trends.analyzeTrends();
    const suggestions   = Suggestions.generate(statement, comparison, trendAnalysis, state.businessType);

    state.current.statement     = statement;
    state.current.comparison    = comparison;
    state.current.trendAnalysis = trendAnalysis;
    state.current.suggestions   = suggestions;

    // Save/update session
    const pKey = state.current.periodKey;
    const idx  = state.sessions.findIndex(s => s.periodKey === pKey);
    if (idx >= 0) {
      state.sessions[idx] = { ...state.current };
    } else {
      state.sessions.push({ ...state.current });
    }
    saveSessions();
  }

  // ─── Transaction review actions ───────────────────────────────────────────
  function confirmTransaction(txId) {
    if (!state.current) return;
    state.current.transactions = state.current.transactions.map(t =>
      t.id === txId ? Categorizer.confirmCategorization(t) : t
    );
    refreshPnL();
    UI.render(state);
  }

  function overrideTransaction(txId, newCategory) {
    if (!state.current) return;
    state.current.transactions = state.current.transactions.map(t =>
      t.id === txId ? Categorizer.applyOverride(t, newCategory) : t
    );
    refreshPnL();
    UI.render(state);
  }

  function confirmAllRemaining() {
    if (!state.current) return;
    state.current.transactions = state.current.transactions.map(t =>
      t.needsReview ? Categorizer.confirmCategorization(t) : t
    );
    refreshPnL();
    navigate('pnl');
  }

  // ─── Load a historical session ────────────────────────────────────────────
  function loadHistoricalSession(periodKey) {
    const session = findSession(periodKey);
    if (!session) return;
    state.current = { ...session };
    navigate('pnl');
  }

  // ─── Data management ──────────────────────────────────────────────────────
  /**
   * Clear transaction history only (preserve learned rules & business type).
   */
  function clearTransactionHistory() {
    state.sessions = [];
    state.current  = null;
    localStorage.removeItem(SESSIONS_KEY);
    // Also clear the P&L history used by trends
    localStorage.removeItem('bizhealth_pnl_history');
    UI.showSuccess('Transaction history cleared. Learned classifications and preferences have been preserved.');
    navigate('upload');
  }

  /**
   * Clear ALL BizHealth AI data from this device.
   */
  function clearAllData() {
    const keysToRemove = [
      SESSIONS_KEY,
      BUSINESS_TYPE_KEY,
      'bizhealth_pnl_history',
      'bizhealth_learned_rules',
    ];
    keysToRemove.forEach(k => localStorage.removeItem(k));
    MarketDay.clearAllMarketData();
    Taxi.clearAllTaxiData();
    state.sessions         = [];
    state.current          = null;
    state.businessType     = '';
    state.marketDay        = null;
    state.marketDayClosed  = null;
    UI.showSuccess('All BizHealth AI data has been cleared from this device.');
    navigate('upload');
  }

  // ─── Market Day actions ───────────────────────────────────────────────────
  function mdOpenDay(openingFloat, marketName, currency) {
    try {
      state.marketDay = MarketDay.openDay(openingFloat, marketName, currency);
      navigate('marketday');
    } catch (err) {
      UI.showError(err.message);
    }
  }

  function mdRecordSale(amount, description) {
    try {
      state.marketDay = MarketDay.recordSale(amount, description);
      UI.render(state);
    } catch (err) {
      UI.showError(err.message);
    }
  }

  function mdDeleteSale(saleId) {
    try {
      state.marketDay = MarketDay.deleteSale(saleId);
      UI.render(state);
    } catch (err) {
      UI.showError(err.message);
    }
  }

  function mdRecordExpense(amount, description, type) {
    try {
      state.marketDay = MarketDay.recordExpense(amount, description, type);
      UI.render(state);
    } catch (err) {
      UI.showError(err.message);
    }
  }

  function mdDeleteExpense(expenseId) {
    try {
      state.marketDay = MarketDay.deleteExpense(expenseId);
      UI.render(state);
    } catch (err) {
      UI.showError(err.message);
    }
  }

  function mdCloseDay(savedAmount, notes) {
    try {
      const closed = MarketDay.closeDay(savedAmount, notes);
      state.marketDay = null;
      // Navigate back to marketday hub to show the closed summary
      state.view = 'marketday';
      state.marketDayClosed = closed;
      UI.render(state);
    } catch (err) {
      UI.showError(err.message);
    }
  }

  function mdNavigateToOpen() {
    state.marketDay = MarketDay.loadActiveDay();
    navigate('marketday');
  }

  // ─── Taxi actions ─────────────────────────────────────────────────────────
  function taxiNavigate(subView) {
    state.taxiView = subView || 'dashboard';
    navigate('taxi');
  }

  function taxiAddFares(date, cash, mobile, other, notes) {
    try {
      Taxi.addDailyFares(date, cash, mobile, other, notes);
      UI.showSuccess('Fares saved.');
      taxiNavigate('dashboard');
    } catch (err) {
      UI.showError(err.message);
    }
  }

  function taxiAddExpense(opts) {
    try {
      Taxi.addExpense(opts);
      UI.showSuccess('Expense saved.');
      taxiNavigate('dashboard');
    } catch (err) {
      UI.showError(err.message);
    }
  }

  function taxiDeleteFare(id) {
    Taxi.deleteFare(id);
    UI.render(state);
  }

  function taxiDeleteExpense(id) {
    Taxi.deleteExpense(id);
    UI.render(state);
  }

  function taxiSetBusinessUse(id, use) {
    Taxi.updateExpenseBusinessUse(id, use);
    UI.render(state);
  }

  function taxiMergeDuplicate(stmtId, manualId) {
    Taxi.mergeDuplicate(stmtId, manualId);
    UI.showSuccess('Merged — manual entry kept.');
    UI.render(state);
  }

  // ─── Boot ─────────────────────────────────────────────────────────────────
  function init() {
    loadSessions();
    loadBusinessType();
    // Rehydrate any in-progress market day
    state.marketDay = MarketDay.loadActiveDay();
    navigate('upload');
  }

  return {
    init,
    getState,
    navigate,
    handleFileUpload,
    confirmTransaction,
    overrideTransaction,
    confirmAllRemaining,
    loadHistoricalSession,
    refreshPnL,
    setBusinessType,
    clearTransactionHistory,
    clearAllData,
    mdOpenDay,
    mdRecordSale,
    mdDeleteSale,
    mdRecordExpense,
    mdDeleteExpense,
    mdCloseDay,
    mdNavigateToOpen,
    taxiNavigate,
    taxiAddFares,
    taxiAddExpense,
    taxiDeleteFare,
    taxiDeleteExpense,
    taxiSetBusinessUse,
    taxiMergeDuplicate,
  };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
