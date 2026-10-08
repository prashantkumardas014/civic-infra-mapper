require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env before seeding Supabase.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const reports = [
  { category: 'Road', description: 'Large potholes are forming near the market road after rain.', address: 'S.T. Road, Silvassa', latitude: 20.2726, longitude: 73.0134, reporter_name: 'Riya', severity: 'High', status: 'Pending' },
  { category: 'Drainage', description: 'Blocked drains are causing waterlogging in the residential lane.', address: 'Khanvel Road, Silvassa', latitude: 20.2781, longitude: 73.0217, reporter_name: 'Amit', severity: 'High', status: 'In Progress' },
  { category: 'Streetlight', description: 'Streetlights are non-functional near the park and bus stop.', address: 'Park View Colony, Silvassa', latitude: 20.2755, longitude: 73.0188, reporter_name: 'Nisha', severity: 'Medium', status: 'Pending' },
  { category: 'Waste', description: 'Garbage bins are overflowing beside the school entrance.', address: 'Govt. School Road, Silvassa', latitude: 20.2689, longitude: 73.0078, reporter_name: 'Karan', severity: 'Medium', status: 'Resolved' },
  { category: 'Water Supply', description: 'Water supply is irregular and pressure is very low in the evening.', address: 'Nagar Parishad Area, Silvassa', latitude: 20.2799, longitude: 73.0124, reporter_name: 'Mehul', severity: 'High', status: 'In Progress' },
  { category: 'Footpath', description: 'Footpath near the main market is broken and unsafe for pedestrians.', address: 'Main Market, Silvassa', latitude: 20.2708, longitude: 73.0106, reporter_name: 'Priya', severity: 'Medium', status: 'Pending' },
  { category: 'Public Space', description: 'Public garden benches are damaged and open drains are nearby.', address: 'Town Garden, Silvassa', latitude: 20.2768, longitude: 73.0264, reporter_name: 'Anil', severity: 'Low', status: 'Resolved' },
  { category: 'Other', description: 'Uncovered manhole near the commercial lane needs signage and repair.', address: 'Industrial Area Road, Silvassa', latitude: 20.2648, longitude: 73.0202, reporter_name: 'Sana', severity: 'High', status: 'Pending' }
];

const surveys = [
  { name: 'Rohit', area: 'Market Ward', roads: 2, drainage: 3, streetlights: 2, waste: 4, water: 3, footpaths: 2, biggest_problem: 'Roads', suggestion: 'Repair potholes and improve road resurfacing.' },
  { name: 'Leena', area: 'Residential Colony', roads: 3, drainage: 2, streetlights: 3, waste: 2, water: 4, footpaths: 3, biggest_problem: 'Drainage', suggestion: 'Clear drains before monsoon and inspect blocked channels.' },
  { name: 'Farhan', area: 'School Zone', roads: 2, drainage: 3, streetlights: 4, waste: 1, water: 3, footpaths: 2, biggest_problem: 'Waste', suggestion: 'Add more bins and schedule regular cleaning.' },
  { name: 'Divya', area: 'Town Garden', roads: 4, drainage: 4, streetlights: 3, waste: 3, water: 2, footpaths: 4, biggest_problem: 'Water Supply', suggestion: 'Increase water pressure and install maintenance checks.' }
];

async function seed() {
  const [{ count: reportCount, error: reportsError }, { count: surveyCount, error: surveysError }] = await Promise.all([
    supabase.from('reports').select('id', { count: 'exact', head: true }),
    supabase.from('surveys').select('id', { count: 'exact', head: true })
  ]);
  if (reportsError) throw reportsError;
  if (surveysError) throw surveysError;
  if (reportCount || surveyCount) {
    throw new Error('Supabase already has report or survey data. Demo seed was stopped to protect existing data.');
  }

  const { error: insertReportsError } = await supabase.from('reports').insert(reports);
  if (insertReportsError) throw insertReportsError;
  const { error: insertSurveysError } = await supabase.from('surveys').insert(surveys);
  if (insertSurveysError) throw insertSurveysError;
  console.log('Demo reports and surveys inserted into Supabase.');
}

seed().catch((error) => {
  console.error('Could not seed Supabase:', error);
  process.exitCode = 1;
});
