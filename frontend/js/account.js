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

function renderSignIn(message = '') {
  const isSuccess = message.startsWith('✅');
  document.getElementById('accountContent').innerHTML = `
    <div class="card form-card account-card">
      <div class="account-tabs" role="tablist" aria-label="Account actions">
        <button class="btn btn-secondary active" type="button" data-mode="login">Sign in</button>
        <button class="btn btn-secondary" type="button" data-mode="register">Create account</button>
      </div>
      <form id="accountForm" class="form-grid" autocomplete="off">
        <div class="form-field full" id="nameField" hidden>
          <label for="accountName">Name</label>
          <input id="accountName" name="name" autocomplete="off" minlength="2" maxlength="80" readonly />
        </div>
        <div class="form-field full">
          <label for="accountEmail">Email</label>
          <input id="accountEmail" name="email" type="email" autocomplete="off" required maxlength="254" readonly />
        </div>
        <div class="form-field full">
          <label for="accountPassword">Password</label>
          <input id="accountPassword" name="password" type="password" autocomplete="new-password" required minlength="10" maxlength="256" readonly />
          <small>Use at least 10 characters.</small>
        </div>
        <div class="form-field full">
          <div id="accountAlert" class="alert ${message ? (isSuccess ? 'success' : 'error') : ''}">${escapeHtml(message)}</div>
        </div>
        <div class="form-field full">
          <button class="btn btn-primary" id="accountSubmit" type="submit">Sign in</button>
        </div>
      </form>
    </div>
  `;

  // THE READONLY TRICK: Chrome won't autofill readonly inputs.
  // Remove readonly on first focus/click so the user can type.
  const fields = document.querySelectorAll('#accountForm input');
  fields.forEach((input) => {
    input.addEventListener('focus', () => input.removeAttribute('readonly'), { once: true });
    input.addEventListener('click', () => input.removeAttribute('readonly'), { once: true });
  });

  // Belt-and-braces: force-clear any value Chrome snuck in
  const clearAutofill = () => {
    fields.forEach((input) => {
      if (input.dataset.userCleared !== '1') {
        input.value = '';
      }
    });
  };
  // Run immediately and after a short delay (Chrome injects values asynchronously)
  clearAutofill();
  setTimeout(clearAutofill, 100);
  setTimeout(clearAutofill, 400);

  let mode = 'login';
  const modeButtons = document.querySelectorAll('[data-mode]');
  const nameField = document.getElementById('nameField');
  const nameInput = document.getElementById('accountName');
  const emailInput = document.getElementById('accountEmail');
  const passwordInput = document.getElementById('accountPassword');
  const submitButton = document.getElementById('accountSubmit');

  // Mark fields as "user typed" so autofill clears don't wipe their input
  [nameInput, emailInput, passwordInput].forEach((input) => {
    input.addEventListener('input', () => { input.dataset.userCleared = '1'; });
  });

  modeButtons.forEach((button) => button.addEventListener('click', () => {
    mode = button.dataset.mode;
    nameField.hidden = mode !== 'register';
    nameInput.required = mode === 'register';
    // Re-apply readonly + clear on mode switch so Chrome doesn't refill
    [nameInput, emailInput, passwordInput].forEach((input) => {
      input.removeAttribute('data-user-cleared');
      input.value = '';
      input.setAttribute('readonly', '');
      setTimeout(() => input.removeAttribute('readonly'), 50);
    });
    passwordInput.autocomplete = 'new-password';
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

      if (mode === 'register') {
        renderSignIn('✅ Account created! Please sign in to continue.');
        return;
      }

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