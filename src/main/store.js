// Small JSON files in the userData folder, and the names users give to saved things.
const fs = require('fs');
const path = require('path');

const MAX_NAME = 60;

// The parsed file, or null when it is missing or unreadable.
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function writeJson(file, data, space) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, space));
  } catch (err) {
    console.error(`Could not save ${path.basename(file)}:`, err);
  }
}

// A workspace or project name: one line, trimmed, at most MAX_NAME characters.
function cleanName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
}

module.exports = { readJson, writeJson, cleanName };
