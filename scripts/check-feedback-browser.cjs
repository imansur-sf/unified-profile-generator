/* Opt-in real-browser + disposable PostgreSQL check. Never uses production credentials. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const accounts = process.env.FEEDBACK_ACCOUNTS_CHECKOUT;
const dependencies = process.env.FEEDBACK_ACCOUNTS_DEPENDENCIES;
if (!accounts || !dependencies || !process.env.FEEDBACK_BROWSER_DATABASE_URL?.startsWith('postgresql://postgres@127.0.0.1:')) throw Error('Provide explicit isolated local test checkout, dependencies and database.');
const {Pool} = require(path.join(dependencies,'pg'));
const jwt = require(path.join(dependencies,'jsonwebtoken'));
const {chromium} = require(process.env.UPG_PLAYWRIGHT_PATH || 'playwright');
const sharp = require('sharp');
process.env.DATABASE_URL = process.env.FEEDBACK_BROWSER_DATABASE_URL;
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
process.env.AUTH_PROVIDER = 'legacy';
delete process.env.MAGIC_SECRET_KEY;
delete process.env.GEMINI_API_KEY;
const listen = app => new Promise(resolve => { const server = app.listen(0,'127.0.0.1',()=>resolve(server)); });
const stop = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
(async()=>{
  const pool = new Pool({connectionString:process.env.DATABASE_URL});
  let backend,frontend,browser;
  const marker = 'UPG-browser-'+Date.now();
  try {
    await pool.query(fs.readFileSync(path.join(accounts,'db/schema.sql'),'utf8'));
    backend = await listen(require(path.join(accounts,'server')));
    process.env.SAASY_ACCOUNTS_URL = 'http://127.0.0.1:'+backend.address().port;
    frontend = await listen(require(path.join(root,'server')).app);
    const origin = 'http://127.0.0.1:'+frontend.address().port;
    const admin = jwt.sign({sub:'imansur@salesforce.com'},process.env.JWT_SECRET);
    const member = jwt.sign({sub:'member@salesforce.com'},process.env.JWT_SECRET);
    const submitSeed = async tool => {
      const res = await fetch(process.env.SAASY_ACCOUNTS_URL+'/feedback',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({...(tool?{tool}:{}),name:marker+'-'+(tool||'lpg'),email:marker+'-'+(tool||'lpg')+'@example.test',category:'general',description:'Isolated browser test seed',context:{}})});
      assert.equal(res.status,201); return (await res.json()).id;
    };
    const lpgId = await submitSeed();
    browser = await chromium.launch({headless:true,executablePath:process.env.UPG_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>{
      const host = new URL(route.request().url()).hostname;
      return ['127.0.0.1','localhost','cdn.tailwindcss.com','fonts.googleapis.com','fonts.gstatic.com'].includes(host)?route.continue():route.abort();
    });
    await page.goto(origin); await page.waitForFunction(()=>window.SaasyAuth&&window.UPGFeedback);
    await page.locator('#feedback-open').click();
    await page.locator('#feedback-name').fill(marker);
    await page.locator('#feedback-email').fill(marker+'@example.test');
    await page.locator('#feedback-description').fill('Real screenshot compression and lost-response retry.');
    const image = await sharp(crypto.randomBytes(2200*1200*3),{raw:{width:2200,height:1200,channels:3}}).png().toBuffer();
    assert.ok(image.length>1024*1024);
    await page.locator('#feedback-files').setInputFiles({name:'upload.png',mimeType:'image/png',buffer:image});
    await page.waitForFunction(()=>document.querySelectorAll('#feedback-previews img').length===1&&!document.querySelector('#feedback-submit').disabled);
    const data=image.toString('base64');
    await page.evaluate(data=>{
      const file=new File([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],'paste.png',{type:'image/png'}), transfer=new DataTransfer(); transfer.items.add(file);
      document.querySelector('#feedback-dialog').dispatchEvent(new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true}));
    },data);
    await page.waitForFunction(()=>document.querySelectorAll('#feedback-previews img').length===2&&!document.querySelector('#feedback-submit').disabled);
    await page.evaluate(data=>{
      const transfer=new DataTransfer();transfer.items.add(new File([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],'drop.png',{type:'image/png'}));
      document.querySelector('#feedback-drop').dispatchEvent(new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true}));
    },data);
    await page.waitForFunction(()=>document.querySelectorAll('#feedback-previews img').length===3&&!document.querySelector('#feedback-submit').disabled);
    await page.locator('#feedback-files').setInputFiles({name:'fourth.png',mimeType:'image/png',buffer:image});
    await page.waitForFunction(()=>document.querySelector('#feedback-message').textContent.includes('up to 3'));
    assert.equal(await page.locator('#feedback-previews img').count(),3);
    let first=true;const keys=[];
    await page.route(origin+'/feedback',async route=>{
      if(route.request().method()!=='POST')return route.continue();
      keys.push(route.request().headers()['idempotency-key']);
      const response=await route.fetch();
      if(first){first=false;assert.equal(response.status(),201);return route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'feedback_service_unavailable'})});}
      return route.fulfill({response});
    });
    await page.locator('#feedback-submit').click();
    await page.waitForFunction(()=>document.querySelector('#feedback-message').textContent.includes('temporarily unavailable'));
    assert.equal(await page.locator('#feedback-description').inputValue(),'Real screenshot compression and lost-response retry.');
    assert.equal(await page.locator('#feedback-success').isVisible(),false);
    await page.locator('#feedback-submit').click(); await page.locator('#feedback-success').waitFor({state:'visible'});
    assert.equal(keys.length,2); assert.equal(keys[0],keys[1]);
    const rows=await pool.query('SELECT id,tool,context FROM feedback_submissions WHERE name=$1',[marker]);
    assert.equal(rows.rowCount,1);assert.equal(rows.rows[0].tool,'upg');
    const id=rows.rows[0].id;
    const attachments=await pool.query('SELECT id,data,type FROM feedback_attachments WHERE feedback_id=$1',[id]);
    assert.equal(attachments.rowCount,3);
    for(const row of attachments.rows){assert.ok(row.data.length<=1024*1024);assert.equal(row.type,'image/jpeg');assert.ok((await sharp(row.data).metadata()).width<=1800);}
    await page.locator('#feedback-done').click();
    const signIn=async(token,email)=>{await page.evaluate(({token,email})=>{localStorage.setItem('saasy_auth_token',token);localStorage.setItem('saasy_auth_email',email);},{token,email});await page.reload();await page.waitForFunction(()=>window.SaasyAuth&&window.UPGFeedback);};
    await signIn(admin,'imansur@salesforce.com');await page.locator('#feedback-inbox-open').waitFor({state:'visible'});
    const api=async(url,token,method='GET')=>page.evaluate(async({url,token,method})=>{const res=await fetch(url,{method,headers:{Authorization:'Bearer '+token}});return {status:res.status,body:await res.json()};},{url,token,method});
    const inbox=await api('/feedback/inbox',admin);assert.equal(inbox.status,200);assert.ok(inbox.body.items.every(row=>row.tool==='upg'));assert.ok(!inbox.body.items.some(row=>row.id===lpgId));
    assert.equal((await api('/feedback/inbox/'+lpgId,admin)).status,404);
    assert.equal((await api('/feedback/inbox?tool=lpg',admin)).status,400);
    assert.equal((await api('/feedback/inbox',member)).status,403);
    assert.equal((await api('/feedback/inbox/'+id,member)).status,403);
    assert.equal((await api('/feedback/inbox/'+id+'/attachments/'+attachments.rows[0].id,member)).status,403);
    await page.locator('#feedback-inbox-open').click();
    await page.locator('#feedback-inbox-list .feedback-row').filter({hasText:marker}).click();await page.locator('.feedback-detail-image').first().waitFor();
    await page.waitForFunction(()=>Array.from(document.querySelectorAll('.feedback-detail-image')).length===3&&Array.from(document.querySelectorAll('.feedback-detail-image')).every(img=>img.complete&&img.naturalWidth>0));
    await page.locator('#feedback-detail-status').selectOption('reviewing');await page.waitForFunction(()=>document.querySelector('#feedback-inbox-message').textContent==='Status saved.');
    assert.equal((await pool.query('SELECT status FROM feedback_submissions WHERE id=$1',[id])).rows[0].status,'reviewing');
    const screenshotDir=process.env.FEEDBACK_SCREENSHOT_DIR;
    if(screenshotDir)await page.screenshot({path:path.join(screenshotDir,'upg-feedback-inbox-desktop.png')});
    page.once('dialog',dialog=>dialog.accept());await page.locator('#feedback-delete').click();await page.waitForFunction(()=>document.querySelector('#feedback-inbox-detail').hidden);
    assert.equal((await pool.query('SELECT id FROM feedback_submissions WHERE id=$1',[id])).rowCount,0);
    assert.equal((await pool.query('SELECT id FROM feedback_attachments WHERE feedback_id=$1',[id])).rowCount,0);
    await page.evaluate(()=>{SaasyAuth.signOut();return UPGFeedback.refreshSession();});
    await page.locator('#feedback-inbox-open').waitFor({state:'hidden'});
    assert.equal(await page.locator('#feedback-inbox-detail').textContent(),'');
    await signIn(member,'member@salesforce.com');assert.equal(await page.locator('#feedback-inbox-open').isVisible(),false);
    for(const route of ['/','/preview-v2/']){
      await page.goto(origin+route);await page.waitForFunction(()=>window.UPGFeedback&&window.SaasyAuth);
      for(const width of [1440,390]){
        await page.setViewportSize({width,height:width===390?844:1000});
        await page.locator('#feedback-open').click();await page.waitForTimeout(200);
        const box=await page.locator('#feedback-dialog').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width);
        assert.equal(await page.evaluate(()=>document.querySelector('#feedback-dialog').scrollWidth<=document.querySelector('#feedback-dialog').clientWidth),true);
        await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.querySelector('#feedback-dialog').contains(document.activeElement)),true);
        if(screenshotDir)await page.screenshot({path:path.join(screenshotDir,`upg-feedback-${route==='/'?'original':'preview'}-${width}.png`)});
        await page.keyboard.press('Escape');assert.equal(await page.locator('#feedback-dialog').evaluate(dialog=>dialog.open),false);
        assert.equal(await page.evaluate(()=>document.activeElement.id),'feedback-open');
      }
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: real Chromium + PostgreSQL guest persistence; upload/drop/paste 3 images <=1 MiB; lost-response idempotency; verified admin status/screenshots/delete; LPG isolation; nonadmin denial; signout cleanup; native focus/Escape; both editors desktop/mobile.');
  } finally {
    if(browser)await browser.close();
    await pool.query('DELETE FROM feedback_submissions WHERE name LIKE $1',[marker+'%']);await pool.end();
    if(frontend)await stop(frontend);if(backend)await stop(backend);
    await require(path.join(accounts,'db/pool')).end();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
