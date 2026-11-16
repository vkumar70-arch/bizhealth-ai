/**
 * categorizer.js — Rule-based transaction categorization engine for BizHealth AI
 *
 * DESIGN PRINCIPLES (hard constraints):
 *  - No AI/LLM calls. All categorization is deterministic keyword + pattern matching.
 *  - Loan proceeds are NEVER classified as revenue.
 *  - Owner contributions are NEVER classified as revenue.
 *  - Loan principal repayments are NEVER classified as a P&L expense.
 *  - Owner draws are NEVER classified as a P&L expense.
 *  - Every result carries a confidence score (0–1).
 *  - Scores below CONFIDENCE_THRESHOLD require user confirmation.
 *  - Users can override any category at any time.
 *  - Learned user rules take highest priority in classification.
 */

'use strict';

const Categorizer = (() => {

  const CONFIDENCE_THRESHOLD = 0.75; // below this → requires user review
  const LEARNED_RULES_KEY    = 'bizhealth_learned_rules'; // localStorage key

  // ─── Standardized category definitions ───────────────────────────────────────
  // type: 'income' | 'expense' | 'transfer' | 'loan' | 'owner' | 'personal' | 'unknown'
  // isPnL: whether this category appears in P&L
  // isCOGS: true for Inventory/COGS (affects gross profit calculation)
  const CATEGORIES = {
    // ── Income (P&L revenue) ──────────────────────────────────────────────────
    SALES_REVENUE:        { label: 'Sales Revenue',                  type: 'income',   isPnL: true,  isCOGS: false },
    SERVICE_REVENUE:      { label: 'Service Revenue',                type: 'income',   isPnL: true,  isCOGS: false },
    MOBILE_ONLINE_SALES:  { label: 'Mobile / Online Sales',          type: 'income',   isPnL: true,  isCOGS: false },
    OTHER_INCOME:         { label: 'Other Business Income',          type: 'income',   isPnL: true,  isCOGS: false },
    REFUND_RECEIVED:      { label: 'Refunds / Reimbursements',       type: 'income',   isPnL: true,  isCOGS: false },
    INTEREST_INCOME:      { label: 'Interest Income',                type: 'income',   isPnL: true,  isCOGS: false },
    UNCATEGORIZED_INCOME: { label: 'Uncategorized Income',           type: 'income',   isPnL: true,  isCOGS: false },

    // ── Taxi income (P&L revenue, broken out by payment method) ──────────────
    TAXI_FARE_CASH:       { label: 'Taxi Fares — Cash',              type: 'income',   isPnL: true,  isCOGS: false, taxiOnly: true },
    TAXI_FARE_MOBILE:     { label: 'Taxi Fares — Mobile Wallet',     type: 'income',   isPnL: true,  isCOGS: false, taxiOnly: true },
    TAXI_FARE_OTHER:      { label: 'Taxi Fares — Other Electronic',  type: 'income',   isPnL: true,  isCOGS: false, taxiOnly: true },

    // ── Non-P&L credits (do NOT count as revenue) ─────────────────────────────
    OWNER_CONTRIBUTION:   { label: 'Owner Contribution',             type: 'owner',    isPnL: false, isCOGS: false },
    LOAN_PROCEEDS:        { label: 'Loan Received',                  type: 'loan',     isPnL: false, isCOGS: false },
    TRANSFER_IN:          { label: 'Transfer Between Accounts',      type: 'transfer', isPnL: false, isCOGS: false },

    // ── Expenses (P&L) ─────────────────────────────────────────────────────────
    INVENTORY:            { label: 'Inventory / Cost of Goods Sold', type: 'expense',  isPnL: true,  isCOGS: true  },
    RENT:                 { label: 'Rent / Lease',                   type: 'expense',  isPnL: true,  isCOGS: false },
    UTILITIES:            { label: 'Utilities',                      type: 'expense',  isPnL: true,  isCOGS: false },
    PAYROLL:              { label: 'Payroll / Wages',                type: 'expense',  isPnL: true,  isCOGS: false },
    CONTRACTOR:           { label: 'Contractor Payments',            type: 'expense',  isPnL: true,  isCOGS: false },
    MARKETING:            { label: 'Advertising / Marketing',        type: 'expense',  isPnL: true,  isCOGS: false },
    FUEL:                 { label: 'Fuel / Transportation',          type: 'expense',  isPnL: true,  isCOGS: false },
    VEHICLE:              { label: 'Vehicle Expenses',               type: 'expense',  isPnL: true,  isCOGS: false },
    PHONE_INTERNET:       { label: 'Phone / Internet',               type: 'expense',  isPnL: true,  isCOGS: false },
    INSURANCE:            { label: 'Insurance',                      type: 'expense',  isPnL: true,  isCOGS: false },
    BANK_FEES:            { label: 'Bank Fees',                      type: 'expense',  isPnL: true,  isCOGS: false },
    MERCHANT_FEES:        { label: 'Merchant / Payment Processing Fees', type: 'expense', isPnL: true, isCOGS: false },
    SUBSCRIPTIONS:        { label: 'Software / Subscriptions',       type: 'expense',  isPnL: true,  isCOGS: false },
    SUPPLIES:             { label: 'Office Supplies',                type: 'expense',  isPnL: true,  isCOGS: false },
    REPAIRS:              { label: 'Repairs / Maintenance',          type: 'expense',  isPnL: true,  isCOGS: false },
    PROFESSIONAL_FEES:    { label: 'Professional Services',          type: 'expense',  isPnL: true,  isCOGS: false },
    TAXES:                { label: 'Taxes / Licenses / Permits',     type: 'expense',  isPnL: true,  isCOGS: false },
    TRAVEL:               { label: 'Travel',                         type: 'expense',  isPnL: true,  isCOGS: false },
    MEALS:                { label: 'Meals',                          type: 'expense',  isPnL: true,  isCOGS: false },
    LOAN_INTEREST:        { label: 'Loan Interest',                  type: 'expense',  isPnL: true,  isCOGS: false },
    OTHER_EXPENSE:        { label: 'Other Business Expenses',        type: 'expense',  isPnL: true,  isCOGS: false },
    UNCATEGORIZED_EXPENSE:{ label: 'Uncategorized Expense',          type: 'expense',  isPnL: true,  isCOGS: false },

    // ── Taxi-specific expenses ─────────────────────────────────────────────────
    TAXI_OIL:             { label: 'Oil / Lubricants',               type: 'expense',  isPnL: true,  isCOGS: false, taxiOnly: true },
    TAXI_TYRES:           { label: 'Tyres',                          type: 'expense',  isPnL: true,  isCOGS: false, taxiOnly: true },
    TAXI_PARTS:           { label: 'Vehicle Parts',                  type: 'expense',  isPnL: true,  isCOGS: false, taxiOnly: true },
    TAXI_BASE_FEE:        { label: 'Taxi Base / Stand Fees',         type: 'expense',  isPnL: true,  isCOGS: false, taxiOnly: true },
    TAXI_PERMIT:          { label: 'Taxi Permit / Licence',          type: 'expense',  isPnL: true,  isCOGS: false, taxiOnly: true },
    TAXI_REGISTRATION:    { label: 'Registration / Fitness',         type: 'expense',  isPnL: true,  isCOGS: false, taxiOnly: true },
    TAXI_CAR_WASH:        { label: 'Car Wash / Cleaning',            type: 'expense',  isPnL: true,  isCOGS: false, taxiOnly: true },
    TAXI_PARKING:         { label: 'Parking',                        type: 'expense',  isPnL: true,  isCOGS: false, taxiOnly: true },
    TAXI_WALLET_FEES:     { label: 'Mobile Wallet Fees',             type: 'expense',  isPnL: true,  isCOGS: false, taxiOnly: true },
    VEHICLE_FINANCE:      { label: 'Vehicle Finance',                type: 'expense',  isPnL: true,  isCOGS: false, taxiOnly: true },
    TAXI_OTHER:           { label: 'Other Taxi Expense',             type: 'expense',  isPnL: true,  isCOGS: false, taxiOnly: true },

    // ── Non-P&L debits ─────────────────────────────────────────────────────────
    OWNER_DRAW:           { label: 'Owner Withdrawal',               type: 'owner',    isPnL: false, isCOGS: false },
    LOAN_PRINCIPAL:       { label: 'Loan Principal Payment',         type: 'loan',     isPnL: false, isCOGS: false },
    TRANSFER_OUT:         { label: 'Transfer Between Accounts',      type: 'transfer', isPnL: false, isCOGS: false },

    // ── Personal / ambiguous ───────────────────────────────────────────────────
    PERSONAL:             { label: 'Personal (non-business)',        type: 'personal', isPnL: false, isCOGS: false },
  };

  // ─── Business type definitions ────────────────────────────────────────────────
  const BUSINESS_TYPES = [
    { value: '',                    label: '— Select business type (optional) —' },
    { value: 'retail',              label: 'Retail' },
    { value: 'restaurant',          label: 'Restaurant / Food Service' },
    { value: 'agriculture',         label: 'Farmer / Agriculture' },
    { value: 'taxi',                label: 'Self-Employed Taxi Driver' },
    { value: 'freelancer',          label: 'Freelancer / Consultant' },
    { value: 'professional',        label: 'Professional Services' },
    { value: 'market_vendor',       label: 'Market Vendor' },
    { value: 'construction',        label: 'Construction / Trades' },
    { value: 'other',               label: 'Other' },
  ];

  // ─── Payment method definitions (shared across all business types) ────────────
  const PAYMENT_METHODS = [
    { value: 'cash',         label: 'Cash' },
    { value: 'mobile_wallet',label: 'Mobile Wallet' },
    { value: 'debit_card',   label: 'Debit Card' },
    { value: 'credit_card',  label: 'Credit Card' },
    { value: 'bank_transfer',label: 'Bank Transfer' },
    { value: 'other',        label: 'Other' },
  ];

  // ─── Business use flags ───────────────────────────────────────────────────────
  const BUSINESS_USE = [
    { value: 'business', label: 'Business' },
    { value: 'personal', label: 'Personal' },
    { value: 'review',   label: 'Needs Review' },
  ];

  // ─── Merchant normalization patterns ─────────────────────────────────────────
  // Strip transaction reference numbers, branch codes, etc. to get a canonical merchant name.
  function normalizeMerchant(description) {
    if (!description) return '';
    let s = description.trim();
    // Remove trailing reference numbers like " 12345", " #5567", " REF123"
    s = s.replace(/\s+#?\d{4,}\s*$/i, '');
    // Remove common suffixes: location codes, state abbreviations after a space-digit pattern
    s = s.replace(/\s+[A-Z]{2}\s+\d[\d\-]+$/i, '');
    // Remove POS/ACH/DEBIT/CREDIT prefixes
    s = s.replace(/^(POS|ACH|DEBIT|CREDIT|PURCHASE|PYMT|PMT|TRNSFR|CHECKCARD|VISA|MC|DEBIT CARD PURCHASE|ONLINE PMT)\s+/i, '');
    // Remove date stamps like 01/15
    s = s.replace(/\b\d{1,2}\/\d{1,2}\b/g, '');
    // Collapse multiple spaces
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }

  // ─── Keyword rules ────────────────────────────────────────────────────────────
  // Each rule: { pattern, category, confidence, creditOnly?, debitOnly? }
  const RULES = [
    // ── Non-revenue credits (before generic income rules) ─────────────────────
    { pattern: /\b(loan|sba|ppp|eidl|microloan|line of credit|credit line|advance|merchant cash|mca)\b/i,
      creditOnly: true, category: 'LOAN_PROCEEDS',      confidence: 0.90 },
    { pattern: /\b(owner.?contribution|capital.?contribution|partner.?contrib|personal.?deposit|from personal)\b/i,
      creditOnly: true, category: 'OWNER_CONTRIBUTION', confidence: 0.88 },
    { pattern: /\b(transfer from|xfer from|incoming transfer|account transfer)\b/i,
      creditOnly: true, category: 'TRANSFER_IN',        confidence: 0.82 },

    // ── Loan principal repayments (debit, non-P&L) ────────────────────────────
    { pattern: /\b(loan.?payment|loan.?repay|principal.?payment|sba.?payment|eidl.?payment|loan.?installment)\b/i,
      debitOnly: true, category: 'LOAN_PRINCIPAL',      confidence: 0.90 },

    // ── Loan interest (debit, P&L expense) ───────────────────────────────────
    { pattern: /\b(loan interest|interest expense|interest charge|finance charge)\b/i,
      debitOnly: true, category: 'LOAN_INTEREST',       confidence: 0.88 },

    // ── Owner draw (debit, non-P&L) ───────────────────────────────────────────
    { pattern: /\b(owner.?draw|owner.?distribution|partner.?draw|owner.?withdrawal|to personal|transfer to personal)\b/i,
      debitOnly: true, category: 'OWNER_DRAW',          confidence: 0.88 },

    // ── Transfer out (debit) ──────────────────────────────────────────────────
    { pattern: /\b(transfer to|xfer to|outgoing transfer)\b/i,
      debitOnly: true, category: 'TRANSFER_OUT',        confidence: 0.80 },

    // ── Revenue ───────────────────────────────────────────────────────────────
    { pattern: /\b(square|clover|toast|zettle|sumup|lightspeed|revel|pos sale|point.of.sale|payment received|invoice paid|inv paid|cash sale)\b/i,
      creditOnly: true, category: 'SALES_REVENUE',      confidence: 0.92 },
    { pattern: /\b(stripe payout|shopify payout|paypal business|etsy|amazon seller|ebay|mercari|poshmark|depop|bigcartel|woocommerce)\b/i,
      creditOnly: true, category: 'MOBILE_ONLINE_SALES', confidence: 0.91 },
    { pattern: /\b(venmo biz|cash app biz|mpesa|momo pay|wave pay|mobile payment|mobile money)\b/i,
      creditOnly: true, category: 'MOBILE_ONLINE_SALES', confidence: 0.88 },
    { pattern: /\b(client payment|customer payment|sales deposit|sales pmt|rev deposit)\b/i,
      creditOnly: true, category: 'SALES_REVENUE',      confidence: 0.85 },
    { pattern: /\b(consulting fee|consulting payment|retainer|project fee|contract payment|service fee|service payment)\b/i,
      creditOnly: true, category: 'SERVICE_REVENUE',    confidence: 0.88 },
    { pattern: /\b(upwork|fiverr|toptal|freelancer\.com|99designs|guru\.com|freelance payment|gig payment)\b/i,
      creditOnly: true, category: 'SERVICE_REVENUE',    confidence: 0.90 },
    { pattern: /\b(interest paid|interest credit|savings interest|dividend)\b/i,
      creditOnly: true, category: 'INTEREST_INCOME',    confidence: 0.85 },
    { pattern: /\b(refund|chargeback credit|credit memo|return credit|reimbursement)\b/i,
      creditOnly: true, category: 'REFUND_RECEIVED',    confidence: 0.82 },

    // ── Payroll ───────────────────────────────────────────────────────────────
    { pattern: /\b(payroll|gusto|adp|paychex|quickbooks payroll|direct dep pay|salary|wages|dd payroll|biweekly pay|weekly pay)\b/i,
      debitOnly: true, category: 'PAYROLL',             confidence: 0.92 },

    // ── Contractor payments ───────────────────────────────────────────────────
    { pattern: /\b(contractor|subcontractor|freelancer pay|1099|independent contractor)\b/i,
      debitOnly: true, category: 'CONTRACTOR',          confidence: 0.84 },

    // ── Rent / Lease ──────────────────────────────────────────────────────────
    { pattern: /\b(rent|lease payment|commercial lease|office rent|space rent|studio rent)\b/i,
      debitOnly: true, category: 'RENT',                confidence: 0.88 },

    // ── Utilities ─────────────────────────────────────────────────────────────
    { pattern: /\b(electric|electricity|pge|con.?ed|duke energy|water bill|gas bill|utility|power bill)\b/i,
      debitOnly: true, category: 'UTILITIES',           confidence: 0.88 },

    // ── Phone / Internet ──────────────────────────────────────────────────────
    { pattern: /\b(internet|comcast|att business|verizon biz|spectrum biz|t-mobile biz|phone bill|mobile plan|data plan|broadband)\b/i,
      debitOnly: true, category: 'PHONE_INTERNET',      confidence: 0.88 },

    // ── Inventory / COGS ─────────────────────────────────────────────────────
    { pattern: /\b(inventory|wholesale|alibaba|aliexpress|supplier payment|cost of goods|cogs|merchandise purchase|stock purchase|produce purchase|raw material)\b/i,
      debitOnly: true, category: 'INVENTORY',           confidence: 0.85 },

    // ── Fuel / Transportation ─────────────────────────────────────────────────
    { pattern: /\b(shell|exxon|chevron|bp fuel|mobil|sunoco|citgo|gas station|fuel|petrol|diesel|fill.up)\b/i,
      debitOnly: true, category: 'FUEL',                confidence: 0.88 },
    { pattern: /\b(uber biz|lyft biz|taxi fare|bus pass|toll|mta|transit|commute)\b/i,
      debitOnly: true, category: 'FUEL',                confidence: 0.80 },

    // ── Vehicle Expenses ──────────────────────────────────────────────────────
    { pattern: /\b(car repair|auto repair|oil change|tire|muffler|mechanic|jiffy lube|valvoline|vehicle maintenance|auto service|car wash biz)\b/i,
      debitOnly: true, category: 'VEHICLE',             confidence: 0.85 },
    { pattern: /\b(car insurance|auto insurance|vehicle insurance|dmv|registration)\b/i,
      debitOnly: true, category: 'VEHICLE',             confidence: 0.82 },

    // ── Advertising / Marketing ───────────────────────────────────────────────
    { pattern: /\b(facebook ads|meta ads|google ads|instagram ads|tiktok ads|linkedin ads|advertising|marketing|mailchimp|constant contact|hubspot|hootsuite|canva|print ad)\b/i,
      debitOnly: true, category: 'MARKETING',           confidence: 0.90 },

    // ── Software / Subscriptions ──────────────────────────────────────────────
    { pattern: /\b(quickbooks|xero|freshbooks|wave accounting|notion|slack|zoom|microsoft 365|google workspace|dropbox|adobe|figma|github|heroku|aws|digitalocean|shopify sub|saas|subscription)\b/i,
      debitOnly: true, category: 'SUBSCRIPTIONS',       confidence: 0.88 },

    // ── Office Supplies ───────────────────────────────────────────────────────
    { pattern: /\b(office supply|staples|office depot|uline|packaging|supplies|home depot biz|lowes biz|grainger|fastenal|paper|ink cartridge)\b/i,
      debitOnly: true, category: 'SUPPLIES',            confidence: 0.85 },

    // ── Repairs / Maintenance ─────────────────────────────────────────────────
    { pattern: /\b(repair|maintenance|handyman|plumber|electrician|hvac|pest control|cleaning service|janitorial)\b/i,
      debitOnly: true, category: 'REPAIRS',             confidence: 0.82 },

    // ── Professional Services ─────────────────────────────────────────────────
    { pattern: /\b(accountant|bookkeeper|attorney|lawyer|legal fee|cpa fee|consultant fee|professional service|hr consultant|notary)\b/i,
      debitOnly: true, category: 'PROFESSIONAL_FEES',   confidence: 0.87 },

    // ── Insurance ─────────────────────────────────────────────────────────────
    { pattern: /\b(insurance|state farm|allstate|hiscox|next insurance|thimble|simply business|liability ins|workers comp|health ins premium)\b/i,
      debitOnly: true, category: 'INSURANCE',           confidence: 0.88 },

    // ── Bank Fees ─────────────────────────────────────────────────────────────
    { pattern: /\b(bank fee|service charge|monthly fee|overdraft|nsf fee|wire fee|ach fee|maintenance fee|account fee)\b/i,
      debitOnly: true, category: 'BANK_FEES',           confidence: 0.88 },

    // ── Merchant / Payment Processing Fees ────────────────────────────────────
    { pattern: /\b(payment processing fee|stripe fee|square fee|paypal fee|transaction fee|merchant fee|processing fee)\b/i,
      debitOnly: true, category: 'MERCHANT_FEES',       confidence: 0.88 },

    // ── Taxes / Licenses / Permits ────────────────────────────────────────────
    { pattern: /\b(irs|tax payment|estimated tax|quarterly tax|state tax|sales tax remit|payroll tax|tax deposit|ftb|franchise tax|business license|permit fee)\b/i,
      debitOnly: true, category: 'TAXES',               confidence: 0.90 },

    // ── Travel ────────────────────────────────────────────────────────────────
    { pattern: /\b(airline|delta|southwest|united air|american air|hotel|marriott|hilton|airfare|car rental|enterprise rent|hertz|avis|travel)\b/i,
      debitOnly: true, category: 'TRAVEL',              confidence: 0.82 },

    // ── Meals ─────────────────────────────────────────────────────────────────
    { pattern: /\b(restaurant|doordash|grubhub|ubereats|instacart biz|coffee|starbucks|dunkin|catering|client dinner|meals|diner|cafe)\b/i,
      debitOnly: true, category: 'MEALS',               confidence: 0.78 },

    // ── Taxi-specific keyword rules ───────────────────────────────────────────
    { pattern: /\b(tyre|tire shop|bridgestone|goodyear|michelin|dunlop tyre|new tyre|tyre fitting)\b/i,
      debitOnly: true, category: 'TAXI_TYRES',          confidence: 0.90 },
    { pattern: /\b(taxi base|taxi stand|stand fee|base fee|radio call|cab base)\b/i,
      debitOnly: true, category: 'TAXI_BASE_FEE',       confidence: 0.90 },
    { pattern: /\b(taxi permit|taxi licence|taxi license|taxi plate|LTC|taxi authority)\b/i,
      debitOnly: true, category: 'TAXI_PERMIT',         confidence: 0.90 },
    { pattern: /\b(fitness cert|vehicle fitness|registration fee|rego|LTA|RTA|road tax|vehicle permit)\b/i,
      debitOnly: true, category: 'TAXI_REGISTRATION',   confidence: 0.88 },
    { pattern: /\b(car wash|vehicle wash|auto wash|wash and clean|detail)\b/i,
      debitOnly: true, category: 'TAXI_CAR_WASH',       confidence: 0.85 },
    { pattern: /\b(lubricant|engine oil|castrol|mobil 1|havoline|penzoil|oil filter)\b/i,
      debitOnly: true, category: 'TAXI_OIL',            confidence: 0.88 },
    { pattern: /\b(vehicle parts|auto parts|spare parts|car parts|supercheap|repco|napa auto)\b/i,
      debitOnly: true, category: 'TAXI_PARTS',          confidence: 0.86 },
    { pattern: /\b(vehicle finance|car finance|vehicle loan|auto loan|car loan|hire purchase)\b/i,
      debitOnly: true, category: 'VEHICLE_FINANCE',     confidence: 0.85 },
    { pattern: /\b(parking fee|parking meter|car park|park and|parking ticket)\b/i,
      debitOnly: true, category: 'TAXI_PARKING',        confidence: 0.85 },
    { pattern: /\b(vodafone|digicel|emoney|m-paisa|m-pesa|mpesa fee|mobile fee|wallet fee|transfer fee|mobile money fee)\b/i,
      debitOnly: true, category: 'TAXI_WALLET_FEES',    confidence: 0.85 },

    // ── Personal indicators ───────────────────────────────────────────────────
    { pattern: /\b(netflix|hulu|spotify|amazon prime|apple tv|disney\+|personal|grocery|walmart|target|costco|cvs|walgreens|pharmacy|gym|fitness|salon|haircut|clothing|apparel)\b/i,
      category: 'PERSONAL',                             confidence: 0.78 },
  ];

  // ─── Learned rules (localStorage) ────────────────────────────────────────────
  /**
   * Load learned rules from localStorage.
   * Returns array of { merchantKey, normalizedDesc, category, addedAt }
   */
  function loadLearnedRules() {
    try {
      const raw = localStorage.getItem(LEARNED_RULES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveLearnedRules(rules) {
    localStorage.setItem(LEARNED_RULES_KEY, JSON.stringify(rules));
  }

  /**
   * Add or update a learned rule.
   * merchantKey is a normalized, lowercased description token.
   */
  function addLearnedRule(description, category) {
    const key = extractMerchantKey(description);
    if (!key || key.length < 3) return; // too short to be useful
    const rules = loadLearnedRules();
    const existing = rules.findIndex(r => r.merchantKey === key);
    const entry = {
      merchantKey:     key,
      normalizedDesc:  normalizeMerchant(description),
      category,
      categoryLabel:   CATEGORIES[category] ? CATEGORIES[category].label : category,
      addedAt:         new Date().toISOString(),
    };
    if (existing >= 0) {
      rules[existing] = entry;
    } else {
      rules.push(entry);
    }
    saveLearnedRules(rules);
  }

  function deleteLearnedRule(merchantKey) {
    const rules = loadLearnedRules().filter(r => r.merchantKey !== merchantKey);
    saveLearnedRules(rules);
  }

  /**
   * Extract a stable merchant key from a description.
   * Takes the first 2–3 meaningful words, lowercase.
   */
  function extractMerchantKey(description) {
    const normalized = normalizeMerchant(description).toLowerCase();
    // Take first 3 words, strip punctuation
    const words = normalized.split(/\s+/).filter(w => w.length > 1).slice(0, 3);
    return words.join(' ');
  }

  /**
   * Check learned rules for a description match.
   * Returns { category, confidence } or null.
   */
  function checkLearnedRules(description) {
    const rules = loadLearnedRules();
    if (rules.length === 0) return null;
    const key = extractMerchantKey(description);
    // Exact key match
    const exact = rules.find(r => r.merchantKey === key);
    if (exact) return { category: exact.category, confidence: 0.97, source: 'User Rule' };
    // Partial match: description contains a known merchant key
    const descLower = normalizeMerchant(description).toLowerCase();
    for (const rule of rules) {
      const rk = rule.merchantKey;
      if (rk.length >= 4 && descLower.includes(rk)) {
        return { category: rule.category, confidence: 0.92, source: 'Learned Classification' };
      }
    }
    return null;
  }

  // ─── Core categorization ──────────────────────────────────────────────────────
  /**
   * Categorize a single transaction.
   * Priority: Learned Rules → Keyword Rules → Uncategorized
   */
  function categorize(transaction, businessType) {
    const desc     = (transaction.description || '');
    const isCredit = transaction.amount > 0;

    // 1. Check learned / user rules first (highest priority)
    const learned = checkLearnedRules(desc);
    if (learned) {
      const meta = CATEGORIES[learned.category];
      if (meta) {
        return {
          category:      learned.category,
          categoryLabel: meta.label,
          categoryType:  meta.type,
          isPnL:         meta.isPnL,
          isCOGS:        meta.isCOGS || false,
          confidence:    learned.confidence,
          source:        learned.source,
          needsReview:   false,
          userConfirmed: false,
          userOverride:  false,
        };
      }
    }

    // 2. Keyword rules
    let bestCategory   = null;
    let bestConfidence = 0.0;

    for (const rule of RULES) {
      if (rule.creditOnly && !isCredit) continue;
      if (rule.debitOnly  && isCredit)  continue;
      if (rule.pattern.test(desc)) {
        if (rule.confidence > bestConfidence) {
          bestConfidence = rule.confidence;
          bestCategory   = rule.category;
        }
      }
    }

    // 3. Business-type boost for specific categories
    if (bestCategory && businessType) {
      bestConfidence = applyBusinessTypeBoost(bestCategory, businessType, bestConfidence);
    }

    // 4. If no rule matched → Uncategorized
    let source = 'Keyword Rule';
    if (!bestCategory) {
      bestConfidence = 0.20;
      bestCategory   = isCredit ? 'UNCATEGORIZED_INCOME' : 'UNCATEGORIZED_EXPENSE';
      source         = 'Uncategorized';
    }

    // Determine if merchant rule (high-name-specificity patterns)
    if (bestConfidence >= 0.88 && bestCategory !== 'UNCATEGORIZED_INCOME' && bestCategory !== 'UNCATEGORIZED_EXPENSE') {
      source = 'Merchant Rule';
    }

    const meta = CATEGORIES[bestCategory];
    return {
      category:      bestCategory,
      categoryLabel: meta.label,
      categoryType:  meta.type,
      isPnL:         meta.isPnL,
      isCOGS:        meta.isCOGS || false,
      confidence:    bestConfidence,
      source,
      needsReview:   bestConfidence < CONFIDENCE_THRESHOLD,
      userConfirmed: false,
      userOverride:  false,
    };
  }

  /**
   * Boost confidence slightly for categories that are primary for a given business type.
   * Never exceed 0.97 and never reduce existing confidence.
   */
  function applyBusinessTypeBoost(category, businessType, confidence) {
    const boosts = {
      retail:       ['INVENTORY', 'SALES_REVENUE', 'MOBILE_ONLINE_SALES'],
      restaurant:   ['INVENTORY', 'MEALS', 'PAYROLL'],
      agriculture:  ['INVENTORY', 'FUEL', 'VEHICLE', 'REPAIRS'],
      taxi:         ['FUEL', 'VEHICLE', 'INSURANCE', 'TAXI_FARE_CASH', 'TAXI_FARE_MOBILE', 'TAXI_FARE_OTHER',
                     'TAXI_OIL', 'TAXI_TYRES', 'TAXI_PARTS', 'TAXI_BASE_FEE', 'TAXI_PERMIT', 'TAXI_REGISTRATION',
                     'TAXI_CAR_WASH', 'TAXI_PARKING', 'TAXI_WALLET_FEES', 'VEHICLE_FINANCE', 'TAXI_OTHER'],
      freelancer:   ['SERVICE_REVENUE', 'SUBSCRIPTIONS', 'PROFESSIONAL_FEES'],
      professional: ['SERVICE_REVENUE', 'PROFESSIONAL_FEES', 'SUBSCRIPTIONS'],
      market_vendor:['INVENTORY', 'SALES_REVENUE', 'FUEL'],
      construction: ['INVENTORY', 'VEHICLE', 'FUEL', 'REPAIRS', 'CONTRACTOR'],
    };
    const relevant = boosts[businessType] || [];
    if (relevant.includes(category) && confidence < 0.97) {
      return Math.min(0.97, confidence + 0.05);
    }
    return confidence;
  }

  /**
   * Categorize an array of transactions.
   */
  function categorizeAll(transactions, businessType) {
    return transactions.map(t => ({
      ...t,
      ...categorize(t, businessType),
    }));
  }

  /**
   * Apply a user override to a single transaction and save a learned rule.
   */
  function applyOverride(transaction, newCategory, saveRule = true) {
    const categoryMeta = CATEGORIES[newCategory];
    if (!categoryMeta) throw new Error(`Unknown category: ${newCategory}`);

    if (saveRule) {
      addLearnedRule(transaction.description, newCategory);
    }

    return {
      ...transaction,
      category:      newCategory,
      categoryLabel: categoryMeta.label,
      categoryType:  categoryMeta.type,
      isPnL:         categoryMeta.isPnL,
      isCOGS:        categoryMeta.isCOGS || false,
      confidence:    1.0,
      source:        'User Rule',
      needsReview:   false,
      userConfirmed: true,
      userOverride:  true,
    };
  }

  /**
   * Confirm a low-confidence categorization (user agrees with suggestion).
   */
  function confirmCategorization(transaction) {
    return {
      ...transaction,
      needsReview:   false,
      userConfirmed: true,
    };
  }

  return {
    CATEGORIES,
    BUSINESS_TYPES,
    PAYMENT_METHODS,
    BUSINESS_USE,
    CONFIDENCE_THRESHOLD,
    normalizeMerchant,
    loadLearnedRules,
    saveLearnedRules,
    addLearnedRule,
    deleteLearnedRule,
    categorize,
    categorizeAll,
    applyOverride,
    confirmCategorization,
  };
})();
