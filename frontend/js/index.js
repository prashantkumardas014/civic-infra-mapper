/* ========================================================================
   index.js — Dashboard page
   ======================================================================== */

renderNav('dashboard');

const app = document.getElementById('app');
let dashboardMap;
let categoryChart;
let statusChart;
let realtimeReloadTimer = null;

app.innerHTML = `
  <div class="page-shell dashboard-shell">
    <header class="page-header hero-header">
      <div class="hero-copy">
        <span class="eyebrow">Operations overview</span>
        <h1>Neighbourhood Civic Infrastructure Dashboard</h1>
        <p>Monitor civic issues and community conditions across Silvassa.</p>
      </div>
      <div class="hero-badges">
        <div class="mini-badge">
          <span>Live issues</span>
          <strong id="heroOpenIssues">0</strong>
        </div>
        <div class="mini-badge success">
          <span>Resolved</span>
          <strong id="heroResolved">0</strong>
        </div>
      </div>
    </header>

    <section id="statsGrid" class="stats-grid"></section>

    <section class="chart-grid">
      <div class="chart-panel">
        <div class="panel-head">
          <h3>Reports by Category</h3>
          <span>Distribution</span>
        </div>
        <div class="chart-canvas-wrap">
          <canvas id="categoryChart"></canvas>
        </div>
      </div>
      <div class="chart-panel">
        <div class="panel-head">
          <h3>Status Breakdown</h3>
          <span>Overview</span>
        </div>
        <div class="chart-canvas-wrap chart-canvas-wrap-compact">
          <canvas id="statusChart"></canvas>
        </div>
      </div>
    </section>

    <section class="two-col dashboard-bottom">
      <div class="card map-card">
        <div class="section-head">
          <h2>Live Map</h2>
          <span>Geo snapshot</span>
        </div>
        <div class="map-wrap">
          <div id="dashboardMap"></div>
        </div>
      </div>

      <div class="card reports-card">
        <div class="section-head">
          <h2>Recent Reports</h2>
          <span>Latest activity</span>
        </div>
        <ul id="recentReports" class="recent-list"></ul>
      </div>
    </section>
  </div>
`;

async function loadDashboard() {
  try {
    const stats = await api('/api/stats');
    renderStats(stats);
    renderMap(stats.mapReports);
    renderCategoryChart(stats.byCategory);
    renderStatusChart(stats);
    renderRecentReports(stats.recent);
  } catch (error) {
    app.insertAdjacentHTML('beforeend', `<div class="page-shell"><div class="alert error">${escapeHtml(error.message)}</div></div>`);
  }
}

function renderStats(stats) {
  const cards = [
    { label: 'Total Reports', value: stats.total, icon: '📊', tone: 'primary' },
    { label: 'Pending', value: stats.pending, icon: '⏳', tone: 'warning' },
    { label: 'In Progress', value: stats.progress, icon: '🛠️', tone: 'info' },
    { label: 'Resolved', value: stats.resolved, icon: '✅', tone: 'success' },
    { label: 'Survey Responses', value: stats.surveyCount, icon: '📝', tone: 'accent' }
  ];

  const container = document.getElementById('statsGrid');
  container.innerHTML = cards
    .map(
      (card) => `
        <div class="stat-card ${card.tone}">
          <div class="stat-label">
            <span>${card.label}</span>
            <span class="icon">${card.icon}</span>
          </div>
          <div class="stat-value">${card.value}</div>
          <div class="stat-trend">${card.label === 'Resolved' ? 'On track' : 'Updated today'}</div>
        </div>
      `
    )
    .join('');

  document.getElementById('heroOpenIssues').textContent = stats.pending + stats.progress;
  document.getElementById('heroResolved').textContent = stats.resolved;
}

function renderMap(reports) {
  // Create the map and tile layer ONCE. Never tear it down on refresh —
  // doing so cancels in-flight tile requests and leaves the map blank.
  if (!dashboardMap) {
    dashboardMap = L.map('dashboardMap').setView(getMapCenter(), 14);

    L.tileLayer('https://tile.openstreetmap.de/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(dashboardMap);
  }

  // Replace only the markers layer on each refresh
  if (dashboardMap._reportLayer) dashboardMap.removeLayer(dashboardMap._reportLayer);
  dashboardMap._reportLayer = L.layerGroup().addTo(dashboardMap);

  const markers = [];
  reports.forEach((report) => {
    if (
      report.latitude !== null && report.latitude !== undefined &&
      report.longitude !== null && report.longitude !== undefined &&
      Number.isFinite(Number(report.latitude)) && Number.isFinite(Number(report.longitude))
    ) {
      const category = catInfo(report.category);
      const markerColor = getStatusColor(report.status);
      const marker = L.circleMarker([Number(report.latitude), Number(report.longitude)], {
        radius: 9,
        color: markerColor,
        fillColor: markerColor,
        fillOpacity: 0.8
      }).addTo(dashboardMap._reportLayer);

      // Compact image inside the popup. Click opens full-size in a new tab.
      // The popup itself scrolls if content exceeds the map viewport.
      const photoHtml = report.photo
        ? `<a href="${escapeHtml(report.photo)}" target="_blank" rel="noopener noreferrer" title="Click to open full size">
             <img
               src="${escapeHtml(report.photo)}"
               alt="Issue photo"
               style="width:100%; height:auto; max-height:140px; object-fit:contain; background:#f1f5f9; border-radius:8px; display:block; margin-bottom:0.4rem; cursor:zoom-in;"
             />
           </a>`
        : '';

      marker.bindPopup(`
        <div style="max-width:250px; max-height:270px; overflow-y:auto; font-size:0.82rem; line-height:1.35; word-wrap:break-word; padding-right:4px;">
          ${photoHtml}
          <strong>${category.icon} ${escapeHtml(report.category)}</strong><br>
          ${escapeHtml(report.description)}<br><br>
          <strong>Address:</strong> ${escapeHtml(report.address || 'Not provided')}<br>
          <strong>Status:</strong> ${escapeHtml(report.status)}<br>
          <strong>Reporter:</strong> ${escapeHtml(report.reporter_name || 'Anonymous')}
        </div>
      `, { maxWidth: 270, minWidth: 220, autoPanPadding: [40, 40] });

      markers.push([Number(report.latitude), Number(report.longitude)]);
    }
  });

  // fitBounds is unreliable with a single marker, so use setView for 1 or 0.
  if (markers.length > 1) {
    dashboardMap.fitBounds(markers, { padding: [30, 30], maxZoom: 15 });
  } else if (markers.length === 1) {
    dashboardMap.setView(markers[0], 15);
  } else {
    dashboardMap.setView(getMapCenter(), 14);
  }
}

function renderCategoryChart(byCategory) {
  const labels = byCategory.map((item) => item.category);
  const counts = byCategory.map((item) => item.count);
  const colors = byCategory.map((item) => catInfo(item.category).color);

  if (categoryChart) categoryChart.destroy();
  categoryChart = new Chart(document.getElementById('categoryChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Reports',
        data: counts,
        backgroundColor: colors,
        borderRadius: 5,
        maxBarThickness: 28
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      scales: {
        x: {
          beginAtZero: true,
          ticks: { precision: 0, stepSize: 1 },
          grid: { color: 'rgba(148, 163, 184, 0.18)' }
        },
        y: {
          grid: { display: false },
          ticks: { autoSkip: false }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (context) => ` ${context.parsed.x} report${context.parsed.x === 1 ? '' : 's'}` } }
      }
    }
  });
}

function renderStatusChart(stats) {
  if (statusChart) statusChart.destroy();
  statusChart = new Chart(document.getElementById('statusChart'), {
    type: 'doughnut',
    data: {
      labels: ['Pending', 'In Progress', 'Resolved'],
      datasets: [{
        data: [stats.pending, stats.progress, stats.resolved],
        backgroundColor: ['#d97706', '#2563eb', '#15803d'],
        borderColor: '#ffffff',
        borderWidth: 3,
        hoverOffset: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { usePointStyle: true, pointStyle: 'circle', padding: 18 }
        },
        tooltip: { callbacks: { label: (context) => ` ${context.label}: ${context.parsed}` } }
      }
    }
  });
}

function renderRecentReports(recent) {
  const list = document.getElementById('recentReports');

  if (!recent.length) {
    list.innerHTML = '<li class="empty-state">No reports yet.</li>';
    return;
  }

  list.innerHTML = recent
    .slice(0, 5)
    .map((report) => {
      const info = catInfo(report.category);
      return `
        <li class="recent-item">
          <div class="recent-icon">${info.icon}</div>
          <div class="recent-text">
            <div class="recent-row">
              <strong>${escapeHtml(report.category)}</strong>
              ${renderStatusBadge(report.status)}
            </div>
            <small class="recent-desc">${escapeHtml(report.description)}</small>
            <small class="recent-meta">${timeAgo(report.created_at)} · ${escapeHtml(report.reporter_name || 'Anonymous')}</small>
          </div>
        </li>
      `;
    })
    .join('');
}

function getStatusColor(status) {
  switch (status) {
    case 'Resolved':
      return '#16a34a';
    case 'In Progress':
      return '#2563eb';
    default:
      return '#dc2626';
  }
}

// Debounced realtime reload — avoids rapid-fire redraws
connectRealtime(() => {
  clearTimeout(realtimeReloadTimer);
  realtimeReloadTimer = setTimeout(() => loadDashboard(), 300);
});
loadDashboard(); 