/**
 * AutoPilot Web — Frontend Controller (PRO Edition)
 */

const state = {
  serverOrigin: window.location.origin,
  workflows: [],
  runs: [],
  schedules: [],
  activeWorkflow: null,
  currentExtractedRows: [],
  bulkExtractedRows: [],
  scrapeData: { cards: [], apis: [], links: [], images: [], customRows: [] },
  activeScrapeTab: 'cards',
  bulkMode: 'csv',
  inspectedElements: { url: '', inputs: [], buttons: [] }
};

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tabName));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${tabName}`));
}

// Parse CSV text (supports quoted fields and commas) into array of objects
function parseCsvToObjects(csvText) {
  const lines = String(csvText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  function splitCsvLine(line) {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  }

  const headers = splitCsvLine(lines[0]).map((h, idx) => h || `col_${idx + 1}`);
  return lines.slice(1).map((line) => {
    const vals = splitCsvLine(line);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = vals[idx] ?? '';
    });
    return obj;
  });
}

// Export array of objects to CSV (with UTF-8 BOM for Excel Vietnamese support) or JSON
function exportToCsv(rows, filename = 'autopilot-data.csv') {
  if (!Array.isArray(rows) || rows.length === 0) {
    showToast('Chưa có dữ liệu để xuất file CSV!');
    return;
  }
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r || {}))));
  const csvLines = [
    headers.join(','),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const val = String(r[h] ?? '').replace(/"/g, '""');
          return `"${val}"`;
        })
        .join(',')
    )
  ];
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast(`📥 Đã tải xuống ${filename} (${rows.length} dòng)!`);
}

function exportToJson(rows, filename = 'autopilot-data.json') {
  if (!Array.isArray(rows) || rows.length === 0) {
    showToast('Chưa có dữ liệu để xuất file JSON!');
    return;
  }
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast(`📥 Đã tải xuống ${filename} (${rows.length} dòng)!`);
}

// Render dynamic table from array of objects
function renderDynamicTable(rows, containerEl) {
  if (!Array.isArray(rows) || rows.length === 0) {
    containerEl.innerHTML = `<div class="empty-state"><p>Chưa có dữ liệu thu thập được.</p></div>`;
    return;
  }
  const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r || {}))));
  containerEl.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${rows.map((r) => `
          <tr>
            ${cols.map((c) => `<td>${esc(typeof r[c] === 'object' ? JSON.stringify(r[c]) : r[c])}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// Render Workflow Presets & Steps Editor
function renderWorkflowEditor() {
  const select = document.getElementById('wf-preset-select');
  const bulkSelect = document.getElementById('bulk-workflow-select');
  const schedSelect = document.getElementById('sched-workflow-select');

  const optsHtml = state.workflows.map((w) => `<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('');
  select.innerHTML = optsHtml;
  if (bulkSelect) {
    bulkSelect.innerHTML = optsHtml;
    const bulkTpl = state.workflows.find((w) => w.id === 'wf-bulk-template') || state.workflows[1] || state.workflows[0];
    if (bulkTpl) bulkSelect.value = bulkTpl.id;
  }
  if (schedSelect) {
    schedSelect.innerHTML = optsHtml;
  }

  if (!state.activeWorkflow && state.workflows.length > 0) {
    state.activeWorkflow = JSON.parse(JSON.stringify(state.workflows[0]));
  }
  if (!state.activeWorkflow) return;

  select.value = state.activeWorkflow.id;
  document.getElementById('wf-name').value = state.activeWorkflow.name || '';
  document.getElementById('wf-headless').value = String(state.activeWorkflow.headless !== false);
  document.getElementById('wf-persistent-profile').checked = Boolean(state.activeWorkflow.persistentProfile);

  renderStepsList();
}

function renderStepsList() {
  const listEl = document.getElementById('wf-steps-list');
  const steps = state.activeWorkflow?.steps || [];

  if (steps.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><p>Chưa có bước nào. Hãy bấm các nút "+ Thêm bước" phía trên.</p></div>`;
    return;
  }

  listEl.innerHTML = steps.map((s, idx) => {
    let fieldsHtml = '';
    if (s.type === 'goto') {
      fieldsHtml = `<input type="text" class="input-text" value="${esc(s.url || '')}" placeholder="URL trang web (VD: https://...)" onchange="updateStepField(${idx}, 'url', this.value)" />`;
    } else if (s.type === 'click') {
      fieldsHtml = `<input type="text" class="input-text" value="${esc(s.selector || '')}" placeholder="CSS Selector hoặc Chữ trên nút (VD: #btn-submit-order)" onchange="updateStepField(${idx}, 'selector', this.value)" />`;
    } else if (s.type === 'type') {
      fieldsHtml = `
        <div class="form-row">
          <input type="text" class="input-text" style="flex:1;" value="${esc(s.selector || '')}" placeholder="Selector ô nhập (VD: #inp-fullname)" onchange="updateStepField(${idx}, 'selector', this.value)" />
          <input type="text" class="input-text" style="flex:1.3;" value="${esc(s.value || '')}" placeholder="Nội dung gõ (hoặc {{fullname}})" onchange="updateStepField(${idx}, 'value', this.value)" />
        </div>
      `;
    } else if (s.type === 'scroll') {
      fieldsHtml = `
        <select class="input-select" onchange="updateStepField(${idx}, 'direction', this.value)">
          <option value="bottom" ${s.direction === 'bottom' ? 'selected' : ''}>Cuộn xuống cuối trang (bottom)</option>
          <option value="down" ${s.direction === 'down' ? 'selected' : ''}>Cuộn xuống 1 đoạn (600px)</option>
          <option value="top" ${s.direction === 'top' ? 'selected' : ''}>Cuộn lên đầu trang (top)</option>
        </select>
      `;
    } else if (s.type === 'wait') {
      fieldsHtml = `<input type="number" class="input-text" value="${esc(s.ms || 500)}" placeholder="Số mili-giây chờ (VD: 1000)" onchange="updateStepField(${idx}, 'ms', Number(this.value))" />`;
    } else if (s.type === 'wait_selector') {
      fieldsHtml = `
        <div class="form-row">
          <input type="text" class="input-text" style="flex:1.4;" value="${esc(s.selector || '')}" placeholder="CSS Selector cần chờ xuất hiện (VD: .product-card)" onchange="updateStepField(${idx}, 'selector', this.value)" />
          <input type="number" class="input-text" style="flex:0.8;" value="${esc(s.timeoutMs || 5000)}" placeholder="Timeout (ms)" onchange="updateStepField(${idx}, 'timeoutMs', Number(this.value))" />
        </div>
      `;
    } else if (s.type === 'press_key') {
      fieldsHtml = `
        <div class="form-row">
          <input type="text" class="input-text" style="flex:1.2;" value="${esc(s.selector || '')}" placeholder="Selector ô cần nhấn phím (Để trống = phần tử đang focus)" onchange="updateStepField(${idx}, 'selector', this.value)" />
          <select class="input-select" style="flex:0.9;" onchange="updateStepField(${idx}, 'key', this.value)">
            <option value="Enter" ${(s.key || 'Enter') === 'Enter' ? 'selected' : ''}>Phím Enter (Gửi / Tìm kiếm)</option>
            <option value="Tab" ${s.key === 'Tab' ? 'selected' : ''}>Phím Tab (Chuyển ô)</option>
            <option value="Escape" ${s.key === 'Escape' ? 'selected' : ''}>Phím Escape (Đóng popup)</option>
            <option value="ArrowDown" ${s.key === 'ArrowDown' ? 'selected' : ''}>Phím Mũi tên xuống (ArrowDown)</option>
            <option value="PageDown" ${s.key === 'PageDown' ? 'selected' : ''}>Phím PageDown</option>
          </select>
        </div>
      `;
    } else if (s.type === 'select_option') {
      fieldsHtml = `
        <div class="form-row">
          <input type="text" class="input-text" style="flex:1;" value="${esc(s.selector || '')}" placeholder="Selector thẻ <select> (VD: #city-select)" onchange="updateStepField(${idx}, 'selector', this.value)" />
          <input type="text" class="input-text" style="flex:1.2;" value="${esc(s.value || '')}" placeholder="Giá trị value hoặc Nhãn hiển thị (hoặc {{city}})" onchange="updateStepField(${idx}, 'value', this.value)" />
        </div>
      `;
    } else if (s.type === 'eval_js') {
      fieldsHtml = `<input type="text" class="input-text" value="${esc(s.code || 'document.title')}" placeholder="Biểu thức JavaScript chạy trên trang (VD: document.title)" onchange="updateStepField(${idx}, 'code', this.value)" />`;
    } else if (s.type === 'extract_list') {
      fieldsHtml = `
        <div class="form-row">
          <input type="text" class="input-text" style="flex:1;" value="${esc(s.itemSelector || '.product-card')}" placeholder="Selector khối lặp (VD: .product-card)" onchange="updateStepField(${idx}, 'itemSelector', this.value)" />
          <input type="text" class="input-text" style="flex:1.6;" value="${esc(JSON.stringify(s.fields || {}))}" placeholder='Cột JSON: {"name":".p-title","price":".p-price"}' onchange="updateStepJsonField(${idx}, 'fields', this.value)" />
        </div>
      `;
    }

    return `
      <div class="step-card">
        <div class="step-card-top">
          <div style="display:flex; align-items:center; gap:8px; flex:1;">
            <span class="step-badge">#${idx + 1} ${esc(s.type)}</span>
            <input type="text" class="input-text" style="flex:1; padding:4px 8px; font-size:12px;" value="${esc(s.label || '')}" placeholder="Mô tả bước..." onchange="updateStepField(${idx}, 'label', this.value)" />
          </div>
          <button class="btn btn-danger btn-xs" onclick="removeStep(${idx})">✕</button>
        </div>
        ${fieldsHtml}
      </div>
    `;
  }).join('');
}

window.updateStepField = function (idx, key, val) {
  if (!state.activeWorkflow || !state.activeWorkflow.steps[idx]) return;
  state.activeWorkflow.steps[idx][key] = val;
};

window.updateStepJsonField = function (idx, key, rawJson) {
  try {
    state.activeWorkflow.steps[idx][key] = JSON.parse(rawJson);
  } catch {
    showToast('Cấu hình cột phải là chuỗi JSON hợp lệ!');
  }
};

window.removeStep = function (idx) {
  state.activeWorkflow.steps.splice(idx, 1);
  renderStepsList();
};

window.addStep = function (type, customStep = null) {
  if (!state.activeWorkflow) return;
  if (customStep) {
    state.activeWorkflow.steps.push(customStep);
    renderStepsList();
    return;
  }
  const defaults = {
    goto: { type: 'goto', url: `${state.serverOrigin}/sandbox/shop`, label: 'Mở trang web' },
    click: { type: 'click', selector: '#btn-submit-order', label: 'Click nút' },
    type: { type: 'type', selector: '#inp-fullname', value: 'Nguyễn Văn A', label: 'Nhập văn bản' },
    press_key: { type: 'press_key', selector: '#inp-note', key: 'Enter', label: 'Nhấn phím Enter' },
    select_option: { type: 'select_option', selector: 'select', value: '', label: 'Chọn mục trong Dropdown' },
    wait_selector: { type: 'wait_selector', selector: '.product-card', timeoutMs: 5000, label: 'Chờ phần tử xuất hiện' },
    scroll: { type: 'scroll', direction: 'bottom', label: 'Cuộn xuống cuối trang' },
    extract_list: {
      type: 'extract_list',
      itemSelector: '.product-card',
      fields: { name: '.p-title', price: '.p-price', sku: '@data-sku' },
      label: 'Cào danh sách dữ liệu'
    },
    eval_js: { type: 'eval_js', code: '({ title: document.title, count: document.querySelectorAll(".product-card").length })', label: 'Chạy mã JavaScript tùy chỉnh' },
    wait: { type: 'wait', ms: 500, label: 'Chờ 500ms' },
    export_pdf: { type: 'export_pdf', label: 'Xuất trang hiện tại ra file PDF' },
    screenshot: { type: 'screenshot', label: 'Chụp ảnh màn hình' }
  };
  state.activeWorkflow.steps.push(defaults[type] || { type, label: type });
  renderStepsList();
};

window.addInspectedInput = function (idx) {
  const inp = state.inspectedElements.inputs[idx];
  if (!inp) return;
  window.addStep('type', {
    type: 'type',
    selector: inp.selector,
    value: `{{${inp.varName}}}`,
    label: `Điền ${inp.label} ({{${inp.varName}}})`
  });
  showToast(`➕ Đã thêm bước nhập cho ${inp.selector}`);
};

window.addInspectedButton = function (idx) {
  const btn = state.inspectedElements.buttons[idx];
  if (!btn) return;
  window.addStep('click', {
    type: 'click',
    selector: btn.selector,
    label: `Click nút "${btn.text}"`
  });
  showToast(`➕ Đã thêm bước Click cho ${btn.selector}`);
};

window.setBulkInputMode = function (mode) {
  state.bulkMode = mode;
  document.getElementById('btn-bulk-mode-csv').classList.toggle('active', mode === 'csv');
  document.getElementById('btn-bulk-mode-json').classList.toggle('active', mode === 'json');
  document.getElementById('bulk-csv-group').classList.toggle('hidden', mode !== 'csv');
  document.getElementById('bulk-json-group').classList.toggle('hidden', mode !== 'json');
};

window.runQuickDemo = async function (wfId) {
  const found = state.workflows.find((w) => w.id === wfId);
  if (found) {
    state.activeWorkflow = JSON.parse(JSON.stringify(found));
    renderWorkflowEditor();
  }
  switchTab('workflow');
  document.getElementById('btn-run-workflow').click();
};

window.fillScraperSample = function (type) {
  const input = document.getElementById('scrape-url');
  const maxPagesEl = document.getElementById('scrape-max-pages');
  const nextSelEl = document.getElementById('scrape-next-selector');
  if (type === 'sandbox') {
    input.value = `${state.serverOrigin}/sandbox/shop`;
    if (maxPagesEl) maxPagesEl.value = '1';
    if (nextSelEl) nextSelEl.value = '';
  } else if (type === 'sandbox-multi') {
    input.value = `${state.serverOrigin}/sandbox/shop`;
    if (maxPagesEl) maxPagesEl.value = '2';
    if (nextSelEl) nextSelEl.value = '.btn-next-page';
  } else {
    input.value = 'https://news.ycombinator.com';
    if (maxPagesEl) maxPagesEl.value = '1';
  }
  document.getElementById('btn-run-scraper').click();
};

function renderScrapeTabTable() {
  const tab = state.activeScrapeTab;
  const container = document.getElementById('scrape-table-container');

  if (tab === 'apis') {
    const apis = state.scrapeData.apis || [];
    if (apis.length === 0) {
      container.innerHTML = `<div class="empty-state"><p>Không phát hiện cuộc gọi API ngầm (XHR / Fetch JSON) nào trên trang này.</p></div>`;
      return;
    }
    container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:10px; padding:6px;">
        ${apis.map((api, idx) => `
          <div class="info-card" style="border-left:3px solid #38bdf8;">
            <div class="card-header-row" style="gap:10px; flex-wrap:wrap;">
              <div style="word-break:break-all; flex:1;">
                <span class="badge-pro">${esc(api.method)}</span>
                <span class="badge-pro" style="background:rgba(74,222,128,0.15); color:#4ade80;">HTTP ${esc(api.status || 200)}</span>
                <span class="badge-pro">${esc(api.resourceType || 'XHR')}</span>
                <code style="margin-left:6px; color:#7dd3fc;">${esc(api.url)}</code>
              </div>
              <div class="btn-row">
                <button class="btn btn-secondary btn-xs" onclick="copyApiCurl(${idx})">📋 Copy cURL</button>
                <button class="btn btn-accent btn-xs" onclick="pushApiToNetPulse(${idx})">⚡ Bắn sang NetPulse (4080)</button>
              </div>
            </div>
            ${api.responsePreview ? `
              <details style="margin-top:8px;">
                <summary style="cursor:pointer; font-size:12px; color:#94a3b8;">📦 Xem trước dữ liệu JSON trả về (${api.responsePreview.length} ký tự)</summary>
                <pre style="background:#090d16; padding:10px; border-radius:6px; border:1px solid var(--border); font-size:11.5px; color:#e2e8f0; overflow-x:auto; max-height:200px; margin-top:6px;">${esc(api.responsePreview)}</pre>
              </details>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `;
    return;
  }

  const rows = tab === 'cards'
    ? state.scrapeData.cards
    : tab === 'links'
      ? state.scrapeData.links
      : tab === 'images'
        ? state.scrapeData.images
        : state.scrapeData.customRows;
  renderDynamicTable(rows, container);
}

window.copyApiCurl = async function (idx) {
  const api = (state.scrapeData.apis || [])[idx];
  if (!api || !api.curlCommand) return;
  try {
    await navigator.clipboard.writeText(api.curlCommand);
    showToast('📋 Đã copy lệnh cURL của API ngầm vào Clipboard!');
  } catch {
    showToast('Lệnh cURL: ' + api.curlCommand.slice(0, 80));
  }
};

window.pushApiToNetPulse = async function (idx) {
  const api = (state.scrapeData.apis || [])[idx];
  if (!api) return;
  showToast('⚡ Đang đẩy API ngầm sang NetPulse (port 4080) để Replay...');
  const res = await fetch('/api/push-api-netpulse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: api.url,
      method: api.method,
      headers: api.headers,
      postData: api.postData,
      netpulseUrl: 'http://localhost:4080'
    })
  }).then((r) => r.json());
  if (res.ok && res.pushedToNetPulse) {
    showToast(`✅ Đã bắn API "${api.method} ${api.url}" sang NetPulse thành công (HTTP ${res.netpulseStatus})!`);
  } else {
    showToast(`⚠️ Không kết nối được NetPulse ở cổng 4080 (hãy đảm bảo NetPulse đang bật).`);
  }
};

function renderSchedules() {
  document.getElementById('sched-count').textContent = String(state.schedules.length);
  const listEl = document.getElementById('schedules-list');
  if (!listEl) return;

  if (state.schedules.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><p>Chưa có lịch hẹn giờ nào đang chạy.</p></div>`;
    return;
  }

  listEl.innerHTML = state.schedules.map((s) => {
    const statusBadge = s.lastChangeStatus === 'changed'
      ? `<span class="badge-pro" style="background:rgba(248,81,73,0.18); color:#ff7b72; border-color:#f85149;">🚨 Đã thay đổi (${s.changeCount || 1})</span>`
      : s.lastChangeStatus === 'initial'
        ? `<span class="badge-pro" style="background:rgba(88,166,255,0.16); color:#58a6ff;">📌 Snapshot gốc</span>`
        : s.lastChangeStatus === 'unchanged'
          ? `<span class="badge-pro" style="background:rgba(63,185,80,0.16); color:#3fb950;">✅ Không đổi</span>`
          : '';
    return `
    <div class="info-card">
      <div class="card-header-row">
        <div>
          <h4>⏰ ${esc(s.workflowName)} <span class="badge-pro">Mỗi ${s.intervalMinutes} phút</span> ${statusBadge}</h4>
          <p class="subtitle">Đã tự chạy: <strong>${s.runCount || 0} lần</strong> • Lần chạy cuối: ${s.lastRunAt ? new Date(s.lastRunAt).toLocaleString('vi-VN') : 'Đang chờ chu kỳ đầu tiên'}</p>
          ${s.lastDiffSummary ? `<p class="subtitle" style="margin-top:4px; color:var(--text);">🔍 <strong>So sánh Snapshot:</strong> ${esc(s.lastDiffSummary)} ${s.lastSnapshotHash ? `<code>[${esc(s.lastSnapshotHash)}]</code>` : ''}</p>` : ''}
          ${s.notifyWebhookUrl ? `<p class="subtitle" style="margin-top:2px;">🔔 <strong>Webhook nhận cảnh báo:</strong> <code>${esc(s.notifyWebhookUrl)}</code> (${s.notifyOnChangeOnly !== false ? 'Chỉ báo khi dữ liệu đổi' : 'Báo mỗi chu kỳ'})</p>` : ''}
        </div>
        <div class="btn-row">
          <button class="btn btn-secondary btn-xs" onclick="runScheduleNow('${esc(s.id)}')">▶️ Chạy & Kiểm tra ngay</button>
          <button class="btn btn-danger btn-xs" onclick="deleteSchedule('${esc(s.id)}')">🗑️ Hủy lịch</button>
        </div>
      </div>
    </div>
  `;
  }).join('');
}

window.runScheduleNow = async function (id) {
  showToast('⏳ Đang chạy kiểm tra thay đổi dữ liệu (Change Monitor)...');
  const res = await fetch('/api/schedules/run-now', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  }).then((r) => r.json());
  if (!res.ok) {
    showToast(`❌ Lỗi: ${res.error}`);
    return;
  }
  state.schedules = res.schedules || state.schedules;
  renderSchedules();
  if (res.result?.run) {
    state.runs.unshift(res.result.run);
    renderRunsHistory();
  }
  const st = res.result?.changeStatus;
  if (st === 'changed') {
    showToast(`🚨 Phát hiện dữ liệu trang web thay đổi! ${res.result.diffSummary}`);
  } else if (st === 'initial') {
    showToast(`📌 Đã lưu Snapshot chuẩn đầu tiên (${res.result.snapshotHash})`);
  } else {
    showToast(`✅ Dữ liệu trang web không thay đổi (${res.result?.snapshotHash || ''})`);
  }
};

window.deleteSchedule = async function (id) {
  const res = await fetch(`/api/schedules/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((r) => r.json());
  if (res.ok) {
    state.schedules = res.schedules || [];
    renderSchedules();
    showToast('🗑️ Đã xóa lịch hẹn giờ');
  }
};

function renderRunsHistory() {
  document.getElementById('runs-count').textContent = String(state.runs.length);
  const listEl = document.getElementById('history-list');
  if (state.runs.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><p>Chưa có lịch sử chạy nào.</p></div>`;
    return;
  }

  listEl.innerHTML = state.runs.map((r, idx) => {
    const lastShot = r.screenshots && r.screenshots.length > 0 ? r.screenshots[r.screenshots.length - 1].url : null;
    const lastPdf = r.pdfs && r.pdfs.length > 0 ? r.pdfs[r.pdfs.length - 1].url : null;
    const apiCount = (r.capturedApis || []).length;
    return `
      <div class="info-card">
        <div class="card-header-row">
          <div>
            <h4>${esc(r.name)} <span class="badge-pro">${esc(r.browserUsed || 'Browser')}</span></h4>
            <p class="subtitle">Thời gian: ${new Date(r.createdAt).toLocaleString('vi-VN')} • Tổng: ${r.totalDurationMs} ms • Đã cào: ${(r.extractedData || []).length} dòng ${apiCount > 0 ? `• 📡 API ngầm: ${apiCount}` : ''}</p>
          </div>
          <div class="btn-row">
            ${lastPdf ? `<a href="${esc(lastPdf)}" target="_blank" class="btn btn-accent btn-xs" style="text-decoration:none;">📄 Mở PDF</a>` : ''}
            <button class="btn btn-secondary btn-xs" onclick="exportRunData(${idx}, 'csv')">📥 CSV</button>
            <button class="btn btn-secondary btn-xs" onclick="exportRunData(${idx}, 'json')">📥 JSON</button>
          </div>
        </div>
        ${lastShot ? `<img src="${esc(lastShot)}" style="max-height:160px; border-radius:6px; margin-top:8px; border:1px solid var(--border);" />` : ''}
      </div>
    `;
  }).join('');
}

window.exportRunData = function (idx, fmt) {
  const r = state.runs[idx];
  if (!r) return;
  if (fmt === 'csv') exportToCsv(r.extractedData || [], `${r.id}.csv`);
  else exportToJson(r.extractedData || [], `${r.id}.json`);
};

function setupEvents() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('wf-preset-select').addEventListener('change', (e) => {
    const wf = state.workflows.find((w) => w.id === e.target.value);
    if (wf) {
      state.activeWorkflow = JSON.parse(JSON.stringify(wf));
      renderWorkflowEditor();
    }
  });

  // 1-Click Element & Form Inspector
  document.getElementById('btn-run-inspector').addEventListener('click', async () => {
    const btn = document.getElementById('btn-run-inspector');
    const targetUrl = document.getElementById('inspect-url-input').value.trim();
    if (!targetUrl) {
      showToast('Vui lòng nhập URL trang cần dò ô nhập & nút bấm!');
      return;
    }

    btn.disabled = true;
    btn.textContent = '⏳ Đang dò...';
    try {
      const data = await fetch('/api/inspect-elements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl })
      }).then((r) => r.json());

      if (!data.ok) {
        showToast(`❌ Lỗi: ${data.error}`);
        return;
      }

      state.inspectedElements = {
        url: data.pageInfo?.url || targetUrl,
        inputs: data.inputs || [],
        buttons: data.buttons || []
      };

      const box = document.getElementById('inspector-results-box');
      box.classList.remove('hidden');
      document.getElementById('btn-autogen-form-wf').classList.toggle('hidden', state.inspectedElements.inputs.length === 0);

      const inputRows = state.inspectedElements.inputs.map((inp, idx) => `
        <div class="log-row ok" style="align-items:center;">
          <span>⌨️ <strong>${esc(inp.label)}</strong> — <code>${esc(inp.selector)}</code> (Biến: <code>{{${esc(inp.varName)}}}</code>)</span>
          <button class="btn btn-secondary btn-xs" onclick="addInspectedInput(${idx})">+ Bước Nhập</button>
        </div>
      `);

      const btnRows = state.inspectedElements.buttons.map((b, idx) => `
        <div class="log-row" style="align-items:center;">
          <span>🖱️ Nút <strong>"${esc(b.text)}"</strong> — <code>${esc(b.selector)}</code></span>
          <button class="btn btn-secondary btn-xs" onclick="addInspectedButton(${idx})">+ Bước Click</button>
        </div>
      `);

      box.innerHTML = [...inputRows, ...btnRows].join('') || `<p class="subtitle">Không tìm thấy ô nhập hoặc nút bấm nào trên trang này.</p>`;
      showToast(`🔍 Tìm thấy ${state.inspectedElements.inputs.length} ô nhập & ${state.inspectedElements.buttons.length} nút bấm!`);
    } finally {
      btn.disabled = false;
      btn.textContent = '🔍 Quét Phần Tử';
    }
  });

  // Auto-generate entire form-filling workflow from inspected elements
  document.getElementById('btn-autogen-form-wf').addEventListener('click', () => {
    const { url, inputs, buttons } = state.inspectedElements;
    if (!inputs.length) return;
    const steps = [
      { type: 'goto', url, label: `Mở trang ${url}` },
      ...inputs.map((inp) => ({
        type: 'type',
        selector: inp.selector,
        value: `{{${inp.varName}}}`,
        label: `Điền ${inp.label} ({{${inp.varName}}})`
      }))
    ];
    if (buttons.length > 0) {
      steps.push({
        type: 'click',
        selector: buttons[0].selector,
        label: `Bấm nút "${buttons[0].text}"`
      });
    }
    steps.push({ type: 'screenshot', label: 'Chụp ảnh màn hình kết quả' });

    state.activeWorkflow = {
      id: 'wf-' + Date.now().toString(36),
      name: `Điền Form Tự Động (${new URL(url).pathname})`,
      headless: true,
      persistentProfile: document.getElementById('wf-persistent-profile').checked,
      steps
    };
    document.getElementById('wf-name').value = state.activeWorkflow.name;
    renderStepsList();
    showToast(`✨ Đã tự sinh trọn bộ ${steps.length} bước điền Form!`);
  });

  // Execute Workflow
  document.getElementById('btn-run-workflow').addEventListener('click', async () => {
    if (!state.activeWorkflow) return;
    const btn = document.getElementById('btn-run-workflow');
    const name = document.getElementById('wf-name').value.trim() || state.activeWorkflow.name;
    const headless = document.getElementById('wf-headless').value === 'true';
    const persistentProfile = document.getElementById('wf-persistent-profile').checked;

    btn.disabled = true;
    btn.textContent = '⏳ Trình duyệt đang chạy kịch bản...';
    document.getElementById('wf-live-logs').innerHTML = '';

    try {
      const res = await fetch('/api/workflows/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          headless,
          persistentProfile,
          steps: state.activeWorkflow.steps
        })
      }).then((r) => r.json());

      if (!res.ok) {
        showToast(`❌ Lỗi: ${res.error}`);
        return;
      }

      const run = res.run;
      state.currentExtractedRows = run.extractedData || [];
      document.getElementById('wf-extracted-count').textContent = String(state.currentExtractedRows.length);
      renderDynamicTable(state.currentExtractedRows, document.getElementById('wf-extracted-table-wrap'));

      if (run.screenshots && run.screenshots.length > 0) {
        const lastShot = run.screenshots[run.screenshots.length - 1];
        const img = document.getElementById('live-screen-img');
        img.src = lastShot.url;
        img.classList.remove('hidden');
        document.getElementById('live-screen-empty').classList.add('hidden');
      }

      state.runs.unshift(run);
      renderRunsHistory();
      showToast(`✅ Hoàn tất kịch bản (${run.totalDurationMs}ms) — Thu được ${state.currentExtractedRows.length} dòng!`);
    } finally {
      btn.disabled = false;
      btn.textContent = '▶️ Chạy Kịch Bản Ngay';
    }
  });

  // Save Workflow
  document.getElementById('btn-save-workflow').addEventListener('click', async () => {
    if (!state.activeWorkflow) return;
    state.activeWorkflow.name = document.getElementById('wf-name').value.trim() || 'Kịch bản mới';
    state.activeWorkflow.headless = document.getElementById('wf-headless').value === 'true';
    state.activeWorkflow.persistentProfile = document.getElementById('wf-persistent-profile').checked;
    const res = await fetch('/api/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.activeWorkflow)
    }).then((r) => r.json());
    if (res.ok) {
      state.workflows = res.workflows;
      renderWorkflowEditor();
      showToast('💾 Đã lưu kịch bản!');
    }
  });

  // Delete Workflow
  document.getElementById('btn-delete-workflow')?.addEventListener('click', async () => {
    if (!state.activeWorkflow || !state.activeWorkflow.id) return;
    const res = await fetch(`/api/workflows/${encodeURIComponent(state.activeWorkflow.id)}`, {
      method: 'DELETE'
    }).then((r) => r.json());
    if (res.ok) {
      state.workflows = res.workflows || [];
      state.activeWorkflow = state.workflows[0] ? JSON.parse(JSON.stringify(state.workflows[0])) : null;
      renderWorkflowEditor();
      showToast('🗑️ Đã xóa kịch bản!');
    }
  });

  // Export Workflows (.json)
  document.getElementById('btn-export-workflows')?.addEventListener('click', () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      activeWorkflow: state.activeWorkflow,
      workflows: state.workflows
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `autopilot-workflows-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast(`📤 Đã xuất ${state.workflows.length} kịch bản ra file .JSON!`);
  });

  // Import Workflows (.json)
  document.getElementById('wf-import-file')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        const res = await fetch('/api/workflows/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed)
        }).then((r) => r.json());
        if (res.ok) {
          state.workflows = res.workflows || [];
          state.activeWorkflow = state.workflows[0] ? JSON.parse(JSON.stringify(state.workflows[0])) : null;
          renderWorkflowEditor();
          showToast(`📥 Đã nhập thành công ${res.importedCount || 1} kịch bản!`);
        }
      } catch {
        showToast('❌ File .JSON không hợp lệ!');
      }
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  });

  document.getElementById('btn-wf-export-csv').addEventListener('click', () => {
    exportToCsv(state.currentExtractedRows, 'workflow-extracted.csv');
  });

  document.getElementById('btn-wf-export-json').addEventListener('click', () => {
    exportToJson(state.currentExtractedRows, 'workflow-extracted.json');
  });

  // 1-Click Export Page to PDF in Scraper Tab
  document.getElementById('btn-export-page-pdf')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-export-page-pdf');
    const targetUrl = document.getElementById('scrape-url').value.trim();
    if (!targetUrl) {
      showToast('Vui lòng nhập URL trang web cần xuất PDF!');
      return;
    }
    btn.disabled = true;
    btn.textContent = '⏳ Đang kết xuất PDF...';
    try {
      const res = await fetch('/api/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl })
      }).then((r) => r.json());

      if (!res.ok || !res.pdf) {
        showToast(`❌ Lỗi xuất PDF: ${res.error || 'Không thể tạo PDF'}`);
        return;
      }
      const banner = document.getElementById('scrape-pdf-banner');
      if (banner) {
        banner.classList.remove('hidden');
        banner.innerHTML = `
          <div class="card-header-row">
            <span>📄 <strong>Đã xuất PDF thành công:</strong> <code>${esc(res.pdf.filename)}</code> (${Math.round((res.pdf.sizeBytes || 0) / 1024)} KB)</span>
            <a href="${esc(res.pdf.url)}" target="_blank" download="${esc(res.pdf.filename)}" class="btn btn-accent btn-xs" style="text-decoration:none;">📥 Mở / Tải File PDF</a>
          </div>
        `;
      }
      showToast(`📄 Đã tạo file PDF thành công (${res.pdf.filename})!`);
    } finally {
      btn.disabled = false;
      btn.textContent = '📄 Xuất Trang Thành PDF';
    }
  });

  // Smart 1-Click Scraper (with Multi-Page Pagination & Network X-Ray)
  document.getElementById('btn-run-scraper').addEventListener('click', async () => {
    const btn = document.getElementById('btn-run-scraper');
    const targetUrl = document.getElementById('scrape-url').value.trim();
    const scrollFirst = document.getElementById('scrape-scroll').checked;
    const maxPages = Number(document.getElementById('scrape-max-pages')?.value) || 1;
    const nextPageSelector = (document.getElementById('scrape-next-selector')?.value || '').trim();
    const itemSelector = document.getElementById('scrape-custom-item').value.trim();
    let customFields = {};
    const rawFields = document.getElementById('scrape-custom-fields').value.trim();
    if (rawFields) {
      try { customFields = JSON.parse(rawFields); } catch {}
    }

    if (!targetUrl) {
      showToast('Vui lòng nhập URL trang web cần cào!');
      return;
    }

    btn.disabled = true;
    btn.textContent = maxPages > 1
      ? `⏳ Đang tự động lật & cào ${maxPages} trang...`
      : '⏳ Đang mở trang & bóc tách dữ liệu...';
    try {
      const data = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl, scrollFirst, maxPages, nextPageSelector, itemSelector, customFields })
      }).then((r) => r.json());

      if (!data.ok) {
        showToast(`❌ Lỗi: ${data.error}`);
        return;
      }

      document.getElementById('scrape-results-area').classList.remove('hidden');

      const m = data.meta || {};
      document.getElementById('scrape-meta-box').innerHTML = [
        ['Tiêu đề trang', m.title],
        ['URL thực tế', m.url],
        ['Số trang đã cào', `${data.pagesScraped || 1} trang`],
        ['API ngầm bắt được (XHR/Fetch)', `${(data.capturedApis || []).length} endpoints`],
        ['Thẻ H1', m.h1 || '(Không có)'],
        ['Trình duyệt thực thi', data.browserUsed]
      ].map(([k, v]) => `<div class="kv-row"><span class="kv-key">${esc(k)}</span><span class="kv-val">${esc(v)}</span></div>`).join('');

      if (data.screenshot?.url) {
        document.getElementById('scrape-shot-img').src = data.screenshot.url;
      }

      state.scrapeData = {
        cards: data.cards || [],
        apis: data.capturedApis || [],
        links: data.links || [],
        images: data.images || [],
        customRows: data.customRows || []
      };

      document.getElementById('cnt-cards').textContent = String(state.scrapeData.cards.length);
      const cntApisEl = document.getElementById('cnt-apis');
      if (cntApisEl) cntApisEl.textContent = String(state.scrapeData.apis.length);
      document.getElementById('cnt-links').textContent = String(state.scrapeData.links.length);
      document.getElementById('cnt-images').textContent = String(state.scrapeData.images.length);
      document.getElementById('cnt-custom').textContent = String(state.scrapeData.customRows.length);

      if (itemSelector && state.scrapeData.customRows.length > 0) {
        state.activeScrapeTab = 'custom';
      } else {
        state.activeScrapeTab = 'cards';
      }
      document.querySelectorAll('[data-scrapetab]').forEach((b) => b.classList.toggle('active', b.dataset.scrapetab === state.activeScrapeTab));
      renderScrapeTabTable();
      showToast(`🧲 Đã cào xong ${data.pagesScraped || 1} trang: ${state.scrapeData.cards.length} mục, ${state.scrapeData.apis.length} API ngầm!`);
    } finally {
      btn.disabled = false;
      btn.textContent = '🧲 Bắt Đầu Cào Dữ Liệu';
    }
  });

  document.querySelectorAll('[data-scrapetab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeScrapeTab = btn.dataset.scrapetab;
      document.querySelectorAll('[data-scrapetab]').forEach((b) => b.classList.toggle('active', b.dataset.scrapetab === state.activeScrapeTab));
      renderScrapeTabTable();
    });
  });

  document.getElementById('btn-scrape-export-csv').addEventListener('click', () => {
    const rows = state.scrapeData[state.activeScrapeTab === 'custom' ? 'customRows' : state.activeScrapeTab] || [];
    exportToCsv(rows, `scraped-${state.activeScrapeTab}.csv`);
  });

  document.getElementById('btn-scrape-export-json').addEventListener('click', () => {
    const rows = state.scrapeData[state.activeScrapeTab === 'custom' ? 'customRows' : state.activeScrapeTab] || [];
    exportToJson(rows, `scraped-${state.activeScrapeTab}.json`);
  });

  // Upload CSV file into Bulk Form Loop
  document.getElementById('bulk-csv-file').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      document.getElementById('bulk-csv-input').value = String(reader.result || '');
      window.setBulkInputMode('csv');
      showToast(`📂 Đã nạp file ${file.name}!`);
    };
    reader.readAsText(file, 'utf-8');
  });

  // Bulk Form Loop Runner (Supports both CSV/Excel & JSON + Any selected Workflow)
  document.getElementById('btn-run-bulk').addEventListener('click', async () => {
    const btn = document.getElementById('btn-run-bulk');
    let bulkRows = [];
    if (state.bulkMode === 'csv') {
      bulkRows = parseCsvToObjects(document.getElementById('bulk-csv-input').value);
    } else {
      try {
        bulkRows = JSON.parse(document.getElementById('bulk-json-input').value || '[]');
      } catch {
        showToast('Dữ liệu đầu vào phải là mảng JSON hợp lệ!');
        return;
      }
    }

    if (!bulkRows.length) {
      showToast('Chưa có dòng dữ liệu nào để chạy hàng loạt!');
      return;
    }

    const wfId = document.getElementById('bulk-workflow-select').value;
    const selectedWf = state.workflows.find((w) => w.id === wfId) || state.activeWorkflow;
    if (!selectedWf || !selectedWf.steps?.length) {
      showToast('Vui lòng chọn một kịch bản hợp lệ!');
      return;
    }

    const headless = document.getElementById('bulk-headless').value === 'true';

    btn.disabled = true;
    btn.textContent = `⏳ Đang tự động lặp qua ${bulkRows.length} dòng...`;
    document.getElementById('bulk-results-logs').innerHTML = '';

    try {
      const res = await fetch('/api/workflows/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `[Hàng loạt ${bulkRows.length} dòng] ${selectedWf.name}`,
          headless,
          persistentProfile: Boolean(selectedWf.persistentProfile),
          steps: selectedWf.steps,
          bulkRows
        })
      }).then((r) => r.json());

      if (res.ok && res.run) {
        state.bulkExtractedRows = res.run.extractedData || [];
        renderDynamicTable(state.bulkExtractedRows, document.getElementById('bulk-extracted-table'));
        state.runs.unshift(res.run);
        renderRunsHistory();
        showToast(`🎉 Đã chạy xong ${bulkRows.length} dòng dữ liệu!`);
      }
    } finally {
      btn.disabled = false;
      btn.textContent = '🚀 Chạy Điền Form Hàng Loạt';
    }
  });

  document.getElementById('btn-bulk-export-csv').addEventListener('click', () => {
    exportToCsv(state.bulkExtractedRows, 'bulk-form-results.csv');
  });

  // Add Schedule (with Change Monitor & Webhook Alerting)
  document.getElementById('btn-add-schedule').addEventListener('click', async () => {
    const workflowId = document.getElementById('sched-workflow-select').value;
    const intervalMinutes = Number(document.getElementById('sched-interval-select').value) || 5;
    const notifyWebhookUrl = (document.getElementById('sched-notify-url')?.value || '').trim();
    const notifyOnChangeOnly = document.getElementById('sched-notify-change-only')?.checked !== false;
    const res = await fetch('/api/schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflowId, intervalMinutes, notifyWebhookUrl, notifyOnChangeOnly })
    }).then((r) => r.json());
    if (res.ok) {
      state.schedules = res.schedules || [];
      renderSchedules();
      showToast(`⏰ Đã bật lịch chạy & giám sát thay đổi mỗi ${intervalMinutes} phút!`);
    }
  });

  // Live Browser Action Recorder
  async function handleRunRecorder(demoAutoActions) {
    const targetUrl = (document.getElementById('recorder-url-input')?.value || '').trim() || `${state.serverOrigin}/sandbox/shop`;
    const durationSec = Number(document.getElementById('recorder-duration')?.value) || 8;
    const persistentProfile = document.getElementById('wf-persistent-profile')?.checked !== false;
    const btnStart = document.getElementById('btn-start-recorder');
    const btnDemo = document.getElementById('btn-demo-recorder');
    if (btnStart) btnStart.disabled = true;
    if (btnDemo) btnDemo.disabled = true;

    showToast(demoAutoActions
      ? '⚡ Đang chạy Demo tự động ghi thao tác trên trang mẫu...'
      : `🔴 Đang mở trình duyệt ghi thao tác (${durationSec}s)... Hãy click hoặc gõ phím trên cửa sổ vừa mở!`);

    try {
      const res = await fetch('/api/record-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl,
          durationSec: demoAutoActions ? 4 : durationSec,
          headless: demoAutoActions,
          persistentProfile,
          demoAutoActions
        })
      }).then((r) => r.json());

      if (!res.ok) {
        showToast(`❌ Lỗi ghi thao tác: ${res.error}`);
        return;
      }

      state.activeWorkflow = {
        id: 'wf-rec-' + Date.now().toString(36),
        name: `🎬 Kịch bản ghi tự động (${new URL(targetUrl).pathname})`,
        headless: true,
        persistentProfile,
        steps: res.steps || []
      };
      document.getElementById('wf-name').value = state.activeWorkflow.name;
      renderStepsList();
      showToast(`🎬 Đã thu được ${res.recordedCount || 0} thao tác & sinh kịch bản ${(res.steps || []).length} bước!`);
    } finally {
      if (btnStart) btnStart.disabled = false;
      if (btnDemo) btnDemo.disabled = false;
    }
  }

  document.getElementById('btn-start-recorder')?.addEventListener('click', () => handleRunRecorder(false));
  document.getElementById('btn-demo-recorder')?.addEventListener('click', () => handleRunRecorder(true));

  // 1-Click Sync Session (Cookies & Bearer Token) to NetPulse
  document.getElementById('btn-sync-netpulse')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-sync-netpulse');
    const targetUrl = (document.getElementById('inspect-url-input')?.value || document.getElementById('scrape-url')?.value || `${state.serverOrigin}/sandbox/shop`).trim();
    const persistentProfile = document.getElementById('wf-persistent-profile')?.checked !== false;
    btn.disabled = true;
    btn.textContent = '⏳ Đang trích xuất Cookie & JWT...';
    try {
      const res = await fetch('/api/sync-session-netpulse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl,
          netpulseUrl: 'http://localhost:4080',
          persistentProfile
        })
      }).then((r) => r.json());

      const box = document.getElementById('sync-netpulse-box');
      if (!res.ok) {
        showToast(`❌ Lỗi đồng bộ phiên: ${res.error}`);
        return;
      }
      if (box) {
        box.classList.remove('hidden');
        box.innerHTML = `
          <div class="log-row ok" style="align-items:center;">
            <span>🔗 <strong>Trạng thái đồng bộ sang NetPulse (${esc(res.netpulseUrl)}):</strong> ${res.netpulseSynced ? '✅ Đã nạp vào Kho Biến Môi Trường ({{COOKIE_HEADER}}, {{API_TOKEN}})' : `⚠️ Đã trích xuất thành công (NetPulse phản hồi: ${esc(res.netpulseResponse)})`}</span>
          </div>
          <div class="log-row" style="align-items:center;">
            <span>🍪 <strong>Cookies thu được (${res.cookiesCount} cookies):</strong> <code>${esc((res.cookieHeader || '').slice(0, 120))}</code></span>
          </div>
          <div class="log-row" style="align-items:center;">
            <span>🔑 <strong>Bearer / JWT Token:</strong> <code>${esc((res.detectedBearerToken || '(Không có)').slice(0, 100))}</code></span>
          </div>
        `;
      }
      showToast(res.netpulseSynced
        ? `🔗 Đã đồng bộ ${res.cookiesCount} Cookie & JWT Token sang NetPulse (port 4080)!`
        : `🍪 Đã trích xuất ${res.cookiesCount} Cookie & JWT Token!`);
    } finally {
      btn.disabled = false;
      btn.textContent = '🔗 Đồng bộ Cookie & Token sang NetPulse';
    }
  });

  document.getElementById('btn-clear-history').addEventListener('click', async () => {
    await fetch('/api/runs', { method: 'DELETE' });
    state.runs = [];
    renderRunsHistory();
    showToast('🗑️ Đã xóa lịch sử chạy');
  });
}

function connectSse() {
  const es = new EventSource('/api/stream');
  es.addEventListener('step_progress', (e) => {
    const { logItem } = JSON.parse(e.data);
    const rowHtml = `
      <div class="log-row ${logItem.status}">
        <span><strong>#${logItem.stepIndex}</strong> ${esc(logItem.label)} — ${esc(logItem.summary)}</span>
        <span>${logItem.durationMs}ms</span>
      </div>
    `;
    const wfLogs = document.getElementById('wf-live-logs');
    if (wfLogs) {
      wfLogs.insertAdjacentHTML('beforeend', rowHtml);
      wfLogs.scrollTop = wfLogs.scrollHeight;
    }
    const bulkLogs = document.getElementById('bulk-results-logs');
    if (bulkLogs) {
      bulkLogs.insertAdjacentHTML('beforeend', rowHtml);
      bulkLogs.scrollTop = bulkLogs.scrollHeight;
    }
    if (logItem.screenshotUrl) {
      const img = document.getElementById('live-screen-img');
      img.src = logItem.screenshotUrl;
      img.classList.remove('hidden');
      document.getElementById('live-screen-empty').classList.add('hidden');
    }
  });

  es.addEventListener('schedules_updated', (e) => {
    state.schedules = JSON.parse(e.data);
    renderSchedules();
  });

  es.addEventListener('run_completed', (e) => {
    const run = JSON.parse(e.data);
    if (!state.runs.some((r) => r.id === run.id)) {
      state.runs.unshift(run);
      renderRunsHistory();
    }
  });
}

async function init() {
  setupEvents();
  const data = await fetch('/api/state').then((r) => r.json());
  state.serverOrigin = data.serverOrigin || window.location.origin;
  state.workflows = data.workflows || [];
  state.runs = data.runs || [];
  state.schedules = data.schedules || [];

  const badge = document.getElementById('browser-badge');
  badge.textContent = data.browserAvailable
    ? `🌐 Sẵn sàng điều khiển: ${data.browserAvailable}`
    : '⚠️ Không tìm thấy Chrome/Edge';

  document.getElementById('scrape-url').value = `${state.serverOrigin}/sandbox/shop`;
  document.getElementById('inspect-url-input').value = `${state.serverOrigin}/sandbox/shop`;
  const recInput = document.getElementById('recorder-url-input');
  if (recInput) recInput.value = `${state.serverOrigin}/sandbox/shop`;

  renderWorkflowEditor();
  renderSchedules();
  renderRunsHistory();
  connectSse();
}

window.addEventListener('DOMContentLoaded', init);
