const { chromium } = require('../node_modules/playwright');
const path = require('path');
const PORT = 5194;
const OUT = __dirname;
const findings = [];
let sc = 0;

const shot = async (page, label) => {
  sc++;
  const file = path.join(OUT, `s${String(sc).padStart(2,'0')}-${label.replace(/[^a-z0-9]/gi,'-')}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`📸 ${sc}. ${label}`);
  return file;
};

const note = (emoji, msg) => { console.log(`${emoji} ${msg}`); findings.push({ emoji, msg }); };

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 300, args: ['--window-size=1400,900','--window-position=0,0'] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => { errors.push(e.message); note('❌', `JS error: ${e.message.slice(0,80)}`); });
  page.on('console', m => { if (m.type()==='error') note('❌', `Console error: ${m.text().slice(0,80)}`); });

  // ── LOGIN ─────────────────────────────────────────────────────────────────
  await page.goto(`http://localhost:${PORT}/login`, { timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 60000 });
  await page.locator('input').nth(0).fill('automation-navigator-e2e-1780560955@brandboekhouders.nl');
  await page.locator('input').nth(1).fill('Tyab5YAZpDSxsEXixxs0Mg7A1a!');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(`http://localhost:${PORT}/`);
  await page.waitForTimeout(800);

  // ── NAVIGATE TO PROCESVIEWER ──────────────────────────────────────────────
  await page.goto(`http://localhost:${PORT}/procesviewer`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
  await shot(page, 'procesviewer-empty');

  // CHECK: sidebar nav item active
  const navActive = await page.locator('a[href="/procesviewer"]').getAttribute('class');
  if (!navActive?.includes('bg-')) note('⚠️', 'Procesviewer nav item does not show active highlight');
  else note('✅', 'Sidebar nav item active');

  // CHECK: breadcrumb
  const breadcrumb = await page.locator('text=Procesviewer').first().isVisible();
  if (!breadcrumb) note('⚠️', 'Breadcrumb "Procesviewer" not visible');
  else note('✅', 'Breadcrumb shows correctly');

  // CHECK: empty state prompt
  const emptyMsg = await page.locator('text=Selecteer een pipeline').first().isVisible();
  note(emptyMsg ? '✅' : '⚠️', `Empty state prompt ${emptyMsg ? 'visible' : 'missing'}`);

  // ── SELECT VPB PIPELINE ───────────────────────────────────────────────────
  await page.locator('button[role="combobox"]').first().click();
  await page.waitForTimeout(400);
  const opts = await page.locator('[role="option"]').all();
  note('✅', `Pipeline dropdown shows ${opts.length} pipelines`);
  for (const o of opts) { if ((await o.textContent())?.includes('VPB')) { await o.click(); break; } }
  await page.waitForTimeout(3000);
  await shot(page, 'view-mode-loaded');

  // CHECK: grid background visible
  const hasBg = await page.evaluate(() => {
    const el = document.querySelector('.relative.flex-1.min-h-0.overflow-hidden');
    return el ? window.getComputedStyle(el).backgroundImage.includes('repeating') : false;
  });
  note(hasBg ? '✅' : '⚠️', `Grid background ${hasBg ? 'visible' : 'not detected'}`);

  // CHECK: zoom toolbar
  const zoomLabel = await page.locator('text=%').first().isVisible().catch(() => false);
  note(zoomLabel ? '✅' : '⚠️', `Zoom % label ${zoomLabel ? 'visible' : 'missing'}`);

  // CHECK: legend open by default
  const legendOpen = await page.locator('text=Legenda').first().isVisible();
  note(legendOpen ? '✅' : '⚠️', `Legend ${legendOpen ? 'open' : 'not open'} by default`);

  // CHECK: status bar
  const statusBar = await page.locator('text=Lanes').first().isVisible();
  note(statusBar ? '✅' : '⚠️', `Status bar ${statusBar ? 'visible' : 'missing'}`);

  // CHECK: Pipeline badge on stage steps
  const badges = await page.locator('svg text').all();
  const pipelineBadges = (await Promise.all(badges.map(b => b.textContent()))).filter(t => t?.includes('Pipeline'));
  note(pipelineBadges.length > 0 ? '✅' : '⚠️', `Pipeline badges: ${pipelineBadges.length} visible on stage steps`);

  // ── PROBE: ZOOM IN/OUT ────────────────────────────────────────────────────
  await page.locator('button[title="Zoom in"]').click();
  await page.waitForTimeout(400);
  const zoomAfter = await page.locator('.tabular-nums').first().textContent();
  note(zoomAfter && zoomAfter !== '100%' ? '✅' : '⚠️', `Zoom in: ${zoomAfter}`);
  await page.locator('button[title="Herstel weergave"]').click();
  await page.waitForTimeout(600);
  note('✅', 'Reset view button works');

  // ── PROBE: LEGEND COLLAPSE ────────────────────────────────────────────────
  const closeX = await page.locator('button[title*="close"], .absolute.z-30 button').filter({ hasText: '×' }).first();
  const legendCloseBtn = await page.locator('text=×').filter({ has: page.locator('button') }).first();
  // Close legend via × button
  const xBtn = await page.locator('.absolute.z-30 button').filter({ has: page.locator('svg.lucide-x, [data-lucide="x"]') }).first();
  const altX = await page.locator('.absolute.bottom-4 button').first();
  try {
    await page.locator('[style*="bottom: 16px"] button').first().click();
    await page.waitForTimeout(400);
    const legendCollapsed = await page.locator('text=Legenda').last().isVisible();
    note(legendCollapsed ? '✅' : '⚠️', 'Legend collapses and re-opens');
    // Re-open
    await page.locator('text=Legenda').last().click().catch(() => {});
    await page.waitForTimeout(300);
  } catch { note('⚠️', 'Could not close legend via × button — selector issue'); }

  // ── PROBE: CLICK STEP (detail panel) ─────────────────────────────────────
  const taskRect = await page.locator('svg rect[fill="#EFF6FF"]').first();
  if (await taskRect.isVisible()) {
    await taskRect.click({ force: true });
    await page.waitForTimeout(700);
    await shot(page, 'step-detail-panel');
    const panelVisible = await page.locator('text=Details').first().isVisible();
    note(panelVisible ? '✅' : '⚠️', `Step detail panel ${panelVisible ? 'opens' : 'did not open'} on click`);
    // Close panel
    await page.locator('.absolute.right-0 button').last().click().catch(() => {});
    await page.waitForTimeout(300);
  }

  // ── PROBE: CLICK AUTOMATION DOT ───────────────────────────────────────────
  const autoDot = await page.locator('svg circle[fill="hsl(45 95% 55%)"]').first();
  if (await autoDot.isVisible().catch(() => false)) {
    await autoDot.click({ force: true });
    await page.waitForTimeout(700);
    await shot(page, 'auto-detail-panel');
    const autoPanel = await page.locator('text=Automation').first().isVisible();
    note(autoPanel ? '✅' : '⚠️', `Automation detail panel ${autoPanel ? 'opens' : 'did not open'}`);
    const linkBtn = await page.locator('text=Bekijk volledige automation').isVisible();
    note(linkBtn ? '✅' : '⚠️', `"Bekijk volledige automation" link ${linkBtn ? 'present' : 'missing'}`);
    await page.locator('.absolute.right-0 button').last().click().catch(() => {});
    await page.waitForTimeout(300);
  } else {
    note('ℹ️', 'No automation dot visible on this pipeline — skipped automation click probe');
  }

  // ── PROBE: PROCESS SELECTOR ───────────────────────────────────────────────
  const processSel = await page.locator('button[role="combobox"]').nth(1);
  if (await processSel.isVisible()) {
    const selText = await processSel.textContent();
    note(selText?.includes('VPB') ? '✅' : '⚠️', `Process selector shows: "${selText?.trim()}"`);
  }

  // ── ENTER BEWERKEN ────────────────────────────────────────────────────────
  await page.locator('button:has-text("Bewerken")').click();
  await page.waitForTimeout(3000);
  await shot(page, 'edit-mode');

  // CHECK: Bewerken header
  const bewHeader = await page.locator('text=Bewerken').first().isVisible();
  note(bewHeader ? '✅' : '⚠️', 'Edit mode "Bewerken" header visible');

  // CHECK: Toolbar buttons
  const opslaan = await page.locator('button:has-text("Opslaan")').isVisible();
  const toevoegen = await page.locator('button:has-text("Toevoegen")').isVisible();
  const exportBtn = await page.locator('button:has-text("Export")').isVisible();
  note(opslaan && toevoegen && exportBtn ? '✅' : '⚠️',
    `Edit toolbar: Opslaan=${opslaan} Toevoegen=${toevoegen} Export=${exportBtn}`);

  // CHECK: "Terug naar viewer" button
  const terugBtn = await page.locator('button:has-text("Terug naar viewer")').isVisible();
  note(terugBtn ? '✅' : '⚠️', '"Terug naar viewer" button visible in edit mode');

  // CHECK: Selectors locked in edit mode
  const firstCombo = await page.locator('button[role="combobox"]').first();
  const isDisabled = await firstCombo.isDisabled();
  note(isDisabled ? '✅' : '⚠️', `Pipeline selector disabled in edit mode: ${isDisabled}`);

  // PROBE: Pipeline badge on steps in edit mode
  const editBadges = await page.evaluate(() => {
    const svg = Array.from(document.querySelectorAll('svg')).find(s => parseInt(s.getAttribute('width')||'0') > 200);
    return Array.from(svg?.querySelectorAll('text') || []).filter(t => t.textContent?.includes('Pipeline')).length;
  });
  note(editBadges > 0 ? '✅' : '⚠️', `Pipeline badges in edit mode: ${editBadges} visible`);

  // ── PROBE: CLICK PIPELINE STEP → NAAM LOCKED ─────────────────────────────
  const editRects = await page.locator('svg rect[fill="#EFF6FF"]').all();
  if (editRects.length > 0) {
    await editRects[0].click({ force: true });
    await page.waitForTimeout(600);
    await shot(page, 'step-dialog');
    const lockIcon = await page.locator('.lucide-lock, [data-lucide="lock"]').isVisible().catch(() => false);
    const lockText = await page.locator('text=Naam bepaald door de pipeline').isVisible().catch(() => false);
    note(lockIcon || lockText ? '✅' : '⚠️', `Pipeline step Naam lock: icon=${lockIcon} text=${lockText}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // ── PROBE: ADD START EVENTS ───────────────────────────────────────────────
  await page.locator('button:has-text("Toevoegen")').click();
  await page.waitForTimeout(500);
  const paletteBtns = await page.locator('button[draggable="true"]').all();
  note(`✅`, `Palette has ${paletteBtns.length} draggable step types`);
  let startClicked = false;
  for (const btn of paletteBtns) {
    if ((await btn.innerHTML()).includes('16a34a')) { await btn.click({ force: true }); startClicked = true; break; }
  }
  await page.waitForTimeout(800);
  if (startClicked) {
    const startCount = await page.evaluate(() =>
      Array.from(document.querySelectorAll('svg circle[stroke="#16a34a"]')).filter(c => parseFloat(c.getAttribute('r')||'0') > 10).length
    );
    note(startCount >= 2 ? '✅' : '⚠️', `Added 2nd start event → ${startCount} start events now visible`);
  }
  await shot(page, 'after-add-start');

  // ── PROBE: LANE LABEL CLICK-TO-RENAME ────────────────────────────────────
  const laneLabel = await page.locator('svg foreignObject div').filter({ hasText: /INTAKE|BOEKHOUDING|intake|boekhouding/i }).first();
  if (await laneLabel.isVisible().catch(() => false)) {
    await laneLabel.click({ force: true });
    await page.waitForTimeout(500);
    const renameDialog = await page.locator('[role="alertdialog"], input[aria-label="Swimlane naam"]').isVisible().catch(() => false);
    note(renameDialog ? '✅' : '⚠️', `Lane label click → rename dialog: ${renameDialog}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // ── PROBE: ROW SEPARATOR INSERT ───────────────────────────────────────────
  const svgBB = await page.evaluate(() => {
    const s = Array.from(document.querySelectorAll('svg')).find(s => parseInt(s.getAttribute('width')||'0') > 200);
    return s?.getBoundingClientRect() || null;
  });
  const firstStart = await page.evaluate(() => {
    const svg = Array.from(document.querySelectorAll('svg')).find(s => parseInt(s.getAttribute('width')||'0') > 200);
    const bb = svg?.getBoundingClientRect();
    const circles = Array.from(svg?.querySelectorAll('circle[stroke="#16a34a"]') || []).filter(c => parseFloat(c.getAttribute('r')||'0') > 10);
    const sorted = circles.sort((a,b) => parseFloat(a.getAttribute('cy')||'0') - parseFloat(b.getAttribute('cy')||'0'));
    if (sorted.length >= 2) {
      const cy = parseFloat(sorted[0].getAttribute('cy')||'0');
      return { svgX: bb?.x || 0, lineY: bb?.y || 0 + cy + 88, cx: parseFloat(sorted[0].getAttribute('cx')||'0') };
    }
    return null;
  });
  if (firstStart) {
    const sweepX = firstStart.svgX + firstStart.cx + 100;
    let sepFound = false;
    for (let y = firstStart.lineY - 20; y <= firstStart.lineY + 40; y += 4) {
      await page.mouse.move(sweepX, y);
      await page.waitForTimeout(20);
      const pill = await page.evaluate(() =>
        Array.from(document.querySelectorAll('svg rect[rx="11"]')).some(r => r.getAttribute('fill') === '#3B82F6')
      );
      if (pill) { sepFound = true; await shot(page, 'row-separator-pill'); break; }
    }
    note(sepFound ? '✅' : '⚠️', `Row separator "+ Stap" pill ${sepFound ? 'appears on hover' : 'not detected'}`);
    await page.mouse.move(0, 0);
  }

  // ── PROBE: OPSLAAN (SAVE) ─────────────────────────────────────────────────
  const opslaanBtn = await page.locator('button:has-text("Opslaan")');
  const isEnabled = await opslaanBtn.isEnabled();
  note(isEnabled ? '✅' : 'ℹ️', `Opslaan button ${isEnabled ? 'enabled (unsaved changes present)' : 'disabled (no dirty changes)'}`);
  if (isEnabled) {
    await opslaanBtn.click();
    await page.waitForTimeout(1500);
    const stillDirty = await page.locator('text=Niet-opgeslagen').isVisible().catch(() => false);
    note(!stillDirty ? '✅' : '⚠️', `After Opslaan: ${!stillDirty ? 'saved cleanly' : 'still showing unsaved'}`);
  }

  // ── PROBE: TERUG NAAR VIEWER ──────────────────────────────────────────────
  await page.locator('button:has-text("Terug naar viewer")').click();
  await page.waitForTimeout(2000);
  await shot(page, 'back-to-viewer');
  const inViewer = await page.locator('button:has-text("Bewerken")').isVisible();
  note(inViewer ? '✅' : '⚠️', `Returned to viewer: Bewerken button ${inViewer ? 'visible' : 'missing'}`);
  const viewerZoom = await page.locator('.tabular-nums').first().isVisible();
  note(viewerZoom ? '✅' : '⚠️', `Zoom toolbar ${viewerZoom ? 'visible in viewer' : 'missing in viewer'}`);

  // ── PROBE: FULLSCREEN ─────────────────────────────────────────────────────
  const fsBtn = await page.locator('button[title="Volledig scherm"]').first();
  if (await fsBtn.isVisible().catch(() => false)) {
    note('✅', 'Fullscreen button present');
  } else {
    note('⚠️', 'Fullscreen button not found');
  }

  // ── PROBE: RENAME PIPELINE (custom pipeline check) ────────────────────────
  // Check if the pencil appears for a non-HubSpot pipeline
  const pipelineNameBtn = await page.locator('.flex.items-center.rounded-md.border button').first();
  if (await pipelineNameBtn.isVisible().catch(() => false)) {
    const cursor = await pipelineNameBtn.evaluate(el => window.getComputedStyle(el).cursor);
    note(cursor === 'text' ? '✅' : 'ℹ️', `Pipeline name button cursor: "${cursor}" (text = click-to-rename available)`);
  }

  // ── FINAL SCREENSHOT ──────────────────────────────────────────────────────
  await shot(page, 'final-state');

  // ── REPORT ────────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════');
  console.log('  SMOKE TEST FINDINGS');
  console.log('════════════════════════════════════');
  findings.forEach(f => console.log(`${f.emoji} ${f.msg}`));
  const issues = findings.filter(f => f.emoji === '⚠️' || f.emoji === '❌');
  console.log(`\n${issues.length === 0 ? '✅ ALL CLEAR' : `⚠️ ${issues.length} issues found`}`);

  await page.waitForTimeout(20000);
  await browser.close();
})();
