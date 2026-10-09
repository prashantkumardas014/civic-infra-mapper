/* ========================================================================
   report.js — Report an Issue page
   Requires sign-in to submit; shows a friendly gate otherwise.
   ======================================================================== */

renderNav('report');

const app = document.getElementById('app');

// The area we serve; used for sanity-checking pin locations
const SERVICE_CENTER = { lat: 20.2738, lng: 73.0169 };
const SERVICE_MAX_KM = 50;  // warn if pin is further than this

(async function init() {
  let user = null;
  try {
    const result = await api('/api/auth/me');
    user = result.user;
  } catch (_) { /* not signed in */ }

  if (!user) {
    renderSignInGate();
    return;
  }

  renderReportForm(user);
})();

/* ---------- Not signed in: show gate ---------- */
function renderSignInGate() {
  app.innerHTML = `
    <div class="page-shell">
      <section class="hero-header">
        <div class="hero-copy">
          <span class="eyebrow">Community Engagement</span>
          <h1>Report a Civic Issue</h1>
          <p>Pin the location, describe the problem, and submit.</p>
        </div>
      </section>

      <div class="card form-card" style="margin-top:1.5rem; text-align:center; padding:2.5rem 1.5rem;">
        <div style="font-size:3.5rem; margin-bottom:.5rem;">🔒</div>
        <h2 style="margin:.3rem 0 .5rem;">Sign in required</h2>
        <p style="color:var(--muted); margin:0 0 1.5rem;">
          Sign in to submit a report.
        </p>
        <div style="display:flex; gap:.7rem; justify-content:center; flex-wrap:wrap;">
          <a href="account.html" class="btn btn-primary">Sign in</a>
          <a href="account.html" class="btn btn-secondary" id="createAccountLink">Create account</a>
        </div>
      </div>
    </div>
  `;

  document.getElementById('createAccountLink')?.addEventListener('click', () => {
    try { sessionStorage.setItem('civic:account-mode', 'register'); } catch (_) {}
  });
}

/* ---------- Signed in: full report form ---------- */
function renderReportForm(user) {
  app.innerHTML = `
    <div class="page-shell">
      <section class="hero-header">
        <div class="hero-copy">
          <span class="eyebrow">Community Engagement</span>
          <h1>Report a Civic Issue</h1>
          <p>Pin the location, describe the problem, and submit.</p>
        </div>
      </section>

      <div class="card form-card" style="margin-top:1.5rem">
        <form id="reportForm">
          <div class="form-grid">

            <div class="form-field">
              <label for="category">Category *</label>
              <select id="category" name="category" required>
                <option value="">-- Select a category --</option>
                <option>Road</option>
                <option>Footpath</option>
                <option>Drainage</option>
                <option>Streetlight</option>
                <option>Waste</option>
                <option>Water Supply</option>
                <option>Public Space</option>
                <option>Other</option>
              </select>
            </div>

            <div class="form-field">
              <label for="severity">Severity</label>
              <select id="severity" name="severity">
                <option value="Low">Low</option>
                <option value="Medium" selected>Medium</option>
                <option value="High">High</option>
              </select>
            </div>

            <div class="form-field full">
              <label for="description">Describe the problem *</label>
              <textarea id="description" name="description" required maxlength="3000"
                placeholder="e.g. Large pothole near the bus stop, water collects during rain..."></textarea>
            </div>

            <div class="form-field full">
              <label for="address">Address / Landmark</label>
              <input id="address" name="address" type="text" maxlength="300" placeholder="e.g. Near Amli Bus Stop, Silvassa">
            </div>

            <div class="form-field">
              <label for="latitude">Latitude</label>
              <input id="latitude" name="latitude" type="number" min="-90" max="90" step="any" placeholder="20.2738" readonly>
            </div>
            <div class="form-field">
              <label for="longitude">Longitude</label>
              <input id="longitude" name="longitude" type="number" min="-180" max="180" step="any" placeholder="73.0169" readonly>
            </div>

            <div class="form-field full">
              <label>Pick location on the map *</label>
              <div class="map-wrap" style="height:320px">
                <div id="mapPicker"></div>
              </div>
              <div class="input-row" style="margin-top:.6rem">
                <button type="button" class="btn btn-secondary" id="locBtn">📍 Use My Current Location</button>
                <small style="color:var(--muted)">Click anywhere on the map to drop a pin.</small>
              </div>
            </div>

            <div class="form-field full">
              <label>Reporting as</label>
              <div style="padding:.7rem .9rem; background:var(--primary-soft); border-radius:10px; color:var(--primary); font-weight:600;">
                ${escapeHtml(user.name)} &lt;${escapeHtml(user.email)}&gt;
              </div>
              <small style="color:var(--muted);">Your name will be shown as the reporter.</small>
            </div>

            <div class="form-field full">
              <label for="photo">Upload Photo (max 5MB)</label>
              <input id="photo" type="file" accept="image/*">
            </div>

          </div>

          <div class="alert" id="alert"></div>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary" id="submitBtn">Submit Report</button>
          </div>
        </form>
      </div>
    </div>
  `;

  // Init picker map with bounds — can't be dragged outside the service area
  const pickerMap = L.map('mapPicker', {
    maxBounds: [[19.4, 72.0], [21.1, 74.0]],
    maxBoundsViscosity: 0.8,
    minZoom: 11,
    maxZoom: 18
  }).setView([SERVICE_CENTER.lat, SERVICE_CENTER.lng], 13);

  L.tileLayer('https://tile.openstreetmap.de/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(pickerMap);

  let pin = null;
  function setPin(lat, lng) {
    if (pin) pickerMap.removeLayer(pin);
    pin = L.marker([lat, lng]).addTo(pickerMap);
    document.getElementById('latitude').value = lat.toFixed(6);
    document.getElementById('longitude').value = lng.toFixed(6);
    // Focus the map on the pin
    pickerMap.setView([lat, lng], Math.max(pickerMap.getZoom(), 15));
  }

  pickerMap.on('click', (e) => setPin(e.latlng.lat, e.latlng.lng));

  // If the user manually types coordinates, drop the pin there
  // (readonly fields keep this safe but let users paste coordinates if they really need)
  // — no manual listeners needed since fields are readonly

  document.getElementById('locBtn').addEventListener('click', () => {
    if (!navigator.geolocation) return showToast('Geolocation not supported', 'error');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPin(pos.coords.latitude, pos.coords.longitude);
      },
      () => showToast('Could not get your location. Please click on the map instead.', 'error')
    );
  });

  // Autosave drafts
  attachFormDraft('reportForm', 'civic-draft-report');

  // Submit
  document.getElementById('reportForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    const alertBox = document.getElementById('alert');
    alertBox.className = 'alert';
    alertBox.textContent = '';

    // 1. Require a location
    const lat = parseFloat(document.getElementById('latitude').value);
    const lng = parseFloat(document.getElementById('longitude').value);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      showToast('Please pick a location on the map before submitting.', 'error');
      alertBox.textContent = '❌ Please pick a location on the map before submitting.';
      alertBox.className = 'alert error';
      return;
    }

    // 2. Sanity check distance — warn if the pin looks far from the service area
    const distKm = Math.hypot(
      (lat - SERVICE_CENTER.lat) * 111,
      (lng - SERVICE_CENTER.lng) * 111
    );
    if (distKm > SERVICE_MAX_KM) {
      const proceed = confirm(
        `Your pinned location is about ${Math.round(distKm)} km from Silvassa.\n\n` +
        `Is that really where the issue is?\n\n` +
        `Click OK to submit anyway, or Cancel to fix the location.`
      );
      if (!proceed) {
        return;
      }
    }

    try {
      const fd = new FormData();
      fd.append('category', document.getElementById('category').value);
      fd.append('description', document.getElementById('description').value);
      fd.append('address', document.getElementById('address').value);
      fd.append('latitude', String(lat));
      fd.append('longitude', String(lng));
      fd.append('severity', document.getElementById('severity').value);

      const file = document.getElementById('photo').files[0];
      if (file) fd.append('photo', file);

      await withLoading(btn, async () => {
        await api('/api/reports', { method: 'POST', body: fd });
      }, 'Submitting...');

      // Clear draft on success
      try { localStorage.removeItem('civic-draft-report'); } catch (_) {}

      showToast('Report submitted successfully', 'success');
      alertBox.textContent = '✅ Report submitted! Redirecting...';
      alertBox.className = 'alert success';
      setTimeout(() => (window.location.href = 'reports.html'), 1200);
    } catch (err) {
      showToast(err.message, 'error');
      alertBox.textContent = '❌ ' + err.message;
      alertBox.className = 'alert error';
    }
  });
}