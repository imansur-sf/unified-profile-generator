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
  for (const file of ['defaults','profile-contract','generator','pagehost','editor-support','app']) vm.runInContext(fs.readFileSync(path.join(root,'js',file+'.js'),'utf8'),box,{filename:file+'.js'});
  const run = source => vm.runInContext(source,box);
  run(`readStaticFields=()=>{};fillStaticFields=()=>{};renderAll=()=>{};refreshPreview=()=>{};
    updateProfileStrategyUI=()=>{};renderRecs=()=>{};syncProfileSetConfigUI=()=>{};goToStep=()=>{};syncAuthUI=()=>{};activateDialogFocus=()=>{};
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
    const before=JSON.parse(JSON.stringify(h.get()));wait.resolve(h.fixture());await p;
    if (!replace) before.profileSet.statuses.sales='edited';
    assert.equal(JSON.stringify(h.get()),JSON.stringify(before));
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

test('custom identity fields are scoped per persona and survive output snapshots',()=>{
  const h=harness();h.run("addRailField();updateRailField(0,'label','Events attended');updateRailField(0,'value','3');snapshotPersonaView();setViewerLens('service')");
  assert.equal(h.get().railFields.length,0);
  h.run("setViewerLens('sales')");assert.equal(h.get().railFields[0].value,'3');
  assert(h.run('captureOutputSnapshot().railFields[0].label')==='Events attended');
});
test('keyboard module moves preserve identity, visibility and order',()=>{
  const h=harness();h.run("state.extraCards=[{moduleId:'a',title:'A',items:[],visibility:'visible',placement:'middle'},{moduleId:'b',title:'B',items:[],visibility:'visible',placement:'middle'}];state.rightExtraCards=[];reorderCustomModule('b',-1)");
  assert.equal(h.get().extraCards[0].moduleId,'b');
  h.run("moveCustomModule('b','right')");assert.equal(h.get().rightExtraCards[0].moduleId,'b');
  h.run("moveCustomModule('b','hidden')");assert.equal(h.get().rightExtraCards[0].visibility,'hidden');
  h.run("moveCustomModule('b','suggested')");assert.equal(h.get().rightExtraCards[0].visibility,'suggested');
});
test('malicious module IDs cannot escape inline editor event handlers',()=>{
  const h=harness();h.run(`state.extraCards=[{moduleId:"x');alert(1)//",title:'Safe',items:[]}];normalizeCustomModules()`);
  assert.match(h.get().extraCards[0].moduleId,/^[A-Za-z0-9_-]+$/);
});
test('local recovery stores only project fields, not credentials, and serializes writes',async()=>{
  const h=harness(), wait=deferred(), stored=[];let calls=0;
  h.box.storeDraft=async(_,record)=>{calls++;if(calls===1) await wait.promise;stored.push(record);};
  h.run("draftReady=true;draftStorage=storeDraft;state.apiKey='SECRET';state.token='SECRET';currentProjectOwner='owner@salesforce.com'");
  const first=h.run('persistDraftRecovery()');await Promise.resolve();h.run("state.profile.name='Newer'");const second=h.run('persistDraftRecovery()');
  wait.resolve();await Promise.all([first,second]);
  assert.equal(stored.length,2);assert.equal(stored[1].profile.profile.name,'Newer');assert.equal(stored[1].owner,'owner@salesforce.com');
  assert(!JSON.stringify(stored).includes('SECRET'));h.run('draftReady=false;clearTimeout(draftTimer)');
});
test('local recovery fails visibly without claiming a successful backup',async()=>{
  const h=harness();h.run("draftReady=true;draftStorage=async()=>{throw Error('QuotaExceededError')}");
  assert.equal(await h.run('persistDraftRecovery()'),false);assert.match(h.node('draft-status').textContent,/unavailable/);
  h.run('draftReady=false;clearTimeout(draftTimer)');
});
test('recovery refuses a different signed-in owner before changing state',()=>{
  const h=harness();h.box.record=h.fixture();h.run("draftPending={profile:record,owner:'original@salesforce.com'}");
  h.box.window.SaasyAuth={getEmail:()=> 'other@salesforce.com'};const old=h.get();h.run('restoreDraftRecovery()');
  assert.equal(h.get(),old);assert.match(h.messages[0],/account that created/);
});
test('save retry reuses the complete request, including artifact timestamp and key',async()=>{
  const h=harness(), requests=[];let saved=false;
  h.box.SaasyAuth={getEmail:()=> 'owner@salesforce.com',saveProject:async options=>{requests.push(JSON.stringify(options));if(!saved){saved=true;throw Error('network failed');}return {id:'42',name:'Demo',revision:1};}};
  h.box.window.SaasyAuth=h.box.SaasyAuth;h.node('save-project-name-input').value='Demo';
  await h.run('confirmSaveProject(false)');await h.run('confirmSaveProject(false)');
  assert.equal(requests.length,2);assert.equal(requests[0],requests[1]);assert.equal(h.run('currentProjectId'),'42');
});
test('a lost update response is recognized only when stored content is identical',async()=>{
  const h=harness();h.box.options={id:'42',name:'Demo',payload:{b:2,a:1},sourceUrl:'https://test.example/'};
  h.box.SaasyAuth={getEmail:()=> 'owner@salesforce.com',saveProject:async()=>{throw Error('revision_conflict');},
    loadProject:async()=>({id:'42',name:'Demo',tool:'upg',payload:{a:1,b:2},revision:2,source_url:'https://test.example/'})};
  assert.equal((await h.run('saveProjectWithSessionRecovery(options)')).revision,2);
  h.box.options.payload.a=3;await assert.rejects(h.run('saveProjectWithSessionRecovery(options)'),/revision_conflict/);
});
test('partial generated identity never inherits another sample account’s facts',()=>{
  const h=harness();h.box.fixture=h.fixture();h.box.fixture.profile={name:'New customer'};h.box.fixture.loyalty={title:'Membership'};
  h.run('applyAIProfile(fixture)');assert.equal(h.get().profile.email,'');assert.equal(h.get().loyalty.tier,'');
});

test('project loading preserves edits and rejects an account switch during the request',async()=>{
  for (const switchAccount of [false,true]) {
    const h=harness(),wait=deferred();let email='original@salesforce.com';
    h.box.SaasyAuth={loadProject:()=>wait.promise,getEmail:()=>email};
    const old=h.get(),pending=h.run("loadProjectAndHydrate('old-project')");
    if(switchAccount) email='other@salesforce.com'; else h.run("state.profile.name='Unsaved manual edit'");
    wait.resolve({id:'old-project',tool:'upg',payload:h.fixture()});await pending;
    assert.equal(h.get(),old);assert.match(h.messages[0],switchAccount?/account changed/:/edits were kept/);
  }
});
test('draft A → pending B → A stores the latest editor state',async()=>{
  const h=harness(),wait=deferred(),started=deferred(),stored=[];
  h.box.storeDraft=async(_,record)=>{if(record.profile.profile.name==='B'){started.resolve();await wait.promise;}stored.push(record.profile.profile.name);};
  h.run("draftReady=true;draftStorage=storeDraft;state.profile.name='A'");await h.run('persistDraftRecovery()');
  h.run("state.profile.name='B'");const second=h.run('persistDraftRecovery()');await started.promise;
  h.run("state.profile.name='A'");const third=h.run('persistDraftRecovery()');
  wait.resolve();await Promise.all([second,third]);assert.deepEqual(stored,['A','B','A']);
  h.run('draftReady=false;clearTimeout(draftTimer)');
});
test('single recommendation retry reports the number of actual images, never a negative count',async()=>{
  const h=harness();h.run("state.recommendations.items=[{title:'A',image:''},{title:'B',image:''},{title:'C',image:''}]");
  h.box.window.LocalAI={generatePersonaRecommendationImages:async()=>({results:[{slot:'rec_0',imageData:'data:image/png;base64,b2s='}]})};
  await h.run("generatePersonaRecommendationImagesForTarget('sales',state,{onlyIndex:0})");
  assert.equal(h.get().profileSet.visuals.sales.count,1);assert.equal(h.get().profileSet.visuals.sales.state,'partial');
});
test('Advanced toggle and connection-error nudge expose the expanded state',()=>{
  const h=harness();let open=false,expanded;
  h.node('quickstart-settings').classList={toggle:()=>open=!open,contains:()=>open,add:()=>open=true};
  h.node('quickstart-settings-toggle').setAttribute=(name,value)=>{if(name==='aria-expanded')expanded=value;};
  h.run('toggleQuickStartSettings()');assert.equal(expanded,'true');
  h.run('toggleQuickStartSettings()');assert.equal(expanded,'false');
  h.run("nudgeToAdvancedIfDefaultFailed('default_network')");assert.equal(expanded,'true');
});
test('loading a saved company restores its source URL instead of the previous editor URL',async()=>{
  const h=harness();h.box.SaasyAuth={getEmail:()=> 'owner@salesforce.com',loadProject:async()=>({id:'new-project',name:'Acme',tool:'upg',source_url:'https://acme.example/',payload:h.fixture()})};
  await h.run("loadProjectAndHydrate('new-project')");
  assert.equal(h.node('quickstart-url').value,'https://acme.example/');assert.equal(h.run('currentProjectId'),'new-project');
});
