# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

McQueen Tracker — full-stack Node.js CRM for traffic arbitrage. Russian-language SPA with role-based access (admin/buyer/operator). Deployed on Railway (temporary), target: VPS.

## Commands

```bash
npm install          # Install dependencies
npm start            # Start server (or: node server.js)
run.bat              # Windows: start + open browser
```

Server runs on `http://localhost:8000` (or `$PORT`). Default login: `admin` / `admin123`.

## Architecture

**Monolith**: single `server.js` (Express + better-sqlite3) serves API and static frontend.

- `server.js` — All backend: schema, migrations, auth middleware, ~60 API routes, activity logging, soft-delete/recycle bin
- `frontend/app.js` — All frontend logic (~3000+ lines), ~22 `App.*` modules
- `frontend/index.html` — SPA shell with all sections and modals
- `frontend/style.css` — Bootstrap 5.3 overrides + custom sidebar/nav-group styles
- `crm.db` — SQLite database (auto-created, WAL mode, foreign keys ON)

No build step. No frameworks. No ORM. All DB calls are synchronous (better-sqlite3).

## Auth & Roles

Bearer token auth (30-day expiry, scrypt hashing). Middleware helpers:
- `anyAuth` — any logged-in user
- `adminOnly` / `adminBuyer` / `adminOperator` — role combinations
- `requireAuth('admin', 'buyer')` — custom role sets

Frontend stores session in `localStorage.crm_session`. `apiFetch()` auto-attaches Bearer header.

Role visibility in HTML: classes `role-admin`, `role-adminbuyer`, `role-adminoperator` on nav elements, toggled by `setupRoleUI()`.

## Key Backend Patterns

**Adset name parsing** (`parseAdsetName`): strict abbreviation matching — geo prefix first (longest match), then agent abbreviation after geo. No regex patterns, no creative auto-creation. Example: `BRcdn129B2L2` → geo=BR, agent=cdn.

**Agent commissions in spend**: `spendExpr(withCommission)` helper returns SQL expression. When commission enabled (default), each spend record multiplied by `(1 + commission_pct/100)` using the commission rate effective on that record's date. Query param `without_commission=1` switches to raw spend. Applied to all statistics endpoints + dashboard.

**Soft delete / Recycle bin**: `softDelete(tableName, recordId, userId, username)` saves full record JSON to `deleted_records` table before permanent deletion. Auto-purge >30 days. Restore via `POST /api/deleted/:id/restore` (temporarily disables FK checks). Admin sees all, buyer sees only own deletions.

**Cascade geo deletion**: `DELETE /api/geos/:id` cascades to adsets → spend_records → chatterfy_records → manual_deposits → creatives → offers. All soft-deleted before permanent removal. `GET /api/geos/:id/stats` returns counts for confirm dialog.

**Orphaned adset cleanup**: `cleanupOrphanedAdset(adsetId)` — after deleting a spend/chatterfy record, if adset has no remaining records, it's auto-deleted.

**Migrations**: idempotent `ALTER TABLE` wrapped in `try/catch` — no migration files.

**Activity logging**: `logActivity(userId, username, action, details)` on all admin actions.

**Statistics queries**: correlated subqueries with dynamic WHERE clauses built from `geo_id`, `agent_id`, date range params. `enrichStats()` adds profit, ROI, cost-per, conversion percentages.

## Database

22+ tables. Key ones:
- **Core**: `users`, `sessions`, `geos`, `agents`, `agent_commissions`, `creatives`, `adsets`
- **Import**: `fb_cabinets`, `spend_records`, `chatterfy_records`
- **Deposits**: `manual_deposits` (type: dep/redep, status: pending/confirmed)
- **P&L**: `team_expenses`, `expense_categories`, `expense_items`
- **System**: `activity_log`, `deleted_records`, `operator_geos`, `offers`, `budgets`

Reset DB: delete `crm.db*` files, restart server.

**SQLite on Railway is ephemeral** — data lost on redeploy. Final deployment target is VPS where SQLite will persist fine.

## Frontend Modules

`App.Auth`, `App.Stats`, `App.Deposits`, `App.Import`, `App.Dashboard`, `App.Geos`, `App.Agents`, `App.Creatives`, `App.Undefined`, `App.Cabinets`, `App.Users`, `App.Expenses`, `App.PL`, `App.ActivityLog`, `App.Notifications`, `App.Export`, `App.Deleted`, `App.Funnel`, `App.BulkDelete`, `App.Search`, `App.Realtime`

Global state loaded on init: `state.geos`, `state.agents`. Navigation via `showSection(name)` + `switchDict(name)`.

**Hash-routing**: URL updates to `#section-name` on navigation. Ctrl+Click / middle-click opens in new tab. Initial hash restored after login via `_initialHash`.

**Collapsible sidebar groups**: СЛОВАРИ and ИМПОРТ sections collapse/expand via `toggleNavGroup(id)`, state saved in localStorage.

**Statistics**: loads only on "Применить" button or tab switch (not on date input change). Date shortcut buttons (Вчера, Неделя, etc.) clear active state on manual date change via `clearShortcuts()`. Conversion percentages shown without color, ROI keeps green/red.

**Flatpickr range pickers**: All date ranges use single input with `mode: 'range'` — first click = start, second = end. Helper functions: `initRangePicker()`, `getRangeValues()`, `setRangeValues()`, `clearRangePicker()`. Applied to: stats, dashboard, P&L, compare, FBTool import.

**Creatives per-geo**: Same creative name allowed for different geos (UNIQUE on name+geo_id, not just name). Bulk add via "Добавить список" modal. Inline creative select in Нераспознанные tab filtered by row's geo.

**Adset upsert**: POST /api/adsets does INSERT OR UPDATE — if adset name exists, updates creative_id/geo_id/agent_id instead of failing. Chatterfy import always replaces duplicates (no checkbox).

**SSE (Server-Sent Events)**: `/api/events` endpoint replaces polling. Events: `pending_update`, `data_update`. Auth via query param `?token=`. Fallback to 30s polling if SSE fails. `App.Realtime.init()` manages EventSource lifecycle.

**Audit trail**: `data_changes` table tracks field-level before/after values on all PUT endpoints (geos, agents, creatives). `trackChanges(tableName, recordId, oldData, newData, userId, username)` helper. API: `GET /api/changes?table_name=X&record_id=Y`.

**Global search**: `Ctrl+K` opens search modal. Backend `GET /api/search?q=X` searches geos, agents, creatives, adsets. Results navigate to correct section/dict.

**Compact sidebar**: Toggle button at bottom. 60px width, icons only, state in localStorage. CSS transitions on width.

**Mobile responsive**: `@media (max-width: 768px)` — sidebar becomes slide-out drawer, hamburger button, 44px min touch targets.

**Custom toast system**: Slide-in from right, progress bar timer (3.5s), stackable, color-coded by type (success/danger/warning/info).

## Deployment

Git push to `main` → Railway auto-deploys (sometimes needs manual Redeploy). Remote: `https://github.com/molipaul/crmtestproject.git`. Production URL: `https://crmtestproject-production.up.railway.app`

## Roadmap / Known Plans

- Dark mode toggle
- Sortable columns across all tables (not just statistics)
- Import progress bars for large batch operations
- Final deployment: VPS (SQLite persistent, no migration needed)
