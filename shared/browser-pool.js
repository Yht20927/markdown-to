/**
 * Shared Puppeteer browser lifecycle and page hardening.
 *
 * All browser-based tools use `withPage`, which:
 * - reuses a single browser while a conversion is running;
 * - disables JavaScript;
 * - blocks remote requests (http/https) unless explicitly allowed;
 * - always closes the page and the browser so CLI processes exit.
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

let _browser = null;
let _launching = null;

function chromeCandidates() {
  if (process.platform === 'win32') {
    const roots = [
      process.env.PROGRAMFILES,
      process.env['PROGRAMFILES(X86)'],
      process.env.LOCALAPPDATA,
    ].filter(Boolean);
    return roots.flatMap((root) => [
      path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ]);
  }

  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ];
  }

  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/usr/bin/microsoft-edge',
    '/usr/bin/brave-browser',
  ];
}

/**
 * Resolve a usable Chrome executable.
 *
 * Returns undefined when Puppeteer's bundled browser exists, so Puppeteer can
 * use its normal default. Otherwise falls back to a system browser, then throws
 * an actionable error.
 *
 * @returns {Promise<string|undefined>}
 */
async function resolveChromeExecutable() {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN;
  if (envPath) {
    if (!fs.existsSync(envPath)) {
      throw new Error(
        `PUPPETEER_EXECUTABLE_PATH points to a missing file: ${envPath}`
      );
    }
    return envPath;
  }

  try {
    const bundled = await puppeteer.executablePath();
    if (bundled && fs.existsSync(bundled)) return undefined;
  } catch {
    // Puppeteer throws when its browser is not installed; try system browsers.
  }

  for (const candidate of chromeCandidates()) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error(
    [
      'Could not find Chrome or Chromium.',
      'Install the browser bundled with Puppeteer:',
      '  npx puppeteer browsers install chrome',
      'Or point to an existing browser:',
      '  PUPPETEER_EXECUTABLE_PATH=/path/to/chrome node <tool>/index.js ...',
    ].join('\n')
  );
}

/**
 * Launch a browser. Uses the env override, a bundled browser, or a system
 * browser in that order.
 *
 * @returns {Promise<import('puppeteer').Browser>}
 */
async function launchBrowser() {
  const executablePath = await resolveChromeExecutable();
  return puppeteer.launch({
    headless: true,
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-sync',
      '--metrics-recording-only',
      '--no-first-run',
    ],
  });
}

/**
 * Get or create a shared browser instance.
 * @returns {Promise<import('puppeteer').Browser>}
 */
async function getBrowser() {
  if (_browser && _browser.isConnected()) return _browser;
  if (!_launching) {
    _launching = launchBrowser()
      .then((browser) => {
        _browser = browser;
        return browser;
      })
      .finally(() => {
        _launching = null;
      });
  }
  return _launching;
}

/**
 * Close the browser instance if open. Safe to call multiple times.
 */
async function closeBrowser() {
  const browser = _browser;
  _browser = null;
  if (browser) {
    try {
      await browser.close();
    } catch {
      // The process may already be gone; nothing useful to recover here.
    }
  }
}

/**
 * Whether a request may proceed.
 *
 * Local data/about/file/blob URLs are always allowed. Remote requests are only
 * allowed when `allowRemote` is true.
 *
 * @param {string} url
 * @param {boolean} allowRemote
 * @returns {boolean}
 */
function isRequestAllowed(url, allowRemote) {
  if (allowRemote) return true;
  return /^(?:data|file|about|blob):/i.test(url);
}

/**
 * Apply the default security policy to a page.
 *
 * @param {import('puppeteer').Page} page
 * @param {Object} [options]
 * @param {boolean} [options.allowRemote=false]
 */
async function hardenPage(page, { allowRemote = false } = {}) {
  await page.setJavaScriptEnabled(false);
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (isRequestAllowed(request.url(), allowRemote)) {
      request.continue().catch(() => {});
    } else {
      request.abort('blockedbyclient').catch(() => {});
    }
  });
}

/**
 * Execute a function with a fresh, hardened page.
 *
 * The browser is closed after the callback so CLI processes never keep the
 * event loop alive. Call `getBrowser` directly only if you manage the lifecycle
 * yourself and call `closeBrowser` when finished.
 *
 * @param {(page: import('puppeteer').Page) => Promise<T>} fn
 * @param {Object} [options]
 * @param {boolean} [options.allowRemote=false]
 * @returns {Promise<T>}
 * @template T
 */
async function withPage(fn, { allowRemote = false } = {}) {
  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await hardenPage(page, { allowRemote });
    return await fn(page);
  } finally {
    if (page) {
      try {
        await page.close();
      } catch {
        // Page may already be closed if the browser crashed.
      }
    }
    await closeBrowser();
  }
}

// Ensure signals do not leave a Chrome process behind. `withPage` handles the
// normal path; these handlers cover Ctrl-C and timeouts.
process.once('SIGINT', async () => {
  await closeBrowser();
  process.exit(130);
});
process.once('SIGTERM', async () => {
  await closeBrowser();
  process.exit(143);
});

module.exports = {
  getBrowser,
  closeBrowser,
  withPage,
  isRequestAllowed,
  resolveChromeExecutable,
};
