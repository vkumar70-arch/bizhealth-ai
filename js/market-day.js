/**
 * market-day.js — Market Vendor Day Trading module for BizHealth AI
 *
 * State machine:  idle → open → trading → closed
 *
 * Open Day:   Vendor confirms opening float (cash on hand at start of day).
 *             Profit is measured AGAINST this float — money already in the
 *             till is NOT counted as revenue.
 *
 * Trade:      Each sale is tapped in. Expenses can be recorded (description +
 *             amount). Both update live totals in real time.
 *
 * Close Day:  Vendor sees net profit (sales − expenses), decides how much to
 *             save vs roll into tomorrow's float, and receives guidance on
 *             sizing the next day's float.
 *
 * All data is stored in localStorage only. Nothing leaves the device.
 *
 * FINANCIAL RULES (hard constraints):
 *  - Opening float is NEVER counted as revenue.
 *  - Net profit = total sales − total expenses (not affected by float).
 *  - Closing float = opening float + net profit − saved amount.
 *  - Suggested next float is advisory only; vendor decides.
 */

'use strict';

const MarketDay = (() => {

  const STORAGE_KEY    = 'bizhealth_market_day';
  const HISTORY_KEY    = 'bizhealth_market_day_history';

  // ─── Expense categories relevant for market vendors ──────────────────────
  const EXPENSE_TYPES = [
    { value: 'INVENTORY',    label: 'Stock / Inventory' },
    { value: 'FUEL',         label: 'Fuel / Transport' },
    { value: 'MARKET_FEE',   label: 'Market / Stall Fee' },
    { value: 'PACKAGING',    label: 'Packaging / Bags' },
    { value: 'FOOD_PREP',    label: 'Food Prep / Ingredients' },
    { value: 'PHONE',        label: 'Phone / Mobile Money Fee' },
    { value: 'WAGES',        label: 'Helper / Wages' },
    { value: 'OTHER',        label: 'Other Expense' },
  ];

  // ─── Load / save active day ───────────────────────────────────────────────
  function loadActiveDay() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveActiveDay(day) {
    if (day) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(day));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  // ─── Load / save history ──────────────────────────────────────────────────
  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveHistory(history) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }

  function appendToHistory(closedDay) {
    const history = loadHistory();
    history.unshift(closedDay); // newest first
    // Keep last 90 days
    saveHistory(history.slice(0, 90));
  }

  // ─── Open Day ─────────────────────────────────────────────────────────────
  /**
   * Start a new trading day.
   * @param {number} openingFloat  - cash on hand at start of day (not revenue)
   * @param {string} marketName    - optional name/location of the market
   * @param {string} currency      - currency code, default 'USD'
   */
  function openDay(openingFloat, marketName, currency) {
    if (loadActiveDay()) throw new Error('A day is already open. Close it before opening a new one.');
    const day = {
      id:            genId(),
      status:        'trading',           // 'trading' | 'closed'
      openedAt:      new Date().toISOString(),
      closedAt:      null,
      marketName:    marketName || '',
      currency:      currency   || 'USD',
      openingFloat:  round2(openingFloat || 0),
      sales:         [],                  // { id, amount, description, time }
      expenses:      [],                  // { id, amount, description, type, typeLabel, time }
      savedAmount:   0,
      nextFloat:     0,
      notes:         '',
    };
    saveActiveDay(day);
    return day;
  }

  // ─── Record a sale ────────────────────────────────────────────────────────
  /**
   * Log a sale. description is optional.
   * @returns {Object} updated day
   */
  function recordSale(amount, description) {
    const day = loadActiveDay();
    if (!day || day.status !== 'trading') throw new Error('No open trading day.');
    const sale = {
      id:          genId(),
      amount:      round2(Math.abs(amount)),
      description: description || '',
      time:        new Date().toISOString(),
    };
    day.sales.push(sale);
    saveActiveDay(day);
    return day;
  }

  /**
   * Delete a sale by id (correction).
   */
  function deleteSale(saleId) {
    const day = loadActiveDay();
    if (!day || day.status !== 'trading') throw new Error('No open trading day.');
    day.sales = day.sales.filter(s => s.id !== saleId);
    saveActiveDay(day);
    return day;
  }

  // ─── Record an expense ────────────────────────────────────────────────────
  /**
   * Log an expense.
   * @param {number} amount
   * @param {string} description
   * @param {string} type   - key from EXPENSE_TYPES
   * @returns {Object} updated day
   */
  function recordExpense(amount, description, type) {
    const day = loadActiveDay();
    if (!day || day.status !== 'trading') throw new Error('No open trading day.');
    const expType = EXPENSE_TYPES.find(e => e.value === type) || EXPENSE_TYPES[EXPENSE_TYPES.length - 1];
    const expense = {
      id:          genId(),
      amount:      round2(Math.abs(amount)),
      description: description || expType.label,
      type:        expType.value,
      typeLabel:   expType.label,
      time:        new Date().toISOString(),
    };
    day.expenses.push(expense);
    saveActiveDay(day);
    return day;
  }

  /**
   * Delete an expense by id (correction).
   */
  function deleteExpense(expenseId) {
    const day = loadActiveDay();
    if (!day || day.status !== 'trading') throw new Error('No open trading day.');
    day.expenses = day.expenses.filter(e => e.id !== expenseId);
    saveActiveDay(day);
    return day;
  }

  // ─── Live totals ──────────────────────────────────────────────────────────
  /**
   * Compute running totals from the active (or any) day object.
   * Returns:
   *   totalSales, totalExpenses, netProfit,
   *   expectedCash (float + net), transactionCount
   */
  function computeTotals(day) {
    if (!day) return { totalSales: 0, totalExpenses: 0, netProfit: 0, expectedCash: 0, transactionCount: 0 };
    const totalSales    = round2(day.sales.reduce((s, t)    => s + t.amount, 0));
    const totalExpenses = round2(day.expenses.reduce((s, e) => s + e.amount, 0));
    const netProfit     = round2(totalSales - totalExpenses);
    const expectedCash  = round2(day.openingFloat + netProfit);
    return {
      totalSales,
      totalExpenses,
      netProfit,
      expectedCash,
      transactionCount: day.sales.length + day.expenses.length,
    };
  }

  // ─── Close Day ────────────────────────────────────────────────────────────
  /**
   * Close the trading day.
   * @param {number} savedAmount   - how much the vendor is setting aside
   * @param {string} notes         - optional vendor notes
   * @returns {Object} closed day with summary
   */
  function closeDay(savedAmount, notes) {
    const day = loadActiveDay();
    if (!day || day.status !== 'trading') throw new Error('No open trading day.');

    const totals     = computeTotals(day);
    const saved      = round2(Math.min(Math.max(savedAmount || 0, 0), totals.netProfit));
    const nextFloat  = round2(totals.expectedCash - saved);

    day.status      = 'closed';
    day.closedAt    = new Date().toISOString();
    day.savedAmount = saved;
    day.nextFloat   = nextFloat;
    day.notes       = notes || '';
    day.summary     = { ...totals, savedAmount: saved, nextFloat };

    // Archive and clear active day
    appendToHistory(day);
    saveActiveDay(null);

    return day;
  }

  // ─── Float guidance ───────────────────────────────────────────────────────
  /**
   * Advisory guidance on sizing the next day's float.
   * Based on average daily expenses from recent history.
   * Returns a suggestion string — purely educational.
   */
  function floatGuidance(proposedNextFloat) {
    const history = loadHistory().filter(d => d.status === 'closed').slice(0, 7);
    if (history.length === 0) return null;

    const avgExpenses = round2(
      history.reduce((s, d) => {
        const t = computeTotals(d);
        return s + t.totalExpenses;
      }, 0) / history.length
    );

    const lines = [];
    if (avgExpenses > 0) {
      lines.push(`Your average daily expenses over the last ${history.length} day(s) were ${fmt(avgExpenses)}.`);
    }
    if (proposedNextFloat < avgExpenses * 0.8 && avgExpenses > 0) {
      lines.push(`Your proposed float of ${fmt(proposedNextFloat)} may be less than your typical daily expenses. Consider whether it covers stock, transport, and market fees.`);
    } else if (proposedNextFloat > avgExpenses * 3 && avgExpenses > 0) {
      lines.push(`Your proposed float of ${fmt(proposedNextFloat)} is significantly higher than your typical daily expenses. Keeping large amounts of cash at the market carries risk — consider what you actually need each day.`);
    } else {
      lines.push(`Your proposed float of ${fmt(proposedNextFloat)} looks reasonable based on your recent daily expenses.`);
    }
    lines.push('This is educational guidance only — you know your business best.');
    return lines.join(' ');
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  function round2(n) { return Math.round(n * 100) / 100; }

  function genId() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function fmt(amount) {
    return Math.abs(amount).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }

  function clearAllMarketData() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(HISTORY_KEY);
  }

  return {
    EXPENSE_TYPES,
    openDay,
    recordSale,
    deleteSale,
    recordExpense,
    deleteExpense,
    computeTotals,
    closeDay,
    floatGuidance,
    loadActiveDay,
    loadHistory,
    clearAllMarketData,
  };
})();
