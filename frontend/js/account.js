/* ========================================================================
   account.js — Sign-in / register / profile page
   ======================================================================== */

renderNav('account');

const app = document.getElementById('app');
let accountEvents = null;
app.innerHTML = `
  <main class="page-shell">
    <header class="page-header">
      <h1>Your account</h1>
      <p>Sign in to keep track of civic reports you submit.</p>
    </header>
    <section id="accountContent" aria-live="polite"></section>
  </main>
`;

/* escapeHtml now lives in shared.js — do not redefine here. */

function renderSignIn(errorMessage = '') {
  document.getElementById('accountContent').innerHTML = `
    <div class="card form-card account-card">
      <div class="account-tabs" role="tablist" aria-label="Account actions">
        <button class="btn btn-secondary active" type="button" data-mode="login">Sign in</button>
        <button class="btn btn-secondary" type="button" data-mode="register">Create account</button>
      </div>
      <form id="accountForm" class="form-grid">
        <div class="form-field full" id="nameField" hidden>
          <label for="accountName">Name</label>
          <input id="accountName" name="name" autocomplete="name" minlength="2" maxlength="80" />
        </div>
        <div class="form-field full">
          <label for="accountEmail">Email</label>
          <input id="accountEmail" name="email" type="email" autocomplete="email" required maxlength="254" />
        </div>
        <div class="form-field full">
          <label for="accountPassword">Password</label>
          <input id="accountPassword" name="password" type="password" autocomplete="current-password" required minlength="10" maxlength="256" />
          <small>Use at least 10 characters.</small>
        </div>
        <div class="form-field full">
          <div id="accountAlert" class="alert ${errorMessage ? 'error' : ''}">${escapeHtml(errorMessage)}</div>
        </div>
        <div class="form-field full">
          <button class="btn btn-primary" id="accountSubmit" type="submit">Sign in</button>
        </div>
      </form>
    </div>
  `;

  let mode = 'login';
  const modeButtons = document.querySelectorAll('[data-mode]');
  const nameField = document.getElementById('nameField');
  const passwordInput = document.getElementById('accountPassword');
  const submitButton = document.getElementById('accountSubmit');

  modeButtons.forEach((button) => button.addEventListener('click', () => {
    mode = button.dataset.mode;
    nameField.hidden = mode !== 'register';
    document.getElementById('accountName').required = mode === 'register';
    passwordInput.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    submitButton.textContent = mode === 'register' ? 'Create account' : 'Sign in';
    modeButtons.forEach((item) => item.classList.toggle('active', item === button));
  }));

  document.getElementById('accountForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    submitButton.disabled = true;
    submitButton.textContent = mode === 'register' ? 'Creating account...' : 'Signing in...';
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await api(`/api/auth/${mode === 'register' ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      await loadAccount();
    } catch (error) {
      document.getElementById('accountAlert').textContent = error.message;
      document.getElementById('accountAlert').className = 'alert error';
      submitButton.disabled = false;
      submitButton.textContent = mode === 'register' ? 'Create account' : 'Sign in';
    }
  });
}

function renderProfile(user, reports) {
  const reportRows = reports.length
    ? reports.map((report) => `
        <article class="report-card">
          <div class="report-meta">
            <span class="category-pill">${escapeHtml(report.category)}</span>
            ${renderStatusBadge(report.status)}
            ${renderSeverityBadge(report.severity)}
          </div>
          <h3>${escapeHtml(report.description)}</h3>
          <p>${escapeHtml(report.address || 'Location not provided')}</p>
          <small>${escapeHtml(timeAgo(report.created_at))}</small>
        </article>
      `).join('')
    : '<p class="empty-state">You have not submitted any reports yet.</p>';

  document.getElementById('accountContent').innerHTML = `
    <section class="card account-profile">
      <div>
        <span class="eyebrow">Signed in as ${escapeHtml(user.role)}</span>
        <h2>${escapeHtml(user.name)}</h2>
        <p>${escapeHtml(user.email)}</p>
      </div>
      <button class="btn btn-secondary" id="signOutButton" type="button">Sign out</button>
    </section>
    <section class="account-reports">
      <div class="section-head"><h2>My reports</h2><span>${reports.length} total</span></div>
      <div class="account-report-list">${reportRows}</div>
    </section>
  `;

  document.getElementById('signOutButton').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    renderSignIn();
  });
}

async function loadAccount() {
  const content = document.getElementById('accountContent');
  try {
    const { user } = await api('/api/auth/me');
    if (!user) {
      renderSignIn();
      return;
    }
    const reports = await api('/api/me/reports');
    renderProfile(user, reports);
    if (!accountEvents) accountEvents = connectRealtime(() => loadAccount());
  } catch (error) {
    content.innerHTML = `<div class="alert error">${escapeHtml(error.message)}</div>`;
  }
}

loadAccount();