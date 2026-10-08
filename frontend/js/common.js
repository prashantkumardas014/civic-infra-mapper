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

  const nav = document.createElement('nav');
  nav.className = 'top-nav';
  nav.innerHTML = `
    <div class="nav-inner">
      <a class="brand" href="index.html"><span class="brand-mark">🗺️</span><span>Civic Infra Mapper</span></a>
      <div class="nav-links">
        ${pages.map((page) => `<a href="${page.href}"${page.id === activePage ? ' class="active" aria-current="page"' : ''}>${page.label}</a>`).join('')}
      </div>
    </div>
  `;
  const app = document.getElementById('app');
  app.parentNode.insertBefore(nav, app);
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
    credentials: 'include'   // sends session cookie cross-origin
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