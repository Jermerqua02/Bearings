/* Replay of the audit walkthrough that found the original findings.
   Each check is written as the failure signature, so a pass means the
   specific thing that was broken is not broken. */
import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:3000';
let pass = 0, fail = 0;
const ok = (label, cond, detail) => {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${label}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`); }
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 150)));
page.on('response', (r) => { if (r.status() >= 500) errs.push(`${r.status()} ${r.url()}`); });

console.log('\nAudit replay\n');

/* 1. onboarding no longer dumps SQL on a non-numeric GPA */
await page.goto(`${BASE}/sign-up`, { waitUntil: 'networkidle' });
await page.click('button:has-text("Student")');
await page.locator('input').nth(0).fill('Replay');
const email = `replay${Date.now()}@example.com`;
await page.fill('input[type=email]', email);
await page.fill('input[type=password]', 'correct-horse-battery');
await page.check('input[type=checkbox]');
await page.click('button[type=submit]');
await page.waitForURL('**/onboarding**', { timeout: 30000 });
await page.waitForTimeout(2000);
await page.locator('input:visible').first().click();
await page.keyboard.type('Alex');
await page.click('button:has-text("CONTINUE")');
await page.waitForTimeout(1200);
await page.click('button:has-text("11th grade")');
await page.click('button:has-text("CONTINUE")');
await page.waitForTimeout(1200);
await page.locator('input:visible').first().click();
await page.keyboard.type('about a 3.7', { delay: 15 });
await page.waitForTimeout(700);
let t = await page.evaluate(() => document.body.innerText);
ok('non-numeric GPA blocks Continue', await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b=>/continue/i.test(b.innerText))?.disabled));
ok('and never renders SQL', !/Failed query|insert into "student_profile"/.test(t));
ok('and explains what it wants', /Just the number/.test(t));

/* 2. weak password reaches the styled error area */
await page.goto(`${BASE}/sign-up`, { waitUntil: 'networkidle' });
await page.click('button:has-text("Student")');
await page.locator('input').nth(0).fill('Weak');
await page.fill('input[type=email]', `w${Date.now()}@example.com`);
await page.fill('input[type=password]', 'abc');
await page.check('input[type=checkbox]');
await page.click('button[type=submit]');
await page.waitForTimeout(1200);
ok('short password shows an in-app error', (await page.evaluate(() => Array.from(document.querySelectorAll('[role=alert]')).map(e=>e.innerText).join(' '))).includes('at least 10'));

/* sign in for the rest — a fresh context, because the signup above left a
   session and /sign-in would redirect straight past the form */
await ctx.close();
const sctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page2 = await sctx.newPage();
page2.on('pageerror', (e) => errs.push(String(e).slice(0, 150)));
page2.on('response', (r) => { if (r.status() >= 500) errs.push(`${r.status()} ${r.url()}`); });
await page2.goto(`${BASE}/sign-in`);
await page2.fill('input[type=email]', 'maya@example.com');
await page2.fill('input[type=password]', 'correct-horse-battery');
await page2.click('button[type=submit]');
await page2.waitForURL('**/dashboard', { timeout: 30000 });

/* 3. 404s */
ok('unknown school 404s', (await page2.goto(`${BASE}/explore/not-a-real-school`))?.status() === 404);
ok('unknown route 404s with our page', (await page2.goto(`${BASE}/definitely-not-a-page`))?.status() === 404
   && /That page isn't here/.test(await page2.evaluate(() => document.body.innerText)));

/* 4. explore breadth + empty state */
await page2.goto(`${BASE}/explore`, { waitUntil: 'networkidle' });
await page2.waitForTimeout(900);
const total = Number((await page2.evaluate(() => document.body.innerText)).match(/^([\d,]+) schools?/m)?.[1]?.replace(/,/g,''));
ok('explore searches far more than forty schools', total > 200, `found ${total}`);
await page2.goto(`${BASE}/explore?region=northeast&size=small&type=hbcu&cost=15000`, { waitUntil: 'networkidle' });
await page2.waitForTimeout(900);
t = await page2.evaluate(() => document.body.innerText);
ok('a genuinely empty filter explains itself', /No schools match all of those/.test(t));
ok('and offers a way back', /Clear all filters/.test(t));
await page2.goto(`${BASE}/explore?region=northeast&size=small`, { waitUntil: 'networkidle' });
await page2.waitForTimeout(900);
const narrow = Number((await page2.evaluate(() => document.body.innerText)).match(/^([\d,]+) schools?/m)?.[1]?.replace(/,/g,''));
ok('a narrow-but-real filter now returns schools', narrow > 0, `northeast+small = ${narrow}`);

/* 5. no fabricated zeroes anywhere */
for (const r of ['/explore', '/list', '/dashboard', '/decide']) {
  await page2.goto(`${BASE}${r}`, { waitUntil: 'networkidle' });
  await page2.waitForTimeout(700);
  const txt = await page2.evaluate(() => document.body.innerText);
  ok(`${r} shows no invented zeroes`, !/\$0k net|\b0% admit\b|NaN|undefined/.test(txt));
}

/* 6. a11y */
await page2.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
ok('skip link is the first focusable element', await page2.evaluate(() => {
  const l = document.querySelector('a[href="#main"]');
  const f = Array.from(document.querySelectorAll('a[href],button,input,select,textarea')).filter(e => e.tabIndex >= 0 && !e.closest('nextjs-portal'));
  return !!l && f[0] === l;
}));
await page2.goto(`${BASE}/counselor`, { waitUntil: 'networkidle' });
await page2.waitForTimeout(1000);
ok('counselor has an h1', await page2.evaluate(() => document.querySelectorAll('h1').length === 1));
await page2.goto(`${BASE}/explore`, { waitUntil: 'networkidle' });
await page2.waitForTimeout(1200);
ok('no focusable link lacks an accessible name', await page2.evaluate(() =>
  Array.from(document.querySelectorAll('a[href^="/explore/"]'))
    .filter(a => a.getAttribute('aria-hidden') !== 'true' && !(a.innerText.trim() || a.getAttribute('aria-label'))).length === 0));
await sctx.close();

/* 7. mobile tap targets */
const mctx = await browser.newContext({ ...devices['iPhone 13'] });
const mp = await mctx.newPage();
await mp.goto(`${BASE}/sign-in`);
await mp.fill('input[type=email]', 'maya@example.com');
await mp.fill('input[type=password]', 'correct-horse-battery');
await mp.click('button[type=submit]');
await mp.waitForURL('**/dashboard');
await mp.goto(`${BASE}/planner`, { waitUntil: 'networkidle' });
await mp.waitForTimeout(1000);
const small = await mp.evaluate(() => Array.from(document.querySelectorAll('button,select'))
  .map(e => ({ e, r: e.getBoundingClientRect() }))
  .filter(({ e, r }) => r.width > 0 && r.height > 0 && e.getAttribute('aria-hidden') !== 'true' && (r.height < 32 || r.width < 32))
  .map(({ e, r }) => `${(e.innerText||e.getAttribute('aria-label')||'').trim().slice(0,16)} ${Math.round(r.width)}x${Math.round(r.height)}`));
ok('planner has no sub-32px controls on mobile', small.length === 0, small.join('; '));
ok('the remove button is visible without hover', await mp.evaluate(() => {
  const b = Array.from(document.querySelectorAll('button')).find(x => /^Remove /.test(x.getAttribute('aria-label')||''));
  return !!b && getComputedStyle(b).opacity !== '0';
}));
await mctx.close();

/* 8. an operator's own account works
   Three separate bugs shipped because every check ran as role "student":
   canRead, assertCanWrite and requireStudent each gated on the role rather
   than on ownership, so an admin could save a profile and not read it back,
   and could not add a school to their own list or send a counselor message.
   None of it was visible from a student's seat. This walks an admin. */
{
  const { execSync } = await import('node:child_process');
  const sql = (q) =>
    execSync('docker exec bearings-postgres psql -U bearings -d bearings -tAc ' + JSON.stringify(q), {
      encoding: 'utf8',
    }).trim();

  const before = sql("select role from \"user\" where email='maya@example.com'");
  sql("update \"user\" set role='admin' where email='maya@example.com'");
  try {
    const actx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const ap = await actx.newPage();
    await ap.goto(`${BASE}/sign-in`);
    await ap.fill('input[type=email]', 'maya@example.com');
    await ap.fill('input[type=password]', 'correct-horse-battery');
    await ap.click('button[type=submit]');
    await ap.waitForURL('**/dashboard', { timeout: 30000 });

    await ap.goto(`${BASE}/explore`, { waitUntil: 'networkidle' });
    await ap.waitForTimeout(1200);
    const exploreText = await ap.evaluate(() => document.body.innerText);
    ok('admin reads their own profile (explore is not an onboarding prompt)',
       !/Set up your profile/.test(exploreText) && /schools/.test(exploreText));

    // a write against their own records
    const listBefore = Number(sql("select count(*) from list_entry l join \"user\" u on u.id=l.student_id where u.email='maya@example.com'"));
    const addBtn = ap.locator('button:has-text("+ ADD TO LIST")').first();
    if (await addBtn.count()) {
      await addBtn.click();
      await ap.waitForTimeout(2500);
    }
    const listAfter = Number(sql("select count(*) from list_entry l join \"user\" u on u.id=l.student_id where u.email='maya@example.com'"));
    ok('admin may write their own list', listAfter === listBefore + 1, `${listBefore} -> ${listAfter}`);
    if (listAfter > listBefore) {
      sql("delete from list_entry where id in (select l.id from list_entry l join \"user\" u on u.id=l.student_id where u.email='maya@example.com' order by l.created_at desc limit 1)");
    }

    // Start from no threads so the fresh state is deterministic; a thread
    // left by an earlier check makes this assert the wrong screen.
    sql("delete from counselor_thread where student_id = (select id from \"user\" where email='maya@example.com')");
    await ap.goto(`${BASE}/counselor`, { waitUntil: 'networkidle' });
    await ap.waitForTimeout(2500);
    const counselorText = await ap.evaluate(() => document.body.innerText);
    // A greeting only exists if createThreadAction and greetAction both ran,
    // and createThreadAction is the one behind requireStudent. Checking the
    // page merely renders is not enough — it renders fine while send fails.
    // createThreadAction sits behind requireStudent, so a thread row is
    // direct proof the gate let this account through. Asserting on the
    // rendered page instead would mean waiting out a ~20s greeting, and the
    // page renders fine while sending is broken — which is how this shipped.
    const threads = Number(
      sql("select count(*) from counselor_thread t join \"user\" u on u.id = t.student_id where u.email='maya@example.com'"),
    );
    ok('admin reaches the counselor, not "Students only"',
       !/Students only/i.test(counselorText) &&
       !!(await ap.locator('#counselor-input').count()) &&
       threads > 0,
       `threads=${threads}`);
    await actx.close();
  } finally {
    sql(`update \"user\" set role='${before}' where email='maya@example.com'`);
  }
}

/* 8. parent voice */
const pctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const pp = await pctx.newPage();
await pp.goto(`${BASE}/sign-in`);
await pp.fill('input[type=email]', 'dad@example.com');
await pp.fill('input[type=password]', 'correct-horse-battery');
await pp.click('button[type=submit]');
await pp.waitForURL('**/dashboard');
for (const r of ['/explore', '/planner', '/settings', '/apply']) {
  await pp.goto(`${BASE}${r}`, { waitUntil: 'networkidle' });
  await pp.waitForTimeout(600);
  const txt = await pp.evaluate(() => document.body.innerText);
  ok(`parent ${r} is written for a parent`,
     !/Link a parent account|What should I be doing\?|a linked parent can't see it unless you share|it takes about ten minutes/i.test(txt));
}
await pp.goto(`${BASE}/apply`, { waitUntil: 'networkidle' });
await pp.click('button:has-text("Essays")');
await pp.waitForTimeout(900);
ok('parent still cannot read essay drafts', /Select or create an essay/.test(await pp.evaluate(() => document.body.innerText)));
ok('parent still redirected off /counselor', (await pp.goto(`${BASE}/counselor`, { waitUntil: 'networkidle' }), pp.url().endsWith('/dashboard')));
await pp.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
ok('legal documents reachable from inside the app',
   (await pp.evaluate(() => Array.from(document.querySelectorAll('a')).map(a=>a.getAttribute('href')).filter(h=>/privacy|terms/.test(h||'')))).length >= 2);
await pctx.close();

ok('no unhandled errors or 5xx during the walk', errs.length === 0, errs.slice(0,3).join(' | '));

console.log(`\n${pass} passed, ${fail} failed\n`);
await browser.close();
process.exit(fail ? 1 : 0);
