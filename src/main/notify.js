// "Generation finished" alerts.
//
// Higgsfield reports job progress over one Server-Sent Events stream per user
// (event `job:status_changed`) and falls back to polling /jobs/status-batch.
// The site shows no notification of its own for image or video jobs, so each
// tab's network traffic is read through the Chrome DevTools Protocol and the
// same "finished" rule the site uses is applied here.
const { Notification } = require('electron');
const cdp = require('./cdp');

const API = 'https:\\/\\/fnf-api-gw\\.higgsfield\\.ai';
const SSE = new RegExp(`^${API}\\/fnf-notification\\/notifications\\/stream(\\?.*)?$`);
const BATCH = new RegExp(`^${API}\\/fnf\\/jobs\\/status-batch(\\?.*)?$`);
const JOB_SET = new RegExp(`^${API}\\/fnf\\/job-sets\\/[^/?]+(\\?.*)?$`);
const CREATE = new RegExp(`^${API}\\/fnf\\/jobs\\/(v2\\/)?[^/?]+(\\?.*)?$`);

const FAILURES = {
  failed: 'failed',
  nsfw: 'was blocked by the content filter',
  ip_detected: 'was blocked for protected content',
};
const MAX_JOBS = 2000;
// A job with no news for this long no longer counts as generating (a missed update).
const STALE_MS = 45 * 60 * 1000;

let opts = null;
const jobs = new Map(); // job id -> { owner: webContentsId|null, type, done, since }
const shown = new Set(); // keeps Notification objects alive until clicked or closed

function isFinished(status, ipCheckFinished) {
  if (status === 'completed') return ipCheckFinished !== false;
  return status in FAILURES || status === 'canceled';
}

// "kling3_0" -> "Kling 3.0", "nano_banana_flash" -> "Nano Banana Flash"
function modelLabel(type) {
  if (!type) return 'Your generation';
  return String(type)
    .replace(/(\d)_(\d)/g, '$1.$2')
    .replace(/([a-z]{2,})(\d)/gi, '$1 $2')
    .split(/[_\s]+/)
    .filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

function generatingCount() {
  const now = Date.now();
  let n = 0;
  for (const job of jobs.values()) if (!job.done && now - job.since < STALE_MS) n++;
  return n;
}

let lastCount = 0;
function reportStatus() {
  const n = generatingCount();
  if (n === lastCount) return;
  lastCount = n;
  if (opts.onStatus) opts.onStatus(n);
}

function announce(job, status) {
  const { settings, getWindow, getTab, onClick, icon } = opts;
  if (status === 'canceled') return; // the user did that themselves
  const prefs = settings.get().notifications;
  const win = getWindow();
  const tab = job.owner != null ? getTab(job.owner) : null;
  const focused = !!win && win.isVisible() && win.isFocused();
  if (focused && (!tab || tab.visible)) return; // they are looking at it

  if (prefs.flashTaskbar && win && !focused) win.flashFrame(true);
  if (!prefs.generationDone || !Notification.isSupported()) return;

  const where = tab && tab.title ? ` in ${tab.title}` : '';
  const failed = status !== 'completed';
  const notification = new Notification({
    title: failed ? 'Generation failed' : 'Generation ready',
    body: `${modelLabel(job.type)} ${failed ? FAILURES[status] : 'is ready'}${where}.`,
    icon,
  });
  shown.add(notification);
  const release = () => shown.delete(notification);
  notification.on('click', () => { release(); onClick(job.owner); });
  notification.on('close', release);
  notification.show();
}

// live: the update came from the event stream, so a first sighting that is
// already finished is a real completion. Poll responses also list jobs that
// finished long ago, so those only count after an unfinished sighting.
function update(payload, live) {
  if (!payload || typeof payload !== 'object') return;
  const id = payload.job_id || payload.id;
  const status = payload.status;
  if (!id || !status) return;
  const finished = isFinished(status, payload.ip_check_finished);

  let job = jobs.get(id);
  if (!job) {
    job = { owner: null, type: payload.job_set_type || null, done: finished && !live, since: Date.now() };
    jobs.set(id, job);
    if (jobs.size > MAX_JOBS) jobs.delete(jobs.keys().next().value);
  }
  if (!job.type && payload.job_set_type) job.type = payload.job_set_type;
  if (!job.done && !finished) job.since = Date.now();
  if (job.done || !finished) return reportStatus();
  job.done = true;
  reportStatus();
  announce(job, status);
}

// Records which tab started a job, so its alert can bring that tab forward.
function registerCreated(body, owner) {
  const list = body && Array.isArray(body.jobs) ? body.jobs : [];
  for (const j of list) {
    if (!j || !j.id) continue;
    const job = jobs.get(j.id) || { owner, type: null, done: false, since: Date.now() };
    job.owner = owner;
    job.type = job.type || body.type || body.job_set_type || j.job_set_type || null;
    jobs.set(j.id, job);
  }
  reportStatus();
}

function parseSse(request, text) {
  request.buffer += text.replace(/\r\n?/g, '\n');
  const blocks = request.buffer.split('\n\n');
  request.buffer = blocks.pop();
  for (const block of blocks) {
    let event = 'message';
    const data = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (!data.length) continue;
    let payload;
    try { payload = JSON.parse(data.join('\n')); } catch { continue; }
    if (event === 'message' && payload && payload.type === 'job:status_changed') {
      event = payload.type;
      payload = payload.data || payload;
    }
    if (event === 'job:status_changed') update(payload, true);
    else if (event === 'folder:update' && payload && payload.folder_id && payload.name && opts.onFolderRenamed) {
      opts.onFolderRenamed(payload.folder_id, payload.name);
    }
  }
}

function classify(method, url) {
  if (method === 'GET' && SSE.test(url)) return 'sse';
  if (method === 'POST' && BATCH.test(url)) return 'batch';
  if (method === 'GET' && JOB_SET.test(url)) return 'jobset';
  if (method === 'POST' && CREATE.test(url)) return 'create';
  return null;
}

function handleBody(kind, text, owner) {
  let body;
  try { body = JSON.parse(text); } catch { return; }
  if (kind === 'create') registerCreated(body, owner);
  else if (kind === 'batch' && Array.isArray(body.items)) body.items.forEach(item => update(item, false));
  else if (kind === 'jobset' && Array.isArray(body.jobs)) {
    body.jobs.forEach(j => update({ job_set_type: body.type, ...j }, false));
  }
}

// Called for every tab's webContents.
function watch(contents) {
  let dbg;
  try {
    dbg = cdp.attach(contents);
  } catch (err) {
    console.warn('Generation alerts unavailable for this tab:', err.message);
    return;
  }
  const owner = contents.id;
  const requests = new Map(); // CDP requestId -> { kind, buffer, decoder, ready, queue }
  const send = (method, params) => dbg.sendCommand(method, params).catch(() => null);

  const feed = (request, base64) => {
    parseSse(request, request.decoder.decode(Buffer.from(base64, 'base64'), { stream: true }));
  };

  dbg.on('message', (_event, method, params) => {
    const request = params && params.requestId ? requests.get(params.requestId) : null;
    switch (method) {
      case 'Network.requestWillBeSent': {
        const kind = classify(params.request.method, params.request.url);
        if (kind) {
          requests.set(params.requestId, { kind, buffer: '', decoder: new TextDecoder(), ready: false, queue: [] });
        }
        break;
      }
      case 'Network.responseReceived':
        if (request && request.kind === 'sse') {
          send('Network.streamResourceContent', { requestId: params.requestId }).then(result => {
            if (result && result.bufferedData) feed(request, result.bufferedData);
            request.queue.forEach(chunk => feed(request, chunk));
            request.queue = [];
            request.ready = true;
          });
        }
        break;
      case 'Network.dataReceived':
        // `data` is only present once streamResourceContent is active.
        if (request && request.kind === 'sse' && params.data) {
          if (request.ready) feed(request, params.data);
          else request.queue.push(params.data);
        }
        break;
      case 'Network.loadingFinished':
        if (!request) break;
        requests.delete(params.requestId);
        if (request.kind !== 'sse') {
          send('Network.getResponseBody', { requestId: params.requestId }).then(result => {
            if (!result) return;
            const text = result.base64Encoded ? Buffer.from(result.body, 'base64').toString('utf8') : result.body;
            handleBody(request.kind, text, owner);
          });
        }
        break;
      case 'Network.loadingFailed':
        requests.delete(params.requestId);
        break;
    }
  });

  send('Network.enable', { maxTotalBufferSize: 20e6, maxResourceBufferSize: 5e6 });
  contents.once('destroyed', () => requests.clear());
}

// options: { settings, icon, getWindow(), getTab(webContentsId), onClick(webContentsId|null), onStatus(count),
//            onFolderRenamed(folderId, name) }
function init(options) {
  opts = options;
  setInterval(reportStatus, 60 * 1000).unref();
}

module.exports = { init, watch, generatingCount, modelLabel, isFinished };
