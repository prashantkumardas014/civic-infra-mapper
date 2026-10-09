/* ========================================================================
   common.js — Nav, API helper, categories, badges, realtime, utilities
   Loaded by every page BEFORE page-specific scripts.
   ======================================================================== */

const CATEGORIES = [
  { id: 'Road', label: 'Road' },
  { id: 'Footpath', label: 'Footpath' },
  { id: 'Drainage', label: 'Drainage' },
  { id: 'Streetlight', label: 'Streetlight' },
  { id: 'Waste', label: 'Waste' },
  { id: 'Water Supply', label: 'Water Supply' },
  { id: 'Public Space', label: 'Public Space' },
  { id: 'Other', label: 'Other' }
];

const CATEGORY_DETAILS = {
  Road: { icon: '🛣️', color: '#2563eb' },
  Footpath: { icon: '🚶', color: '#14b8a6' },
  Drainage: { icon: '🌊', color: '#0891b2' },
  Streetlight: { icon: '💡', color: '#f59e0b' },
  Waste: { icon: '🗑️', color: '#22c55e' },
  'Water Supply': { icon: '🚰', color: '#0ea5e9' },
  'Public Space': { icon: '🌳', color: '#16a34a' },
  Other: { icon: '📍', color: '#64748b' }
};

/* ---------- Nav (idempotent) ---------- */
function renderNav(activePage) {
  const pages = [
    { id: 'dashboard', label: 'Dashboard', href: 'index.html' },
    { id: 'report', label: 'Report Issue', href: 'report.html' },
    { id: 'reports', label: 'All Reports', href: 'reports.html' },
    { id: 'survey', label: 'Survey', href: 'survey.html' },
    { id: 'admin', label: 'Admin', href: 'admin.html' },
    { id: 'account', label: 'Account', href: 'account.html' }
  ];

  const existing = document.querySelector('nav.top-nav');
  if (existing) existing.remove();

  const isDark = document.documentElement.dataset.theme === 'dark';

  const nav = document.createElement('nav');
  nav.className = 'top-nav';
  nav.innerHTML = `
    <div class="nav-inner">
      <a class="brand" href="index.html">
        <span class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="22" height="22" xmlns="http://www.w3.org/2000/svg" fill="none">
            <path d="M6 7l6-2 8 3 6-2v18l-6 2-8-3-6 2V7z" fill="#f8fafc" stroke="#cbd5e1" stroke-width="0.6"/>
            <path d="M12 5v18" stroke="#cbd5e1" stroke-width="0.6"/>
            <path d="M20 8v18" stroke="#cbd5e1" stroke-width="0.6"/>
            <path d="M10 11c1-1 2-1 3 0s2 1 3 0 2-1 3 0 2 1 3 0M9 16c1.2-1.2 2.4-1.2 3.5 0s2.3 1.2 3.5 0 2.3-1.2 3.5 0 2.3 1.2 3.5 0M10 21c1-1 2-1 3 0s2 1 3 0 2-1 3 0 2 1 3 0" stroke="#22c55e" stroke-width="1.1" stroke-linecap="round" fill="none"/>
          </svg>
        </span>
        <span>Civic Infra Mapper</span>
      </a>
      <div class="nav-links">
        ${pages.map((page) => `<a href="${page.href}"${page.id === activePage ? ' class="active" aria-current="page"' : ''}>${page.label}</a>`).join('')}
        <button type="button" id="themeToggle" class="btn btn-secondary" style="padding:.5rem .7rem; font-size:.95rem; margin-left:.25rem;" aria-label="Toggle dark mode" title="Toggle dark mode">${isDark ? '☀️' : '🌙'}</button>
      </div>
    </div>
  `;
  const app = document.getElementById('app');
  app.parentNode.insertBefore(nav, app);

  document.getElementById('themeToggle')?.addEventListener('click', (e) => {
    toggleTheme();
    e.currentTarget.textContent = document.documentElement.dataset.theme === 'dark' ? '☀️' : '🌙';
  });

  // Mount the auth badge next to the brand name
  mountAuthBadge();
}

/* ---------- Theme ---------- */
(function initTheme() {
  const saved = localStorage.getItem('civic-theme');
  if (saved === 'dark' || saved === 'light') {
    document.documentElement.dataset.theme = saved;
  }
})();

function toggleTheme() {
  const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('civic-theme', next);
}

/* ---------- API helper (cross-origin aware) ---------- */
async function api(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const base = window.CIVIC_API_BASE || '';
  const fullUrl = url.startsWith('http') ? url : base + url;

  const response = await fetch(fullUrl, {
    ...options,
    headers,
    credentials: 'include'
  });

  const contentType = response.headers.get('content-type') || '';
  const result = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = result && typeof result === 'object'
      ? result.error
      : contentType.includes('text/html')
        ? `Server endpoint ${url} was not found. Restart the updated backend with "npm start" from the project folder.`
        : result;
    throw new Error(message || `Request failed (${response.status})`);
  }

  return result;
}

/* ---------- Category helpers ---------- */
function normalizeCategoryValue(value) {
  const raw = String(value || '').trim().toLowerCase();
  const aliases = {
    roads: 'Road',
    road: 'Road',
    footpaths: 'Footpath',
    footpath: 'Footpath',
    drainage: 'Drainage',
    streetlights: 'Streetlight',
    streetlight: 'Streetlight',
    waste: 'Waste',
    water: 'Water Supply',
    'water supply': 'Water Supply',
    'public space': 'Public Space',
    other: 'Other'
  };
  return aliases[raw] || String(value || 'Other').trim();
}

function catInfo(category) {
  const normalized = normalizeCategoryValue(category);
  const details = CATEGORY_DETAILS[normalized] || CATEGORY_DETAILS.Other;
  return { label: normalized, ...details };
}

function getMapCenter() {
  return [20.2738, 73.0169];
}

/* ---------- Badges ---------- */
function renderStatusBadge(status) {
  const value = status || 'Pending';
  const className = value.toLowerCase().replaceAll(' ', '-');
  return `<span class="status-badge ${className}">${value}</span>`;
}

function renderSeverityBadge(severity) {
  const value = severity || 'Medium';
  return `<span class="severity-badge ${value.toLowerCase()}">${value}</span>`;
}

/* ---------- Time ---------- */
function timeAgo(value) {
  if (!value) return 'Unknown date';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(value);

  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days} day${days === 1 ? '' : 's'} ago` : date.toLocaleDateString();
}

/* Auto-updating timestamps — every 30s, refresh any <time data-timestamp="..."> */
setInterval(() => {
  document.querySelectorAll('time[data-timestamp]').forEach((el) => {
    el.textContent = timeAgo(el.dataset.timestamp);
  });
}, 30000);

/* ---------- Realtime ---------- */
function connectRealtime(onEvent) {
  let channel = null;
  let disposed = false;

  function showRealtimeError(message) {
    let notice = document.getElementById('realtimeError');
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'realtimeError';
      notice.className = 'page-shell';
      notice.setAttribute('role', 'alert');
      const alert = document.createElement('div');
      alert.className = 'alert error';
      notice.appendChild(alert);
      document.getElementById('app').prepend(notice);
    }
    notice.firstElementChild.textContent = `Live database updates are unavailable: ${message}`;
  }

  const events = {
    unsubscribe() {
      disposed = true;
      if (channel) channel.unsubscribe();
    }
  };

  api('/api/config')
    .then((config) => {
      if (disposed) return;
      if (!window.supabase || !config.supabaseUrl || !config.supabaseAnonKey) {
        throw new Error('Supabase Realtime is not configured. Check the public Supabase URL and anon key.');
      }

      const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
      channel = client
        .channel('civic-live-updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, (payload) => {
          const eventType = {
            INSERT: 'report.created',
            UPDATE: 'report.updated',
            DELETE: 'report.deleted'
          }[payload.eventType];
          onEvent({ type: eventType, data: payload.new || payload.old });
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'surveys' }, (payload) => {
          onEvent({ type: 'survey.created', data: payload.new });
        })
        .subscribe((status, error) => {
          if (status === 'SUBSCRIBED') {
            document.getElementById('realtimeError')?.remove();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            const message = error && error.message ? error.message : status;
            console.error('Supabase Realtime connection failed:', error || status);
            showRealtimeError(message);
          }
        });
    })
    .catch((error) => {
      console.error('Could not initialize Supabase Realtime:', error);
      showRealtimeError(error.message);
    });

  return events;
}

/* ========================================================================
   FEATURE: Web Share API
   ======================================================================== */
async function shareReport(report) {
  const url = `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}reports.html?id=${report.id}`;
  const text = `${report.category} issue: ${String(report.description).slice(0, 120)}…`;

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Civic Report', text, url });
      return true;
    } catch (_) { /* user cancelled */ }
  }

  try {
    await navigator.clipboard.writeText(url);
    showToast('Link copied to clipboard!', 'success');
    return true;
  } catch {
    prompt('Copy this link:', url);
    return false;
  }
}

/* ========================================================================
   FEATURE: Photo lightbox
   ======================================================================== */
function openPhotoLightbox(url) {
  const overlay = document.createElement('div');
  overlay.id = 'photoLightbox';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 99999;
    background: rgba(15, 23, 42, .92);
    display: flex; align-items: center; justify-content: center;
    cursor: zoom-out; padding: 24px;
  `;
  overlay.innerHTML = `
    <img src="${url}" alt="Report photo"
      style="max-width: 100%; max-height: 100%; border-radius: 12px;
             box-shadow: 0 20px 60px rgba(0,0,0,.5);" />
    <button type="button" aria-label="Close"
      style="position: absolute; top: 20px; right: 20px;
             width: 44px; height: 44px; border-radius: 50%;
             background: rgba(255,255,255,.15); color: white;
             border: 1px solid rgba(255,255,255,.3);
             font-size: 1.5rem; cursor: pointer; line-height: 1;">×</button>
  `;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.tagName === 'BUTTON') overlay.remove();
  });
  const onKey = (e) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
}

document.addEventListener('click', (e) => {
  const img = e.target.closest('img[data-lightbox]');
  if (!img) return;
  e.preventDefault();
  openPhotoLightbox(img.dataset.lightbox || img.src);
});

/* ========================================================================
   FEATURE: Toast notifications
   Usage: showToast('Saved!', 'success')
   ======================================================================== */
function showToast(message, type = 'info', duration = 3000) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.cssText = `
      position: fixed; top: 78px; right: 16px; z-index: 100000;
      display: flex; flex-direction: column; gap: .5rem;
      pointer-events: none; max-width: 360px;
    `;
    document.body.appendChild(container);
  }

  const colors = {
    info:    { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af', icon: 'ℹ️' },
    success: { bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46', icon: '✅' },
    error:   { bg: '#fef2f2', border: '#fecaca', text: '#991b1b', icon: '❌' },
    warning: { bg: '#fffbeb', border: '#fde68a', text: '#92400e', icon: '⚠️' }
  };
  const c = colors[type] || colors.info;

  const toast = document.createElement('div');
  toast.style.cssText = `
    pointer-events: auto;
    background: ${c.bg};
    border: 1px solid ${c.border};
    color: ${c.text};
    padding: .8rem 1rem;
    border-radius: 10px;
    font-weight: 600;
    font-size: .9rem;
    box-shadow: 0 10px 25px rgba(0,0,0,.08);
    display: flex;
    align-items: center;
    gap: .5rem;
    opacity: 0;
    transform: translateX(20px);
    transition: opacity .2s, transform .2s;
  `;
  toast.innerHTML = `<span style="font-size:1.1rem;">${c.icon}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(0)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

/* ========================================================================
   FEATURE: Form draft autosave
   Usage: attachFormDraft('reportForm', 'civic-draft-report')
   ======================================================================== */
function attachFormDraft(formId, storageKey) {
  const form = document.getElementById(formId);
  if (!form) return;

  // Restore
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && typeof saved === 'object') {
      const restored = [];
      Object.entries(saved).forEach(([name, value]) => {
        const fields = form.querySelectorAll(`[name="${name}"]`);
        if (!fields.length) return;
        const first = fields[0];
        if (first.type === 'radio') {
          const target = form.querySelector(`[name="${name}"][value="${value}"]`);
          if (target) target.checked = true;
        } else if (first.type === 'checkbox') {
          first.checked = !!value;
        } else {
          first.value = value;
        }
        restored.push(name);
      });
      if (restored.length) {
        showToast('Draft restored', 'info', 2000);
      }
    }
  } catch (_) { /* ignore */ }

  // Save on change
  let saveTimer;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const data = Object.fromEntries(new FormData(form).entries());
        delete data.photo;
        localStorage.setItem(storageKey, JSON.stringify(data));
      } catch (_) { /* ignore */ }
    }, 400);
  };
  form.addEventListener('input', save);
  form.addEventListener('change', save);

  // Clear on submit
  form.addEventListener('submit', () => {
    try { localStorage.removeItem(storageKey); } catch (_) {}
  });
}

/* ========================================================================
   FEATURE: Button loading state
   Usage: withLoading(button, async () => {...}, 'Submitting...')
   ======================================================================== */
async function withLoading(button, fn, loadingText = 'Working...') {
  if (!button) return fn();
  const originalText = button.textContent;
  const originalDisabled = button.disabled;
  button.disabled = true;
  button.innerHTML = `<span style="display:inline-block; width:14px; height:14px; border:2px solid currentColor; border-top-color:transparent; border-radius:50%; animation: civicSpin .7s linear infinite; vertical-align:-2px; margin-right:.4rem;"></span>${escapeHtml(loadingText)}`;
  try {
    return await fn();
  } finally {
    button.disabled = originalDisabled;
    button.textContent = originalText;
  }
}

/* Spin animation — inject once */
if (!document.getElementById('civicSpinStyle')) {
  const style = document.createElement('style');
  style.id = 'civicSpinStyle';
  style.textContent = '@keyframes civicSpin { to { transform: rotate(360deg); } }';
  document.head.appendChild(style);
}

/* ========================================================================
   FEATURE: Keyboard shortcuts
   ======================================================================== */
document.addEventListener('keydown', (e) => {
  const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

  // "/" focuses the first search input
  if (e.key === '/' && !inField) {
    const search = document.querySelector('input[type="search"], input[id*="earch"]');
    if (search) {
      e.preventDefault();
      search.focus();
    }
  }
});

/* ========================================================================
   FEATURE: Auth badge in navbar
   ======================================================================== */
async function mountAuthBadge() {
  try {
    const { user } = await api('/api/auth/me');
    const brand = document.querySelector('.brand');
    if (!brand) return;

    // Remove existing badge
    document.getElementById('authBadge')?.remove();

    const badge = document.createElement('a');
    badge.id = 'authBadge';
    badge.href = 'account.html';
    badge.style.cssText = `
      margin-left: 1rem;
      padding: .35rem .75rem;
      border-radius: 999px;
      font-size: .8rem;
      font-weight: 600;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: .35rem;
      white-space: nowrap;
      transition: filter .15s;
    `;

    if (user) {
      const initial = (user.name || user.email || '?').trim().charAt(0).toUpperCase();
      badge.style.background = 'rgba(34, 197, 94, .12)';
      badge.style.color = '#16a34a';
      badge.innerHTML = `
        <span style="
          display:inline-grid; place-items:center;
          width: 20px; height: 20px; border-radius: 50%;
          background:#22c55e; color:white; font-size:.7rem;
        ">${escapeHtml(initial)}</span>
        <span>${escapeHtml(user.name || user.email)}</span>
      `;
      badge.title = `Signed in as ${user.email} (${user.role})`;
    } else {
      badge.style.background = 'rgba(37, 99, 235, .1)';
      badge.style.color = '#2563eb';
      badge.innerHTML = `<span>👤</span><span>Sign in</span>`;
      badge.title = 'Sign in or create an account';
    }

    brand.parentNode.insertBefore(badge, brand.nextSibling);
  } catch (_) { /* ignore */ }
}

/* ---------- HTML escaping ---------- */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}