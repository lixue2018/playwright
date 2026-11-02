const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FIXTURE_PATH = path.join(ROOT, 'fixtures', 'devsecops', 'fixture_projects.json');

function loadDevsecopsFixture() {
  if (!fs.existsSync(FIXTURE_PATH)) return null;
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
}

function hasProject(row) {
  if (!row || typeof row !== 'object') return false;
  if (row.project_id != null && String(row.project_id).trim() !== '') return true;
  if (row.name && String(row.name).trim() !== '') return true;
  return false;
}

function requireCase(fixture, key) {
  const row = fixture && fixture[key];
  if (!hasProject(row)) {
    return null;
  }
  return row;
}

module.exports = {
  FIXTURE_PATH,
  loadDevsecopsFixture,
  hasProject,
  requireCase,
};
