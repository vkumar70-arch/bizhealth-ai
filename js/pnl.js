/**
 * pnl.js — Deterministic Profit & Loss calculator for BizHealth AI
 *
 * RULES (hard constraints):
 *  - Only transactions with isPnL === true are included in P&L.
 *  - Loan proceeds are EXCLUDED from revenue.
 *  - Owner contributions are EXCLUDED from revenue.
 *  - Loan principal payments are EXCLUDED from expenses.
 *  - Owner draws are EXCLUDED from expenses.
 *  - All arithmetic uses integer cents to avoid floating-point errors.
 *  - Gross Profit  = Total Revenue − Cost of Goods Sold (isCOGS === true)
 *  - Net Profit    = Gross Profit − Operating Expenses
 */

'use strict';

const PnL = (() => {

  /** Round to 2 decimal places, avoiding floating-point drift */
  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  /**
   * Build a Profit & Loss statement from a list of categorized transactions.
   *
   * @param {Array} transactions - categorized transaction objects
   * @param {Object} period - { year, month, label }
   * @returns {Object} pnlStatement
   */
  function buildStatement(transactions, period) {
    // Only P&L-eligible transactions
    const eligible = transactions.filter(t => t.isPnL === true);

    // Separate income and expense
    const incomeItems  = eligible.filter(t => t.categoryType === 'income');
    const expenseItems = eligible.filter(t => t.categoryType === 'expense');

    // Split expenses into COGS and operating expenses
    const cogsItems      = expenseItems.filter(t => t.isCOGS === true);
    const operatingItems = expenseItems.filter(t => t.isCOGS !== true);

    // Group by category
    const incomeByCategory    = groupByCategory(incomeItems,    true);
    const cogsByCategory      = groupByCategory(cogsItems,      false);
    const operatingByCategory = groupByCategory(operatingItems, false);

    // Totals (all values are positive amounts)
    const totalRevenue    = round2(incomeByCategory.reduce((s, g)    => s + g.total, 0));
    const totalCOGS       = round2(cogsByCategory.reduce((s, g)      => s + g.total, 0));
    const grossProfit     = round2(totalRevenue - totalCOGS);
    const totalOperating  = round2(operatingByCategory.reduce((s, g) => s + g.total, 0));
    const totalExpenses   = round2(totalCOGS + totalOperating);
    const netProfit       = round2(grossProfit - totalOperating);
    const profitMargin    = totalRevenue > 0 ? round2((netProfit  / totalRevenue) * 100) : null;
    const grossMargin     = totalRevenue > 0 ? round2((grossProfit / totalRevenue) * 100) : null;

    // Non-P&L summary (informational only, clearly labelled)
    const loanProceeds    = sumCategory(transactions, 'LOAN_PROCEEDS');
    const ownerContribs   = sumCategory(transactions, 'OWNER_CONTRIBUTION');
    const loanRepayments  = sumCategory(transactions, 'LOAN_PRINCIPAL');
    const ownerDraws      = sumCategory(transactions, 'OWNER_DRAW');
    const transfersIn     = sumCategory(transactions, 'TRANSFER_IN');
    const transfersOut    = sumCategory(transactions, 'TRANSFER_OUT');
    const personalItems   = transactions.filter(t => t.categoryType === 'personal');
    const uncategorized   = transactions.filter(t =>
      t.category === 'UNCATEGORIZED_INCOME' || t.category === 'UNCATEGORIZED_EXPENSE'
    );

    return {
      period,
      generatedAt: new Date().toISOString(),

      // P&L statement — structured for the standard format
      revenue: {
        items: incomeByCategory,
        total: totalRevenue,
      },
      cogs: {
        items: cogsByCategory,
        total: totalCOGS,
      },
      grossProfit,
      grossMargin,
      operatingExpenses: {
        items: operatingByCategory,
        total: totalOperating,
      },
      expenses: {
        // Combined for backwards compat (category rows UI, suggestions, etc.)
        items: [...cogsByCategory, ...operatingByCategory].sort((a, b) => b.total - a.total),
        total: totalExpenses,
      },
      netProfit,
      profitMargin,

      // Non-P&L informational section
      nonPnL: {
        loanProceeds:   { total: loanProceeds,   label: 'Loan Received (not revenue)' },
        ownerContribs:  { total: ownerContribs,  label: 'Owner Contributions (not revenue)' },
        loanRepayments: { total: loanRepayments, label: 'Loan Principal Payments (not P&L expense)' },
        ownerDraws:     { total: ownerDraws,     label: 'Owner Withdrawals (not P&L expense)' },
        transfersIn:    { total: transfersIn,    label: 'Transfers In (between accounts)' },
        transfersOut:   { total: transfersOut,   label: 'Transfers Out (between accounts)' },
        personalCount:  personalItems.length,
        personalItems,
      },

      // Counts
      totalTransactions:  transactions.length,
      includedInPnL:      eligible.length,
      pendingReview:      transactions.filter(t => t.needsReview).length,
      uncategorizedCount: uncategorized.length,
    };
  }

  function groupByCategory(items, isIncome) {
    const map = {};
    for (const t of items) {
      const key = t.category;
      if (!map[key]) {
        map[key] = { category: key, label: t.categoryLabel, isCOGS: t.isCOGS || false, transactions: [], total: 0 };
      }
      const val = Math.abs(t.amount);
      map[key].transactions.push(t);
      map[key].total = round2(map[key].total + val);
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }

  function sumCategory(transactions, category) {
    return round2(
      transactions
        .filter(t => t.category === category)
        .reduce((s, t) => s + Math.abs(t.amount), 0)
    );
  }

  /**
   * Summarize a statement into a compact object for trend storage.
   */
  function toSummary(statement) {
    return {
      period:        statement.period,
      totalRevenue:  statement.revenue.total,
      totalCOGS:     statement.cogs.total,
      grossProfit:   statement.grossProfit,
      totalExpenses: statement.expenses.total,
      netProfit:     statement.netProfit,
      profitMargin:  statement.profitMargin,
      grossMargin:   statement.grossMargin,
      topExpense:    statement.expenses.items[0] || null,
      topIncome:     statement.revenue.items[0]  || null,
    };
  }

  return { buildStatement, toSummary, round2 };
})();
