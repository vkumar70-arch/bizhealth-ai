/**
 * taxi.js — Self-Employed Taxi Driver module for BizHealth AI
 *
 * Handles:
 *   - Daily fare entry by payment method (Cash / Mobile Wallet / Other)
 *   - Expense entry with payment method, category, date, description
 *   - Duplicate detection when a bank/wallet statement is uploaded
 *   - Monthly aggregation for the taxi P&L view
 *   - Cash business view, payment method analysis
 *
 * FINANCIAL RULES (hard constraints):
 *   - Loan proceeds are NEVER classified as taxi revenue.
 *   - Personal transactions are EXCLUDED from the taxi P&L.
 *   - Transactions flagged "needs review" appear in a pending list.
 *   - Net profit = total taxi fares − total business expenses.
 *   - Cash remaining = cash fares − cash expenses (informational only).
 *
 * All data stored in localStorage only. Nothing is transmitted.
 */

'use strict';

const Taxi = (() => {

  const MANUAL_KEY  = 'bizhealth_taxi_manual';   // manually entered fares + expenses
  const HISTORY_KEY = 'bizhealth_taxi_monthly';  // closed monthly snapshots

  // ─── Taxi-specific expense categories (superset of categorizer CATEGORIES) ──
  const EXPENSE_CATEGORIES = [
    { value: 'FUEL',              label: 'Fuel' },
    { value: 'TAXI_OIL',          label: 'Oil / Lubricants' },
    { value: 'REPAIRS',           label: 'Repairs & Maintenance' },
    { value: 'TAXI_TYRES',        label: 'Tyres' },
    { value: 'TAXI_PARTS',        label: 'Vehicle Parts' },
    { value: 'TAXI_BASE_FEE',     label: 'Taxi Base / Stand Fees' },
    { value: 'TAXI_PERMIT',       label: 'Taxi Permit / Licence' },
    { value: 'TAXI_REGISTRATION', label: 'Registration / Fitness' },
    { value: 'INSURANCE',         label: 'Insurance' },
    { value: 'TAXI_CAR_WASH',     label: 'Car Wash / Cleaning' },
    { value: 'TAXI_PARKING',      label: 'Parking' },
    { value: 'PHONE_INTERNET',    label: 'Phone / Data' },
    { value: 'TAXI_WALLET_FEES',  label: 'Mobile Wallet Fees' },
    { value: 'BANK_FEES',         label: 'Bank Fees' },
    { value: 'VEHICLE_FINANCE',   label: 'Vehicle Finance' },
    { value: 'LOAN_INTEREST',     label: 'Loan Interest' },
    { value: 'TAXI_OTHER',        label: 'Other Taxi Expense' },
    { value: 'PERSONAL',          label: 'Personal / Not Business' },
  ];

  // ─── Persistence ─────────────────────────────────────────────────────────────
  function loadManual() {
    try {
      const raw = localStorage.getItem(MANUAL_KEY);
      return raw ? JSON.parse(raw) : { fares: [], expenses: [] };
    } catch {
      return { fares: [], expenses: [] };
    }
  }

  function saveManual(data) {
    localStorage.setItem(MANUAL_KEY, JSON.stringify(data));
  }

  function loadMonthlyHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveMonthlyHistory(history) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }

  // ─── Add daily fares ──────────────────────────────────────────────────────────
  /**
   * Record a day's total fares by payment method.
   * Any method with amount = 0 is skipped.
   * @param {string} date     - YYYY-MM-DD
   * @param {number} cash     - cash fares total
   * @param {number} mobile   - mobile wallet fares total
   * @param {number} other    - other electronic fares total
   * @param {string} notes    - optional driver notes
   * @returns {Array} new fare entries added
   */
  function addDailyFares(date, cash, mobile, other, notes) {
    const data    = loadManual();
    const added   = [];
    const dateStr = date || todayISO();

    if (cash > 0) {
      const e = makeFareEntry(dateStr, round2(cash),   'cash',         'TAXI_FARE_CASH',   notes);
      data.fares.push(e); added.push(e);
    }
    if (mobile > 0) {
      const e = makeFareEntry(dateStr, round2(mobile), 'mobile_wallet','TAXI_FARE_MOBILE', notes);
      data.fares.push(e); added.push(e);
    }
    if (other > 0) {
      const e = makeFareEntry(dateStr, round2(other),  'other',        'TAXI_FARE_OTHER',  notes);
      data.fares.push(e); added.push(e);
    }

    saveManual(data);
    return added;
  }

  function makeFareEntry(date, amount, paymentMethod, category, notes) {
    const meta = Categorizer.CATEGORIES[category];
    return {
      id:            genId(),
      type:          'fare',
      date,
      amount,
      paymentMethod,
      category,
      categoryLabel: meta ? meta.label : category,
      description:   'Taxi Fares' + (notes ? ' — ' + notes : ''),
      businessUse:   'business',
      source:        'manual',
      isPossibleDuplicate: false,
      confirmedAt:   new Date().toISOString(),
    };
  }

  function deleteFare(id) {
    const data = loadManual();
    data.fares = data.fares.filter(f => f.id !== id);
    saveManual(data);
  }

  // ─── Add expense ──────────────────────────────────────────────────────────────
  /**
   * Record a business expense.
   * @param {object} opts - { amount, category, paymentMethod, date, description, businessUse }
   */
  function addExpense(opts) {
    const data = loadManual();
    const meta = Categorizer.CATEGORIES[opts.category];
    const entry = {
      id:            genId(),
      type:          'expense',
      date:          opts.date || todayISO(),
      amount:        round2(Math.abs(opts.amount)),
      paymentMethod: opts.paymentMethod || 'cash',
      category:      opts.category,
      categoryLabel: meta ? meta.label : opts.category,
      description:   opts.description || (meta ? meta.label : opts.category),
      businessUse:   opts.businessUse || 'business',
      source:        'manual',
      isPossibleDuplicate: false,
    };
    data.expenses.push(entry);
    saveManual(data);
    return entry;
  }

  function deleteExpense(id) {
    const data = loadManual();
    data.expenses = data.expenses.filter(e => e.id !== id);
    saveManual(data);
  }

  function updateExpenseBusinessUse(id, businessUse) {
    const data = loadManual();
    const e = data.expenses.find(x => x.id === id);
    if (e) { e.businessUse = businessUse; saveManual(data); }
  }

  // ─── Duplicate detection ──────────────────────────────────────────────────────
  /**
   * Given a list of statement transactions (from parser.js), check each one
   * against manually entered expenses for possible duplicates.
   *
   * Returns the transactions with { isPossibleDuplicate, duplicateOf } fields.
   * Does NOT auto-delete anything.
   *
   * Matching criteria (all must match):
   *   - Amount within $0.01
   *   - Date within 2 days
   *   - If payment method is known on both sides, it must match
   */
  function detectDuplicates(statementTransactions) {
    const data = loadManual();
    return statementTransactions.map(tx => {
      const txDate   = tx.date ? new Date(tx.date).getTime() : null;
      const txAmount = Math.abs(tx.amount);

      const match = data.expenses.find(e => {
        if (Math.abs(e.amount - txAmount) > 0.01) return false;
        if (txDate && e.date) {
          const eDate = new Date(e.date).getTime();
          if (Math.abs(txDate - eDate) > 2 * 86400000) return false;
        }
        // Payment method cross-check (bank statement → debit/credit/bank; manual has method)
        if (e.paymentMethod && tx.paymentMethod) {
          const statementIsBankCard = ['debit_card','credit_card','bank_transfer'].includes(tx.paymentMethod);
          const manualIsBankCard    = ['debit_card','credit_card','bank_transfer'].includes(e.paymentMethod);
          if (statementIsBankCard !== manualIsBankCard) return false;
        }
        return true;
      });

      if (match) {
        return { ...tx, isPossibleDuplicate: true, duplicateOf: match.id,
                 duplicateManualEntry: { id: match.id, description: match.description,
                                         amount: match.amount, date: match.date,
                                         category: match.categoryLabel } };
      }
      return { ...tx, isPossibleDuplicate: false };
    });
  }

  /**
   * User confirms two entries ARE the same — keep manual, discard statement version.
   * Marks the manual entry as confirmed (no-op beyond recording).
   */
  function mergeDuplicate(statementTxId, manualExpenseId) {
    const data = loadManual();
    const e = data.expenses.find(x => x.id === manualExpenseId);
    if (e) { e.duplicateMergedFrom = statementTxId; saveManual(data); }
  }

  // ─── Monthly aggregation ──────────────────────────────────────────────────────
  /**
   * Compute a taxi P&L summary for a given year-month (YYYY-MM),
   * combining manual entries with any categorized statement transactions.
   *
   * @param {string}  periodKey  - 'YYYY-MM'
   * @param {Array}   statementTxs - categorized transactions from app state (may be empty)
   * @returns {Object} taxiSummary
   */
  function computeMonthly(periodKey, statementTxs) {
    const data = loadManual();

    // Filter manual entries to this period
    const fares    = data.fares.filter(f => f.date && f.date.substring(0, 7) === periodKey);
    const manualExp= data.expenses.filter(e => e.date && e.date.substring(0, 7) === periodKey
                                               && e.businessUse === 'business');

    // Filter statement transactions to taxi-relevant ones (non-duplicate, business)
    const stmtExpenses = (statementTxs || []).filter(t =>
      t.categoryType === 'expense' && t.isPnL && t.businessUse !== 'personal' &&
      !t.isPossibleDuplicate
    );
    const stmtIncome = (statementTxs || []).filter(t =>
      t.categoryType === 'income' && t.isPnL && t.businessUse !== 'personal'
    );

    // Fare totals by payment method
    const fareCash   = sumWhere(fares, f => f.paymentMethod === 'cash');
    const fareMobile = sumWhere(fares, f => f.paymentMethod === 'mobile_wallet');
    const fareOther  = sumWhere(fares, f => f.paymentMethod === 'other');
    const totalFares = round2(fareCash + fareMobile + fareOther);

    // Expense totals (manual + statement, deduped)
    const allExpenses = [...manualExp, ...stmtExpenses];
    const totalExpenses = round2(allExpenses.reduce((s, e) => s + e.amount, 0));

    // Expense breakdown by category
    const expByCategory = {};
    for (const e of allExpenses) {
      const k = e.category || 'OTHER_EXPENSE';
      if (!expByCategory[k]) expByCategory[k] = { label: e.categoryLabel || k, total: 0, items: [] };
      expByCategory[k].total = round2(expByCategory[k].total + e.amount);
      expByCategory[k].items.push(e);
    }

    // Cash business view
    const cashFares    = fareCash;
    const cashExpenses = round2(
      allExpenses.filter(e => e.paymentMethod === 'cash').reduce((s,e) => s + e.amount, 0)
    );
    const cashRemaining = round2(cashFares - cashExpenses);

    // Expense by payment method
    const expByMethod = {};
    for (const e of allExpenses) {
      const pm = e.paymentMethod || 'other';
      expByMethod[pm] = round2((expByMethod[pm] || 0) + e.amount);
    }

    const netProfit    = round2(totalFares - totalExpenses);
    const profitMargin = totalFares > 0 ? round2((netProfit / totalFares) * 100) : null;

    // Uncategorized / needs review
    const needsReview = [
      ...data.fares.filter(f => f.businessUse === 'review'),
      ...data.expenses.filter(e => e.businessUse === 'review'),
      ...(statementTxs || []).filter(t => t.needsReview || t.businessUse === 'review'),
    ].filter(t => !t.date || t.date.substring(0, 7) === periodKey);

    return {
      periodKey,
      totalFares, fareCash, fareMobile, fareOther,
      totalExpenses, netProfit, profitMargin,
      expByCategory: Object.values(expByCategory).sort((a,b) => b.total - a.total),
      expByMethod,
      cashFares, cashExpenses, cashRemaining,
      fareCount:   fares.length,
      expenseCount:allExpenses.length,
      reviewCount: needsReview.length,
      fares, manualExp, stmtExpenses, stmtIncome,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  function round2(n)  { return Math.round(n * 100) / 100; }
  function todayISO() { return new Date().toISOString().substring(0, 10); }
  function sumWhere(arr, fn) { return round2(arr.filter(fn).reduce((s, x) => s + x.amount, 0)); }
  function genId() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function clearAllTaxiData() {
    localStorage.removeItem(MANUAL_KEY);
    localStorage.removeItem(HISTORY_KEY);
  }

  return {
    EXPENSE_CATEGORIES,
    addDailyFares,
    deleteFare,
    addExpense,
    deleteExpense,
    updateExpenseBusinessUse,
    detectDuplicates,
    mergeDuplicate,
    computeMonthly,
    loadManual,
    loadMonthlyHistory,
    clearAllTaxiData,
  };
})();
