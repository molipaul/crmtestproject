'use strict';

const API = '';

// ─── UTILS ────────────────────────────────────────────────────────────────────

function getToken() {
  const s = localStorage.getItem('crm_session');
  return s ? JSON.parse(s).token : null;
}
function getUser() {
  const s = localStorage.getItem('crm_session');
  return s ? JSON.parse(s).user : null;
}

async function apiFetch(url, opts = {}) {
  const token = getToken();
  const res = await fetch(API + url, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    ...opts,
  });
  if (res.status === 401) {
    toast('Сессия истекла, войдите заново', 'warning');
    setTimeout(() => { localStorage.removeItem('crm_session'); showLogin(); }, 1500);
    throw new Error('Сессия истекла');
  }
  if (!res.ok) {
    const e = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(e.detail || 'Ошибка запроса');
  }
  return res.json();
}

function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  const msgEl = document.getElementById('toastMsg');
  el.className = `toast align-items-center border-0 text-bg-${type}`;
  msgEl.textContent = msg;
  bootstrap.Toast.getOrCreateInstance(el, { delay: 3500 }).show();
}

// ─── UI HELPERS ──────────────────────────────────────────────────────────────

function showSkeleton(containerId, count = 3) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = Array(count).fill('<div class="skeleton skeleton-card"></div>').join('');
}

function emptyState(icon, text) {
  return `<div class="empty-state"><div class="empty-state-icon"><i class="bi bi-${icon}"></i></div><div class="empty-state-text">${text}</div></div>`;
}

function fmt(n, d = 2) {
  if (n == null) return '—';
  return Number(n).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtInt(n) { return n ? Number(n).toLocaleString('ru-RU') : '0'; }
function roiClass(v) { return v > 0 ? 'roi-positive' : v < 0 ? 'roi-negative' : 'roi-zero'; }
function pctClass(v) { return v >= 50 ? 'text-success' : v >= 20 ? 'text-warning' : 'text-danger'; }
function depTypeBadge(t) {
  return t === 'dep' ? '<span class="badge badge-dep">FD</span>' : '<span class="badge badge-redep">RD</span>';
}
function roleBadge(role) {
  const map = { admin: 'bg-danger', buyer: 'bg-primary', operator: 'bg-success' };
  const label = { admin: 'Admin', buyer: 'Buyer', operator: 'Operator' };
  return `<span class="badge ${map[role] || 'bg-secondary'}">${label[role] || role}</span>`;
}
function btnIcon(icon, title, onclick, danger = false) {
  return `<button class="btn-icon${danger ? ' danger' : ''}" title="${title}" onclick="${onclick}"><i class="bi bi-${icon}"></i></button>`;
}
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function currentMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }

// ─── AUTH ─────────────────────────────────────────────────────────────────────

function showLogin() {
  document.getElementById('loginPage').classList.remove('d-none');
  document.getElementById('mainApp').classList.add('d-none');
}
function showApp() {
  document.getElementById('loginPage').classList.add('d-none');
  document.getElementById('mainApp').classList.remove('d-none');
}

// Enter key on login form
['loginUsername','loginPassword'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') App.Auth.login();
  });
});

App = {};

App.Auth = {
  async init() {
    const token = getToken();
    if (!token) return showLogin();
    try {
      const user = await apiFetch('/api/auth/me');
      const stored = JSON.parse(localStorage.getItem('crm_session'));
      stored.user = user;
      localStorage.setItem('crm_session', JSON.stringify(stored));
      this.onLogin(user);
    } catch {
      localStorage.removeItem('crm_session');
      showLogin();
    }
  },

  async login() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errEl = document.getElementById('loginError');
    errEl.classList.add('d-none');
    if (!username || !password) {
      errEl.textContent = 'Введите логин и пароль';
      errEl.classList.remove('d-none');
      return;
    }
    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      localStorage.setItem('crm_session', JSON.stringify(data));
      document.getElementById('loginPassword').value = '';
      this.onLogin(data.user);
    } catch (e) {
      errEl.textContent = e.message;
      errEl.classList.remove('d-none');
    }
  },

  async logout() {
    try { await apiFetch('/api/auth/logout', { method: 'POST' }); } catch {}
    localStorage.removeItem('crm_session');
    showLogin();
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
  },

  onLogin(user) {
    document.getElementById('userNameDisplay').textContent = user.username;
    document.getElementById('userRoleBadge').className = `badge ${
      user.role === 'admin' ? 'bg-danger' : user.role === 'buyer' ? 'bg-primary' : 'bg-success'
    }`;
    document.getElementById('userRoleBadge').textContent =
      { admin: 'Admin', buyer: 'Buyer', operator: 'Operator' }[user.role] || user.role;

    setupRoleUI(user.role);
    showApp();
    initApp(user);
  },
};

// ─── ROLE UI ──────────────────────────────────────────────────────────────────

function setupRoleUI(role) {
  // Nav buttons + section labels visibility
  document.querySelectorAll('.nav-btn[data-section]').forEach(btn => {
    const cls = btn.classList;
    const hasRoleClass = cls.contains('role-admin') || cls.contains('role-adminbuyer') || cls.contains('role-adminoperator');
    let visible = false;
    if (!hasRoleClass) visible = true; // no role restriction = visible to all
    else if (role === 'admin') visible = true;
    else if (role === 'buyer' && cls.contains('role-adminbuyer')) visible = true;
    else if (role === 'operator' && cls.contains('role-adminoperator')) visible = true;
    btn.classList.toggle('d-none', !visible);
  });
  // Hide empty sidebar section labels
  document.querySelectorAll('.sidebar-section-label').forEach(label => {
    const nav = label.nextElementSibling;
    if (nav?.tagName === 'NAV') {
      const hasVisible = [...nav.querySelectorAll('.nav-btn')].some(b => !b.classList.contains('d-none'));
      label.classList.toggle('d-none', !hasVisible);
    }
  });

  // Show first visible section
  const firstVisible = document.querySelector('.nav-btn[data-section]:not(.d-none)');
  if (firstVisible) {
    showSection(firstVisible.dataset.section);
    if (firstVisible.dataset.dictTarget) switchDict(firstVisible.dataset.dictTarget);
  }
}

// ─── STATE ────────────────────────────────────────────────────────────────────

let state = { geos: [], agents: [], creatives: [] };

async function loadState() {
  [state.geos, state.agents] = await Promise.all([
    apiFetch('/api/geos'),
    apiFetch('/api/agents'),
  ]);
  refreshAllSelects();
  checkUndefined();
}

function refreshAllSelects() {
  const geoOpts = state.geos.map(g => `<option value="${g.id}">${g.name} (${g.abbreviation})</option>`).join('');
  const geoOptsAll = `<option value="">Все гео</option>` + geoOpts;
  const geoOptsSel = `<option value="">— выберите гео —</option>` + geoOpts;

  // Various geo selects
  setSelectOpts('creativeGeoFilter', `<option value="">Все гео</option>` + state.geos.map(g => `<option value="${g.id}">${g.name}</option>`).join(''));
  setSelectOpts('statsGeoFilter', geoOptsAll);
  setSelectOpts('depHistGeo', geoOptsAll);
  setSelectOpts('opHistGeo', geoOptsAll);
  setSelectOpts('opGeoFilter', `<option value="">— гео —</option>` + geoOpts);
  setSelectOpts('creativeGeoId', `<option value="">Без гео</option>` + geoOpts);
  setSelectOpts('adsetGeoId', `<option value="">Автоопределение</option>` + geoOpts);
  setSelectOpts('adsetAgentId', `<option value="">Автоопределение</option>` +
    state.agents.map(a => `<option value="${a.id}">${a.name} (${a.abbreviation})</option>`).join(''));
}

function setSelectOpts(id, html) {
  const el = document.getElementById(id);
  if (!el) return;
  const val = el.value;
  el.innerHTML = html;
  el.value = val;
}

async function checkUndefined() {
  try {
    const data = await apiFetch('/api/adsets?undefined_only=true');
    const badge = document.getElementById('undefinedBadge');
    badge.classList.toggle('d-none', data.length === 0);
    document.getElementById('undefinedCount').textContent = data.length;
  } catch {}
}

// ─── NAVIGATION ──────────────────────────────────────────────────────────────

const allSections = ['dictionaries', 'statistics', 'deposits', 'imports', 'dashboard', 'users', 'pl', 'activitylog', 'pending'];

function showSection(name) {
  allSections.forEach(s => {
    const el = document.getElementById(`section-${s}`);
    if (!el) return;
    if (s === name) {
      el.classList.remove('d-none');
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('section-visible')));
    } else {
      el.classList.remove('section-visible');
      el.classList.add('d-none');
    }
  });
  // Remove all active states and group highlights
  document.querySelectorAll('.nav-btn[data-section]').forEach(btn => {
    btn.classList.remove('active', 'nav-group-active');
  });
  // Find the clicked button or first button of this section
  const clickedBtns = document.querySelectorAll(`.nav-btn[data-section="${name}"]`);
  if (clickedBtns.length === 1) {
    clickedBtns[0].classList.add('active');
  } else if (clickedBtns.length > 1) {
    // Multiple buttons for same section (dictionaries, imports) - highlight group
    clickedBtns.forEach(b => b.classList.add('nav-group-active'));
    // Try to mark the specific one clicked
    if (window._lastClickedNavBtn) {
      window._lastClickedNavBtn.classList.add('active');
    } else {
      clickedBtns[0].classList.add('active');
    }
  }
  if (name === 'statistics') App.Stats.load();
  if (name === 'deposits') App.Deposits.initSection();
  if (name === 'imports') App.Import.init();
  if (name === 'dashboard') App.Dashboard.init();
  if (name === 'users') App.Users.load();
  if (name === 'pl') App.PL.init();
  if (name === 'activitylog') App.ActivityLog.load();
  if (name === 'pending') App.Deposits.loadPending();
  // Update breadcrumbs
  const sectionNames = { dashboard:'Дашборд', statistics:'Статистика', deposits:'FD/RD', imports:'Импорт', dictionaries:'Словари', users:'Пользователи', pl:'P&L Учёт', activitylog:'Журнал действий', pending:'Pending' };
  document.getElementById('bcSection').textContent = sectionNames[name] || name;
  document.getElementById('bcSep').classList.add('d-none');
  document.getElementById('bcSub').classList.add('d-none');
}

function _updateBreadcrumbSub(text) {
  if (text) {
    document.getElementById('bcSep').classList.remove('d-none');
    document.getElementById('bcSub').classList.remove('d-none');
    document.getElementById('bcSub').textContent = text;
  }
}

document.querySelectorAll('.nav-btn[data-section]').forEach(btn => {
  btn.addEventListener('click', () => {
    window._lastClickedNavBtn = btn;
    showSection(btn.dataset.section);
    // Direct sub-section navigation from sidebar
    if (btn.dataset.dictTarget) { switchDict(btn.dataset.dictTarget); _updateBreadcrumbSub(btn.querySelector('span')?.textContent); }
    if (btn.dataset.importTarget) { switchImport(btn.dataset.importTarget); _updateBreadcrumbSub(btn.querySelector('span')?.textContent); }
  });
});

document.getElementById('undefinedBadge').addEventListener('click', () => {
  showSection('dictionaries');
  switchDict('undefined');
});

// Dict sub-tabs
function switchDict(name) {
  ['geos','agents','creatives','undefined'].forEach(d => {
    document.getElementById(`dict-${d}`)?.classList.toggle('d-none', d !== name);
  });
  document.querySelectorAll('#dictTab .nav-link').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.dict === name);
  });
  if (name === 'geos') App.Geos.load();
  if (name === 'agents') App.Agents.load();
  if (name === 'creatives') App.Creatives.load();
  if (name === 'undefined') App.Undefined.load();
}
document.querySelectorAll('#dictTab .nav-link').forEach(btn => {
  btn.addEventListener('click', () => switchDict(btn.dataset.dict));
});

// Stats sub-tabs
let currentStatsTab = 'creatives';
document.querySelectorAll('#statsTab .nav-link').forEach(btn => {
  btn.addEventListener('click', () => {
    currentStatsTab = btn.dataset.stats;
    document.querySelectorAll('#statsTab .nav-link').forEach(b => b.classList.toggle('active', b === btn));
    _updateBreadcrumbSub(btn.textContent.trim());
    App.Stats.load();
  });
});

// Import sub-tabs
function switchImport(name) {
  ['spend','chatterfy','cabinets'].forEach(d => {
    document.getElementById(`import-${d}`)?.classList.toggle('d-none', d !== name);
  });
  document.querySelectorAll('#importTab .nav-link').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.import === name);
  });
  if (name === 'cabinets') App.Cabinets.load();
  if (name === 'spend') App.Import.loadSpendHistory();
  if (name === 'chatterfy') App.Import.loadChatterfyHistory();
}
document.querySelectorAll('#importTab .nav-link').forEach(btn => {
  btn.addEventListener('click', () => switchImport(btn.dataset.import));
});

// ─── INIT ─────────────────────────────────────────────────────────────────────

async function initApp(user) {
  await loadState();

  const role = user.role;
  if (role === 'admin' || role === 'buyer') {
    App.Geos.load();
    state.creatives = await apiFetch('/api/creatives');
  }

  // Init notifications
  App.Notifications.init();

  // Close notification dropdown on outside click
  document.addEventListener('click', e => {
    const dd = document.getElementById('notifDropdown');
    if (dd && !dd.classList.contains('d-none') && !e.target.closest('#sidebarNotifs')) dd.classList.add('d-none');
  });

  // Init flatpickr on all date inputs for modern look
  if (typeof flatpickr !== 'undefined') {
    flatpickr.localize(flatpickr.l10ns.ru);
    document.querySelectorAll('input[type="date"]').forEach(el => {
      flatpickr(el, { dateFormat: 'Y-m-d', allowInput: true, disableMobile: true });
    });
  }

  // Stats advanced filter listeners
  let _statsFilterTimer = null;
  ['statsAdsetFilter','statsMinSpend','statsMaxSpend','statsMinROI','statsMaxROI'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => {
      clearTimeout(_statsFilterTimer);
      _statsFilterTimer = setTimeout(() => { if (App.Stats.data.length) App.Stats.render(App.Stats.data); }, 300);
    });
  });
  const agentFilterEl = document.getElementById('statsAgentFilter');
  if (agentFilterEl) agentFilterEl.addEventListener('change', () => { if (App.Stats.data.length) App.Stats.render(App.Stats.data); });
}

// ─── GEOS ─────────────────────────────────────────────────────────────────────

App.Geos = {
  data: [],
  async load() {
    this.data = await apiFetch('/api/geos');
    state.geos = this.data;
    refreshAllSelects();
    this.render(this.data);
  },
  render(rows) {
    const tb = document.getElementById('geoTbody');
    tb.innerHTML = rows.map(g => `<tr>
      <td><input type="checkbox" class="form-check-input geo-check" value="${g.id}" onchange="App.Geos.onCheck()"></td>
      <td>${g.name}</td>
      <td><span class="badge bg-secondary">${g.abbreviation}</span></td>
      <td class="text-end">
        ${btnIcon('pencil','Редактировать',`App.Geos.openEdit(${g.id})`)}
        ${btnIcon('trash','Удалить',`App.Geos.del(${g.id})`,true)}
      </td></tr>`).join('');
    this.makeSortable();
  },
  toggleAll(checked) { document.querySelectorAll('.geo-check').forEach(cb => cb.checked = checked); this.onCheck(); },
  onCheck() { App.BulkDelete.update('geos', 'geo-check'); },
  makeSortable() {
    document.querySelectorAll('#geoTable th[data-key]').forEach(th => {
      th.onclick = () => {
        const dir = th.classList.contains('sort-asc') ? -1 : 1;
        document.querySelectorAll('#geoTable th').forEach(h => h.classList.remove('sort-asc','sort-desc'));
        th.classList.add(dir===1?'sort-asc':'sort-desc');
        const key = th.dataset.key;
        this.render([...this.data].sort((a,b) => String(a[key]).localeCompare(String(b[key]))*dir));
      };
    });
  },
  openAdd() { this._open(null); },
  openEdit(id) { this._open(this.data.find(x=>x.id===id)); },
  _open(g) {
    document.getElementById('geoId').value = g?.id || '';
    document.getElementById('geoName').value = g?.name || '';
    document.getElementById('geoAbbr').value = g?.abbreviation || '';
    document.getElementById('geoModalTitle').textContent = g ? 'Редактировать гео' : 'Добавить гео';
    new bootstrap.Modal('#geoModal').show();
  },
  async save() {
    const id = document.getElementById('geoId').value;
    const body = { name: document.getElementById('geoName').value.trim(), abbreviation: document.getElementById('geoAbbr').value.trim() };
    if (!body.name || !body.abbreviation) return toast('Заполните все поля','warning');
    try {
      if (id) await apiFetch(`/api/geos/${id}`,{method:'PUT',body:JSON.stringify(body)});
      else await apiFetch('/api/geos',{method:'POST',body:JSON.stringify(body)});
      bootstrap.Modal.getInstance('#geoModal')?.hide();
      toast('Гео сохранено');
      await this.load();
    } catch(e) { toast(e.message,'danger'); }
  },
  async del(id) {
    if (!confirm('Удалить гео?')) return;
    try { await apiFetch(`/api/geos/${id}`,{method:'DELETE'}); toast('Удалено'); await this.load(); }
    catch(e) { toast(e.message,'danger'); }
  },
};

// ─── AGENTS ──────────────────────────────────────────────────────────────────

App.Agents = {
  data: [],
  async load() {
    this.data = await apiFetch('/api/agents');
    state.agents = this.data;
    refreshAllSelects();
    this.render(this.data);
  },
  render(rows) {
    const tb = document.getElementById('agentTbody');
    tb.innerHTML = rows.map(a => `<tr>
      <td><input type="checkbox" class="form-check-input agent-check" value="${a.id}" onchange="App.Agents.onCheck()"></td>
      <td>${a.name}</td>
      <td><span class="badge bg-secondary">${a.abbreviation}</span></td>
      <td class="text-end stat-number">${fmt(a.current_commission,1)}%</td>
      <td>${a.commissions?.[0]?.effective_from || '—'}</td>
      <td class="text-end">
        ${btnIcon('percent','Изм. %',`App.Agents.openComm(${a.id})`)}
        ${btnIcon('pencil','Редактировать',`App.Agents.openEdit(${a.id})`)}
        ${btnIcon('trash','Удалить',`App.Agents.del(${a.id})`,true)}
      </td></tr>`).join('');
  },
  toggleAll(checked) { document.querySelectorAll('.agent-check').forEach(cb => cb.checked = checked); this.onCheck(); },
  onCheck() { App.BulkDelete.update('agents', 'agent-check'); },
  openAdd() { this._open(null); },
  openEdit(id) { this._open(this.data.find(x=>x.id===id)); },
  _open(a) {
    document.getElementById('agentId').value = a?.id || '';
    document.getElementById('agentName').value = a?.name || '';
    document.getElementById('agentAbbr').value = a?.abbreviation || '';
    document.getElementById('agentComm').value = a?.current_commission ?? '';
    document.getElementById('agentModalTitle').textContent = a ? 'Редактировать агента' : 'Добавить агента';
    new bootstrap.Modal('#agentModal').show();
  },
  async save() {
    const id = document.getElementById('agentId').value;
    const body = { name: document.getElementById('agentName').value.trim(), abbreviation: document.getElementById('agentAbbr').value.trim(), commission_pct: parseFloat(document.getElementById('agentComm').value)||0 };
    if (!body.name||!body.abbreviation) return toast('Заполните все поля','warning');
    try {
      if (id) await apiFetch(`/api/agents/${id}`,{method:'PUT',body:JSON.stringify(body)});
      else await apiFetch('/api/agents',{method:'POST',body:JSON.stringify(body)});
      bootstrap.Modal.getInstance('#agentModal')?.hide();
      toast('Агент сохранён'); await this.load();
    } catch(e) { toast(e.message,'danger'); }
  },
  openComm(id) {
    document.getElementById('commAgentId').value = id;
    document.getElementById('commPct').value = '';
    document.getElementById('commDate').value = todayStr();
    new bootstrap.Modal('#commModal').show();
  },
  async saveCommission() {
    const agent_id = document.getElementById('commAgentId').value;
    const body = { commission_pct: parseFloat(document.getElementById('commPct').value), effective_from: document.getElementById('commDate').value };
    if (!body.commission_pct||!body.effective_from) return toast('Заполните все поля','warning');
    try {
      await apiFetch(`/api/agents/${agent_id}/commissions`,{method:'POST',body:JSON.stringify(body)});
      bootstrap.Modal.getInstance('#commModal')?.hide();
      toast('Комиссия обновлена'); await this.load();
    } catch(e) { toast(e.message,'danger'); }
  },
  async del(id) {
    if (!confirm('Удалить агента?')) return;
    try { await apiFetch(`/api/agents/${id}`,{method:'DELETE'}); toast('Удалено'); await this.load(); }
    catch(e) { toast(e.message,'danger'); }
  },
};

// ─── CREATIVES ───────────────────────────────────────────────────────────────

App.Creatives = {
  data: [],
  async load() {
    const geoId = document.getElementById('creativeGeoFilter').value;
    this.data = await apiFetch(geoId ? `/api/creatives?geo_id=${geoId}` : '/api/creatives');
    state.creatives = this.data;
    this.render(this.data);
  },
  render(list) {
    const c = document.getElementById('creativesContainer');
    if (!list.length) { c.innerHTML = '<p class="text-secondary small">Нет креативов.</p>'; return; }
    c.innerHTML = list.map(cr => `
      <div class="creative-block">
        <div class="creative-header">
          <span class="fw-semibold">${cr.name}</span>
          ${cr.geo_name ? `<span class="badge bg-secondary ms-1">${cr.geo_name}</span>` : ''}
          <div class="ms-auto d-flex gap-1">
            ${btnIcon('plus-lg','Добавить адсет',`App.Adsets.openAddToCreative(${cr.id})`)}
            ${btnIcon('pencil','Редактировать',`App.Creatives.openEdit(${cr.id})`)}
            ${btnIcon('trash','Удалить',`App.Creatives.del(${cr.id})`,true)}
          </div>
        </div>
        <div class="creative-adsets">
          ${cr.adsets?.length ? cr.adsets.map(a => `
            <span class="adset-tag ${a.is_undefined?'undefined-adset':''}">
              <i class="bi bi-tag" style="font-size:.65rem"></i>${a.name}
              ${a.geo_name?`<span style="font-size:.65rem;opacity:.6">(${a.geo_name})</span>`:''}
              <span class="remove-adset" onclick="App.Adsets.unlink(${a.id})" title="Открепить">×</span>
            </span>`).join('') : '<span class="text-muted small">Нет адсетов</span>'}
        </div>
      </div>`).join('');
  },
  openAdd() { this._open(null); },
  openEdit(id) { this._open(this.data.find(x=>x.id===id)); },
  _open(cr) {
    document.getElementById('creativeId').value = cr?.id||'';
    document.getElementById('creativeName').value = cr?.name||'';
    document.getElementById('creativeGeoId').value = cr?.geo_id||'';
    document.getElementById('creativeModalTitle').textContent = cr?'Редактировать':'Добавить';
    new bootstrap.Modal('#creativeModal').show();
  },
  async save() {
    const id = document.getElementById('creativeId').value;
    const body = { name: document.getElementById('creativeName').value.trim(), geo_id: parseInt(document.getElementById('creativeGeoId').value)||null };
    if (!body.name) return toast('Введите название','warning');
    try {
      if (id) await apiFetch(`/api/creatives/${id}`,{method:'PUT',body:JSON.stringify(body)});
      else await apiFetch('/api/creatives',{method:'POST',body:JSON.stringify(body)});
      bootstrap.Modal.getInstance('#creativeModal')?.hide();
      toast('Креатив сохранён'); await this.load();
    } catch(e) { toast(e.message,'danger'); }
  },
  async del(id) {
    if (!confirm('Удалить креатив?')) return;
    try { await apiFetch(`/api/creatives/${id}`,{method:'DELETE'}); toast('Удалено'); await this.load(); }
    catch(e) { toast(e.message,'danger'); }
  },
};

// ─── ADSETS ──────────────────────────────────────────────────────────────────

App.Adsets = {
  async _loadBuyerSelect(selectedId) {
    try {
      const users = await apiFetch('/api/users');
      const buyers = users.filter(u => u.role === 'buyer');
      const sel = document.getElementById('adsetBuyerId');
      sel.innerHTML = `<option value="">Не назначен</option>` + buyers.map(b => `<option value="${b.id}"${b.id===selectedId?' selected':''}>${b.username}</option>`).join('');
    } catch { /* non-admin won't see users, that's ok */ }
  },
  async openAddToCreative(creativeId) {
    document.getElementById('adsetId').value = '';
    document.getElementById('adsetName').value = '';
    document.getElementById('adsetGeoId').value = '';
    document.getElementById('adsetAgentId').value = '';
    const sel = document.getElementById('adsetCreativeId');
    sel.innerHTML = state.creatives.map(c => `<option value="${c.id}"${c.id===creativeId?' selected':''}>${c.name}</option>`).join('');
    this._loadBuyerSelect(null);
    document.getElementById('adsetModalTitle').textContent = 'Добавить адсет';
    new bootstrap.Modal('#adsetModal').show();
  },
  openEdit(id, data) {
    document.getElementById('adsetId').value = id;
    document.getElementById('adsetName').value = data.name||'';
    document.getElementById('adsetGeoId').value = data.geo_id||'';
    document.getElementById('adsetAgentId').value = data.agent_id||'';
    const sel = document.getElementById('adsetCreativeId');
    sel.innerHTML = `<option value="">Не привязан</option>` + state.creatives.map(c => `<option value="${c.id}"${c.id===data.creative_id?' selected':''}>${c.name}</option>`).join('');
    document.getElementById('adsetCreativeId').value = data.creative_id||'';
    this._loadBuyerSelect(data.buyer_id);
    document.getElementById('adsetModalTitle').textContent = 'Редактировать адсет';
    new bootstrap.Modal('#adsetModal').show();
  },
  async save() {
    const id = document.getElementById('adsetId').value;
    const body = {
      name: document.getElementById('adsetName').value.trim(),
      geo_id: parseInt(document.getElementById('adsetGeoId').value)||null,
      agent_id: parseInt(document.getElementById('adsetAgentId').value)||null,
      creative_id: parseInt(document.getElementById('adsetCreativeId').value)||null,
      buyer_id: parseInt(document.getElementById('adsetBuyerId').value)||null,
    };
    if (!body.name) return toast('Введите название адсета','warning');
    try {
      if (id) await apiFetch(`/api/adsets/${id}`,{method:'PUT',body:JSON.stringify(body)});
      else await apiFetch('/api/adsets',{method:'POST',body:JSON.stringify(body)});
      bootstrap.Modal.getInstance('#adsetModal')?.hide();
      toast('Адсет сохранён');
      await App.Creatives.load();
      await checkUndefined();
    } catch(e) { toast(e.message,'danger'); }
  },
  async unlink(id) {
    try {
      const all = await apiFetch('/api/adsets');
      const a = all.find(x=>x.id===id);
      if (a) await apiFetch(`/api/adsets/${id}`,{method:'PUT',body:JSON.stringify({name:a.name,creative_id:null,geo_id:a.geo_id,agent_id:a.agent_id})});
      await App.Creatives.load();
    } catch(e) { toast(e.message,'danger'); }
  },
};

// ─── UNDEFINED ───────────────────────────────────────────────────────────────

App.Undefined = {
  data: [],
  async load() {
    this.data = await apiFetch('/api/adsets?undefined_only=true');
    const tb = document.getElementById('undefinedTbody');
    if (!this.data.length) {
      tb.innerHTML = '<tr><td colspan="5">' + emptyState('check-circle', 'Нет неопределённых адсетов') + '</td></tr>';
      return;
    }
    tb.innerHTML = this.data.map(a => `<tr>
      <td><input type="checkbox" class="form-check-input undef-check" value="${a.id}" onchange="App.Undefined.onCheck()"></td>
      <td class="undefined-adset font-monospace">${a.name}</td>
      <td>${a.geo_name||'<span class="text-danger">не определено</span>'}</td>
      <td>${a.agent_name||'<span class="text-danger">не определено</span>'}</td>
      <td>${a.creative_name||'<span class="text-muted">—</span>'}</td>
      <td class="text-end">
        ${btnIcon('pencil','Привязать',`App.Undefined.edit(${a.id})`)}
        ${btnIcon('trash','Удалить',`App.Undefined.del(${a.id})`,true)}
      </td></tr>`).join('');
  },
  edit(id) {
    const a = this.data.find(x=>x.id===id);
    if (a) App.Adsets.openEdit(id, a);
  },
  async del(id) {
    if (!confirm('Удалить?')) return;
    try { await apiFetch(`/api/adsets/${id}`,{method:'DELETE'}); toast('Удалено'); await this.load(); await checkUndefined(); }
    catch(e) { toast(e.message,'danger'); }
  },
  toggleAll(checked) { document.querySelectorAll('.undef-check').forEach(cb => cb.checked = checked); this.onCheck(); },
  onCheck() {
    App.BulkDelete.update('undefined', 'undef-check');
    const checked = document.querySelectorAll('.undef-check:checked');
    const bar = document.getElementById('bulkAssignBar');
    if (bar) {
      bar.classList.toggle('d-none', checked.length === 0);
      const cnt = document.getElementById('bulkSelectedCount');
      if (cnt) cnt.textContent = checked.length;
    }
    // Populate dropdowns on first show
    if (checked.length > 0 && !this._dropdownsFilled) {
      this._dropdownsFilled = true;
      const fillSel = (id, items, nameKey) => {
        const sel = document.getElementById(id);
        if (!sel || sel.options.length > 1) return;
        items.forEach(i => { const o = document.createElement('option'); o.value = i.id; o.textContent = i[nameKey] || i.name; sel.appendChild(o); });
      };
      fillSel('bulkGeoSelect', state.geos || [], 'name');
      fillSel('bulkAgentSelect', state.agents || [], 'name');
      apiFetch('/api/creatives').then(c => fillSel('bulkCreativeSelect', c, 'name')).catch(() => {});
    }
  },
  _getSelectedIds() {
    return [...document.querySelectorAll('.undef-check:checked')].map(cb => parseInt(cb.value));
  },
  async bulkAssign(field) {
    const ids = this._getSelectedIds();
    if (!ids.length) return toast('Выберите адсеты', 'warning');
    const selMap = { geo_id: 'bulkGeoSelect', agent_id: 'bulkAgentSelect', creative_id: 'bulkCreativeSelect' };
    const val = document.getElementById(selMap[field])?.value;
    if (!val) return toast('Выберите значение из списка', 'warning');
    try {
      const body = { ids };
      body[field] = parseInt(val);
      const res = await apiFetch('/api/adsets/bulk', { method: 'PUT', body: JSON.stringify(body) });
      toast(`Обновлено: ${res.ok} из ${res.total}`);
      await this.load();
      await checkUndefined();
    } catch(e) { toast(e.message, 'danger'); }
  },
  async bulkSelectSimilar() {
    const checked = document.querySelectorAll('.undef-check:checked');
    if (checked.length !== 1) return toast('Выберите один адсет для поиска похожих', 'warning');
    const id = parseInt(checked[0].value);
    const adset = this.data.find(a => a.id === id);
    if (!adset) return;
    // Extract common prefix (first 2-6 lowercase chars)
    const prefix = adset.name.match(/^[A-Za-z]{2,6}/)?.[0];
    if (!prefix) return toast('Не удалось определить паттерн', 'warning');
    let count = 0;
    document.querySelectorAll('.undef-check').forEach(cb => {
      const row = this.data.find(a => a.id === parseInt(cb.value));
      if (row && row.name.toLowerCase().startsWith(prefix.toLowerCase())) {
        cb.checked = true;
        count++;
      }
    });
    this.onCheck();
    toast(`Выбрано ${count} адсетов с префиксом "${prefix}"`, 'info');
  },
  _dropdownsFilled: false,
};

// ─── STATISTICS ──────────────────────────────────────────────────────────────

App.Stats = {
  data: [],
  sortKey: null,
  sortDir: -1,
  _mode: 'range',
  _view: 'both',
  _barChart: null,
  _donutChart: null,
  _activeShortcut: null,

  setMode(m) {
    this._mode = m;
    ['Range','Compare'].forEach(name => {
      const filter = document.getElementById(`statsFilter${name}`);
      const btn = document.getElementById(`statsMode${name}`);
      if (filter) filter.classList.toggle('d-none', name.toLowerCase() !== m);
      if (btn) btn.classList.toggle('active', name.toLowerCase() === m);
    });
    const shortcuts = document.getElementById('statsShortcuts');
    if (shortcuts) shortcuts.classList.toggle('d-none', m === 'compare');
  },

  setView(view) {
    this._view = view;
    const charts = document.getElementById('statsCharts');
    const table = document.getElementById('statsContent');
    if (charts) charts.classList.toggle('d-none', view === 'table');
    if (table) table.classList.toggle('d-none', view === 'charts');
    ['Both','Charts','Table'].forEach(v => {
      const btn = document.getElementById('statsView' + v);
      if (btn) btn.classList.toggle('active', v.toLowerCase() === view);
    });
  },

  shortcut(type) {
    const today = new Date(); today.setHours(0,0,0,0);
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    let from, to = fmt(today);
    if (type === 'today') { from = fmt(today); }
    else if (type === 'yesterday') { const y = new Date(today); y.setDate(y.getDate()-1); from = to = fmt(y); }
    else if (type === 'week') { const w = new Date(today); w.setDate(w.getDate()-6); from = fmt(w); }
    else if (type === 'month') { from = fmt(today).slice(0,8)+'01'; }
    else if (type === 'prevmonth') {
      const pm = new Date(today.getFullYear(), today.getMonth()-1, 1);
      const pmEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      from = fmt(pm); to = fmt(pmEnd);
    }
    document.getElementById('statsFrom').value = from;
    document.getElementById('statsTo').value = to;
    // highlight active shortcut
    document.querySelectorAll('.date-shortcut').forEach(el => el.classList.remove('active'));
    event?.target?.classList.add('active');
    this._activeShortcut = type;
    this.load();
  },

  async load() {
    if (this._mode === 'compare') { await this.loadCompare(); return; }
    // Auto-default to current month on first load
    const fromEl = document.getElementById('statsFrom');
    const toEl = document.getElementById('statsTo');
    if (!fromEl.value && !toEl.value && !this._initialized) {
      this._initialized = true;
      this.shortcut('month');
      return;
    }
    const tab = currentStatsTab;
    showSkeleton('statsContent', 2);
    const p = [];
    const from = fromEl.value;
    const to   = toEl.value;
    const geoId = document.getElementById('statsGeoFilter').value;
    if (from) p.push(`from=${from}`);
    if (to)   p.push(`to=${to}`);
    if (geoId && tab === 'creatives') p.push(`geo_id=${geoId}`);
    const agentId = document.getElementById('statsAgentFilter')?.value;
    if (agentId && tab === 'creatives') p.push(`agent_id=${agentId}`);
    const url = `/api/statistics/${tab}` + (p.length ? '?' + p.join('&') : '');
    try {
      this.data = await apiFetch(url);
      // Populate agent filter
      const agentSel = document.getElementById('statsAgentFilter');
      if (agentSel && window.state?.agents) {
        const val = agentSel.value;
        agentSel.innerHTML = '<option value="">Все агенты</option>' + window.state.agents.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
        agentSel.value = val;
      }
      this.render(this.data);
    }
    catch(e) { toast(e.message,'danger'); }
  },

  async loadCompare() {
    const fromA = document.getElementById('cmpFromA').value;
    const toA   = document.getElementById('cmpToA').value || fromA;
    const fromB = document.getElementById('cmpFromB').value;
    const toB   = document.getElementById('cmpToB').value || fromB;
    if (!fromA || !fromB) { toast('Укажите оба периода для сравнения','warning'); return; }
    const tab = currentStatsTab;
    try {
      const [dataA, dataB] = await Promise.all([
        apiFetch(`/api/statistics/${tab}?from=${fromA}&to=${toA}`),
        apiFetch(`/api/statistics/${tab}?from=${fromB}&to=${toB}`),
      ]);
      const labelA = fromA === toA ? fromA : `${fromA} — ${toA}`;
      const labelB = fromB === toB ? fromB : `${fromB} — ${toB}`;
      this.renderCompare(dataA, dataB, labelA, labelB);
    } catch(e) { toast(e.message,'danger'); }
  },

  _fmtDelta(col, va, vb) {
    if (col.type === 'text') return '';
    const diff = (va ?? 0) - (vb ?? 0);
    if (diff === 0) return '';
    const abs = Math.abs(diff);
    const sign = diff > 0 ? '+' : '-';
    let dstr;
    if (col.type === 'usd' || col.type === 'profit') dstr = `${sign}$${fmt(abs)}`;
    else if (col.type === 'pct' || col.type === 'roi' || col.type === 'pct1') dstr = `${sign}${fmt(abs,1)}%`;
    else dstr = `${sign}${fmtInt(abs)}`;
    return ` <span class="${diff>0?'delta-pos':'delta-neg'}">${dstr}</span>`;
  },

  renderCompare(dataA, dataB, labelA, labelB) {
    const cols = this.cols();
    const bMap = {};
    dataB.forEach(r => { bMap[r.id] = r; });
    const container = document.getElementById('statsContent');
    container.innerHTML = `
      <div class="d-flex align-items-center gap-2 mb-2 small">
        <span class="badge period-a">A</span><span class="text-muted">${labelA}</span>
        <span class="ms-2 badge period-b">B</span><span class="text-muted">${labelB}</span>
        <span class="ms-auto text-muted" style="font-size:0.72rem"><i class="bi bi-info-circle me-1"></i>Δ = A − B</span>
      </div>
      <div style="overflow-x:auto;max-height:75vh">
        <table class="table table-sm table-hover crm-table" id="statsTable" style="min-width:max-content">
          <thead><tr>${cols.map(c => `<th class="${c.align}" style="white-space:nowrap">${c.label}</th>`).join('')}</tr></thead>
          <tbody id="statsTbody"></tbody>
        </table>
      </div>`;
    const tb = document.getElementById('statsTbody');
    if (!dataA.length) {
      tb.innerHTML = '<tr><td colspan="99" class="text-center text-muted py-4">Нет данных за период A</td></tr>';
      return;
    }
    tb.innerHTML = dataA.map(rA => {
      const rB = bMap[rA.id] || {};
      return `<tr>${cols.map(c => {
        const va = rA[c.key];
        const vb = rB[c.key];
        const main = this.fmtCell(c, va);
        if (c.type === 'text') return `<td class="${c.align} stat-number">${main}</td>`;
        return `<td class="${c.align} stat-number">${main}${this._fmtDelta(c, va, vb)}</td>`;
      }).join('')}</tr>`;
    }).join('');
  },

  async applyFilters() {
    const from = document.getElementById('statsFrom')?.value;
    const to = document.getElementById('statsTo')?.value;
    if (from && to && from > to) { toast('Дата «С» не может быть позже «По»', 'warning'); return; }
    const btn = document.getElementById('statsApplyBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Загрузка...';
    await this.load();
    btn.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i>Обновлено';
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-success');
    setTimeout(() => {
      btn.innerHTML = '<i class="bi bi-check2 me-1"></i>Применить';
      btn.classList.remove('btn-success');
      btn.classList.add('btn-primary');
      btn.disabled = false;
    }, 1500);
  },

  clearFilters() {
    ['statsFrom','statsTo','cmpFromA','cmpToA','cmpFromB','cmpToB'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('statsGeoFilter').value = '';
    ['statsAdsetFilter','statsMinSpend','statsMaxSpend','statsMinROI','statsMaxROI'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const af = document.getElementById('statsAgentFilter'); if (af) af.value = '';
    document.querySelectorAll('.date-shortcut').forEach(el => el.classList.remove('active'));
    this._activeShortcut = null;
    this.setMode('range');
    this.load();
  },

  cols() {
    // Sheet-2 style columns with conversion funnel
    const base = {
      creatives: [
        { key:'creative', label:'Крео', align:'', type:'text' },
        { key:'geo', label:'Гео', align:'', type:'text' },
      ],
      geos: [
        { key:'geo', label:'Гео', align:'', type:'text' },
        { key:'abbreviation', label:'Аббр.', align:'', type:'text' },
      ],
      agents: [
        { key:'agent', label:'Агент', align:'', type:'text' },
        { key:'abbreviation', label:'Аббр.', align:'', type:'text' },
      ],
    };
    const funnel = [
      { key:'pdp', label:'Sub', align:'text-end', type:'int' },
      { key:'cost_pdp', label:'$Sub', align:'text-end', type:'usd' },
      { key:'dialogs', label:'Dia', align:'text-end', type:'int' },
      { key:'cost_dia', label:'$Dia', align:'text-end', type:'usd' },
      { key:'pct_pdp_dia', label:'%Sub→Dia', align:'text-end', type:'pct' },
      { key:'registrations', label:'REG', align:'text-end', type:'int' },
      { key:'cost_reg', label:'$REG', align:'text-end', type:'usd' },
      { key:'pct_dia_reg', label:'%DIA→REG', align:'text-end', type:'pct' },
      { key:'deposits_count', label:'FD', align:'text-end', type:'int' },
      { key:'cost_dep', label:'$FD', align:'text-end', type:'usd' },
      { key:'pct_reg_dep', label:'%REG→FD', align:'text-end', type:'pct' },
      { key:'redeposits_count', label:'RD', align:'text-end', type:'int' },
      { key:'cost_redep', label:'$RD', align:'text-end', type:'usd' },
      { key:'pct_dep_redep', label:'%FD→RD', align:'text-end', type:'pct' },
      { key:'deposit_amount', label:'ВСЕ ПЛАТЕЖИ $', align:'text-end', type:'usd' },
      { key:'spend', label:'СПЕНД $', align:'text-end', type:'usd' },
      { key:'profit', label:'± $', align:'text-end', type:'profit' },
      { key:'roi', label:'% ROI', align:'text-end', type:'roi' },
    ];
    const agentExtra = [
      { key:'commission_pct', label:'% ком.', align:'text-end', type:'pct1' },
      { key:'commission_amount', label:'Ком. $', align:'text-end', type:'usd' },
    ];
    const cols = [...(base[currentStatsTab]||[]), ...funnel];
    if (currentStatsTab === 'agents') cols.push(...agentExtra);
    return cols;
  },

  fmtCell(col, val) {
    const v = val ?? 0;
    switch(col.type) {
      case 'text': return v || '—';
      case 'int': return fmtInt(v);
      case 'usd': return v > 0 ? `$${fmt(v)}` : '<span class="text-muted">—</span>';
      case 'pct': return v > 0 ? `<span class="${pctClass(v)}">${fmt(v,1)}%</span>` : '<span class="text-muted">—</span>';
      case 'pct1': return `${fmt(v,1)}%`;
      case 'roi': return `<span class="${roiClass(v)}">${fmt(v,1)}%</span>`;
      case 'profit': return `<span class="${v>0?'roi-positive':v<0?'roi-negative':''}">${v>0?'+':''}$${fmt(Math.abs(v))}</span>`;
      default: return v;
    }
  },

  _applyAdvancedFilters(rows) {
    let f = [...rows];
    // Hide zero rows unless checkbox checked
    const showZeros = document.getElementById('statsShowZeros')?.checked;
    if (!showZeros) {
      f = f.filter(r => (r.pdp||0) > 0 || (r.dialogs||0) > 0 || (r.registrations||0) > 0 ||
        (r.deposits_count||0) > 0 || (r.redeposits_count||0) > 0 || (r.spend||0) > 0 || (r.deposit_amount||0) > 0);
    }
    const q = (document.getElementById('statsAdsetFilter')?.value || '').toLowerCase().trim();
    const minS = parseFloat(document.getElementById('statsMinSpend')?.value);
    const maxS = parseFloat(document.getElementById('statsMaxSpend')?.value);
    const minR = parseFloat(document.getElementById('statsMinROI')?.value);
    const maxR = parseFloat(document.getElementById('statsMaxROI')?.value);
    if (q) f = f.filter(r => (r.creative||r.geo||r.agent||'').toLowerCase().includes(q));
    if (!isNaN(minS)) f = f.filter(r => (r.spend||0) >= minS);
    if (!isNaN(maxS)) f = f.filter(r => (r.spend||0) <= maxS);
    if (!isNaN(minR)) f = f.filter(r => (r.roi||0) >= minR);
    if (!isNaN(maxR)) f = f.filter(r => (r.roi||0) <= maxR);
    return f;
  },

  renderCharts(rows) {
    if (this._view === 'table') return;
    const tab = typeof currentStatsTab !== 'undefined' ? currentStatsTab : 'creatives';
    const labelKey = tab === 'creatives' ? 'creative' : tab === 'geos' ? 'geo' : 'agent';
    const fmtN = v => v.toLocaleString('en', {maximumFractionDigits:0});

    // Determine best metric for bar chart: prefer profit, fallback to deposit_amount, then pdp
    const hasProfit = rows.some(r => (r.profit||0) !== 0);
    const hasDeposit = rows.some(r => (r.deposit_amount||0) > 0);
    const hasSpend = rows.some(r => (r.spend||0) > 0);

    // Bar chart: Top 10 — smart metric selection
    const barEl = document.getElementById('statsBarChart');
    if (this._barChart) { this._barChart.destroy(); this._barChart = null; }
    if (barEl) {
      let barKey, barTitle, barFormatter, barColors;
      if (hasProfit) {
        barKey = 'profit'; barTitle = 'Топ-10 по профиту';
        barFormatter = v => (v>=0?'+':'-') + '$' + fmtN(Math.abs(v));
        barColors = { ranges: [{ from: -999999, to: -0.01, color: '#ef4444' }, { from: 0, to: 999999, color: '#10b981' }] };
      } else if (hasDeposit) {
        barKey = 'deposit_amount'; barTitle = 'Топ-10 по сумме FD+RD';
        barFormatter = v => '$' + fmtN(v);
        barColors = { ranges: [{ from: 0, to: 999999, color: '#3b82f6' }] };
      } else {
        barKey = 'pdp'; barTitle = 'Топ-10 по Sub';
        barFormatter = v => fmtN(v);
        barColors = { ranges: [{ from: 0, to: 999999, color: '#3b82f6' }] };
      }
      const sorted = [...rows].filter(r => (r[barKey]||0) !== 0)
        .sort((a, b) => Math.abs(b[barKey]||0) - Math.abs(a[barKey]||0)).slice(0, 10);
      if (sorted.length) {
        this._barChart = new ApexCharts(barEl, {
          chart: { type: 'bar', height: 250, toolbar: { show: false }, fontFamily: 'Inter' },
          title: { text: barTitle, style: { fontSize: '13px', fontWeight: 600 } },
          series: [{ name: barTitle, data: sorted.map(r => +(r[barKey]||0).toFixed(2)) }],
          xaxis: { categories: sorted.map(r => (r[labelKey]||'—').substring(0,20)), labels: { style: { fontSize: '11px' } } },
          plotOptions: { bar: { horizontal: true, borderRadius: 4, colors: barColors } },
          dataLabels: { enabled: true, formatter: barFormatter, style: { fontSize: '10px' } },
          grid: { borderColor: '#edf0f5', strokeDashArray: 3 },
          tooltip: { y: { formatter: barFormatter } },
        });
        this._barChart.render();
      } else {
        barEl.innerHTML = '<div class="d-flex align-items-center justify-content-center h-100 text-muted small py-5"><i class="bi bi-bar-chart me-2"></i>Нет данных</div>';
      }
    }

    // Donut chart: smart metric — spend distribution, fallback to PDP distribution
    const donutEl = document.getElementById('statsDonutChart');
    if (this._donutChart) { this._donutChart.destroy(); this._donutChart = null; }
    if (donutEl) {
      let donutKey, donutTitle, donutFmt;
      if (hasSpend) {
        donutKey = 'spend'; donutTitle = 'Распределение спенда'; donutFmt = v => '$' + fmtN(v);
      } else {
        donutKey = 'pdp'; donutTitle = 'Распределение Sub'; donutFmt = v => fmtN(v);
      }
      const withVal = rows.filter(r => (r[donutKey]||0) > 0).sort((a, b) => b[donutKey] - a[donutKey]);
      if (withVal.length) {
        const top8 = withVal.slice(0, 8);
        const otherVal = withVal.slice(8).reduce((s, r) => s + (r[donutKey]||0), 0);
        const labels = top8.map(r => (r[labelKey]||'—').substring(0,20));
        const values = top8.map(r => +(r[donutKey]).toFixed(2));
        if (otherVal > 0) { labels.push('Другие'); values.push(+otherVal.toFixed(2)); }
        this._donutChart = new ApexCharts(donutEl, {
          chart: { type: 'donut', height: 250, fontFamily: 'Inter' },
          title: { text: donutTitle, style: { fontSize: '13px', fontWeight: 600 } },
          series: values,
          labels: labels,
          colors: ['#3b82f6','#6366f1','#8b5cf6','#10b981','#f59e0b','#ef4444','#ec4899','#0ea5e9','#94a3b8'],
          legend: { position: 'bottom', fontSize: '11px' },
          dataLabels: { enabled: true, formatter: function(v) { return v.toFixed(0) + '%'; } },
          tooltip: { y: { formatter: donutFmt } },
          plotOptions: { pie: { donut: { size: '55%' } } },
        });
        this._donutChart.render();
      } else {
        donutEl.innerHTML = '<div class="d-flex align-items-center justify-content-center h-100 text-muted small py-5"><i class="bi bi-pie-chart me-2"></i>Нет данных</div>';
      }
    }
  },

  render(rows) {
    const filtered = this._applyAdvancedFilters(rows);
    const cols = this.cols();
    const container = document.getElementById('statsContent');
    let sortKey = this.sortKey;
    let sortDir = this.sortDir;

    const renderRows = (data) => {
      const tb = document.getElementById('statsTbody');
      if (!tb) return;
      if (!data.length) {
        tb.innerHTML = '<tr><td colspan="99">' + emptyState('graph-up', 'Нет данных за выбранный период') + '</td></tr>';
        return;
      }
      // Data rows
      const tab = typeof currentStatsTab !== 'undefined' ? currentStatsTab : 'creatives';
      const idKey = tab === 'creatives' ? 'id' : 'id';
      let html = data.map(r => {
        const drillType = tab === 'creatives' ? 'creative' : tab === 'geos' ? 'geo' : 'agent';
        return `<tr style="cursor:pointer" onclick="App.Stats.drillDown('${drillType}',${r.id},this)" title="Клик для детализации">${cols.map(c => {
          const v = r[c.key];
          return `<td class="${c.align} stat-number">${this.fmtCell(c, v)}</td>`;
        }).join('')}</tr>`;
      }).join('');
      // TOTAL row
      const numKeys = ['pdp','dialogs','registrations','deposits_count','redeposits_count','deposit_amount','spend','profit','commission_amount'];
      const totals = {};
      numKeys.forEach(k => { totals[k] = data.reduce((s, r) => s + (r[k]||0), 0); });
      if (totals.spend > 0) { totals.roi = +((totals.deposit_amount - totals.spend) / totals.spend * 100).toFixed(1); totals.cost_pdp = totals.pdp ? +(totals.spend/totals.pdp).toFixed(2) : 0; }
      if (totals.pdp > 0 && totals.dialogs > 0) totals.pct_pdp_dia = +(totals.dialogs/totals.pdp*100).toFixed(1);
      if (totals.dialogs > 0 && totals.registrations > 0) totals.pct_dia_reg = +(totals.registrations/totals.dialogs*100).toFixed(1);
      if (totals.registrations > 0 && totals.deposits_count > 0) totals.pct_reg_dep = +(totals.deposits_count/totals.registrations*100).toFixed(1);
      if (totals.deposits_count > 0 && totals.redeposits_count > 0) totals.pct_dep_redep = +(totals.redeposits_count/totals.deposits_count*100).toFixed(1);
      const totalsHtml = `<tr class="fw-bold" style="background:#f0f4ff;position:sticky;top:0;z-index:2">${cols.map((c, i) => {
        if (i === 0) return `<td class="${c.align}">ИТОГО (${data.length})</td>`;
        if (c.type === 'text') return '<td></td>';
        const v = totals[c.key] ?? 0;
        return `<td class="${c.align} stat-number">${this.fmtCell(c, v)}</td>`;
      }).join('')}</tr>`;
      tb.innerHTML = totalsHtml + html;
    };

    container.innerHTML = `
      <div style="overflow-x:auto;max-height:75vh">
        <table class="table table-sm table-hover crm-table" id="statsTable" style="min-width:max-content">
          <thead style="position:sticky;top:0;z-index:3"><tr>${cols.map(c =>
            `<th class="sortable ${c.align}" data-key="${c.key}" style="white-space:nowrap">${c.label}</th>`
          ).join('')}</tr></thead>
          <tbody id="statsTbody"></tbody>
        </table>
      </div>`;

    renderRows(filtered);
    this.renderCharts(filtered);

    document.querySelectorAll('#statsTable th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.key;
        sortDir = sortKey === key ? sortDir * -1 : -1;
        sortKey = key;
        this.sortKey = sortKey; this.sortDir = sortDir;
        document.querySelectorAll('#statsTable th').forEach(h => h.classList.remove('sort-asc','sort-desc'));
        th.classList.add(sortDir===1?'sort-asc':'sort-desc');
        const sorted = [...filtered].sort((a,b) => {
          const av = a[key]??'', bv = b[key]??'';
          return (typeof av==='number' ? av-bv : String(av).localeCompare(String(bv))) * sortDir;
        });
        renderRows(sorted);
      });
    });
  },

  async drillDown(type, id, trEl) {
    // Toggle: if already open, close
    const existing = trEl?.nextElementSibling;
    if (existing?.classList.contains('drill-row')) {
      existing.remove();
      trEl.style.background = '';
      return;
    }
    // Remove any other open drill-down
    document.querySelectorAll('.drill-row').forEach(el => el.remove());
    document.querySelectorAll('tr[data-drill-open]').forEach(el => { el.style.background = ''; delete el.dataset.drillOpen; });
    const from = document.getElementById('statsFrom')?.value || '';
    const to = document.getElementById('statsTo')?.value || '';
    const params = [`type=${type}`, `id=${id}`];
    if (from) params.push(`from=${from}`);
    if (to) params.push(`to=${to}`);
    try {
      const data = await apiFetch(`/api/statistics/drilldown?${params.join('&')}`);
      const filtered = data.filter(r => (r.pdp||0) > 0 || (r.spend||0) > 0 || (r.deposit_amount||0) > 0 || (r.dialogs||0) > 0);
      if (!filtered.length) { toast('Нет данных по адсетам', 'warning'); return; }
      const cols = this.cols();
      const drillCols = cols.filter(c => c.type !== 'text' || c.key === cols[0].key);
      const valueCols = drillCols.filter(c => c.key !== cols[0].key);
      this._drillData = filtered;
      this._drillCols = drillCols;
      this._drillValueCols = valueCols;
      this._drillSort = { key: null, dir: -1 };
      const thHtml = valueCols.map(c =>
        `<th class="${c.align}" data-dkey="${c.key}" style="white-space:nowrap;cursor:pointer;user-select:none" onclick="App.Stats.sortDrill('${c.key}')">${c.label}</th>`
      ).join('');
      const newRow = document.createElement('tr');
      newRow.className = 'drill-row';
      newRow.innerHTML = `<td colspan="${cols.length}" style="padding:0;background:#f8fafc">
        <div style="max-height:320px;overflow:auto;margin:4px 0">
          <table class="table table-sm table-borderless mb-0" style="font-size:.8rem">
            <thead id="drillThead"><tr style="background:#e8f0fd;position:sticky;top:0"><th style="white-space:nowrap">Адсет</th>${thHtml}</tr></thead>
            <tbody id="drillTbody"></tbody>
          </table>
        </div>
      </td>`;
      trEl.after(newRow);
      trEl.dataset.drillOpen = '1';
      trEl.style.background = '#e8f0fd';
      newRow.addEventListener('click', e => e.stopPropagation());
      this._renderDrillBody();
    } catch(e) { toast('Ошибка загрузки: ' + e.message, 'error'); }
  },

  sortDrill(key) {
    if (this._drillSort.key === key) {
      this._drillSort.dir *= -1;
    } else {
      this._drillSort.key = key;
      this._drillSort.dir = -1;
    }
    // Update header indicators
    document.querySelectorAll('#drillThead th[data-dkey]').forEach(th => {
      const k = th.dataset.dkey;
      const col = this._drillValueCols.find(c => c.key === k);
      if (!col) return;
      const isActive = k === this._drillSort.key;
      th.innerHTML = col.label + (isActive ? (this._drillSort.dir === -1 ? ' <span style="color:#3b82f6">▼</span>' : ' <span style="color:#3b82f6">▲</span>') : '');
    });
    this._renderDrillBody();
  },

  _renderDrillBody() {
    const tbody = document.getElementById('drillTbody');
    if (!tbody) return;
    const { key, dir } = this._drillSort;
    let rows = [...this._drillData];
    if (key) {
      rows.sort((a, b) => dir === -1 ? (b[key]||0) - (a[key]||0) : (a[key]||0) - (b[key]||0));
    }
    tbody.innerHTML = rows.map(r =>
      `<tr><td class="fw-medium" style="white-space:nowrap">${r.adset||'—'}</td>${this._drillValueCols.map(c => `<td class="${c.align} stat-number">${this.fmtCell(c, r[c.key])}</td>`).join('')}</tr>`
    ).join('');
  },
};

// ─── DEPOSITS ────────────────────────────────────────────────────────────────

App.Deposits = {
  _qdType: 'dep',
  _qdRowId: null,
  _adsetMap: {},

  initSection() {
    const user = getUser();
    const isOperator = user?.role === 'operator';
    document.getElementById('operatorDepositUI').classList.toggle('d-none', !isOperator);
    document.getElementById('adminDepositUI').classList.toggle('d-none', isOperator);
    if (isOperator) {
      document.getElementById('opDate').value = todayStr();
      document.getElementById('opHistMonth').value = currentMonth();
      this._startPendingPolling();
      // Load operator's assigned geos and filter dropdowns
      this._initOperatorGeos().then(() => {
        this.loadHistory();
      });
    } else {
      document.getElementById('depDate').value = todayStr();
      document.getElementById('depHistMonth').value = currentMonth();
      this.loadAdsetDatalist();
      this.loadHistory();
      // Buyer: hide amount + save button, keep only pending button, show hint
      if (user?.role === 'buyer') {
        document.getElementById('depAmount')?.closest('.mb-3')?.classList.add('d-none');
        document.querySelector('button[onclick="App.Deposits.save()"]')?.classList.add('d-none');
        // Show hint
        const hintEl = document.getElementById('buyerPendingHint');
        if (hintEl) hintEl.classList.remove('d-none');
      }
    }
  },

  async loadAdsetDatalist() {
    try {
      const adsets = await apiFetch('/api/adsets');
      this._adsetMap = {};
      const dl = document.getElementById('adsetDatalist');
      dl.innerHTML = adsets.map(a => {
        this._adsetMap[a.name] = { id: a.id, geo_name: a.geo_name || '', creative_name: a.creative_name || '' };
        return `<option value="${a.name.replace(/"/g,'&quot;')}">`;
      }).join('');
    } catch {}
  },

  onAdsetInput() {
    const val = document.getElementById('depAdsetInput').value.trim();
    const errEl = document.getElementById('depAdsetError');
    const found = this._adsetMap[val];
    if (found) {
      document.getElementById('depAdsetId').value = found.id;
      document.getElementById('depGeoDisplay').value = found.geo_name;
      document.getElementById('depCreative').value = found.creative_name;
      document.getElementById('depAdsetInput').classList.remove('is-invalid');
      errEl.classList.add('d-none');
    } else {
      document.getElementById('depAdsetId').value = '';
      document.getElementById('depGeoDisplay').value = '';
      document.getElementById('depCreative').value = '';
    }
  },

  async _initOperatorGeos() {
    const user = getUser();
    try {
      const geoIds = await apiFetch(`/api/users/${user.id}/geos`);
      const myGeos = state.geos.filter(g => geoIds.includes(g.id));
      const geoOpts = myGeos.map(g => `<option value="${g.id}">${g.name} (${g.abbreviation})</option>`).join('');
      const allOpts = `<option value="">Все гео</option>` + geoOpts;
      const filterOpts = `<option value="">— гео —</option>` + geoOpts;
      const opGeoFilter = document.getElementById('opGeoFilter');
      const opHistGeo = document.getElementById('opHistGeo');
      if (opGeoFilter) opGeoFilter.innerHTML = filterOpts;
      if (opHistGeo) opHistGeo.innerHTML = allOpts;
      // Auto-select if only one geo
      if (myGeos.length === 1 && opGeoFilter) {
        opGeoFilter.value = myGeos[0].id;
        this.operatorLoadAdsets();
      }
    } catch {}
  },

  async operatorLoadAdsets() {
    const geoId = document.getElementById('opGeoFilter').value;
    const container = document.getElementById('opAdsetList');
    if (!geoId) {
      container.innerHTML = '<p class="text-muted small text-center py-3">Выберите гео</p>';
      return;
    }
    const adsets = await apiFetch(`/api/adsets?geo_id=${geoId}`);
    if (!adsets.length) {
      container.innerHTML = '<p class="text-muted small text-center py-3">Нет адсетов для этого гео</p>';
      return;
    }
    container.innerHTML = adsets.map(a => `
      <div class="adset-quick-row d-flex align-items-center gap-2 px-3 py-2 border-bottom" data-name="${a.name.toLowerCase()}" id="adset-row-${a.id}">
        <div class="flex-grow-1">
          <div class="font-monospace" style="font-size:.78rem">${a.name}</div>
        </div>
        <button class="btn btn-xs btn-dep" onclick="App.Deposits.openQuick(${a.id},'${a.name.replace(/'/g,"\\'")}','dep',${a.id})">+FD</button>
        <button class="btn btn-xs btn-redep" onclick="App.Deposits.openQuick(${a.id},'${a.name.replace(/'/g,"\\'")}','redep',${a.id})">+RD</button>
      </div>`).join('');
    document.getElementById('opSearch').value = '';
  },

  filterAdsets() {
    const q = document.getElementById('opSearch').value.toLowerCase();
    document.querySelectorAll('#opAdsetList .adset-quick-row').forEach(row => {
      row.style.display = (!q || row.dataset.name.includes(q)) ? '' : 'none';
    });
  },

  openQuick(adset_id, adset_name, type, rowAdsetId) {
    this._qdType = type;
    this._qdRowId = rowAdsetId;
    document.getElementById('qdAdsetId').value = adset_id;
    document.getElementById('qdAdsetName').textContent = adset_name;
    document.getElementById('qdType').textContent = type === 'dep' ? 'FD' : 'RD';
    document.getElementById('qdAmount').value = '';
    new bootstrap.Modal('#quickDepModal').show();
    setTimeout(() => document.getElementById('qdAmount').focus(), 300);
  },

  async quickSave() {
    const adset_id = parseInt(document.getElementById('qdAdsetId').value);
    const amount = parseFloat(document.getElementById('qdAmount').value);
    const date = document.getElementById('opDate').value || todayStr();
    if (!amount) return toast('Введите сумму','warning');
    try {
      await apiFetch('/api/deposits',{method:'POST',body:JSON.stringify({adset_id,date,amount,type:this._qdType})});
      bootstrap.Modal.getInstance('#quickDepModal')?.hide();
      toast('Добавлено');
      if (this._qdRowId) {
        const row = document.getElementById(`adset-row-${this._qdRowId}`);
        if (row) { row.classList.add('flash-success'); setTimeout(() => row.classList.remove('flash-success'), 1600); }
      }
      await this.loadHistory();
    } catch(e) { toast(e.message,'danger'); }
  },

  async save() {
    const adset_id = parseInt(document.getElementById('depAdsetId').value);
    const date = document.getElementById('depDate').value;
    const type = document.getElementById('depType').value;
    const amount = parseFloat(document.getElementById('depAmount').value);
    const errEl = document.getElementById('depAdsetError');
    if (!adset_id) {
      document.getElementById('depAdsetInput').classList.add('is-invalid');
      errEl.textContent = 'Адсет не найден в словаре';
      errEl.classList.remove('d-none');
      return;
    }
    if (!date || !amount) return toast('Заполните все поля','warning');
    try {
      await apiFetch('/api/deposits',{method:'POST',body:JSON.stringify({adset_id,date,amount,type})});
      toast('Сохранено');
      document.getElementById('depAmount').value = '';
      document.getElementById('depAdsetInput').value = '';
      document.getElementById('depAdsetId').value = '';
      document.getElementById('depGeoDisplay').value = '';
      document.getElementById('depCreative').value = '';
      await this.loadHistory();
    } catch(e) { toast(e.message,'danger'); }
  },

  async loadHistory() {
    const user = getUser();
    const isOperator = user?.role === 'operator';
    const geoSel = isOperator ? 'opHistGeo' : 'depHistGeo';
    const monthSel = isOperator ? 'opHistMonth' : 'depHistMonth';
    const tbodyId = isOperator ? 'opHistTbody' : 'depHistTbody';
    document.getElementById(tbodyId).innerHTML = '<tr><td colspan="8"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line w-75"></div></td></tr>';

    const geoId = document.getElementById(geoSel)?.value;
    const month = document.getElementById(monthSel)?.value;
    let url = '/api/deposits';
    const p = [];
    if (geoId) p.push(`geo_id=${geoId}`);
    if (month) p.push(`month=${month}`);
    if (p.length) url += '?' + p.join('&');

    const rows = await apiFetch(url);
    const tb = document.getElementById(tbodyId);
    const isPending = r => r.status === 'pending' || !r.amount;
    if (isOperator) {
      tb.innerHTML = rows.map(r => `<tr>
        <td>${r.date}</td>
        <td class="font-monospace" style="font-size:.78rem">${r.adset_name}</td>
        <td>${r.geo_name||'—'}</td>
        <td>${depTypeBadge(r.type)}</td>
        <td class="text-end stat-number fw-semibold">${isPending(r) ? '<span class="text-muted">—</span>' : '$'+fmt(r.amount)}</td>
        <td>${isPending(r) ? '<span class="badge bg-warning text-dark">Pending</span>' : '<span class="badge bg-success">Подтверждён</span>'}</td>
        <td>${btnIcon('trash','Удалить',`App.Deposits.del(${r.id})`,true)}</td>
      </tr>`).join('') || '<tr><td colspan="7" class="text-center text-muted py-3">Нет депозитов</td></tr>';
    } else {
      const me = getUser();
      const isBuyer = me?.role === 'buyer';
      tb.innerHTML = rows.map(r => {
        const canDel = !isBuyer || (isPending(r) && r.created_by === me?.id);
        return `<tr>
        <td>${r.date}</td>
        <td class="font-monospace" style="font-size:.78rem">${r.adset_name}</td>
        <td>${r.creative_name||'—'}</td>
        <td>${r.geo_name||'—'}</td>
        <td>${depTypeBadge(r.type)}</td>
        <td class="text-end stat-number fw-semibold">${isPending(r) ? '<span class="text-muted">—</span>' : '$'+fmt(r.amount)}</td>
        <td>${isPending(r) ? '<span class="badge bg-warning text-dark">Pending</span>' : '<span class="badge bg-success">Подтверждён</span>'}</td>
        <td>${r.agent_name||'—'}</td>
        <td>${canDel ? btnIcon('trash','Удалить',`App.Deposits.del(${r.id})`,true) : ''}</td>
      </tr>`;
      }).join('') || '<tr><td colspan="9" class="text-center text-muted py-3">Нет депозитов</td></tr>';
    }
  },
  async del(id) {
    if (!confirm('Удалить?')) return;
    try { await apiFetch(`/api/deposits/${id}`,{method:'DELETE'}); toast('Удалено'); await this.loadHistory(); }
    catch(e) { toast(e.message,'danger'); }
  },

  // ── Pending deposits ──
  _pendingInterval: null,
  _lastPendingCount: 0,

  _startPendingPolling() {
    if (this._pendingInterval) clearInterval(this._pendingInterval);
    this._updatePendingBadge();
    this._pendingInterval = setInterval(() => this._updatePendingBadge(), 15000);
  },

  async _updatePendingBadge() {
    try {
      const rows = await apiFetch('/api/deposits/pending');
      this._pendingRows = rows;
      const badge = document.getElementById('pendingSidebarCount');
      const wrap = document.getElementById('pendingSidebarBadge');
      if (badge) badge.textContent = rows.length;
      if (wrap) wrap.classList.toggle('d-none', !rows.length);
    } catch {}
  },

  async loadPending() {
    try {
      const rows = await apiFetch('/api/deposits/pending');
      const container = document.getElementById('pendingList');
      const badge = document.getElementById('pendingCount');
      badge.textContent = rows.length;
      badge.classList.toggle('d-none', rows.length === 0);
      if (!rows.length) {
        container.innerHTML = '<p class="text-muted small text-center py-3">Нет ожидающих</p>';
        return;
      }
      this._lastPendingCount = rows.length;
      container.innerHTML = rows.map(r => `
        <div class="d-flex align-items-center gap-2 px-3 py-2 border-bottom" id="pending-${r.id}">
          <div class="flex-grow-1">
            <div class="font-monospace" style="font-size:.78rem">${r.adset_name}</div>
            <div class="d-flex gap-2 mt-1">
              <span class="badge ${r.type==='dep'?'badge-dep':'badge-redep'}">${r.type==='dep'?'FD':'RD'}</span>
              <span class="text-muted small">${r.date}</span>
              ${r.geo_name?`<span class="badge bg-light text-muted border" style="font-size:.68rem">${r.geo_name}</span>`:''}
              <span class="text-muted small">от ${r.created_by_name||'?'}</span>
            </div>
          </div>
          <input type="number" class="form-control form-control-sm" style="width:100px" placeholder="$ сумма" id="pending-amt-${r.id}" step="0.01" min="0" />
          <button class="btn btn-sm btn-success" onclick="App.Deposits.confirmPending(${r.id})"><i class="bi bi-check-lg"></i></button>
        </div>`).join('');
    } catch {}
  },

  async confirmPending(id) {
    const amount = parseFloat(document.getElementById(`pending-amt-${id}`)?.value);
    if (!amount || amount <= 0) return toast('Введите сумму','warning');
    try {
      await apiFetch(`/api/deposits/${id}/confirm`, { method: 'PUT', body: JSON.stringify({ amount }) });
      toast('Подтверждено');
      const row = document.getElementById(`pending-${id}`);
      if (row) { row.classList.add('flash-success'); setTimeout(() => row.remove(), 800); }
      await this.loadHistory();
      this.loadPending();
      this._updatePendingBadge();
    } catch(e) { toast(e.message,'danger'); }
  },

  async sendPending() {
    const adset_id = parseInt(document.getElementById('depAdsetId').value);
    const date = document.getElementById('depDate').value;
    const type = document.getElementById('depType').value;
    if (!adset_id) {
      document.getElementById('depAdsetInput').classList.add('is-invalid');
      return toast('Выберите адсет','warning');
    }
    if (!date) return toast('Укажите дату','warning');
    try {
      await apiFetch('/api/deposits', { method: 'POST', body: JSON.stringify({ adset_id, date, amount: 0, type, status: 'pending' }) });
      toast('Отправлено на подтверждение','success');
      document.getElementById('depAdsetInput').value = '';
      document.getElementById('depAdsetId').value = '';
      document.getElementById('depGeoDisplay').value = '';
      document.getElementById('depCreative').value = '';
      await this.loadHistory();
    } catch(e) { toast(e.message,'danger'); }
  },
};

// ─── IMPORT ──────────────────────────────────────────────────────────────────

App.Import = {
  _csvText: null,

  async init() {
    document.getElementById('spendDate').value = todayStr();
    document.getElementById('chatterfyDate').value = todayStr();
    document.getElementById('spendHistMonth').value = currentMonth();
    document.getElementById('fbDateFrom').value = todayStr();
    document.getElementById('fbDateTo').value = todayStr();
    document.getElementById('fbtoolDateFrom').value = todayStr();
    document.getElementById('fbtoolDateTo').value = todayStr();
    document.getElementById('chatterfyHistMonth').value = currentMonth();
    const cabs = await apiFetch('/api/cabinets');
    const sel = document.getElementById('spendCabinet');
    sel.innerHTML = '<option value="">Без кабинета</option>' +
      cabs.map(c=>`<option value="${c.id}">${c.name} (${c.account_id})</option>`).join('');
    const fbSel = document.getElementById('fbCabinet');
    fbSel.innerHTML = cabs.filter(c => c.access_token).map(c => `<option value="${c.id}">${c.name} (${c.account_id})</option>`).join('') || '<option value="">Нет кабинетов с токеном</option>';
    // Restore FBTool fields from localStorage
    const savedKey = localStorage.getItem('fbtool_api_key');
    const savedAccounts = localStorage.getItem('fbtool_accounts');
    if (savedKey) document.getElementById('fbtoolApiKey').value = savedKey;
    if (savedAccounts) document.getElementById('fbtoolAccounts').value = savedAccounts;
    await this.loadSpendHistory();
  },
  async autoFillFBToolAccounts() {
    try {
      const cabs = await apiFetch('/api/cabinets');
      const ids = cabs.filter(c => c.is_active).map(c => c.account_id).join(', ');
      document.getElementById('fbtoolAccounts').value = ids;
      toast('Аккаунты заполнены из кабинетов');
    } catch(e) { toast(e.message,'danger'); }
  },
  async processSpend() {
    const date = document.getElementById('spendDate').value;
    const raw = document.getElementById('spendData').value.trim();
    const cabinet_id = parseInt(document.getElementById('spendCabinet').value)||null;
    if (!date||!raw) return toast('Введите дату и данные','warning');
    const records = [];
    for (const line of raw.split('\n')) {
      const parts = line.trim().split(/\t|,|;/);
      if (parts.length<2) continue;
      const adset_name = parts[0].trim();
      const amount = parseFloat(parts[1].trim().replace(',','.'));
      if (!adset_name||isNaN(amount)) continue;
      records.push({adset_name,amount,date,cabinet_id});
    }
    if (!records.length) return toast('Нет корректных строк','warning');
    try {
      const res = await apiFetch('/api/import/spend',{method:'POST',body:JSON.stringify({records})});
      toast(`Загружено: ${res.imported}${res.undefined_adsets?.length?`. Неопред.: ${res.undefined_adsets.length}`:''}`, res.undefined_adsets?.length?'warning':'success');
      document.getElementById('spendData').value='';
      await this.loadSpendHistory(); checkUndefined();
    } catch(e) { toast(e.message,'danger'); }
  },
  async loadSpendHistory() {
    const month = document.getElementById('spendHistMonth').value;
    const rows = await apiFetch(month?`/api/import/spend?month=${month}`:'/api/import/spend');
    const tb = document.getElementById('spendHistTbody');
    tb.innerHTML = rows.map(r=>`<tr>
      <td>${r.date}</td><td class="font-monospace" style="font-size:.78rem">${r.adset_name}</td>
      <td>${r.creative_name||'—'}</td><td>${r.geo_name||'—'}</td>
      <td class="text-end stat-number">$${fmt(r.amount)}</td>
      <td>${btnIcon('trash','Удалить',`App.Import.delSpend(${r.id})`,true)}</td></tr>`).join('')||
      '<tr><td colspan="6" class="text-center text-muted py-3">Нет записей</td></tr>';
  },
  onCSVFile() {
    const file = document.getElementById('chatterfyFile').files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const firstLine = text.split('\n')[0] || '';
      if ((firstLine.includes('Campaign') || firstLine.includes('adset_name') || firstLine.includes('Adset')) && (firstLine.includes('Dialogues') || firstLine.includes('FD'))) {
        this._csvText = text;
        document.getElementById('chatterfyData').value = `[CSV-файл загружен: ${file.name} · ${text.split('\n').length - 1} строк]`;
        toast(`CSV готов: ${text.split('\n').length - 1} строк`, 'success');
      } else {
        this._csvText = null;
        document.getElementById('chatterfyData').value = text;
        toast('Файл вставлен как текст', 'success');
      }
    };
    reader.readAsText(file, 'utf-8');
  },

  async processChatterfy() {
    const date = document.getElementById('chatterfyDate').value;
    const raw = document.getElementById('chatterfyData').value.trim();
    if (!date || !raw) return toast('Введите дату и данные','warning');
    const replace_duplicates = document.getElementById('chatterfyReplaceDups')?.checked || false;
    try {
      let res;
      if (this._csvText) {
        res = await apiFetch('/api/import/chatterfy-csv',{method:'POST',body:JSON.stringify({date,csv_text:this._csvText,replace_duplicates})});
        this._csvText = null;
      } else {
        res = await apiFetch('/api/import/chatterfy',{method:'POST',body:JSON.stringify({date,data:raw,replace_duplicates})});
      }
      const warn = res.undefined_adsets?.length || res.errors?.length || res.duplicates > 0;
      const dupMsg = res.duplicates > 0 ? `. Дублей: ${res.duplicates}${replace_duplicates?' (заменены)':' (пропущены)'}` : '';
      toast(`Импортировано: ${res.processed}${dupMsg}${res.undefined_adsets?.length?`. Неопред.: ${res.undefined_adsets.length}`:''}${res.errors?.length?`. Ошибок: ${res.errors.length}`:''}`, warn?'warning':'success');
      document.getElementById('chatterfyData').value = '';
      document.getElementById('chatterfyFile').value = '';
      await this.loadChatterfyHistory(); checkUndefined();
    } catch(e) { toast(e.message,'danger'); }
  },
  async loadChatterfyHistory() {
    const month = document.getElementById('chatterfyHistMonth').value;
    const rows = await apiFetch(month?`/api/import/chatterfy?month=${month}`:'/api/import/chatterfy');
    const tb = document.getElementById('chatterfyHistTbody');
    tb.innerHTML = rows.map(r=>`<tr>
      <td>${r.date}</td><td class="font-monospace" style="font-size:.78rem">${r.adset_name}</td>
      <td class="text-end">${fmtInt(r.pdp)}</td><td class="text-end">${fmtInt(r.dialogs)}</td>
      <td class="text-end">${fmtInt(r.registrations)}</td><td class="text-end">${fmtInt(r.deposits)}</td>
      <td class="text-end">${fmtInt(r.redeposits)}</td>
      <td>${btnIcon('trash','Удалить',`App.Import.delChatterfy(${r.id})`,true)}</td></tr>`).join('')||
      '<tr><td colspan="8" class="text-center text-muted py-3">Нет записей</td></tr>';
  },

  async delChatterfy(id) {
    if (!confirm('Удалить эту запись?')) return;
    try { await apiFetch(`/api/import/chatterfy/${id}`,{method:'DELETE'}); toast('Удалено'); await this.loadChatterfyHistory(); }
    catch(e) { toast(e.message,'danger'); }
  },
  async delSpend(id) {
    if (!confirm('Удалить эту запись?')) return;
    try { await apiFetch(`/api/import/spend/${id}`,{method:'DELETE'}); toast('Удалено'); await this.loadSpendHistory(); }
    catch(e) { toast(e.message,'danger'); }
  },

  async bulkDeleteSpend() {
    const from = prompt('Удалить спенды С даты (YYYY-MM-DD):');
    if (!from) return;
    const to = prompt('Удалить спенды ПО дату (YYYY-MM-DD):');
    if (!to) return;
    if (!confirm(`Удалить все спенды за ${from} — ${to}?`)) return;
    try {
      const res = await apiFetch('/api/import/spend/bulk', { method: 'DELETE', body: JSON.stringify({ from, to }) });
      toast(`Удалено: ${res.deleted} записей`);
      await this.loadSpendHistory();
    } catch(e) { toast(e.message, 'danger'); }
  },

  async bulkDeleteChatterfy() {
    const from = prompt('Удалить записи Chatterfy С даты (YYYY-MM-DD):');
    if (!from) return;
    const to = prompt('Удалить записи Chatterfy ПО дату (YYYY-MM-DD):');
    if (!to) return;
    if (!confirm(`Удалить все записи Chatterfy за ${from} — ${to}?`)) return;
    try {
      const res = await apiFetch('/api/import/chatterfy/bulk', { method: 'DELETE', body: JSON.stringify({ from, to }) });
      toast(`Удалено: ${res.deleted} записей`);
      await this.loadChatterfyHistory();
    } catch(e) { toast(e.message, 'danger'); }
  },

  async importFromFBTool() {
    const api_key = document.getElementById('fbtoolApiKey').value.trim();
    const accountsStr = document.getElementById('fbtoolAccounts').value.trim();
    const date_from = document.getElementById('fbtoolDateFrom').value;
    const date_to = document.getElementById('fbtoolDateTo').value;
    if (!api_key || !accountsStr) return toast('Укажите API key и аккаунты','warning');
    if (!date_from || !date_to) return toast('Укажите период','warning');
    const account_ids = accountsStr.split(',').map(s => s.trim()).filter(Boolean);
    const btn = document.getElementById('fbtoolImportBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Загрузка...';
    try {
      const res = await apiFetch('/api/import/fbtool-spend', { method: 'POST', body: JSON.stringify({ api_key, account_ids, date_from, date_to }) });
      // Save to localStorage on success
      localStorage.setItem('fbtool_api_key', api_key);
      localStorage.setItem('fbtool_accounts', accountsStr);
      const warn = res.undefined_adsets?.length;
      toast(`FBTool: загружено ${res.imported}${warn ? `. Неопред.: ${res.undefined_adsets.length}` : ''}`, warn ? 'warning' : 'success');
      await this.loadSpendHistory();
      checkUndefined();
    } catch(e) { toast(e.message, 'danger'); }
    finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-cloud-download me-1"></i>Загрузить из FBTool.pro';
    }
  },

  async importFromFB() {
    const cabinet_id = parseInt(document.getElementById('fbCabinet').value);
    const date_from = document.getElementById('fbDateFrom').value;
    const date_to = document.getElementById('fbDateTo').value;
    if (!cabinet_id) return toast('Выберите кабинет','warning');
    if (!date_from || !date_to) return toast('Укажите период','warning');
    const btn = document.getElementById('fbImportBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Загрузка...';
    try {
      const res = await apiFetch('/api/import/fb-spend', { method: 'POST', body: JSON.stringify({ cabinet_id, date_from, date_to }) });
      const warn = res.undefined_adsets?.length;
      toast(`Загружено: ${res.imported} спендов${warn ? `. Неопред.: ${res.undefined_adsets.length}` : ''}`, warn ? 'warning' : 'success');
      await this.loadSpendHistory();
      checkUndefined();
    } catch(e) { toast(e.message, 'danger'); }
    finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-cloud-download me-1"></i>Загрузить спенды из FB';
    }
  },
};

// ─── CABINETS ────────────────────────────────────────────────────────────────

App.Cabinets = {
  data: [],
  async load() {
    this.data = await apiFetch('/api/cabinets');
    const tb = document.getElementById('cabinetTbody');
    tb.innerHTML = this.data.map(c=>`<tr>
      <td>${c.name}</td><td class="font-monospace">${c.account_id}</td>
      <td class="text-muted">${c.access_token?'••••••••':'—'}</td>
      <td class="text-end">
        ${btnIcon('pencil','Редактировать',`App.Cabinets.openEdit(${c.id})`)}
        ${btnIcon('trash','Удалить',`App.Cabinets.del(${c.id})`,true)}
      </td></tr>`).join('')||'<tr><td colspan="4" class="text-center text-muted py-3">Нет кабинетов</td></tr>';
  },
  openAdd() { this._open(null); },
  openEdit(id) { this._open(this.data.find(x=>x.id===id)); },
  _open(c) {
    document.getElementById('cabinetId').value = c?.id||'';
    document.getElementById('cabinetName').value = c?.name||'';
    document.getElementById('cabinetAccountId').value = c?.account_id||'';
    document.getElementById('cabinetToken').value = '';
    document.getElementById('cabinetModalTitle').textContent = c?'Редактировать':'Добавить';
    new bootstrap.Modal('#cabinetModal').show();
  },
  async save() {
    const id = document.getElementById('cabinetId').value;
    const body = { name: document.getElementById('cabinetName').value.trim(), account_id: document.getElementById('cabinetAccountId').value.trim(), access_token: document.getElementById('cabinetToken').value.trim()||null };
    if (!body.name||!body.account_id) return toast('Заполните все поля','warning');
    try {
      if (id) await apiFetch(`/api/cabinets/${id}`,{method:'PUT',body:JSON.stringify(body)});
      else await apiFetch('/api/cabinets',{method:'POST',body:JSON.stringify(body)});
      bootstrap.Modal.getInstance('#cabinetModal')?.hide();
      toast('Кабинет сохранён'); await this.load();
    } catch(e) { toast(e.message,'danger'); }
  },
  async del(id) {
    if (!confirm('Удалить кабинет?')) return;
    try { await apiFetch(`/api/cabinets/${id}`,{method:'DELETE'}); toast('Удалено'); await this.load(); }
    catch(e) { toast(e.message,'danger'); }
  },
};

// ─── USERS (admin) ───────────────────────────────────────────────────────────

App.Users = {
  data: [],
  async load() {
    this.data = await apiFetch('/api/users');
    const tb = document.getElementById('usersTbody');
    const me = getUser();
    tb.innerHTML = this.data.map(u => {
      const geoNames = u.role === 'operator' && u.geo_ids?.length
        ? u.geo_ids.map(id => state.geos.find(g => g.id === id)?.abbreviation || id).join(', ')
        : '';
      return `<tr>
        <td><i class="bi bi-person me-1 text-secondary"></i>${u.username}${u.id===me?.id?' <span class="badge bg-secondary">я</span>':''}</td>
        <td>${roleBadge(u.role)}${geoNames ? `<span class="ms-1 text-muted small">${geoNames}</span>` : ''}</td>
        <td class="text-muted small">${u.created_at?.slice(0,10)||'—'}</td>
        <td class="text-end">
          ${btnIcon('pencil','Редактировать',`App.Users.openEdit(${u.id})`)}
          ${u.id!==me?.id?btnIcon('trash','Удалить',`App.Users.del(${u.id})`,true):''}
        </td></tr>`;
    }).join('');
  },
  _fillGeoSelect(selectedIds = []) {
    const sel = document.getElementById('userGeos');
    if (!sel) return;
    sel.innerHTML = state.geos.map(g =>
      `<option value="${g.id}"${selectedIds.includes(g.id)?' selected':''}>${g.name} (${g.abbreviation})</option>`
    ).join('');
  },
  onRoleChange() {
    const role = document.getElementById('userRole').value;
    const row = document.getElementById('userGeoRow');
    row.style.display = role === 'operator' ? '' : 'none';
  },
  openAdd() {
    document.getElementById('userId').value = '';
    document.getElementById('userUsername').value = '';
    document.getElementById('userPassword').value = '';
    document.getElementById('userRole').value = 'operator';
    document.getElementById('userPassRow').style.display = '';
    document.getElementById('userModalTitle').textContent = 'Добавить пользователя';
    document.getElementById('userGeoRow').style.display = '';
    this._fillGeoSelect([]);
    new bootstrap.Modal('#userModal').show();
  },
  async openEdit(id) {
    const u = this.data.find(x => x.id === id);
    if (!u) return;
    document.getElementById('userId').value = u.id;
    document.getElementById('userUsername').value = u.username;
    document.getElementById('userPassword').value = '';
    document.getElementById('userRole').value = u.role;
    document.getElementById('userPassRow').style.display = '';
    document.getElementById('userModalTitle').textContent = 'Редактировать пользователя';
    const geoRow = document.getElementById('userGeoRow');
    geoRow.style.display = u.role === 'operator' ? '' : 'none';
    this._fillGeoSelect(u.geo_ids || []);
    new bootstrap.Modal('#userModal').show();
  },
  async save() {
    const id = document.getElementById('userId').value;
    const role = document.getElementById('userRole').value;
    const body = {
      username: document.getElementById('userUsername').value.trim(),
      password: document.getElementById('userPassword').value,
      role,
    };
    if (!id && (!body.username||!body.password)) return toast('Заполните все поля','warning');
    try {
      let userId = id;
      if (id) await apiFetch(`/api/users/${id}`,{method:'PUT',body:JSON.stringify(body)});
      else { const r = await apiFetch('/api/users',{method:'POST',body:JSON.stringify(body)}); userId = r.id; }
      // Save geo assignments for operators
      if (role === 'operator' && userId) {
        const sel = document.getElementById('userGeos');
        const geo_ids = [...sel.selectedOptions].map(o => parseInt(o.value));
        await apiFetch(`/api/users/${userId}/geos`, {method:'PUT', body:JSON.stringify({geo_ids})});
      }
      bootstrap.Modal.getInstance('#userModal')?.hide();
      toast(id?'Пользователь обновлён':'Пользователь создан');
      await this.load();
    } catch(e) { toast(e.message,'danger'); }
  },
  async del(id) {
    if (!confirm('Удалить пользователя?')) return;
    try { await apiFetch(`/api/users/${id}`,{method:'DELETE'}); toast('Удалено'); await this.load(); }
    catch(e) { toast(e.message,'danger'); }
  },
};

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

App.Dashboard = {
  _initialized: false,

  shortcut(type) {
    const today = new Date(); today.setHours(0,0,0,0);
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    let from, to = fmt(today);
    if (type === 'today') { from = fmt(today); }
    else if (type === 'yesterday') { const y = new Date(today); y.setDate(y.getDate()-1); from = to = fmt(y); }
    else if (type === 'week') { const w = new Date(today); w.setDate(w.getDate()-6); from = fmt(w); }
    else if (type === 'month') { from = fmt(today).slice(0,8)+'01'; }
    else if (type === 'prevmonth') {
      const pm = new Date(today.getFullYear(), today.getMonth()-1, 1);
      const pmEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      from = fmt(pm); to = fmt(pmEnd);
    }
    document.getElementById('dashFrom').value = from;
    document.getElementById('dashTo').value = to;
    document.querySelectorAll('#dashShortcuts .date-shortcut').forEach(el => el.classList.remove('active'));
    event?.target?.classList.add('active');
    this.load();
  },

  clearFilter() {
    document.getElementById('dashFrom').value = '';
    document.getElementById('dashTo').value = '';
    document.querySelectorAll('#dashShortcuts .date-shortcut').forEach(el => el.classList.remove('active'));
    this.load();
  },

  init() {
    if (!this._initialized) {
      this.shortcut('month');
      // plFrom/plTo initialized by plShortcut('month') on first load
      // Tab switching
      document.querySelectorAll('#dashTab .nav-link').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#dashTab .nav-link').forEach(b => b.classList.toggle('active', b === btn));
          ['summary','buyers','operators'].forEach(t => {
            document.getElementById(`dash-${t}`)?.classList.toggle('d-none', t !== btn.dataset.dash);
          });
        });
      });
      // Hide tabs based on role
      const user = getUser();
      if (user?.role === 'buyer') {
        document.querySelectorAll('#dashTab .nav-link').forEach(btn => {
          const tab = btn.dataset.dash;
          if (['operators','buyers','pl','expcat'].includes(tab)) btn.parentElement.classList.add('d-none');
        });
      }
      this._initialized = true;
    }
    this.load();
  },

  async load() {
    const from = document.getElementById('dashFrom')?.value;
    const to = document.getElementById('dashTo')?.value;
    const params = [];
    if (from) params.push(`from=${from}`);
    if (to) params.push(`to=${to}`);
    const qs = params.length ? '?' + params.join('&') : '';
    showSkeleton('summaryCards', 4);
    const user = getUser();
    try {
      const data = await apiFetch(`/api/dashboard/summary${qs}`);
      const cards = [
        { label: 'Спенд', value: `$${fmt(data.total_spend)}`, icon: 'bi-graph-down', color: '#1a56db', bg: '#e8f0fd' },
        { label: 'Доход (FD+RD)', value: `$${fmt(data.total_deposits)}`, icon: 'bi-cash-coin', color: '#10b981', bg: '#d1fae5' },
        { label: 'Прибыль', value: `${data.profit >= 0 ? '+' : ''}$${fmt(Math.abs(data.profit))}`, icon: 'bi-currency-dollar', color: data.profit >= 0 ? '#10b981' : '#ef4444', bg: data.profit >= 0 ? '#d1fae5' : '#fee2e2' },
        { label: 'ROI', value: `${data.roi}%`, icon: 'bi-percent', color: data.roi >= 0 ? '#10b981' : '#ef4444', bg: data.roi >= 0 ? '#d1fae5' : '#fee2e2' },
      ];
      document.getElementById('summaryCards').innerHTML = cards.map(c => `
        <div class="col-6 col-lg-3">
          <div class="metric-card d-flex align-items-center gap-3">
            <div class="metric-icon" style="background:${c.bg};color:${c.color}"><i class="bi ${c.icon}"></i></div>
            <div>
              <div class="metric-value" style="color:${c.color}">${c.value}</div>
              <div class="metric-label">${c.label}</div>
            </div>
          </div>
        </div>`).join('');
    } catch(e) { toast(e.message,'danger'); }

    try {
      const buyers = await apiFetch(`/api/dashboard/buyers${qs}`);
      let buyersHtml = buyers.map(r => `<tr>
        <td class="fw-medium">${r.buyer}</td>
        <td class="text-muted small">${r.agency_name||'—'}</td>
        <td class="text-end">${r.adset_count}</td>
        <td class="text-end stat-number">$${fmt(r.spend)}</td>
        <td class="text-end stat-number">${fmtInt(r.deposits_count)}</td>
        <td class="text-end stat-number">${fmtInt(r.redeposits_count)}</td>
        <td class="text-end stat-number fw-semibold">$${fmt(r.deposit_amount)}</td>
        <td class="text-end stat-number"><span class="${r.profit>=0?'roi-positive':'roi-negative'}">${r.profit>=0?'+':''}$${fmt(Math.abs(r.profit))}</span></td>
        <td class="text-end stat-number"><span class="${roiClass(r.roi)}">${r.roi}%</span></td>
      </tr>`).join('');
      if (buyers.length > 1) {
        const bt = { adsets:0, spend:0, dep:0, redep:0, amount:0, profit:0 };
        buyers.forEach(b => { bt.adsets += b.adset_count||0; bt.spend += b.spend||0; bt.dep += b.deposits_count||0; bt.redep += b.redeposits_count||0; bt.amount += b.deposit_amount||0; bt.profit += b.profit||0; });
        const bRoi = bt.spend > 0 ? ((bt.amount - bt.spend) / bt.spend * 100).toFixed(1) : 0;
        buyersHtml += `<tr class="fw-bold" style="background:#f0f4ff"><td>ИТОГО</td><td></td><td class="text-end">${bt.adsets}</td><td class="text-end">$${fmt(bt.spend)}</td><td class="text-end">${bt.dep}</td><td class="text-end">${bt.redep}</td><td class="text-end">$${fmt(bt.amount)}</td><td class="text-end"><span class="${bt.profit>=0?'roi-positive':'roi-negative'}">${bt.profit>=0?'+':''}$${fmt(Math.abs(bt.profit))}</span></td><td class="text-end">${bRoi}%</td></tr>`;
      }
      document.getElementById('buyersTbody').innerHTML = buyersHtml || '<tr><td colspan="9" class="text-center text-muted py-3">Нет данных</td></tr>';
    } catch {}

    if (user?.role === 'buyer') return; // buyer doesn't see operators
    try {
      const ops = await apiFetch(`/api/dashboard/operators${qs}`);
      let opsHtml = ops.map(r => `<tr>
        <td><i class="bi bi-person me-1 text-muted"></i>${r.username}</td>
        <td class="text-end stat-number">${r.count_dep}</td>
        <td class="text-end stat-number">${r.count_redep}</td>
        <td class="text-end stat-number fw-semibold">$${fmt(r.total_amount)}</td>
      </tr>`).join('');
      if (ops.length > 1) {
        const ot = { dep:0, redep:0, amount:0 };
        ops.forEach(o => { ot.dep += o.count_dep||0; ot.redep += o.count_redep||0; ot.amount += o.total_amount||0; });
        opsHtml += `<tr class="fw-bold" style="background:#f0f4ff"><td>ИТОГО</td><td class="text-end">${ot.dep}</td><td class="text-end">${ot.redep}</td><td class="text-end">$${fmt(ot.amount)}</td></tr>`;
      }
      document.getElementById('operatorsTbody').innerHTML = opsHtml || '<tr><td colspan="4" class="text-center text-muted py-3">Нет данных</td></tr>';
    } catch {}

    // Load funnel
    try {
      const from = document.getElementById('dashFrom')?.value;
      const to = document.getElementById('dashTo')?.value;
      if (from && to) {
        const funnelData = await App.Funnel.load(from, to);
        App.Funnel.render('dashFunnel', funnelData);
      }
    } catch {}
  },

  _plData: null,
  _plFilter: 'all',
  _barChart: null,
  _donutChart: null,

  plShortcut(type) {
    const today = new Date(); today.setHours(0,0,0,0);
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    let from, to = fmt(today);
    if (type === 'today') { from = fmt(today); }
    else if (type === 'yesterday') { const y = new Date(today); y.setDate(y.getDate()-1); from = to = fmt(y); }
    else if (type === 'week') { const w = new Date(today); w.setDate(w.getDate()-6); from = fmt(w); }
    else if (type === 'month') { from = fmt(today).slice(0,8)+'01'; }
    else if (type === 'prevmonth') {
      const pm = new Date(today.getFullYear(), today.getMonth()-1, 1);
      const pmEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      from = fmt(pm); to = fmt(pmEnd);
    }
    document.getElementById('plFrom').value = from;
    document.getElementById('plTo').value = to;
    document.querySelectorAll('#plShortcuts .date-shortcut').forEach(el => el.classList.remove('active'));
    event?.target?.classList.add('active');
    this.loadPL();
  },

  async loadPL() {
    const from = document.getElementById('plFrom').value;
    const to = document.getElementById('plTo').value;
    if (!from) { this.plShortcut('month'); return; }
    const qs = `from=${from}&to=${to || from}`;
    try {
      this._plData = await apiFetch(`/api/pl/daily?${qs}`);
      const s = this._plData.summary;

      document.getElementById('plCardIncome').innerHTML = `
        <div class="d-flex align-items-center gap-3">
          <div class="metric-icon" style="background:#d1fae5;color:#10b981"><i class="bi bi-arrow-down-circle"></i></div>
          <div><div class="metric-value" style="color:#10b981">$${fmt(s.total_income)}</div><div class="metric-label">Доход</div></div>
        </div>`;
      document.getElementById('plCardExpense').innerHTML = `
        <div class="d-flex align-items-center gap-3">
          <div class="metric-icon" style="background:#fee2e2;color:#ef4444"><i class="bi bi-arrow-up-circle"></i></div>
          <div><div class="metric-value" style="color:#ef4444">$${fmt(s.total_expenses)}</div><div class="metric-label">Расход</div></div>
        </div>`;
      const nc = s.net >= 0 ? '#10b981' : '#ef4444', nb = s.net >= 0 ? '#d1fae5' : '#fee2e2';
      document.getElementById('plCardNet').innerHTML = `
        <div class="d-flex align-items-center gap-3">
          <div class="metric-icon" style="background:${nb};color:${nc}"><i class="bi bi-wallet2"></i></div>
          <div><div class="metric-value" style="color:${nc}">${s.net>=0?'+':''}$${fmt(Math.abs(s.net))}</div><div class="metric-label">Нетто</div></div>
        </div>`;

      this._renderCatBreakdown();
      this._renderCharts();
      this._renderPLEntries();
    } catch(e) { toast(e.message,'danger'); }
  },

  filterPL(filter) {
    this._plFilter = filter;
    document.querySelectorAll('.pl-filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
    this._renderPLEntries();
  },

  _renderCatBreakdown() {
    const cats = this._plData?.by_category || [];
    const el = document.getElementById('plCatBreakdown');
    if (!cats.length) { el.innerHTML = '<p class="text-muted small mb-0 p-1">Нет данных</p>'; return; }
    el.innerHTML = cats.map(c => {
      const isExp = c.type === 'expense';
      return `<div class="d-flex align-items-center gap-2 py-1 px-1" style="font-size:.8rem;cursor:pointer" onclick="document.getElementById('plCatFilter').value='${c.name}';App.Dashboard.filterPL(App.Dashboard._plFilter)">
        <span class="badge ${isExp?'bg-danger':'bg-success'}" style="font-size:.6rem;width:14px;height:14px;padding:0"></span>
        <span class="flex-grow-1 text-truncate">${c.name}</span>
        <span class="fw-semibold ${isExp?'text-danger':'text-success'}">$${fmt(c.total)}</span>
      </div>`;
    }).join('');
    // Populate category filter dropdown
    const sel = document.getElementById('plCatFilter');
    const val = sel.value;
    sel.innerHTML = '<option value="">Все категории</option>' + cats.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    sel.value = val;
  },

  _renderCharts() {
    if (!this._plData) return;
    const days = this._plData.days;

    // Bar chart — income vs expense per day
    const labels = days.filter(d => d.income > 0 || d.expenses > 0).map(d => d.day);
    const incomeData = days.filter(d => d.income > 0 || d.expenses > 0).map(d => d.income);
    const expenseData = days.filter(d => d.income > 0 || d.expenses > 0).map(d => d.expenses);

    const gridColor = '#edf0f5';

    if (this._barChart) this._barChart.destroy();
    this._barChart = new ApexCharts(document.getElementById('plBarChart'), {
      chart: { type: 'bar', height: 230, toolbar: { show: false }, fontFamily: 'Inter', background: 'transparent' },
      series: [
        { name: 'Доход', data: incomeData },
        { name: 'Расход', data: expenseData },
      ],
      xaxis: { categories: labels },
      colors: ['#10b981', '#ef4444'],
      plotOptions: { bar: { borderRadius: 4, columnWidth: '60%' } },
      dataLabels: { enabled: false },
      legend: { position: 'top', fontSize: '11px' },
      grid: { borderColor: gridColor, strokeDashArray: 3 },
      tooltip: { y: { formatter: v => '$' + fmt(v) } },
    });
    this._barChart.render();

    // Donut — expenses by category
    const cats = (this._plData.by_category || []).filter(c => c.type === 'expense');
    if (this._donutChart) this._donutChart.destroy();
    if (cats.length) {
      this._donutChart = new ApexCharts(document.getElementById('plDonutChart'), {
        chart: { type: 'donut', height: 230, fontFamily: 'Inter', background: 'transparent' },
        series: cats.map(c => c.total),
        labels: cats.map(c => c.name),
        colors: ['#ef4444', '#f97316', '#d97706', '#6366f1', '#0ea5e9', '#8b5cf6', '#ec4899'],
        legend: { position: 'bottom', fontSize: '11px' },
        dataLabels: { enabled: true, formatter: (v) => v.toFixed(0) + '%' },
        tooltip: { y: { formatter: v => '$' + fmt(v) } },
        plotOptions: { pie: { donut: { size: '55%' } } },
      });
      this._donutChart.render();
    } else {
      document.getElementById('plDonutChart').innerHTML = '<div class="text-center text-muted py-5 small">Нет расходов для диаграммы</div>';
    }
  },

  _updateUnitFilter() {
    const catFilter = document.getElementById('plCatFilter')?.value || '';
    const unitSel = document.getElementById('plUnitFilter');
    if (!unitSel) return;
    if (!catFilter || !this._plData) {
      unitSel.innerHTML = '<option value="">Все подстатьи</option>';
      unitSel.value = '';
      return;
    }
    const items = new Set();
    for (const d of this._plData.days) {
      for (const e of d.expense_items) {
        if ((e.category_name || '—') === catFilter && e.item_name) items.add(e.item_name);
      }
      for (const b of d.income_breakdown) {
        if ('FD+RD' === catFilter && b.name) items.add(b.name);
      }
    }
    const sorted = [...items].sort();
    unitSel.innerHTML = '<option value="">Все подстатьи</option>' + sorted.map(n => `<option value="${n}">${n}</option>`).join('');
    unitSel.value = '';
  },

  _renderPLEntries() {
    if (!this._plData) return;
    const filter = this._plFilter;
    const catFilter = document.getElementById('plCatFilter')?.value || '';
    const tb = document.getElementById('plEntriesTbody');
    let allEntries = [];

    for (const d of this._plData.days) {
      for (const b of d.income_breakdown) {
        allEntries.push({ date: d.date, type: 'income', catName: 'FD+RD', itemName: b.name, amount: b.amount, id: null });
      }
      for (const e of d.expense_items) {
        allEntries.push({ date: d.date, type: e.category, catName: e.category_name || '—', itemName: e.item_name || e.description || '—', amount: e.amount, id: e.id, notes: e.notes });
      }
    }

    if (filter === 'income') allEntries = allEntries.filter(e => e.type === 'income');
    else if (filter === 'expense') allEntries = allEntries.filter(e => e.type === 'expense');
    if (catFilter) allEntries = allEntries.filter(e => e.catName === catFilter);
    const unitFilter = document.getElementById('plUnitFilter')?.value || '';
    if (unitFilter) allEntries = allEntries.filter(e => e.itemName === unitFilter);

    if (!allEntries.length) {
      tb.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Нет записей</td></tr>';
      return;
    }

    tb.innerHTML = allEntries.map(e => {
      const isInc = e.type === 'income';
      const badge = isInc ? '<span class="badge bg-success" style="font-size:.65rem">Доход</span>' : '<span class="badge bg-danger" style="font-size:.65rem">Расход</span>';
      return `<tr>
        <td class="text-muted small">${e.date}</td>
        <td>${badge}</td>
        <td class="fw-medium">${e.catName}</td>
        <td>${e.itemName}${e.notes ? '<div class="text-muted small" style="font-size:.7rem">'+e.notes+'</div>' : ''}</td>
        <td class="text-end stat-number fw-semibold ${isInc?'text-success':'text-danger'}">${isInc?'+':'-'}$${fmt(e.amount)}</td>
        <td>${e.id ? btnIcon('trash','Удалить',`App.Expenses.del(${e.id})`,true) : ''}</td>
      </tr>`;
    }).join('');
  },

  clearPLFilter() {
    const catEl = document.getElementById('plCatFilter');
    const unitEl = document.getElementById('plUnitFilter');
    if (catEl) catEl.value = '';
    if (unitEl) unitEl.value = '';
    this.plShortcut('month');
  },

  async plCompare() {
    const from = document.getElementById('plFrom')?.value;
    const to = document.getElementById('plTo')?.value;
    if (!from || !to) return toast('Выберите период для сравнения', 'warning');
    const d1 = new Date(from), d2 = new Date(to);
    const days = Math.round((d2 - d1) / 86400000);
    const prevEnd = new Date(d1.getTime() - 86400000);
    const prevStart = new Date(prevEnd.getTime() - days * 86400000);
    const fmtD = d => d.toISOString().slice(0, 10);
    try {
      const [cur, prev] = await Promise.all([
        apiFetch(`/api/pl/daily?from=${from}&to=${to}`),
        apiFetch(`/api/pl/daily?from=${fmtD(prevStart)}&to=${fmtD(prevEnd)}`)
      ]);
      const cs = cur.summary, ps = prev.summary;
      const delta = (c, p) => p > 0 ? (((c - p) / p) * 100).toFixed(1) : (c > 0 ? '+∞' : '0');
      const deltaHtml = (c, p, isGood) => {
        const pct = delta(c, p);
        const num = parseFloat(pct);
        const color = isNaN(num) ? '#6b7280' : (isGood ? (num >= 0 ? '#10b981' : '#ef4444') : (num <= 0 ? '#10b981' : '#ef4444'));
        return `<span style="font-size:.75rem;color:${color}">${num >= 0 ? '↑' : '↓'} ${Math.abs(num)}% vs пред.</span>`;
      };
      // Update metric cards with deltas
      document.getElementById('plCardIncome').innerHTML = `<div class="metric-value text-success">+$${fmt(cs.total_income)}</div><div class="metric-label">Доход</div>${deltaHtml(cs.total_income, ps.total_income, true)}`;
      document.getElementById('plCardExpense').innerHTML = `<div class="metric-value text-danger">-$${fmt(cs.total_expenses)}</div><div class="metric-label">Расход</div>${deltaHtml(cs.total_expenses, ps.total_expenses, false)}`;
      document.getElementById('plCardNet').innerHTML = `<div class="metric-value ${cs.net>=0?'text-success':'text-danger'}">${cs.net>=0?'+':'-'}$${fmt(Math.abs(cs.net))}</div><div class="metric-label">Нетто</div>${deltaHtml(cs.net, ps.net, true)}`;

      // Build category comparison table
      const catMapA = {}, catMapB = {};
      (cur.by_category || []).forEach(c => catMapA[c.name || 'Прочее'] = c.total);
      (prev.by_category || []).forEach(c => catMapB[c.name || 'Прочее'] = c.total);
      const allCats = [...new Set([...Object.keys(catMapA), ...Object.keys(catMapB)])];

      const labelA = `${from} — ${to}`;
      const labelB = `${fmtD(prevStart)} — ${fmtD(prevEnd)}`;

      let compareHtml = `<div class="card mt-3"><div class="card-header py-2 fw-semibold small"><i class="bi bi-arrow-left-right me-1"></i>Сравнение по категориям</div>
        <div class="card-body p-0"><table class="table table-sm crm-table mb-0">
        <thead><tr><th>Категория</th><th class="text-end">A: ${labelA}</th><th class="text-end">B: ${labelB}</th><th class="text-end">Δ $</th><th class="text-end">Δ %</th></tr></thead><tbody>`;

      for (const cat of allCats) {
        const a = catMapA[cat] || 0, b = catMapB[cat] || 0;
        const d = a - b;
        const dpct = b > 0 ? ((d / b) * 100).toFixed(1) : (a > 0 ? '∞' : '0');
        const dColor = d > 0 ? '#ef4444' : d < 0 ? '#10b981' : '#6b7280'; // expense: less = good
        compareHtml += `<tr>
          <td class="fw-medium">${cat}</td>
          <td class="text-end stat-number">$${fmt(a)}</td>
          <td class="text-end stat-number">$${fmt(b)}</td>
          <td class="text-end stat-number"><span style="color:${dColor}">${d>=0?'+':''}$${fmt(d)}</span></td>
          <td class="text-end stat-number"><span style="color:${dColor}">${d>=0?'↑':'↓'}${Math.abs(parseFloat(dpct))}%</span></td>
        </tr>`;
      }

      // Summary row
      const totalDA = cs.total_expenses - ps.total_expenses;
      const totalDPct = ps.total_expenses > 0 ? ((totalDA / ps.total_expenses) * 100).toFixed(1) : '0';
      const tc = totalDA > 0 ? '#ef4444' : '#10b981';
      compareHtml += `<tr class="fw-bold" style="background:#f0f4ff">
        <td>ИТОГО расходы</td>
        <td class="text-end">$${fmt(cs.total_expenses)}</td>
        <td class="text-end">$${fmt(ps.total_expenses)}</td>
        <td class="text-end"><span style="color:${tc}">${totalDA>=0?'+':''}$${fmt(totalDA)}</span></td>
        <td class="text-end"><span style="color:${tc}">${totalDA>=0?'↑':'↓'}${Math.abs(parseFloat(totalDPct))}%</span></td>
      </tr>`;
      compareHtml += `</tbody></table></div></div>`;

      // Insert comparison table after metric cards
      const existingCompare = document.getElementById('plCompareTable');
      if (existingCompare) existingCompare.remove();
      const metricsRow = document.querySelector('#pl-records .row.g-3.mb-3');
      if (metricsRow) {
        const div = document.createElement('div');
        div.id = 'plCompareTable';
        div.innerHTML = compareHtml;
        metricsRow.after(div);
      }

      toast(`Сравнение: ${labelA} vs ${labelB}`, 'info');
    } catch(e) { toast(e.message, 'danger'); }
  },
};

// ─── EXPENSES (P&L) ──────────────────────────────────────────────────────────

App.Expenses = {
  _cats: [],
  async openAdd(date) {
    document.getElementById('expenseId').value = '';
    document.getElementById('expenseDate').value = date || todayStr();
    document.getElementById('expenseCategory').value = 'expense';
    document.getElementById('expenseAmount').value = '';
    const notesEl = document.getElementById('expenseNotes');
    if (notesEl) notesEl.value = '';
    document.getElementById('expenseModalTitle').textContent = 'Добавить запись';
    await this._loadCategories();
    this.onTypeChange();
    new bootstrap.Modal('#expenseModal').show();
    setTimeout(() => document.getElementById('expenseAmount').focus(), 300);
  },
  async _loadCategories() {
    try { this._cats = await apiFetch('/api/expense-categories'); } catch { this._cats = []; }
  },
  onTypeChange() {
    const type = document.getElementById('expenseCategory').value;
    const cats = this._cats.filter(c => c.type === type);
    const sel = document.getElementById('expenseCatSelect');
    sel.innerHTML = '<option value="">-- выберите категорию --</option>' +
      cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    document.getElementById('expenseItemSelect').innerHTML = '<option value="">-- выберите подстатью --</option>';
  },
  onCatChange() {
    const catId = parseInt(document.getElementById('expenseCatSelect').value);
    const cat = this._cats.find(c => c.id === catId);
    const sel = document.getElementById('expenseItemSelect');
    if (!cat || !cat.items?.length) {
      sel.innerHTML = '<option value="">— нет подстатей —</option>';
      return;
    }
    sel.innerHTML = '<option value="">-- выберите подстатью --</option>' +
      cat.items.map(i => `<option value="${i.id}">${i.name}</option>`).join('');
  },
  async save() {
    const id = document.getElementById('expenseId').value;
    const item_id = parseInt(document.getElementById('expenseItemSelect').value) || null;
    const catId = parseInt(document.getElementById('expenseCatSelect').value) || null;
    const cat = this._cats.find(c => c.id === catId);
    const item = cat?.items?.find(i => i.id === item_id);
    const description = item ? `${cat.name}: ${item.name}` : (cat ? cat.name : '');
    const body = {
      date: document.getElementById('expenseDate').value,
      category: document.getElementById('expenseCategory').value,
      description,
      amount: parseFloat(document.getElementById('expenseAmount').value),
      notes: (document.getElementById('expenseNotes')?.value || '').trim(),
      item_id,
    };
    if (!body.date || !body.amount) return toast('Заполните все поля','warning');
    if (!catId) return toast('Выберите категорию','warning');
    try {
      if (id) await apiFetch(`/api/expenses/${id}`,{method:'PUT',body:JSON.stringify(body)});
      else await apiFetch('/api/expenses',{method:'POST',body:JSON.stringify(body)});
      bootstrap.Modal.getInstance('#expenseModal')?.hide();
      toast('Сохранено');
      await App.Dashboard.loadPL();
    } catch(e) { toast(e.message,'danger'); }
  },
  async del(id) {
    if (!confirm('Удалить запись?')) return;
    try { await apiFetch(`/api/expenses/${id}`,{method:'DELETE'}); toast('Удалено'); await App.Dashboard.loadPL(); }
    catch(e) { toast(e.message,'danger'); }
  },
};


// ─── EXPENSE CATEGORIES ───────────────────────────────────────────────────────

App.ExpCat = {
  data: [],
  async load() {
    this.data = await apiFetch('/api/expense-categories');
    this._render('expense', 'expCatExpense');
    this._render('income', 'expCatIncome');
  },
  _render(type, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const cats = this.data.filter(c => c.type === type);
    el.innerHTML = cats.length ? cats.map(c => `
      <div class="cat-group">
        <div class="cat-group-header">
          <i class="bi bi-tag me-1"></i>${c.name}
          <span class="ms-auto d-flex gap-1">
            <button class="btn-icon" onclick="App.ExpCat.openAddItem(${c.id},'${c.name}')"><i class="bi bi-plus-lg"></i></button>
            ${btnIcon('pencil','Ред.',`App.ExpCat.openEditCat(${c.id})`)}
            ${btnIcon('trash','Удалить',`App.ExpCat.deleteCat(${c.id})`,true)}
          </span>
        </div>
        <div class="cat-items">
          ${c.items.length ? c.items.map(i => `
            <div class="cat-item">
              <i class="bi bi-dot text-muted"></i>
              <span class="flex-grow-1">${i.name}</span>
              ${btnIcon('pencil','Ред.',`App.ExpCat.openEditItem(${i.id},${c.id},'${i.name}')`)}
              ${btnIcon('trash','Удалить',`App.ExpCat.deleteItem(${i.id})`,true)}
            </div>`).join('') : '<p class="text-muted small mb-0 ps-2">Нет подстатей</p>'}
        </div>
      </div>`).join('') : '<p class="text-muted small p-2">Нет категорий</p>';
  },
  openAdd() {
    document.getElementById('expCatId').value = '';
    document.getElementById('expCatName').value = '';
    document.getElementById('expCatType').value = 'expense';
    document.getElementById('expCatModalTitle').textContent = 'Новая категория';
    new bootstrap.Modal('#expCatModal').show();
  },
  openEditCat(id) {
    const c = this.data.find(x => x.id === id);
    if (!c) return;
    document.getElementById('expCatId').value = c.id;
    document.getElementById('expCatName').value = c.name;
    document.getElementById('expCatType').value = c.type;
    document.getElementById('expCatModalTitle').textContent = 'Редактировать категорию';
    new bootstrap.Modal('#expCatModal').show();
  },
  async saveCategory() {
    const id = document.getElementById('expCatId').value;
    const body = { type: document.getElementById('expCatType').value, name: document.getElementById('expCatName').value.trim() };
    if (!body.name) return toast('Введите название','warning');
    try {
      if (id) await apiFetch(`/api/expense-categories/${id}`,{method:'PUT',body:JSON.stringify(body)});
      else await apiFetch('/api/expense-categories',{method:'POST',body:JSON.stringify(body)});
      bootstrap.Modal.getInstance('#expCatModal')?.hide();
      toast('Сохранено'); await this.load();
    } catch(e) { toast(e.message,'danger'); }
  },
  async deleteCat(id) {
    if (!confirm('Удалить категорию со всеми подстатьями?')) return;
    try { await apiFetch(`/api/expense-categories/${id}`,{method:'DELETE'}); toast('Удалено'); await this.load(); }
    catch(e) { toast(e.message,'danger'); }
  },
  openAddItem(catId, catName) {
    document.getElementById('expItemId').value = '';
    document.getElementById('expItemCatId').value = catId;
    document.getElementById('expItemName').value = '';
    document.getElementById('expItemModalTitle').textContent = `Подстатья → ${catName}`;
    new bootstrap.Modal('#expItemModal').show();
  },
  openEditItem(id, catId, name) {
    document.getElementById('expItemId').value = id;
    document.getElementById('expItemCatId').value = catId;
    document.getElementById('expItemName').value = name;
    document.getElementById('expItemModalTitle').textContent = 'Редактировать подстатью';
    new bootstrap.Modal('#expItemModal').show();
  },
  async saveItem() {
    const id = document.getElementById('expItemId').value;
    const body = { category_id: +document.getElementById('expItemCatId').value, name: document.getElementById('expItemName').value.trim() };
    if (!body.name) return toast('Введите название','warning');
    try {
      if (id) await apiFetch(`/api/expense-items/${id}`,{method:'PUT',body:JSON.stringify(body)});
      else await apiFetch('/api/expense-items',{method:'POST',body:JSON.stringify(body)});
      bootstrap.Modal.getInstance('#expItemModal')?.hide();
      toast('Сохранено'); await this.load();
    } catch(e) { toast(e.message,'danger'); }
  },
  async deleteItem(id) {
    if (!confirm('Удалить подстатью?')) return;
    try { await apiFetch(`/api/expense-items/${id}`,{method:'DELETE'}); toast('Удалено'); await this.load(); }
    catch(e) { toast(e.message,'danger'); }
  },
};

// ─── BULK DELETE ────────────────────────────────────────────────────────────

App.BulkDelete = {
  _context: null, // { type: 'geos'|'agents'|'undefined', ids: [] }

  update(type, checkClass) {
    const checked = document.querySelectorAll(`.${checkClass}:checked`);
    const ids = [...checked].map(cb => parseInt(cb.value));
    const toolbar = document.getElementById('bulkToolbar');
    if (ids.length > 0) {
      this._context = { type, ids, checkClass };
      document.getElementById('bulkCount').textContent = ids.length;
      toolbar.classList.remove('d-none');
    } else {
      this._context = null;
      toolbar.classList.add('d-none');
    }
  },

  cancel() {
    if (this._context) {
      document.querySelectorAll(`.${this._context.checkClass}`).forEach(cb => cb.checked = false);
      const allCheck = document.getElementById(`${this._context.type === 'undefined' ? 'undefined' : this._context.type.replace('s','').replace('geo','geo').replace('agent','agent')}CheckAll`);
      if (allCheck) allCheck.checked = false;
    }
    this._context = null;
    document.getElementById('bulkToolbar').classList.add('d-none');
  },

  async execute() {
    if (!this._context) return;
    const { type, ids } = this._context;
    if (!confirm(`Удалить ${ids.length} записей?`)) return;
    const endpoint = type === 'undefined' ? '/api/adsets' : `/api/${type}`;
    let ok = 0;
    for (const id of ids) {
      try { await apiFetch(`${endpoint}/${id}`, { method: 'DELETE' }); ok++; } catch {}
    }
    toast(`Удалено: ${ok} из ${ids.length}`);
    this.cancel();
    if (type === 'geos') App.Geos.load();
    else if (type === 'agents') App.Agents.load();
    else if (type === 'undefined') { App.Undefined.load(); checkUndefined(); }
  },
};

// ─── P&L STANDALONE SECTION ──────────────────────────────────────────────────

App.PL = {
  init() {
    // Ensure Flatpickr on P&L date inputs
    if (typeof flatpickr !== 'undefined') {
      ['plFrom','plTo'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el._flatpickr) flatpickr(el, { dateFormat: 'Y-m-d', allowInput: true, disableMobile: true });
      });
    }
    App.Dashboard.loadPL();
    this.switchTab('records');
  },
  switchTab(tab) {
    ['records','categories','analytics'].forEach(t => {
      document.getElementById(`pl-${t}`)?.classList.toggle('d-none', t !== tab);
    });
    document.querySelectorAll('#plTab .nav-link').forEach(b => b.classList.toggle('active', b.dataset.pltab === tab));
    if (tab === 'categories') App.ExpCat.load();
    if (tab === 'analytics') this.loadAnalytics();
  },
  async loadAnalytics() {
    const container = document.getElementById('pl-analytics');
    if (!container) return;
    showSkeleton('plAnalyticsContent', 3);
    try {
      const data = await apiFetch('/api/pl/analytics');
      const labels = data.map(d => d.month);
      const incomeData = data.map(d => d.income);
      const expenseData = data.map(d => d.expenses);

      document.getElementById('plAnalyticsContent').innerHTML = `
        <div class="row mb-3">
          ${data.slice(-1).map(d => `
            <div class="col-md-4"><div class="metric-card"><div class="metric-value" style="color:#10b981">$${fmt(d.income)}</div><div class="metric-label">Доход (тек. месяц)</div></div></div>
            <div class="col-md-4"><div class="metric-card"><div class="metric-value" style="color:#ef4444">$${fmt(d.expenses)}</div><div class="metric-label">Расход (тек. месяц)</div></div></div>
            <div class="col-md-4"><div class="metric-card"><div class="metric-value" style="color:${d.net>=0?'#10b981':'#ef4444'}">${d.net>=0?'+':''}$${fmt(Math.abs(d.net))}</div><div class="metric-label">Нетто (тек. месяц)</div></div></div>
          `).join('')}
        </div>
        <div class="row">
          <div class="col-lg-7"><div class="card p-3"><div id="plTrendChart"></div></div></div>
          <div class="col-lg-5"><div class="card p-3"><div id="plCatBarChart"></div></div></div>
        </div>`;

      // Trend line chart
      if (window._plTrendChart) window._plTrendChart.destroy();
      window._plTrendChart = new ApexCharts(document.getElementById('plTrendChart'), {
        chart: { type: 'area', height: 280, toolbar: { show: false }, fontFamily: 'Inter' },
        series: [
          { name: 'Доход', data: incomeData },
          { name: 'Расход', data: expenseData },
        ],
        xaxis: { categories: labels },
        colors: ['#10b981', '#ef4444'],
        stroke: { curve: 'smooth', width: 2 },
        fill: { type: 'gradient', gradient: { opacityFrom: 0.35, opacityTo: 0.05 } },
        dataLabels: { enabled: false },
        legend: { position: 'top', fontSize: '11px' },
        grid: { borderColor: '#edf0f5', strokeDashArray: 3 },
        tooltip: { y: { formatter: v => '$' + fmt(v) } },
      });
      window._plTrendChart.render();

      // Category bar chart (last month)
      const lastMonth = data[data.length - 1];
      const cats = lastMonth?.categories?.filter(c => c.total > 0) || [];
      if (cats.length && document.getElementById('plCatBarChart')) {
        if (window._plCatBarChart) window._plCatBarChart.destroy();
        window._plCatBarChart = new ApexCharts(document.getElementById('plCatBarChart'), {
          chart: { type: 'bar', height: 280, toolbar: { show: false }, fontFamily: 'Inter' },
          series: [{ name: 'Сумма', data: cats.map(c => c.total) }],
          xaxis: { categories: cats.map(c => c.name || 'Прочее') },
          colors: ['#6366f1'],
          plotOptions: { bar: { borderRadius: 6, horizontal: true } },
          dataLabels: { enabled: true, formatter: v => '$' + fmt(v), style: { fontSize: '11px' } },
          grid: { borderColor: '#edf0f5' },
          tooltip: { y: { formatter: v => '$' + fmt(v) } },
        });
        window._plCatBarChart.render();
      }
    } catch(e) { toast(e.message, 'danger'); }
  },
};

// ─── ACTIVITY LOG ────────────────────────────────────────────────────────────

App.ActivityLog = {
  async load() {
    try {
      const data = await apiFetch('/api/activity-log');
      const el = document.getElementById('activityLogContent');
      if (!data.length) {
        el.innerHTML = '<div class="text-center py-5"><i class="bi bi-clock-history" style="font-size:2.5rem;color:var(--text-muted);opacity:.3"></i><p class="text-muted mt-2">Нет записей в журнале</p></div>';
        return;
      }
      el.innerHTML = `<div class="table-responsive"><table class="table table-sm crm-table"><thead><tr>
        <th>Время</th><th>Пользователь</th><th>Действие</th><th>Детали</th>
      </tr></thead><tbody>${data.map(r => `<tr>
        <td class="text-muted small">${r.created_at}</td>
        <td class="fw-medium">${r.username}</td>
        <td><span class="badge bg-secondary" style="font-size:.65rem">${r.action}</span></td>
        <td class="small">${r.details || '—'}</td>
      </tr>`).join('')}</tbody></table></div>`;
    } catch {
      document.getElementById('activityLogContent').innerHTML = '<div class="text-center py-5"><i class="bi bi-clock-history" style="font-size:2.5rem;color:var(--text-muted);opacity:.3"></i><p class="text-muted mt-2">Нет записей в журнале</p></div>';
    }
  },
};

// ─── NOTIFICATIONS ──────────────────────────────────────────────────────────

App.Notifications = {
  _interval: null,
  init() {
    const user = getUser();
    if (user?.role === 'operator') {
      document.getElementById('sidebarNotifs')?.classList.add('d-none');
      return;
    }
    this.check();
    if (this._interval) clearInterval(this._interval);
    this._interval = setInterval(() => this.check(), 30000);
  },
  _pendingCount: 0,
  _undefCount: 0,
  async check() {
    try {
      const pending = await apiFetch('/api/deposits/pending');
      this._pendingCount = pending.length;
    } catch { this._pendingCount = 0; }
    try {
      const undef = await apiFetch('/api/adsets?undefined_only=true');
      this._undefCount = undef.length;
    } catch { this._undefCount = 0; }
    const count = this._pendingCount + this._undefCount;
    const badge = document.getElementById('notifBadge');
    if (count > 0) {
      badge.textContent = count;
      badge.classList.remove('d-none');
    } else {
      badge.classList.add('d-none');
    }
  },
  onClick() {
    const dd = document.getElementById('notifDropdown');
    if (dd) { dd.classList.toggle('d-none'); this._renderDropdown(); return; }
    // Fallback
    showSection('dictionaries'); switchDict('undefined');
  },
  _renderDropdown() {
    const dd = document.getElementById('notifDropdown');
    if (!dd) return;
    let html = '';
    if (this._undefCount > 0) {
      html += `<a class="dropdown-item d-flex align-items-center gap-2 py-2" href="#" onclick="showSection('dictionaries');switchDict('undefined');document.getElementById('notifDropdown').classList.add('d-none');return false">
        <i class="bi bi-question-circle text-warning"></i>
        <div><div class="small fw-medium">${this._undefCount} неопознанных адсетов</div><div class="text-muted" style="font-size:.7rem">Требуют привязки</div></div>
      </a>`;
    }
    if (this._pendingCount > 0) {
      html += `<a class="dropdown-item d-flex align-items-center gap-2 py-2" href="#" onclick="showSection('deposits');document.getElementById('notifDropdown').classList.add('d-none');return false">
        <i class="bi bi-hourglass-split text-info"></i>
        <div><div class="small fw-medium">${this._pendingCount} ожидающих FD/RD</div><div class="text-muted" style="font-size:.7rem">Нужно подтвердить</div></div>
      </a>`;
    }
    if (!html) html = '<div class="text-muted small text-center py-3">Нет уведомлений</div>';
    dd.innerHTML = html;
  },
};

// ─── EXPORT ─────────────────────────────────────────────────────────────────

App.Export = {
  toCSV(tableId, filename) {
    const table = document.getElementById(tableId);
    if (!table) return toast('Таблица не найдена','warning');
    const rows = [];
    table.querySelectorAll('tr').forEach(tr => {
      const cells = [];
      tr.querySelectorAll('th, td').forEach(td => {
        cells.push('"' + (td.textContent || '').trim().replace(/"/g, '""') + '"');
      });
      rows.push(cells.join(';'));
    });
    const csv = '\uFEFF' + rows.join('\n'); // BOM for Excel
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (filename || 'export') + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast('Экспортировано в CSV');
  },
};

// ─── KEYBOARD SHORTCUTS ─────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); App.Expenses.openAdd(); }
    if (e.key === '1') { e.preventDefault(); showSection('dashboard'); }
    if (e.key === '2') { e.preventDefault(); showSection('statistics'); }
    if (e.key === '3') { e.preventDefault(); showSection('deposits'); }
    if (e.key === '4') { e.preventDefault(); showSection('pl'); }
  }
});

// ─── FUNNEL ─────────────────────────────────────────────────────────────────

App.Funnel = {
  async load(from, to) {
    const p = [];
    if (from) p.push(`from=${from}`);
    if (to) p.push(`to=${to}`);
    try {
      const data = await apiFetch('/api/statistics/geos' + (p.length ? '?' + p.join('&') : ''));
      // Aggregate totals
      let pdp = 0, dialogs = 0, regs = 0, deps = 0, redeps = 0;
      data.forEach(r => { pdp += r.pdp||0; dialogs += r.dialogs||0; regs += r.registrations||0; deps += r.deposits_count||0; redeps += r.redeposits_count||0; });
      return { pdp, dialogs, regs, deps, redeps };
    } catch { return { pdp: 0, dialogs: 0, regs: 0, deps: 0, redeps: 0 }; }
  },
  render(containerId, data) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const max = Math.max(data.pdp, 1);
    const steps = [
      { label: 'Sub', value: data.pdp, color: '#3b82f6' },
      { label: 'Dia', value: data.dialogs, color: '#6366f1', pct: data.pdp ? (data.dialogs/data.pdp*100).toFixed(1) : 0 },
      { label: 'Reg', value: data.regs, color: '#8b5cf6', pct: data.dialogs ? (data.regs/data.dialogs*100).toFixed(1) : 0 },
      { label: 'FD', value: data.deps, color: '#10b981', pct: data.regs ? (data.deps/data.regs*100).toFixed(1) : 0 },
      { label: 'RD', value: data.redeps, color: '#f59e0b', pct: data.deps ? (data.redeps/data.deps*100).toFixed(1) : 0 },
    ];
    el.innerHTML = steps.map((s, i) => `
      <div class="funnel-step">
        <div class="funnel-label">${s.label}</div>
        <div class="flex-grow-1"><div class="funnel-bar" style="width:${Math.max(s.value/max*100, 3)}%;background:${s.color}"></div></div>
        <div class="funnel-value">${fmtInt(s.value)}</div>
        ${i > 0 ? `<div class="funnel-pct">${s.pct}%</div>` : '<div class="funnel-pct"></div>'}
      </div>${i < steps.length - 1 ? '<div class="funnel-arrow text-center"><i class="bi bi-arrow-down"></i></div>' : ''}`
    ).join('');
  },
};

// ─── ROI CALCULATOR ────────────────────────────────────────────────────────

App.ROICalc = {
  toggle() {
    const modal = document.getElementById('roiCalcModal');
    if (modal) new bootstrap.Modal(modal).show();
  },
  calculate() {
    const spend = parseFloat(document.getElementById('roiSpend')?.value) || 0;
    const deposits = parseFloat(document.getElementById('roiDeposits')?.value) || 0;
    const depCount = parseInt(document.getElementById('roiDepCount')?.value) || 0;
    const profit = deposits - spend;
    const roi = spend > 0 ? ((profit / spend) * 100) : 0;
    const costPerDep = depCount > 0 ? (spend / depCount) : 0;
    document.getElementById('roiResult').innerHTML = `
      <div class="d-flex gap-3 mt-3">
        <div class="flex-fill text-center p-2 rounded" style="background:var(--bg-muted)">
          <div class="small text-muted">Прибыль</div>
          <div class="fw-bold ${profit>=0?'text-success':'text-danger'}">${profit>=0?'+':''}$${fmt(Math.abs(profit))}</div>
        </div>
        <div class="flex-fill text-center p-2 rounded" style="background:var(--bg-muted)">
          <div class="small text-muted">ROI</div>
          <div class="fw-bold ${roi>=0?'text-success':'text-danger'}">${roi.toFixed(1)}%</div>
        </div>
        <div class="flex-fill text-center p-2 rounded" style="background:var(--bg-muted)">
          <div class="small text-muted">$ДЕП</div>
          <div class="fw-bold">$${fmt(costPerDep)}</div>
        </div>
      </div>`;
  },
};

// ─── BOOT ─────────────────────────────────────────────────────────────────────

// App must be defined before referencing it
var App = App || {};

App.Auth.init();
