/**
 * trends.js — Month-over-month comparison and trend analysis for BizHealth AI
 *
 * Operates only on stored P&L summaries — never invents or adjusts figures.
 * All comparisons are arithmetic differences and percentage changes.
 */

'use strict';

const Trends = (() => {

  const STORAGE_KEY = 'bizhealth_pnl_history';

  /** Load all stored monthly summaries, sorted oldest → newest */
  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /** Save a new monthly summary, replacing any existing entry for same period */
  function saveSummary(summary) {
    const history = loadHistory();
    const key = periodKey(summary.period);
    const idx = history.findIndex(h => periodKey(h.period) === key);
    if (idx >= 0) {
      history[idx] = summary;
    } else {
      history.push(summary);
    }
    history.sort((a, b) => {
      if (a.period.year !== b.period.year) return a.period.year - b.period.year;
      return a.period.month - b.period.month;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    return history;
  }

  function periodKey(period) {
    return `${period.year}-${String(period.month).padStart(2, '0')}`;
  }

  /**
   * Compare current summary against the immediately preceding month.
   * Returns null if no prior month exists.
   */
  function compareWithPrevious(currentSummary) {
    const history = loadHistory();
    const currentKey = periodKey(currentSummary.period);
    const idx = history.findIndex(h => periodKey(h.period) === currentKey);

    // Look for the entry before this one
    const prev = idx > 0 ? history[idx - 1] : (history.length > 0 && idx === -1 ? history[history.length - 1] : null);
    if (!prev) return null;

    return {
      previousPeriod:   prev.period,
      currentPeriod:    currentSummary.period,

      revenue: {
        previous: prev.totalRevenue,
        current:  currentSummary.totalRevenue,
        change:   delta(currentSummary.totalRevenue, prev.totalRevenue),
        pct:      pctChange(currentSummary.totalRevenue, prev.totalRevenue),
      },
      expenses: {
        previous: prev.totalExpenses,
        current:  currentSummary.totalExpenses,
        change:   delta(currentSummary.totalExpenses, prev.totalExpenses),
        pct:      pctChange(currentSummary.totalExpenses, prev.totalExpenses),
      },
      netProfit: {
        previous: prev.netProfit,
        current:  currentSummary.netProfit,
        change:   delta(currentSummary.netProfit, prev.netProfit),
        pct:      pctChange(currentSummary.netProfit, prev.netProfit),
      },
    };
  }

  /**
   * Analyze trends across all stored months.
   * Returns trend signals (no invented figures — all derived from stored data).
   */
  function analyzeTrends() {
    const history = loadHistory();
    if (history.length < 2) return { signals: [], history };

    const signals = [];
    const last3 = history.slice(-3);
    const last6 = history.slice(-6);

    // Revenue direction over last 3 months
    if (last3.length === 3) {
      const revs = last3.map(h => h.totalRevenue);
      if (revs[2] > revs[1] && revs[1] > revs[0]) {
        signals.push({ type: 'positive', metric: 'revenue', message: 'Revenue has increased for 3 consecutive months.' });
      } else if (revs[2] < revs[1] && revs[1] < revs[0]) {
        signals.push({ type: 'warning', metric: 'revenue', message: 'Revenue has declined for 3 consecutive months.' });
      }
    }

    // Expenses direction over last 3 months
    if (last3.length === 3) {
      const exps = last3.map(h => h.totalExpenses);
      if (exps[2] > exps[1] && exps[1] > exps[0]) {
        signals.push({ type: 'warning', metric: 'expenses', message: 'Expenses have risen for 3 consecutive months.' });
      } else if (exps[2] < exps[1] && exps[1] < exps[0]) {
        signals.push({ type: 'positive', metric: 'expenses', message: 'Expenses have decreased for 3 consecutive months.' });
      }
    }

    // Net profit trend
    if (last3.length === 3) {
      const profits = last3.map(h => h.netProfit);
      if (profits[2] < 0 && profits[1] < 0) {
        signals.push({ type: 'warning', metric: 'profit', message: 'Net loss recorded in 2 or more recent months.' });
      }
    }

    // Average profit margin over last 6
    if (last6.length >= 3) {
      const margins = last6.filter(h => h.profitMargin !== null).map(h => h.profitMargin);
      if (margins.length > 0) {
        const avg = margins.reduce((a, b) => a + b, 0) / margins.length;
        signals.push({ type: 'info', metric: 'margin', message: `Average profit margin over the last ${margins.length} months: ${avg.toFixed(1)}%.` });
      }
    }

    return { signals, history };
  }

  function delta(current, previous) {
    return Math.round((current - previous) * 100) / 100;
  }

  function pctChange(current, previous) {
    if (previous === 0) return null;
    return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10; // 1 decimal place
  }

  return { loadHistory, saveSummary, compareWithPrevious, analyzeTrends, periodKey };
})();
