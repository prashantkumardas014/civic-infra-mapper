require('dotenv').config();

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { promisify } = require('util');

const app = express();
const PORT = process.env.PORT || 3000;
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = String(process.env.SUPABASE_ANON_KEY || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const STORAGE_BUCKET = 'report-photos';
const SESSION_COOKIE = 'civic_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const scrypt = promisify(crypto.scrypt);

/* ---------- CORS allow-list ---------- */
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5500,http://127.0.0.1:5500')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

/* ---------- Config validation ---------- */
const missingSupabaseSettings = [
  ['SUPABASE_URL', SUPABASE_URL],
  ['SUPABASE_ANON_KEY', SUPABASE_ANON_KEY],
  ['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY]
].filter(([, value]) => !value || /your-|replace-with|example\.com|<|>/i.test(value));

if (missingSupabaseSettings.length) {
  throw new Error(
    `Supabase is not configured. Replace the example or empty value for ${missingSupabaseSettings.map(([name]) => name).join(', ')} in .env with values from your Supabase project's API settings.`
  );
}

try {
  const projectUrl = new URL(SUPABASE_URL);
  if (projectUrl.protocol !== 'https:' || !projectUrl.hostname.endsWith('.supabase.co')) {
    throw new Error('Expected the HTTPS project URL ending in .supabase.co');
  }
} catch (error) {
  throw new Error(`SUPABASE_URL in .env is not a valid Supabase project URL. Copy the Project URL from Supabase Settings → API. ${error.message}`);
}

/* ---------- Supabase client (service role, server-only) ---------- */
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

/* ---------- Resend email client (optional) ---------- */
let resend = null;
let resendMode = 'disabled';
try {
  const { Resend } = require('resend');
  if (process.env.RESEND_API_KEY) {
    resend = new Resend(process.env.RESEND_API_KEY);
    const from = process.env.NOTIFY_FROM || '';
    resendMode = from.includes('resend.dev') ? 'test' : 'live';
    console.log(`Email notifications: enabled via Resend (${resendMode} mode)`);
    if (resendMode === 'test') {
      console.log(`  Test mode: emails only send to ${process.env.RESEND_OWNER_EMAIL || '(RESEND_OWNER_EMAIL not set — no emails will send)'}`);
    }
  } else {
    console.log('Email notifications: disabled (RESEND_API_KEY not set)');
  }
} catch {
  console.log('Email notifications: disabled (resend package not installed)');
}

function canSendEmailTo(recipient) {
  if (!resend) return false;
  if (resendMode === 'live') return true;
  const owner = String(process.env.RESEND_OWNER_EMAIL || '').trim().toLowerCase();
  if (!owner) return false;
  return String(recipient || '').trim().toLowerCase() === owner;
}

/* ---------- Helpers ---------- */
function sendDatabaseError(res, error, operation) {
  console.error(`Supabase ${operation} failed:`, error);
  return res.status(500).json({ error: `Could not ${operation}. Check the Supabase schema and server configuration.` });
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

async function fetchAllRows(buildQuery) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await buildQuery().range(offset, offset + 999);
    if (error) return { data: null, error };
    rows.push(...data);
    if (data.length < 1000) return { data: rows, error: null };
  }
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function cookieOptions(req, maxAge) {
  const secure = req.secure || req.get('x-forwarded-proto') === 'https';
  const sameSite = secure ? 'None' : 'Lax';
  const parts = ['Path=/', 'HttpOnly', `SameSite=${sameSite}`, `Max-Age=${Math.max(0, Math.floor(maxAge / 1000))}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function readCookie(req, name) {
  const prefix = `${name}=`;
  const cookie = String(req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/* ---------- Auth middleware ---------- */
async function optionalAuth(req, res, next) {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return next();

  const { data: session, error } = await supabase
    .from('sessions')
    .select('expires_at, users(id, name, email, role)')
    .eq('token_hash', hashToken(token))
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) return sendDatabaseError(res, error, 'verify the session');
  if (session && session.users) req.user = session.users;
  return next();
}

function requireAuth(req, res, next) {
  optionalAuth(req, res, (error) => {
    if (error) return next(error);
    if (!req.user) return res.status(401).json({ error: 'Please sign in to continue.' });
    return next();
  }).catch(next);
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, (error) => {
    if (error) return next(error);
    if (res.headersSent) return undefined;
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Administrator access is required.' });
    return next();
  });
}

/* ---------- Session creation ---------- */
async function createSession(userId, req, res) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const { error } = await supabase.from('sessions').insert({
    token_hash: hashToken(token),
    user_id: userId,
    expires_at: expiresAt
  });
  if (error) throw error;
  const { error: cleanupError } = await supabase.from('sessions').delete().lt('expires_at', new Date().toISOString());
  if (cleanupError) console.error('Could not clean up expired sign-in sessions:', cleanupError);
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${cookieOptions(req, SESSION_TTL_MS)}`);
}

/* ---------- Multer ---------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) return cb(new Error('Only JPEG, PNG, and WebP image files are allowed.'));
    return cb(null, true);
  }
});

/* ---------- Global middleware ---------- */
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

/* ---------- Health / config ---------- */
app.get('/health', asyncRoute(async (req, res) => {
  const { error } = await supabase.from('reports').select('id', { head: true, count: 'exact' });
  if (error) return sendDatabaseError(res, error, 'connect to the database');
  return res.json({ status: 'ok', database: 'supabase' });
}));

app.get('/api/config', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY });
});

/* ---------- Auth routes ---------- */
app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (name.length < 2 || name.length > 80) return res.status(400).json({ error: 'Name must be between 2 and 80 characters.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 10 || password.length > 256) return res.status(400).json({ error: 'Password must be between 10 and 256 characters.' });

  const salt = crypto.randomBytes(16);
  const derivedKey = await scrypt(password, salt, 64);
  const { data: user, error } = await supabase
    .from('users')
    .insert({ name, email, password_hash: `${salt.toString('hex')}:${derivedKey.toString('hex')}` })
    .select('id, name, email, role')
    .single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'An account with this email already exists.' });
    return sendDatabaseError(res, error, 'create the account');
  }

  return res.status(201).json({ user: publicUser(user) });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const { data: user, error } = await supabase
    .from('users')
    .select('id, name, email, role, password_hash')
    .eq('email', email)
    .maybeSingle();
  if (error) return sendDatabaseError(res, error, 'look up the account');
  if (!user || password.length > 256) return res.status(401).json({ error: 'Email or password is incorrect.' });

  const [saltHex, keyHex] = user.password_hash.split(':');
  const expectedKey = Buffer.from(keyHex || '', 'hex');
  if (expectedKey.length === 0) return res.status(401).json({ error: 'Email or password is incorrect.' });
  const actualKey = await scrypt(password, Buffer.from(saltHex, 'hex'), expectedKey.length);
  if (actualKey.length !== expectedKey.length || !crypto.timingSafeEqual(actualKey, expectedKey)) {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }

  try {
    await createSession(user.id, req, res);
  } catch (sessionError) {
    return sendDatabaseError(res, sessionError, 'create the sign-in session');
  }
  return res.json({ user: publicUser(user) });
}));

app.post('/api/auth/logout', asyncRoute(async (req, res) => {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) {
    const { error } = await supabase.from('sessions').delete().eq('token_hash', hashToken(token));
    if (error) return sendDatabaseError(res, error, 'end the sign-in session');
  }
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; ${cookieOptions(req, 0)}`);
  return res.json({ ok: true });
}));

app.get('/api/auth/me', asyncRoute(async (req, res) => {
  await optionalAuth(req, res, (error) => {
    if (error) throw error;
  });
  if (res.headersSent) return undefined;
  return res.json({ user: req.user ? publicUser(req.user) : null });
}));

app.get('/api/me/reports', requireAuth, asyncRoute(async (req, res) => {
  const { data, error } = await fetchAllRows(() => supabase
    .from('reports').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }));
  if (error) return sendDatabaseError(res, error, 'load your reports');
  return res.json(data);
}));

/* ---------- Report helpers ---------- */
function normalizeReportCategory(value) {
  const raw = String(value || '').trim();
  const aliases = {
    roads: 'Road', road: 'Road', footpaths: 'Footpath', footpath: 'Footpath',
    drainage: 'Drainage', streetlights: 'Streetlight', streetlight: 'Streetlight',
    waste: 'Waste', water: 'Water Supply', 'water supply': 'Water Supply',
    'public space': 'Public Space', other: 'Other'
  };
  return aliases[raw.toLowerCase()] || raw;
}

function rejectReport(req, res, message) {
  return res.status(400).json({ error: message });
}

async function uploadReportPhoto(file) {
  if (!file) return null;
  const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[file.mimetype];
  const filename = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(filename, file.buffer, {
    contentType: file.mimetype,
    cacheControl: '3600',
    upsert: false
  });
  if (error) throw error;
  return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filename).data.publicUrl;
}

async function removeReportPhoto(photoUrl) {
  if (!photoUrl) return;
  const prefix = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/`;
  if (!photoUrl.startsWith(prefix)) return;
  const filename = decodeURIComponent(photoUrl.slice(prefix.length));
  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove([filename]);
  if (error) throw error;
}

/* ---------- Report routes ---------- */
app.get('/api/reports', asyncRoute(async (req, res) => {
  const validCategories = ['Road', 'Footpath', 'Drainage', 'Streetlight', 'Waste', 'Water Supply', 'Public Space', 'Other'];
  const validStatuses = ['Pending', 'In Progress', 'Resolved'];
  const validSeverities = ['Low', 'Medium', 'High'];
  const category = req.query.category ? normalizeReportCategory(req.query.category) : null;
  const status = req.query.status ? String(req.query.status) : null;
  const severity = req.query.severity ? String(req.query.severity) : null;
  const requestedPage = req.query.page === undefined ? '1' : String(req.query.page);
  const requestedPageSize = req.query.pageSize === undefined ? '20' : String(req.query.pageSize);
  const page = Number(requestedPage);
  const pageSize = Number(requestedPageSize);
  const sort = String(req.query.sort || 'newest');
  const search = req.query.q === undefined ? '' : String(req.query.q).replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();

  if (category && !validCategories.includes(category)) return res.status(400).json({ error: 'Choose a valid report category filter.' });
  if (status && !validStatuses.includes(status)) return res.status(400).json({ error: 'Choose a valid report status filter.' });
  if (severity && !validSeverities.includes(severity)) return res.status(400).json({ error: 'Choose a valid report severity filter.' });
  if (!/^\d+$/.test(requestedPage) || !Number.isSafeInteger(page) || page < 1) return res.status(400).json({ error: 'Page must be a positive whole number.' });
  if (!/^\d+$/.test(requestedPageSize) || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    return res.status(400).json({ error: 'Page size must be a whole number from 1 to 100.' });
  }
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(offset + pageSize - 1)) return res.status(400).json({ error: 'Requested page is too large.' });
  if (!['newest', 'oldest', 'severity'].includes(sort)) return res.status(400).json({ error: 'Choose a valid report sort order.' });
  if (req.query.q !== undefined && (search.length < 2 || search.length > 80)) {
    return res.status(400).json({ error: 'Search must contain between 2 and 80 letters or numbers.' });
  }

  let query = supabase.from('reports').select('*', { count: 'exact' });
  if (category) query = query.eq('category', category);
  if (status) query = query.eq('status', status);
  if (severity) query = query.eq('severity', severity);
  if (search) {
    const pattern = `*${search.replace(/\s+/g, '*')}*`;
    query = query.or(`description.ilike.${pattern},address.ilike.${pattern},reporter_name.ilike.${pattern}`);
  }
  if (sort === 'severity') {
    query = query.order('severity_rank', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: sort === 'oldest' }).order('id', { ascending: sort === 'oldest' });
  }
  const { data, error, count } = await query.range(offset, offset + pageSize - 1);
  if (error) return sendDatabaseError(res, error, 'load reports');
  res.set('Cache-Control', 'no-store');
  return res.json({
    reports: data,
    total: count || 0,
    page,
    pageSize,
    totalPages: Math.ceil((count || 0) / pageSize)
  });
}));

app.get('/api/reports/:id', asyncRoute(async (req, res) => {
  const { data, error } = await supabase.from('reports').select('*').eq('id', req.params.id).maybeSingle();
  if (error) return sendDatabaseError(res, error, 'load the report');
  if (!data) return res.status(404).json({ error: 'Report not found.' });
  return res.json(data);
}));

app.get('/api/reports/:id/history', asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('report_status_history')
    .select('*')
    .eq('report_id', req.params.id)
    .order('changed_at', { ascending: false });
  if (error) return sendDatabaseError(res, error, 'load report history');
  return res.json(data);
}));

app.post('/api/reports', upload.single('photo'), requireAuth, asyncRoute(async (req, res) => {
  if (res.headersSent) return undefined;

  const rawCategory = String(req.body.category || '').trim();
  const category = normalizeReportCategory(rawCategory);
  const description = String(req.body.description || '').trim();
  const validCategories = ['Road', 'Footpath', 'Drainage', 'Streetlight', 'Waste', 'Water Supply', 'Public Space', 'Other'];
  if (!validCategories.includes(category) || !description) return rejectReport(req, res, 'Choose a valid category and provide a description.');

  const address = String(req.body.address || '').trim();
  const latitude = req.body.latitude !== '' && req.body.latitude != null ? Number(req.body.latitude) : null;
  const longitude = req.body.longitude !== '' && req.body.longitude != null ? Number(req.body.longitude) : null;
  if ((latitude !== null && !Number.isFinite(latitude)) || (longitude !== null && !Number.isFinite(longitude))) return rejectReport(req, res, 'Latitude and longitude must be valid numbers.');
  if ((latitude === null) !== (longitude === null)) return rejectReport(req, res, 'Provide both latitude and longitude, or leave both empty.');
  if (latitude !== null && (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)) return rejectReport(req, res, 'Latitude must be between -90 and 90 and longitude between -180 and 180.');
  if (description.length > 3000 || address.length > 300) return rejectReport(req, res, 'Description must be under 3000 characters and address under 300 characters.');

  const severity = ['Low', 'Medium', 'High'].includes(req.body.severity) ? req.body.severity : 'Medium';
  const reporterName = req.user.name;

  let photoUrl;
  try {
    photoUrl = await uploadReportPhoto(req.file);
  } catch (error) {
    console.error('Could not upload report photo to Supabase Storage:', error);
    return res.status(502).json({ error: 'Could not upload the photo. Check the Supabase Storage bucket configuration.' });
  }

  const { data, error } = await supabase.from('reports').insert({
    category, description, address: address || null, latitude, longitude,
    photo: photoUrl, reporter_name: reporterName, severity,
    status: 'Pending', user_id: req.user.id
  }).select('*').single();
  if (error) {
    if (photoUrl) {
      try {
        await removeReportPhoto(photoUrl);
      } catch (cleanupError) {
        console.error('Could not remove photo after report save failed:', cleanupError);
      }
    }
    return sendDatabaseError(res, error, 'save the report');
  }
  return res.status(201).json(data);
}));

app.patch('/api/reports/:id', requireAdmin, asyncRoute(async (req, res) => {
  const validStatuses = ['Pending', 'In Progress', 'Resolved'];
  const status = String(req.body.status || '').trim();
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Status must be Pending, In Progress, or Resolved.' });

  const { data: existing, error: lookupError } = await supabase
    .from('reports').select('status').eq('id', req.params.id).maybeSingle();
  if (lookupError) return sendDatabaseError(res, lookupError, 'load the report');
  if (!existing) return res.status(404).json({ error: 'Report not found.' });

  const { data, error } = await supabase
    .from('reports').update({ status }).eq('id', req.params.id).select('*').maybeSingle();
  if (error) return sendDatabaseError(res, error, 'update the report');

  if (existing.status !== status) {
    const { error: historyError } = await supabase.from('report_status_history').insert({
      report_id: data.id,
      old_status: existing.status,
      new_status: status,
      changed_by: req.user.id
    });
    if (historyError) console.warn('Could not record status history:', historyError.message);

    if (resend && data.user_id) {
      (async () => {
        try {
          const { data: reporter } = await supabase
            .from('users').select('email, name')
            .eq('id', data.user_id).maybeSingle();
          if (!reporter?.email) return;

          if (!canSendEmailTo(reporter.email)) {
            console.log(`Email skipped for ${reporter.email} (not allowed in ${resendMode} mode — set RESEND_OWNER_EMAIL or verify a domain)`);
            return;
          }

          await resend.emails.send({
            from: process.env.NOTIFY_FROM || 'onboarding@resend.dev',
            to: reporter.email,
            subject: `Your ${data.category} report is now ${status}`,
            html: `
              <div style="font-family:system-ui,-apple-system,sans-serif; max-width:560px; line-height:1.5; color:#0f172a;">
                <h2 style="color:#2563eb; margin-bottom:.5rem;">Your report status has changed</h2>
                <p>Hi ${reporter.name || 'there'},</p>
                <p>Your report "<em>${String(data.description).slice(0, 100)}…</em>" was updated to <strong>${status}</strong>.</p>
                <p style="color:#64748b; font-size:.9rem; margin-top:1.5rem;">— Civic Infra Mapper</p>
              </div>`
          });
          console.log(`Notification email sent to ${reporter.email} (report ${data.id})`);
        } catch (emailErr) {
          console.warn('Email notification failed:', emailErr.message);
        }
      })();
    }
  }

  return res.json(data);
}));

app.delete('/api/reports/:id', requireAdmin, asyncRoute(async (req, res) => {
  const { data: report, error: selectError } = await supabase.from('reports').select('*').eq('id', req.params.id).maybeSingle();
  if (selectError) return sendDatabaseError(res, selectError, 'load the report');
  if (!report) return res.status(404).json({ error: 'Report not found.' });
  const { error } = await supabase.from('reports').delete().eq('id', req.params.id);
  if (error) return sendDatabaseError(res, error, 'delete the report');
  try {
    await removeReportPhoto(report.photo);
  } catch (photoError) {
    console.error('Report was deleted, but its photo could not be removed:', photoError);
  }
  return res.json({ message: 'Report deleted successfully.' });
}));

/* ---------- Stats ---------- */
app.get('/api/stats', asyncRoute(async (req, res) => {
  const [{ data: reports, error: reportsError }, { count: surveyCount, error: surveysError }] = await Promise.all([
    fetchAllRows(() => supabase.from('reports').select('*').order('created_at', { ascending: false })),
    supabase.from('surveys').select('id', { count: 'exact', head: true })
  ]);
  if (reportsError) return sendDatabaseError(res, reportsError, 'load dashboard reports');
  if (surveysError) return sendDatabaseError(res, surveysError, 'count survey responses');

  const byCategory = new Map();
  const bySeverity = new Map();
  const counts = { pending: 0, progress: 0, resolved: 0 };
  for (const report of reports) {
    byCategory.set(report.category, (byCategory.get(report.category) || 0) + 1);
    bySeverity.set(report.severity, (bySeverity.get(report.severity) || 0) + 1);
    if (report.status === 'Pending') counts.pending++;
    else if (report.status === 'In Progress') counts.progress++;
    else if (report.status === 'Resolved') counts.resolved++;
  }
  const recent = reports.slice(0, 5);
  const mapReports = reports
    .filter((report) => report.latitude !== null && report.latitude !== undefined &&
      report.longitude !== null && report.longitude !== undefined)
    .map(({ id, category, description, latitude, longitude, photo, status, address, reporter_name, severity, created_at }) => ({
      id, category, description, latitude, longitude, photo, status, address, reporter_name, severity, created_at
    }));

  return res.json({
    total: reports.length,
    ...counts,
    byCategory: [...byCategory].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
    bySeverity: [...bySeverity].map(([severity, count]) => ({ severity, count })).sort((a, b) => b.count - a.count),
    mapReports,
    recent,
    surveyCount: surveyCount || 0
  });
}));

/* ---------- POST /api/surveys — AUTH REQUIRED ---------- */
app.post('/api/surveys', requireAuth, asyncRoute(async (req, res) => {
  const area = String(req.body.area || '').trim();
  const fields = ['roads', 'drainage', 'streetlights', 'waste', 'water', 'footpaths'];
  const scores = Object.fromEntries(fields.map((field) => {
    const value = req.body[field];
    return [field, value === undefined || value === '' ? 3 : Number(value)];
  }));
  const biggestProblem = String(req.body.biggest_problem || '').trim();
  const suggestion = String(req.body.suggestion || '').trim();

  if (Object.values(scores).some((score) => !Number.isInteger(score) || score < 1 || score > 5)) {
    return res.status(400).json({ error: 'Each facility rating must be a whole number from 1 to 5.' });
  }
  if (area.length > 120 || biggestProblem.length > 80 || suggestion.length > 3000) {
    return res.status(400).json({ error: 'Survey text exceeds the allowed length.' });
  }

  const { data, error } = await supabase.from('surveys').insert({
    name: req.user.name,
    area: area || 'Unknown area',
    ...scores,
    biggest_problem: biggestProblem || null,
    suggestion: suggestion || null
  }).select('*').single();
  if (error) return sendDatabaseError(res, error, 'save the survey response');
  return res.status(201).json(data);
}));

app.get('/api/surveys', asyncRoute(async (req, res) => {
  const { data, error } = await fetchAllRows(() => supabase.from('surveys').select('*').order('created_at', { ascending: false }));
  if (error) return sendDatabaseError(res, error, 'load survey responses');
  return res.json(data);
}));

app.get('/api/surveys/stats', asyncRoute(async (req, res) => {
  const fields = ['roads', 'drainage', 'streetlights', 'waste', 'water', 'footpaths'];
  const [{ data, error }, { count, error: countError }] = await Promise.all([
    fetchAllRows(() => supabase.from('surveys').select([...fields, 'biggest_problem'].join(','))),
    supabase.from('surveys').select('id', { count: 'exact', head: true })
  ]);
  if (error) return sendDatabaseError(res, error, 'load survey averages');
  if (countError) return sendDatabaseError(res, countError, 'count survey responses');
  const averages = Object.fromEntries(fields.map((field) => {
    const average = data.length ? data.reduce((sum, row) => sum + Number(row[field]), 0) / data.length : 0;
    return [field, Number(average.toFixed(1))];
  }));
  const problems = new Map();
  for (const survey of data) {
    if (survey.biggest_problem) problems.set(survey.biggest_problem, (problems.get(survey.biggest_problem) || 0) + 1);
  }
  return res.json({
    total: count || 0,
    ...averages,
    problems: [...problems].map(([name, problemCount]) => ({ name, count: problemCount })).sort((a, b) => b.count - a.count)
  });
}));

/* ---------- Error handler ---------- */
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof multer.MulterError) return res.status(400).json({ error: error.message });
  if (error.message && error.message.startsWith('Only JPEG, PNG, and WebP')) return res.status(400).json({ error: error.message });
  if (error.message && error.message.includes('not allowed by CORS')) {
    console.warn('CORS blocked request from', req.headers.origin, '— add it to CORS_ORIGINS');
    return res.status(403).json({ error: 'Origin not allowed. Check the server CORS_ORIGINS setting.' });
  }
  console.error('Unhandled server error:', error);
  return res.status(500).json({ error: 'Internal server error.' });
});

/* ---------- Admin bootstrap ---------- */
async function bootstrapConfiguredAdmin() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (!email && !password) return;
  if (!email || password.length < 10) throw new Error('Set both ADMIN_EMAIL and an ADMIN_PASSWORD with at least 10 characters to bootstrap an administrator.');

  const salt = crypto.randomBytes(16);
  const derivedKey = await scrypt(password, salt, 64);
  const passwordHash = `${salt.toString('hex')}:${derivedKey.toString('hex')}`;
  const { data: existingUser, error: lookupError } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
  if (lookupError) throw lookupError;
  if (existingUser) {
    const { error } = await supabase.from('users')
      .update({ role: 'admin', password_hash: passwordHash })
      .eq('id', existingUser.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('users').insert({
    name: 'Civic Administrator',
    email,
    password_hash: passwordHash,
    role: 'admin'
  });
  if (error) throw error;
}

/* ---------- Start ---------- */
async function start() {
  await bootstrapConfiguredAdmin();
  app.listen(PORT, () => {
    console.log(`Civic Infra Mapper API listening on port ${PORT}`);
    console.log(`Allowed CORS origins: ${ALLOWED_ORIGINS.join(', ') || '(none)'}`);
  });
}

start().catch((error) => {
  console.error('Could not start the application. Check Supabase credentials, run supabase/schema.sql, and verify connectivity:', error);
  process.exitCode = 1;
});