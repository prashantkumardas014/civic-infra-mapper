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
        <span class="eyebrow">Civic Operations</span>
        <h1>Neighbourhood Civic Infrastructure Dashboard</h1>
        <p>Real-time civic reporting and resolution tracking.</p>
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
          <div style="display:flex; gap:.4rem;">
            <button type="button" id="toggleHeat" class="btn btn-secondary" style="padding:.35rem .75rem; font-size:.8rem;">🔥 Heatmap</button>
            <button type="button" id="toggleFocus" class="btn btn-secondary" style="padding:.35rem .75rem; font-size:.8rem;" title="Expand map">⛶ Focus</button>
          </div>
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
  // Create the map and tile layer ONCE. Never tear it down on refresh.
  if (!dashboardMap) {
    dashboardMap = L.map('dashboardMap').setView(getMapCenter(), 14);

    L.tileLayer('https://tile.openstreetmap.de/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(dashboardMap);

    if (window.L && L.control && L.control.locate) {
      L.control.locate({
        position: 'topright',
        strings: { title: 'Show my location' },
        locateOptions: { maxZoom: 16, enableHighAccuracy: true },
        flyTo: true,
        cacheLocation: true
      }).addTo(dashboardMap);
    }
  }

  if (dashboardMap._reportLayer) dashboardMap.removeLayer(dashboardMap._reportLayer);
  const clusterAvailable = window.L && L.markerClusterGroup;
  dashboardMap._reportLayer = clusterAvailable
    ? L.markerClusterGroup({
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true
      }).addTo(dashboardMap)
    : L.layerGroup().addTo(dashboardMap);

  const markers = [];
  reports.forEach((report) => {
    if (
      report.latitude !== null && report.latitude !== undefined &&
      report.longitude !== null && report.longitude !== undefined &&
      Number.isFinite(Number(report.latitude)) && Number.isFinite(Number(report.longitude))
    ) {
      const category = catInfo(report.category);
      const markerColor = getStatusColor(report.status);
      const lat = Number(report.latitude);
      const lng = Number(report.longitude);

      const marker = clusterAvailable
        ? L.marker([lat, lng], {
            icon: L.divIcon({
              className: 'civic-marker',
              html: `<div style="background:${markerColor}; width:22px; height:22px; border-radius:50%; border:3px solid white; box-shadow:0 2px 6px rgba(0,0,0,.3);"></div>`,
              iconSize: [22, 22],
              iconAnchor: [11, 11],
              popupAnchor: [0, -11]
            })
          }).addTo(dashboardMap._reportLayer)
        : L.circleMarker([lat, lng], {
            radius: 9,
            color: markerColor,
            fillColor: markerColor,
            fillOpacity: 0.8
          }).addTo(dashboardMap._reportLayer);

      const photoHtml = report.photo
        ? `<img src="${escapeHtml(report.photo)}" alt="Issue photo"
             data-lightbox="${escapeHtml(report.photo)}"
             style="width:100%; height:auto; max-height:140px; object-fit:contain;
                    background:#f1f5f9; border-radius:8px; display:block;
                    margin-bottom:0.4rem; cursor:zoom-in;" />`
        : '';

      const popupId = `history-${report.id}`;
      marker.bindPopup(`
        <div style="max-width:250px; max-height:270px; overflow-y:auto; font-size:0.82rem; line-height:1.35; word-wrap:break-word; padding-right:4px;">
          ${photoHtml}
          <strong>${category.icon} ${escapeHtml(report.category)}</strong><br>
          ${escapeHtml(report.description)}<br><br>
          <strong>Address:</strong> ${escapeHtml(report.address || 'Not provided')}<br>
          <strong>Status:</strong> ${escapeHtml(report.status)}<br>
          <strong>Reporter:</strong> ${escapeHtml(report.reporter_name || 'Anonymous')}
          <div id="${popupId}"></div>
        </div>
      `, { maxWidth: 270, minWidth: 220, autoPanPadding: [40, 40] });

      marker.on('popupopen', async () => {
        const container = document.getElementById(popupId);
        if (!container) return;
        try {
          const history = await api(`/api/reports/${report.id}/history`);
          if (!Array.isArray(history) || history.length === 0) return;
          container.innerHTML = `
            <details style="margin-top:.5rem;">
              <summary style="cursor:pointer; color:#2563eb; font-weight:600; font-size:.82rem;">📜 Status history (${history.length})</summary>
              <ul style="list-style:none; padding:.4rem 0 0; margin:0; font-size:.78rem;">
                ${history.map(h => `
                  <li style="padding:.2rem 0; color:#475569;">
                    <strong>${escapeHtml(h.old_status || '—')}</strong> → <strong>${escapeHtml(h.new_status)}</strong>
                    <br><small>${escapeHtml(timeAgo(h.changed_at))}</small>
                  </li>
                `).join('')}
              </ul>
            </details>
          `;
        } catch (_) { /* history endpoint may not exist yet */ }
      });

      markers.push([lat, lng]);
    }
  });

  // Heatmap
  if (dashboardMap._heatLayer) {
    dashboardMap.removeLayer(dashboardMap._heatLayer);
    dashboardMap._heatLayer = null;
  }
  if (window.L && L.heatLayer && reports.length > 0) {
    const points = reports
      .filter(r => r.latitude != null && r.longitude != null)
      .map(r => {
        const weight = r.severity === 'High' ? 1 : r.severity === 'Medium' ? 0.6 : 0.3;
        return [Number(r.latitude), Number(r.longitude), weight];
      });
    if (points.length > 0) {
      dashboardMap._heatLayer = L.heatLayer(points, {
        radius: 28,
        blur: 18,
        maxZoom: 15,
        minOpacity: 0.4,
        gradient: { 0.2: '#22c55e', 0.5: '#f59e0b', 0.8: '#dc2626' }
      });
    }
  }

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
            <small class="recent-meta"><time data-timestamp="${escapeHtml(report.created_at)}">${escapeHtml(timeAgo(report.created_at))}</time> · ${escapeHtml(report.reporter_name || 'Anonymous')}</small>
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

// Heatmap toggle
document.getElementById('toggleHeat')?.addEventListener('click', (e) => {
  if (!dashboardMap || !dashboardMap._heatLayer) {
    showToast('No data to show on heatmap yet.', 'warning');
    return;
  }
  if (dashboardMap.hasLayer(dashboardMap._heatLayer)) {
    dashboardMap.removeLayer(dashboardMap._heatLayer);
    e.currentTarget.textContent = '🔥 Heatmap';
    e.currentTarget.classList.remove('btn-primary');
    e.currentTarget.classList.add('btn-secondary');
  } else {
    dashboardMap._heatLayer.addTo(dashboardMap);
    e.currentTarget.textContent = '🔥 Hide heatmap';
    e.currentTarget.classList.remove('btn-secondary');
    e.currentTarget.classList.add('btn-primary');
  }
});

// Focus mode — makes the map card fill the viewport
document.getElementById('toggleFocus')?.addEventListener('click', (e) => {
  const card = document.querySelector('.map-card');
  if (!card) return;
  const active = card.dataset.focus === '1';
  if (active) {
    card.dataset.focus = '';
    card.style.position = '';
    card.style.inset = '';
    card.style.zIndex = '';
    card.style.margin = '';
    card.style.height = '';
    e.currentTarget.textContent = '⛶ Focus';
    setTimeout(() => dashboardMap && dashboardMap.invalidateSize(), 50);
  } else {
    card.dataset.focus = '1';
    card.style.position = 'fixed';
    card.style.inset = '68px 12px 12px 12px';
    card.style.zIndex = '9000';
    card.style.margin = '0';
    card.style.height = 'auto';
    e.currentTarget.textContent = '✕ Close';
    setTimeout(() => dashboardMap && dashboardMap.invalidateSize(), 50);
  }
});

// Debounced realtime reload
connectRealtime(() => {
  clearTimeout(realtimeReloadTimer);
  realtimeReloadTimer = setTimeout(() => loadDashboard(), 300);
});
loadDashboard();