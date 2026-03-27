'use strict';

const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;
const DB_PATH = path.join(__dirname, 'crm.db');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// ─── DATABASE ─────────────────────────────────────────────────────────────────

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS geos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    abbreviation TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    abbreviation TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS agent_commissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    commission_pct REAL NOT NULL,
    effective_from TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS creatives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    geo_id INTEGER REFERENCES geos(id)
  );
  CREATE TABLE IF NOT EXISTS adsets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    creative_id INTEGER REFERENCES creatives(id),
    geo_id INTEGER REFERENCES geos(id),
    agent_id INTEGER REFERENCES agents(id),
    is_undefined INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS fb_cabinets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    account_id TEXT NOT NULL,
    access_token TEXT,
    is_active INTEGER DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS spend_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    adset_id INTEGER REFERENCES adsets(id),
    adset_name TEXT NOT NULL,
    date TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    cabinet_id INTEGER REFERENCES fb_cabinets(id),
    imported_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS chatterfy_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    adset_id INTEGER REFERENCES adsets(id),
    adset_name TEXT NOT NULL,
    date TEXT NOT NULL,
    pdp INTEGER DEFAULT 0,
    dialogs INTEGER DEFAULT 0,
    registrations INTEGER DEFAULT 0,
    deposits INTEGER DEFAULT 0,
    redeposits INTEGER DEFAULT 0,
    imported_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS manual_deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    adset_id INTEGER NOT NULL REFERENCES adsets(id),
    date TEXT NOT NULL,
    amount REAL NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('dep','redep')),
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','buyer','operator')),
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
`);

// ─── MIGRATIONS (idempotent) ──────────────────────────────────────────────────

try { db.exec("ALTER TABLE manual_deposits ADD COLUMN created_by INTEGER REFERENCES users(id)"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN agent_id INTEGER REFERENCES agents(id)"); } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS team_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('income','expense')),
    description TEXT,
    amount REAL NOT NULL,
    item_id INTEGER REFERENCES expense_items(id),
    created_by INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS expense_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('income','expense')),
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS expense_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS adset_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL CHECK(entity_type IN ('geo','agent','creative')),
    pattern TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    priority INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);
try { db.exec("ALTER TABLE team_expenses ADD COLUMN item_id INTEGER REFERENCES expense_items(id)"); } catch {}
try { db.exec("ALTER TABLE adsets ADD COLUMN buyer_id INTEGER REFERENCES users(id)"); } catch {}
try { db.exec("ALTER TABLE manual_deposits ADD COLUMN status TEXT DEFAULT 'confirmed'"); } catch {}
try { db.exec("ALTER TABLE team_expenses ADD COLUMN notes TEXT"); } catch {}
try { db.exec(`CREATE TABLE IF NOT EXISTS operator_geos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  geo_id INTEGER NOT NULL REFERENCES geos(id) ON DELETE CASCADE,
  UNIQUE(user_id, geo_id)
)`); } catch {}

function getOperatorGeoIds(userId) {
  return db.prepare('SELECT geo_id FROM operator_geos WHERE user_id = ?').all(userId).map(r => r.geo_id);
}

// Migrate adset_patterns to support creative entity_type
try {
  const hasCreative = db.prepare("SELECT sql FROM sqlite_master WHERE name='adset_patterns'").get();
  if (hasCreative && !hasCreative.sql.includes('creative')) {
    db.exec("ALTER TABLE adset_patterns RENAME TO adset_patterns_old");
    db.exec(`CREATE TABLE adset_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('geo','agent','creative')),
      pattern TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      priority INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    db.exec("INSERT INTO adset_patterns SELECT * FROM adset_patterns_old");
    db.exec("DROP TABLE adset_patterns_old");
  }
} catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    username TEXT,
    action TEXT NOT NULL,
    details TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    abbreviation TEXT NOT NULL UNIQUE,
    geo_id INTEGER REFERENCES geos(id),
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('daily','weekly','monthly')),
    entity_type TEXT NOT NULL CHECK(entity_type IN ('buyer','geo','agent')),
    entity_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);
try { db.exec("ALTER TABLE adsets ADD COLUMN offer_id INTEGER REFERENCES offers(id)"); } catch {}

function logActivity(userId, username, action, details) {
  try { db.prepare('INSERT INTO activity_log (user_id, username, action, details) VALUES (?, ?, ?, ?)').run(userId, username, action, details || null); } catch {}
}

// ─── AUTH HELPERS ─────────────────────────────────────────────────────────────

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function createUser(username, password, role) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  return db.prepare('INSERT INTO users (username, password_hash, salt, role) VALUES (?, ?, ?, ?)').run(username, hash, salt, role);
}

function verifyPassword(password, hash, salt) {
  return hashPassword(password, salt) === hash;
}

// Seed default admin on first run
if (db.prepare('SELECT COUNT(*) as c FROM users').get().c === 0) {
  createUser('admin', 'admin123', 'admin');
  console.log('  Default user created: admin / admin123');
}

// Clean expired sessions on startup
db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────

function requireAuth(...roles) {
  return (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ detail: 'Требуется авторизация' });
    }
    const token = auth.slice(7);
    const session = db.prepare(`
      SELECT s.token, s.expires_at, u.id AS user_id, u.username, u.role
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires_at > datetime('now')
    `).get(token);

    if (!session) {
      return res.status(401).json({ detail: 'Сессия истекла, войдите снова' });
    }
    if (roles.length && !roles.includes(session.role)) {
      return res.status(403).json({ detail: 'Нет доступа' });
    }
    req.user = { id: session.user_id, username: session.username, role: session.role };
    next();
  };
}

const anyAuth = requireAuth();  // any authenticated user
const adminOnly = requireAuth('admin');
const adminBuyer = requireAuth('admin', 'buyer');
const adminOperator = requireAuth('admin', 'operator');

// ─── AUTH ROUTES ─────────────────────────────────────────────────────────────

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ detail: 'Введите логин и пароль' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !verifyPassword(password, user.password_hash, user.salt)) {
    return res.status(401).json({ detail: 'Неверный логин или пароль' });
  }

  const token = crypto.randomUUID();
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, expires);

  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

app.post('/api/auth/logout', anyAuth, (req, res) => {
  const token = req.headers.authorization.slice(7);
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.json({ ok: true });
});

app.get('/api/auth/me', anyAuth, (req, res) => {
  res.json(req.user);
});

// ─── USERS (admin only) ───────────────────────────────────────────────────────

app.get('/api/users', adminOnly, (req, res) => {
  const rows = db.prepare('SELECT id, username, role, created_at FROM users ORDER BY created_at DESC').all();
  rows.forEach(u => { if (u.role === 'operator') u.geo_ids = getOperatorGeoIds(u.id); });
  res.json(rows);
});

app.get('/api/users/:id/geos', requireAuth('admin', 'operator'), (req, res) => {
  const targetId = parseInt(req.params.id);
  if (req.user.role === 'operator' && req.user.id !== targetId) return err(res, 403, 'Нет доступа');
  res.json(getOperatorGeoIds(targetId));
});

app.put('/api/users/:id/geos', adminOnly, (req, res) => {
  const userId = parseInt(req.params.id);
  const { geo_ids } = req.body;
  if (!Array.isArray(geo_ids)) return err(res, 400, 'geo_ids must be array');
  db.transaction(() => {
    db.prepare('DELETE FROM operator_geos WHERE user_id = ?').run(userId);
    for (const geoId of geo_ids) {
      try { db.prepare('INSERT INTO operator_geos (user_id, geo_id) VALUES (?, ?)').run(userId, geoId); } catch {}
    }
  })();
  logActivity(req.user.id, req.user.username, 'set_operator_geos', `user#${userId}: [${geo_ids}]`);
  res.json({ ok: true });
});

app.post('/api/users', adminOnly, (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) return res.status(400).json({ detail: 'Заполните все поля' });
  if (!['admin', 'buyer', 'operator'].includes(role)) return res.status(400).json({ detail: 'Неверная роль' });
  try {
    const info = createUser(username, password, role);
    logActivity(req.user.id, req.user.username, 'user_create', username);
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ detail: 'Пользователь с таким именем уже существует' });
    res.status(500).json({ detail: e.message });
  }
});

app.put('/api/users/:id', adminOnly, (req, res) => {
  const { role, password } = req.body;
  if (role) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  }
  if (password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);
    db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(hash, salt, req.params.id);
  }
  res.json({ ok: true });
});

app.delete('/api/users/:id', adminOnly, (req, res) => {
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ detail: 'Нельзя удалить себя' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  logActivity(req.user.id, req.user.username, 'user_delete', req.params.id);
  res.json({ ok: true });
});

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function parseAdsetName(name, geos, agents) {
  let geoMatch = null;
  let agentMatch = null;

  // 1. Try DB-configured patterns first (ordered by priority DESC)
  const patterns = db.prepare('SELECT * FROM adset_patterns ORDER BY priority DESC, id ASC').all();
  for (const p of patterns) {
    try {
      const re = new RegExp(p.pattern, 'i');
      if (re.test(name)) {
        if (p.entity_type === 'geo' && !geoMatch) {
          geoMatch = geos.find(g => g.id === p.entity_id) || null;
        } else if (p.entity_type === 'agent' && !agentMatch) {
          agentMatch = agents.find(a => a.id === p.entity_id) || null;
        }
      }
    } catch {}
  }

  // 2. Fallback: match geo by abbreviation prefix, agent by abbreviation after geo prefix
  if (!geoMatch) {
    const sortedGeos = [...geos].sort((a, b) => b.abbreviation.length - a.abbreviation.length);
    for (const geo of sortedGeos) {
      if (name.toUpperCase().startsWith(geo.abbreviation.toUpperCase())) {
        geoMatch = geo;
        break;
      }
    }
  }
  if (!agentMatch && geoMatch) {
    const remaining = name.slice(geoMatch.abbreviation.length);
    const sortedAgents = [...agents].sort((a, b) => b.abbreviation.length - a.abbreviation.length);
    for (const agent of sortedAgents) {
      if (remaining.slice(0, agent.abbreviation.length).toLowerCase() === agent.abbreviation.toLowerCase()) {
        agentMatch = agent;
        break;
      }
    }
  }

  // 3. Creative patterns from DB
  let creativeName = null;
  for (const p of patterns) {
    if (p.entity_type !== 'creative') continue;
    try {
      const re = new RegExp(p.pattern, 'i');
      const m = name.match(re);
      if (m) {
        const cr = db.prepare('SELECT * FROM creatives WHERE id = ?').get(p.entity_id);
        if (cr) creativeName = cr.name;
        break;
      }
    } catch {}
  }

  // 4. Fallback: extract creative suffix from adset name
  if (!creativeName && geoMatch && agentMatch) {
    const afterGeoAgent = name.slice(geoMatch.abbreviation.length + agentMatch.abbreviation.length);
    const idMatch = afterGeoAgent.match(/^(\d+(?:B\d+)?(?:L\d+)?)(.*)/i);
    if (idMatch && idMatch[2] && idMatch[2].length >= 2) {
      creativeName = idMatch[2];
    }
  }

  return { geoMatch, agentMatch, creativeName };
}

function resolveAdset(name) {
  let row = db.prepare('SELECT * FROM adsets WHERE name = ?').get(name);
  if (row) return row;
  const geos = db.prepare('SELECT * FROM geos').all();
  const agents = db.prepare('SELECT * FROM agents').all();
  const { geoMatch, agentMatch, creativeName } = parseAdsetName(name, geos, agents);
  const geo_id = geoMatch ? geoMatch.id : null;
  const agent_id = agentMatch ? agentMatch.id : null;

  let creative_id = null;
  if (creativeName) {
    let creative = db.prepare('SELECT * FROM creatives WHERE name = ?').get(creativeName);
    if (!creative) {
      try {
        db.prepare('INSERT INTO creatives (name, geo_id) VALUES (?, ?)').run(creativeName, geo_id);
        creative = db.prepare('SELECT * FROM creatives WHERE name = ?').get(creativeName);
      } catch {}
    }
    if (creative) creative_id = creative.id;
  }

  const is_undefined = (geo_id && agent_id) ? 0 : 1;
  db.prepare('INSERT OR IGNORE INTO adsets (name, creative_id, geo_id, agent_id, is_undefined) VALUES (?, ?, ?, ?, ?)').run(name, creative_id, geo_id, agent_id, is_undefined);
  return db.prepare('SELECT * FROM adsets WHERE name = ?').get(name);
}

function monthRange(month) {
  if (!month) return [null, null];
  const [year, m] = month.split('-').map(Number);
  const last = new Date(year, m, 0).getDate();
  return [`${month}-01`, `${month}-${String(last).padStart(2, '0')}`];
}

function dateRange(q) {
  if (q.from) return [q.from, q.to || q.from];
  return monthRange(q.month);
}

function err(res, status, msg) {
  return res.status(status).json({ detail: msg });
}

// ─── GEO ─────────────────────────────────────────────────────────────────────

app.get('/api/geos', anyAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM geos ORDER BY name').all());
});

app.post('/api/geos', adminBuyer, (req, res) => {
  const { name, abbreviation } = req.body;
  if (!name || !abbreviation) return err(res, 400, 'Заполните все поля');
  try {
    db.prepare('INSERT INTO geos (name, abbreviation) VALUES (?, ?)').run(name, abbreviation.toUpperCase());
    logActivity(req.user.id, req.user.username, 'geo_create', name);
    res.json(db.prepare('SELECT * FROM geos WHERE abbreviation = ?').get(abbreviation.toUpperCase()));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return err(res, 400, 'Гео с такой аббревиатурой уже существует');
    err(res, 500, e.message);
  }
});

app.put('/api/geos/:id', adminBuyer, (req, res) => {
  const { name, abbreviation } = req.body;
  db.prepare('UPDATE geos SET name = ?, abbreviation = ? WHERE id = ?').run(name, abbreviation.toUpperCase(), req.params.id);
  logActivity(req.user.id, req.user.username, 'geo_update', name);
  res.json({ ok: true });
});

app.delete('/api/geos/:id', adminBuyer, (req, res) => {
  db.prepare('DELETE FROM geos WHERE id = ?').run(req.params.id);
  logActivity(req.user.id, req.user.username, 'geo_delete', req.params.id);
  res.json({ ok: true });
});

// ─── AGENTS ──────────────────────────────────────────────────────────────────

app.get('/api/agents', anyAuth, (req, res) => {
  const agents = db.prepare('SELECT * FROM agents ORDER BY name').all();
  const result = agents.map(a => {
    const comms = db.prepare('SELECT * FROM agent_commissions WHERE agent_id = ? ORDER BY effective_from DESC').all(a.id);
    return { ...a, commissions: comms, current_commission: comms[0]?.commission_pct ?? 0 };
  });
  res.json(result);
});

app.post('/api/agents', adminBuyer, (req, res) => {
  const { name, abbreviation, commission_pct } = req.body;
  if (!name || !abbreviation) return err(res, 400, 'Заполните все поля');
  try {
    const info = db.prepare('INSERT INTO agents (name, abbreviation) VALUES (?, ?)').run(name, abbreviation);
    const today = new Date().toISOString().slice(0, 10);
    db.prepare('INSERT INTO agent_commissions (agent_id, commission_pct, effective_from) VALUES (?, ?, ?)').run(info.lastInsertRowid, commission_pct ?? 0, today);
    logActivity(req.user.id, req.user.username, 'agent_create', name);
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return err(res, 400, 'Агент с такой аббревиатурой уже существует');
    err(res, 500, e.message);
  }
});

app.put('/api/agents/:id', adminBuyer, (req, res) => {
  const { name, abbreviation } = req.body;
  db.prepare('UPDATE agents SET name = ?, abbreviation = ? WHERE id = ?').run(name, abbreviation, req.params.id);
  logActivity(req.user.id, req.user.username, 'agent_update', name);
  res.json({ ok: true });
});

app.post('/api/agents/:id/commissions', adminBuyer, (req, res) => {
  const { commission_pct, effective_from } = req.body;
  db.prepare('INSERT INTO agent_commissions (agent_id, commission_pct, effective_from) VALUES (?, ?, ?)').run(req.params.id, commission_pct, effective_from);
  res.json({ ok: true });
});

app.delete('/api/agents/:id', adminBuyer, (req, res) => {
  db.prepare('DELETE FROM agents WHERE id = ?').run(req.params.id);
  logActivity(req.user.id, req.user.username, 'agent_delete', req.params.id);
  res.json({ ok: true });
});

// ─── CREATIVES ───────────────────────────────────────────────────────────────

app.get('/api/creatives', anyAuth, (req, res) => {
  const { geo_id } = req.query;
  let q = 'SELECT c.*, g.name as geo_name FROM creatives c LEFT JOIN geos g ON g.id = c.geo_id';
  if (geo_id) q += ` WHERE c.geo_id = ${parseInt(geo_id)}`;
  q += ' ORDER BY c.name';
  const creatives = db.prepare(q).all();
  const result = creatives.map(c => {
    const adsets = db.prepare(`
      SELECT a.*, g.name as geo_name, ag.name as agent_name
      FROM adsets a
      LEFT JOIN geos g ON g.id = a.geo_id
      LEFT JOIN agents ag ON ag.id = a.agent_id
      WHERE a.creative_id = ? ORDER BY a.name
    `).all(c.id);
    return { ...c, adsets };
  });
  res.json(result);
});

app.post('/api/creatives', adminBuyer, (req, res) => {
  const { name, geo_id } = req.body;
  if (!name) return err(res, 400, 'Введите название');
  try {
    db.prepare('INSERT INTO creatives (name, geo_id) VALUES (?, ?)').run(name, geo_id || null);
    logActivity(req.user.id, req.user.username, 'creative_create', name);
    res.json(db.prepare('SELECT * FROM creatives WHERE name = ?').get(name));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return err(res, 400, 'Креатив с таким названием уже существует');
    err(res, 500, e.message);
  }
});

app.put('/api/creatives/:id', adminBuyer, (req, res) => {
  const { name, geo_id } = req.body;
  db.prepare('UPDATE creatives SET name = ?, geo_id = ? WHERE id = ?').run(name, geo_id || null, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/creatives/:id', adminBuyer, (req, res) => {
  db.prepare('DELETE FROM creatives WHERE id = ?').run(req.params.id);
  logActivity(req.user.id, req.user.username, 'creative_delete', req.params.id);
  res.json({ ok: true });
});

// ─── ADSETS ──────────────────────────────────────────────────────────────────

app.get('/api/adsets', anyAuth, (req, res) => {
  const { geo_id, creative_id, undefined_only } = req.query;
  let q = `SELECT a.*, g.name as geo_name, ag.name as agent_name, c.name as creative_name, bu.username as buyer_name
           FROM adsets a
           LEFT JOIN geos g ON g.id = a.geo_id
           LEFT JOIN agents ag ON ag.id = a.agent_id
           LEFT JOIN creatives c ON c.id = a.creative_id
           LEFT JOIN users bu ON bu.id = a.buyer_id
           WHERE 1=1`;
  const params = [];
  if (geo_id) { q += ' AND a.geo_id = ?'; params.push(parseInt(geo_id)); }
  if (creative_id) { q += ' AND a.creative_id = ?'; params.push(parseInt(creative_id)); }
  if (undefined_only === 'true') { q += ' AND a.is_undefined = 1'; }
  q += ' ORDER BY a.name';
  res.json(db.prepare(q).all(...params));
});

app.post('/api/adsets', adminBuyer, (req, res) => {
  let { name, creative_id, geo_id, agent_id, buyer_id } = req.body;
  if (!name) return err(res, 400, 'Введите название');
  if (!geo_id || !agent_id) {
    const geos = db.prepare('SELECT * FROM geos').all();
    const agents = db.prepare('SELECT * FROM agents').all();
    const { geoMatch, agentMatch } = parseAdsetName(name, geos, agents);
    if (!geo_id && geoMatch) geo_id = geoMatch.id;
    if (!agent_id && agentMatch) agent_id = agentMatch.id;
  }
  const is_undefined = (geo_id && agent_id) ? 0 : 1;
  try {
    db.prepare('INSERT INTO adsets (name, creative_id, geo_id, agent_id, is_undefined, buyer_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(name, creative_id || null, geo_id || null, agent_id || null, is_undefined, buyer_id || null);
    logActivity(req.user.id, req.user.username, 'adset_create', name);
    res.json(db.prepare('SELECT * FROM adsets WHERE name = ?').get(name));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return err(res, 400, 'Адсет с таким именем уже существует');
    err(res, 500, e.message);
  }
});

app.put('/api/adsets/:id', adminBuyer, (req, res) => {
  const { name, creative_id, geo_id, agent_id, buyer_id } = req.body;
  const is_undefined = (geo_id && agent_id) ? 0 : 1;
  db.prepare('UPDATE adsets SET creative_id = ?, geo_id = ?, agent_id = ?, is_undefined = ?, buyer_id = ? WHERE id = ?')
    .run(creative_id || null, geo_id || null, agent_id || null, is_undefined, buyer_id || null, req.params.id);
  res.json({ ok: true });
});

// Bulk assign fields to multiple adsets
app.put('/api/adsets/bulk', adminBuyer, (req, res) => {
  const { ids, geo_id, agent_id, creative_id } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ detail: 'ids required' });
  const stmt = db.prepare('SELECT id, geo_id, agent_id, creative_id FROM adsets WHERE id = ?');
  const upd = db.prepare('UPDATE adsets SET geo_id = ?, agent_id = ?, creative_id = ?, is_undefined = ? WHERE id = ?');
  let ok = 0;
  db.transaction(() => {
    for (const id of ids) {
      const row = stmt.get(id);
      if (!row) continue;
      const g = geo_id !== undefined ? (geo_id || null) : row.geo_id;
      const a = agent_id !== undefined ? (agent_id || null) : row.agent_id;
      const c = creative_id !== undefined ? (creative_id || null) : row.creative_id;
      const is_undefined = (g && a) ? 0 : 1;
      upd.run(g, a, c, is_undefined, id);
      ok++;
    }
  })();
  logActivity(req.user.id, req.user.username, 'adsets_bulk_assign', `${ok} adsets`);
  res.json({ ok, total: ids.length });
});

app.delete('/api/adsets/:id', adminBuyer, (req, res) => {
  const id = req.params.id;
  try {
    db.transaction(() => {
      // Nullify FK references where possible, delete where NOT NULL constraint exists
      db.prepare('UPDATE spend_records SET adset_id = NULL WHERE adset_id = ?').run(id);
      db.prepare('UPDATE chatterfy_records SET adset_id = NULL WHERE adset_id = ?').run(id);
      db.prepare('DELETE FROM manual_deposits WHERE adset_id = ?').run(id);
      db.prepare('DELETE FROM adsets WHERE id = ?').run(id);
    })();
    logActivity(req.user.id, req.user.username, 'adset_delete', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ detail: 'Ошибка удаления адсета: ' + e.message });
  }
});

// ─── STATISTICS ──────────────────────────────────────────────────────────────

app.get('/api/statistics/creatives', adminBuyer, (req, res) => { try {
  const { geo_id, agent_id } = req.query;
  const [s, e] = dateRange(req.query);
  const df_s = s ? 'AND sr.date BETWEEN ? AND ?' : '';
  const df_c = s ? 'AND ch.date BETWEEN ? AND ?' : '';
  const df_d = s ? 'AND md.date BETWEEN ? AND ?' : '';
  const gf = geo_id ? 'AND a.geo_id = ?' : '';
  const agf = agent_id ? 'AND a.agent_id = ?' : '';

  const makeParams = () => {
    const p = [];
    if (geo_id) p.push(parseInt(geo_id));
    if (agent_id) p.push(parseInt(agent_id));
    if (s) p.push(s, e);
    return p;
  };

  const rows = db.prepare(`
    SELECT c.id, c.name AS creative, g.name AS geo,
      (SELECT COALESCE(SUM(sr.amount),0) FROM spend_records sr JOIN adsets a ON a.id=sr.adset_id WHERE a.creative_id=c.id ${gf} ${agf} ${df_s}) AS spend,
      (SELECT COALESCE(SUM(ch.pdp),0) FROM chatterfy_records ch JOIN adsets a ON a.id=ch.adset_id WHERE a.creative_id=c.id ${gf} ${agf} ${df_c}) AS pdp,
      (SELECT COALESCE(SUM(ch.dialogs),0) FROM chatterfy_records ch JOIN adsets a ON a.id=ch.adset_id WHERE a.creative_id=c.id ${gf} ${agf} ${df_c}) AS dialogs,
      (SELECT COALESCE(SUM(ch.registrations),0) FROM chatterfy_records ch JOIN adsets a ON a.id=ch.adset_id WHERE a.creative_id=c.id ${gf} ${agf} ${df_c}) AS registrations,
      (SELECT COALESCE(SUM(ch.deposits),0) FROM chatterfy_records ch JOIN adsets a ON a.id=ch.adset_id WHERE a.creative_id=c.id ${gf} ${agf} ${df_c}) AS deposits_count,
      (SELECT COALESCE(SUM(ch.redeposits),0) FROM chatterfy_records ch JOIN adsets a ON a.id=ch.adset_id WHERE a.creative_id=c.id ${gf} ${agf} ${df_c}) AS redeposits_count,
      (SELECT COALESCE(SUM(md.amount),0) FROM manual_deposits md JOIN adsets a ON a.id=md.adset_id WHERE a.creative_id=c.id ${gf} ${agf} ${df_d}) AS deposit_amount
    FROM creatives c LEFT JOIN geos g ON g.id=c.geo_id ORDER BY c.name
  `).all(...makeParams(), ...makeParams(), ...makeParams(), ...makeParams(), ...makeParams(), ...makeParams(), ...makeParams());

  res.json(rows.map(r => enrichStats(r)));
} catch(e) { res.status(500).json({ detail: e.message }); } });

app.get('/api/statistics/geos', adminBuyer, (req, res) => { try {
  const [s, e] = dateRange(req.query);
  const df_s = s ? 'AND sr.date BETWEEN ? AND ?' : '';
  const df_c = s ? 'AND ch.date BETWEEN ? AND ?' : '';
  const df_d = s ? 'AND md.date BETWEEN ? AND ?' : '';
  const sp = s ? [s, e] : [];

  const rows = db.prepare(`
    SELECT t.id, t.name AS geo, t.abbreviation,
      (SELECT COALESCE(SUM(sr.amount),0) FROM spend_records sr JOIN adsets a ON a.id=sr.adset_id WHERE a.geo_id=t.id ${df_s}) AS spend,
      (SELECT COALESCE(SUM(ch.pdp),0) FROM chatterfy_records ch JOIN adsets a ON a.id=ch.adset_id WHERE a.geo_id=t.id ${df_c}) AS pdp,
      (SELECT COALESCE(SUM(ch.dialogs),0) FROM chatterfy_records ch JOIN adsets a ON a.id=ch.adset_id WHERE a.geo_id=t.id ${df_c}) AS dialogs,
      (SELECT COALESCE(SUM(ch.registrations),0) FROM chatterfy_records ch JOIN adsets a ON a.id=ch.adset_id WHERE a.geo_id=t.id ${df_c}) AS registrations,
      (SELECT COALESCE(SUM(ch.deposits),0) FROM chatterfy_records ch JOIN adsets a ON a.id=ch.adset_id WHERE a.geo_id=t.id ${df_c}) AS deposits_count,
      (SELECT COALESCE(SUM(ch.redeposits),0) FROM chatterfy_records ch JOIN adsets a ON a.id=ch.adset_id WHERE a.geo_id=t.id ${df_c}) AS redeposits_count,
      (SELECT COALESCE(SUM(md.amount),0) FROM manual_deposits md JOIN adsets a ON a.id=md.adset_id WHERE a.geo_id=t.id ${df_d}) AS deposit_amount
    FROM geos t ORDER BY t.name
  `).all(...sp, ...sp, ...sp, ...sp, ...sp, ...sp, ...sp);

  res.json(rows.map(r => enrichStats(r)));
} catch(e) { res.status(500).json({ detail: e.message }); } });

app.get('/api/statistics/agents', adminBuyer, (req, res) => { try {
  const [s, e] = dateRange(req.query);
  const df_s = s ? 'AND sr.date BETWEEN ? AND ?' : '';
  const df_c = s ? 'AND ch.date BETWEEN ? AND ?' : '';
  const df_d = s ? 'AND md.date BETWEEN ? AND ?' : '';
  const sp = s ? [s, e] : [];

  const rows = db.prepare(`
    SELECT t.id, t.name AS agent, t.abbreviation,
      (SELECT COALESCE(SUM(sr.amount),0) FROM spend_records sr JOIN adsets a ON a.id=sr.adset_id WHERE a.agent_id=t.id ${df_s}) AS spend,
      (SELECT COALESCE(SUM(ch.pdp),0) FROM chatterfy_records ch JOIN adsets a ON a.id=ch.adset_id WHERE a.agent_id=t.id ${df_c}) AS pdp,
      (SELECT COALESCE(SUM(ch.dialogs),0) FROM chatterfy_records ch JOIN adsets a ON a.id=ch.adset_id WHERE a.agent_id=t.id ${df_c}) AS dialogs,
      (SELECT COALESCE(SUM(ch.registrations),0) FROM chatterfy_records ch JOIN adsets a ON a.id=ch.adset_id WHERE a.agent_id=t.id ${df_c}) AS registrations,
      (SELECT COALESCE(SUM(ch.deposits),0) FROM chatterfy_records ch JOIN adsets a ON a.id=ch.adset_id WHERE a.agent_id=t.id ${df_c}) AS deposits_count,
      (SELECT COALESCE(SUM(ch.redeposits),0) FROM chatterfy_records ch JOIN adsets a ON a.id=ch.adset_id WHERE a.agent_id=t.id ${df_c}) AS redeposits_count,
      (SELECT COALESCE(SUM(md.amount),0) FROM manual_deposits md JOIN adsets a ON a.id=md.adset_id WHERE a.agent_id=t.id ${df_d}) AS deposit_amount
    FROM agents t ORDER BY t.name
  `).all(...sp, ...sp, ...sp, ...sp, ...sp, ...sp, ...sp);

  res.json(rows.map(r => {
    const base = enrichStats(r);
    let commRow;
    if (s) {
      commRow = db.prepare('SELECT commission_pct FROM agent_commissions WHERE agent_id = ? AND effective_from <= ? ORDER BY effective_from DESC LIMIT 1').get(r.id, s);
      if (!commRow) commRow = db.prepare('SELECT commission_pct FROM agent_commissions WHERE agent_id = ? ORDER BY effective_from ASC LIMIT 1').get(r.id);
    } else {
      commRow = db.prepare('SELECT commission_pct FROM agent_commissions WHERE agent_id = ? ORDER BY effective_from DESC LIMIT 1').get(r.id);
    }
    const commission_pct = commRow?.commission_pct ?? 0;
    return { ...base, commission_pct, commission_amount: +(base.deposit_amount * commission_pct / 100).toFixed(2) };
  }));
} catch(e) { res.status(500).json({ detail: e.message }); } });

// Drill-down: adsets for a specific creative/geo/agent
app.get('/api/statistics/drilldown', adminBuyer, (req, res) => { try {
  const { type, id } = req.query;
  const [s, e] = dateRange(req.query);
  const df_s = s ? 'AND sr.date BETWEEN ? AND ?' : '';
  const df_c = s ? 'AND ch.date BETWEEN ? AND ?' : '';
  const df_d = s ? 'AND md.date BETWEEN ? AND ?' : '';
  const sp = s ? [s, e] : [];
  const filterCol = type === 'creative' ? 'a.creative_id' : type === 'geo' ? 'a.geo_id' : 'a.agent_id';

  const rows = db.prepare(`
    SELECT a.id, a.name AS adset,
      (SELECT COALESCE(SUM(sr.amount),0) FROM spend_records sr WHERE sr.adset_id=a.id ${df_s}) AS spend,
      (SELECT COALESCE(SUM(ch.pdp),0) FROM chatterfy_records ch WHERE ch.adset_id=a.id ${df_c}) AS pdp,
      (SELECT COALESCE(SUM(ch.dialogs),0) FROM chatterfy_records ch WHERE ch.adset_id=a.id ${df_c}) AS dialogs,
      (SELECT COALESCE(SUM(ch.registrations),0) FROM chatterfy_records ch WHERE ch.adset_id=a.id ${df_c}) AS registrations,
      (SELECT COALESCE(SUM(ch.deposits),0) FROM chatterfy_records ch WHERE ch.adset_id=a.id ${df_c}) AS deposits_count,
      (SELECT COALESCE(SUM(ch.redeposits),0) FROM chatterfy_records ch WHERE ch.adset_id=a.id ${df_c}) AS redeposits_count,
      (SELECT COALESCE(SUM(md.amount),0) FROM manual_deposits md WHERE md.adset_id=a.id ${df_d}) AS deposit_amount
    FROM adsets a WHERE ${filterCol} = ? ORDER BY a.name
  `).all(...sp, ...sp, ...sp, ...sp, ...sp, ...sp, ...sp, parseInt(id));

  res.json(rows.map(r => enrichStats(r)));
} catch(e) { res.status(500).json({ detail: e.message }); } });

function enrichStats(r) {
  const spend = r.spend || 0;
  const dep = r.deposit_amount || 0;
  const safe = (a, b) => b > 0 ? +(a / b * 100).toFixed(1) : 0;
  const costPer = (a, b) => b > 0 ? +(a / b).toFixed(2) : 0;
  return {
    ...r,
    spend: +spend.toFixed(2),
    deposit_amount: +dep.toFixed(2),
    profit: +(dep - spend).toFixed(2),
    roi: spend > 0 ? +((dep - spend) / spend * 100).toFixed(1) : 0,
    cost_pdp: costPer(spend, r.pdp),
    cost_dia: costPer(spend, r.dialogs),
    cost_reg: costPer(spend, r.registrations),
    cost_dep: costPer(spend, r.deposits_count),
    cost_redep: costPer(spend, r.redeposits_count),
    pct_pdp_dia: safe(r.dialogs, r.pdp),
    pct_dia_reg: safe(r.registrations, r.dialogs),
    pct_reg_dep: safe(r.deposits_count, r.registrations),
    pct_dep_redep: safe(r.redeposits_count, r.deposits_count),
  };
}

// ─── DEPOSITS ────────────────────────────────────────────────────────────────

app.get('/api/deposits', requireAuth('admin', 'buyer', 'operator'), (req, res) => {
  const { geo_id, month } = req.query;
  let q = `SELECT md.*, a.name AS adset_name, c.name AS creative_name, g.name AS geo_name, ag.name AS agent_name, u.username AS operator_name
           FROM manual_deposits md
           JOIN adsets a ON a.id = md.adset_id
           LEFT JOIN creatives c ON c.id = a.creative_id
           LEFT JOIN geos g ON g.id = a.geo_id
           LEFT JOIN agents ag ON ag.id = a.agent_id
           LEFT JOIN users u ON u.id = md.created_by
           WHERE 1=1`;
  const params = [];
  if (geo_id) { q += ' AND a.geo_id = ?'; params.push(parseInt(geo_id)); }
  const [s, e] = monthRange(month);
  if (s) { q += ' AND md.date BETWEEN ? AND ?'; params.push(s, e); }
  if (req.user.role === 'operator') {
    const geoIds = getOperatorGeoIds(req.user.id);
    if (!geoIds.length) return res.json([]);
    q += ` AND a.geo_id IN (${geoIds.map(() => '?').join(',')})`;
    params.push(...geoIds);
  }
  q += ' ORDER BY md.date DESC, md.id DESC';
  res.json(db.prepare(q).all(...params));
});

app.post('/api/deposits', requireAuth('admin','buyer','operator'), (req, res) => {
  const { adset_id, date, amount, type, status } = req.body;
  if (!adset_id || !date || !type) return err(res, 400, 'Заполните обязательные поля');
  if (!['dep', 'redep'].includes(type)) return err(res, 400, 'Тип: dep или redep');
  const depStatus = status === 'pending' ? 'pending' : 'confirmed';
  // Enforce: operators can only post for their assigned geos
  if (req.user.role === 'operator') {
    const adset = db.prepare('SELECT geo_id FROM adsets WHERE id = ?').get(adset_id);
    if (adset) {
      const geoIds = getOperatorGeoIds(req.user.id);
      if (!geoIds.includes(adset.geo_id)) return err(res, 403, 'Этот адсет не входит в ваши гео');
    }
  }
  // Enforce: buyers can only create pending deposits
  if (req.user.role === 'buyer') {
    const depStatusForced = 'pending';
    const depAmountForced = 0;
    db.prepare('INSERT INTO manual_deposits (adset_id, date, amount, type, status, created_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(adset_id, date, depAmountForced, type, depStatusForced, req.user.id);
    logActivity(req.user.id, req.user.username, 'deposit_create', `${type} pending (buyer)`);
    return res.json({ ok: true });
  }
  const depAmount = depStatus === 'pending' ? 0 : (amount || 0);
  if (depStatus === 'confirmed' && !depAmount) return err(res, 400, 'Укажите сумму');
  db.prepare('INSERT INTO manual_deposits (adset_id, date, amount, type, status, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(adset_id, date, depAmount, type, depStatus, req.user.id);
  logActivity(req.user.id, req.user.username, 'deposit_create', `${type} $${depAmount} status=${depStatus}`);
  res.json({ ok: true });
});

app.get('/api/deposits/pending', adminOperator, (req, res) => {
  let q = `SELECT md.*, a.name AS adset_name, g.name AS geo_name, ag.name AS agent_name, u.username AS created_by_name
    FROM manual_deposits md
    JOIN adsets a ON a.id = md.adset_id
    LEFT JOIN geos g ON g.id = a.geo_id
    LEFT JOIN agents ag ON ag.id = a.agent_id
    LEFT JOIN users u ON u.id = md.created_by
    WHERE md.status = 'pending'`;
  const params = [];
  if (req.user.role === 'operator') {
    const geoIds = getOperatorGeoIds(req.user.id);
    if (!geoIds.length) return res.json([]);
    q += ` AND a.geo_id IN (${geoIds.map(() => '?').join(',')})`;
    params.push(...geoIds);
  }
  q += ' ORDER BY md.created_at DESC';
  res.json(db.prepare(q).all(...params));
});

app.put('/api/deposits/:id/confirm', adminOperator, (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return err(res, 400, 'Укажите сумму');
  const dep = db.prepare('SELECT * FROM manual_deposits WHERE id = ?').get(req.params.id);
  if (!dep) return err(res, 404, 'Депозит не найден');
  if (dep.status !== 'pending') return err(res, 400, 'Депозит уже подтверждён');
  db.prepare('UPDATE manual_deposits SET amount = ?, status = ? WHERE id = ?').run(amount, 'confirmed', req.params.id);
  logActivity(req.user.id, req.user.username, 'deposit_confirm', '$' + amount);
  res.json({ ok: true });
});

app.delete('/api/deposits/:id', adminOperator, (req, res) => {
  db.prepare('DELETE FROM manual_deposits WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── CABINETS ────────────────────────────────────────────────────────────────

app.get('/api/cabinets', adminBuyer, (req, res) => {
  res.json(db.prepare('SELECT * FROM fb_cabinets ORDER BY name').all());
});

app.post('/api/cabinets', adminBuyer, (req, res) => {
  const { name, account_id, access_token } = req.body;
  if (!name || !account_id) return err(res, 400, 'Заполните все поля');
  const info = db.prepare('INSERT INTO fb_cabinets (name, account_id, access_token) VALUES (?, ?, ?)').run(name, account_id, access_token || null);
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.put('/api/cabinets/:id', adminBuyer, (req, res) => {
  const { name, account_id, access_token } = req.body;
  db.prepare('UPDATE fb_cabinets SET name = ?, account_id = ?, access_token = ? WHERE id = ?').run(name, account_id, access_token || null, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/cabinets/:id', adminBuyer, (req, res) => {
  db.prepare('DELETE FROM fb_cabinets WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── IMPORT: SPEND ───────────────────────────────────────────────────────────

app.post('/api/import/spend', adminBuyer, (req, res) => {
  const { records } = req.body;
  if (!Array.isArray(records)) return err(res, 400, 'records должен быть массивом');
  const undefined_adsets = new Set();
  let imported = 0;
  const insert = db.prepare('INSERT INTO spend_records (adset_id, adset_name, date, amount, cabinet_id) VALUES (?, ?, ?, ?, ?)');
  db.transaction(() => {
    for (const rec of records) {
      const adset = resolveAdset(rec.adset_name);
      if (adset.is_undefined) undefined_adsets.add(rec.adset_name);
      insert.run(adset.id, rec.adset_name, rec.date, rec.amount, rec.cabinet_id || null);
      imported++;
    }
  })();
  logActivity(req.user.id, req.user.username, 'import_spend', 'imported ' + imported);
  res.json({ ok: true, imported, undefined_adsets: [...undefined_adsets] });
});

app.get('/api/import/spend', adminBuyer, (req, res) => {
  const { month } = req.query;
  let q = `SELECT sr.*, c.name as creative_name, g.name as geo_name
           FROM spend_records sr
           LEFT JOIN adsets a ON a.id = sr.adset_id
           LEFT JOIN creatives c ON c.id = a.creative_id
           LEFT JOIN geos g ON g.id = a.geo_id
           WHERE 1=1`;
  const params = [];
  const [s, e] = monthRange(month);
  if (s) { q += ' AND sr.date BETWEEN ? AND ?'; params.push(s, e); }
  q += ' ORDER BY sr.date DESC, sr.id DESC';
  res.json(db.prepare(q).all(...params));
});

// ─── IMPORT: CHATTERFY ───────────────────────────────────────────────────────

app.post('/api/import/chatterfy', adminBuyer, (req, res) => {
  const { data, date, replace_duplicates } = req.body;
  if (!data || !date) return err(res, 400, 'Укажите дату и данные');
  const undefined_adsets = new Set();
  const errors = [];
  let processed = 0;
  let duplicates = 0;
  const checkDup = db.prepare('SELECT id FROM chatterfy_records WHERE adset_name = ? AND date = ?');
  const insert = db.prepare(`INSERT INTO chatterfy_records
    (adset_id, adset_name, date, pdp, dialogs, registrations, deposits, redeposits)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const update = db.prepare(`UPDATE chatterfy_records SET pdp=?, dialogs=?, registrations=?, deposits=?, redeposits=? WHERE adset_name=? AND date=?`);
  db.transaction(() => {
    for (const line of data.trim().split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(/\t|,|;|\|/);
      if (parts.length < 6) { errors.push(`Мало колонок: ${trimmed}`); continue; }
      const adset_name = parts[0].trim();
      const pdp = parseInt(parts[1]) || 0;
      const dia = parseInt(parts[2]) || 0;
      const regs = parseInt(parts[3]) || 0;
      const deps = parseInt(parts[4]) || 0;
      const redeps = parseInt(parts[5]) || 0;
      const existing = checkDup.get(adset_name, date);
      if (existing) {
        duplicates++;
        if (replace_duplicates) update.run(pdp, dia, regs, deps, redeps, adset_name, date);
        continue;
      }
      const adset = resolveAdset(adset_name);
      if (adset.is_undefined) undefined_adsets.add(adset_name);
      insert.run(adset.id, adset_name, date, pdp, dia, regs, deps, redeps);
      processed++;
    }
  })();
  logActivity(req.user.id, req.user.username, 'import_chatterfy', `imported ${processed}, duplicates ${duplicates}`);
  res.json({ ok: true, processed, duplicates, undefined_adsets: [...undefined_adsets], errors });
});

app.get('/api/import/chatterfy', adminBuyer, (req, res) => {
  const { month } = req.query;
  let q = `SELECT cr.*, a.name as adset_name2, c.name as creative_name, g.name as geo_name
           FROM chatterfy_records cr
           LEFT JOIN adsets a ON a.id = cr.adset_id
           LEFT JOIN creatives c ON c.id = a.creative_id
           LEFT JOIN geos g ON g.id = a.geo_id
           WHERE 1=1`;
  const params = [];
  const [s, e] = monthRange(month);
  if (s) { q += ' AND cr.date BETWEEN ? AND ?'; params.push(s, e); }
  q += ' ORDER BY cr.date DESC, cr.id DESC';
  res.json(db.prepare(q).all(...params));
});

app.delete('/api/import/chatterfy/:id', adminBuyer, (req, res) => {
  db.prepare('DELETE FROM chatterfy_records WHERE id = ?').run(req.params.id);
  logActivity(req.user.id, req.user.username, 'chatterfy_delete', `record #${req.params.id}`);
  res.json({ ok: true });
});

app.delete('/api/import/spend/:id', adminBuyer, (req, res) => {
  db.prepare('DELETE FROM spend_records WHERE id = ?').run(req.params.id);
  logActivity(req.user.id, req.user.username, 'spend_delete', `record #${req.params.id}`);
  res.json({ ok: true });
});

// ─── IMPORT: CHATTERFY CSV ───────────────────────────────────────────────────

app.post('/api/import/chatterfy-csv', adminBuyer, (req, res) => {
  const { date, csv_text } = req.body;
  if (!date || !csv_text) return err(res, 400, 'Укажите дату и csv_text');

  const lines = csv_text.trim().split('\n');
  if (lines.length < 2) return err(res, 400, 'CSV должен содержать заголовок и данные');

  const headers = lines[0].split(';').map(h => h.trim().replace(/^"|"$/g, '').trim());
  // Priority: adset_name > adset name > campaign > name
  const findCol = (...candidates) => {
    for (const c of candidates) {
      const i = headers.findIndex(h => h.toLowerCase() === c);
      if (i !== -1) return i;
    }
    return -1;
  };
  const findColIncludes = (...candidates) => {
    for (const c of candidates) {
      const i = headers.findIndex(h => h.toLowerCase().includes(c));
      if (i !== -1) return i;
    }
    return -1;
  };
  const idx = {
    campaign: findCol('adset_name', 'adset name', 'adset', 'ad set name', 'ad_set_name'),
    subscribes: findCol('subscribes', 'subscribe'),
    dialogues: findCol('dialogues', 'dialogs'),
    registrations: findCol('registrations'),
    fd: findCol('fd'),
    rd: findCol('rd'),
  };
  if (idx.campaign === -1 || idx.fd === -1) return err(res, 400, 'Неверный формат CSV. Нужны колонки: adset_name, FD, RD');
  if (idx.subscribes === -1) return err(res, 400, 'Не найдена колонка "Subscribes" в CSV. Проверьте формат файла.');

  const parseNum = s => parseInt((s || '').replace(/^"|"$/g, '').replace('%', '').trim()) || 0;

  const undefined_adsets = new Set();
  const errors = [];
  let processed = 0;
  let duplicates = 0;
  const checkDup = db.prepare('SELECT id FROM chatterfy_records WHERE adset_name = ? AND date = ?');
  const insert = db.prepare(`INSERT INTO chatterfy_records (adset_id, adset_name, date, pdp, dialogs, registrations, deposits, redeposits) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const update = db.prepare(`UPDATE chatterfy_records SET pdp=?, dialogs=?, registrations=?, deposits=?, redeposits=? WHERE adset_name=? AND date=?`);
  const { replace_duplicates } = req.body;

  db.transaction(() => {
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(';').map(p => p.trim().replace(/^"|"$/g, '').trim());
      const adset_name = parts[idx.campaign];
      if (!adset_name) continue;
      try {
        const sub = parseNum(parts[idx.subscribes]);
        const dia = parseNum(parts[idx.dialogues]);
        const reg = parseNum(parts[idx.registrations]);
        const fd  = parseNum(parts[idx.fd]);
        const rd  = parseNum(parts[idx.rd]);
        const existing = checkDup.get(adset_name, date);
        if (existing) {
          duplicates++;
          if (replace_duplicates) {
            update.run(sub, dia, reg, fd, rd, adset_name, date);
          }
          continue;
        }
        const adset = resolveAdset(adset_name);
        if (adset.is_undefined) undefined_adsets.add(adset_name);
        insert.run(adset.id, adset_name, date, sub, dia, reg, fd, rd);
        processed++;
      } catch (e) { errors.push(`${adset_name}: ${e.message}`); }
    }
  })();

  logActivity(req.user.id, req.user.username, 'import_chatterfy_csv', `imported ${processed}, duplicates ${duplicates}`);
  res.json({ ok: true, processed, duplicates, undefined_adsets: [...undefined_adsets], errors });
});

// ─── IMPORT: FB API ─────────────────────────────────────────────────────────

app.post('/api/import/fb-spend', adminBuyer, async (req, res) => {
  const { cabinet_id, date_from, date_to } = req.body;
  if (!cabinet_id || !date_from || !date_to) return err(res, 400, 'Укажите кабинет и период');
  const cab = db.prepare('SELECT * FROM fb_cabinets WHERE id = ?').get(cabinet_id);
  if (!cab || !cab.access_token) return err(res, 400, 'Кабинет не найден или нет access_token');

  const undefined_adsets = new Set();
  let imported = 0;
  const insert = db.prepare('INSERT INTO spend_records (adset_id, adset_name, date, amount, cabinet_id) VALUES (?, ?, ?, ?, ?)');

  try {
    let url = `https://graph.facebook.com/v19.0/act_${cab.account_id}/insights?fields=adset_name,spend&level=adset&time_increment=1&time_range={"since":"${date_from}","until":"${date_to}"}&limit=500&access_token=${cab.access_token}`;

    while (url) {
      const response = await fetch(url);
      const json = await response.json();
      if (json.error) return err(res, 400, `FB API: ${json.error.message}`);

      const data = json.data || [];
      db.transaction(() => {
        for (const row of data) {
          if (!row.adset_name || !row.spend || parseFloat(row.spend) === 0) continue;
          const adset = resolveAdset(row.adset_name);
          if (adset.is_undefined) undefined_adsets.add(row.adset_name);
          insert.run(adset.id, row.adset_name, row.date_start, parseFloat(row.spend), cab.id);
          imported++;
        }
      })();

      url = json.paging?.next || null;
    }

    res.json({ ok: true, imported, undefined_adsets: [...undefined_adsets] });
  } catch (e) {
    res.status(500).json({ detail: 'Ошибка FB API: ' + e.message });
  }
});

// ─── IMPORT: FBTOOL.PRO API ─────────────────────────────────────────────────

app.post('/api/import/fbtool-spend', adminBuyer, async (req, res) => {
  const { api_key, account_ids, date_from, date_to } = req.body;
  if (!api_key || !account_ids?.length || !date_from || !date_to) return err(res, 400, 'Укажите API key, аккаунты и период');

  const undefined_adsets = new Set();
  let imported = 0;
  const insert = db.prepare('INSERT INTO spend_records (adset_id, adset_name, date, amount, cabinet_id) VALUES (?, ?, ?, ?, ?)');
  const datesParam = `${date_from} - ${date_to}`;

  try {
    for (const accountID of account_ids) {
      const url = `https://fbtool.pro/api/get-statistics?key=${encodeURIComponent(api_key)}&account=${encodeURIComponent(accountID)}&mode=adsets&status=all&dates=${encodeURIComponent(datesParam)}&byDay=1`;
      const response = await fetch(url);
      const json = await response.json();
      if (json.error) continue;

      const data = json.data || [];
      db.transaction(() => {
        for (const block of data) {
          const adsets = block.adsets?.data || [];
          for (const item of adsets) {
            const name = item.name || '';
            if (!name) continue;
            const spend = item.insights?.data?.[0]?.spend ?? item.insights?.spend ?? 0;
            const amount = parseFloat(spend) || 0;
            if (amount <= 0) continue;
            const adset = resolveAdset(name);
            if (adset.is_undefined) undefined_adsets.add(name);
            insert.run(adset.id, name, date_from, amount, null);
            imported++;
          }
        }
      })();
    }
    logActivity(req.user.id, req.user.username, 'import_fbtool_spend', 'imported ' + imported);
    res.json({ ok: true, imported, undefined_adsets: [...undefined_adsets] });
  } catch (e) {
    res.status(500).json({ detail: 'FBTool API ошибка: ' + e.message });
  }
});

// ─── EXPENSES (P&L) ──────────────────────────────────────────────────────────

app.get('/api/expenses', adminOnly, (req, res) => {
  const { month } = req.query;
  let q = `SELECT e.*, u.username AS created_by_name FROM team_expenses e LEFT JOIN users u ON u.id = e.created_by WHERE 1=1`;
  const params = [];
  const [s, e] = monthRange(month);
  if (s) { q += ' AND e.date BETWEEN ? AND ?'; params.push(s, e); }
  q += ' ORDER BY e.date ASC, e.id ASC';
  const rows = db.prepare(q).all(...params);
  const total_income = rows.reduce((acc, r) => acc + (r.category === 'income' ? r.amount : 0), 0);
  const total_expense = rows.reduce((acc, r) => acc + (r.category === 'expense' ? r.amount : 0), 0);
  res.json({ rows, total_income: +total_income.toFixed(2), total_expense: +total_expense.toFixed(2), net: +(total_income - total_expense).toFixed(2) });
});

app.post('/api/expenses', adminOnly, (req, res) => {
  const { date, category, description, amount, item_id, notes } = req.body;
  if (!date || !category || !amount) return err(res, 400, 'Заполните все поля');
  if (!['income', 'expense'].includes(category)) return err(res, 400, 'Категория: income или expense');
  db.prepare('INSERT INTO team_expenses (date, category, description, amount, item_id, created_by, notes) VALUES (?, ?, ?, ?, ?, ?, ?)').run(date, category, description || null, amount, item_id || null, req.user.id, notes || null);
  logActivity(req.user.id, req.user.username, 'expense_create', description + ' $' + amount);
  res.json({ ok: true });
});

app.put('/api/expenses/:id', adminOnly, (req, res) => {
  const { date, category, description, amount, item_id, notes } = req.body;
  db.prepare('UPDATE team_expenses SET date = ?, category = ?, description = ?, amount = ?, item_id = ?, notes = ? WHERE id = ?').run(date, category, description || null, amount, item_id || null, notes || null, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/expenses/:id', adminOnly, (req, res) => {
  db.prepare('DELETE FROM team_expenses WHERE id = ?').run(req.params.id);
  logActivity(req.user.id, req.user.username, 'expense_delete', req.params.id);
  res.json({ ok: true });
});

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

app.get('/api/dashboard/summary', requireAuth('admin','buyer'), (req, res) => {
  const [s, e] = dateRange(req.query);
  const sp = s ? [s, e] : [];
  const df_s = s ? 'AND date BETWEEN ? AND ?' : '';
  let total_spend, total_deposits;
  if (req.user.role === 'buyer') {
    // Buyer sees only their own data
    const bf = 'AND adset_id IN (SELECT DISTINCT adset_id FROM manual_deposits WHERE created_by = ?)';
    const bfDep = 'AND created_by = ?';
    total_spend = db.prepare(`SELECT COALESCE(SUM(amount),0) AS v FROM spend_records WHERE 1=1 ${bf} ${df_s}`).get(req.user.id, ...sp).v;
    total_deposits = db.prepare(`SELECT COALESCE(SUM(amount),0) AS v FROM manual_deposits WHERE 1=1 ${bfDep} ${df_s}`).get(req.user.id, ...sp).v;
  } else {
    total_spend = db.prepare(`SELECT COALESCE(SUM(amount),0) AS v FROM spend_records WHERE 1=1 ${df_s}`).get(...sp).v;
    total_deposits = db.prepare(`SELECT COALESCE(SUM(amount),0) AS v FROM manual_deposits WHERE 1=1 ${df_s}`).get(...sp).v;
  }
  res.json({
    total_spend: +total_spend.toFixed(2),
    total_deposits: +total_deposits.toFixed(2),
    profit: +(total_deposits - total_spend).toFixed(2),
    roi: total_spend > 0 ? +((total_deposits - total_spend) / total_spend * 100).toFixed(1) : 0,
  });
});

app.get('/api/dashboard/buyers', requireAuth('admin','buyer'), (req, res) => {
  const [s, e] = dateRange(req.query);
  const sp = s ? [s, e] : [];
  const df_s = s ? 'AND sr.date BETWEEN ? AND ?' : '';
  const df_c = s ? 'AND ch.date BETWEEN ? AND ?' : '';
  const df_d = s ? 'AND md.date BETWEEN ? AND ?' : '';

  const buyerFilter = req.user.role === 'buyer' ? 'AND u.id = ?' : '';
  const buyerParams = req.user.role === 'buyer' ? [req.user.id] : [];

  const rows = db.prepare(`
    SELECT u.id, u.username AS buyer, u.agent_id,
      ag.name AS agency_name, ag.abbreviation,
      (SELECT COUNT(DISTINCT a.id) FROM adsets a WHERE a.buyer_id=u.id) AS adset_count,
      (SELECT COALESCE(SUM(sr.amount),0) FROM spend_records sr JOIN adsets a ON a.id=sr.adset_id WHERE a.buyer_id=u.id ${df_s}) AS spend,
      (SELECT COALESCE(SUM(ch.deposits),0) FROM chatterfy_records ch JOIN adsets a ON a.id=ch.adset_id WHERE a.buyer_id=u.id ${df_c}) AS deposits_count,
      (SELECT COALESCE(SUM(ch.redeposits),0) FROM chatterfy_records ch JOIN adsets a ON a.id=ch.adset_id WHERE a.buyer_id=u.id ${df_c}) AS redeposits_count,
      (SELECT COALESCE(SUM(md.amount),0) FROM manual_deposits md JOIN adsets a ON a.id=md.adset_id WHERE a.buyer_id=u.id ${df_d}) AS deposit_amount
    FROM users u LEFT JOIN agents ag ON ag.id = u.agent_id
    WHERE u.role = 'buyer' ${buyerFilter}
    ORDER BY u.username
  `).all(...sp, ...sp, ...sp, ...sp, ...buyerParams);

  res.json(rows.map(r => {
    const spend = r.spend || 0, dep = r.deposit_amount || 0;
    return { ...r, spend: +spend.toFixed(2), deposit_amount: +dep.toFixed(2), profit: +(dep - spend).toFixed(2), roi: spend > 0 ? +((dep - spend) / spend * 100).toFixed(1) : 0 };
  }));
});

app.get('/api/dashboard/operators', adminOnly, (req, res) => {
  const [s, e] = dateRange(req.query);
  const sp = s ? [s, e] : [];
  const df = s ? 'AND md.date BETWEEN ? AND ?' : '';
  const rows = db.prepare(`
    SELECT u.id, u.username,
      COUNT(CASE WHEN md.type='dep' THEN 1 END) AS count_dep,
      COUNT(CASE WHEN md.type='redep' THEN 1 END) AS count_redep,
      COALESCE(SUM(md.amount),0) AS total_amount
    FROM users u
    LEFT JOIN manual_deposits md ON md.created_by = u.id ${df}
    WHERE u.role = 'operator'
    GROUP BY u.id ORDER BY total_amount DESC
  `).all(...sp);
  res.json(rows.map(r => ({ ...r, total_amount: +r.total_amount.toFixed(2) })));
});

// ─── P&L ─────────────────────────────────────────────────────────────────────

app.get('/api/pl/daily', adminOnly, (req, res) => {
  const [s, e] = dateRange(req.query);
  if (!s) return err(res, 400, 'Укажите период (from/to или month)');
  const startDate = new Date(s);
  const endDate = new Date(e);
  const daysInRange = Math.ceil((endDate - startDate) / 86400000) + 1;

  // P&L uses only team_expenses for BOTH income and expense — no connection to manual_deposits
  const incomeRows = db.prepare(`
    SELECT te.id, te.date, te.category, te.description, te.amount, te.item_id, te.notes,
      ei.name AS item_name, ec.name AS category_name
    FROM team_expenses te
    LEFT JOIN expense_items ei ON ei.id = te.item_id
    LEFT JOIN expense_categories ec ON ec.id = ei.category_id
    WHERE te.category = 'income' AND te.date BETWEEN ? AND ? ORDER BY te.date, te.id
  `).all(s, e);

  const expenseRows = db.prepare(`
    SELECT te.id, te.date, te.category, te.description, te.amount, te.item_id, te.notes,
      ei.name AS item_name, ec.name AS category_name
    FROM team_expenses te
    LEFT JOIN expense_items ei ON ei.id = te.item_id
    LEFT JOIN expense_categories ec ON ec.id = ei.category_id
    WHERE te.category = 'expense' AND te.date BETWEEN ? AND ? ORDER BY te.date, te.id
  `).all(s, e);

  const days = {};
  for (let i = 0; i < daysInRange; i++) {
    const dt = new Date(startDate);
    dt.setDate(dt.getDate() + i);
    const ds = dt.toISOString().slice(0, 10);
    days[ds] = { date: ds, day: dt.getDate(), income: 0, income_breakdown: [], expenses: 0, expense_items: [] };
  }
  for (const r of incomeRows) {
    if (!days[r.date]) continue;
    days[r.date].income += r.amount;
    days[r.date].income_breakdown.push({ name: r.item_name || r.description || r.category_name || 'Доход', amount: +r.amount.toFixed(2) });
  }
  for (const r of expenseRows) {
    if (!days[r.date]) continue;
    days[r.date].expenses += r.amount;
    days[r.date].expense_items.push({ id: r.id, category: r.category, description: r.description, amount: +r.amount.toFixed(2), item_name: r.item_name, category_name: r.category_name, notes: r.notes });
  }

  const result = Object.values(days).map(d => ({ ...d, income: +d.income.toFixed(2), expenses: +d.expenses.toFixed(2), net: +(d.income - d.expenses).toFixed(2) }));
  const total_income = result.reduce((acc, d) => acc + d.income, 0);
  const total_expenses = result.reduce((acc, d) => acc + d.expenses, 0);
  // Group both income and expense by category
  const catBreakdown = {};
  for (const r of [...incomeRows, ...expenseRows]) {
    const key = r.category_name || r.description || r.category;
    if (!catBreakdown[key]) catBreakdown[key] = { name: key, type: r.category, total: 0 };
    catBreakdown[key].total += r.amount;
  }
  const by_category = Object.values(catBreakdown).map(c => ({ ...c, total: +c.total.toFixed(2) }));

  res.json({ days: result, summary: { total_income: +total_income.toFixed(2), total_expenses: +total_expenses.toFixed(2), net: +(total_income - total_expenses).toFixed(2) }, by_category });
});

app.get('/api/pl/analytics', adminOnly, (req, res) => {
  // Return monthly category totals for last 6 months
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }

  const result = months.map(m => {
    const [s, e] = monthRange(m);
    const income = db.prepare("SELECT COALESCE(SUM(amount),0) AS v FROM team_expenses WHERE category = 'income' AND date BETWEEN ? AND ?").get(s, e).v;
    const expenses = db.prepare("SELECT COALESCE(SUM(amount),0) AS v FROM team_expenses WHERE category = 'expense' AND date BETWEEN ? AND ?").get(s, e).v;

    const catRows = db.prepare(`
      SELECT ec.name, COALESCE(SUM(te.amount),0) AS total
      FROM team_expenses te
      LEFT JOIN expense_items ei ON ei.id = te.item_id
      LEFT JOIN expense_categories ec ON ec.id = ei.category_id
      WHERE te.date BETWEEN ? AND ?
      GROUP BY ec.name
    `).all(s, e);

    return { month: m, income: +income.toFixed(2), expenses: +expenses.toFixed(2), net: +(income - expenses).toFixed(2), categories: catRows };
  });

  res.json(result);
});

// ─── EXPENSE CATEGORIES ───────────────────────────────────────────────────────

app.get('/api/expense-categories', anyAuth, (req, res) => {
  const cats = db.prepare('SELECT * FROM expense_categories ORDER BY type, name').all();
  const items = db.prepare('SELECT * FROM expense_items ORDER BY category_id, name').all();
  res.json(cats.map(c => ({ ...c, items: items.filter(i => i.category_id === c.id) })));
});

app.post('/api/expense-categories', adminOnly, (req, res) => {
  const { type, name } = req.body;
  if (!type || !name) return err(res, 400, 'Укажите тип и название');
  try {
    const r = db.prepare('INSERT INTO expense_categories (type, name) VALUES (?, ?)').run(type, name);
    res.json({ id: r.lastInsertRowid, type, name, items: [] });
  } catch (e) { err(res, 500, e.message); }
});

app.put('/api/expense-categories/:id', adminOnly, (req, res) => {
  const { type, name } = req.body;
  db.prepare('UPDATE expense_categories SET type = ?, name = ? WHERE id = ?').run(type, name, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/expense-categories/:id', adminOnly, (req, res) => {
  db.prepare('DELETE FROM expense_categories WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/expense-items', adminOnly, (req, res) => {
  const { category_id, name } = req.body;
  if (!category_id || !name) return err(res, 400, 'Укажите категорию и название');
  const r = db.prepare('INSERT INTO expense_items (category_id, name) VALUES (?, ?)').run(category_id, name);
  res.json({ id: r.lastInsertRowid, category_id, name });
});

app.put('/api/expense-items/:id', adminOnly, (req, res) => {
  const { name } = req.body;
  db.prepare('UPDATE expense_items SET name = ? WHERE id = ?').run(name, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/expense-items/:id', adminOnly, (req, res) => {
  db.prepare('DELETE FROM expense_items WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── ADSET PATTERNS ───────────────────────────────────────────────────────────

// Re-parse all adsets with current patterns
app.post('/api/adset-patterns/re-parse', adminBuyer, (req, res) => {
  const geos = db.prepare('SELECT * FROM geos').all();
  const agents = db.prepare('SELECT * FROM agents').all();
  const adsets = db.prepare('SELECT * FROM adsets').all();
  let updated = 0;
  const update = db.prepare('UPDATE adsets SET geo_id = ?, agent_id = ?, creative_id = ?, is_undefined = ? WHERE id = ?');
  db.transaction(() => {
    for (const a of adsets) {
      const { geoMatch, agentMatch, creativeName } = parseAdsetName(a.name, geos, agents);
      const geo_id = geoMatch ? geoMatch.id : null;
      const agent_id = agentMatch ? agentMatch.id : null;
      let creative_id = null;
      if (creativeName) {
        let cr = db.prepare('SELECT * FROM creatives WHERE name = ?').get(creativeName);
        if (!cr) {
          try { db.prepare('INSERT INTO creatives (name, geo_id) VALUES (?, ?)').run(creativeName, geo_id); cr = db.prepare('SELECT * FROM creatives WHERE name = ?').get(creativeName); } catch {}
        }
        if (cr) creative_id = cr.id;
      }
      const is_undefined = (geo_id && agent_id) ? 0 : 1;
      if (a.geo_id !== geo_id || a.agent_id !== agent_id || a.creative_id !== creative_id) {
        update.run(geo_id, agent_id, creative_id, is_undefined, a.id);
        updated++;
      }
    }
  })();
  res.json({ ok: true, updated, total: adsets.length });
});

// Pattern test must be before :id routes to avoid "test" being treated as an id
app.get('/api/adset-patterns/test', anyAuth, (req, res) => {
  const { name } = req.query;
  if (!name) return err(res, 400, 'Укажите имя адсета');
  const geos = db.prepare('SELECT * FROM geos').all();
  const agents = db.prepare('SELECT * FROM agents').all();
  const { geoMatch, agentMatch } = parseAdsetName(name, geos, agents);
  res.json({
    geo: geoMatch ? { id: geoMatch.id, name: geoMatch.name, abbreviation: geoMatch.abbreviation } : null,
    agent: agentMatch ? { id: agentMatch.id, name: agentMatch.name, abbreviation: agentMatch.abbreviation } : null,
  });
});

app.get('/api/adset-patterns', anyAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT p.*,
      CASE WHEN p.entity_type='geo' THEN g.name ELSE ag.name END AS entity_name
    FROM adset_patterns p
    LEFT JOIN geos g ON p.entity_type='geo' AND g.id=p.entity_id
    LEFT JOIN agents ag ON p.entity_type='agent' AND ag.id=p.entity_id
    ORDER BY p.entity_type, p.priority DESC, p.id
  `).all();
  res.json(rows);
});

app.post('/api/adset-patterns', adminBuyer, (req, res) => {
  const { entity_type, pattern, entity_id, priority } = req.body;
  if (!entity_type || !pattern || !entity_id) return err(res, 400, 'Укажите тип, паттерн и сущность');
  try { new RegExp(pattern, 'i'); } catch { return err(res, 400, 'Неверный regex паттерн'); }
  const r = db.prepare('INSERT INTO adset_patterns (entity_type, pattern, entity_id, priority) VALUES (?, ?, ?, ?)').run(entity_type, pattern, entity_id, priority || 0);
  res.json({ id: r.lastInsertRowid, entity_type, pattern, entity_id: +entity_id, priority: priority || 0 });
});

app.put('/api/adset-patterns/:id', adminBuyer, (req, res) => {
  const { entity_type, pattern, entity_id, priority } = req.body;
  try { new RegExp(pattern, 'i'); } catch { return err(res, 400, 'Неверный regex паттерн'); }
  db.prepare('UPDATE adset_patterns SET entity_type=?, pattern=?, entity_id=?, priority=? WHERE id=?').run(entity_type, pattern, entity_id, priority || 0, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/adset-patterns/:id', adminBuyer, (req, res) => {
  db.prepare('DELETE FROM adset_patterns WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── OFFERS ─────────────────────────────────────────────────────────────────
app.get('/api/offers', anyAuth, (req, res) => {
  res.json(db.prepare('SELECT o.*, g.name AS geo_name FROM offers o LEFT JOIN geos g ON g.id = o.geo_id ORDER BY name').all());
});
app.post('/api/offers', adminBuyer, (req, res) => {
  const { name, abbreviation, geo_id } = req.body;
  if (!name || !abbreviation) return err(res, 400, 'Заполните все поля');
  try {
    const r = db.prepare('INSERT INTO offers (name, abbreviation, geo_id) VALUES (?, ?, ?)').run(name, abbreviation.toUpperCase(), geo_id || null);
    res.json({ id: r.lastInsertRowid });
  } catch (e) { err(res, 400, e.message.includes('UNIQUE') ? 'Оффер уже существует' : e.message); }
});
app.delete('/api/offers/:id', adminBuyer, (req, res) => {
  db.prepare('DELETE FROM offers WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── BUDGETS ────────────────────────────────────────────────────────────────
app.get('/api/budgets', adminOnly, (req, res) => {
  res.json(db.prepare('SELECT * FROM budgets ORDER BY entity_type, entity_id').all());
});
app.post('/api/budgets', adminOnly, (req, res) => {
  const { type, entity_type, entity_id, amount } = req.body;
  if (!type || !entity_type || !entity_id || !amount) return err(res, 400, 'Заполните все поля');
  const r = db.prepare('INSERT INTO budgets (type, entity_type, entity_id, amount) VALUES (?, ?, ?, ?)').run(type, entity_type, entity_id, amount);
  res.json({ id: r.lastInsertRowid });
});
app.delete('/api/budgets/:id', adminOnly, (req, res) => {
  db.prepare('DELETE FROM budgets WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── ACTIVITY LOG ────────────────────────────────────────────────────────────

app.get('/api/activity-log', adminOnly, (req, res) => {
  const rows = db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 200').all();
  res.json(rows);
});

// Bulk delete import records
app.delete('/api/import/spend/bulk', adminBuyer, (req, res) => {
  const { from, to } = req.body;
  if (!from || !to) return err(res, 400, 'Укажите период');
  const result = db.prepare('DELETE FROM spend_records WHERE date BETWEEN ? AND ?').run(from, to);
  logActivity(req.user.id, req.user.username, 'spend_bulk_delete', `${from} - ${to}, deleted: ${result.changes}`);
  res.json({ ok: true, deleted: result.changes });
});

app.delete('/api/import/chatterfy/bulk', adminBuyer, (req, res) => {
  const { from, to } = req.body;
  if (!from || !to) return err(res, 400, 'Укажите период');
  const result = db.prepare('DELETE FROM chatterfy_records WHERE date BETWEEN ? AND ?').run(from, to);
  logActivity(req.user.id, req.user.username, 'chatterfy_bulk_delete', `${from} - ${to}, deleted: ${result.changes}`);
  res.json({ ok: true, deleted: result.changes });
});

// ─── START ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  McQueen Tracker: http://localhost:${PORT}`);
  console.log('  Логин по умолчанию: admin / admin123\n');
});
