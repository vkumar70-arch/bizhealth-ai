/**
 * suggestions.js — Educational financial wellness suggestions for BizHealth AI
 *
 * DESIGN PRINCIPLES:
 *  - All suggestions are educational and presented as "considerations", not advice.
 *  - No lending, credit, or investment recommendations.
 *  - Suggestions are triggered by observable patterns in the data — never invented.
 *  - Every suggestion is clearly labelled as a suggestion for consideration.
 *  - No specific financial figures are recommended (e.g., "save X amount").
 */

'use strict';

const Suggestions = (() => {

  const DISCLAIMER = 'This is an educational suggestion for your consideration, not financial advice. Please consult a qualified financial professional for guidance specific to your situation.';

  /**
   * Generate educational suggestions based on the P&L statement, trend data, and business type.
   *
   * @param {Object} statement - P&L statement from pnl.js
   * @param {Object|null} comparison - month-over-month comparison from trends.js
   * @param {Object} trendAnalysis - { signals, history } from trends.js
   * @param {string} businessType - optional business type string
   * @returns {Array} suggestions - array of suggestion objects
   */
  function generate(statement, comparison, trendAnalysis, businessType) {
    const suggestions = [];
    const totalRevenue  = statement.revenue.total;
    const totalExpenses = statement.expenses.total;

    // ── Profitability ─────────────────────────────────────────────────────────
    if (statement.netProfit < 0) {
      suggestions.push({
        id:       'net-loss',
        type:     'warning',
        title:    'Your business recorded a net loss this month',
        body:     'Your total expenses exceeded your revenue this period. You may want to review your largest expense categories to identify any discretionary or reducible costs. Consider speaking with a financial professional about strategies to improve cash flow.',
        disclaimer: DISCLAIMER,
      });
    } else if (statement.profitMargin !== null && statement.profitMargin < 10) {
      suggestions.push({
        id:       'thin-margin',
        type:     'info',
        title:    'Profit margin is relatively narrow this month',
        body:     'Your profit margin is in single digits. Businesses in some industries operate on thin margins by design, but it may be worth reviewing whether pricing, cost of goods, or overhead expenses have room for improvement. A bookkeeper or accountant can help you benchmark against your industry.',
        disclaimer: DISCLAIMER,
      });
    } else if (statement.netProfit > 0 && statement.profitMargin !== null && statement.profitMargin >= 20) {
      suggestions.push({
        id:       'healthy-margin',
        type:     'positive',
        title:    'Strong profit margin this month',
        body:     'Your business generated a healthy profit margin this period. This is a good time to consider whether a portion of profits should be set aside for taxes, an emergency fund, or reinvestment. A financial advisor can help you think through options.',
        disclaimer: DISCLAIMER,
      });
    }

    // ── Positive operating profit ─────────────────────────────────────────────
    if (statement.netProfit > 0) {
      suggestions.push({
        id:       'positive-profit',
        type:     'positive',
        title:    'The business generated a positive monthly operating profit',
        body:     `Revenue exceeded expenses this month, resulting in a positive net business result of ${formatMoney(statement.netProfit)}. Continue monitoring your income and expense trends month over month.`,
        disclaimer: null,
      });
    }

    // ── Revenue concentration ─────────────────────────────────────────────────
    if (statement.revenue.items.length === 1 && totalRevenue > 0) {
      suggestions.push({
        id:       'revenue-concentration',
        type:     'info',
        title:    'All revenue appears to come from a single source',
        body:     'Relying on a single revenue source or client can increase financial risk. You may want to consider whether diversifying your income streams is feasible for your business model.',
        disclaimer: DISCLAIMER,
      });
    }

    // ── Uncategorized transactions ────────────────────────────────────────────
    if ((statement.uncategorizedCount || 0) > 0) {
      suggestions.push({
        id:       'uncategorized',
        type:     'action',
        title:    `${statement.uncategorizedCount} transaction(s) are uncategorized`,
        body:     'Some transactions could not be reliably classified and are listed as "Uncategorized Income" or "Uncategorized Expense." Reviewing and correcting these will improve the accuracy of your P&L and help the system classify similar transactions in the future.',
        disclaimer: null,
      });
    }

    // ── Pending review ────────────────────────────────────────────────────────
    if (statement.pendingReview > 0) {
      suggestions.push({
        id:       'pending-review',
        type:     'action',
        title:    `${statement.pendingReview} transaction(s) need your review`,
        body:     'Some transactions were categorized with lower confidence and need your confirmation or correction. Reviewing these ensures your P&L statement accurately reflects your business activity.',
        disclaimer: null,
      });
    }

    // ── Expense category checks ───────────────────────────────────────────────
    if (totalRevenue > 0) {
      for (const group of statement.expenses.items) {
        const pct = (group.total / totalRevenue) * 100;

        if (group.category === 'RENT' && pct > 30) {
          suggestions.push({
            id:       'rent-ratio',
            type:     'warning',
            title:    'Rent represents a high percentage of monthly revenue',
            body:     `Rent accounts for ${pct.toFixed(0)}% of your revenue this month. High occupancy costs can put pressure on profitability. It may be worth reviewing your lease terms or exploring ways to increase revenue to improve this ratio. Discuss options with a financial professional.`,
            disclaimer: DISCLAIMER,
          });
        }

        if (group.category === 'PAYROLL' && pct > 60) {
          suggestions.push({
            id:       'payroll-ratio',
            type:     'info',
            title:    'Payroll represents a large share of revenue',
            body:     `Payroll costs represent ${pct.toFixed(0)}% of your revenue this month. Depending on your industry, this may be expected. It can be worth tracking whether this ratio is stable month to month.`,
            disclaimer: DISCLAIMER,
          });
        }

        if (group.category === 'FUEL' && pct > 15) {
          suggestions.push({
            id:       'fuel-ratio',
            type:     'info',
            title:    'Fuel costs represent a large portion of operating expenses',
            body:     `Fuel expenses account for ${pct.toFixed(0)}% of your revenue this month. ${businessType === 'taxi' ? 'For a transportation business, fuel is a primary cost — tracking it monthly can help identify inefficiencies or route optimization opportunities.' : 'You may want to track this trend to ensure it aligns with business activity.'}`,
            disclaimer: DISCLAIMER,
          });
        }

        if ((group.category === 'BANK_FEES' || group.category === 'MERCHANT_FEES') && group.total > 50) {
          suggestions.push({
            id:       'bank-fees',
            type:     'info',
            title:    'Bank and payment processing fees were incurred',
            body:     'Payment processing and bank service fees are common but worth monitoring. Some business bank accounts and payment processors offer lower fee structures depending on transaction volume. Comparing options periodically may be worthwhile.',
            disclaimer: DISCLAIMER,
          });
        }

        if (group.category === 'MARKETING' && pct > 20) {
          suggestions.push({
            id:       'advertising-ratio',
            type:     'info',
            title:    'Advertising expenses increased significantly',
            body:     `Advertising and marketing represent ${pct.toFixed(0)}% of your revenue this month. High marketing spend can be appropriate during growth phases. Tracking your return on advertising investment can help evaluate effectiveness.`,
            disclaimer: DISCLAIMER,
          });
        }

        if (group.category === 'MEALS' && pct > 5) {
          suggestions.push({
            id:       'meals-ratio',
            type:     'info',
            title:    'Meals expense is notable',
            body:     'Meals expenses can add up. Many small business owners review this category regularly to ensure it aligns with business activity. Note that tax deductibility rules for meals have specific requirements — consult a tax professional.',
            disclaimer: DISCLAIMER,
          });
        }
      }
    }

    // ── Business-type specific insights ───────────────────────────────────────
    if (businessType) {
      const cogsTotal = statement.cogs ? statement.cogs.total : 0;
      if (['retail', 'restaurant', 'market_vendor', 'agriculture'].includes(businessType) && cogsTotal === 0 && totalRevenue > 0) {
        suggestions.push({
          id:       'missing-cogs',
          type:     'info',
          title:    'No Cost of Goods Sold detected',
          body:     `For a ${businessTypeName(businessType)} business, inventory and cost-of-goods purchases are typically a significant expense. If your statement does not include these, the gross profit figure may not reflect your true operating cost. Review your transactions to ensure inventory/supplier payments are correctly categorized.`,
          disclaimer: DISCLAIMER,
        });
      }

      if (businessType === 'taxi' || businessType === 'construction') {
        const vehicleGroups = statement.expenses.items.filter(g => g.category === 'VEHICLE' || g.category === 'FUEL');
        if (vehicleGroups.length > 0) {
          const vehicleTotal = vehicleGroups.reduce((s, g) => s + g.total, 0);
          const pct = totalRevenue > 0 ? (vehicleTotal / totalRevenue) * 100 : 0;
          if (pct > 0) {
            suggestions.push({
              id:       'vehicle-costs',
              type:     'info',
              title:    `Fuel and vehicle costs represent ${pct.toFixed(0)}% of revenue`,
              body:     `For your type of business, vehicle and fuel costs are primary operating expenses. Tracking these monthly helps identify trends and potential efficiency improvements.`,
              disclaimer: DISCLAIMER,
            });
          }
        }
      }

      // ── Taxi-specific insights ───────────────────────────────────────────────
      if (businessType === 'taxi') {
        // Cash proportion of total revenue (high cash = reconciliation tip)
        const taxiData = typeof Taxi !== 'undefined' ? Taxi.loadManual() : null;
        if (taxiData && taxiData.fares.length > 0) {
          const currentMonth = new Date().toISOString().substring(0, 7);
          const monthFares   = taxiData.fares.filter(f => f.date && f.date.substring(0, 7) === currentMonth);
          const totalFareAmt = monthFares.reduce((s, f) => s + f.amount, 0);
          const cashFareAmt  = monthFares.filter(f => f.paymentMethod === 'cash').reduce((s, f) => s + f.amount, 0);
          const cashPct      = totalFareAmt > 0 ? (cashFareAmt / totalFareAmt) * 100 : 0;

          if (cashPct > 70) {
            suggestions.push({
              id:       'taxi-high-cash',
              type:     'info',
              title:    `${cashPct.toFixed(0)}% of your fares this month were cash`,
              body:     'Most of your income is cash-based. Keeping a daily cash log and recording fares promptly helps ensure your records are accurate and reduces discrepancies. Some drivers find it useful to bank cash regularly throughout the week.',
              disclaimer: DISCLAIMER,
            });
          }

          // Three or more entries not yet in this month's total
          const reviewEntries = taxiData.expenses.filter(e => e.businessUse === 'review' && e.date && e.date.substring(0, 7) === currentMonth);
          if (reviewEntries.length >= 3) {
            suggestions.push({
              id:       'taxi-review-needed',
              type:     'action',
              title:    `${reviewEntries.length} expense entries are marked "Not Sure"`,
              body:     'Some expense entries have not been confirmed as business or personal. Reviewing these in the Taxi P&L view will ensure they are correctly included in or excluded from your profit calculation.',
              disclaimer: null,
            });
          }

          // Fuel ratio check using taxi module data
          const fuelExp = taxiData.expenses.filter(e => e.category === 'FUEL' && e.businessUse === 'business' && e.date && e.date.substring(0, 7) === currentMonth);
          const fuelTotal = fuelExp.reduce((s, e) => s + e.amount, 0);
          if (totalFareAmt > 0 && fuelTotal > 0) {
            const fuelPct = (fuelTotal / totalFareAmt) * 100;
            if (fuelPct > 20) {
              suggestions.push({
                id:       'taxi-fuel-ratio',
                type:     'info',
                title:    `Fuel costs are ${fuelPct.toFixed(0)}% of your taxi revenue`,
                body:     'Fuel is typically the largest operating cost for a taxi driver. Monitoring this ratio monthly can highlight the effect of fuel price changes or shifts in driving patterns. Some drivers track kilometres per litre to spot vehicle efficiency changes early.',
                disclaimer: DISCLAIMER,
              });
            }
          }
        }
      }

      // ── Market Vendor insights (using day-trading history) ───────────────────
      if (businessType === 'market_vendor') {
        const mdHistory = typeof MarketDay !== 'undefined' ? MarketDay.loadHistory() : [];
        const closedDays = mdHistory.filter(d => d.status === 'closed');

        if (closedDays.length >= 2) {
          const recentDays = closedDays.slice(0, 14); // last 14 days max

          // Compute per-day totals
          const dayTotals = recentDays.map(d => MarketDay.computeTotals(d));

          // ── Consecutive loss days ──────────────────────────────────────────
          const lastThree = dayTotals.slice(0, 3);
          if (lastThree.length === 3 && lastThree.every(t => t.netProfit < 0)) {
            suggestions.push({
              id:       'md-consecutive-losses',
              type:     'warning',
              title:    'Your last 3 market days all recorded a net loss',
              body:     'Expenses have exceeded sales on each of your last three market days. It may be worth reviewing your stock costs, stall fees, and pricing to understand whether your margins are covering your daily costs. Consider speaking with a business advisor.',
              disclaimer: DISCLAIMER,
            });
          }

          // ── High expense ratio ─────────────────────────────────────────────
          const totalSalesAll  = dayTotals.reduce((s, t) => s + t.totalSales,    0);
          const totalExpAll    = dayTotals.reduce((s, t) => s + t.totalExpenses, 0);
          if (totalSalesAll > 0) {
            const expRatio = (totalExpAll / totalSalesAll) * 100;
            if (expRatio > 60) {
              suggestions.push({
                id:       'md-high-exp-ratio',
                type:     'warning',
                title:    `Expenses are ${expRatio.toFixed(0)}% of sales over your recent days`,
                body:     'Your operating costs are consuming a large portion of your sales revenue. The biggest drivers are typically stock/inventory, stall fees, and transport. Reviewing each category to see where costs can be reduced may help improve your daily profit.',
                disclaimer: DISCLAIMER,
              });
            }
          }

          // ── No savings habit on profitable days ───────────────────────────
          const profitableDays   = recentDays.filter((_, i) => dayTotals[i].netProfit > 0);
          const neverSaved       = profitableDays.length >= 5 && profitableDays.every(d => !d.savedAmount || d.savedAmount === 0);
          if (neverSaved) {
            suggestions.push({
              id:       'md-no-savings',
              type:     'info',
              title:    'You\'ve had profitable days but haven\'t set aside savings',
              body:     `You've recorded ${profitableDays.length} profitable market days recently without setting aside any savings. When closing a day, you can record an amount to save separately from your float. Building even a small business reserve can help on slower days.`,
              disclaimer: DISCLAIMER,
            });
          }

          // ── Inventory dominates expenses ──────────────────────────────────
          const categoryTotals = {};
          for (const d of recentDays) {
            for (const e of d.expenses) {
              categoryTotals[e.type] = (categoryTotals[e.type] || 0) + e.amount;
            }
          }
          const sortedCats = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
          if (sortedCats.length > 0 && sortedCats[0][0] === 'INVENTORY' && totalSalesAll > 0) {
            const inventoryPct = (sortedCats[0][1] / totalSalesAll) * 100;
            if (inventoryPct > 40) {
              suggestions.push({
                id:       'md-inventory-cost',
                type:     'info',
                title:    `Stock and inventory purchases are ${inventoryPct.toFixed(0)}% of your sales`,
                body:     'Your stock replenishment cost is your largest expense. Tracking your sell-through rate — how much of what you buy you actually sell — can help you buy more efficiently and reduce wastage. This is especially important for perishable goods.',
                disclaimer: DISCLAIMER,
              });
            }
          }

          // ── Market / stall fee as fixed cost ──────────────────────────────
          const stallFeeDays = recentDays.filter(d => d.expenses.some(e => e.type === 'MARKET_FEE'));
          if (stallFeeDays.length >= 3) {
            const totalFees  = stallFeeDays.reduce((s, d) => s + d.expenses.filter(e => e.type === 'MARKET_FEE').reduce((x, e) => x + e.amount, 0), 0);
            const avgFee     = totalFees / stallFeeDays.length;
            const avgSales   = totalSalesAll / recentDays.length;
            if (avgSales > 0 && (avgFee / avgSales) > 0.1) {
              suggestions.push({
                id:       'md-stall-fee',
                type:     'info',
                title:    'Market / stall fees are a significant fixed daily cost',
                body:     `Your stall fee averages ${formatMoney(avgFee)} per day. As a fixed cost, it must be covered before any profit is made. Tracking the minimum daily sales needed to cover your stall fee and other fixed costs — your "break-even" — can help you set daily sales targets.`,
                disclaimer: DISCLAIMER,
              });
            }
          }
        } else if (closedDays.length === 0 && typeof MarketDay !== 'undefined') {
          // New market vendor — encourage first use
          suggestions.push({
            id:       'md-no-history',
            type:     'action',
            title:    'Start tracking your market days',
            body:     'Your business type is set to Market Vendor. Use the Market Day tab to log each day\'s sales and expenses in real time. After closing a few days, personalised insights about your profit trends and cost structure will appear here.',
            disclaimer: null,
          });
        }
      }
    }

    // ── Personal transactions ─────────────────────────────────────────────────
    if (statement.nonPnL.personalCount > 0) {
      suggestions.push({
        id:       'personal-mixing',
        type:     'info',
        title:    `${statement.nonPnL.personalCount} personal transaction(s) detected`,
        body:     'Transactions marked as personal have been separated from your business P&L. Mixing personal and business finances in the same account can complicate bookkeeping and tax preparation. Many financial professionals recommend maintaining a dedicated business bank account.',
        disclaimer: DISCLAIMER,
      });
    }

    // ── Non-P&L items present ─────────────────────────────────────────────────
    if (statement.nonPnL.loanProceeds.total > 0) {
      suggestions.push({
        id:       'loan-proceeds-noted',
        type:     'info',
        title:    'Loan proceeds have been excluded from revenue',
        body:     `Loan proceeds of ${formatMoney(statement.nonPnL.loanProceeds.total)} were detected and correctly excluded from your revenue. Loan funds represent borrowed money and are not business income. Your repayment schedule may affect future cash flow — a financial advisor can help you plan accordingly.`,
        disclaimer: DISCLAIMER,
      });
    }

    // ── Month-over-month signals ───────────────────────────────────────────────
    if (comparison) {
      if (comparison.revenue.pct !== null && comparison.revenue.pct < -15) {
        suggestions.push({
          id:       'revenue-decline',
          type:     'warning',
          title:    'Revenue declined significantly compared to last month',
          body:     `Revenue is down ${Math.abs(comparison.revenue.pct)}% compared to ${comparison.previousPeriod.label}. It may be worth reviewing what drove the change — seasonal factors, a lost client, or reduced transaction volume.`,
          disclaimer: DISCLAIMER,
        });
      }

      if (comparison.revenue.pct !== null && comparison.revenue.pct > 15) {
        suggestions.push({
          id:       'revenue-growth',
          type:     'positive',
          title:    'Revenue increased compared to last month',
          body:     `Revenue is up ${comparison.revenue.pct}% compared to ${comparison.previousPeriod.label}. `,
          disclaimer: null,
        });
      }

      if (comparison.expenses.pct !== null && comparison.expenses.pct > 20) {
        suggestions.push({
          id:       'expense-increase',
          type:     'warning',
          title:    'Expenses increased significantly compared to last month',
          body:     `Total expenses rose ${comparison.expenses.pct}% compared to ${comparison.previousPeriod.label}. Reviewing which categories drove the increase can help you understand whether it was planned (e.g., a one-time purchase) or unexpected.`,
          disclaimer: DISCLAIMER,
        });
      }
    }

    // ── Multi-month trend signals ─────────────────────────────────────────────
    for (const signal of (trendAnalysis.signals || [])) {
      if (signal.type === 'warning' && signal.metric === 'revenue') {
        suggestions.push({
          id:       'trend-revenue-decline',
          type:     'warning',
          title:    'Revenue trend: declining over multiple months',
          body:     signal.message + ' Sustained revenue decline may warrant a review of your sales or marketing strategy.',
          disclaimer: DISCLAIMER,
        });
      }
      if (signal.type === 'warning' && signal.metric === 'expenses') {
        suggestions.push({
          id:       'trend-expense-rise',
          type:     'warning',
          title:    'Expense trend: rising over multiple months',
          body:     signal.message + ' Steadily rising costs can compress margins over time. A line-by-line expense review with a bookkeeper may help identify areas for reduction.',
          disclaimer: DISCLAIMER,
        });
      }
      if (signal.type === 'warning' && signal.metric === 'profit') {
        suggestions.push({
          id:       'trend-net-loss',
          type:     'warning',
          title:    'Net loss in multiple recent months',
          body:     signal.message + ' Repeated net losses are a signal worth discussing with a financial professional who specializes in small businesses.',
          disclaimer: DISCLAIMER,
        });
      }
      if (signal.type === 'positive' && signal.metric === 'revenue') {
        suggestions.push({
          id:       'trend-revenue-up',
          type:     'positive',
          title:    'Revenue trend: growing over multiple months',
          body:     signal.message,
          disclaimer: null,
        });
      }
    }

    // Deduplicate by id
    const seen = new Set();
    return suggestions.filter(s => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
  }

  function businessTypeName(type) {
    const names = {
      retail: 'retail', restaurant: 'restaurant', agriculture: 'farming',
      taxi: 'taxi/transportation', freelancer: 'freelancer', professional: 'professional services',
      market_vendor: 'market vendor', construction: 'construction', other: 'small business',
    };
    return names[type] || 'small business';
  }

  function formatMoney(amount) {
    const abs = Math.abs(amount);
    return abs.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }

  return { generate, DISCLAIMER };
})();
