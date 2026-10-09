/* ========================================================================
   survey.js — Civic infrastructure survey + community averages
   Requires sign-in to submit; shows a friendly gate otherwise.
   ======================================================================== */

renderNav('survey');

const app = document.getElementById('app');
let surveyChart = null;

(async function init() {
  let user = null;
  try {
    const result = await api('/api/auth/me');
    user = result.user;
  } catch (_) { /* not signed in */ }

  renderPage(user);
})();

function renderPage(user) {
  const gate = !user;

  app.innerHTML = `
    <div class="page-shell">
      <header class="page-header">
        <h1>Civic Infrastructure Survey</h1>
        <p>Rate the condition of local facilities and share improvement ideas.</p>
      </header>

      <div class="survey-layout">
        ${gate ? renderSurveyGate() : renderSurveyForm(user)}

        <div class="card">
          <h2>Community Averages</h2>
          <div class="chart-canvas-wrap">
            <canvas id="surveyChart"></canvas>
          </div>
        </div>
      </div>
    </div>
  `;

  if (gate) {
    document.getElementById('createAccountLink')?.addEventListener('click', () => {
      try { sessionStorage.setItem('civic:account-mode', 'register'); } catch (_) {}
    });
  } else {
    attachSurveyFormHandlers();
  }

  loadSurveyStats();
  connectRealtime((event) => {
    if (event.type === 'survey.created') loadSurveyStats();
  });
}

/* ---------- Sign-in gate ---------- */
function renderSurveyGate() {
  return `
    <div class="card form-card" style="text-align:center; padding:2.5rem 1.5rem;">
      <div style="font-size:3.5rem; margin-bottom:.5rem;">🔒</div>
      <h2 style="margin:.3rem 0 .5rem;">Sign in required</h2>
      <p style="color:var(--muted); margin:0 0 1.5rem;">
        Sign in to submit a survey.
      </p>
      <div style="display:flex; gap:.7rem; justify-content:center; flex-wrap:wrap;">
        <a href="account.html" class="btn btn-primary">Sign in</a>
        <a href="account.html" class="btn btn-secondary" id="createAccountLink">Create account</a>
      </div>
    </div>
  `;
}

/* ---------- Full survey form ---------- */
function renderSurveyForm(user) {
  return `
    <div class="card form-card">
      <form id="surveyForm">
        <div class="form-grid">

          <div class="form-field full">
            <label>Responding as</label>
            <div style="padding:.7rem .9rem; background:var(--primary-soft); border-radius:10px; color:var(--primary); font-weight:600;">
              ${escapeHtml(user.name)} &lt;${escapeHtml(user.email)}&gt;
            </div>
            <small style="color:var(--muted);">Your name will be attached to this response.</small>
          </div>

          <div class="form-field">
            <label for="area">Area / Ward</label>
            <input id="area" name="area" type="text" placeholder="e.g. Market Ward" />
          </div>

          <div class="form-field full">
            <label>Rate the civic facilities (1–5)</label>
            <div class="rating-table">
              <div class="rating-row"><label>Roads</label>${makeScoreOptions('roads')}</div>
              <div class="rating-row"><label>Drainage</label>${makeScoreOptions('drainage')}</div>
              <div class="rating-row"><label>Streetlights</label>${makeScoreOptions('streetlights')}</div>
              <div class="rating-row"><label>Waste</label>${makeScoreOptions('waste')}</div>
              <div class="rating-row"><label>Water</label>${makeScoreOptions('water')}</div>
              <div class="rating-row"><label>Footpaths</label>${makeScoreOptions('footpaths')}</div>
            </div>
          </div>

          <div class="form-field">
            <label for="biggest_problem">Biggest Problem</label>
            <select id="biggest_problem" name="biggest_problem">
              <option value="">Select one</option>
              <option>Roads</option>
              <option>Drainage</option>
              <option>Streetlights</option>
              <option>Waste</option>
              <option>Water Supply</option>
              <option>Footpaths</option>
            </select>
          </div>

          <div class="form-field full">
            <label for="suggestion">Suggestion</label>
            <textarea id="suggestion" name="suggestion" placeholder="How can the neighbourhood be improved?"></textarea>
          </div>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Submit Survey</button>
        </div>
        <div id="alertBox" class="alert"></div>
      </form>
    </div>
  `;
}

function makeScoreOptions(fieldName) {
  return [1, 2, 3, 4, 5]
    .map(
      (value) => `
        <label class="score-pill">
          <input type="radio" name="${fieldName}" value="${value}" ${value === 3 ? 'checked' : ''} />
          <span>${value}</span>
        </label>
      `
    )
    .join('');
}

/* ---------- Attach form handlers ---------- */
function attachSurveyFormHandlers() {
  const form = document.getElementById('surveyForm');

  // Autosave drafts
  attachFormDraft('surveyForm', 'civic-draft-survey');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData.entries());

    try {
      await withLoading(submitBtn, async () => {
        await api('/api/surveys', {
          method: 'POST',
          body: JSON.stringify(data)
        });
      }, 'Submitting...');

      try { localStorage.removeItem('civic-draft-survey'); } catch (_) {}

      showToast('Survey submitted successfully', 'success');
      showAlert('Survey submitted successfully.', 'success');
      event.target.reset();
      loadSurveyStats();
    } catch (error) {
      showToast(error.message, 'error');
      showAlert(error.message, 'error');
    }
  });
}

function showAlert(message, type = 'error') {
  const alertBox = document.getElementById('alertBox');
  if (!alertBox) return;
  alertBox.className = `alert ${type}`;
  alertBox.textContent = message;
}

/* ---------- Community averages chart (public) ---------- */
async function loadSurveyStats() {
  try {
    const stats = await api('/api/surveys/stats');
    renderSurveyChart(stats);
  } catch (error) {
    document.getElementById('surveyChart')?.insertAdjacentHTML(
      'afterend',
      `<div class="alert error">${escapeHtml(error.message)}</div>`
    );
  }
}

function renderSurveyChart(stats) {
  const labels = ['Roads', 'Drainage', 'Streetlights', 'Waste', 'Water', 'Footpaths'];
  const data = [stats.roads, stats.drainage, stats.streetlights, stats.waste, stats.water, stats.footpaths];
  const canvas = document.getElementById('surveyChart');
  if (!canvas) return;

  if (surveyChart) surveyChart.destroy();

  surveyChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Average rating',
        data,
        backgroundColor: ['#2563eb', '#14b8a6', '#f59e0b', '#22c55e', '#0891b2', '#64748b']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, max: 5, ticks: { stepSize: 1 } }
      }
    }
  });
}