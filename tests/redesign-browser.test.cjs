// Optional real-browser acceptance checks for the redesign. Uses only disposable contexts.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const fixture = require('./helpers/redesign-fixture.cjs');
const widths = [320,375,599,600,768,959,960,1024,1359,1360,1366,1920,2560];
async function main() {
  const pw = require(process.env.DAY_BY_DAY_PLAYWRIGHT_PATH || 'playwright');
  const type = process.env.DAY_BY_DAY_BROWSER_TYPE === 'firefox' ? pw.firefox : pw.chromium;
  const channel = process.env.DAY_BY_DAY_BROWSER_CHANNEL;
  const browser = await type.launch({headless:true, ...(channel && type === pw.chromium ? {channel} : {})});
  const context = await browser.newContext({timezoneId:'America/Chicago', locale:'en-US', reducedMotion:'reduce'});
  const data = fixture(), raw = JSON.stringify(data), errors = [];
  const output = process.env.DAY_BY_DAY_BROWSER_OUTPUT;
  if(output) fs.mkdirSync(output,{recursive:true});
  const url = pathToFileURL(path.resolve('Day-by-Day.html')).href;
  const page = await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-11-10T14:00:00Z')});
  await page.addInitScript(({raw})=>{
    localStorage.clear();localStorage.setItem('day-by-day.v1',raw);localStorage.setItem('day-by-day.theme','light');
  },{raw});
  const layout = () => page.evaluate(()=>{
    const visible = node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden';
    const rect = node => { const r=node.getBoundingClientRect();return {width:r.width,height:r.height}; };
    return {
      width:innerWidth, scroll:document.documentElement.scrollWidth,
      duplicateIDs:[...document.querySelectorAll('[id]')].map(n=>n.id).filter((id,i,a)=>a.indexOf(id)!==i),
      targets:[...document.querySelectorAll('.check-button,.edit-task,.task-menu-toggle')].filter(visible).map(rect),
      days:[...document.querySelectorAll('#weekStrip button')].map(rect),
      comingUp:document.getElementById('comingUp').open,
      state:localStorage.getItem('day-by-day.v1')
    };
  });
  try {
    console.log('Redesign browser:',browser.version(),channel || 'firefox');
    for(const width of widths) for(const theme of ['light','dark']) {
      await page.setViewportSize({width,height:900});
      await page.goto(url);
      await page.waitForFunction(()=>window.DayByDay && ['idle','unsupported'].includes(document.getElementById('taskFilePanel').dataset.state));
      if(theme==='dark') await page.locator('#themeToggle').click();
      let result = await layout();
      assert.ok(result.scroll<=width,`${width}/${theme}: page overflow`);
      assert.deepEqual(result.duplicateIDs,[]);
      assert.ok(result.targets.every(r=>r.width>=44&&r.height>=44),`${width}/${theme}: task action below 44px`);
      assert.equal(result.days.length,7);assert.ok(result.days.every(r=>r.width>=24&&r.height>=60));
      assert.equal(result.comingUp,width>=1360);
      assert.equal(result.state,raw);
      assert.equal(await page.locator('#overdueList .task-row').count(),3);
      assert.equal(await page.locator('#taskList [data-id="timed-overdue"]').count(),0);
      assert.equal(await page.locator('#taskTotal').innerText(),'30');
      assert.equal(await page.locator('#todayCount').innerText(),'6');
      assert.equal(await page.locator('#todayNav').getAttribute('aria-current'),'page');
      await page.locator('.completed-tasks > summary').click();
      if(width<1360) await page.locator('#comingUpSummary').click();
      assert.equal(await page.locator('#comingUpList > li').count(),7);
      assert.equal(await page.locator('#comingUpList > li').first().locator('.coming-up-tasks span').count(),7);
      await page.locator('[data-id="long"] .description-toggle').click();
      assert.equal((await page.locator('[data-id="long"] .description-body').innerText()).length,5000);
      assert.ok((await layout()).scroll<=width,`${width}/${theme}: expanded note overflow`);
      if(output && [320,768,1366,2560].includes(width)) await page.screenshot({path:path.join(output,`redesign-${width}-${theme}.png`),fullPage:true});
      await page.locator('#routinesNav').click();
      assert.equal(await page.locator('#routineList .check-button').count(),0);
      assert.match(await page.locator('#routineOrderScope').innerText(),/daily orders unchanged/);
      assert.ok((await layout()).scroll<=width,`${width}/${theme}: routine overflow`);
      await page.locator('#addTask').click();
      assert.ok(await page.locator('#taskOptions').isHidden());
      assert.ok(await page.locator('#weeklyDays').isVisible());
      assert.equal(await page.locator('input[name="kind"]:checked').inputValue(),'weekly');
      assert.ok(await page.locator('#taskDialog').evaluate(n=>n.scrollWidth<=n.clientWidth));
      await page.locator('#cancelDialog').click();
      assert.equal(await page.locator('#taskDialog').evaluate(n=>n.open),false);
      assert.equal((await layout()).state,raw,`${width}/${theme}: presentation changed task data`);
      console.log(`PASS ${width}px ${theme}: reflow, targets, dates, sections/counts, long content, routine entry, unchanged data`);
    }
    // A disclosure stays usable across breakpoint changes and never hides its focused date.
    await page.setViewportSize({width:1440,height:900});await page.goto(url);await page.waitForFunction(()=>window.DayByDay);
    await page.locator('#comingUpList button').first().focus();
    await page.setViewportSize({width:375,height:900});
    await page.waitForFunction(()=>document.getElementById('comingUp').open);
    assert.ok(await page.locator('#comingUpList button').first().evaluate(n=>n===document.activeElement));
    await page.locator('#comingUpSummary').click();
    await page.locator('#nextWeek').click();
    assert.equal(await page.locator('#comingUp').evaluate(n=>n.open),false);
    await page.setViewportSize({width:1440,height:900});await page.setViewportSize({width:375,height:900});
    await page.waitForFunction(()=>!document.getElementById('comingUp').open);
    console.log('PASS Coming up: focused dates survive resize; collapse survives navigation and wide/narrow transitions');

    // Native and custom validation are associated with visible fields, with no saved mutation.
    await page.goto(url);await page.waitForFunction(()=>window.DayByDay);
    await page.locator('#addTask').click();await page.locator('#saveTask').click();
    assert.equal(await page.locator('#taskTitle').getAttribute('aria-invalid'),'true');
    assert.ok(await page.locator('#taskTitleError').isVisible());
    await page.locator('#taskTitle').fill('Weekly validation');
    assert.equal(await page.locator('#taskTitle').getAttribute('aria-invalid'),'false');
    await page.locator('input[name="kind"][value="weekly"] + span').click();
    for(const n of await page.locator('input[name="weekdays"]:checked').all()) await n.uncheck();
    await page.locator('#saveTask').click();
    assert.ok(await page.locator('#taskOptions').isHidden());
    assert.ok(await page.locator('#weeklyDaysError').isVisible());
    assert.ok(await page.locator('input[name="weekdays"]').first().evaluate(n=>n===document.activeElement));
    await page.locator('#workdaysPreset').click();
    assert.equal(await page.locator('#weeklyDays').getAttribute('aria-invalid'),'false');
    await page.locator('#toggleTaskOptions').click();
    await page.locator('input[name="timing"][value="timed"] + span').click();
    await page.locator('#toggleTaskOptions').click();
    assert.ok(await page.locator('#taskTimeError').isVisible());
    assert.ok(await page.locator('#taskOptions').isVisible());
    await page.locator('input[name="timing"][value="allday"] + span').click();
    assert.equal(await page.locator('#taskTime').getAttribute('aria-invalid'),'false');
    assert.ok(await page.locator('#taskTime').isDisabled());
    await page.setViewportSize({width:320,height:360});
    await page.locator('#cancelDialog').scrollIntoViewIfNeeded();
    const hit = await page.locator('#cancelDialog').evaluate(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});
    assert.ok(hit,'short dialog footer is covered');await page.locator('#cancelDialog').click();
    assert.equal(await page.evaluate(()=>localStorage.getItem('day-by-day.v1')),raw);
    console.log('PASS editor: visible recurrence, adjacent errors, first invalid focus, all-day reset, short-height footer, unchanged draft cancellation');

    // Read-only ended history still resolves the historical occurrence.
    await page.setViewportSize({width:1024,height:900});await page.goto(url);await page.waitForFunction(()=>window.DayByDay);
    await page.locator('#routinesNav').click();await page.locator('#endedRoutines > summary').click();
    await page.locator('#endedRoutineList button').click();
    await page.locator('#taskList [data-id="ended"] .edit-task').click();
    assert.equal(await page.locator('#dialogTitle').innerText(),'Routine history');
    assert.ok(await page.locator('#taskTitle').isDisabled());assert.ok(await page.locator('#saveTask').isHidden());assert.ok(await page.locator('#deleteTask').isHidden());
    await page.locator('#cancelDialog').click();
    assert.equal(await page.evaluate(()=>localStorage.getItem('day-by-day.v1')),raw);
    console.log('PASS ended history: historical date, disabled fields, no save/delete, unchanged stored history');

    // Forced colors retain explicit selection and usable inputs. 320px is also effective reflow at zoom.
    await page.emulateMedia({forcedColors:'active'});await page.setViewportSize({width:320,height:700});await page.goto(url);await page.waitForFunction(()=>window.DayByDay);
    assert.ok((await layout()).scroll<=320);await page.locator('#addTask').click();assert.ok(await page.locator('#taskTitle').isVisible());await page.locator('#cancelDialog').click();
    await page.emulateMedia({forcedColors:'none'});
    assert.deepEqual(errors,[]);
    console.log('PASS forced colors and 320px reflow; no browser runtime errors');
  } finally { await context.close();await browser.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
