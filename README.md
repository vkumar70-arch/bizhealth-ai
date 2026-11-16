# BizHealth AI

**Financial wellness for small and microbusiness owners**

BizHealth AI is a browser-based financial management prototype designed
to help microbusiness owners understand their income, expenses,
profitability, and financial trends without requiring accounting
expertise. The current application includes dedicated workflows for
**market vendors** and **self-employed taxi drivers**, alongside
statement-based financial analysis for other small businesses.

The project was developed with the assistance of **IBM Bob** as part of
an AI-for-Good concept focused on making financial management more
accessible to microbusinesses, particularly in developing countries.

## The Problem

Many microbusinesses operate through a mixture of cash, mobile-wallet,
card, and bank transactions. Owners may not maintain formal accounting
records, making it difficult to answer basic questions such as:

-   How much did I earn?
-   How much did I spend?
-   What are my largest expenses?
-   Am I actually profitable?
-   Is my business improving over time?

This is especially relevant for cash-heavy businesses such as market
vendors and self-employed taxi drivers, where traditional bookkeeping
can be impractical during a busy working day.

## The Solution

BizHealth AI provides simple workflows that convert business activity
and uploaded transaction statements into understandable financial
information.

The application can:

-   Parse CSV/TXT bank and mobile-wallet transaction exports.
-   Categorize transactions using deterministic rules.
-   Flag uncertain classifications for user review.
-   Learn local classification rules from user corrections.
-   Generate Profit & Loss (P&L) summaries.
-   Separate business, personal, loan, owner, and transfer activity.
-   Track month-over-month financial trends.
-   Generate educational financial-wellness suggestions from observed
    data.
-   Support specialized market-vendor and taxi-driver workflows.
-   Store all prototype data locally in the user's browser.

## Target Users

The application includes business-type options for:

-   Market vendors
-   Self-employed taxi drivers
-   Retail businesses
-   Restaurants / food services
-   Farmers / agriculture
-   Freelancers / consultants
-   Professional services
-   Construction / trades
-   Other small and microbusinesses

The most specialized workflows in the current prototype are for **market
vendors** and **self-employed taxi drivers**.

## Key Features

### Bank and Mobile-Wallet Statement Analysis

Users can upload **CSV, TXT, or TSV** transaction exports. The parser
attempts to detect fields such as:

-   Date
-   Description
-   Amount
-   Credit
-   Debit
-   Balance

When the file structure cannot be confidently detected, the application
can request manual column mapping.

### Transaction Categorization

Transactions are categorized into financial categories such as:

-   Sales revenue
-   Service revenue
-   Inventory / cost of goods sold
-   Fuel / transportation
-   Repairs / maintenance
-   Insurance
-   Phone / internet
-   Bank and merchant fees
-   Loan proceeds
-   Loan principal
-   Loan interest
-   Owner contributions and withdrawals
-   Personal transactions
-   Transfers

Low-confidence classifications can be reviewed by the user.

### Learned Classification Rules

When a user corrects a transaction category, BizHealth AI can save a
merchant-based classification rule in `localStorage`.

On future uploads, matching descriptions can automatically receive the
previously selected category with higher confidence.

These learned rules remain on the user's device.

### Profit & Loss

The P&L engine separates:

-   Revenue
-   Cost of goods sold
-   Gross profit
-   Operating expenses
-   Net profit
-   Profit margin

The application deliberately excludes items that should not be treated
as normal P&L activity, including loan proceeds, owner contributions,
loan principal payments, owner withdrawals, and transfers.

### Financial Trends and Suggestions

BizHealth AI stores monthly summaries locally and can compare financial
performance over time.

It can highlight patterns derived from the user's data and provide
educational financial-wellness suggestions. These suggestions are for
consideration only and are not financial advice.

## Market Vendor Workflow

The Market Day feature is designed for vendors who primarily operate
using cash.

A vendor can:

1.  Open a market day with an opening cash float.
2.  Record sales during the day.
3.  Record expenses such as stock, transport, stall fees, packaging,
    ingredients, phone/mobile-money fees, and wages.
4.  View live sales, expenses, expected cash, and net profit.
5.  Close the day.
6.  Decide how much profit to save and how much cash to carry forward.
7.  Keep local market-day history.

The opening float is not treated as revenue.

## Self-Employed Taxi Driver Workflow

The Taxi feature is designed to reduce the amount of bookkeeping
required while a driver is working.

Drivers can record total daily fares by:

-   Cash
-   Mobile wallet
-   Other electronic payments

Taxi expenses can include:

-   Fuel
-   Oil / lubricants
-   Repairs and maintenance
-   Tyres
-   Vehicle parts
-   Taxi base / stand fees
-   Taxi permit / licence
-   Registration / fitness
-   Insurance
-   Car wash / cleaning
-   Parking
-   Phone / data
-   Mobile-wallet fees
-   Bank fees
-   Vehicle finance
-   Loan interest
-   Other taxi expenses

The application can combine manual taxi activity with categorized
statement transactions to produce a monthly taxi financial summary.

It also includes possible duplicate detection so a manually entered
expense is not unintentionally counted again when the same transaction
later appears in a statement.

## AI and Automation Approach

The current prototype does **not** call an external AI model or LLM for
transaction categorization.

Its current categorization engine is **rule-based and deterministic**,
using keyword/pattern matching, confidence scores, business context, and
locally stored user-created classification rules.

The adaptive element is the learned-rule system: when users correct
classifications, those merchant/category mappings can be applied to
similar future transactions.

IBM Bob was used as an AI-assisted development tool to help design,
build, debug, and refine the application.

Future versions could extend the current deterministic approach with
more advanced AI for contextual transaction classification, receipt
understanding, anomaly detection, and personalized financial
explanations.

## Why AI for Good?

BizHealth AI is intended to make financial management more accessible to
microbusiness owners who may not have accounting expertise or
sophisticated financial software.

The broader goal is to use AI-assisted technology to reduce bookkeeping
complexity and help owners---particularly in developing
economies---better understand their business performance and make more
informed financial decisions.

## Privacy

The current prototype is designed around local processing.

-   Financial data is processed in the browser.
-   Application data is stored using browser `localStorage`.
-   Learned classification rules are stored locally.
-   The application does not require a central application database.
-   Different browsers/devices maintain separate local data.
-   Users can clear financial history or clear all locally stored
    application data.

Because `localStorage` belongs to a particular browser/device, clearing
browser storage can remove saved application data.

For testing, sample financial data is recommended rather than sensitive
real-world banking information until the application has undergone
appropriate security and privacy review.

## Offline / PWA Support

BizHealth AI includes:

-   A web app manifest
-   Application icons
-   A service worker
-   Cache-first application-shell caching

This allows the project to support Progressive Web App (PWA) and
offline-style behavior when served from a compatible web host.

## Technology

The current project uses:

-   HTML5
-   CSS
-   Vanilla JavaScript
-   Browser `localStorage`
-   Service Worker API
-   Web App Manifest / PWA configuration

No JavaScript framework or external backend is required by the current
prototype.

## Project Structure

``` text
bizhealth-ai/
├── index.html
├── manifest.json
├── sw.js
├── serve.ps1
├── css/
│   └── styles.css
├── icons/
│   ├── icon-192.svg
│   └── icon-512.svg
└── js/
    ├── app.js
    ├── categorizer.js
    ├── market-day.js
    ├── parser.js
    ├── pnl.js
    ├── suggestions.js
    ├── taxi.js
    ├── trends.js
    └── ui.js
```

### Main Modules

  -----------------------------------------------------------------------
  Module                              Purpose
  ----------------------------------- -----------------------------------
  `parser.js`                         Parses CSV and text-based
                                      bank/mobile-wallet transaction
                                      exports

  `categorizer.js`                    Rule-based transaction
                                      classification and learned user
                                      rules

  `pnl.js`                            Builds deterministic P&L
                                      calculations

  `trends.js`                         Stores and compares monthly
                                      financial summaries

  `suggestions.js`                    Generates educational suggestions
                                      from financial patterns

  `market-day.js`                     Market-vendor daily sales, expense,
                                      cash-float, and profit workflow

  `taxi.js`                           Taxi fares, expenses, duplicate
                                      detection, and monthly aggregation

  `ui.js`                             Application screens and user
                                      interface

  `app.js`                            Main application state, navigation,
                                      and orchestration
  -----------------------------------------------------------------------

## Running Locally on Windows

The project includes `serve.ps1`, a small PowerShell web server.

### Option 1: PowerShell

1.  Download or clone the project.
2.  Open PowerShell in the `bizhealth-ai` folder.
3.  Run:

``` powershell
.\serve.ps1
```

4.  Open:

``` text
http://localhost:3000
```

5.  Press `Ctrl+C` in PowerShell to stop the server.

To use another port:

``` powershell
.\serve.ps1 -Port 8080
```

Then open `http://localhost:8080`.

If Windows blocks local PowerShell scripts, review your PowerShell
execution-policy settings before changing them. Do not weaken system
security settings solely to run this prototype.

## GitHub Pages Deployment

This is a static HTML/CSS/JavaScript project, so it can be hosted using
GitHub Pages. However, the current PWA configuration uses several
**root-relative paths**, including the service worker, manifest start
URL/scope, cached assets, and shortcut URLs.

A normal GitHub project site is typically hosted under a path such as:

``` text
https://USERNAME.github.io/bizhealth-ai/
```

Before using that project-site configuration, update the root-relative
PWA paths so they work correctly under `/bizhealth-ai/`, or host the
application at a domain/root configuration where `/` points directly to
BizHealth AI.

After making the path configuration compatible:

1.  Create a GitHub repository.
2.  Upload the project with `index.html` in the repository root.
3.  Open **Settings → Pages**.
4.  Select **Deploy from a branch**.
5.  Select the `main` branch and `/(root)`.
6.  Save and wait for GitHub Pages to publish the site.
7.  Test all screens, statement uploads, local storage, navigation, and
    offline/PWA behavior from the published URL.

## Important Limitations

BizHealth AI is currently a prototype.

-   Transaction categorization is rule-based, not an external AI/LLM
    service.
-   Financial accuracy depends on the quality and completeness of
    user-entered/uploaded data.
-   Learned classifications are stored only in the current browser.
-   There is no central user account or cloud synchronization.
-   Data does not automatically move between devices.
-   The application is not connected directly to banks or mobile-wallet
    providers.
-   Receipt scanning/OCR is not part of the current implementation.
-   The application does not make lending or credit decisions.
-   It is not a replacement for professional bookkeeping, accounting,
    tax, legal, or financial advice.

## Future Improvements

Potential next steps include:

-   Context-aware AI transaction classification
-   Receipt scanning and extraction
-   Additional microbusiness-specific workflows
-   Real-world usability testing with microbusiness owners
-   Secure user accounts and encrypted cloud backup
-   Cross-device synchronization
-   Bank integrations
-   Mobile-wallet integrations
-   Improved financial explanations and personalized insights
-   Stronger privacy, security, and consent controls for production use

## Disclaimer

BizHealth AI is an educational financial-wellness prototype.

It does not provide financial, accounting, tax, legal, lending, or
credit advice. Categorization and financial figures should be reviewed
by the user, and professional advice should be obtained where
appropriate.

Financial figures produced by the application are derived from the data
supplied by the user.

## Built With IBM Bob

IBM Bob was used as an AI-assisted development environment to help
design, implement, debug, and iteratively improve the BizHealth AI
prototype.

------------------------------------------------------------------------

**BizHealth AI** --- Helping microbusiness owners better understand the
financial health of their businesses.
