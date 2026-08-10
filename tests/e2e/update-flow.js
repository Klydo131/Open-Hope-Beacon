const { chromium, launchOptions } = require('./_playwright');
const PORT = process.argv[2] || '4001';
const PHASE = process.argv[3] || 'install';
const BASE = `http://localhost:${PORT}`;
// Screenshots and browser profiles go somewhere writable that is not the
// repo. Overridable so CI can collect them as artifacts.
const OUT = process.env.E2E_OUT ||
  require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'beacon-e2e-'));
let bad=0; const ok=(c,m)=>{if(!c)bad++;console.log(`${c?'OK ':'BAD'} ${m}`);};

(async()=>{
  const ctx=await chromium.launchPersistentContext(`${OUT}/profile-update`,{
    ...launchOptions, viewport:{width:412,height:820}});
  const page=ctx.pages()[0]||await ctx.newPage();

  await page.goto(`${BASE}/login`,{waitUntil:'networkidle'});
  await page.waitForTimeout(1200);
  const maria=page.getByText(/Maria Santos/i).first();
  if(await maria.count()) await maria.click();
  await page.waitForTimeout(1500);
  const c=page.getByRole('button',{name:/I understand|Continue|Got it/i});
  if(await c.count()){await c.first().click().catch(()=>{});await page.waitForTimeout(700);}

  const sw = await page.evaluate(async()=>{
    if(!('serviceWorker' in navigator)) return 'unsupported';
    const r = await navigator.serviceWorker.ready;
    return r.active ? 'active' : 'none';
  });
  console.log(`service worker: ${sw}`);

  if (PHASE === 'install') {
    await page.waitForTimeout(4000);
    // Prove the version panel exists and shows a real build.
    await page.goto(`${BASE}/settings`,{waitUntil:'networkidle'});
    await page.waitForTimeout(1600);
    const card = await page.getByText(/App version/i).count();
    ok(card>0, 'Settings has an "App version" panel');
    const label = await page.evaluate(()=>{
      const el=[...document.querySelectorAll('h2')].find(e=>/App version/i.test(e.textContent||''));
      return el?.parentElement?.innerText || '';
    });
    console.log('--- version panel ---\n' + label);
    ok(/latest version|new version|Updates run/i.test(label||''), 'panel states whether you are up to date');
    ok(/\w{3} \d{1,2}, \d{4}|\d{1,2} \w{3} \d{4}/.test(label||''), 'panel shows a build date');
    const force = await page.getByRole('button',{name:/Force a fresh copy/i}).count();
    ok(force>0, 'has a "Force a fresh copy" escape hatch');
    // Either action is correct: 'Check' when current, 'Restart' when an update
    // is already waiting. Requiring only one made this fail on a profile that
    // happened to have a pending worker.
    const check = await page.getByRole('button',{name:/Check for updates/i}).count();
    const restart = await page.getByRole('button',{name:/Restart to update/i}).count();
    ok(check+restart>0, `offers an update action (check=${check} restart=${restart})`);
    const s = await page.evaluate(()=>document.querySelector('h2')?.scrollIntoView());
    await page.getByText(/App version/i).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await page.screenshot({path:`${OUT}/upd-version-panel.png`});
    console.log('\n>>> installed. Now rebuild + restart the server, then run PHASE=update');
  } else {
    // A new build is live. The app should notice and offer a restart.
    await page.goto(`${BASE}/dm`,{waitUntil:'networkidle'});
    await page.waitForTimeout(2000);
    // reg.update() runs on focus; nudge it the same way a real user would.
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    let seen=false;
    for(let i=0;i<20;i++){
      await page.waitForTimeout(1500);
      const n = await page.getByText(/Update ready/i).count();
      if(n>0){seen=true;break;}
      await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    }
    ok(seen,'the update banner appears when a new build is deployed');
    if(seen){
      await page.screenshot({path:`${OUT}/upd-banner.png`});
      const restart = page.getByRole('button',{name:/Restart/i}).first();
      ok(await restart.count()>0,'banner offers a one-tap Restart');
      const clipped = await page.evaluate(()=>{
        const el=[...document.querySelectorAll('p')].find(e=>/Update ready/i.test(e.textContent||''));
        return el ? el.scrollWidth > el.clientWidth + 1 : true;
      });
      ok(!clipped,'the update label is not truncated');
      await restart.click();
      await page.waitForTimeout(4000);
      const still = await page.getByText(/Update ready/i).count();
      ok(still===0,'banner clears after restarting');
      await page.screenshot({path:`${OUT}/upd-after.png`});
    }
  }
  console.log(bad===0?'\nRESULT: ALL OK':`\nRESULT: ${bad} FAILURE(S)`);
  await ctx.close(); process.exit(bad===0?0:1);
})();
