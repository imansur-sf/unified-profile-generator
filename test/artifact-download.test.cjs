const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {downloadArtifacts}=require('../scripts/download-profile-artifacts.cjs');
const revision='art_'+'a'.repeat(40),base='/integrations/v1/upg/profiles/42/artifacts';
function fixture(){
  const query='?persona=sales&revision='+revision;
  const manifest={schemaVersion:'upg.artifacts.v1',profileId:'42',persona:'sales',revision,capture:{available:true},assets:{selfContained:true},downloads:Object.fromEntries(['html','json','png'].map(format=>[format,base+'/'+format+query]))};
  const png=Buffer.alloc(33);Buffer.from('89504e470d0a1a0a','hex').copy(png);png.writeUInt32BE(1920,16);png.writeUInt32BE(1080,20);
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});assert.equal(options.headers['X-API-Key'],'test-key');assert.equal(options.redirect,'error');
    if(new URL(url).pathname===base)return new Response(JSON.stringify(manifest));
    const format=new URL(url).pathname.split('/').at(-1);
    return new Response(format==='png'?png:format==='json'?JSON.stringify({schemaVersion:'upg.presentation.v1',revision,state:{profile:{name:'Demo'}}}):'<html>Demo</html>',{headers:{'X-UPG-Artifact-Revision':revision}});
  };
  return {manifest,calls,fetchImpl};
}
test('download helper writes revision-matched artifacts to a new private folder, never credentials',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'upg-artifact-client-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const fixtureData=fixture(),outputDir=path.join(directory,'bundle');
  const result=await downloadArtifacts({origin:'https://upg.example',key:'test-key',profileId:'42',outputDir,fetchImpl:fixtureData.fetchImpl});
  assert.equal(result.revision,revision);assert.equal(fixtureData.calls.length,4);
  for(const name of await fs.readdir(outputDir)){assert.doesNotMatch((await fs.readFile(path.join(outputDir,name))).toString(),/test-key/);}
  await assert.rejects(downloadArtifacts({origin:'https://upg.example',key:'test-key',profileId:'42',outputDir,fetchImpl:fixtureData.fetchImpl}),{code:'EEXIST'});
});
test('download helper refuses off-origin/path/key leaks before following a manifest reference',async()=>{
  for(const unsafe of ['https://evil.example/profile.html','//evil.example/profile.html',base+'/html?persona=sales&revision='+revision+'&key=oops','/auth/logout']){
    const f=fixture();f.manifest.downloads.html=unsafe;
    await assert.rejects(downloadArtifacts({origin:'https://upg.example',key:'test-key',profileId:'42',fetchImpl:f.fetchImpl}),/Unsafe artifact/);
    assert.equal(f.calls.length,1);
  }
  for(const origin of ['http://upg.example','https://user:pass@upg.example','https://upg.example/path'])await assert.rejects(downloadArtifacts({origin,key:'test-key',profileId:'42'}));
});
test('download helper supports explicit HTML/JSON-only mode and fails on changed revision without writing',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'upg-artifact-client-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const f=fixture();f.manifest.capture.available=false;
  await assert.rejects(downloadArtifacts({origin:'https://upg.example',key:'test-key',profileId:'42',fetchImpl:f.fetchImpl}),/not configured/);
  const out=await downloadArtifacts({origin:'https://upg.example',key:'test-key',profileId:'42',skipPng:true,outputDir:path.join(directory,'html-only'),fetchImpl:f.fetchImpl});
  assert.deepEqual(out.files,['profile.html','profile.json']);
  const bad=fixture();const fetchImpl=async(url,options)=>new URL(url).pathname===base?bad.fetchImpl(url,options):new Response('Changed',{headers:{'X-UPG-Artifact-Revision':'different'}});
  const outputDir=path.join(directory,'must-not-exist');
  await assert.rejects(downloadArtifacts({origin:'https://upg.example',key:'test-key',profileId:'42',outputDir,fetchImpl}),/revision mismatch/);
  await assert.rejects(fs.stat(outputDir),{code:'ENOENT'});
});
