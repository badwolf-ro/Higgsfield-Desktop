// "Continue with Google" in a real browser. Google does not allow signing in to a
// Google account inside an app's embedded browser, which is what every tab here is.
// So the sign-in runs in a separate Chrome or Edge window with a fresh profile of
// its own. Once the user has signed in to Higgsfield there and closed the window,
// that profile is opened again without a window, Higgsfield's login cookies (and
// only those) are read from it, and the profile is deleted.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { HOME, isSite } = require('../shared/actions');

const BROWSERS = [
  { name: 'Google Chrome', file: 'Google\\Chrome\\Application\\chrome.exe', roots: ['ProgramFiles', 'ProgramFiles(x86)', 'LOCALAPPDATA'] },
  { name: 'Microsoft Edge', file: 'Microsoft\\Edge\\Application\\msedge.exe', roots: ['ProgramFiles(x86)', 'ProgramFiles', 'LOCALAPPDATA'] },
];
const COMMON_ARGS = ['--no-first-run', '--no-default-browser-check', '--disable-sync'];
const SAME_SITE = { Strict: 'strict', Lax: 'lax', None: 'no_restriction' };
// The login, kept by Clerk, Higgsfield's sign-in service, plus Higgsfield's hf_clerk_*
// cookies, which decide which address Clerk keeps it at. Other cookies (consent,
// bot protection) belong to the browser that got them and stay out of the app.
const LOGIN_COOKIE = /^(__(client|session|refresh|clerk)|hf_clerk_)/;

function isLoginCookie(c) {
  return LOGIN_COOKIE.test(c.name) && isSite('https://' + c.domain.replace(/^\./, ''));
}

// Where a tab or popup would go to sign in with Google.
function isGoogleSignIn(url) {
  try { return /^accounts\.google\.[a-z.]+$/.test(new URL(url).hostname); } catch { return false; }
}

// { name, exe } of the first installed browser, or null.
function findBrowser() {
  for (const { name, file, roots } of BROWSERS) {
    for (const root of roots) {
      const exe = process.env[root] && path.join(process.env[root], file);
      if (exe && fs.existsSync(exe)) return { name, exe };
    }
  }
  return null;
}

function exited(child) {
  return new Promise(resolve => {
    if (child.exitCode !== null) resolve();
    else child.once('exit', () => resolve());
  });
}

function removeProfile(dir) {
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}

// The port and path the browser writes once its DevTools endpoint is listening.
async function waitForEndpoint(dir, child) {
  const file = path.join(dir, 'DevToolsActivePort');
  for (let i = 0; i < 150 && child.exitCode === null; i++) {
    try {
      const [port, target] = fs.readFileSync(file, 'utf8').split('\n');
      if (port && target) return `ws://127.0.0.1:${port.trim()}${target.trim()}`;
    } catch { /* not written yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('The browser did not start.');
}

function devtoolsCall(url, method) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => { ws.close(); reject(new Error('The browser did not answer.')); }, 10000);
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method }));
    ws.onmessage = e => {
      const message = JSON.parse(e.data);
      if (message.id !== 1) return;
      clearTimeout(timer);
      ws.close();
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    };
    ws.onerror = () => { clearTimeout(timer); reject(new Error('Could not read the sign-in from the browser.')); };
  });
}

// Higgsfield's login cookies from the profile, read by the browser itself (it alone can decrypt them).
async function readSiteCookies(browser, dir) {
  const child = spawn(browser.exe, ['--headless=new', `--user-data-dir=${dir}`, '--remote-debugging-port=0',
    ...COMMON_ARGS, 'about:blank'], { stdio: 'ignore' });
  try {
    const { cookies } = await devtoolsCall(await waitForEndpoint(dir, child), 'Storage.getCookies');
    return cookies.filter(c => !c.partitionKey && isLoginCookie(c));
  } finally {
    child.kill();
    await exited(child);
  }
}

// Opens the browser window and waits for the user to close it. Resolves to
// { cookies, signedIn }; signedIn is false when no Higgsfield login was found.
async function signIn(browser, dir) {
  removeProfile(dir);
  try {
    const child = spawn(browser.exe, [`--user-data-dir=${dir}`, ...COMMON_ARGS, `--app=${HOME}`], { stdio: 'ignore' });
    await exited(child);
    const cookies = await readSiteCookies(browser, dir);
    // Clerk sets __client_uat to 0 while nobody is signed in.
    const signedIn = cookies.some(c => c.name.startsWith('__client_uat') && c.value && c.value !== '0');
    return { cookies, signedIn };
  } finally {
    removeProfile(dir);
  }
}

// Replaces the app's Higgsfield login cookies with the ones from the browser.
async function importCookies(session, cookies) {
  for (const c of (await session.cookies.get({})).filter(isLoginCookie)) {
    await session.cookies.remove(`https://${c.domain.replace(/^\./, '')}${c.path}`, c.name);
  }
  for (const c of cookies) {
    await session.cookies.set({
      url: `https://${c.domain.replace(/^\./, '')}${c.path}`,
      name: c.name,
      value: c.value,
      path: c.path,
      domain: c.domain.startsWith('.') ? c.domain : undefined, // no domain: a host-only cookie, as before
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: SAME_SITE[c.sameSite] || 'unspecified',
      expirationDate: c.session ? undefined : c.expires,
    });
  }
}

module.exports = { isGoogleSignIn, findBrowser, signIn, importCookies };
