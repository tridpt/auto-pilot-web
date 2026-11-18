/**
 * Automated End-to-End Test Suite for AutoPilot Web (CDP Browser Automator & Scraper)
 */

const assert = require('node:assert');
const { server } = require('./server');

async function runTests() {
  console.log('🧪 Bắt đầu kiểm thử AutoPilot Web...');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Test 1-Click Smart Scraper on Sandbox Shop
    const scrapeRes = await fetch(`${baseUrl}/api/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUrl: `${baseUrl}/sandbox/shop`,
        scrollFirst: true
      })
    }).then((r) => r.json());

    assert.strictEqual(scrapeRes.ok, true, 'Smart scrape should succeed');
    assert.strictEqual(scrapeRes.cards.length, 8, 'Should extract 8 products from sandbox shop');
    assert.ok(scrapeRes.screenshot?.url, 'Should capture screenshot');
    console.log(`  ✅ Cào dữ liệu 1-Click thành công (${scrapeRes.cards.length} sản phẩm, trình duyệt ${scrapeRes.browserUsed})`);

    // 2. Test Bulk Form Filling Workflow (2 rows)
    const wfRes = await fetch(`${baseUrl}/api/workflows/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Bulk Form Loop',
        headless: true,
        bulkRows: [
          { fullname: 'Test User 1', email: 'u1@test.vn', phone: '0901112222', note: 'Row 1' },
          { fullname: 'Test User 2', email: 'u2@test.vn', phone: '0903334444', note: 'Row 2' }
        ],
        steps: [
          { type: 'goto', url: `${baseUrl}/sandbox/shop`, label: 'Open Sandbox' },
          { type: 'type', selector: '#inp-fullname', value: '{{fullname}}', label: 'Type Name' },
          { type: 'type', selector: '#inp-email', value: '{{email}}', label: 'Type Email' },
          { type: 'type', selector: '#inp-phone', value: '{{phone}}', label: 'Type Phone' },
          { type: 'type', selector: '#inp-note', value: '{{note}}', label: 'Type Note' },
          { type: 'click', selector: '#btn-submit-order', label: 'Submit Form' },
          { type: 'wait', ms: 250, label: 'Wait' },
          {
            type: 'extract_list',
            itemSelector: '#order-result-box',
            fields: { orderCode: '.res-code', summary: '.res-summary' },
            label: 'Extract Order Code'
          }
        ]
      })
    }).then((r) => r.json());

    assert.strictEqual(wfRes.ok, true, 'Workflow execution should succeed');
    assert.strictEqual(wfRes.run.extractedData.length, 2, 'Should collect 2 order confirmations from 2 bulk rows');
    console.log(`  ✅ Kịch bản Điền Form Hàng Loạt thành công (${wfRes.run.extractedData.length} đơn hàng được tạo tự động)`);

    // 3. Test 1-Click Element & Form Inspector (/api/inspect-elements)
    const inspectRes = await fetch(`${baseUrl}/api/inspect-elements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUrl: `${baseUrl}/sandbox/shop` })
    }).then((r) => r.json());
    assert.strictEqual(inspectRes.ok, true, 'Element inspector should succeed');
    assert.strictEqual(inspectRes.inputs.length, 4, 'Should detect 4 input/textarea fields on sandbox form');
    assert.ok(inspectRes.buttons.length >= 1, 'Should detect submit button');
    console.log(`  ✅ Quét tự động Ô nhập & Nút bấm thành công (${inspectRes.inputs.length} ô nhập, ${inspectRes.buttons.length} nút bấm)`);

    // 4. Test Live Browser Action Recorder (/api/record-actions in demoAutoActions mode)
    const recRes = await fetch(`${baseUrl}/api/record-actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUrl: `${baseUrl}/sandbox/shop`,
        durationSec: 4,
        headless: true,
        persistentProfile: false,
        demoAutoActions: true
      })
    }).then((r) => r.json());
    assert.strictEqual(recRes.ok, true, 'Action recorder should succeed');
    assert.ok(recRes.recordedCount >= 4, `Should record at least 4 user actions, got ${recRes.recordedCount}`);
    assert.ok(recRes.steps.length >= 6, 'Should generate goto + type/click + screenshot steps');
    console.log(`  ✅ Ghi thao tác trình duyệt tự động (Action Recorder) thành công (${recRes.recordedCount} thao tác → ${recRes.steps.length} bước kịch bản)`);

    // 5. Test 1-Click Session Sync (Cookies & JWT Token) to NetPulse (/api/sync-session-netpulse)
    const syncRes = await fetch(`${baseUrl}/api/sync-session-netpulse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUrl: `${baseUrl}/sandbox/shop`,
        netpulseUrl: 'http://localhost:4080',
        persistentProfile: false
      })
    }).then((r) => r.json());
    assert.strictEqual(syncRes.ok, true, 'Session sync should succeed');
    assert.ok(syncRes.cookiesCount >= 1, 'Should extract sandbox session cookies');
    assert.ok(syncRes.detectedBearerToken && syncRes.detectedBearerToken.startsWith('eyJ'), 'Should extract sandbox JWT token from localStorage');
    console.log(`  ✅ Trích xuất & Đồng bộ Phiên (Cookies: ${syncRes.cookiesCount}, JWT: ${syncRes.detectedBearerToken.slice(0, 18)}..., NetPulse Synced: ${syncRes.netpulseSynced})`);

    // 6. Test Website Change Monitor & Snapshot Hashing (/api/schedules & /api/schedules/run-now)
    const schedCreate = await fetch(`${baseUrl}/api/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: 'wf-demo-scrape',
        intervalMinutes: 60,
        notifyWebhookUrl: 'http://localhost:4080/hook/autopilot-change-alert',
        notifyOnChangeOnly: true
      })
    }).then((r) => r.json());
    assert.strictEqual(schedCreate.ok, true, 'Schedule creation should succeed');
    const createdSched = schedCreate.schedule;

    const runNow1 = await fetch(`${baseUrl}/api/schedules/run-now`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: createdSched.id })
    }).then((r) => r.json());
    assert.strictEqual(runNow1.ok, true, 'First schedule run-now should succeed');
    assert.strictEqual(runNow1.result.changeStatus, 'initial', 'First run should establish baseline snapshot');

    const runNow2 = await fetch(`${baseUrl}/api/schedules/run-now`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: createdSched.id })
    }).then((r) => r.json());
    assert.strictEqual(runNow2.ok, true, 'Second schedule run-now should succeed');
    assert.strictEqual(runNow2.result.changeStatus, 'unchanged', 'Second run on identical page should report unchanged');
    console.log(`  ✅ Giám sát thay đổi trang web (Change Monitor SHA-256: [${runNow2.result.snapshotHash}]) hoạt động chuẩn xác!`);

    // Cleanup test schedule
    await fetch(`${baseUrl}/api/schedules/${encodeURIComponent(createdSched.id)}`, { method: 'DELETE' });

    // 7. Test Multi-Page Auto-Pagination + Network X-Ray (/api/scrape with maxPages=2)
    const multiScrape = await fetch(`${baseUrl}/api/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUrl: `${baseUrl}/sandbox/shop`,
        scrollFirst: true,
        maxPages: 2,
        nextPageSelector: '.btn-next-page'
      })
    }).then((r) => r.json());
    assert.strictEqual(multiScrape.ok, true, 'Multi-page scrape should succeed');
    assert.strictEqual(multiScrape.pagesScraped, 2, 'Should scrape 2 pages sequentially');
    assert.strictEqual(multiScrape.cards.length, 12, 'Should merge 8 cards from Page 1 + 4 cards from Page 2 = 12 cards');
    assert.ok(Array.isArray(multiScrape.capturedApis) && multiScrape.capturedApis.length >= 1, 'Network X-Ray should capture background XHR/Fetch API calls');
    console.log(`  ✅ Cào nhiều trang liên tiếp (${multiScrape.pagesScraped} trang → ${multiScrape.cards.length} sản phẩm) & Bắt API ngầm Network X-Ray (${multiScrape.capturedApis.length} APIs) thành công!`);

    // 8. Test 1-Click Push Captured API to NetPulse (/api/push-api-netpulse)
    const firstApi = multiScrape.capturedApis[0];
    const pushApiRes = await fetch(`${baseUrl}/api/push-api-netpulse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: firstApi.url,
        method: firstApi.method,
        headers: firstApi.headers,
        netpulseUrl: 'http://localhost:4080'
      })
    }).then((r) => r.json());
    assert.strictEqual(pushApiRes.ok, true, 'Push API to NetPulse should return ok');
    console.log(`  ✅ Đẩy API ngầm sang NetPulse (4080) thành công (Pushed: ${pushApiRes.pushedToNetPulse})`);

    // 9. Test New Workflow Step Types (wait_selector, press_key, eval_js, export_pdf)
    const advWfRes = await fetch(`${baseUrl}/api/workflows/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Advanced Steps & PDF',
        headless: true,
        steps: [
          { type: 'goto', url: `${baseUrl}/sandbox/shop`, label: 'Open Shop' },
          { type: 'wait_selector', selector: '.product-card', timeoutMs: 4000, label: 'Wait for product card' },
          { type: 'type', selector: '#inp-fullname', value: 'Advanced Tester', label: 'Type Name' },
          { type: 'type', selector: '#inp-email', value: 'adv@test.vn', label: 'Type Email' },
          { type: 'type', selector: '#inp-phone', value: '0999888777', label: 'Type Phone' },
          { type: 'press_key', selector: '#inp-phone', key: 'Enter', label: 'Press Enter to Submit' },
          { type: 'eval_js', code: '({ totalProducts: document.querySelectorAll(".product-card").length })', label: 'Run Custom JS' },
          { type: 'export_pdf', label: 'Export PDF' }
        ]
      })
    }).then((r) => r.json());
    assert.strictEqual(advWfRes.ok, true, 'Advanced workflow should succeed');
    assert.ok(advWfRes.run.pdfs && advWfRes.run.pdfs.length === 1, 'Should generate 1 PDF file during workflow');
    console.log(`  ✅ Các bước kịch bản nâng cao (wait_selector, press_key, eval_js, export_pdf → ${advWfRes.run.pdfs[0].filename}) hoạt động chuẩn xác!`);

    // 10. Test Workflow Import & Delete (/api/workflows/import & DELETE /api/workflows/:id)
    const impRes = await fetch(`${baseUrl}/api/workflows/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflows: [
          { id: 'wf-imported-test', name: 'Imported Test Workflow', steps: [{ type: 'goto', url: `${baseUrl}/sandbox/shop` }] }
        ]
      })
    }).then((r) => r.json());
    assert.strictEqual(impRes.ok, true, 'Workflow import should succeed');
    assert.strictEqual(impRes.importedCount, 1, 'Should import 1 workflow');

    const delRes = await fetch(`${baseUrl}/api/workflows/wf-imported-test`, { method: 'DELETE' }).then((r) => r.json());
    assert.strictEqual(delRes.ok, true, 'Workflow delete should succeed');
    assert.ok(!delRes.workflows.some((w) => w.id === 'wf-imported-test'), 'Deleted workflow should be removed');
    console.log(`  ✅ Quản lý Kịch bản (Import / Export JSON & Delete) thành công!`);

    console.log('\n🎉 Tất cả 10 bài kiểm thử End-to-End của AutoPilot Web đều PASS!');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
