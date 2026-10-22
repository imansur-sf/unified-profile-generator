// Read-only check of the deployed release and live shared Accounts connection.
// Run with: heroku run --no-tty "node scripts/check-feedback-deployed.cjs" --app APP
const assert = require('node:assert/strict');
const {app} = require('../server');
const server = app.listen(0,'127.0.0.1',async()=>{
  try {
    const base = 'http://127.0.0.1:'+server.address().port;
    const get = path => fetch(base+path,{signal:AbortSignal.timeout(25000)});
    for (const path of ['/','/preview-v2/']) {
      const response = await get(path);
      assert.equal(response.status,200);
      assert.ok((await response.text()).includes('feedback-inbox-open'));
    }
    const meta = await (await get('/api/app-version')).json();
    assert.equal(meta.version,require('../package.json').version);
    assert.equal(meta.tool,'upg');
    const session = await get('/feedback/session');
    assert.equal(session.status,200,'Accounts feedback service must be reachable');
    assert.deepEqual(await session.json(),{email:null,admin:false});
    assert.equal((await get('/feedback/inbox')).status,401);
    assert.equal((await get('/feedback/inbox?tool=lpg')).status,400);
    console.log('PASS deployed UPG '+meta.version+': both editors, live Accounts connection, guest session, private inbox denial, tool pinning.');
  } catch (error) {
    console.error(error.message); process.exitCode = 1;
  } finally {
    server.close(); server.closeAllConnections();
  }
});
