/**
 * ui.js — All view renderers for BizHealth AI
 *
 * Views:
 *   upload    — file upload screen (with business type selector)
 *   review    — transaction review (confirm / override low-confidence items)
 *   pnl       — P&L statement + comparison + suggestions
 *   history   — list of past monthly sessions
 *   rules     — manage learned classification rules
 *   settings  — data & privacy management
 *   marketday — Market Vendor Day Trading (open → trade → close)
 */

'use strict';

const UI = (() => {

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  // ─── Root render dispatcher ───────────────────────────────────────────────
  function render(state) {
    const root = $('#app');
    if (!root) return;

    root.innerHTML = buildShell(state.view, state.sessions.length, state);

    switch (state.view) {
      case 'upload':    renderUpload(state);    break;
      case 'review':    renderReview(state);    break;
      case 'pnl':       renderPnL(state);       break;
      case 'history':   renderHistory(state);   break;
      case 'rules':     renderRules(state);     break;
      case 'settings':  renderSettings(state);  break;
      case 'marketday': renderMarketDay(state); break;
      case 'taxi':      renderTaxi(state);      break;
    }

    bindGlobalEvents();
  }

  // ─── Shell / nav ─────────────────────────────────────────────────────────
  function buildShell(activeView, sessionCount, state) {
    // We pass state here so the nav can show a live-day indicator
    const hasActiveDay = !!(state && state.marketDay && state.marketDay.status === 'trading');
    return `
      <header class="top-bar">
        <div class="top-bar-inner">
          <div class="brand">
            <span class="brand-icon">&#9643;</span>
            <span class="brand-name">BizHealth <span class="brand-ai">AI</span></span>
          </div>
          <nav class="main-nav">
            <button class="nav-btn ${activeView === 'upload'    ? 'active' : ''}" data-nav="upload">Upload</button>
            <button class="nav-btn ${activeView === 'history'   ? 'active' : ''}" data-nav="history">
              History${sessionCount > 0 ? ` <span class="badge">${sessionCount}</span>` : ''}
            </button>
            <button class="nav-btn market-day-nav-btn ${activeView === 'marketday' ? 'active' : ''}" data-nav="marketday">
              Market Day${hasActiveDay ? ' <span class="live-dot" title="Day in progress"></span>' : ''}
            </button>
            <button class="nav-btn taxi-nav-btn ${activeView === 'taxi' ? 'active' : ''}" data-nav="taxi">&#128663; Taxi</button>
            <button class="nav-btn ${activeView === 'rules'     ? 'active' : ''}" data-nav="rules">Rules</button>
            <button class="nav-btn ${activeView === 'settings'  ? 'active' : ''}" data-nav="settings">Settings</button>
          </nav>
        </div>
      </header>
      <main class="main-content" id="main-content"></main>
      <div class="toast-area" id="toast-area"></div>
      <div id="modal-overlay" class="modal-overlay hidden"></div>
    `;
  }

  function bindGlobalEvents() {
    $$('[data-nav]').forEach(btn => {
      btn.addEventListener('click', () => App.navigate(btn.dataset.nav));
    });
  }

  // ─── Upload view ──────────────────────────────────────────────────────────
  function renderUpload(state) {
    const main = $('#main-content');

    const businessTypeOptions = Categorizer.BUSINESS_TYPES.map(bt =>
      `<option value="${bt.value}" ${bt.value === state.businessType ? 'selected' : ''}>${escHtml(bt.label)}</option>`
    ).join('');

    main.innerHTML = `
      <div class="view-upload">
        <div class="upload-hero">
          <h1 class="upload-title">Monthly Financial Wellness</h1>
          <p class="upload-subtitle">Upload your bank or mobile-wallet statement to generate your monthly profit &amp; loss summary, track trends, and receive educational insights.</p>
        </div>

        <div class="upload-card" id="drop-zone">
          <div class="upload-icon">&#8679;</div>
          <p class="upload-cta">Drag &amp; drop your statement file here, or</p>
          <label class="btn btn-primary upload-btn-label">
            Choose File
            <input type="file" id="file-input" accept=".csv,.txt,.tsv" class="sr-only">
          </label>
          <p class="upload-hint">Supported formats: CSV, TXT — Bank statements, mobile-wallet exports</p>
        </div>

        <div class="business-type-card">
          <label class="biz-type-label" for="business-type-select">
            <strong>Business Type</strong>
            <span class="biz-type-hint">Optional — helps improve expense classification and recommendations</span>
          </label>
          <select id="business-type-select" class="biz-type-select">
            ${businessTypeOptions}
          </select>
        </div>

        <div class="upload-info-grid">
          <div class="info-card">
            <div class="info-card-icon">&#128274;</div>
            <h3>Private by design</h3>
            <p>All data is processed in your browser and stored only on your device using localStorage. Nothing is sent to any server.</p>
          </div>
          <div class="info-card">
            <div class="info-card-icon">&#9654;</div>
            <h3>No invented figures</h3>
            <p>Financial calculations are deterministic. Every number in your P&amp;L traces directly to your uploaded transactions.</p>
          </div>
          <div class="info-card">
            <div class="info-card-icon">&#9998;</div>
            <h3>You stay in control</h3>
            <p>Review and override any transaction category. Low-confidence classifications always require your confirmation. The app learns from your corrections.</p>
          </div>
          <div class="info-card">
            <div class="info-card-icon">&#128218;</div>
            <h3>Educational only</h3>
            <p>Suggestions are for consideration and learning — not financial advice. Always consult a qualified professional.</p>
          </div>
        </div>

        <div class="sample-note">
          <strong>Don't have a statement handy?</strong>
          <button class="btn btn-secondary btn-sm" id="load-sample-btn">Load sample data</button>
        </div>
      </div>
    `;

    // Business type selector
    $('#business-type-select').addEventListener('change', e => {
      App.setBusinessType(e.target.value);
    });

    // File input
    const fileInput = $('#file-input');
    fileInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) App.handleFileUpload(file);
    });

    // Drag & drop
    const dropZone = $('#drop-zone');
    dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) App.handleFileUpload(file);
    });

    $('#load-sample-btn').addEventListener('click', loadSampleData);
  }

  function loadSampleData() {
    const sample = [
      'Date,Description,Amount',
      '2024-03-01,Square Payment - Retail Sales,1250.00',
      '2024-03-02,Stripe Payout - Online Store,840.50',
      '2024-03-03,ACME Wholesale Supplier,-320.00',
      '2024-03-04,Chase Bank Monthly Fee,-15.00',
      '2024-03-05,Facebook Ads,-120.00',
      '2024-03-06,Consulting Fee - Client Project,2000.00',
      '2024-03-07,Comcast Business Internet,-89.99',
      '2024-03-08,Office Supplies - Staples,-45.30',
      '2024-03-09,Gusto Payroll,-1800.00',
      '2024-03-10,Rent - Commercial Space,-950.00',
      '2024-03-11,SBA Loan Deposit,5000.00',
      '2024-03-12,Owner Draw,-500.00',
      '2024-03-13,Netflix Personal,-15.99',
      '2024-03-14,Walmart Grocery,-67.50',
      '2024-03-15,Quickbooks Subscription,-30.00',
      '2024-03-16,Client Payment - Invoice #44,3500.00',
      '2024-03-17,Chase Bank Wire Fee,-25.00',
      '2024-03-18,Google Ads,-200.00',
      '2024-03-19,Business Insurance - Hiscox,-110.00',
      '2024-03-20,Client Lunch - Restaurant,-85.00',
      '2024-03-21,Amazon Prime Personal,-14.99',
      '2024-03-22,Transfer to Savings Account,-1000.00',
      '2024-03-25,Estimated Tax Payment IRS,-600.00',
      '2024-03-28,Square Payment - Weekend Market,675.00',
      '2024-03-29,Shell Gas Station,-68.00',
      '2024-03-31,Stripe Fee,-28.50',
    ].join('\n');

    const blob = new Blob([sample], { type: 'text/csv' });
    const file = new File([blob], 'sample-march-2024.csv', { type: 'text/csv' });
    App.handleFileUpload(file);
  }

  // ─── Column mapper modal ──────────────────────────────────────────────────
  function showColumnMapper(columns, sampleRows, filename, onConfirm) {
    const overlay = $('#modal-overlay');
    overlay.classList.remove('hidden');

    const colOptions = columns.map((c, i) =>
      `<option value="${i}">${escHtml(c) || '(column ' + (i+1) + ')'}</option>`
    ).join('');

    const makeSelect = (fieldName, label, required = false) => `
      <div class="mapper-field">
        <label class="mapper-label">${label}${required ? ' <span class="required">*</span>' : ' <span class="mapper-optional">(optional)</span>'}</label>
        <select class="mapper-select" data-field="${fieldName}">
          <option value="-1">— not in this file —</option>
          ${colOptions}
        </select>
      </div>
    `;

    // Sample table
    const sampleHeaderRow = columns.map(c => `<th>${escHtml(c)}</th>`).join('');
    const sampleDataRows = sampleRows.map(row =>
      `<tr>${row.map(c => `<td>${escHtml(truncate(c, 25))}</td>`).join('')}</tr>`
    ).join('');

    overlay.innerHTML = `
      <div class="modal-box">
        <h3 class="modal-title">Map Columns — ${escHtml(filename)}</h3>
        <p class="modal-subtitle">We couldn't automatically detect the column layout of this file. Please tell us which column contains each piece of information.</p>

        <div class="mapper-sample-scroll">
          <table class="mapper-sample-table">
            <thead><tr>${sampleHeaderRow}</tr></thead>
            <tbody>${sampleDataRows}</tbody>
          </table>
        </div>

        <div class="mapper-fields">
          ${makeSelect('date',        'Date',        true)}
          ${makeSelect('description', 'Description / Narration', true)}
          ${makeSelect('amount',      'Amount (single column)')}
          ${makeSelect('credit',      'Credit / Deposit')}
          ${makeSelect('debit',       'Debit / Withdrawal')}
          ${makeSelect('balance',     'Balance')}
        </div>
        <p class="mapper-note">Either "Amount" <strong>or</strong> "Credit + Debit" columns are required.</p>

        <div class="modal-actions">
          <button class="btn btn-secondary" id="mapper-cancel">Cancel</button>
          <button class="btn btn-primary"   id="mapper-confirm">Import with these columns →</button>
        </div>
      </div>
    `;

    $('#mapper-cancel').addEventListener('click', () => {
      overlay.innerHTML = '';
      overlay.classList.add('hidden');
    });

    $('#mapper-confirm').addEventListener('click', () => {
      const mapping = {};
      $$('.mapper-select').forEach(sel => {
        mapping[sel.dataset.field] = parseInt(sel.value, 10);
      });
      // Validate
      if (mapping.description < 0) {
        showError('Please select the Description column.');
        return;
      }
      if (mapping.amount < 0 && mapping.credit < 0 && mapping.debit < 0) {
        showError('Please select at least one amount column (Amount, Credit, or Debit).');
        return;
      }
      overlay.innerHTML = '';
      overlay.classList.add('hidden');
      onConfirm(mapping);
    });
  }

  // ─── Review view ─────────────────────────────────────────────────────────
  function renderReview(state) {
    const main = $('#main-content');
    const { current } = state;
    if (!current) { App.navigate('upload'); return; }

    const needsReview   = current.transactions.filter(t => t.needsReview);
    const allCategories = Object.entries(Categorizer.CATEGORIES)
      .map(([k, v]) => ({ value: k, label: v.label, type: v.type }))
      .sort((a, b) => a.label.localeCompare(b.label));

    const rows = needsReview.map(t => {
      const confPct  = Math.round(t.confidence * 100);
      const confClass = confPct >= 70 ? 'conf-medium' : 'conf-low';
      const sourceBadge = buildSourceBadge(t.source);
      return `
        <div class="review-row" data-id="${t.id}">
          <div class="review-row-meta">
            <span class="review-date">${t.date || '—'}</span>
            <span class="review-desc" title="${escHtml(t.description)}">${escHtml(truncate(t.description, 55))}</span>
            <span class="review-amount ${t.amount >= 0 ? 'positive' : 'negative'}">
              ${formatMoney(t.amount)}
            </span>
          </div>
          <div class="review-row-cat">
            <div class="confidence-pill ${confClass}">
              <span class="conf-bar" style="width:${confPct}%"></span>
              <span class="conf-label">${confPct}% confident ${sourceBadge}</span>
            </div>
            <label class="sr-only" for="cat-${t.id}">Category</label>
            <select class="cat-select" id="cat-${t.id}" data-id="${t.id}">
              ${buildCategoryOptions(t.category)}
            </select>
          </div>
          <div class="review-row-actions">
            <button class="btn btn-confirm btn-sm" data-action="confirm" data-id="${t.id}">
              ✓ Confirm suggestion
            </button>
            <button class="btn btn-override btn-sm" data-action="override" data-id="${t.id}">
              ✎ Apply override
            </button>
          </div>
        </div>
      `;
    }).join('');

    main.innerHTML = `
      <div class="view-review">
        <div class="page-header">
          <div>
            <h2 class="page-title">Review Transactions</h2>
            <p class="page-subtitle">${current.period.label} &middot; ${needsReview.length} item${needsReview.length !== 1 ? 's' : ''} need your review</p>
          </div>
          <div class="page-header-actions">
            <button class="btn btn-secondary" id="skip-review-btn">Skip — confirm all suggestions</button>
            <button class="btn btn-primary" id="go-to-pnl-btn">View P&amp;L →</button>
          </div>
        </div>

        <div class="review-info-banner">
          <strong>Low-confidence transactions</strong> — The system was less certain about these categorizations.
          Please confirm the suggestion or choose a different category. Your corrections are saved and used to improve future classifications.
        </div>

        <div class="review-list" id="review-list">
          ${rows.length > 0 ? rows : '<p class="empty-state">All transactions have been reviewed.</p>'}
        </div>

        ${needsReview.length > 0 ? `
          <div class="review-footer">
            <button class="btn btn-secondary" id="skip-review-btn-bottom">Confirm all remaining suggestions</button>
            <button class="btn btn-primary" id="go-to-pnl-btn-bottom">Continue to P&amp;L →</button>
          </div>
        ` : `
          <div class="review-footer">
            <button class="btn btn-primary" id="go-to-pnl-btn-bottom">Continue to P&amp;L →</button>
          </div>
        `}
      </div>
    `;

    // Bind events
    $$('[data-action="confirm"]').forEach(btn => {
      btn.addEventListener('click', () => App.confirmTransaction(btn.dataset.id));
    });

    $$('[data-action="override"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const select = $(`#cat-${btn.dataset.id}`);
        App.overrideTransaction(btn.dataset.id, select.value);
      });
    });

    $$('#skip-review-btn, #skip-review-btn-bottom').forEach(b => b && b.addEventListener('click', () => App.confirmAllRemaining()));
    $$('#go-to-pnl-btn, #go-to-pnl-btn-bottom').forEach(b => b && b.addEventListener('click', () => App.navigate('pnl')));
  }

  // ─── P&L view ─────────────────────────────────────────────────────────────
  function renderPnL(state) {
    const main = $('#main-content');
    const { current } = state;
    if (!current || !current.statement) { App.navigate('upload'); return; }

    const s      = current.statement;
    const cmp    = current.comparison;
    const sugg   = current.suggestions;
    const trends = current.trendAnalysis;

    const pendingCount = current.transactions.filter(t => t.needsReview).length;
    const hasCOGS      = s.cogs && s.cogs.total > 0;

    main.innerHTML = `
      <div class="view-pnl">
        <div class="page-header">
          <div>
            <h2 class="page-title">Profit &amp; Loss — ${s.period.label}</h2>
            <p class="page-subtitle">
              ${s.totalTransactions} transactions &middot; ${s.includedInPnL} in P&amp;L
              ${pendingCount > 0 ? `&middot; <a class="review-link" href="#" id="go-review-link">${pendingCount} pending review</a>` : ''}
              ${(s.uncategorizedCount || 0) > 0 ? `&middot; <span class="uncategorized-flag">${s.uncategorizedCount} uncategorized</span>` : ''}
            </p>
          </div>
          <div class="page-header-actions">
            <button class="btn btn-secondary" id="upload-new-btn">+ Upload new month</button>
            ${pendingCount > 0 ? `<button class="btn btn-warning" id="go-review-btn">Review ${pendingCount} item${pendingCount !== 1 ? 's' : ''}</button>` : ''}
          </div>
        </div>

        ${pendingCount > 0 ? `
          <div class="alert alert-warning">
            <strong>&#9888; ${pendingCount} transaction(s) still need review.</strong>
            These are excluded from the P&L totals until confirmed.
            <a href="#" id="go-review-link2">Review now →</a>
          </div>
        ` : ''}

        <!-- KPI cards -->
        <div class="kpi-row">
          ${kpiCard('Total Revenue',  s.revenue.total, cmp ? cmp.revenue  : null, 'revenue')}
          ${hasCOGS ? kpiCard('Gross Profit',   s.grossProfit,   null,                   'profit') : ''}
          ${kpiCard('Total Expenses', s.expenses.total, cmp ? cmp.expenses : null, 'expenses')}
          ${kpiCard('Net Profit',     s.netProfit,   cmp ? cmp.netProfit : null, 'profit')}
          ${s.profitMargin !== null ? `
            <div class="kpi-card">
              <div class="kpi-label">Profit Margin</div>
              <div class="kpi-value ${s.profitMargin >= 0 ? 'positive' : 'negative'}">${s.profitMargin.toFixed(1)}%</div>
              <div class="kpi-sub">of revenue</div>
            </div>
          ` : ''}
        </div>

        <!-- Standard P&L layout -->
        <div class="pnl-statement">

          <!-- Revenue -->
          <div class="pnl-section">
            <div class="pnl-section-header revenue-header">
              <h3>Total Revenue</h3>
              <span class="pnl-section-total positive">${formatMoney(s.revenue.total)}</span>
            </div>
            ${s.revenue.items.length === 0
              ? '<p class="empty-state">No revenue transactions found.</p>'
              : s.revenue.items.map(g => categoryRow(g, true)).join('')
            }
          </div>

          ${hasCOGS ? `
            <!-- Cost of Goods Sold -->
            <div class="pnl-section">
              <div class="pnl-section-header cogs-header">
                <h3>Cost of Goods Sold</h3>
                <span class="pnl-section-total negative">(${formatMoney(s.cogs.total)})</span>
              </div>
              ${s.cogs.items.map(g => categoryRow(g, false)).join('')}
            </div>

            <!-- Gross Profit line -->
            <div class="pnl-subtotal-bar ${s.grossProfit >= 0 ? 'profit' : 'loss'}">
              <span class="pnl-subtotal-label">Gross Profit</span>
              <span class="pnl-subtotal-value">${formatMoney(s.grossProfit)}</span>
              ${s.grossMargin !== null ? `<span class="pnl-subtotal-pct">${s.grossMargin.toFixed(1)}% gross margin</span>` : ''}
            </div>

            <!-- Operating Expenses -->
            <div class="pnl-section">
              <div class="pnl-section-header expense-header">
                <h3>Operating Expenses</h3>
                <span class="pnl-section-total">${formatMoney(s.operatingExpenses.total)}</span>
              </div>
              ${s.operatingExpenses.items.length === 0
                ? '<p class="empty-state">No operating expenses found.</p>'
                : s.operatingExpenses.items.map(g => categoryRow(g, false)).join('')
              }
            </div>
          ` : `
            <!-- Expenses (no COGS split) -->
            <div class="pnl-section">
              <div class="pnl-section-header expense-header">
                <h3>Expenses</h3>
                <span class="pnl-section-total">${formatMoney(s.expenses.total)}</span>
              </div>
              ${s.expenses.items.length === 0
                ? '<p class="empty-state">No expense transactions found.</p>'
                : s.expenses.items.map(g => categoryRow(g, false)).join('')
              }
            </div>
          `}

          <!-- Net profit bar -->
          <div class="net-profit-bar ${s.netProfit >= 0 ? 'profit' : 'loss'}">
            <span class="net-label">Net ${s.netProfit >= 0 ? 'Profit' : 'Loss'} (Operating Result)</span>
            <span class="net-value">${formatMoney(Math.abs(s.netProfit))}</span>
          </div>
        </div>

        <!-- Personal spending — always visible, clearly separate from P&L -->
        ${buildPersonalSection(s.nonPnL, current.transactions)}

        <!-- Non-P&L informational section (loans, transfers, owner draws) -->
        ${buildNonPnLSection(s.nonPnL)}

        <!-- Month-over-month comparison -->
        ${cmp ? buildComparison(cmp) : ''}

        <!-- Trends chart (text-based) -->
        ${trends && trends.history.length > 1 ? buildTrendsSection(trends) : ''}

        <!-- Transaction detail table -->
        ${buildTransactionTable(current.transactions)}

        <!-- Suggestions -->
        ${sugg.length > 0 ? buildSuggestions(sugg) : ''}

        <div class="pnl-footer-note">
          <strong>Important:</strong> This P&amp;L is generated from categorized transactions from your uploaded statement.
          It is for informational and educational purposes only and does not constitute professional accounting or financial advice.
          Always work with a qualified accountant or bookkeeper for official financial statements.
        </div>
      </div>
    `;

    // Bind events
    $$('#upload-new-btn').forEach(b => b && b.addEventListener('click', () => App.navigate('upload')));
    $$('#go-review-btn,#go-review-link,#go-review-link2').forEach(b => b && b.addEventListener('click', e => { e.preventDefault(); App.navigate('review'); }));

    // Expandable category rows
    $$('.cat-row-header').forEach(hdr => {
      hdr.addEventListener('click', () => {
        const rows = hdr.closest('.cat-row').querySelector('.cat-txns');
        if (rows) {
          rows.classList.toggle('open');
          hdr.querySelector('.expand-arrow').classList.toggle('open');
        }
      });
    });

    // Override buttons in transaction table
    $$('[data-action="tx-override"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const select = $(`#tx-cat-${id}`);
        if (select) App.overrideTransaction(id, select.value);
      });
    });
  }

  function kpiCard(label, value, cmp, type) {
    const valClass = type === 'profit' ? (value >= 0 ? 'positive' : 'negative') : '';

    let cmpHtml = '';
    if (cmp && cmp.pct !== null) {
      const up  = cmp.change > 0;
      const good = type === 'expenses' ? !up : up;
      const arrow = up ? '▲' : '▼';
      cmpHtml = `<div class="kpi-cmp ${good ? 'good' : 'bad'}">${arrow} ${Math.abs(cmp.pct)}% vs prior month</div>`;
    }

    return `
      <div class="kpi-card">
        <div class="kpi-label">${label}</div>
        <div class="kpi-value ${valClass}">${formatMoney(Math.abs(value))}${value < 0 && type !== 'expenses' ? ' <span class="loss-indicator">(loss)</span>' : ''}</div>
        ${cmpHtml}
      </div>
    `;
  }

  function categoryRow(group, isIncome) {
    const txRows = group.transactions.map(t => {
      const sourceBadge = buildSourceBadge(t.source);
      return `
        <tr class="tx-detail-row">
          <td>${t.date || '—'}</td>
          <td class="tx-desc">${escHtml(t.description)} ${sourceBadge}</td>
          <td class="tx-amt ${t.amount >= 0 ? 'positive' : 'negative'}">${formatMoney(t.amount)}</td>
          <td>
            <select class="cat-select-inline" id="tx-cat-${t.id}" title="Change category">
              ${buildCategoryOptions(t.category)}
            </select>
            <button class="btn btn-xs" data-action="tx-override" data-id="${t.id}">Apply</button>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="cat-row">
        <div class="cat-row-header">
          <span class="cat-row-label">${group.label}</span>
          <span class="cat-row-count">${group.transactions.length} txn${group.transactions.length !== 1 ? 's' : ''}</span>
          <span class="cat-row-total">${formatMoney(group.total)}</span>
          <span class="expand-arrow">&#9660;</span>
        </div>
        <div class="cat-txns">
          <table class="tx-table">
            <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Category</th></tr></thead>
            <tbody>${txRows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ── Personal spending section — always shown, clearly labelled ──────────────
  function buildPersonalSection(nonPnL, allTransactions) {
    const personalItems = nonPnL.personalItems
      || allTransactions.filter(t => t.categoryType === 'personal');

    if (personalItems.length === 0) {
      return `
        <div class="personal-section personal-section-empty">
          <div class="personal-section-header">
            <h4 class="personal-section-title">&#128100; Personal Expenses</h4>
            <span class="personal-section-note">excluded from your P&amp;L</span>
          </div>
          <p class="personal-section-hint">
            No personal transactions were detected in this statement.
            To mark a transaction as personal, go to the <strong>All Transactions</strong> table below,
            change its category to <strong>Personal (non-business)</strong>, and click Apply.
          </p>
        </div>
      `;
    }

    const total = personalItems.reduce((s, t) => s + Math.abs(t.amount), 0);
    const rows  = [...personalItems]
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .map(t => `
        <div class="personal-tx-row">
          <span class="personal-tx-date">${t.date || '—'}</span>
          <span class="personal-tx-desc">${escHtml(truncate(t.description, 48))}</span>
          <span class="personal-tx-cat">${escHtml(t.categoryLabel || t.category || '')}</span>
          <span class="personal-tx-amt ${t.amount >= 0 ? 'positive' : 'negative'}">${formatMoney(t.amount)}</span>
        </div>
      `).join('');

    return `
      <div class="personal-section">
        <div class="personal-section-header">
          <h4 class="personal-section-title">&#128100; Personal Expenses
            <span class="personal-section-count">${personalItems.length} item${personalItems.length !== 1 ? 's' : ''}</span>
          </h4>
          <span class="personal-section-total">${formatMoney(total)} <span class="personal-section-note">excluded from P&amp;L</span></span>
        </div>
        <div class="personal-tx-list">
          ${rows}
        </div>
      </div>
    `;
  }

  function buildNonPnLSection(nonPnL) {
    const items = [
      nonPnL.loanProceeds.total   > 0 ? { label: nonPnL.loanProceeds.label,   val: nonPnL.loanProceeds.total   } : null,
      nonPnL.ownerContribs.total  > 0 ? { label: nonPnL.ownerContribs.label,  val: nonPnL.ownerContribs.total  } : null,
      nonPnL.loanRepayments.total > 0 ? { label: nonPnL.loanRepayments.label, val: nonPnL.loanRepayments.total } : null,
      nonPnL.ownerDraws.total     > 0 ? { label: nonPnL.ownerDraws.label,     val: nonPnL.ownerDraws.total     } : null,
      (nonPnL.transfersIn  && nonPnL.transfersIn.total  > 0) ? { label: nonPnL.transfersIn.label,  val: nonPnL.transfersIn.total  } : null,
      (nonPnL.transfersOut && nonPnL.transfersOut.total > 0) ? { label: nonPnL.transfersOut.label, val: nonPnL.transfersOut.total } : null,
    ].filter(Boolean);

    if (items.length === 0) return '';

    const rows = items.map(i =>
      `<div class="nonpnl-row"><span>${i.label}</span><span>${formatMoney(i.val)}</span></div>`
    ).join('');

    return `
      <div class="nonpnl-section">
        <h4 class="nonpnl-title">Other Non-P&amp;L Items <span class="nonpnl-note">(excluded from profit/loss)</span></h4>
        ${rows}
      </div>
    `;
  }

  function buildComparison(cmp) {
    const row = (label, data, invertGood = false) => {
      if (!data || data.pct === null) return '';
      const up   = data.change > 0;
      const good = invertGood ? !up : up;
      return `
        <tr>
          <td>${label}</td>
          <td>${formatMoney(data.previous)}</td>
          <td>${formatMoney(data.current)}</td>
          <td class="${good ? 'positive' : 'negative'}">${up ? '▲' : '▼'} ${Math.abs(data.pct)}%</td>
        </tr>
      `;
    };

    return `
      <div class="comparison-section">
        <h4 class="section-title">vs. ${cmp.previousPeriod.label}</h4>
        <table class="comparison-table">
          <thead><tr><th>Metric</th><th>Prior Month</th><th>This Month</th><th>Change</th></tr></thead>
          <tbody>
            ${row('Revenue',    cmp.revenue,  false)}
            ${row('Expenses',   cmp.expenses, true)}
            ${row('Net Profit', cmp.netProfit, false)}
          </tbody>
        </table>
      </div>
    `;
  }

  function buildTrendsSection(trends) {
    const history = trends.history.slice(-6);
    if (history.length < 2) return '';

    const maxVal = Math.max(...history.map(h => Math.max(h.totalRevenue, h.totalExpenses)));
    const barH   = 80;

    const bars = history.map(h => {
      const rH = maxVal > 0 ? Math.round((h.totalRevenue  / maxVal) * barH) : 0;
      const eH = maxVal > 0 ? Math.round((h.totalExpenses / maxVal) * barH) : 0;
      return `
        <div class="trend-bar-group" title="${h.period.label}&#10;Revenue: ${formatMoney(h.totalRevenue)}&#10;Expenses: ${formatMoney(h.totalExpenses)}&#10;Net: ${formatMoney(h.netProfit)}">
          <div class="trend-bars">
            <div class="trend-bar revenue-bar" style="height:${rH}px"></div>
            <div class="trend-bar expense-bar" style="height:${eH}px"></div>
          </div>
          <div class="trend-label">${h.period.label.substring(0,3)}<br>${h.period.year}</div>
        </div>
      `;
    }).join('');

    return `
      <div class="trends-section">
        <h4 class="section-title">Revenue &amp; Expenses Trend</h4>
        <div class="trend-chart">
          <div class="trend-y-axis">
            <span>${formatMoney(maxVal)}</span>
            <span>${formatMoney(maxVal / 2)}</span>
            <span>$0</span>
          </div>
          <div class="trend-bars-area">${bars}</div>
        </div>
        <div class="trend-legend">
          <span class="legend-dot revenue-dot"></span> Revenue &nbsp;
          <span class="legend-dot expense-dot"></span> Expenses
        </div>
        ${trends.signals.map(sig => `
          <div class="trend-signal signal-${sig.type}">
            ${sig.type === 'positive' ? '✓' : sig.type === 'warning' ? '⚠' : 'ℹ'} ${sig.message}
          </div>
        `).join('')}
      </div>
    `;
  }

  function buildTransactionTable(transactions) {
    const rows = transactions.map(t => {
      const confPct    = Math.round(t.confidence * 100);
      const reviewFlag = t.needsReview  ? `<span class="review-flag" title="Needs review">⚠</span>` : '';
      const sourceBadge = buildSourceBadge(t.source);
      return `
        <tr class="${t.needsReview ? 'row-needs-review' : ''}">
          <td>${t.date || '—'}</td>
          <td class="tx-desc">${escHtml(truncate(t.description, 45))}${reviewFlag}</td>
          <td class="tx-amt ${t.amount >= 0 ? 'positive' : 'negative'}">${formatMoney(t.amount)}</td>
          <td>
            <select class="cat-select-inline" id="tx-cat-${t.id}" title="Change category">
              ${buildCategoryOptions(t.category)}
            </select>
          </td>
          <td class="conf-cell">
            <div class="conf-mini ${confPct >= 75 ? 'conf-high' : confPct >= 50 ? 'conf-medium' : 'conf-low'}">
              ${confPct}%
            </div>
          </td>
          <td class="source-cell">${sourceBadge}</td>
          <td>
            <button class="btn btn-xs" data-action="tx-override" data-id="${t.id}">Apply</button>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="tx-table-section">
        <h4 class="section-title">All Transactions <span class="tx-count">(${transactions.length})</span></h4>
        <div class="tx-table-wrapper">
          <table class="tx-table full-tx-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Category</th>
                <th>Confidence</th>
                <th>Source</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function buildSuggestions(suggestions) {
    const cards = suggestions.map(s => `
      <div class="suggestion-card suggestion-${s.type}">
        <div class="suggestion-header">
          <span class="suggestion-icon">${s.type === 'warning' ? '⚠' : s.type === 'positive' ? '✓' : s.type === 'action' ? '→' : 'ℹ'}</span>
          <strong>${escHtml(s.title)}</strong>
        </div>
        <p class="suggestion-body">${escHtml(s.body)}</p>
        ${s.disclaimer ? `<p class="suggestion-disclaimer">${escHtml(s.disclaimer)}</p>` : ''}
      </div>
    `).join('');

    return `
      <div class="suggestions-section">
        <h4 class="section-title">Financial Health Insights &amp; Suggestions</h4>
        <p class="suggestions-intro">The following observations are based on your uploaded data and are presented as educational considerations only. They are not financial, tax, or legal advice.</p>
        <div class="suggestions-grid">${cards}</div>
      </div>
    `;
  }

  // ─── History view ─────────────────────────────────────────────────────────
  function renderHistory(state) {
    const main    = $('#main-content');
    const sessions = state.sessions.slice().reverse();

    if (sessions.length === 0) {
      main.innerHTML = `
        <div class="view-history">
          <div class="page-header">
            <h2 class="page-title">Monthly History</h2>
          </div>
          <div class="empty-state-large">
            <p>No monthly statements uploaded yet.</p>
            <button class="btn btn-primary" data-nav="upload">Upload your first statement</button>
          </div>
        </div>
      `;
      bindGlobalEvents();
      return;
    }

    const rows = sessions.map(s => {
      const stmt = s.statement;
      if (!stmt) return '';
      const profitClass = stmt.netProfit >= 0 ? 'positive' : 'negative';
      return `
        <div class="history-row" data-period-key="${s.periodKey}">
          <div class="history-period">${s.period.label}</div>
          <div class="history-metrics">
            <span class="hist-metric">
              <span class="hist-metric-label">Revenue</span>
              <span class="hist-metric-val">${formatMoney(stmt.revenue.total)}</span>
            </span>
            <span class="hist-metric">
              <span class="hist-metric-label">Expenses</span>
              <span class="hist-metric-val">${formatMoney(stmt.expenses.total)}</span>
            </span>
            <span class="hist-metric">
              <span class="hist-metric-label">Net</span>
              <span class="hist-metric-val ${profitClass}">${formatMoney(stmt.netProfit)}</span>
            </span>
            ${stmt.profitMargin !== null ? `
              <span class="hist-metric">
                <span class="hist-metric-label">Margin</span>
                <span class="hist-metric-val ${profitClass}">${stmt.profitMargin.toFixed(1)}%</span>
              </span>
            ` : ''}
          </div>
          <button class="btn btn-secondary btn-sm history-open-btn" data-period-key="${s.periodKey}">Open →</button>
        </div>
      `;
    }).join('');

    main.innerHTML = `
      <div class="view-history">
        <div class="page-header">
          <h2 class="page-title">Monthly History</h2>
          <button class="btn btn-primary" data-nav="upload">+ Upload New Month</button>
        </div>
        <div class="history-list">${rows}</div>
      </div>
    `;

    bindGlobalEvents();
    $$('.history-open-btn').forEach(btn => {
      btn.addEventListener('click', () => App.loadHistoricalSession(btn.dataset.periodKey));
    });
  }

  // ─── Learned Rules view ───────────────────────────────────────────────────
  function renderRules(state) {
    const main  = $('#main-content');
    const rules = Categorizer.loadLearnedRules();

    if (rules.length === 0) {
      main.innerHTML = `
        <div class="view-rules">
          <div class="page-header">
            <h2 class="page-title">Learned Classification Rules</h2>
          </div>
          <div class="empty-state-large">
            <p>No learned rules yet. When you correct a transaction category, BizHealth AI saves the correction here and applies it to future uploads.</p>
            <p class="rules-example">
              Example: If you change <em>SHELL GAS STATION</em> from "Other Expense" to <strong>Fuel / Transportation</strong>,
              that correction is remembered and applied automatically next month.
            </p>
          </div>
        </div>
      `;
      return;
    }

    const rows = rules.map(r => `
      <tr class="rule-row" data-key="${escHtml(r.merchantKey)}">
        <td class="rule-merchant">${escHtml(r.normalizedDesc || r.merchantKey)}</td>
        <td class="rule-category">${escHtml(r.categoryLabel)}</td>
        <td class="rule-date">${r.addedAt ? new Date(r.addedAt).toLocaleDateString() : '—'}</td>
        <td>
          <select class="cat-select-inline rule-cat-select" data-key="${escHtml(r.merchantKey)}">
            ${buildCategoryOptions(r.category)}
          </select>
        </td>
        <td>
          <button class="btn btn-xs" data-action="edit-rule" data-key="${escHtml(r.merchantKey)}">Save</button>
          <button class="btn btn-xs btn-danger" data-action="delete-rule" data-key="${escHtml(r.merchantKey)}">Delete</button>
        </td>
      </tr>
    `).join('');

    main.innerHTML = `
      <div class="view-rules">
        <div class="page-header">
          <div>
            <h2 class="page-title">Learned Classification Rules</h2>
            <p class="page-subtitle">${rules.length} rule${rules.length !== 1 ? 's' : ''} — applied automatically to future uploads</p>
          </div>
        </div>
        <div class="rules-info-banner">
          These rules are stored only on your device. When a future transaction description matches a rule, the system automatically applies the learned category with high confidence.
        </div>
        <div class="tx-table-wrapper">
          <table class="tx-table rules-table">
            <thead>
              <tr>
                <th>Merchant / Description</th>
                <th>Learned Category</th>
                <th>Saved On</th>
                <th>Change Category</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;

    // Edit rule
    $$('[data-action="edit-rule"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key    = btn.dataset.key;
        const select = $(`.rule-cat-select[data-key="${key}"]`);
        if (!select) return;
        const rules = Categorizer.loadLearnedRules();
        const rule  = rules.find(r => r.merchantKey === key);
        if (rule) {
          rule.category      = select.value;
          rule.categoryLabel = Categorizer.CATEGORIES[select.value] ? Categorizer.CATEGORIES[select.value].label : select.value;
          Categorizer.saveLearnedRules(rules);
          showSuccess('Rule updated.');
          renderRules(state);
        }
      });
    });

    // Delete rule
    $$('[data-action="delete-rule"]').forEach(btn => {
      btn.addEventListener('click', () => {
        Categorizer.deleteLearnedRule(btn.dataset.key);
        showSuccess('Rule deleted.');
        renderRules(state);
      });
    });
  }

  // ─── Settings view ────────────────────────────────────────────────────────
  function renderSettings(state) {
    const main = $('#main-content');

    main.innerHTML = `
      <div class="view-settings">
        <div class="page-header">
          <h2 class="page-title">Settings &amp; Data Privacy</h2>
        </div>

        <div class="settings-privacy-note">
          <strong>&#128274; Privacy by Design</strong><br>
          BizHealth AI processes all data locally in your browser. Your financial data and learned classification rules are stored using <code>localStorage</code> on this device only. No data is transmitted to any server.
          <br><br>
          Different users on different browsers have completely separate data — your financial history and learned rules remain private to your device.
        </div>

        <div class="settings-section">
          <h3 class="settings-section-title">What is stored on this device?</h3>
          <table class="settings-storage-table">
            <thead><tr><th>Data</th><th>Key</th><th>Purpose</th></tr></thead>
            <tbody>
              <tr><td>Monthly Sessions</td><td><code>bizhealth_sessions</code></td><td>Transaction history &amp; P&amp;L results</td></tr>
              <tr><td>P&amp;L History</td><td><code>bizhealth_pnl_history</code></td><td>Month-over-month trend comparisons</td></tr>
              <tr><td>Learned Rules</td><td><code>bizhealth_learned_rules</code></td><td>Auto-classification of future transactions</td></tr>
              <tr><td>Business Type</td><td><code>bizhealth_business_type</code></td><td>Improves category suggestions</td></tr>
              <tr><td>Market Day (active)</td><td><code>bizhealth_market_day</code></td><td>In-progress trading day</td></tr>
              <tr><td>Market Day History</td><td><code>bizhealth_market_day_history</code></td><td>Past daily trading summaries</td></tr>
              <tr><td>Taxi Fares &amp; Expenses</td><td><code>bizhealth_taxi_manual</code></td><td>Manually entered taxi fares and expenses</td></tr>
              <tr><td>Taxi Monthly History</td><td><code>bizhealth_taxi_monthly</code></td><td>Closed taxi monthly snapshots</td></tr>
            </tbody>
          </table>
        </div>

        <div class="settings-section">
          <h3 class="settings-section-title">Data Management</h3>

          <div class="settings-action-card">
            <div class="settings-action-info">
              <strong>Clear Transaction History</strong>
              <p>Deletes your uploaded transaction history and monthly P&amp;L reports, but <strong>preserves your learned classification rules and business type preference</strong>. Use this to remove sensitive financial history without resetting your classifications.</p>
            </div>
            <button class="btn btn-secondary" id="clear-history-btn">Clear Transaction History</button>
          </div>

          <div class="settings-action-card settings-action-danger">
            <div class="settings-action-info">
              <strong>Clear All Data</strong>
              <p>Permanently deletes all BizHealth AI data stored on this device — transaction history, P&amp;L reports, learned classification rules, and business type preference. This cannot be undone.</p>
            </div>
            <button class="btn btn-danger" id="clear-all-btn">Clear All Data</button>
          </div>
        </div>
      </div>
    `;

    $('#clear-history-btn').addEventListener('click', () => {
      if (confirm('Clear transaction history? This will permanently delete your uploaded transaction history and monthly P&L reports. Learned classification rules and your business type preference will be preserved. This action cannot be undone.')) {
        App.clearTransactionHistory();
      }
    });

    $('#clear-all-btn').addEventListener('click', () => {
      showClearAllConfirm();
    });
  }

  function showClearAllConfirm() {
    const overlay = $('#modal-overlay');
    overlay.classList.remove('hidden');
    overlay.innerHTML = `
      <div class="modal-box modal-danger">
        <h3 class="modal-title">Clear All BizHealth AI Data?</h3>
        <p class="modal-body">
          This will permanently delete your <strong>transaction history, monthly reports, saved classifications, learned expense/income classification rules,</strong> and other BizHealth AI data stored on this device.
          <br><br>
          <strong>This action cannot be undone.</strong>
        </p>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="clear-cancel-btn">Cancel</button>
          <button class="btn btn-danger" id="clear-confirm-btn">Clear All Data</button>
        </div>
      </div>
    `;

    $('#clear-cancel-btn').addEventListener('click', () => {
      overlay.innerHTML = '';
      overlay.classList.add('hidden');
    });

    $('#clear-confirm-btn').addEventListener('click', () => {
      overlay.innerHTML = '';
      overlay.classList.add('hidden');
      App.clearAllData();
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  /**
   * Build a grouped <options> list for category selects.
   * Groups: Income, Non-P&L Credits, Expenses, Non-P&L Debits, Personal
   */
  function buildCategoryOptions(selectedCategory) {
    const groups = [
      { label: 'Income',          types: ['income']             },
      { label: 'Non-P&L Credits', types: ['owner', 'loan', 'transfer'], creditSide: true },
      { label: 'Expenses',        types: ['expense']            },
      { label: 'Non-P&L Debits',  types: ['owner', 'loan', 'transfer'], debitSide: true },
      { label: 'Personal',        types: ['personal']           },
    ];

    // Separate owner/loan/transfer into credit-side vs debit-side
    const creditKeys = ['OWNER_CONTRIBUTION', 'LOAN_PROCEEDS', 'TRANSFER_IN'];
    const debitKeys  = ['OWNER_DRAW', 'LOAN_PRINCIPAL', 'TRANSFER_OUT'];
    const incomeKeys = Object.keys(Categorizer.CATEGORIES).filter(k => Categorizer.CATEGORIES[k].type === 'income');
    const expenseKeys= Object.keys(Categorizer.CATEGORIES).filter(k => Categorizer.CATEGORIES[k].type === 'expense');
    const personalKeys= Object.keys(Categorizer.CATEGORIES).filter(k => Categorizer.CATEGORIES[k].type === 'personal');

    const makeGroup = (label, keys) => {
      const opts = keys.map(k => {
        const v = Categorizer.CATEGORIES[k];
        return `<option value="${k}" ${k === selectedCategory ? 'selected' : ''}>${escHtml(v.label)}</option>`;
      }).join('');
      return `<optgroup label="${label}">${opts}</optgroup>`;
    };

    return [
      makeGroup('Income',           incomeKeys),
      makeGroup('Non-P&L Credits',  creditKeys),
      makeGroup('Expenses',         expenseKeys),
      makeGroup('Non-P&L Debits',   debitKeys),
      makeGroup('Personal',         personalKeys),
    ].join('');
  }

  /**
   * Build a small inline source badge.
   */
  function buildSourceBadge(source) {
    if (!source) return '';
    const classMap = {
      'User Rule':              'source-user',
      'Learned Classification': 'source-learned',
      'Merchant Rule':          'source-merchant',
      'Keyword Rule':           'source-keyword',
      'Uncategorized':          'source-uncategorized',
    };
    const cls = classMap[source] || 'source-keyword';
    const isLearned = source === 'User Rule' || source === 'Learned Classification';
    const icon = isLearned ? '★ ' : '';
    return `<span class="source-badge ${cls}" title="${escHtml(source)}">${icon}${escHtml(source)}</span>`;
  }

  // ─── Utilities ────────────────────────────────────────────────────────────
  function formatMoney(amount) {
    const abs = Math.abs(amount);
    const formatted = abs.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    return amount < 0 ? `(${formatted})` : formatted;
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.substring(0, len) + '…' : str;
  }

  function showError(message) {
    const area = document.getElementById('toast-area');
    if (!area) { alert(message); return; }
    const toast = document.createElement('div');
    toast.className = 'toast toast-error';
    toast.textContent = message;
    area.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  }

  function showSuccess(message) {
    const area = document.getElementById('toast-area');
    if (!area) return;
    const toast = document.createElement('div');
    toast.className = 'toast toast-success';
    toast.textContent = message;
    area.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }


  // ─── Market Day view ──────────────────────────────────────────────────────
  /**
   * Root dispatcher for the Market Day section.
   * Renders whichever phase is current:
   *   - No active day + no just-closed day → "hub" (open a new day or view history)
   *   - Active day (status === 'trading')   → trading screen
   *   - state.marketDayClosed is set        → close-day summary
   */
  function renderMarketDay(state) {
    const main = $('#main-content');
    const day  = state.marketDay;

    // Show close-day summary if we just closed
    if (!day && state.marketDayClosed) {
      renderMarketDayClosed(main, state.marketDayClosed, state);
      return;
    }

    // Show active trading screen
    if (day && day.status === 'trading') {
      renderMarketDayTrading(main, day, state);
      return;
    }

    // Hub: no active day
    renderMarketDayHub(main, state);
  }

  // ── Hub (no active day) ───────────────────────────────────────────────────
  function renderMarketDayHub(main, state) {
    const history = MarketDay.loadHistory();
    const hasHistory = history.length > 0;

    const historyRows = history.slice(0, 30).map((d, idx) => {
      const t           = MarketDay.computeTotals(d);
      const dateStr     = d.closedAt ? new Date(d.closedAt).toLocaleDateString() : '—';
      const timeStr     = d.closedAt ? new Date(d.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      const profitClass = t.netProfit >= 0 ? 'positive' : 'negative';
      const uid         = `mdhist-${idx}`;

      // ── Expense breakdown by category ──────────────────────────────────────
      const expBreak = {};
      for (const e of d.expenses) {
        if (!expBreak[e.type]) expBreak[e.type] = { label: e.typeLabel, total: 0, items: [] };
        expBreak[e.type].total += e.amount;
        expBreak[e.type].items.push(e);
      }
      const expBreakRows = Object.values(expBreak)
        .sort((a, b) => b.total - a.total)
        .map(g => {
          const lineItems = g.items.map(e => `
            <div class="md-hist-lineitem">
              <span class="md-hist-li-time">${new Date(e.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              <span class="md-hist-li-desc">${escHtml(e.description)}</span>
              <span class="md-hist-li-amt negative">(${formatMoney(e.amount)})</span>
            </div>
          `).join('');
          return `
            <div class="md-hist-exp-group">
              <div class="md-hist-exp-header">
                <span class="md-hist-exp-label">${escHtml(g.label)}</span>
                <span class="md-hist-exp-total negative">(${formatMoney(g.total)})</span>
              </div>
              ${lineItems}
            </div>
          `;
        }).join('');

      // ── Individual sales ────────────────────────────────────────────────────
      const salesItems = [...d.sales].sort((a, b) => a.time.localeCompare(b.time)).map(s => `
        <div class="md-hist-lineitem">
          <span class="md-hist-li-time">${new Date(s.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <span class="md-hist-li-desc">${escHtml(s.description) || '<em>Sale</em>'}</span>
          <span class="md-hist-li-amt positive">${formatMoney(s.amount)}</span>
        </div>
      `).join('') || '<p class="md-hist-none">No sales recorded.</p>';

      return `
        <div class="md-history-card" id="${uid}">

          <!-- Summary header — always visible, click to expand ────────────── -->
          <div class="md-hist-header" data-toggle="${uid}">
            <div class="md-hist-header-left">
              <span class="md-hist-day-date">${escHtml(dateStr)}${timeStr ? ` · ${timeStr}` : ''}</span>
              ${d.marketName ? `<span class="md-hist-day-name">${escHtml(d.marketName)}</span>` : ''}
            </div>
            <div class="md-hist-header-kpis">
              <span class="md-hist-kpi">
                <span class="md-hist-kpi-label">Sales</span>
                <span class="positive">${formatMoney(t.totalSales)}</span>
                <span class="md-hist-kpi-count">${d.sales.length} sale${d.sales.length !== 1 ? 's' : ''}</span>
              </span>
              <span class="md-hist-kpi">
                <span class="md-hist-kpi-label">Expenses</span>
                <span class="negative">(${formatMoney(t.totalExpenses)})</span>
                <span class="md-hist-kpi-count">${d.expenses.length} item${d.expenses.length !== 1 ? 's' : ''}</span>
              </span>
              <span class="md-hist-kpi md-hist-kpi-net">
                <span class="md-hist-kpi-label">Net Profit</span>
                <span class="${profitClass}">${formatMoney(t.netProfit)}</span>
              </span>
              <span class="md-hist-kpi">
                <span class="md-hist-kpi-label">Float →</span>
                <span>${formatMoney(d.nextFloat)}</span>
              </span>
            </div>
            <span class="md-hist-chevron">&#9660;</span>
          </div>

          <!-- Expandable detail ────────────────────────────────────────────── -->
          <div class="md-hist-detail" id="${uid}-detail">

            <div class="md-hist-detail-grid">

              <!-- Full P&L summary ─────────────────────────────────────────── -->
              <div class="md-hist-pnl">
                <h5 class="md-hist-section-title">Day Summary</h5>
                <div class="md-hist-pnl-rows">
                  <div class="md-hist-pnl-row">
                    <span>Opening Float</span><span>${formatMoney(d.openingFloat)}</span>
                  </div>
                  <div class="md-hist-pnl-row md-hist-pnl-sales">
                    <span>Total Sales</span><span class="positive">${formatMoney(t.totalSales)}</span>
                  </div>
                  <div class="md-hist-pnl-row md-hist-pnl-exp">
                    <span>Total Expenses</span><span class="negative">(${formatMoney(t.totalExpenses)})</span>
                  </div>
                  <div class="md-hist-pnl-row md-hist-pnl-net">
                    <span>Net Profit</span><span class="${profitClass}">${formatMoney(t.netProfit)}</span>
                  </div>
                  ${d.savedAmount > 0 ? `
                    <div class="md-hist-pnl-row md-hist-pnl-saved">
                      <span>Saved / Set Aside</span><span class="positive">${formatMoney(d.savedAmount)}</span>
                    </div>
                  ` : ''}
                  <div class="md-hist-pnl-row md-hist-pnl-float">
                    <span>Next Day Float</span><span><strong>${formatMoney(d.nextFloat)}</strong></span>
                  </div>
                </div>
                ${d.notes ? `<p class="md-hist-notes">"${escHtml(d.notes)}"</p>` : ''}
              </div>

              <!-- Sales list ───────────────────────────────────────────────── -->
              <div class="md-hist-sales-col">
                <h5 class="md-hist-section-title md-hist-title-sales">
                  Sales
                  <span class="md-hist-title-total positive">${formatMoney(t.totalSales)}</span>
                </h5>
                <div class="md-hist-lineitems">${salesItems}</div>
              </div>

            </div>

            <!-- Expense breakdown ──────────────────────────────────────────── -->
            ${d.expenses.length > 0 ? `
              <div class="md-hist-expenses-section">
                <h5 class="md-hist-section-title md-hist-title-expenses">
                  Expenses
                  <span class="md-hist-title-total negative">(${formatMoney(t.totalExpenses)})</span>
                </h5>
                <div class="md-hist-exp-groups">${expBreakRows}</div>
              </div>
            ` : '<p class="md-hist-none md-hist-none-exp">No expenses recorded this day.</p>'}

          </div>
        </div>
      `;
    }).join('');

    main.innerHTML = `
      <div class="view-marketday">
        <div class="md-hub">
          <div class="md-hub-hero">
            <div class="md-hub-icon">&#127881;</div>
            <h2 class="md-hub-title">Market Day Trading</h2>
            <p class="md-hub-sub">Log each sale and expense in real time. Know your profit before you pack up.</p>
          </div>

          <div class="md-open-form" id="md-open-form">
            <h3 class="md-form-title">Open a New Day</h3>

            <div class="md-field-row">
              <div class="md-field">
                <label class="md-label" for="md-market-name">Market / Location <span class="md-optional">(optional)</span></label>
                <input id="md-market-name" class="md-input" type="text" placeholder="e.g. Main Street Farmers Market" maxlength="80">
              </div>
            </div>

            <div class="md-field-row">
              <div class="md-field">
                <label class="md-label" for="md-float">Opening Float — Cash on hand at start of day</label>
                <div class="md-input-prefix-wrap">
                  <span class="md-input-prefix">$</span>
                  <input id="md-float" class="md-input md-input-num" type="number" min="0" step="0.01" placeholder="0.00">
                </div>
                <p class="md-field-hint">This is money you already have — it is <strong>not</strong> counted as today's revenue.</p>
              </div>
            </div>

            <button class="btn btn-primary btn-md-open" id="md-open-btn">Open Day &amp; Start Trading →</button>
          </div>

          ${hasHistory ? `
            <div class="md-history-section">
              <h4 class="md-history-title">Recent Market Days</h4>
              ${historyRows}
            </div>
          ` : ''}
        </div>
      </div>
    `;

    $('#md-open-btn').addEventListener('click', () => {
      const floatVal = parseFloat($('#md-float').value) || 0;
      const name     = $('#md-market-name').value.trim();
      App.mdOpenDay(floatVal, name);
    });

    // Expand / collapse history cards
    $$('[data-toggle]').forEach(hdr => {
      hdr.addEventListener('click', () => {
        const uid    = hdr.dataset.toggle;
        const detail = $(`#${uid}-detail`);
        const card   = $(`#${uid}`);
        if (!detail) return;
        const open = detail.classList.toggle('md-hist-detail-open');
        hdr.querySelector('.md-hist-chevron').classList.toggle('md-hist-chevron-open', open);
        card.classList.toggle('md-history-card-open', open);
      });
    });
  }

  // ── Active Trading screen ─────────────────────────────────────────────────
  function renderMarketDayTrading(main, day, state) {
    const totals = MarketDay.computeTotals(day);
    const openedTime = new Date(day.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const expenseTypeOpts = MarketDay.EXPENSE_TYPES.map(e =>
      `<option value="${e.value}">${escHtml(e.label)}</option>`
    ).join('');

    // Sales list (newest first)
    const salesRows = [...day.sales].reverse().map(s => `
      <div class="md-entry-row">
        <span class="md-entry-time">${new Date(s.time).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</span>
        <span class="md-entry-desc">${escHtml(s.description) || '<em>Sale</em>'}</span>
        <span class="md-entry-amt positive">${formatMoney(s.amount)}</span>
        <button class="btn btn-xs md-delete-btn" data-action="del-sale" data-id="${s.id}" title="Remove">✕</button>
      </div>
    `).join('') || '<p class="md-empty">No sales recorded yet — tap a sale below.</p>';

    // Expenses list (newest first)
    const expRows = [...day.expenses].reverse().map(e => `
      <div class="md-entry-row">
        <span class="md-entry-time">${new Date(e.time).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</span>
        <span class="md-entry-desc">${escHtml(e.description)}<span class="md-entry-type-tag">${escHtml(e.typeLabel)}</span></span>
        <span class="md-entry-amt negative">(${formatMoney(e.amount)})</span>
        <button class="btn btn-xs md-delete-btn" data-action="del-expense" data-id="${e.id}" title="Remove">✕</button>
      </div>
    `).join('') || '<p class="md-empty">No expenses recorded yet.</p>';

    const profitClass = totals.netProfit >= 0 ? 'positive' : 'negative';

    main.innerHTML = `
      <div class="view-marketday view-marketday-trading">

        <!-- Live summary strip -->
        <div class="md-live-strip">
          <div class="md-live-item">
            <span class="md-live-label">Sales</span>
            <span class="md-live-val positive">${formatMoney(totals.totalSales)}</span>
          </div>
          <div class="md-live-sep">−</div>
          <div class="md-live-item">
            <span class="md-live-label">Expenses</span>
            <span class="md-live-val negative">${formatMoney(totals.totalExpenses)}</span>
          </div>
          <div class="md-live-sep">=</div>
          <div class="md-live-item md-live-profit">
            <span class="md-live-label">Net Profit</span>
            <span class="md-live-val ${profitClass}">${formatMoney(totals.netProfit)}</span>
          </div>
          <div class="md-live-item md-live-cash">
            <span class="md-live-label">Expected Cash</span>
            <span class="md-live-val">${formatMoney(totals.expectedCash)}</span>
          </div>
        </div>

        <div class="md-trading-body">

          <!-- Log a sale -->
          <div class="md-log-card" id="md-sale-card">
            <h3 class="md-card-title md-card-title-sale">&#128176; Log a Sale</h3>
            <div class="md-log-row">
              <div class="md-input-prefix-wrap">
                <span class="md-input-prefix">$</span>
                <input id="md-sale-amt" class="md-input md-input-num md-input-sale" type="number" min="0.01" step="0.01" placeholder="0.00">
              </div>
              <input id="md-sale-desc" class="md-input md-input-desc" type="text" placeholder="Item sold (optional)" maxlength="60">
              <button class="btn btn-primary btn-md-action" id="md-add-sale-btn">+ Add Sale</button>
            </div>

            <div class="md-entries" id="md-sales-list">
              ${salesRows}
            </div>
          </div>

          <!-- Log an expense -->
          <div class="md-log-card" id="md-expense-card">
            <h3 class="md-card-title md-card-title-expense">&#128085; Record an Expense</h3>
            <div class="md-log-row">
              <div class="md-input-prefix-wrap">
                <span class="md-input-prefix">$</span>
                <input id="md-exp-amt" class="md-input md-input-num md-input-expense" type="number" min="0.01" step="0.01" placeholder="0.00">
              </div>
              <input id="md-exp-desc" class="md-input md-input-desc" type="text" placeholder="Description (optional)" maxlength="60">
              <select id="md-exp-type" class="md-input md-select">
                ${expenseTypeOpts}
              </select>
              <button class="btn btn-secondary btn-md-action" id="md-add-exp-btn">+ Add Expense</button>
            </div>

            <div class="md-entries" id="md-expenses-list">
              ${expRows}
            </div>
          </div>

        </div>

        <!-- Footer: day info + close -->
        <div class="md-trading-footer">
          <div class="md-footer-info">
            ${day.marketName ? `<strong>${escHtml(day.marketName)}</strong> &middot; ` : ''}
            Opened ${openedTime} &middot; Float: ${formatMoney(day.openingFloat)} &middot;
            ${totals.transactionCount} event${totals.transactionCount !== 1 ? 's' : ''}
          </div>
          <button class="btn btn-close-day" id="md-close-day-btn">Close Day &amp; See Results →</button>
        </div>

      </div>
    `;

    // Add sale
    $('#md-add-sale-btn').addEventListener('click', () => {
      const amt  = parseFloat($('#md-sale-amt').value);
      if (!amt || amt <= 0) { showError('Enter a sale amount.'); return; }
      const desc = $('#md-sale-desc').value.trim();
      App.mdRecordSale(amt, desc);
    });

    // Enter key on sale amount
    $('#md-sale-amt').addEventListener('keydown', e => {
      if (e.key === 'Enter') $('#md-add-sale-btn').click();
    });

    // Add expense
    $('#md-add-exp-btn').addEventListener('click', () => {
      const amt  = parseFloat($('#md-exp-amt').value);
      if (!amt || amt <= 0) { showError('Enter an expense amount.'); return; }
      const desc = $('#md-exp-desc').value.trim();
      const type = $('#md-exp-type').value;
      App.mdRecordExpense(amt, desc, type);
    });

    // Delete sale / expense
    $$('[data-action="del-sale"]').forEach(btn => {
      btn.addEventListener('click', () => App.mdDeleteSale(btn.dataset.id));
    });
    $$('[data-action="del-expense"]').forEach(btn => {
      btn.addEventListener('click', () => App.mdDeleteExpense(btn.dataset.id));
    });

    // Close day
    $('#md-close-day-btn').addEventListener('click', () => {
      renderCloseModal(day, totals);
    });
  }

  // ── Close-day modal ───────────────────────────────────────────────────────
  function renderCloseModal(day, totals) {
    const overlay = $('#modal-overlay');
    overlay.classList.remove('hidden');

    const maxSave   = Math.max(totals.netProfit, 0);
    const guidance  = MarketDay.floatGuidance(totals.expectedCash);

    overlay.innerHTML = `
      <div class="modal-box md-close-modal">
        <h3 class="modal-title">&#127881; Close Day</h3>

        <div class="md-close-summary">
          <div class="md-close-row">
            <span>Opening Float</span><span>${formatMoney(day.openingFloat)}</span>
          </div>
          <div class="md-close-row">
            <span>Total Sales</span><span class="positive">${formatMoney(totals.totalSales)}</span>
          </div>
          <div class="md-close-row">
            <span>Total Expenses</span><span class="negative">(${formatMoney(totals.totalExpenses)})</span>
          </div>
          <div class="md-close-row md-close-row-net">
            <span>Net Profit</span>
            <span class="${totals.netProfit >= 0 ? 'positive' : 'negative'}">${formatMoney(totals.netProfit)}</span>
          </div>
          <div class="md-close-row">
            <span>Expected Cash in Hand</span><span><strong>${formatMoney(totals.expectedCash)}</strong></span>
          </div>
        </div>

        ${maxSave > 0 ? `
          <div class="md-save-section">
            <label class="md-label" for="md-save-amt">
              How much would you like to save / set aside?
              <span class="md-field-hint">(Maximum: ${formatMoney(maxSave)} — your net profit)</span>
            </label>
            <div class="md-input-prefix-wrap">
              <span class="md-input-prefix">$</span>
              <input id="md-save-amt" class="md-input md-input-num" type="number" min="0" max="${maxSave}" step="0.01" value="0" placeholder="0.00">
            </div>
            <div class="md-next-float-preview">
              <span>Tomorrow's float = </span>
              <span id="md-next-float-val"><strong>${formatMoney(totals.expectedCash)}</strong></span>
            </div>
          </div>
        ` : ''}

        <div class="md-close-notes-row">
          <label class="md-label" for="md-close-notes">Notes for the day <span class="md-optional">(optional)</span></label>
          <textarea id="md-close-notes" class="md-input md-textarea" rows="2" placeholder="Busy day, good sales on vegetables…" maxlength="200"></textarea>
        </div>

        ${guidance ? `
          <div class="md-float-guidance">
            <span class="md-guidance-icon">ℹ</span>
            ${escHtml(guidance)}
          </div>
        ` : ''}

        <div class="modal-actions">
          <button class="btn btn-secondary" id="md-close-cancel">Keep Trading</button>
          <button class="btn btn-close-day" id="md-close-confirm">Close Day &amp; Save Results</button>
        </div>
      </div>
    `;

    // Live update next float preview
    const saveInput = $('#md-save-amt');
    const floatPrev = $('#md-next-float-val');
    if (saveInput && floatPrev) {
      saveInput.addEventListener('input', () => {
        const saved = Math.min(parseFloat(saveInput.value) || 0, maxSave);
        const next  = Math.max(totals.expectedCash - saved, 0);
        floatPrev.innerHTML = `<strong>${formatMoney(next)}</strong>`;
      });
    }

    $('#md-close-cancel').addEventListener('click', () => {
      overlay.innerHTML = '';
      overlay.classList.add('hidden');
    });

    $('#md-close-confirm').addEventListener('click', () => {
      const saved = saveInput ? Math.min(parseFloat(saveInput.value) || 0, maxSave) : 0;
      const notes = $('#md-close-notes') ? $('#md-close-notes').value.trim() : '';
      overlay.innerHTML = '';
      overlay.classList.add('hidden');
      App.mdCloseDay(saved, notes);
    });
  }

  // ── Close-day results screen ──────────────────────────────────────────────
  function renderMarketDayClosed(main, closed, state) {
    const t         = closed.summary || MarketDay.computeTotals(closed);
    const dateStr   = closed.closedAt ? new Date(closed.closedAt).toLocaleDateString() : '—';
    const profitClass = t.netProfit >= 0 ? 'positive' : 'negative';

    // Expense breakdown
    const expBreakdown = {};
    for (const e of closed.expenses) {
      if (!expBreakdown[e.type]) expBreakdown[e.type] = { label: e.typeLabel, total: 0 };
      expBreakdown[e.type].total += e.amount;
    }
    const expRows = Object.values(expBreakdown).sort((a,b) => b.total - a.total).map(g =>
      `<div class="md-breakdown-row"><span>${escHtml(g.label)}</span><span>${formatMoney(g.total)}</span></div>`
    ).join('');

    main.innerHTML = `
      <div class="view-marketday view-marketday-closed">

        <div class="md-closed-hero ${t.netProfit >= 0 ? 'md-hero-profit' : 'md-hero-loss'}">
          <div class="md-closed-icon">${t.netProfit >= 0 ? '&#127881;' : '&#128549;'}</div>
          <h2 class="md-closed-title">Day Closed${closed.marketName ? ` — ${escHtml(closed.marketName)}` : ''}</h2>
          <p class="md-closed-date">${dateStr}</p>
        </div>

        <div class="md-closed-body">

          <!-- Net profit spotlight -->
          <div class="md-profit-spotlight ${t.netProfit >= 0 ? 'md-spotlight-profit' : 'md-spotlight-loss'}">
            <div class="md-spotlight-label">Net Profit</div>
            <div class="md-spotlight-value ${profitClass}">${formatMoney(Math.abs(t.netProfit))}</div>
            ${t.netProfit < 0 ? '<div class="md-spotlight-sub">Expenses exceeded sales today.</div>' : ''}
          </div>

          <!-- P&L summary -->
          <div class="md-closed-summary">
            <div class="md-cs-row">
              <span>Opening Float</span>
              <span>${formatMoney(closed.openingFloat)}</span>
            </div>
            <div class="md-cs-row md-cs-sales">
              <span>Total Sales (${closed.sales.length} sale${closed.sales.length !== 1 ? 's' : ''})</span>
              <span class="positive">${formatMoney(t.totalSales)}</span>
            </div>
            <div class="md-cs-row md-cs-exp">
              <span>Total Expenses (${closed.expenses.length} item${closed.expenses.length !== 1 ? 's' : ''})</span>
              <span class="negative">(${formatMoney(t.totalExpenses)})</span>
            </div>
            <div class="md-cs-row md-cs-net">
              <span>Net Profit</span>
              <span class="${profitClass}">${formatMoney(t.netProfit)}</span>
            </div>
            ${closed.savedAmount > 0 ? `
              <div class="md-cs-row md-cs-saved">
                <span>Amount Saved / Set Aside</span>
                <span class="positive">${formatMoney(closed.savedAmount)}</span>
              </div>
            ` : ''}
            <div class="md-cs-row md-cs-float">
              <span>Tomorrow's Opening Float</span>
              <span><strong>${formatMoney(closed.nextFloat)}</strong></span>
            </div>
          </div>

          ${expRows ? `
            <div class="md-breakdown">
              <h4 class="md-breakdown-title">Expense Breakdown</h4>
              ${expRows}
            </div>
          ` : ''}

          ${closed.notes ? `
            <div class="md-closed-notes">
              <strong>Your notes:</strong> ${escHtml(closed.notes)}
            </div>
          ` : ''}

          <!-- Float guidance -->
          ${(function(){
            const guidance = MarketDay.floatGuidance(closed.nextFloat);
            return guidance ? `
              <div class="md-float-guidance md-guidance-standalone">
                <strong>Float Guidance</strong><br>
                ${escHtml(guidance)}
              </div>
            ` : '';
          })()}

          <!-- Saving guidance (always educational) -->
          ${closed.savedAmount > 0 ? `
            <div class="md-saving-tip">
              <strong>&#127959; You saved ${formatMoney(closed.savedAmount)} today.</strong>
              Consider keeping saved amounts in a separate location from your float to make it easier to track your business finances.
              This is a suggestion for your consideration, not financial advice.
            </div>
          ` : (t.netProfit > 0 ? `
            <div class="md-saving-tip">
              <strong>Tip:</strong> You made a profit today! When closing future days, you can set aside a portion to build your business savings.
            </div>
          ` : '')}

          <div class="md-closed-actions">
            <button class="btn btn-primary" id="md-new-day-btn">Start a New Day</button>
            <button class="btn btn-secondary" data-nav="history">View Monthly History</button>
          </div>
        </div>

      </div>
    `;

    $('#md-new-day-btn').addEventListener('click', () => {
      // Clear the just-closed snapshot so hub shows
      App.getState().marketDayClosed = null;
      App.navigate('marketday');
    });

    bindGlobalEvents();
  }



  // ════════════════════════════════════════════════════════════════════════════
  //  TAXI DRIVER VIEWS
  // ════════════════════════════════════════════════════════════════════════════

  function renderTaxi(state) {
    // Navigate to the sub-view the app requested
    switch (state.taxiView || 'dashboard') {
      case 'fares':     renderTaxiFares(state);     break;
      case 'expense':   renderTaxiExpense(state);   break;
      case 'pnl':       renderTaxiPnL(state);       break;
      default:          renderTaxiDashboard(state); break;
    }
  }

  // ── Helpers shared across taxi views ────────────────────────────────────────
  function taxiPeriodKey() {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;
  }

  function taxiMonthLabel() {
    const n = new Date();
    return n.toLocaleString('default', { month: 'long', year: 'numeric' });
  }

  function payMethodLabel(val) {
    const m = Categorizer.PAYMENT_METHODS.find(p => p.value === val);
    return m ? m.label : val;
  }

  // ── Dashboard ────────────────────────────────────────────────────────────────
  function renderTaxiDashboard(state) {
    const main      = $('#main-content');
    const pKey      = taxiPeriodKey();
    const stmtTxs   = state.current ? state.current.transactions : [];
    const summary   = Taxi.computeMonthly(pKey, stmtTxs);
    const data      = Taxi.loadManual();

    // Today's figures
    const todayISO  = new Date().toISOString().substring(0,10);
    const todayFare = data.fares.filter(f => f.date === todayISO).reduce((s,f) => s+f.amount,0);
    const todayExp  = data.expenses.filter(e => e.date === todayISO && e.businessUse === 'business')
                        .reduce((s,e) => s+e.amount,0);
    const todayNet  = Math.round((todayFare - todayExp)*100)/100;
    const todayNetClass = todayNet >= 0 ? 'positive' : 'negative';

    // Recent fare entries (last 5)
    const recentFares = [...data.fares].sort((a,b) => b.date.localeCompare(a.date)).slice(0,5);
    const recentFareRows = recentFares.length ? recentFares.map(f => `
      <div class="taxi-recent-row">
        <span class="taxi-recent-date">${f.date}</span>
        <span class="taxi-recent-label">${escHtml(f.categoryLabel)}</span>
        <span class="taxi-recent-method">${payMethodLabel(f.paymentMethod)}</span>
        <span class="taxi-recent-amt positive">${formatMoney(f.amount)}</span>
        <button class="btn btn-xs tx-del-btn" data-action="del-fare" data-id="${f.id}">✕</button>
      </div>
    `).join('') : '<p class="taxi-none">No fares recorded yet this month.</p>';

    main.innerHTML = `
      <div class="view-taxi">

        <!-- Header -->
        <div class="taxi-header">
          <div>
            <h2 class="taxi-title">&#128663; Taxi Business</h2>
            <p class="taxi-subtitle">${taxiMonthLabel()}${summary.reviewCount > 0
              ? ` &middot; <span class="taxi-review-flag">${summary.reviewCount} needs review</span>` : ''}</p>
          </div>
          <button class="btn btn-secondary btn-sm" data-nav="upload">Upload Statement</button>
        </div>

        <!-- TODAY strip -->
        <div class="taxi-today-strip">
          <div class="taxi-today-item">
            <span class="taxi-today-label">Today's Fares</span>
            <span class="taxi-today-val positive">${formatMoney(todayFare)}</span>
          </div>
          <div class="taxi-today-sep">−</div>
          <div class="taxi-today-item">
            <span class="taxi-today-label">Today's Expenses</span>
            <span class="taxi-today-val negative">${formatMoney(todayExp)}</span>
          </div>
          <div class="taxi-today-sep">=</div>
          <div class="taxi-today-item">
            <span class="taxi-today-label">Today's Result</span>
            <span class="taxi-today-val ${todayNetClass}">${formatMoney(Math.abs(todayNet))}${todayNet<0?' (loss)':''}</span>
          </div>
        </div>

        <!-- THIS MONTH KPIs -->
        <div class="taxi-kpi-row">
          <div class="taxi-kpi">
            <span class="taxi-kpi-label">Taxi Revenue</span>
            <span class="taxi-kpi-val positive">${formatMoney(summary.totalFares)}</span>
          </div>
          <div class="taxi-kpi">
            <span class="taxi-kpi-label">Business Expenses</span>
            <span class="taxi-kpi-val negative">${formatMoney(summary.totalExpenses)}</span>
          </div>
          <div class="taxi-kpi taxi-kpi-profit">
            <span class="taxi-kpi-label">Estimated Profit</span>
            <span class="taxi-kpi-val ${summary.netProfit >= 0 ? 'positive':'negative'}">${formatMoney(summary.netProfit)}</span>
          </div>
        </div>

        <!-- Big action buttons -->
        <div class="taxi-actions">
          <button class="btn taxi-action-btn taxi-action-fares" id="btn-add-fares">
            <span class="taxi-action-icon">&#128176;</span>
            Add Today's Fares
          </button>
          <button class="btn taxi-action-btn taxi-action-expense" id="btn-add-expense">
            <span class="taxi-action-icon">&#128085;</span>
            Add Expense
          </button>
          <button class="btn taxi-action-btn taxi-action-pnl" id="btn-view-pnl">
            <span class="taxi-action-icon">&#128202;</span>
            View P&amp;L
          </button>
          <button class="btn taxi-action-btn taxi-action-upload" data-nav="upload">
            <span class="taxi-action-icon">&#128196;</span>
            Upload Statement
          </button>
        </div>

        <!-- How customers paid this month -->
        ${summary.totalFares > 0 ? `
          <div class="taxi-pay-section">
            <h4 class="taxi-section-title">How Customers Paid You This Month</h4>
            <div class="taxi-pay-bars">
              ${buildPayBar('Cash',              summary.fareCash,   summary.totalFares, 'cash')}
              ${buildPayBar('Mobile Wallet',     summary.fareMobile, summary.totalFares, 'mobile')}
              ${buildPayBar('Other Electronic',  summary.fareOther,  summary.totalFares, 'other')}
            </div>
          </div>
        ` : ''}

        <!-- Recent fares -->
        <div class="taxi-recent-section">
          <h4 class="taxi-section-title">Recent Fares</h4>
          ${recentFareRows}
        </div>

      </div>
    `;

    bindGlobalEvents();
    $('#btn-add-fares').addEventListener('click', () => App.taxiNavigate('fares'));
    $('#btn-add-expense').addEventListener('click', () => App.taxiNavigate('expense'));
    $('#btn-view-pnl').addEventListener('click', () => App.taxiNavigate('pnl'));
    $$('[data-action="del-fare"]').forEach(b => b.addEventListener('click', () => App.taxiDeleteFare(b.dataset.id)));
  }

  function buildPayBar(label, amount, total, cls) {
    if (total <= 0) return '';
    const pct = Math.round((amount / total) * 100);
    return `
      <div class="taxi-pay-row">
        <span class="taxi-pay-label">${label}</span>
        <div class="taxi-pay-bar-wrap">
          <div class="taxi-pay-bar taxi-pay-bar-${cls}" style="width:${pct}%"></div>
        </div>
        <span class="taxi-pay-amt">${formatMoney(amount)}</span>
        <span class="taxi-pay-pct">${pct}%</span>
      </div>
    `;
  }

  // ── Add Today's Fares ────────────────────────────────────────────────────────
  function renderTaxiFares(state) {
    const main    = $('#main-content');
    const todayISO= new Date().toISOString().substring(0,10);

    main.innerHTML = `
      <div class="view-taxi">
        <div class="taxi-header">
          <h2 class="taxi-title">&#128176; Add Today's Fares</h2>
          <button class="btn btn-secondary btn-sm" id="taxi-back-btn">← Back</button>
        </div>

        <div class="taxi-fare-form">
          <p class="taxi-form-intro">Enter the <strong>total</strong> fares you collected today, grouped by how customers paid you. Leave a method at $0 if you didn't receive any.</p>

          <div class="taxi-fare-date-row">
            <label class="taxi-label" for="fare-date">Date</label>
            <input id="fare-date" class="taxi-input" type="date" value="${todayISO}">
          </div>

          <div class="taxi-method-grid">
            <div class="taxi-method-card taxi-method-cash">
              <div class="taxi-method-icon">&#128181;</div>
              <label class="taxi-label" for="fare-cash">Cash</label>
              <div class="taxi-input-prefix-wrap">
                <span class="taxi-input-prefix">$</span>
                <input id="fare-cash" class="taxi-input taxi-input-num" type="number" min="0" step="0.01" placeholder="0.00">
              </div>
            </div>
            <div class="taxi-method-card taxi-method-mobile">
              <div class="taxi-method-icon">&#128241;</div>
              <label class="taxi-label" for="fare-mobile">Mobile Wallet</label>
              <div class="taxi-input-prefix-wrap">
                <span class="taxi-input-prefix">$</span>
                <input id="fare-mobile" class="taxi-input taxi-input-num" type="number" min="0" step="0.01" placeholder="0.00">
              </div>
            </div>
            <div class="taxi-method-card taxi-method-other">
              <div class="taxi-method-icon">&#128179;</div>
              <label class="taxi-label" for="fare-other">Other Electronic</label>
              <div class="taxi-input-prefix-wrap">
                <span class="taxi-input-prefix">$</span>
                <input id="fare-other" class="taxi-input taxi-input-num" type="number" min="0" step="0.01" placeholder="0.00">
              </div>
            </div>
          </div>

          <div class="taxi-fare-total" id="fare-total-display">
            Total Fares Today: <strong>$0.00</strong>
          </div>

          <div class="taxi-notes-row">
            <label class="taxi-label" for="fare-notes">Notes <span class="taxi-optional">(optional)</span></label>
            <input id="fare-notes" class="taxi-input" type="text" placeholder="e.g. busy day, airport runs" maxlength="80">
          </div>

          <button class="btn btn-primary taxi-save-btn" id="fare-save-btn">Save Fares</button>
        </div>
      </div>
    `;

    // Live total update
    const updateTotal = () => {
      const c = parseFloat($('#fare-cash').value)   || 0;
      const m = parseFloat($('#fare-mobile').value) || 0;
      const o = parseFloat($('#fare-other').value)  || 0;
      const t = Math.round((c + m + o) * 100) / 100;
      $('#fare-total-display').innerHTML = `Total Fares Today: <strong>${formatMoney(t)}</strong>`;
    };
    ['fare-cash','fare-mobile','fare-other'].forEach(id =>
      $(`#${id}`).addEventListener('input', updateTotal));

    $('#taxi-back-btn').addEventListener('click', () => App.taxiNavigate('dashboard'));
    $('#fare-save-btn').addEventListener('click', () => {
      const cash   = parseFloat($('#fare-cash').value)   || 0;
      const mobile = parseFloat($('#fare-mobile').value) || 0;
      const other  = parseFloat($('#fare-other').value)  || 0;
      const date   = $('#fare-date').value;
      const notes  = $('#fare-notes').value.trim();
      if (cash === 0 && mobile === 0 && other === 0) {
        showError('Enter at least one fare amount.');
        return;
      }
      App.taxiAddFares(date, cash, mobile, other, notes);
    });
  }

  // ── Add Expense ──────────────────────────────────────────────────────────────
  function renderTaxiExpense(state) {
    const main    = $('#main-content');
    const todayISO= new Date().toISOString().substring(0,10);

    const catOpts = Taxi.EXPENSE_CATEGORIES.map(c =>
      `<option value="${c.value}">${escHtml(c.label)}</option>`
    ).join('');

    const methodOpts = Categorizer.PAYMENT_METHODS.map(m =>
      `<option value="${m.value}">${escHtml(m.label)}</option>`
    ).join('');

    main.innerHTML = `
      <div class="view-taxi">
        <div class="taxi-header">
          <h2 class="taxi-title">&#128085; Add Expense</h2>
          <button class="btn btn-secondary btn-sm" id="taxi-back-btn">← Back</button>
        </div>

        <div class="taxi-expense-form">
          <div class="taxi-exp-row">
            <label class="taxi-label" for="exp-amount">Amount</label>
            <div class="taxi-input-prefix-wrap">
              <span class="taxi-input-prefix">$</span>
              <input id="exp-amount" class="taxi-input taxi-input-num" type="number" min="0.01" step="0.01" placeholder="0.00">
            </div>
          </div>

          <div class="taxi-exp-row">
            <label class="taxi-label" for="exp-cat">Category</label>
            <select id="exp-cat" class="taxi-input taxi-select">${catOpts}</select>
          </div>

          <div class="taxi-exp-row">
            <label class="taxi-label" for="exp-method">Payment Method</label>
            <select id="exp-method" class="taxi-input taxi-select">${methodOpts}</select>
          </div>

          <div class="taxi-exp-row">
            <label class="taxi-label" for="exp-date">Date</label>
            <input id="exp-date" class="taxi-input" type="date" value="${todayISO}">
          </div>

          <div class="taxi-exp-row">
            <label class="taxi-label" for="exp-desc">Description <span class="taxi-optional">(optional)</span></label>
            <input id="exp-desc" class="taxi-input" type="text" placeholder="e.g. BP Station — full tank" maxlength="80">
          </div>

          <div class="taxi-exp-row">
            <label class="taxi-label">Business Use</label>
            <div class="taxi-use-toggle" id="exp-use-toggle">
              <button class="btn taxi-use-btn taxi-use-active" data-use="business">Business</button>
              <button class="btn taxi-use-btn" data-use="personal">Personal</button>
              <button class="btn taxi-use-btn" data-use="review">Not Sure</button>
            </div>
          </div>

          <button class="btn btn-primary taxi-save-btn" id="exp-save-btn">Save Expense</button>
        </div>
      </div>
    `;

    // Business use toggle
    let selectedUse = 'business';
    $$('.taxi-use-btn').forEach(b => {
      b.addEventListener('click', () => {
        selectedUse = b.dataset.use;
        $$('.taxi-use-btn').forEach(x => x.classList.remove('taxi-use-active'));
        b.classList.add('taxi-use-active');
      });
    });

    $('#taxi-back-btn').addEventListener('click', () => App.taxiNavigate('dashboard'));
    $('#exp-save-btn').addEventListener('click', () => {
      const amount = parseFloat($('#exp-amount').value);
      if (!amount || amount <= 0) { showError('Enter an expense amount.'); return; }
      App.taxiAddExpense({
        amount,
        category:      $('#exp-cat').value,
        paymentMethod: $('#exp-method').value,
        date:          $('#exp-date').value,
        description:   $('#exp-desc').value.trim(),
        businessUse:   selectedUse,
      });
    });
  }

  // ── Taxi P&L view ────────────────────────────────────────────────────────────
  function renderTaxiPnL(state) {
    const main    = $('#main-content');
    const pKey    = taxiPeriodKey();
    const stmtTxs = state.current ? state.current.transactions : [];
    const s       = Taxi.computeMonthly(pKey, stmtTxs);
    const data    = Taxi.loadManual();

    // Expense rows for the P&L
    const expRows = s.expByCategory.map(g => `
      <div class="taxi-pnl-row taxi-pnl-exp-item">
        <span>${escHtml(g.label)}</span>
        <span class="negative">${formatMoney(g.total)}</span>
      </div>
    `).join('') || '<p class="taxi-none">No expenses recorded.</p>';

    // Expense by payment method rows
    const methodRows = Object.entries(s.expByMethod).map(([k, v]) => `
      <div class="taxi-pnl-row">
        <span>${payMethodLabel(k)}</span>
        <span>${formatMoney(v)}</span>
      </div>
    `).join('') || '<p class="taxi-none">—</p>';

    // Possible duplicates — from statement transactions flagged by detectDuplicates
    const possibleDups = (stmtTxs || []).filter(t =>
      t.isPossibleDuplicate && t.amount < 0 &&
      t.date && t.date.substring(0, 7) === pKey
    );
    const dupSection = possibleDups.length > 0 ? `
      <div class="taxi-detail-section">
        <h4 class="taxi-section-title">&#9888;&#65039; Possible Duplicate Transactions (${possibleDups.length})</h4>
        <p class="taxi-pnl-disclaimer">The following transactions from your uploaded statement appear to match a manually entered expense. Review each one and choose whether to merge (keep only your manual entry) or keep both.</p>
        ${possibleDups.map(t => `
          <div class="taxi-dup-row">
            <div class="taxi-dup-info">
              <span class="taxi-exp-line-date">${t.date}</span>
              <span class="taxi-exp-line-desc">${escHtml(truncate(t.description,38))}</span>
              <span class="taxi-exp-line-amt negative">${formatMoney(Math.abs(t.amount))}</span>
            </div>
            <div class="taxi-dup-match">
              ↔ Manual: ${escHtml(truncate(t.duplicateManualEntry ? t.duplicateManualEntry.description : '?', 32))}
              (${t.duplicateManualEntry ? formatMoney(t.duplicateManualEntry.amount) : ''})
            </div>
            <div class="taxi-dup-actions">
              <button class="btn btn-secondary btn-sm" data-action="dup-merge"
                data-stmt-id="${t.id}"
                data-manual-id="${t.duplicateManualEntry ? t.duplicateManualEntry.id : ''}">
                Merge (keep manual)
              </button>
              <button class="btn btn-xs" data-action="dup-keep" data-id="${t.id}">Keep both</button>
            </div>
          </div>
        `).join('')}
      </div>
    ` : '';

    // All expense line items for review
    const allExpItems = [...s.manualExp, ...s.stmtExpenses]
      .sort((a,b) => (b.date||'').localeCompare(a.date||''))
      .map(e => `
        <div class="taxi-exp-line ${e.businessUse === 'personal' ? 'taxi-exp-personal' : ''}">
          <span class="taxi-exp-line-date">${e.date||'—'}</span>
          <span class="taxi-exp-line-desc">${escHtml(truncate(e.description,38))}</span>
          <span class="taxi-exp-line-cat">${escHtml(e.categoryLabel||e.category)}</span>
          <span class="taxi-exp-line-method">${payMethodLabel(e.paymentMethod||'')}</span>
          ${e.businessUse === 'personal' ? '<span class="personal-badge">Personal</span>' : ''}
          <span class="taxi-exp-line-amt negative">${formatMoney(e.amount)}</span>
          ${e.type === 'expense' ? `<button class="btn btn-xs tx-del-btn" data-action="del-exp" data-id="${e.id}">✕</button>` : ''}
        </div>
      `).join('') || '<p class="taxi-none">No expenses yet.</p>';

    // All fare entries
    const fareItems = [...data.fares]
      .filter(f => f.date && f.date.substring(0,7) === pKey)
      .sort((a,b) => (b.date||'').localeCompare(a.date||''))
      .map(f => `
        <div class="taxi-exp-line">
          <span class="taxi-exp-line-date">${f.date||'—'}</span>
          <span class="taxi-exp-line-desc">${escHtml(f.description)}</span>
          <span class="taxi-exp-line-cat">${escHtml(f.categoryLabel)}</span>
          <span class="taxi-exp-line-method">${payMethodLabel(f.paymentMethod)}</span>
          <span class="taxi-exp-line-amt positive">${formatMoney(f.amount)}</span>
          <button class="btn btn-xs tx-del-btn" data-action="del-fare" data-id="${f.id}">✕</button>
        </div>
      `).join('') || '<p class="taxi-none">No fares recorded yet.</p>';

    main.innerHTML = `
      <div class="view-taxi">
        <div class="taxi-header">
          <div>
            <h2 class="taxi-title">&#128202; Taxi Business P&amp;L</h2>
            <p class="taxi-subtitle">${taxiMonthLabel()} — Estimated</p>
          </div>
          <button class="btn btn-secondary btn-sm" id="taxi-back-btn">← Dashboard</button>
        </div>

        <!-- INCOME section -->
        <div class="taxi-pnl-section">
          <div class="taxi-pnl-section-header">
            <h3>INCOME</h3>
            <span class="positive">${formatMoney(s.totalFares)}</span>
          </div>
          <div class="taxi-pnl-row taxi-pnl-income-row">
            <span>Cash Taxi Fares</span><span class="positive">${formatMoney(s.fareCash)}</span>
          </div>
          <div class="taxi-pnl-row taxi-pnl-income-row">
            <span>Mobile Wallet Taxi Fares</span><span class="positive">${formatMoney(s.fareMobile)}</span>
          </div>
          <div class="taxi-pnl-row taxi-pnl-income-row">
            <span>Other Electronic Fares</span><span class="positive">${formatMoney(s.fareOther)}</span>
          </div>
          <div class="taxi-pnl-row taxi-pnl-total">
            <span>TOTAL TAXI REVENUE</span><span class="positive">${formatMoney(s.totalFares)}</span>
          </div>
        </div>

        <!-- EXPENSES section -->
        <div class="taxi-pnl-section">
          <div class="taxi-pnl-section-header">
            <h3>EXPENSES</h3>
            <span class="negative">${formatMoney(s.totalExpenses)}</span>
          </div>
          ${expRows}
          <div class="taxi-pnl-row taxi-pnl-total">
            <span>TOTAL OPERATING EXPENSES</span><span class="negative">${formatMoney(s.totalExpenses)}</span>
          </div>
        </div>

        <!-- Net profit -->
        <div class="taxi-pnl-net ${s.netProfit >= 0 ? 'taxi-pnl-profit' : 'taxi-pnl-loss'}">
          <span>ESTIMATED OPERATING PROFIT</span>
          <span>${formatMoney(s.netProfit)}</span>
        </div>
        <p class="taxi-pnl-disclaimer">This is an estimate based on information you have entered. It is not an audited financial statement. Consult a qualified accountant for official records.</p>

        <!-- Payment method analysis — income -->
        ${s.totalFares > 0 ? `
          <div class="taxi-pnl-section">
            <div class="taxi-pnl-section-header"><h3>HOW CUSTOMERS PAID YOU</h3></div>
            ${buildPayBar('Cash',             s.fareCash,   s.totalFares, 'cash')}
            ${buildPayBar('Mobile Wallet',    s.fareMobile, s.totalFares, 'mobile')}
            ${buildPayBar('Other Electronic', s.fareOther,  s.totalFares, 'other')}
          </div>
        ` : ''}

        <!-- Expense payment method analysis -->
        ${s.totalExpenses > 0 ? `
          <div class="taxi-pnl-section">
            <div class="taxi-pnl-section-header"><h3>HOW EXPENSES WERE PAID</h3></div>
            ${methodRows}
          </div>
        ` : ''}

        <!-- Cash business view -->
        <div class="taxi-cash-section">
          <div class="taxi-pnl-section-header"><h3>CASH BUSINESS VIEW</h3></div>
          <div class="taxi-pnl-row"><span>Cash fares received</span><span class="positive">${formatMoney(s.cashFares)}</span></div>
          <div class="taxi-pnl-row"><span>Less: cash business expenses</span><span class="negative">(${formatMoney(s.cashExpenses)})</span></div>
          <div class="taxi-pnl-row taxi-pnl-total"><span>Estimated Cash Remaining</span><span>${formatMoney(s.cashRemaining)}</span></div>
          <p class="taxi-cash-note">This is an estimate based on cash entries only. It does not account for personal cash spending or amounts not entered into the app.</p>
        </div>

        <!-- Fare detail -->
        <div class="taxi-detail-section">
          <h4 class="taxi-section-title">Fare Entries — ${taxiMonthLabel()}</h4>
          ${fareItems}
        </div>

        <!-- Expense detail -->
        <div class="taxi-detail-section">
          <h4 class="taxi-section-title">Expense Entries — ${taxiMonthLabel()}</h4>
          ${allExpItems}
        </div>

        <!-- Possible duplicates -->
        ${dupSection}

      </div>
    `;

    $('#taxi-back-btn').addEventListener('click', () => App.taxiNavigate('dashboard'));
    $$('[data-action="del-fare"]').forEach(b => b.addEventListener('click', () => {
      App.taxiDeleteFare(b.dataset.id);
    }));
    $$('[data-action="del-exp"]').forEach(b => b.addEventListener('click', () => {
      App.taxiDeleteExpense(b.dataset.id);
    }));
    $$('[data-action="dup-merge"]').forEach(b => b.addEventListener('click', () => {
      App.taxiMergeDuplicate(b.dataset.stmtId, b.dataset.manualId);
    }));
    $$('[data-action="dup-keep"]').forEach(b => b.addEventListener('click', () => {
      // Mark as not a duplicate so it won't re-appear
      if (state.current && state.current.transactions) {
        state.current.transactions = state.current.transactions.map(t =>
          t.id === b.dataset.id ? { ...t, isPossibleDuplicate: false } : t
        );
      }
      UI.render(state);
    }));
    bindGlobalEvents();
  }


  return {
    render,
    showError,
    showSuccess,
    showColumnMapper,
  };
})();
