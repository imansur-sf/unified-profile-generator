// Read-only deployed capability/auth smoke test. No cloud data or AI calls.
const assert=require('node:assert/strict');
const {app}=require('../server');
const server=app.listen(0,'127.0.0.1',async()=>{
  try{
    const base='http://127.0.0.1:'+server.address().port;
    const get=path=>fetch(base+path,{signal:AbortSignal.timeout(10000)});
    const discovery=await get('/.well-known/mcp.json');assert.equal(discovery.status,200);
    const info=await discovery.json();assert.ok(info.capabilities.tools.includes('upg_get_profile_artifacts'));
    assert.equal(info.artifacts.revisionPinned,true);
    for(const pathname of ['/integrations/v1/upg/profiles/1/artifacts','/integrations/v1/upg/profiles/1/artifacts/png?revision=art_'+'a'.repeat(40)]){
      const response=await get(pathname);assert.equal(response.status,401);assert.match(response.headers.get('cache-control'),/no-store/);
    }
    console.log('PASS deployed artifact discovery, missing-key denial before capture, private responses. Hosted capture configured: '+info.artifacts.captureConfigured+'.');
  }catch(error){console.error(error.message);process.exitCode=1;}
  finally{server.close();server.closeAllConnections();}
});
