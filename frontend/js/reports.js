/* ========================================================================
   reports.js — Public "All Reports" list with filters + pagination
   ======================================================================== */

renderNav('reports');

const app = document.getElementById('app');
app.innerHTML = `
  <div class="page-shell">
    <header class="page-header">
      <h1>All Civic Reports</h1>
      <p>Search and explore community reports. New reports appear automatically.</p>
    </header>

    <div class="card">
      <form id="reportFilters" class="filter-row" role="search">
        <div class="form-field filter-search">
          <label for="reportSearch">Search reports</label>
          <input id="reportSearch" type="search" maxlength="80" placeholder="Description, address, or reporter" autocomplete="off" />
        </div>
        <div class="form-field">
          <label for="categoryFilter">Category</label>
          <select id="categoryFilter">
            <option value="">All categories</option>
            ${CATEGORIES.map((category) => `<option value="${category.id}">${category.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-field">
          <label for="statusFilter">Status</label>
          <select id="statusFilter">
            <option value="">All statuses</option>
            <option value="Pending">Pending</option>
            <option value="In Progress">In Progress</option>
            <option value="Resolved">Resolved</option>
          </select>
        </div>
        <div class="form-field">
          <label for="severityFilter">Severity</label>
          <select id="severityFilter">
            <option value="">All severities</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
        <div class="form-field">
          <label for="sortFilter">Sort by</label>
          <select id="sortFilter">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="severity">Highest severity</option>
          </select>
        </div>
      </form>
      <p id="reportCount" class="list-summary" aria-live="polite"></p>
      <div id="reportList" class="report-list" aria-live="polite"></div>
      <div id="reportPagination" class="pagination" aria-label="Report pages"></div>
    </div>
  </div>
`;

const reportPageSize = 20;
let currentPage = 1;
let latestRequest = 0;
let searchTimer;

function reportFilterParams(page) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(reportPageSize),
    sort: document.getElementById('sortFilter').value
  });
  const search = document.getElementById('reportSearch').value.trim();
  const category = document.getElementById('categoryFilter').value;
  const status = document.getElementById('statusFilter').value;
  const severity = document.getElementById('severityFilter').value;
  if (search) params.set('q', search);
  if (category) params.set('category', category);
  if (status) params.set('status', status);
  if (severity) params.set('severity', severity);
  return params;
}

async function loadReports(page = currentPage) {
  const search = document.getElementById('reportSearch').value.trim();
  const list = document.getElementById('reportList');
  const requestId = ++latestRequest;

  if (search.length === 1) {
    list.innerHTML = '<div class="empty-state">Enter at least two characters to search.</div>';
    list.removeAttribute('aria-busy');
    document.getElementById('reportCount').textContent = '';
    document.getElementById('reportPagination').innerHTML = '';
    return;
  }

  list.setAttribute('aria-busy', 'true');
  try {
    const result = await api(`/api/reports?${reportFilterParams(page).toString()}`);
    if (requestId !== latestRequest) return;
    if (page > 1 && page > result.totalPages) return loadReports(Math.max(1, result.totalPages));
    currentPage = result.page;
    renderReports(result);
  } catch (error) {
    if (requestId !== latestRequest) return;
    list.innerHTML = `<div class="alert error">${escapeHtml(error.message)}</div>`;
    document.getElementById('reportCount').textContent = '';
    document.getElementById('reportPagination').innerHTML = '';
  } finally {
    if (requestId === latestRequest) list.removeAttribute('aria-busy');
  }
}

function renderReports(result) {
  const list = document.getElementById('reportList');
  const reports = result.reports;
  document.getElementById('reportCount').textContent = result.total
    ? `Showing ${(result.page - 1) * result.pageSize + 1}–${Math.min(result.page * result.pageSize, result.total)} of ${result.total} reports`
    : '0 reports found';

  if (!reports.length) {
    list.innerHTML = '<div class="empty-state">No reports match the current filters.</div>';
    renderPagination(result);
    return;
  }

  list.innerHTML = reports
    .map((report) => {
      const info = catInfo(report.category);
      const photo = report.photo
        ? `<img src="${escapeHtml(report.photo)}" alt="Issue photo" loading="lazy" />`
        : `<div class="report-thumb-icon" aria-hidden="true">${info.icon}</div>`;
      const latitude = Number(report.latitude);
      const longitude = Number(report.longitude);
      const hasLocation = Number.isFinite(latitude) && Number.isFinite(longitude);

      return `
        <article class="report-card">
          <div class="report-thumb">${photo}</div>
          <div>
            <div class="report-meta">
              <div class="report-header">
                <span class="category-pill">${info.icon} ${escapeHtml(report.category)}</span>
                ${renderStatusBadge(report.status)}
                ${renderSeverityBadge(report.severity)}
              </div>
            </div>
            <h4>${escapeHtml(report.description)}</h4>
            <p><strong>Address:</strong> ${escapeHtml(report.address || 'Not specified')}</p>
            <p><strong>Reporter:</strong> ${escapeHtml(report.reporter_name || 'Anonymous')}</p>
            <p><strong>Reported:</strong> ${escapeHtml(timeAgo(report.created_at))}</p>
            <div class="map-pin-row">
              ${hasLocation
                ? `<a class="btn btn-secondary" href="https://www.google.com/maps?q=${encodeURIComponent(latitude)},${encodeURIComponent(longitude)}" target="_blank" rel="noopener noreferrer">View on Google Maps</a>`
                : ''}
            </div>
          </div>
        </article>
      `;
    })
    .join('');
  renderPagination(result);
}

function renderPagination(result) {
  const pagination = document.getElementById('reportPagination');
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

document.getElementById('reportFilters').addEventListener('submit', (event) => event.preventDefault());
['categoryFilter', 'statusFilter', 'severityFilter', 'sortFilter'].forEach((id) => {
  document.getElementById(id).addEventListener('change', () => loadReports(1));
});
document.getElementById('reportSearch').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadReports(1), 300);
});
document.getElementById('reportPagination').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-page]');
  if (button && !button.disabled) loadReports(Number(button.dataset.page));
});

connectRealtime(() => loadReports(1));
loadReports();