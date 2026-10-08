/* ========================================================================
   survey.js — Civic infrastructure survey + community averages
   ======================================================================== */

renderNav('survey');

let surveyChart = null;

const app = document.getElementById('app');
app.innerHTML = `
  <div class="page-shell">
    <header class="page-header">
      <h1>Civic Infrastructure Survey</h1>
      <p>Rate the condition of local facilities and share improvement ideas.</p>
    </header>

    <div class="survey-layout">
      <div class="card form-card">
        <form id="surveyForm">
          <div class="form-grid">
            <div class="form-field">
              <label for="name">Name</label>
              <input id="name" name="name" type="text" placeholder="Optional" />
            </div>

            <div class="form-field">
              <label for="area">Area / Ward</label>
              <input id="area" name="area" type="text" placeholder="e.g. Market Ward" />
            </div>

            <div class="form-field full">
              <label>Rate the civic facilities (1–5)</label>
              <div class="rating-table">
                <div class="rating-row">
                  <label>Roads</label>
                  ${makeScoreOptions('roads')}
                </div>
                <div class="rating-row">
                  <label>Drainage</label>
                  ${makeScoreOptions('drainage')}
                </div>
                <div class="rating-row">
                  <label>Streetlights</label>
                  ${makeScoreOptions('streetlights')}
                </div>
                <div class="rating-row">
                  <label>Waste</label>
                  ${makeScoreOptions('waste')}
                </div>
                <div class="rating-row">
                  <label>Water</label>
                  ${makeScoreOptions('water')}
                </div>
                <div class="rating-row">
                  <label>Footpaths</label>
                  ${makeScoreOptions('footpaths')}
                </div>
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

      <div class="card">
        <h2>Community Averages</h2>
        <div class="chart-canvas-wrap">
          <canvas id="surveyChart"></canvas>
        </div>
      </div>
    </div>
  </div>
`;

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

async function loadSurveyStats() {
  try {
    const stats = await api('/api/surveys/stats');
    renderSurveyChart(stats);
  } catch (error) {
    document.getElementById('surveyChart').insertAdjacentHTML('afterend', `<div class="alert error">${escapeHtml(error.message)}</div>`);
  }
}

function renderSurveyChart(stats) {
  const labels = ['Roads', 'Drainage', 'Streetlights', 'Waste', 'Water', 'Footpaths'];
  const data = [stats.roads, stats.drainage, stats.streetlights, stats.waste, stats.water, stats.footpaths];
  const canvas = document.getElementById('surveyChart');

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
        y: {
          beginAtZero: true,
          max: 5,
          ticks: { stepSize: 1 }
        }
      }
    }
  });
}

function showAlert(message, type = 'error') {
  const alertBox = document.getElementById('alertBox');
  alertBox.className = `alert ${type}`;
  alertBox.textContent = message;
}

async function handleSubmit(event) {
  event.preventDefault();

  const formData = new FormData(event.target);
  const data = Object.fromEntries(formData.entries());

  try {
    await api('/api/surveys', {
      method: 'POST',
      body: JSON.stringify(data)
    });

    showAlert('Survey submitted successfully.', 'success');
    event.target.reset();
    loadSurveyStats();
  } catch (error) {
    showAlert(error.message, 'error');
  }
}

document.getElementById('surveyForm').addEventListener('submit', handleSubmit);
connectRealtime((event) => {
  if (event.type === 'survey.created') loadSurveyStats();
});
loadSurveyStats();