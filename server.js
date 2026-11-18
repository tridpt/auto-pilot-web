/**
 * AutoPilot Web — Browser Workflow Automator, Smart Web Scraper & Bulk Form Filler
 * Zero external npm dependencies (Uses Node v18+ built-in WebSocket + Chrome/Edge DevTools Protocol)
 */

const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { URL } = require('node:url');
const { performance } = require('node:perf_hooks');

const PORT = Number(process.env.PORT || 4095);
const DATA_DIR = path.join(__dirname, 'data');
const SCREENSHOTS_DIR = path.join(DATA_DIR, 'screenshots');
const PDFS_DIR = path.join(DATA_DIR, 'pdfs');
const PERSISTENT_PROFILE_DIR = path.join(DATA_DIR, 'browser-profile');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
if (!fs.existsSync(PDFS_DIR)) fs.mkdirSync(PDFS_DIR, { recursive: true });
if (!fs.existsSync(PERSISTENT_PROFILE_DIR)) fs.mkdirSync(PERSISTENT_PROFILE_DIR, { recursive: true });

// Default Workflows & Store
function createDefaultStore() {
  return {
    workflows: [
      {
        id: 'wf-demo-scrape',
        name: '🧲 Cào danh sách sản phẩm & Chụp màn hình (Demo Sandbox)',
        description: 'Mở trang Demo Shop nội bộ, lọc sản phẩm, cào toàn bộ bảng giá sản phẩm và chụp ảnh màn hình báo cáo.',
        headless: true,
        steps: [
          { type: 'goto', url: `http://localhost:${PORT}/sandbox/shop`, label: 'Mở trang Demo E-Commerce Shop' },
          { type: 'wait', ms: 500, label: 'Chờ trang tải xong' },
          { type: 'scroll', direction: 'bottom', label: 'Cuộn xuống cuối trang kích hoạt dữ liệu' },
          {
            type: 'extract_list',
            itemSelector: '.product-card',
            fields: {
              name: '.p-title',
              price: '.p-price',
              category: '.p-cat',
              stock: '.p-stock',
              sku: '@data-sku'
            },
            label: 'Cào danh sách 8 sản phẩm công nghệ'
          },
          { type: 'screenshot', label: 'Chụp ảnh màn hình kết quả' }
        ],
        createdAt: new Date().toISOString()
      },
      {
        id: 'wf-demo-form',
        name: '📝 Tự động điền Form Đăng ký / Đặt hàng (Demo Sandbox)',
        description: 'Mở trang Form nội bộ, tự động nhập Họ tên, Email, Số điện thoại, chọn gói VIP, bấm Gửi và lấy mã xác nhận.',
        headless: true,
        steps: [
          { type: 'goto', url: `http://localhost:${PORT}/sandbox/shop`, label: 'Mở trang Demo Shop & Form' },
          { type: 'type', selector: '#inp-fullname', value: 'Nguyễn Văn Tự Động', label: 'Nhập Họ và Tên' },
          { type: 'type', selector: '#inp-email', value: 'autopilot@netpulse.vn', label: 'Nhập Email' },
          { type: 'type', selector: '#inp-phone', value: '0988776655', label: 'Nhập Số điện thoại' },
          { type: 'type', selector: '#inp-note', value: 'Đơn hàng tạo tự động bởi AutoPilot Web', label: 'Nhập Ghi chú' },
          { type: 'click', selector: '#btn-submit-order', label: 'Bấm nút Gửi Đơn Hàng' },
          { type: 'wait', ms: 400, label: 'Chờ thông báo xác nhận' },
          {
            type: 'extract_list',
            itemSelector: '#order-result-box',
            fields: {
              status: '.res-status',
              orderCode: '.res-code',
              summary: '.res-summary'
            },
            label: 'Lấy mã đơn hàng phản hồi'
          },
          { type: 'screenshot', label: 'Chụp ảnh bằng chứng gửi form' }
        ],
        createdAt: new Date().toISOString()
      },
      {
        id: 'wf-bulk-template',
        name: '📝 Kịch bản Điền Form Hàng Loạt (Dùng biến {{fullname}}, {{email}}...)',
        description: 'Kịch bản mẫu chứa các biến động {{fullname}}, {{email}}, {{phone}}, {{note}} để lặp qua danh sách CSV/Excel hoặc JSON.',
        headless: true,
        steps: [
          { type: 'goto', url: `http://localhost:${PORT}/sandbox/shop`, label: 'Mở trang Biểu mẫu' },
          { type: 'type', selector: '#inp-fullname', value: '{{fullname}}', label: 'Điền Họ tên ({{fullname}})' },
          { type: 'type', selector: '#inp-email', value: '{{email}}', label: 'Điền Email ({{email}})' },
          { type: 'type', selector: '#inp-phone', value: '{{phone}}', label: 'Điền SĐT ({{phone}})' },
          { type: 'type', selector: '#inp-note', value: '{{note}}', label: 'Điền Ghi chú ({{note}})' },
          { type: 'click', selector: '#btn-submit-order', label: 'Bấm nút Gửi Đơn Hàng' },
          { type: 'wait', ms: 300, label: 'Chờ xác nhận' },
          {
            type: 'extract_list',
            itemSelector: '#order-result-box',
            fields: { status: '.res-status', orderCode: '.res-code', customer: '.res-summary' },
            label: 'Thu thập Mã đơn hàng'
          }
        ],
        createdAt: new Date().toISOString()
      }
    ],
    runs: [],
    schedules: [],
    sandboxSubmissions: []
  };
}

let store = createDefaultStore();

function loadStore() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
      if (parsed && Array.isArray(parsed.workflows)) {
        store = {
          workflows: parsed.workflows,
          runs: Array.isArray(parsed.runs) ? parsed.runs.slice(0, 60) : [],
          schedules: Array.isArray(parsed.schedules) ? parsed.schedules : [],
          sandboxSubmissions: Array.isArray(parsed.sandboxSubmissions) ? parsed.sandboxSubmissions.slice(0, 100) : []
        };
      }
    }
  } catch (err) {
    console.error('[Store] Load error:', err.message);
  }
}

function saveStore() {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('[Store] Save error:', err.message);
  }
}

loadStore();

// Active SSE clients
const sseClients = new Set();

function broadcastEvent(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

// ============================================================================
// CHROME / EDGE DEVTOOLS PROTOCOL (CDP) ENGINE
// ============================================================================
function findBrowserExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return null;
}

function getFreeLocalPort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
    srv.on('error', reject);
  });
}

function fetchJsonLocal(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

let persistentProfileInUse = false;

class CdpBrowserSession {
  constructor({ headless = true, persistentProfile = false } = {}) {
    this.headless = headless;
    this.persistentProfile = Boolean(persistentProfile);
    this.usingPersistentDir = false;
    this.proc = null;
    this.ws = null;
    this.userDataDir = null;
    this.msgId = 1;
    this.pending = new Map();
    this.capturedApis = new Map();
    this.browserName = '';
  }

  async launch() {
    const browserPath = findBrowserExecutable();
    if (!browserPath) {
      throw new Error('Không tìm thấy trình duyệt Google Chrome hoặc Microsoft Edge trên máy.');
    }
    this.browserName = path.basename(browserPath);
    const debugPort = await getFreeLocalPort();

    if (this.persistentProfile && !persistentProfileInUse) {
      persistentProfileInUse = true;
      this.usingPersistentDir = true;
      this.userDataDir = PERSISTENT_PROFILE_DIR;
    } else {
      this.userDataDir = path.join(os.tmpdir(), `autopilot-cdp-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
    }
    fs.mkdirSync(this.userDataDir, { recursive: true });

    const args = [
      ...(this.headless ? ['--headless=new'] : ['--new-window']),
      '--window-size=1280,860',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-popup-blocking',
      '--ignore-certificate-errors',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${this.userDataDir}`,
      'about:blank'
    ];

    this.proc = spawn(browserPath, args, { stdio: 'ignore', windowsHide: this.headless });

    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 150));
      const targets = await fetchJsonLocal(`http://127.0.0.1:${debugPort}/json/list`);
      if (Array.isArray(targets)) {
        const pageTarget = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (pageTarget) {
          wsUrl = pageTarget.webSocketDebuggerUrl;
          break;
        }
      }
    }

    if (!wsUrl) {
      await this.close();
      throw new Error('Không thể kết nối tới cổng điều khiển DevTools của trình duyệt.');
    }

    await new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;
      const timer = setTimeout(() => reject(new Error('WebSocket CDP timeout')), 5000);

      ws.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      });

      ws.addEventListener('message', (ev) => {
        try {
          const data = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
          if (data.id && this.pending.has(data.id)) {
            const { resolve: resFn, reject: rejFn } = this.pending.get(data.id);
            this.pending.delete(data.id);
            if (data.error) rejFn(new Error(data.error.message || 'CDP Error'));
            else resFn(data.result);
            return;
          }
          // Network X-Ray: Capture XHR / Fetch / JSON API requests in real time
          if (data.method === 'Network.requestWillBeSent' && data.params) {
            const { requestId, request, type } = data.params;
            const reqUrl = String(request?.url || '');
            if (reqUrl.startsWith('http') && (type === 'XHR' || type === 'Fetch' || /\/api\/|\.json|graphql/i.test(reqUrl))) {
              if (this.capturedApis.size < 60) {
                this.capturedApis.set(requestId, {
                  requestId,
                  method: request.method || 'GET',
                  url: reqUrl,
                  headers: request.headers || {},
                  postData: request.postData || '',
                  resourceType: type || 'XHR',
                  status: 0,
                  mimeType: '',
                  responsePreview: '',
                  timestamp: new Date().toISOString()
                });
              }
            }
          } else if (data.method === 'Network.responseReceived' && data.params) {
            const { requestId, response, type } = data.params;
            const mime = String(response?.mimeType || '');
            const resUrl = String(response?.url || '');
            if (this.capturedApis.has(requestId)) {
              const entry = this.capturedApis.get(requestId);
              entry.status = response?.status || 200;
              entry.mimeType = mime;
              entry.responseHeaders = response?.headers || {};
            } else if (resUrl.startsWith('http') && (mime.includes('json') || type === 'XHR' || type === 'Fetch')) {
              if (this.capturedApis.size < 60) {
                this.capturedApis.set(requestId, {
                  requestId,
                  method: 'GET',
                  url: resUrl,
                  headers: {},
                  postData: '',
                  resourceType: type || 'XHR',
                  status: response?.status || 200,
                  mimeType: mime,
                  responseHeaders: response?.headers || {},
                  responsePreview: '',
                  timestamp: new Date().toISOString()
                });
              }
            }
          }
        } catch {}
      });

      ws.addEventListener('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('DOM.enable');
    await this.send('Network.enable');
  }

  send(method, params = {}, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('Phiên trình duyệt đã đóng'));
      }
      const id = this.msgId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP Timeout: ${method}`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (res) => {
          clearTimeout(timer);
          resolve(res);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        }
      });

      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression, returnByValue = true) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue,
      awaitPromise: true
    });
    if (res && res.exceptionDetails) {
      throw new Error(res.exceptionDetails.text || 'Lỗi thực thi JS trên trang');
    }
    return res?.result?.value;
  }

  async goto(rawUrl) {
    let targetUrl = String(rawUrl || '').trim();
    if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl;
    await this.send('Page.navigate', { url: targetUrl });
    // Wait until document.readyState is complete or interactive
    for (let i = 0; i < 35; i++) {
      await new Promise((r) => setTimeout(r, 200));
      try {
        const state = await this.evaluate('document.readyState');
        if (state === 'complete' || state === 'interactive') break;
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 250));
    const info = await this.evaluate('({ title: document.title, url: location.href })');
    return info || { title: '', url: targetUrl };
  }

  async captureScreenshot(label = 'step') {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    if (!res || !res.data) return null;
    const filename = `shot_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.png`;
    const filePath = path.join(SCREENSHOTS_DIR, filename);
    fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
    return {
      filename,
      url: `/screenshots/${filename}`,
      label,
      createdAt: new Date().toISOString()
    };
  }

  async exportPdf(label = 'Page PDF') {
    const res = await this.send('Page.printToPDF', {
      printBackground: true,
      preferCSSPageSize: true
    });
    if (!res || !res.data) return null;
    const buf = Buffer.from(res.data, 'base64');
    const filename = `pdf_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.pdf`;
    const filePath = path.join(PDFS_DIR, filename);
    fs.writeFileSync(filePath, buf);
    return {
      filename,
      url: `/pdfs/${filename}`,
      sizeBytes: buf.length,
      label,
      createdAt: new Date().toISOString()
    };
  }

  async collectCapturedApis() {
    const out = [];
    const entries = Array.from(this.capturedApis.values()).slice(0, 35);
    for (const item of entries) {
      let bodyText = item.responsePreview || '';
      if (!bodyText && item.requestId) {
        try {
          const bodyRes = await this.send('Network.getResponseBody', { requestId: item.requestId }, 1500);
          if (bodyRes && bodyRes.body) {
            bodyText = bodyRes.base64Encoded
              ? Buffer.from(bodyRes.body, 'base64').toString('utf8')
              : String(bodyRes.body);
          }
        } catch {}
      }
      const headerParts = Object.entries(item.headers || {})
        .filter(([k]) => !/^sec-|^upgrade-insecure/i.test(k))
        .slice(0, 8)
        .map(([k, v]) => `-H "${k}: ${String(v).replace(/"/g, '\\"')}"`);
      const dataPart = item.postData ? ` --data-raw '${String(item.postData).replace(/'/g, "\\'")}'` : '';
      const curlCommand = `curl -X ${item.method || 'GET'} "${item.url}" ${headerParts.join(' ')}${dataPart}`.trim();

      out.push({
        stt: out.length + 1,
        method: item.method || 'GET',
        url: item.url,
        status: item.status || 200,
        resourceType: item.resourceType || 'XHR',
        mimeType: item.mimeType || 'application/json',
        headers: item.headers || {},
        postData: item.postData || '',
        responsePreview: bodyText.slice(0, 1500),
        curlCommand,
        timestamp: item.timestamp
      });
    }
    return out;
  }

  async close() {
    try {
      if (this.ws) this.ws.close();
    } catch {}
    try {
      if (this.proc) this.proc.kill('SIGKILL');
    } catch {}
    if (this.usingPersistentDir) {
      persistentProfileInUse = false;
    } else {
      const dir = this.userDataDir;
      if (dir) {
        setTimeout(() => {
          try {
            fs.rmSync(dir, { recursive: true, force: true });
          } catch {}
        }, 800);
      }
    }
  }
}

// Replace {{row.key}} or {{key}} variables in step parameters
function interpolateStepValue(template, rowData = {}) {
  if (typeof template !== 'string') return '';
  return template.replace(/\{\{\s*(?:row\.)?([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    return rowData[key] !== undefined ? String(rowData[key]) : '';
  });
}

// Execute a single workflow step inside an active CDP session
async function executeWorkflowStep(session, step, rowData = {}) {
  const type = String(step.type || '').toLowerCase();

  if (type === 'goto') {
    const url = interpolateStepValue(step.url || '', rowData);
    const info = await session.goto(url);
    return { summary: `Đã mở ${info.url} ("${info.title}")`, data: info };
  }

  if (type === 'wait') {
    const ms = Math.min(Math.max(Number(step.ms) || 1000, 50), 15000);
    await new Promise((r) => setTimeout(r, ms));
    return { summary: `Đã chờ ${ms} ms` };
  }

  if (type === 'wait_selector') {
    const selector = interpolateStepValue(step.selector || '', rowData);
    const timeoutMs = Math.min(Math.max(Number(step.timeoutMs) || 5000, 200), 20000);
    const startWait = Date.now();
    let found = false;
    while (Date.now() - startWait < timeoutMs) {
      const exists = await session.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
      if (exists) {
        found = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 180));
    }
    if (!found) {
      throw new Error(`Hết thời gian chờ (${timeoutMs}ms) nhưng chưa thấy phần tử: ${selector}`);
    }
    return { summary: `Đã thấy phần tử "${selector}" sau ${Date.now() - startWait}ms` };
  }

  if (type === 'press_key') {
    const selector = interpolateStepValue(step.selector || '', rowData);
    const key = String(step.key || 'Enter').trim() || 'Enter';
    const pressed = await session.evaluate(`
      (() => {
        const sel = ${JSON.stringify(selector)};
        const keyName = ${JSON.stringify(key)};
        let target = sel ? document.querySelector(sel) : (document.activeElement || document.body);
        if (!target) return { ok: false, error: 'Không tìm thấy phần tử để nhấn phím: ' + sel };
        if (target.focus) target.focus();
        const evInit = { key: keyName, code: keyName, bubbles: true, cancelable: true };
        target.dispatchEvent(new KeyboardEvent('keydown', evInit));
        target.dispatchEvent(new KeyboardEvent('keypress', evInit));
        target.dispatchEvent(new KeyboardEvent('keyup', evInit));
        if (keyName === 'Enter' && target.form) {
          if (typeof target.form.requestSubmit === 'function') target.form.requestSubmit();
          else target.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
        return { ok: true, tag: target.tagName };
      })()
    `);
    if (!pressed || !pressed.ok) {
      throw new Error(pressed?.error || `Không thể nhấn phím ${key}`);
    }
    await new Promise((r) => setTimeout(r, 250));
    return { summary: `Đã nhấn phím [${key}]${selector ? ` tại ${selector}` : ''}` };
  }

  if (type === 'select_option') {
    const selector = interpolateStepValue(step.selector || '', rowData);
    const value = interpolateStepValue(step.value ?? '', rowData);
    const selected = await session.evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { ok: false, error: 'Không tìm thấy thẻ <select>: ' + ${JSON.stringify(selector)} };
        el.scrollIntoView({ block: 'center' });
        const wanted = String(${JSON.stringify(value)}).trim();
        let matchedText = wanted;
        if (el.options && el.options.length > 0) {
          const opts = Array.from(el.options);
          const found = opts.find(o => o.value === wanted || (o.text || '').trim().toLowerCase().includes(wanted.toLowerCase()));
          if (found) {
            el.value = found.value;
            matchedText = found.text || found.value;
          } else {
            el.value = wanted;
          }
        } else {
          el.value = wanted;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, selectedText: matchedText };
      })()
    `);
    if (!selected || !selected.ok) {
      throw new Error(selected?.error || `Không thể chọn mục trên: ${selector}`);
    }
    return { summary: `Đã chọn "${selected.selectedText}" tại ${selector}` };
  }

  if (type === 'scroll') {
    const dir = step.direction || 'bottom';
    await session.evaluate(`
      (() => {
        if (${JSON.stringify(dir)} === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
        else if (${JSON.stringify(dir)} === 'down') window.scrollBy({ top: 600, behavior: 'smooth' });
        else window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      })()
    `);
    await new Promise((r) => setTimeout(r, 350));
    return { summary: `Đã cuộn trang (${dir})` };
  }

  if (type === 'click') {
    const selector = interpolateStepValue(step.selector || '', rowData);
    const clicked = await session.evaluate(`
      (() => {
        const sel = ${JSON.stringify(selector)};
        let el = document.querySelector(sel);
        if (!el) {
          // Also allow matching button/link by visible text
          const all = Array.from(document.querySelectorAll('button, a, input[type="submit"], [role="button"]'));
          el = all.find(node => (node.innerText || node.value || '').trim().toLowerCase().includes(sel.toLowerCase()));
        }
        if (!el) return { ok: false, error: 'Không tìm thấy phần tử: ' + sel };
        el.scrollIntoView({ block: 'center' });
        el.click();
        return { ok: true, tag: el.tagName, text: (el.innerText || el.value || '').slice(0, 60).trim() };
      })()
    `);
    if (!clicked || !clicked.ok) {
      throw new Error(clicked?.error || `Không thể click: ${selector}`);
    }
    await new Promise((r) => setTimeout(r, 300));
    return { summary: `Đã click <${clicked.tag}> "${clicked.text}"` };
  }

  if (type === 'type') {
    const selector = interpolateStepValue(step.selector || '', rowData);
    const value = interpolateStepValue(step.value ?? '', rowData);
    const typed = await session.evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { ok: false, error: 'Không tìm thấy ô nhập: ' + ${JSON.stringify(selector)} };
        el.scrollIntoView({ block: 'center' });
        el.focus();
        try {
          const proto = el.tagName === 'TEXTAREA'
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          if (setter) setter.call(el, ${JSON.stringify(value)});
          else el.value = ${JSON.stringify(value)};
        } catch {
          el.value = ${JSON.stringify(value)};
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, name: el.name || el.id || el.tagName };
      })()
    `);
    if (!typed || !typed.ok) {
      throw new Error(typed?.error || `Không thể nhập vào: ${selector}`);
    }
    return { summary: `Đã nhập "${value}" vào ${selector}` };
  }

  if (type === 'extract_list') {
    const itemSelector = step.itemSelector || 'tr, .card, .product-card, article, li';
    const fields = step.fields || {};
    const rows = await session.evaluate(`
      (() => {
        const items = Array.from(document.querySelectorAll(${JSON.stringify(itemSelector)})).slice(0, 200);
        const fieldMap = ${JSON.stringify(fields)};
        const fieldEntries = Object.entries(fieldMap);
        return items.map((item, idx) => {
          if (fieldEntries.length === 0) {
            return { index: idx + 1, text: (item.innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 300) };
          }
          const obj = {};
          for (const [key, rule] of fieldEntries) {
            const r = String(rule || '').trim();
            if (r.startsWith('@')) {
              obj[key] = item.getAttribute(r.slice(1)) || '';
            } else if (r.includes('@')) {
              const [subSel, attr] = r.split('@');
              const subEl = subSel ? item.querySelector(subSel) : item;
              obj[key] = subEl ? (subEl.getAttribute(attr) || '') : '';
            } else {
              const subEl = item.querySelector(r);
              obj[key] = subEl ? (subEl.innerText || subEl.value || '').trim() : '';
            }
          }
          return obj;
        }).filter(r => Object.values(r).some(v => String(v).trim() !== ''));
      })()
    `);
    return {
      summary: `Đã cào được ${Array.isArray(rows) ? rows.length : 0} dòng dữ liệu từ "${itemSelector}"`,
      extractedRows: Array.isArray(rows) ? rows : []
    };
  }

  if (type === 'eval_js') {
    const code = interpolateStepValue(step.code || 'document.title', rowData);
    const val = await session.evaluate(code);
    return {
      summary: `Đã thực thi mã JS (${String(val ?? '').slice(0, 60)})`,
      extractedRows: Array.isArray(val) ? val : [{ jsResult: typeof val === 'object' ? JSON.stringify(val) : String(val ?? '') }]
    };
  }

  if (type === 'export_pdf') {
    const pdf = await session.exportPdf(step.label || 'Workflow PDF');
    return {
      summary: `Đã xuất trang thành PDF (${pdf?.filename || ''})`,
      pdf
    };
  }

  if (type === 'screenshot') {
    const shot = await session.captureScreenshot(step.label || 'Screenshot');
    return {
      summary: `Đã chụp ảnh màn hình (${shot?.filename || ''})`,
      screenshot: shot
    };
  }

  return { summary: `Bỏ qua bước không xác định: ${type}` };
}

// Run a complete workflow (optionally looped over bulkData rows)
async function runWorkflow({ name = 'Kịch bản tùy chỉnh', steps = [], headless = true, persistentProfile = false, bulkRows = [] }) {
  const startTime = performance.now();
  const runId = 'run_' + Date.now().toString(36) + '_' + crypto.randomBytes(2).toString('hex');
  const session = new CdpBrowserSession({ headless, persistentProfile });

  const stepLogs = [];
  const extractedData = [];
  const screenshots = [];
  const pdfs = [];
  let latestScreenshot = null;

  const iterations = Array.isArray(bulkRows) && bulkRows.length > 0 ? bulkRows : [{}];

  try {
    await session.launch();

    for (let rowIdx = 0; rowIdx < iterations.length; rowIdx++) {
      const rowData = iterations[rowIdx];
      const rowPrefix = iterations.length > 1 ? `[Dòng #${rowIdx + 1}] ` : '';

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepStart = performance.now();
        try {
          const res = await executeWorkflowStep(session, step, rowData);
          const durationMs = Math.round((performance.now() - stepStart) * 100) / 100;

          if (res.extractedRows && res.extractedRows.length > 0) {
            for (const item of res.extractedRows) {
              extractedData.push(iterations.length > 1 ? { _row: rowIdx + 1, ...item } : item);
            }
          }
          if (res.pdf) {
            pdfs.push(res.pdf);
          }

          let stepShot = res.screenshot || null;
          if (!stepShot && ['goto', 'click', 'extract_list', 'press_key', 'select_option'].includes(step.type)) {
            stepShot = await session.captureScreenshot(step.label || step.type);
          }
          if (stepShot) {
            screenshots.push(stepShot);
            latestScreenshot = stepShot;
          }

          const logItem = {
            stepIndex: i + 1,
            rowIndex: rowIdx + 1,
            type: step.type,
            label: `${rowPrefix}${step.label || step.type}`,
            status: 'ok',
            summary: res.summary,
            durationMs,
            screenshotUrl: stepShot?.url || latestScreenshot?.url || null,
            pdfUrl: res.pdf?.url || null,
            timestamp: new Date().toISOString()
          };
          stepLogs.push(logItem);
          broadcastEvent('step_progress', { runId, logItem, extractedCount: extractedData.length });
        } catch (stepErr) {
          const durationMs = Math.round((performance.now() - stepStart) * 100) / 100;
          const errShot = await session.captureScreenshot(`Error at step ${i + 1}`).catch(() => null);
          if (errShot) screenshots.push(errShot);
          const logItem = {
            stepIndex: i + 1,
            rowIndex: rowIdx + 1,
            type: step.type,
            label: `${rowPrefix}${step.label || step.type}`,
            status: 'error',
            summary: stepErr.message,
            durationMs,
            screenshotUrl: errShot?.url || null,
            timestamp: new Date().toISOString()
          };
          stepLogs.push(logItem);
          broadcastEvent('step_progress', { runId, logItem, extractedCount: extractedData.length });
          break;
        }
      }
    }

    const capturedApis = await session.collectCapturedApis();
    const totalDurationMs = Math.round((performance.now() - startTime) * 100) / 100;
    const runRecord = {
      id: runId,
      name,
      browserUsed: session.browserName,
      headless,
      status: stepLogs.some((l) => l.status === 'error') ? 'partial_error' : 'completed',
      totalDurationMs,
      stepLogs,
      extractedData,
      screenshots,
      pdfs,
      capturedApis,
      createdAt: new Date().toISOString()
    };

    store.runs.unshift(runRecord);
    if (store.runs.length > 60) store.runs.length = 60;
    saveStore();
    broadcastEvent('run_completed', runRecord);
    return { ok: true, run: runRecord };
  } catch (err) {
    return { ok: false, error: err.message, stepLogs, extractedData, screenshots, pdfs };
  } finally {
    await session.close();
  }
}

// ============================================================================
// 1-CLICK SMART WEB SCRAPER (Auto-detect Cards, Links, Images, Custom CSS, Multi-Page & Network X-Ray)
// ============================================================================
async function smartScrapeUrl({
  targetUrl,
  mode = 'auto',
  itemSelector = '',
  customFields = {},
  scrollFirst = true,
  maxPages = 1,
  nextPageSelector = '',
  exportPdf = false,
  headless = true
}) {
  const session = new CdpBrowserSession({ headless });
  try {
    await session.launch();
    const pageInfo = await session.goto(targetUrl);

    const totalPagesToScrape = Math.min(Math.max(Number(maxPages) || 1, 1), 10);
    const allCards = [];
    const allLinks = [];
    const allImages = [];
    const allCustomRows = [];
    let firstMeta = null;
    let lastScreenshot = null;
    let pagesScraped = 0;

    for (let pageNum = 1; pageNum <= totalPagesToScrape; pageNum++) {
      pagesScraped = pageNum;
      if (scrollFirst) {
        await session.evaluate(`window.scrollTo({ top: document.body.scrollHeight / 2 });`);
        await new Promise((r) => setTimeout(r, 250));
        await session.evaluate(`window.scrollTo({ top: document.body.scrollHeight });`);
        await new Promise((r) => setTimeout(r, 300));
        await session.evaluate(`window.scrollTo({ top: 0 });`);
      }

      lastScreenshot = await session.captureScreenshot(`Smart Scrape Page ${pageNum}: ${pageInfo.title || targetUrl}`);

      const scraped = await session.evaluate(`
        (() => {
          const meta = {
            title: document.title || '',
            url: location.href,
            description: document.querySelector('meta[name="description"]')?.content || '',
            h1: Array.from(document.querySelectorAll('h1')).map(e => e.innerText.trim()).filter(Boolean).join(' | ')
          };

          // 1. Auto-detect structured items (Products / Cards / Articles / Table rows)
          const cards = [];
          const cardCandidates = document.querySelectorAll('.product-card, [data-sku], article, .card, .item, .post, tr');
          cardCandidates.forEach((el) => {
            if (cards.length >= 150) return;
            const titleEl = el.querySelector('h1, h2, h3, h4, .p-title, .title, .name, td:first-child');
            const priceEl = el.querySelector('.p-price, .price, [class*="price"], td:nth-child(2)');
            const linkEl = el.querySelector('a[href]');
            const imgEl = el.querySelector('img[src]');
            const text = (el.innerText || '').trim().replace(/\\s+/g, ' ');
            if (!text || text.length < 4) return;
            cards.push({
              title: titleEl ? titleEl.innerText.trim() : text.slice(0, 80),
              priceOrValue: priceEl ? priceEl.innerText.trim() : '',
              link: linkEl ? linkEl.href : '',
              image: imgEl ? imgEl.src : '',
              summary: text.slice(0, 220)
            });
          });

          // 2. All Links
          const links = Array.from(document.querySelectorAll('a[href]'))
            .map((a) => ({
              text: (a.innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 100) || '(Không tiêu đề)',
              href: a.href
            }))
            .filter(l => l.href && !l.href.startsWith('javascript:'))
            .slice(0, 200);

          // 3. All Images
          const images = Array.from(document.querySelectorAll('img[src]'))
            .map((img) => ({
              alt: img.alt || '(Không có alt)',
              src: img.src,
              dimensions: (img.naturalWidth || img.width || 0) + 'x' + (img.naturalHeight || img.height || 0)
            }))
            .slice(0, 150);

          // 4. Custom CSS Selector mode if specified
          let customRows = [];
          const customSel = ${JSON.stringify(itemSelector || '')};
          const fieldMap = ${JSON.stringify(customFields || {})};
          if (customSel) {
            const nodes = Array.from(document.querySelectorAll(customSel)).slice(0, 200);
            const entries = Object.entries(fieldMap).filter(([k, v]) => k && v);
            customRows = nodes.map((node) => {
              if (entries.length === 0) {
                return { text: (node.innerText || '').trim().replace(/\\s+/g, ' ') };
              }
              const row = {};
              for (const [k, rule] of entries) {
                const r = String(rule).trim();
                if (r.startsWith('@')) {
                  row[k] = node.getAttribute(r.slice(1)) || '';
                } else if (r.includes('@')) {
                  const [subS, attr] = r.split('@');
                  const sub = subS ? node.querySelector(subS) : node;
                  row[k] = sub ? (sub.getAttribute(attr) || '') : '';
                } else {
                  const sub = node.querySelector(r);
                  row[k] = sub ? (sub.innerText || sub.value || '').trim() : '';
                }
              }
              return row;
            });
          }

          return { meta, cards, links, images, customRows };
        })()
      `);

      if (!firstMeta && scraped?.meta) firstMeta = scraped.meta;
      const includePageCol = totalPagesToScrape > 1;

      for (const c of scraped?.cards || []) {
        allCards.push({ stt: allCards.length + 1, ...(includePageCol ? { page: pageNum } : {}), ...c });
      }
      if (pageNum === 1) {
        for (const l of scraped?.links || []) allLinks.push({ stt: allLinks.length + 1, ...l });
        for (const img of scraped?.images || []) allImages.push({ stt: allImages.length + 1, ...img });
      }
      for (const cr of scraped?.customRows || []) {
        allCustomRows.push({ stt: allCustomRows.length + 1, ...(includePageCol ? { page: pageNum } : {}), ...cr });
      }

      // If more pages requested, try clicking the Next Page button/link
      if (pageNum < totalPagesToScrape) {
        const nextSel = nextPageSelector.trim() || '.btn-next-page, a[rel="next"], .pagination-next, a.next, button.next';
        const navRes = await session.evaluate(`
          (() => {
            const el = document.querySelector(${JSON.stringify(nextSel)});
            if (!el || el.disabled || el.classList.contains('disabled')) return { ok: false };
            const href = el.getAttribute('href');
            el.scrollIntoView({ block: 'center' });
            el.click();
            return { ok: true, href: href || '' };
          })()
        `);
        if (!navRes || !navRes.ok) break;
        // Wait for navigation / DOM update
        for (let w = 0; w < 15; w++) {
          await new Promise((r) => setTimeout(r, 150));
          try {
            const st = await session.evaluate('document.readyState');
            if (st === 'complete') break;
          } catch {}
        }
        await new Promise((r) => setTimeout(r, 250));
      }
    }

    const capturedApis = await session.collectCapturedApis();
    const pdf = exportPdf ? await session.exportPdf(`Smart Scrape PDF: ${firstMeta?.title || targetUrl}`) : null;

    return {
      ok: true,
      browserUsed: session.browserName,
      pagesScraped,
      screenshot: lastScreenshot,
      pdf,
      capturedApis,
      meta: firstMeta || { title: '', url: targetUrl, description: '', h1: '' },
      cards: allCards,
      links: allLinks,
      images: allImages,
      customRows: allCustomRows
    };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    await session.close();
  }
}

// ============================================================================
// 1-CLICK PAGE ELEMENT & FORM INSPECTOR (No need to open F12!)
// ============================================================================
async function inspectPageElements(rawTargetUrl) {
  const session = new CdpBrowserSession({ headless: true });
  try {
    await session.launch();
    const pageInfo = await session.goto(rawTargetUrl);
    const elements = await session.evaluate(`
      (() => {
        function buildBestSelector(el, indexWithinTag) {
          if (el.id && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(el.id)) {
            return '#' + el.id;
          }
          const tag = el.tagName.toLowerCase();
          if (el.name) {
            return tag + '[name="' + el.name.replace(/"/g, '\\\\"') + '"]';
          }
          if (el.getAttribute('data-testid')) {
            return '[data-testid="' + el.getAttribute('data-testid') + '"]';
          }
          if (el.placeholder && (tag === 'input' || tag === 'textarea')) {
            return tag + '[placeholder="' + el.placeholder.replace(/"/g, '\\\\"') + '"]';
          }
          const classes = Array.from(el.classList || []).filter(c => /^[a-zA-Z0-9_-]+$/.test(c));
          if (classes.length > 0) {
            const candidate = tag + '.' + classes.slice(0, 2).join('.');
            if (document.querySelectorAll(candidate).length === 1) return candidate;
          }
          return tag + ':nth-of-type(' + (indexWithinTag + 1) + ')';
        }

        const inputs = [];
        const inputNodes = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select'));
        inputNodes.forEach((el, idx) => {
          const labelEl = el.id ? document.querySelector('label[for="' + el.id + '"]') : el.closest('label');
          const labelText = (labelEl ? labelEl.innerText : '') || el.placeholder || el.name || el.id || ('Ô nhập #' + (idx + 1));
          const varName = (el.name || el.id || ('field_' + (idx + 1))).replace(/^inp[-_]?/i, '').replace(/[^a-zA-Z0-9_]/g, '_');
          inputs.push({
            tag: el.tagName.toLowerCase(),
            inputType: el.type || 'text',
            selector: buildBestSelector(el, idx),
            label: labelText.trim().slice(0, 70),
            varName: varName || ('col_' + (idx + 1))
          });
        });

        const buttons = [];
        const btnNodes = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn, [role="button"]'));
        btnNodes.forEach((el, idx) => {
          const text = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ');
          if (!text && !el.id) return;
          buttons.push({
            tag: el.tagName.toLowerCase(),
            selector: buildBestSelector(el, idx),
            text: text.slice(0, 70) || el.id
          });
        });

        return { inputs: inputs.slice(0, 40), buttons: buttons.slice(0, 30) };
      })()
    `);

    return {
      ok: true,
      pageInfo,
      inputs: elements?.inputs || [],
      buttons: elements?.buttons || []
    };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    await session.close();
  }
}

// ============================================================================
// LIVE ACTION RECORDER (Captures clicks & typing directly from browser DOM)
// ============================================================================
const DOM_RECORDER_INJECT_SCRIPT = `
(() => {
  if (window.__autopilotRecorderInstalled) return;
  window.__autopilotRecorderInstalled = true;
  window.__apSteps = window.__apSteps || [];

  function getBestSelector(el) {
    if (!el || !el.tagName) return 'body';
    if (el.id && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(el.id)) return '#' + el.id;
    const tag = el.tagName.toLowerCase();
    if (el.name) return tag + '[name="' + el.name.replace(/"/g, '\\\\"') + '"]';
    if (el.getAttribute && el.getAttribute('data-testid')) return '[data-testid="' + el.getAttribute('data-testid') + '"]';
    if (el.placeholder && (tag === 'input' || tag === 'textarea')) {
      return tag + '[placeholder="' + el.placeholder.replace(/"/g, '\\\\"') + '"]';
    }
    const classes = Array.from(el.classList || []).filter(c => /^[a-zA-Z0-9_-]+$/.test(c));
    if (classes.length > 0) {
      const sel = tag + '.' + classes.slice(0, 2).join('.');
      if (document.querySelectorAll(sel).length === 1) return sel;
    }
    return tag;
  }

  // Show recording badge in top-right corner
  function mountBanner() {
    if (document.getElementById('__ap-rec-banner')) return;
    const b = document.createElement('div');
    b.id = '__ap-rec-banner';
    b.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;background:#dc2626;color:#fff;padding:8px 14px;border-radius:999px;font:700 12.5px system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,0.45);pointer-events:none;';
    b.textContent = '🔴 AutoPilot Đang Ghi Thao Tác (Click / Gõ phím)...';
    (document.body || document.documentElement).appendChild(b);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountBanner);
  } else {
    mountBanner();
  }

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!el || !el.tagName) return;
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      const sel = getBestSelector(el);
      const val = el.value || '';
      const label = el.placeholder || el.name || el.id || sel;
      window.__apSteps.push({
        type: 'type',
        selector: sel,
        value: val,
        label: 'Nhập "' + String(val).slice(0, 25) + '" vào ' + label
      });
    }
  }, true);

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button, a, input[type="submit"], input[type="button"], [role="button"]');
    if (!btn) return;
    const sel = getBestSelector(btn);
    const text = (btn.innerText || btn.value || btn.getAttribute('aria-label') || sel).trim().replace(/\\s+/g, ' ').slice(0, 40);
    window.__apSteps.push({
      type: 'click',
      selector: sel,
      label: 'Click "' + text + '"'
    });
  }, true);

  window.__autopilotDrainSteps = function () {
    const items = window.__apSteps.splice(0, window.__apSteps.length);
    return items;
  };
})();
`;

async function recordBrowserActions({ targetUrl, durationSec = 12, headless = false, persistentProfile = false, demoAutoActions = false }) {
  const session = new CdpBrowserSession({ headless: Boolean(headless), persistentProfile: Boolean(persistentProfile) });
  const recordedSteps = [];
  try {
    await session.launch();
    await session.send('Page.addScriptToEvaluateOnNewDocument', { source: DOM_RECORDER_INJECT_SCRIPT });
    const pageInfo = await session.goto(targetUrl);
    await session.evaluate(DOM_RECORDER_INJECT_SCRIPT);

    recordedSteps.push({
      type: 'goto',
      url: pageInfo.url || targetUrl,
      label: `Mở trang ${pageInfo.title || targetUrl}`
    });

    if (demoAutoActions) {
      // Simulate user interacting with the page so recorder captures real DOM events
      await session.evaluate(`
        (() => {
          const fn = document.querySelector('#inp-fullname, input[type="text"]');
          if (fn) {
            fn.value = 'Trần Thị Ghi Tự Động';
            fn.dispatchEvent(new Event('change', { bubbles: true }));
          }
          const em = document.querySelector('#inp-email, input[type="email"]');
          if (em) {
            em.value = 'recorder@autopilot.vn';
            em.dispatchEvent(new Event('change', { bubbles: true }));
          }
          const ph = document.querySelector('#inp-phone');
          if (ph) {
            ph.value = '0912345678';
            ph.dispatchEvent(new Event('change', { bubbles: true }));
          }
          const btn = document.querySelector('#btn-submit-order, button[type="submit"], button');
          if (btn) btn.click();
        })()
      `);
      await new Promise((r) => setTimeout(r, 350));
      const drained = await session.evaluate('window.__autopilotDrainSteps ? window.__autopilotDrainSteps() : []');
      if (Array.isArray(drained)) recordedSteps.push(...drained);
    } else {
      const maxWaitMs = Math.min(Math.max(Number(durationSec) || 12, 3), 60) * 1000;
      const start = Date.now();
      while (Date.now() - start < maxWaitMs) {
        await new Promise((r) => setTimeout(r, 450));
        try {
          const drained = await session.evaluate('window.__autopilotDrainSteps ? window.__autopilotDrainSteps() : []');
          if (Array.isArray(drained) && drained.length > 0) {
            recordedSteps.push(...drained);
          }
        } catch {
          // User closed the browser window early -> finish recording gracefully
          break;
        }
      }
    }

    recordedSteps.push({
      type: 'screenshot',
      label: 'Chụp ảnh màn hình kết quả'
    });

    return {
      ok: true,
      pageInfo,
      recordedCount: recordedSteps.length,
      steps: recordedSteps
    };
  } catch (err) {
    return { ok: false, error: err.message, steps: recordedSteps };
  } finally {
    await session.close();
  }
}

// ============================================================================
// 1-CLICK SYNC SESSION (COOKIES & TOKENS) TO NETPULSE (Port 4080)
// ============================================================================
function postJsonUrl(targetUrl, payloadObj, timeoutMs = 6000) {
  return new Promise((resolve) => {
    try {
      const u = new URL(targetUrl);
      const isHttps = u.protocol === 'https:';
      const transport = isHttps ? https : http;
      const bodyBuf = Buffer.from(JSON.stringify(payloadObj), 'utf8');
      const req = transport.request(
        {
          protocol: u.protocol,
          hostname: u.hostname,
          port: u.port || (isHttps ? 443 : 80),
          path: u.pathname + u.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': String(bodyBuf.length)
          },
          timeout: timeoutMs
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, statusCode: res.statusCode, body: text });
          });
        }
      );
      req.on('error', (err) => resolve({ ok: false, statusCode: 0, error: err.message }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, statusCode: 0, error: 'Timeout' });
      });
      req.write(bodyBuf);
      req.end();
    } catch (err) {
      resolve({ ok: false, statusCode: 0, error: err.message });
    }
  });
}

async function syncBrowserSessionToNetPulse({ targetUrl, netpulseUrl = 'http://localhost:4080', persistentProfile = true }) {
  const session = new CdpBrowserSession({ headless: true, persistentProfile: Boolean(persistentProfile) });
  try {
    await session.launch();
    await session.send('Network.enable');
    const pageInfo = await session.goto(targetUrl);

    const cdpCookiesRes = await session.send('Network.getCookies', { urls: [pageInfo.url || targetUrl] });
    const cookies = Array.isArray(cdpCookiesRes?.cookies) ? cdpCookiesRes.cookies : [];

    const storageData = await session.evaluate(`
      (() => {
        // Set a demo session cookie & token if running on sandbox so user sees immediate data
        if (location.pathname.includes('/sandbox/shop') && !localStorage.getItem('autopilot_jwt_token')) {
          document.cookie = 'ap_session_id=sess_' + Math.random().toString(36).slice(2, 10) + '; path=/';
          localStorage.setItem('autopilot_jwt_token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhdXRvcGlsb3RfdXNlciIsInJvbGUiOiJ2aXAiLCJleHAiOjE5OTk5OTk5OTl9.demo_sig');
        }
        const items = [];
        let detectedBearer = '';
        for (const [srcName, storeObj] of [['localStorage', window.localStorage], ['sessionStorage', window.sessionStorage]]) {
          try {
            for (let i = 0; i < storeObj.length; i++) {
              const k = storeObj.key(i);
              const v = storeObj.getItem(k) || '';
              items.push({ source: srcName, key: k, value: v.slice(0, 300) });
              if (!detectedBearer && (/token|jwt|auth|bearer/i.test(k) || /^eyJ[a-zA-Z0-9_-]+\\.[a-zA-Z0-9_-]+/.test(v))) {
                detectedBearer = v.replace(/^Bearer\\s+/i, '').trim();
              }
            }
          } catch {}
        }
        return { docCookie: document.cookie || '', items, detectedBearer };
      })()
    `);

    const cookiePairs = cookies.map((c) => `${c.name}=${c.value}`);
    if (storageData?.docCookie) {
      for (const part of storageData.docCookie.split(';').map((s) => s.trim()).filter(Boolean)) {
        if (!cookiePairs.includes(part)) cookiePairs.push(part);
      }
    }
    const cookieHeader = cookiePairs.join('; ');
    const bearerToken = storageData?.detectedBearer || '';

    // Push into NetPulse /api/env if NetPulse is running on port 4080
    let pushedToNetPulse = false;
    try {
      const stateRes = await fetchJsonLocal(`${netpulseUrl}/api/state`);
      const existingEnv = (stateRes && stateRes.envVars) || {};
      const updatedEnv = {
        ...existingEnv,
        TARGET_ORIGIN: new URL(pageInfo.url || targetUrl).origin,
        SESSION_COOKIE: cookieHeader || 'none',
        BEARER_TOKEN: bearerToken || existingEnv.API_TOKEN || ''
      };
      const pushRes = await postJsonUrl(`${netpulseUrl}/api/env`, { envVars: updatedEnv });
      pushedToNetPulse = Boolean(pushRes && pushRes.ok);
    } catch {
      pushedToNetPulse = false;
    }

    return {
      ok: true,
      pageInfo,
      cookieCount: cookiePairs.length,
      cookiesCount: cookiePairs.length,
      cookieHeader,
      bearerToken,
      detectedBearerToken: bearerToken,
      storageItems: storageData?.items || [],
      pushedToNetPulse,
      netpulseSynced: pushedToNetPulse,
      netpulseResponse: pushedToNetPulse ? 'HTTP 200 OK' : 'Offline / Skipped',
      netpulseUrl
    };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    await session.close();
  }
}

// ============================================================================
// BACKGROUND AUTO-SCHEDULER & WEBSITE CHANGE MONITOR ENGINE
// ============================================================================
const activeScheduleTimers = new Map();

async function dispatchScheduleChangeAlert(sched, extractedRows, durationMs, changeStatus, diffSummary) {
  const alertUrl = String(sched.notifyWebhookUrl || '').trim();
  if (!alertUrl) return null;
  if (sched.notifyOnChangeOnly && changeStatus === 'unchanged') {
    return { skipped: true, reason: 'Không có biến động dữ liệu (notifyOnChangeOnly = true)' };
  }

  const statusLabel = changeStatus === 'changed'
    ? '🚨 PHÁT HIỆN THAY ĐỔI DỮ LIỆU TRANG WEB!'
    : changeStatus === 'initial'
      ? '📌 Đã thiết lập mốc dữ liệu gốc (Baseline)'
      : '✅ Dữ liệu không đổi so với lần kiểm tra trước';

  const textMsg = [
    `🔔 [AutoPilot Change Monitor] ${sched.workflowName}`,
    `• Trạng thái: ${statusLabel}`,
    `• Chi tiết: ${diffSummary}`,
    `• Số mục trích xuất: ${extractedRows.length} mục (${durationMs || 0} ms)`,
    `• Thời điểm: ${new Date().toLocaleString('vi-VN')}`
  ].join('\n');

  let payload = {
    source: 'AutoPilot-ChangeMonitor',
    scheduleId: sched.id,
    workflowName: sched.workflowName,
    changeStatus,
    diffSummary,
    content: textMsg, // Discord
    text: textMsg,    // Telegram / Slack
    extractedSample: extractedRows.slice(0, 3)
  };

  try {
    const u = new URL(alertUrl);
    if (u.hostname.includes('api.telegram.org')) {
      const chatId = u.searchParams.get('chat_id');
      if (chatId) payload = { chat_id: chatId, text: textMsg };
    }
  } catch {}

  return await postJsonUrl(alertUrl, payload, 6000);
}

async function executeScheduledTask(sched) {
  const wf = store.workflows.find((w) => w.id === sched.workflowId);
  if (!wf) return { ok: false, error: 'Không tìm thấy kịch bản' };

  const activePort = server.address()?.port || PORT;
  const normalizedSteps = (wf.steps || []).map((s) => ({
    ...s,
    url: s.url ? s.url.replace(`localhost:${PORT}`, `127.0.0.1:${activePort}`) : s.url
  }));

  const runResult = await runWorkflow({
    name: `[Hẹn giờ] ${wf.name}`,
    steps: normalizedSteps,
    headless: true,
    persistentProfile: Boolean(wf.persistentProfile)
  });

  const extractedRows = runResult.run?.extractedData || runResult.extractedData || [];
  const durationMs = runResult.run?.totalDurationMs || 0;

  // Compute snapshot hash of extracted data for Change Detection
  const canonicalJson = JSON.stringify(extractedRows);
  const currentHash = crypto.createHash('sha256').update(canonicalJson).digest('hex').slice(0, 16);

  let changeStatus = 'unchanged';
  let diffSummary = `Dữ liệu giữ nguyên (${extractedRows.length} mục, mã hash #${currentHash.slice(0, 6)})`;

  if (!sched.lastSnapshotHash) {
    changeStatus = 'initial';
    diffSummary = `Lần quét đầu tiên: Đã lưu mốc ${extractedRows.length} mục (hash #${currentHash.slice(0, 6)})`;
  } else if (sched.lastSnapshotHash !== currentHash) {
    changeStatus = 'changed';
    sched.changeCount = (Number(sched.changeCount) || 0) + 1;
    diffSummary = `Biến động dữ liệu! Hash cũ #${sched.lastSnapshotHash.slice(0, 6)} → Hash mới #${currentHash.slice(0, 6)} (${extractedRows.length} mục)`;
  }

  sched.lastRunAt = new Date().toISOString();
  sched.runCount = (Number(sched.runCount) || 0) + 1;
  sched.lastSnapshotHash = currentHash;
  sched.lastChangeStatus = changeStatus;
  sched.lastDiffSummary = diffSummary;

  let alertResult = null;
  if (sched.notifyWebhookUrl) {
    alertResult = await dispatchScheduleChangeAlert(sched, extractedRows, durationMs, changeStatus, diffSummary);
  }

  saveStore();
  broadcastEvent('schedules_updated', store.schedules);

  const summaryObj = {
    ok: true,
    schedule: sched,
    changeStatus,
    snapshotHash: currentHash,
    diffSummary,
    alertResult,
    run: runResult.run || null,
    runResult
  };
  return { ...summaryObj, result: summaryObj };
}

function syncActiveSchedules() {
  for (const timer of activeScheduleTimers.values()) {
    clearInterval(timer);
  }
  activeScheduleTimers.clear();

  for (const sched of store.schedules) {
    if (!sched.enabled) continue;
    const intervalMs = Math.max(Number(sched.intervalMinutes) || 5, 1) * 60 * 1000;
    const timer = setInterval(() => {
      executeScheduledTask(sched).catch(() => {});
    }, intervalMs);
    activeScheduleTimers.set(sched.id, timer);
  }
}

// Helper: Read HTTP request body
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

const SANDBOX_CATALOG_PAGE_1 = [
  { sku: 'NP-4090-PRO', title: 'Card Đồ Họa RTX 4090 OC 24GB', price: '48.900.000đ', cat: 'GPU / AI Hardware', stock: 'Còn hàng (12)' },
  { sku: 'NP-MAC-M4', title: 'MacBook Pro 16 M4 Max 64GB/2TB', price: '89.500.000đ', cat: 'Laptop Dev', stock: 'Còn hàng (5)' },
  { sku: 'NP-KEY-HE', title: 'Bàn Phím Cơ Từ Tính Wooting 80HE', price: '6.450.000đ', cat: 'Gaming Gear', stock: 'Còn hàng (28)' },
  { sku: 'NP-MON-OLED', title: 'Màn Hình LG UltraGear 32" 4K OLED 240Hz', price: '27.990.000đ', cat: 'Monitor', stock: 'Sắp hết (2)' },
  { sku: 'NP-NAS-DS923', title: 'Thiết Bị Lưu Trữ Mạng Synology DS923+ 4-Bay', price: '16.200.000đ', cat: 'Server / NAS', stock: 'Còn hàng (9)' },
  { sku: 'NP-ROUTER-WIFI7', title: 'Router ASUS ROG Rapture GT-BE98 Wi-Fi 7', price: '18.500.000đ', cat: 'Networking', stock: 'Còn hàng (7)' },
  { sku: 'NP-SSD-990PRO', title: 'Ổ Cứng SSD Samsung 990 PRO 4TB NVMe Gen4', price: '8.750.000đ', cat: 'Storage', stock: 'Còn hàng (40)' },
  { sku: 'NP-FLIPPER-Z', title: 'Thiết Bị Kiểm Thử Tín Hiệu Đa Năng DevKit', price: '5.200.000đ', cat: 'Security Lab', stock: 'Còn hàng (15)' }
];

const SANDBOX_CATALOG_PAGE_2 = [
  { sku: 'NP-AI-SERVER', title: 'Máy Chủ AI Workstation Dual RTX 6000 Ada', price: '245.000.000đ', cat: 'AI Server', stock: 'Đặt trước (2)' },
  { sku: 'NP-DOCK-TB5', title: 'Trạm Kết Nối CalDigit Thunderbolt 5 Pro Dock', price: '9.800.000đ', cat: 'Accessories', stock: 'Còn hàng (18)' },
  { sku: 'NP-UPS-2200', title: 'Bộ Lưu Điện APC Smart-UPS 2200VA Pure Sine', price: '14.300.000đ', cat: 'Power / Server', stock: 'Còn hàng (6)' },
  { sku: 'NP-CAM-4K60', title: 'Webcam Elgato Facecam Pro 4K60 Studio', price: '7.900.000đ', cat: 'Streaming', stock: 'Còn hàng (11)' }
];

// Built-in Demo Sandbox HTML (/sandbox/shop) for instant testing of Scraping, Pagination, Network X-Ray & Form Filling
function renderSandboxHtml(page = 1) {
  const pageNum = Number(page) === 2 ? 2 : 1;
  const products = pageNum === 2 ? SANDBOX_CATALOG_PAGE_2 : SANDBOX_CATALOG_PAGE_1;

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>AutoPilot Sandbox — Tech Store & Order Form (Trang ${pageNum})</title>
  <meta name="description" content="Trang thương mại điện tử & biểu mẫu mẫu để kiểm thử cào dữ liệu, phân trang, bắt API ngầm và điền form tự động." />
  <style>
    body { background:#0b1120; color:#e2e8f0; font-family:system-ui, sans-serif; margin:0; padding:24px; }
    .wrap { max-width:1100px; margin:0 auto; }
    .banner { background:linear-gradient(135deg,#0284c7,#4f46e5); padding:18px 24px; border-radius:12px; margin-bottom:24px; }
    .grid { display:grid; grid-template-columns: 1.5fr 1fr; gap:24px; }
    .products { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
    .product-card { background:#151f32; border:1px solid #293855; border-radius:10px; padding:14px; }
    .p-cat { font-size:11px; color:#38bdf8; text-transform:uppercase; font-weight:700; }
    .p-title { font-size:15px; font-weight:700; margin:6px 0; color:#f8fafc; }
    .p-price { font-size:16px; color:#4ade80; font-weight:700; }
    .p-stock { font-size:12px; color:#94a3b8; margin-top:4px; }
    .pagination-bar { margin-top:16px; display:flex; align-items:center; justify-content:space-between; background:#151f32; padding:10px 14px; border-radius:8px; border:1px solid #293855; }
    .btn-next-page, .btn-prev-page { color:#38bdf8; font-weight:700; text-decoration:none; padding:6px 12px; border-radius:6px; background:rgba(56,189,248,0.12); }
    .form-box { background:#151f32; border:1px solid #293855; border-radius:12px; padding:20px; }
    .form-group { margin-bottom:12px; }
    label { display:block; font-size:12.5px; color:#94a3b8; margin-bottom:4px; }
    input, textarea, select { width:100%; padding:9px 11px; border-radius:6px; border:1px solid #334155; background:#090d16; color:#fff; box-sizing:border-box; }
    button { width:100%; padding:11px; background:#0ea5e9; color:#fff; border:none; border-radius:6px; font-weight:700; cursor:pointer; margin-top:6px; }
    .res-box { margin-top:14px; padding:12px; border-radius:8px; background:rgba(34,197,94,0.14); border:1px solid #22c55e; display:none; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="banner">
      <h1 style="margin:0 0 6px;">🛒 AutoPilot Tech Store (Sandbox Thực Hành — Trang ${pageNum}/2)</h1>
      <p style="margin:0; opacity:0.9;">Trang đích nội bộ dùng để thực hành Cào dữ liệu sản phẩm (.product-card), Cào phân trang (.btn-next-page), Bắt API ngầm (/api/sandbox/catalog) và Điền Form hàng loạt.</p>
    </div>
    <div class="grid">
      <div>
        <h2>Danh Mục Sản Phẩm Công Nghệ (${products.length} mặt hàng - Trang ${pageNum})</h2>
        <div class="products">
          ${products.map((p) => `
            <div class="product-card" data-sku="${p.sku}">
              <div class="p-cat">${p.cat}</div>
              <h3 class="p-title">${p.title}</h3>
              <div class="p-price">${p.price}</div>
              <div class="p-stock">Mã: <strong>${p.sku}</strong> • ${p.stock}</div>
              <a href="/sandbox/shop?sku=${p.sku}" style="font-size:12px; color:#7dd3fc; display:inline-block; margin-top:6px;">Xem chi tiết →</a>
            </div>
          `).join('')}
        </div>
        <div class="pagination-bar">
          <span>Đang xem <strong>Trang ${pageNum} / 2</strong></span>
          ${pageNum === 1
            ? `<a href="/sandbox/shop?page=2" id="btn-next-page" class="btn-next-page" rel="next">Trang tiếp theo (Trang 2) →</a>`
            : `<a href="/sandbox/shop?page=1" class="btn-prev-page">← Quay lại Trang 1</a>`}
        </div>
      </div>
      <div class="form-box">
        <h2>📝 Biểu Mẫu Đặt Hàng / Đăng Ký Nhanh</h2>
        <form id="sandbox-order-form">
          <div class="form-group">
            <label>Họ và Tên khách hàng (#inp-fullname)</label>
            <input type="text" id="inp-fullname" name="fullname" placeholder="Nhập họ tên..." required />
          </div>
          <div class="form-group">
            <label>Địa chỉ Email (#inp-email)</label>
            <input type="email" id="inp-email" name="email" placeholder="email@domain.com" required />
          </div>
          <div class="form-group">
            <label>Số điện thoại (#inp-phone)</label>
            <input type="text" id="inp-phone" name="phone" placeholder="09xxxxxxxx" required />
          </div>
          <div class="form-group">
            <label>Ghi chú đơn hàng (#inp-note)</label>
            <textarea id="inp-note" name="note" rows="3" placeholder="Ghi chú giao hàng..."></textarea>
          </div>
          <button type="submit" id="btn-submit-order">🚀 Gửi Đơn Hàng Ngay (#btn-submit-order)</button>
        </form>
        <div id="order-result-box" class="res-box">
          <div class="res-status" style="color:#4ade80; font-weight:700;">✅ ĐẶT HÀNG THÀNH CÔNG</div>
          <div class="res-code" id="res-code-text" style="font-family:monospace; margin:4px 0;"></div>
          <div class="res-summary" id="res-summary-text" style="font-size:13px;"></div>
        </div>
      </div>
    </div>
  </div>
  <script>
    // Fire background XHR/Fetch JSON API call on page load so Network X-Ray captures it automatically
    fetch('/api/sandbox/catalog?page=${pageNum}', {
      headers: { 'X-Client-App': 'AutoPilot-Sandbox-Store', 'Accept': 'application/json' }
    }).catch(() => {});

    document.getElementById('sandbox-order-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        fullname: document.getElementById('inp-fullname').value,
        email: document.getElementById('inp-email').value,
        phone: document.getElementById('inp-phone').value,
        note: document.getElementById('inp-note').value
      };
      const res = await fetch('/api/sandbox/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(r => r.json());
      const box = document.getElementById('order-result-box');
      box.style.display = 'block';
      document.getElementById('res-code-text').textContent = 'Mã đơn: ' + res.orderCode;
      document.getElementById('res-summary-text').textContent = payload.fullname + ' (' + payload.phone + ') - ' + payload.email;
    });
  </script>
</body>
</html>`;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.pdf': 'application/pdf'
};

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
    const pathname = parsedUrl.pathname;

    // Serve captured screenshots
    if (pathname.startsWith('/screenshots/')) {
      const file = path.basename(pathname);
      const fullPath = path.join(SCREENSHOTS_DIR, file);
      if (fs.existsSync(fullPath)) {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=3600' });
        return fs.createReadStream(fullPath).pipe(res);
      }
      res.writeHead(404);
      return res.end('Not found');
    }

    // Serve generated PDFs
    if (pathname.startsWith('/pdfs/')) {
      const file = path.basename(pathname);
      const fullPath = path.join(PDFS_DIR, file);
      if (fs.existsSync(fullPath)) {
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${file}"`
        });
        return fs.createReadStream(fullPath).pipe(res);
      }
      res.writeHead(404);
      return res.end('Not found');
    }

    // Built-in Sandbox Page (Supports ?page=1 and ?page=2)
    if (pathname === '/sandbox/shop' && req.method === 'GET') {
      const pageParam = Number(parsedUrl.searchParams.get('page')) || 1;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(renderSandboxHtml(pageParam));
    }

    // Built-in Sandbox JSON API (for Network X-Ray demonstration)
    if (pathname === '/api/sandbox/catalog' && req.method === 'GET') {
      const pageParam = Number(parsedUrl.searchParams.get('page')) === 2 ? 2 : 1;
      const items = pageParam === 2 ? SANDBOX_CATALOG_PAGE_2 : SANDBOX_CATALOG_PAGE_1;
      return sendJson(res, 200, {
        ok: true,
        source: 'AutoPilot Tech Store API',
        page: pageParam,
        totalPages: 2,
        count: items.length,
        items
      });
    }

    if (pathname === '/api/sandbox/submit' && req.method === 'POST') {
      const data = JSON.parse((await readBody(req)) || '{}');
      const orderCode = 'ORD-' + Date.now().toString(36).toUpperCase();
      const entry = { orderCode, ...data, createdAt: new Date().toISOString() };
      store.sandboxSubmissions.unshift(entry);
      saveStore();
      return sendJson(res, 200, { ok: true, orderCode, entry });
    }

    // SSE Stream
    if (pathname === '/api/stream' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    // Initial State
    if (pathname === '/api/state' && req.method === 'GET') {
      return sendJson(res, 200, {
        serverOrigin: `http://${req.headers.host || `localhost:${PORT}`}`,
        browserAvailable: findBrowserExecutable() ? path.basename(findBrowserExecutable()) : null,
        workflows: store.workflows,
        runs: store.runs,
        schedules: store.schedules,
        sandboxSubmissions: store.sandboxSubmissions
      });
    }

    // Run Workflow (or Bulk Loop)
    if (pathname === '/api/workflows/run' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const activePort = server.address()?.port || PORT;
      // Fix port in sandbox URLs if running on ephemeral test port
      const normalizedSteps = (body.steps || []).map((s) => ({
        ...s,
        url: s.url ? s.url.replace(`localhost:${PORT}`, `127.0.0.1:${activePort}`) : s.url
      }));
      const result = await runWorkflow({
        name: body.name || 'Kịch bản tự động',
        steps: normalizedSteps,
        headless: body.headless !== false,
        persistentProfile: Boolean(body.persistentProfile),
        bulkRows: Array.isArray(body.bulkRows) ? body.bulkRows : []
      });
      return sendJson(res, 200, result);
    }

    // Save Workflow
    if (pathname === '/api/workflows' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const wf = {
        id: body.id || ('wf-' + crypto.randomBytes(3).toString('hex')),
        name: body.name || 'Kịch bản mới',
        description: body.description || '',
        headless: body.headless !== false,
        persistentProfile: Boolean(body.persistentProfile),
        steps: Array.isArray(body.steps) ? body.steps : [],
        createdAt: new Date().toISOString()
      };
      const idx = store.workflows.findIndex((w) => w.id === wf.id);
      if (idx >= 0) store.workflows[idx] = wf;
      else store.workflows.unshift(wf);
      saveStore();
      return sendJson(res, 200, { ok: true, workflow: wf, workflows: store.workflows });
    }

    // Import Workflows (.json)
    if (pathname === '/api/workflows/import' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const incoming = Array.isArray(body.workflows)
        ? body.workflows
        : body.workflow
          ? [body.workflow]
          : Array.isArray(body)
            ? body
            : [body];
      let importedCount = 0;
      for (const item of incoming) {
        if (!item || !Array.isArray(item.steps)) continue;
        const wf = {
          id: item.id || ('wf-' + crypto.randomBytes(3).toString('hex')),
          name: item.name || 'Kịch bản nhập khẩu',
          description: item.description || '',
          headless: item.headless !== false,
          persistentProfile: Boolean(item.persistentProfile),
          steps: item.steps,
          createdAt: new Date().toISOString()
        };
        const idx = store.workflows.findIndex((w) => w.id === wf.id);
        if (idx >= 0) store.workflows[idx] = wf;
        else store.workflows.unshift(wf);
        importedCount++;
      }
      saveStore();
      return sendJson(res, 200, { ok: true, importedCount, workflows: store.workflows });
    }

    // Delete Workflow
    if (pathname.startsWith('/api/workflows/') && req.method === 'DELETE') {
      const id = decodeURIComponent(pathname.replace('/api/workflows/', ''));
      store.workflows = store.workflows.filter((w) => w.id !== id);
      if (store.workflows.length === 0) {
        store.workflows = createDefaultStore().workflows;
      }
      saveStore();
      return sendJson(res, 200, { ok: true, workflows: store.workflows });
    }

    // 1-Click Export Any URL to PDF (/api/export-pdf)
    if (pathname === '/api/export-pdf' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const activePort = server.address()?.port || PORT;
      const targetUrl = String(body.targetUrl || '').replace(`localhost:${PORT}`, `127.0.0.1:${activePort}`);
      if (!targetUrl.trim()) {
        return sendJson(res, 400, { ok: false, error: 'Vui lòng nhập URL trang cần xuất PDF.' });
      }
      const session = new CdpBrowserSession({ headless: true });
      try {
        await session.launch();
        const pageInfo = await session.goto(targetUrl.trim());
        const pdf = await session.exportPdf(`PDF: ${pageInfo.title || targetUrl}`);
        return sendJson(res, 200, { ok: true, pageInfo, pdf });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: err.message });
      } finally {
        await session.close();
      }
    }

    // 1-Click Push Captured XHR/Fetch API to NetPulse (/api/push-api-netpulse)
    if (pathname === '/api/push-api-netpulse' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const netpulseUrl = String(body.netpulseUrl || 'http://localhost:4080').replace(/\/+$/, '');
      const replayPayload = {
        targetUrl: body.url,
        method: body.method || 'GET',
        headers: body.headers || { Accept: 'application/json' },
        body: body.postData || body.body || ''
      };
      const pushRes = await postJsonUrl(`${netpulseUrl}/api/replay`, replayPayload, 6000);
      return sendJson(res, 200, {
        ok: true,
        pushedToNetPulse: Boolean(pushRes && pushRes.ok),
        netpulseStatus: pushRes?.statusCode || 0,
        netpulseUrl
      });
    }

    // 1-Click Element & Form Inspector (/api/inspect-elements)
    if (pathname === '/api/inspect-elements' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const activePort = server.address()?.port || PORT;
      const targetUrl = String(body.targetUrl || '').replace(`localhost:${PORT}`, `127.0.0.1:${activePort}`);
      if (!targetUrl.trim()) {
        return sendJson(res, 400, { ok: false, error: 'Vui lòng nhập URL trang cần dò phần tử.' });
      }
      const result = await inspectPageElements(targetUrl.trim());
      return sendJson(res, 200, result);
    }

    // Live Browser Action Recorder (/api/record-actions)
    if (pathname === '/api/record-actions' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const activePort = server.address()?.port || PORT;
      const targetUrl = String(body.targetUrl || '').replace(`localhost:${PORT}`, `127.0.0.1:${activePort}`);
      if (!targetUrl.trim()) {
        return sendJson(res, 400, { ok: false, error: 'Vui lòng nhập URL trang web cần ghi thao tác.' });
      }
      const result = await recordBrowserActions({
        targetUrl: targetUrl.trim(),
        durationSec: Number(body.durationSec) || 12,
        headless: Boolean(body.headless),
        persistentProfile: Boolean(body.persistentProfile),
        demoAutoActions: Boolean(body.demoAutoActions)
      });
      return sendJson(res, 200, result);
    }

    // 1-Click Sync Browser Session (Cookies & Bearer Token) to NetPulse (/api/sync-session-netpulse)
    if (pathname === '/api/sync-session-netpulse' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const activePort = server.address()?.port || PORT;
      const targetUrl = String(body.targetUrl || '').replace(`localhost:${PORT}`, `127.0.0.1:${activePort}`);
      if (!targetUrl.trim()) {
        return sendJson(res, 400, { ok: false, error: 'Vui lòng nhập URL trang web cần trích xuất phiên đăng nhập.' });
      }
      const result = await syncBrowserSessionToNetPulse({
        targetUrl: targetUrl.trim(),
        netpulseUrl: body.netpulseUrl || 'http://localhost:4080',
        persistentProfile: body.persistentProfile !== false
      });
      return sendJson(res, 200, result);
    }

    // Schedules & Change Monitor Manager (/api/schedules)
    if (pathname === '/api/schedules' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const wf = store.workflows.find((w) => w.id === body.workflowId);
      if (!wf) {
        return sendJson(res, 400, { ok: false, error: 'Không tìm thấy kịch bản để hẹn giờ.' });
      }
      const sched = {
        id: 'sch-' + crypto.randomBytes(3).toString('hex'),
        workflowId: wf.id,
        workflowName: wf.name,
        intervalMinutes: Math.max(Number(body.intervalMinutes) || 5, 1),
        notifyWebhookUrl: String(body.notifyWebhookUrl || '').trim(),
        notifyOnChangeOnly: Boolean(body.notifyOnChangeOnly),
        enabled: true,
        runCount: 0,
        changeCount: 0,
        lastSnapshotHash: null,
        lastChangeStatus: null,
        lastDiffSummary: '',
        lastRunAt: null,
        createdAt: new Date().toISOString()
      };
      store.schedules.unshift(sched);
      saveStore();
      syncActiveSchedules();
      return sendJson(res, 200, { ok: true, schedule: sched, schedules: store.schedules });
    }

    // Run a Scheduled Task Immediately (/api/schedules/run-now)
    if (pathname === '/api/schedules/run-now' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const sched = store.schedules.find((s) => s.id === body.id);
      if (!sched) {
        return sendJson(res, 404, { ok: false, error: 'Không tìm thấy lịch hẹn giờ.' });
      }
      const resData = await executeScheduledTask(sched);
      return sendJson(res, 200, { ...resData, schedules: store.schedules });
    }

    if (pathname.startsWith('/api/schedules/') && req.method === 'DELETE') {
      const id = pathname.replace('/api/schedules/', '');
      store.schedules = store.schedules.filter((s) => s.id !== id);
      saveStore();
      syncActiveSchedules();
      return sendJson(res, 200, { ok: true, schedules: store.schedules });
    }

    // Smart 1-Click Web Scraper (with Multi-Page Pagination, PDF Export & Network X-Ray)
    if (pathname === '/api/scrape' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const activePort = server.address()?.port || PORT;
      const targetUrl = String(body.targetUrl || '').replace(`localhost:${PORT}`, `127.0.0.1:${activePort}`);
      if (!targetUrl.trim()) {
        return sendJson(res, 400, { ok: false, error: 'Vui lòng nhập URL trang web cần cào dữ liệu.' });
      }
      const result = await smartScrapeUrl({
        targetUrl,
        itemSelector: body.itemSelector || '',
        customFields: body.customFields || {},
        scrollFirst: body.scrollFirst !== false,
        maxPages: Number(body.maxPages) || 1,
        nextPageSelector: body.nextPageSelector || '',
        exportPdf: Boolean(body.exportPdf),
        headless: body.headless !== false
      });
      return sendJson(res, 200, result);
    }

    // Clear Runs History
    if (pathname === '/api/runs' && req.method === 'DELETE') {
      store.runs = [];
      saveStore();
      return sendJson(res, 200, { ok: true, runs: [] });
    }

    // Static Files
    const safePath = pathname === '/' ? '/index.html' : pathname;
    const resolved = path.normalize(path.join(PUBLIC_DIR, safePath));
    if (!resolved.startsWith(PUBLIC_DIR) || !fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
      res.writeHead(404);
      return res.end('Not Found');
    }
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(resolved).pipe(res);
  } catch (err) {
    console.error('[AutoPilot Error]', err);
    sendJson(res, 500, { ok: false, error: err.message });
  }
});

if (require.main === module) {
  syncActiveSchedules();
  server.listen(PORT, () => {
    console.log(`\n========================================================`);
    console.log(`🤖 AutoPilot Web - Browser Workflow Automator đang chạy!`);
    console.log(`🌐 Giao diện điều khiển : http://localhost:${PORT}`);
    console.log(`🛒 Trang Sandbox thực hành: http://localhost:${PORT}/sandbox/shop`);
    console.log(`========================================================\n`);
  });
}

module.exports = { server };
