const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const contract = require('../js/profile-contract');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };

function harness() {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', innerHTML: '', style: {}, hidden: false, disabled: false,
      classList: { add(){}, remove(){}, contains(){return false;}, toggle(){} }, setAttribute(){}, focus(){}, querySelectorAll(){return [];} });
    return nodes.get(id);
  };
  const selected = ['sales'];
  const messages = [];
  const box = { console, URL, Date, Math, JSON, Map, Blob, TextEncoder, setTimeout, clearTimeout, AbortController,
    confirm:()=>true, alert:msg=>messages.push(msg),
    document:{readyState:'loading',addEventListener(){},getElementById:node,
      querySelectorAll: query=>query.includes('profile-set-choices')?selected.map(value=>({value})):[], querySelector(){return null;}},
    window:{addEventListener(){},location:{href:'https://upg.example/'}},
    localStorage:{getItem(){return null;}}, fetch:async()=>{throw Error('Network disabled');} };
  vm.createContext(box);
  for (const file of ['defaults','profile-contract','generator','pagehost','app']) vm.runInContext(fs.readFileSync(path.join(root,'js',file+'.js'),'utf8'),box,{filename:file+'.js'});
  const run = source => vm.runInContext(source,box);
  run(`readStaticFields=()=>{};fillStaticFields=()=>{};renderAll=()=>{};refreshPreview=()=>{};
    updateProfileStrategyUI=()=>{};renderRecs=()=>{};syncProfileSetConfigUI=()=>{};goToStep=()=>{};syncAuthUI=()=>{};
    state=cloneIndustry('retail');state.brandName='Test Retail';state._industry='retail';state._aiContext={sourceUrl:'https://test.example/'};
    applyPersonaPreset();applyPersonaSampleTemplate();snapshotPersonaView();`);
  node('quickstart-url').value='https://test.example/';
  const fixture = () => JSON.parse(run(`JSON.stringify(Object.assign(cloneIndustry('healthcare'),{brandName:'Acme Health',_meta:{source_url:'https://test.example/'},_sourceContext:{url:'https://test.example/',scraped:{title:'Acme',bodyText:'',headings:'',navLinkCandidates:[]}}}))`));
  return {box,node,run,selected,messages,fixture,get:()=>run('state')};
}

test('valid smart quotes survive JSON parsing, and identity excludes binary assets',()=>{
  const h=harness();
  assert.equal(h.box.window.UPG_Shared.parseAIResponseText('{"title":"Attend the “Wellness” seminar"}').title,'Attend the “Wellness” seminar');
  const cleaned=contract.textIdentity({profile:{name:'Alex',photo:'data:image/png;base64,'+'x'.repeat(9000)},loyalty:{tier:'Gold'}});
  assert.equal(cleaned.loyalty.tier,'Gold');assert(!JSON.stringify(cleaned).includes('base64'));
});
test('empty/incomplete AI output fails validation without replacing work',()=>{
  const h=harness();const original=h.get();
  assert.throws(()=>h.run('applyAIProfile({})'),/incomplete/);assert.equal(h.get(),original);
  assert.throws(()=>contract.validateAIProfile({brandName:'Blank',profile:{name:'Alex'}}),/incomplete/);
});
test('generated profile contains no Vance Tech fallback and blank images stay retryable',()=>{
  const h=harness();h.box.fixture=h.fixture();h.box.fixture.recommendations.items.forEach(x=>x.image='');
  h.run('applyAIProfile(fixture)');
  assert(!JSON.stringify(h.get().extraCards).includes('Vance Tech'));
  assert(h.get().recommendations.items.every(x=>!x.image));
});
test('late Sales imagery updates Sales only after switching to Service',async()=>{
  const h=harness(), wait=deferred();
  h.box.window.LocalAI={generatePersonaRecommendationImages:()=>wait.promise};
  h.run('ensurePersonaRecommendationImages=()=>{}');
  const original=h.get().recommendations.items[0].title;
  const pending=h.run("generatePersonaRecommendationImagesForTarget('sales',state)");
  h.run("setViewerLens('service')");const service=h.get().recommendations.items[0].title;
  wait.resolve({results:[{slot:'rec_0',imageData:'data:image/png;base64,c2FsZXM='}]});await pending;
  assert.equal(h.get().recommendations.items[0].title,service);
  assert.equal(h.get().personaVariants.sales.recommendations.items[0].title,original);
  assert.equal(h.get().personaVariants.sales.recommendations.items[0].image,'data:image/png;base64,c2FsZXM=');
});
test('late imagery cannot modify a replacement project',async()=>{
  const h=harness(), wait=deferred();h.box.window.LocalAI={generatePersonaRecommendationImages:()=>wait.promise};
  const p=h.run("generatePersonaRecommendationImagesForTarget('sales',state)");
  h.run("state=cloneTonyRobbinsStarter()");const original=JSON.stringify(h.get());
  wait.resolve({results:[{slot:'rec_0',imageData:'data:image/png;base64,c3RhbGU='}]});await p;
  assert.equal(JSON.stringify(h.get()),original);
});
test('personalization completing offscreen does not write into active view',async()=>{
  const h=harness(), wait=deferred(), started=deferred();
  h.box.window.LocalAI={collectCustomerContext:async()=>({}),generatePersonaOverlay:()=>{started.resolve();return wait.promise;}};
  const p=h.run('onPersonalizeCurrentPersona()');await started.promise;
  h.run("setViewerLens('service')");const title=h.get().recommendations.items[0].title;
  const overlay=h.fixture();overlay.insights.items[0].label='Sales-only signal';wait.resolve(overlay);await p;
  assert.equal(h.get().recommendations.items[0].title,title);
  assert.equal(h.get().personaVariants.sales.insights.items[0].label,'Sales-only signal');
});
test('personalization preserves manual edits and rejects a replaced customer',async()=>{
  for (const replace of [false,true]) {
    const h=harness(),wait=deferred(),started=deferred();
    h.box.window.LocalAI={collectCustomerContext:async()=>({}),generatePersonaOverlay:()=>{started.resolve();return wait.promise;}};
    const p=h.run('onPersonalizeCurrentPersona()');await started.promise;
    h.run(replace?"state=cloneTonyRobbinsStarter()":"state.insights.items[0].value='My manual edit'");
    const before=JSON.stringify(h.get());wait.resolve(h.fixture());await p;
    assert.equal(JSON.stringify(h.get()),before);
  }
});
test('B2B shared facts do not drift on persona switching',()=>{
  const h=harness();h.run("state=cloneAccountIndustry('generic');state.accountMetrics.pipeline='$510K';snapshotPersonaView();setViewerLens('service');setViewerLens('sales')");
  assert.equal(h.get().accountMetrics.pipeline,'$510K');
});
test('initial generation preserves entered objective/brief and completes correct views after switch',async()=>{
  const h=harness(), wait=deferred(), started=deferred();h.selected.push('service');
  h.run("state.profileStrategy.objective='expand';state.profileStrategy.brief='Call coaching';setPersonaBrief(state,'sales','Call coaching')");
  let options;
  h.box.window.LocalAI={analyzeCustomerURL:async(_,opts)=>{options=opts;return h.fixture();},
    generatePersonaOverlay:()=>{started.resolve();return wait.promise;}};
  const p=h.run('onQuickStartAnalyze()');await started.promise;
  h.run("setViewerLens('service')");const overlay=h.fixture();overlay.insights.items[0].label='Generated service signal';wait.resolve(overlay);await p;
  assert.equal(options.strategy.objective,'expand');assert.equal(options.strategy.brief,'Call coaching');
  assert.equal(h.get().profileStrategy.lens,'service');assert.equal(h.get().insights.items[0].label,'Generated service signal');
  assert.notEqual(h.get().personaVariants.sales.insights.items[0].label,'Generated service signal');
});
test('in-flight B2C generation does not apply after switching mode',async()=>{
  const h=harness(),wait=deferred();h.box.window.LocalAI={analyzeCustomerURL:()=>wait.promise};
  const p=h.run('onQuickStartAnalyze()');h.run("setProfileType('b2b')");const before=JSON.stringify(h.get());
  wait.resolve(h.fixture());await p;assert.equal(JSON.stringify(h.get()),before);
});
test('initial analysis cannot replace edits made while waiting',async()=>{
  const h=harness(),wait=deferred();h.box.window.LocalAI={analyzeCustomerURL:()=>wait.promise};
  const p=h.run('onQuickStartAnalyze()');h.run("state.profile.name='My edited name'");
  wait.resolve(h.fixture());await p;
  assert.equal(h.get().profile.name,'My edited name');assert.match(h.node('quickstart-status').textContent,/edits were kept/);
});
test('visiting queued text does not start template image generation',async()=>{
  const h=harness();let calls=0;h.box.window.LocalAI={generatePersonaRecommendationImages:()=>{calls++;return {results:[]};}};
  h.run("ensureProfileSet().statuses.service='generating';setViewerLens('service')");
  await h.run("ensurePersonaRecommendationImages('service')");assert.equal(calls,0);
});
test('changed requirements invalidate pending recommendation imagery',async()=>{
  const h=harness(),wait=deferred();h.box.window.LocalAI={generatePersonaRecommendationImages:()=>wait.promise};
  const p=h.run("generatePersonaRecommendationImagesForTarget('sales',state)");h.run("state.profileStrategy.brief='Different context'");
  wait.resolve({results:[{slot:'rec_0',imageData:'data:image/png;base64,c3RhbGU='}]});await p;
  assert(!h.get().recommendations.items[0].image);assert.equal(h.get().profileSet.visuals.sales.state,'pending');
});
test('unsafe saved-state shapes are rejected before hydration',()=>{
  const h=harness(),data=h.fixture();delete data.loyalty;assert.throws(()=>contract.validateSavedProfile(data),/valid/);
  const data2=h.fixture();data2.affinities.seriesA=null;assert.throws(()=>contract.validateSavedProfile(data2),/signal/);
  const data3=h.fixture();data3.personaVariants={sales:null};assert.throws(()=>contract.validateSavedProfile(data3),/persona/);
});
test('repeated overlays have stable unique suggested module IDs',()=>{
  const h=harness();h.box.fixture=h.fixture();h.box.fixture.extraCards=[{title:'Call coaching',items:[{label:'Result',value:'Good'}]}];
  h.run('mergePersonaOverlay(state,fixture);mergePersonaOverlay(state,fixture)');
  const cards=h.get().extraCards.filter(c=>c.title==='Call coaching');assert.equal(cards.length,1);
  const ids=h.get().extraCards.map(c=>c.moduleId);assert.equal(new Set(ids).size,ids.length);
});
test('output snapshot flushes pending updates without consulting old srcdoc',()=>{
  const h=harness();h.node('preview-iframe').srcdoc='OLD';h.run("state.profile.name='Fresh view'");
  const html=h.run('getPresentationDocument()');assert(html.includes('Fresh view'));assert.notEqual(html,'OLD');
});
test('Save preparation failure unlocks subsequent attempts',async()=>{
  const h=harness();h.run("readStaticFields=()=>{throw Error('field failure')}");await h.run('confirmSaveProject(false)');
  assert.equal(h.run('projectSaveInFlight'),false);assert(h.messages.some(x=>x.includes('field failure')));
});
test('recovery cannot save prior payload to another signed-in account',async()=>{
  const h=harness();let email='a@salesforce.com',calls=0;
  h.box.SaasyAuth={getEmail:()=>email,saveProject:async()=>{calls++;throw Error('invalid_token')},signIn:async()=>{email='b@salesforce.com'}};
  await assert.rejects(()=>h.run('saveProjectWithSessionRecovery({})'),/account_changed/);assert.equal(calls,1);
});
test('Start Over detaches the old saved project identity',()=>{
  const h=harness();h.run("currentProjectId='old';currentProjectName='Old company';startOver()");assert.equal(h.run('currentProjectId'),null);
});
test('wrong-tool saved project never replaces current work',async()=>{
  const h=harness();const original=h.get();h.box.SaasyAuth={loadProject:async()=>({tool:'lpg',payload:h.fixture()})};
  await h.run("loadProjectAndHydrate('other')");assert.equal(h.get(),original);assert(h.messages[0].includes('different tool'));
});
