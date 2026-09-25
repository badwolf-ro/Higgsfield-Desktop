// Cinema Studio projects, picked up automatically. Higgsfield keeps projects
// on its side (it calls them folders); when a tab is inside one, files
// downloaded from that tab are saved in a folder named after the project.
// Stored in userData/projects.json. Call load() after app 'ready'.
// Emits 'change' (list) when a project is added, renamed, moved or forgotten.
const { app } = require('electron');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NAME = 60;
// Higgsfield rewrites /generate?projectId=<id> to /generate/@user/<slug>;
// a slug page seen this soon after an id page in the same tab is the same project.
const CANONICAL_REDIRECT_MS = 15000;

// The Cinema Studio project a URL is in, or null.
function detect(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:' || !/(^|\.)higgsfield\.ai$/.test(u.hostname)) return null;
  const slug = u.pathname.match(/^\/generate\/(@[^/]+\/[^/]+)/);
  if (slug) {
    const s = decodeURIComponent(slug[1]);
    return { key: 'slug:' + s, slug: s, id: null, url: `https://higgsfield.ai/generate/${slug[1]}` };
  }
  if (!/^\/generate\/?$/.test(u.pathname)) return null;
  const id = u.searchParams.get('projectId') || u.searchParams.get('cinematic-project-id');
  if (!id || !UUID.test(id)) return null;
  return { key: 'id:' + id.toLowerCase(), slug: null, id: id.toLowerCase(), url: `https://higgsfield.ai/generate?projectId=${id}` };
}

// "@wolf/nike-spot-2" -> "Nike spot 2"
function nameFromSlug(slug) {
  const words = slug.split('/').pop().replace(/[-_]+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : 'Cinema Studio project';
}

function cleanName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
}

// A project name as a Windows folder name. Same rule as the Settings page preview.
function folderName(name) {
  const safe = String(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').replace(/[. ]+$/, '').trim();
  return safe || 'Project';
}

class Projects extends EventEmitter {
  constructor() {
    super();
    this.items = [];
    this.getRoot = () => app.getPath('downloads');
  }

  get file() {
    return path.join(app.getPath('userData'), 'projects.json');
  }

  // getRoot(): the download folder from Settings.
  load({ getRoot }) {
    if (getRoot) this.getRoot = getRoot;
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (Array.isArray(data.items)) this.items = data.items.filter(p => p && p.key && p.name);
    } catch { /* none yet */ }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify({ items: this.items }));
    } catch (err) {
      console.error('Could not save projects:', err);
    }
  }

  changed() {
    this.save();
    this.emit('change', this.list());
  }

  get(key) {
    return this.items.find(p => p.key === key) || null;
  }

  folderFor(project) {
    return project.downloadFolder || path.join(this.getRoot(), folderName(project.name));
  }

  // Most recently used first.
  list() {
    return [...this.items]
      .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
      .map(p => ({
        key: p.key,
        name: p.name,
        url: p.url,
        downloadFolder: this.folderFor(p),
        customFolder: !!p.downloadFolder,
        lastSeen: p.lastSeen || 0,
      }));
  }

  // A tab navigated to `url`. previous: { key, at } of that tab's last project.
  // Returns the project the tab is now in, or null.
  seen(url, previous) {
    const found = detect(url);
    if (!found) return null;
    let project = this.get(found.key);
    let isNew = false;

    if (!project && found.slug && previous && previous.key.startsWith('id:')
        && Date.now() - previous.at < CANONICAL_REDIRECT_MS) {
      // The same project, now under its canonical address.
      project = this.get(previous.key);
      if (project) {
        project.key = found.key;
        project.url = found.url;
        project.slug = found.slug;
        if (!project.customName) project.name = nameFromSlug(found.slug);
        isNew = true;
      }
    }
    if (!project) {
      project = {
        key: found.key,
        id: found.id,
        slug: found.slug,
        url: found.url,
        name: found.slug ? nameFromSlug(found.slug) : 'Cinema Studio project',
        customName: false,
        downloadFolder: null,
      };
      this.items.push(project);
      isNew = true;
    }
    const stale = Date.now() - (project.lastSeen || 0) > 60 * 1000;
    project.lastSeen = Date.now();
    if (isNew) this.changed();
    else if (stale) this.save();
    return project;
  }

  // A rename made on Higgsfield, from its live event stream.
  renamedOnHiggsfield(id, name) {
    const clean = cleanName(name);
    const project = this.items.find(p => p.id && p.id === String(id).toLowerCase());
    if (!project || project.customName || !clean || project.name === clean) return;
    project.name = clean;
    this.changed();
  }

  // The operations below return { ok: true, project } or { ok: false, error }.

  rename(key, name) {
    const project = this.get(key);
    if (!project) return { ok: false, error: 'That project is no longer in the list.' };
    const clean = cleanName(name);
    if (!clean) return { ok: false, error: 'Give the project a name.' };
    project.name = clean;
    project.customName = true;
    this.changed();
    return { ok: true, project };
  }

  // folder null = back to "<download folder>\<project name>".
  setFolder(key, folder) {
    const project = this.get(key);
    if (!project) return { ok: false, error: 'That project is no longer in the list.' };
    if (folder && !path.isAbsolute(folder)) return { ok: false, error: 'Choose a full folder path.' };
    project.downloadFolder = folder || null;
    this.changed();
    return { ok: true, project };
  }

  // Forgets it in the app only; nothing is deleted on Higgsfield or on disk.
  forget(key) {
    const project = this.get(key);
    if (!project) return { ok: false, error: 'That project is no longer in the list.' };
    this.items = this.items.filter(p => p !== project);
    this.changed();
    return { ok: true, project };
  }
}

module.exports = new Projects();
module.exports.detect = detect;
module.exports.nameFromSlug = nameFromSlug;
