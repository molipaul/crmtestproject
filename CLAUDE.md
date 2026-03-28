# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

McQueen Tracker — full-stack Node.js CRM for traffic arbitrage. Russian-language SPA with role-based access (admin/buyer/operator). Deployed on Railway via git push to `main`.

## Commands

```bash
npm install          # Install dependencies
npm start            # Start server (or: node server.js)
run.bat              # Windows: start + open browser
```

Server runs on `http://localhost:8000` (or `$PORT`). Default login: `admin` / `admin123`.

## Architecture

**Monolith**: single `server.js` (Express + better-sqlite3) serves API and static frontend.

- `server.js` — All backend: schema, migrations, auth middleware, ~50 API routes, activity logging
- `frontend/app.js` — All frontend logic (~2800 lines), ~20 `App.*` modules (Auth, Stats, Deposits, Import, Dashboard, etc.)
- `frontend/index.html` — SPA shell with all sections and modals
- `frontend/style.css` — Bootstrap 5.3 overrides
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

**Migrations**: idempotent `ALTER TABLE` wrapped in `try/catch` — no migration files.

**Activity logging**: `logActivity(userId, username, action, details)` on all admin actions.

**Statistics queries**: correlated subqueries with dynamic WHERE clauses built from `geo_id`, `agent_id`, date range params.

## Database

20+ tables. Key ones: `users`, `sessions`, `geos`, `agents`, `creatives`, `adsets`, `fb_cabinets`, `spend_records`, `chatterfy_records`, `manual_deposits`, `team_expenses`, `activity_log`.

Reset DB: delete `crm.db*` files, restart server.

**Railway caveat**: SQLite is ephemeral — data lost on redeploy. Volume mount or DB migration needed for persistence.

## Frontend Modules

`App.Auth`, `App.Stats`, `App.Deposits`, `App.Import`, `App.Dashboard`, `App.Geos`, `App.Agents`, `App.Creatives`, `App.Undefined`, `App.Cabinets`, `App.Users`, `App.Expenses`, `App.PL`, `App.ActivityLog`, `App.Notifications`, `App.Export`

Global state loaded on init: `state.geos`, `state.agents`. Navigation via `showSection(name)` + `switchDict(name)`.

## Deployment

Git push to `main` → Railway auto-deploys. Remote: `https://github.com/molipaul/crmtestproject.git`. Production URL: `https://crmtestproject-production.up.railway.app`
