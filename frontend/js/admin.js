/* ========================================================================
   admin.js — Admin panel: list, filter, update status, delete reports
   ======================================================================== */

renderNav('admin');

const app = document.getElementById('app');
app.innerHTML = `
  <div class="page-shell">
    <header class="page-header">
      <h1>Admin Panel</h1>
      <p>Review and update civic reports. Changes sync live to the public report list.</p>
    </header>
    <div id="adminAccess" class="admin-list" aria-live="polite">Checking administrator access...</div>
  </div>
`;

const adminPageSize = 20;
let adminPage = 1;
let adminRequestId = 0;
let adminSearchTimer;

function renderAdminControls() {
  const container = document.getElementById('adminList');
  container.innerHTML = `
    <div class="card">
      <form id="adminFilters" class="filter-row" role="search">
        <div class="form-field filter-search">
          <label for="adminSearch">Search reports</label>
          <input id="adminSearch" type="search" maxlength="80" placeholder="Description, address, or reporter" autocomplete="off" />
        </div>
        <div class="form-field">
          <label for="adminStatus">Status</label>
          <select id="adminStatus">
            <option value="">All statuses</option>
            <option value="Pending">Pending</option>
            <option value="In Progress">In Progress</option>
            <option value="Resolved">Resolved</option>
          </select>
        </div>
        <div class="form-field">
          <label for="adminSeverity">Severity</label>
          <select id="adminSeverity">
            <option value="">All severities</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
      </form>
      <p id="adminReportCount" class="list-summary" aria-live="polite"></p>
      <div id="adminReportList" class="admin-list" aria-live="polite"></div>
      <div id="adminPagination" class="pagination" aria-label="Admin report pages"></div>
    </div>
  `;
  document.getElementById('adminFilters').addEventListener('submit', (event) => event.preventDefault());
  ['adminStatus', 'adminSeverity'].forEach((id) => {
    document.getElementById(id).addEventListener('change', () => loadAdminReports(1));
  });
  document.getElementById('adminSearch').addEventListener('input', () => {
    clearTimeout(adminSearchTimer);
    adminSearchTimer = setTimeout(() => loadAdminReports(1), 300);
  });
  document.getElementById('adminPagination').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-page]');
    if (button && !button.disabled) loadAdminReports(Number(button.dataset.page));
  });
}

async function initializeAdmin() {
  const access = document.getElementById('adminAccess');
  try {
    const { user } = await api('/api/auth/me');
    if (!user) {
      access.innerHTML = '<div class="alert">Sign in with an administrator account to manage reports. <a href="account.html">Open account</a></div>';
      return;
    }
    if (user.role !== 'admin') {
      access.innerHTML = '<div class="alert error">This account does not have administrator permissions.</div>';
      return;
    }

    access.id = 'adminList';
    access.innerHTML = '';
    renderAdminControls();
    await loadAdminReports();
    connectRealtime(() => loadAdminReports(adminPage));
  } catch (error) {
    access.innerHTML = `<div class="alert error">${escapeHtml(error.message)}</div>`;
  }
}

async function loadAdminReports(page = adminPage) {
  const search = document.getElementById('adminSearch').value.trim();
  const list = document.getElementById('adminReportList');
  const requestId = ++adminRequestId;

  if (search.length === 1) {
    list.innerHTML = '<div class="empty-state">Enter at least two characters to search.</div>';
    list.removeAttribute('aria-busy');
    document.getElementById('adminReportCount').textContent = '';
    document.getElementById('adminPagination').innerHTML = '';
    return;
  }

  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(adminPageSize),
    sort: 'newest'
  });
  if (search) params.set('q', search);
  const status = document.getElementById('adminStatus').value;
  const severity = document.getElementById('adminSeverity').value;
  if (status) params.set('status', status);
  if (severity) params.set('severity', severity);

  list.setAttribute('aria-busy', 'true');
  try {
    const result = await api(`/api/reports?${params.toString()}`);
    if (requestId !== adminRequestId) return;
    if (page > 1 && page > result.totalPages) return loadAdminReports(Math.max(1, result.totalPages));
    adminPage = result.page;
    renderAdminReports(result);
  } catch (error) {
    if (requestId !== adminRequestId) return;
    list.innerHTML = `<div class="alert error">${escapeHtml(error.message)}</div>`;
    document.getElementById('adminReportCount').textContent = '';
    document.getElementById('adminPagination').innerHTML = '';
  } finally {
    if (requestId === adminRequestId) list.removeAttribute('aria-busy');
  }
}

function renderAdminReports(result) {
  const list = document.getElementById('adminReportList');
  const reports = result.reports;
  document.getElementById('adminReportCount').textContent = result.total
    ? `Showing ${(result.page - 1) * result.pageSize + 1}–${Math.min(result.page * result.pageSize, result.total)} of ${result.total} reports`
    : '0 reports found';

  if (!reports.length) {
    list.innerHTML = '<div class="empty-state">No reports match the current filters.</div>';
    renderAdminPagination(result);
    return;
  }

  list.innerHTML = reports
    .map((report) => {
      const info = catInfo(report.category);
      const safeId = escapeHtml(report.id);
      return `
        <article class="admin-item">
          <div class="report-meta">
            <div class="report-header">
              <span class="category-pill">${info.icon} ${escapeHtml(report.category)}</span>
              ${renderStatusBadge(report.status)}
              ${renderSeverityBadge(report.severity)}
            </div>
            <small>${escapeHtml(timeAgo(report.created_at))}</small>
          </div>
          <h3>${escapeHtml(report.description)}</h3>
          <p><strong>Address:</strong> ${escapeHtml(report.address || 'Not specified')}</p>
          <p><strong>Reporter:</strong> ${escapeHtml(report.reporter_name || 'Anonymous')}</p>
          <div class="admin-actions">
            <button class="btn btn-secondary" type="button" data-action="Pending" data-id="${safeId}" ${report.status === 'Pending' ? 'disabled aria-pressed="true"' : ''}>Pending</button>
            <button class="btn btn-secondary" type="button" data-action="In Progress" data-id="${safeId}" ${report.status === 'In Progress' ? 'disabled aria-pressed="true"' : ''}>In Progress</button>
            <button class="btn btn-primary" type="button" data-action="Resolved" data-id="${safeId}" ${report.status === 'Resolved' ? 'disabled aria-pressed="true"' : ''}>Resolved</button>
            <button class="btn btn-danger" type="button" data-action="Delete" data-id="${safeId}">Delete</button>
          </div>
        </article>
      `;
    })
    .join('');
  renderAdminPagination(result);

  list.querySelectorAll('button[data-action]').forEach((button) => {
    button.addEventListener('click', () => updateAdminReport(button));
  });
}

function renderAdminPagination(result) {
  const pagination = document.getElementById('adminPagination');
  if (result.totalPages <= 1) {
    pagination.innerHTML = '';
    return;
  }
  pagination.innerHTML = `
    <button class="btn btn-secondary" type="button" data-page="${result.page - 1}" ${result.page <= 1 ? 'disabled' : ''}>Previous</button>
    <span>Page ${result.page} of ${result.totalPages}</span>
    <button class="btn btn-secondary" type="button" data-page="${result.page + 1}" ${result.page >= result.totalPages ? 'disabled' : ''}>Next</button>
  `;
}

async function updateAdminReport(button) {
  const action = button.dataset.action;
  const id = button.dataset.id;
  const card = button.closest('.admin-item');
  if (action === 'Delete' && !window.confirm('Delete this report and its uploaded photo? This cannot be undone.')) return;

  card.querySelectorAll('button').forEach((item) => { item.disabled = true; });
  button.textContent = action === 'Delete' ? 'Deleting…' : 'Saving…';
  try {
    if (action === 'Delete') {
      await api(`/api/reports/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } else {
      await api(`/api/reports/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: action })
      });
    }
    await loadAdminReports(adminPage);
  } catch (error) {
    button.textContent = action;
    card.querySelectorAll('button').forEach((item) => { item.disabled = false; });
    const notice = document.createElement('div');
    notice.className = 'alert error';
    notice.setAttribute('role', 'alert');
    notice.textContent = error.message;
    card.appendChild(notice);
  }
}

initializeAdmin();