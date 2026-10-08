/* ========================================================================
   report.js — Report an Issue page
   ======================================================================== */

renderNav('report');

document.getElementById('app').innerHTML = `
  <div class="page-shell">
    <section class="hero-header">
      <div class="hero-copy">
        <span class="eyebrow">Community Engagement</span>
        <h1>Report a Civic Issue</h1>
        <p>Help improve your neighbourhood by pinning the exact location and uploading a photo.</p>
      </div>
    </section>

    <div class="card form-card" style="margin-top:1.5rem">
      <form id="reportForm">
        <div class="form-grid">

          <div class="form-field">
            <label for="category">Category *</label>
            <select id="category" required>
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
            <select id="severity">
              <option value="Low">Low</option>
              <option value="Medium" selected>Medium</option>
              <option value="High">High</option>
            </select>
          </div>

          <div class="form-field full">
            <label for="description">Describe the problem *</label>
            <textarea id="description" required maxlength="3000"
              placeholder="e.g. Large pothole near the bus stop, water collects during rain..."></textarea>
          </div>

          <div class="form-field full">
            <label for="address">Address / Landmark</label>
            <input id="address" type="text" maxlength="300" placeholder="e.g. Near Amli Bus Stop, Silvassa">
          </div>

          <div class="form-field">
            <label for="latitude">Latitude</label>
            <input id="latitude" type="number" min="-90" max="90" step="any" placeholder="20.2738">
          </div>
          <div class="form-field">
            <label for="longitude">Longitude</label>
            <input id="longitude" type="number" min="-180" max="180" step="any" placeholder="73.0169">
          </div>

          <div class="form-field full">
            <label>Pick location on the map</label>
            <div class="map-wrap" style="height:320px">
              <div id="mapPicker"></div>
            </div>
            <div class="input-row" style="margin-top:.6rem">
              <button type="button" class="btn btn-secondary" id="locBtn">📍 Use My Current Location</button>
              <small style="color:var(--muted)">Click anywhere on the map to drop a pin.</small>
            </div>
          </div>

          <div class="form-field" id="reporterNameField">
            <label for="reporter_name">Your Name (optional)</label>
            <input id="reporter_name" type="text" maxlength="80" placeholder="Anonymous">
          </div>

          <div class="form-field">
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

/* If the user is signed in, hide the name field (server uses their account name). */
(async () => {
  try {
    const { user } = await api('/api/auth/me');
    if (user) {
      const field = document.getElementById('reporterNameField');
      if (field) field.hidden = true;
    }
  } catch (_) { /* not signed in — leave the field visible */ }
})();

/* ---------- Init picker map ---------- */
const pickerMap = L.map('mapPicker').setView([20.2738, 73.0169], 13);

// OpenStreetMap German mirror — no API key, no referrer restrictions.
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
}

pickerMap.on('click', (e) => setPin(e.latlng.lat, e.latlng.lng));

['latitude', 'longitude'].forEach((id) => {
  document.getElementById(id).addEventListener('change', () => {
    const la = parseFloat(document.getElementById('latitude').value);
    const lo = parseFloat(document.getElementById('longitude').value);
    if (!isNaN(la) && !isNaN(lo)) {
      setPin(la, lo);
      pickerMap.setView([la, lo], 16);
    }
  });
});

document.getElementById('locBtn').addEventListener('click', () => {
  if (!navigator.geolocation) return alert('Geolocation not supported');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      setPin(pos.coords.latitude, pos.coords.longitude);
      pickerMap.setView([pos.coords.latitude, pos.coords.longitude], 16);
    },
    () => alert('Could not get your location. Please click on the map instead.')
  );
});

/* ---------- Submit ---------- */
document.getElementById('reportForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  const alertBox = document.getElementById('alert');
  btn.disabled = true;
  btn.textContent = 'Submitting...';
  alertBox.className = 'alert';
  alertBox.textContent = '';

  try {
    const fd = new FormData();
    fd.append('category', document.getElementById('category').value);
    fd.append('description', document.getElementById('description').value);
    fd.append('address', document.getElementById('address').value);
    fd.append('latitude', document.getElementById('latitude').value);
    fd.append('longitude', document.getElementById('longitude').value);
    fd.append('severity', document.getElementById('severity').value);
    fd.append('reporter_name', document.getElementById('reporter_name').value);

    const file = document.getElementById('photo').files[0];
    if (file) fd.append('photo', file);

    await api('/api/reports', { method: 'POST', body: fd });

    alertBox.textContent = '✅ Report submitted! Redirecting...';
    alertBox.className = 'alert success';
    setTimeout(() => (window.location.href = 'reports.html'), 1200);
  } catch (err) {
    alertBox.textContent = '❌ ' + err.message;
    alertBox.className = 'alert error';
    btn.disabled = false;
    btn.textContent = 'Submit Report';
  }
});