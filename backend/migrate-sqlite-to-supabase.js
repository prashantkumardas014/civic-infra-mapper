require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { createClient } = require('@supabase/supabase-js');

const sqlitePath = path.resolve(process.env.SQLITE_PATH || path.join(__dirname, 'civic.db'));
const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, 'uploads'));
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env before importing SQLite data.');
}
if (!fs.existsSync(sqlitePath)) {
  throw new Error(`SQLite database not found: ${sqlitePath}`);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
const mimeTypes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

async function requireEmptySupabase() {
  for (const table of ['users', 'reports', 'surveys']) {
    const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true });
    if (error) throw error;
    if (count) throw new Error(`Supabase table "${table}" is not empty. Import is stopped to prevent overwriting or duplicating data. Run the import before starting the app or bootstrapping the admin.`);
  }
}

async function migratePhoto(photoPath) {
  if (!photoPath || /^https:\/\//i.test(photoPath)) return photoPath || null;
  const filename = path.basename(photoPath);
  const localPath = path.join(uploadsDir, filename);
  if (!fs.existsSync(localPath)) {
    console.warn(`Photo file not found; importing report without it: ${filename}`);
    return null;
  }
  const contentType = mimeTypes[path.extname(filename).toLowerCase()];
  if (!contentType) {
    console.warn(`Unsupported photo type; importing report without it: ${filename}`);
    return null;
  }
  const { error } = await supabase.storage.from('report-photos').upload(filename, fs.readFileSync(localPath), {
    contentType,
    upsert: true
  });
  if (error) throw error;
  return supabase.storage.from('report-photos').getPublicUrl(filename).data.publicUrl;
}

async function migrate() {
  await requireEmptySupabase();
  const hasUsers = sqlite.prepare("select name from sqlite_master where type = 'table' and name = 'users'").get();
  const users = hasUsers ? sqlite.prepare('select * from users order by id').all() : [];
  const reports = sqlite.prepare('select * from reports order by id').all();
  const hasSurveys = sqlite.prepare("select name from sqlite_master where type = 'table' and name = 'surveys'").get();
  const surveys = hasSurveys ? sqlite.prepare('select * from surveys order by id').all() : [];

  if (users.length) {
    const rows = users.map(({ id, name, email, password_hash, role, created_at }) => ({
      id, name, email: email.toLowerCase(), password_hash, role: role || 'user', created_at: created_at || new Date().toISOString()
    }));
    const { error } = await supabase.from('users').insert(rows);
    if (error) throw error;
  }

  for (const report of reports) {
    const importedReport = {
      id: report.id,
      category: report.category,
      description: report.description,
      address: report.address || null,
      latitude: report.latitude,
      longitude: report.longitude,
      photo: await migratePhoto(report.photo),
      reporter_name: report.reporter_name || 'Anonymous',
      severity: report.severity || 'Medium',
      status: report.status || 'Pending',
      user_id: report.user_id || null,
      created_at: report.created_at || new Date().toISOString()
    };
    const { error } = await supabase.from('reports').insert(importedReport);
    if (error) throw error;
  }

  if (surveys.length) {
    const rows = surveys.map((survey) => ({
      id: survey.id,
      name: survey.name || 'Anonymous',
      area: survey.area || 'Unknown area',
      roads: survey.roads || 3,
      drainage: survey.drainage || 3,
      streetlights: survey.streetlights || 3,
      waste: survey.waste || 3,
      water: survey.water || 3,
      footpaths: survey.footpaths || 3,
      biggest_problem: survey.biggest_problem || null,
      suggestion: survey.suggestion || null,
      created_at: survey.created_at || new Date().toISOString()
    }));
    const { error } = await supabase.from('surveys').insert(rows);
    if (error) throw error;
  }

  const { error: sequenceError } = await supabase.rpc('reset_civic_id_sequences');
  if (sequenceError) throw sequenceError;
  console.log(`Imported ${users.length} users, ${reports.length} reports, and ${surveys.length} surveys. Sign in again after migration; sessions are not transferred.`);
}

migrate()
  .catch((error) => {
    console.error('SQLite import failed:', error);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
