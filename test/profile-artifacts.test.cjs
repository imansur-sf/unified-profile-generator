const {test} = require('node:test');
const assert = require('node:assert/strict');
const {getRuntime,renderSavedProfile,snapshotView} = require('../lib/profile-runtime');
const {buildProfileArtifacts} = require('../lib/profile-artifacts');
const make = (mode='b2c') => getRuntime().cloneProfileMode(mode,'generic');
const options = {origin:'https://upg.example',profileId:'42'};

test('selected artifacts preserve trusted renderer output and exclude browser/provider secrets at every projected depth',()=>{
  for(const mode of ['b2c','b2b']){
    const state = make(mode);
    state.extraCards = [{title:'Module',items:[{label:'Label',value:'Value'}]}];
    const before = renderSavedProfile(state,options).html;
    state.apiKey='TOP-SECRET';state.provider={key:'TOP-SECRET'};state.profile.key='TOP-SECRET';
    state.recommendations.items[0].apiKey='TOP-SECRET';state.colors.token='TOP-SECRET';
    state.extraCards[0].items[0].credentials={secret:'TOP-SECRET'};
    const result=buildProfileArtifacts(state,options);
    assert.doesNotMatch(JSON.stringify(result),/TOP-SECRET/);
    assert.equal(result.html,before);
    assert.equal(result.manifest.image.width,1920);assert.equal(result.manifest.image.height,1080);
    assert.equal(result.manifest.capture.available,false);
    assert.equal(result.data.schemaVersion,'upg.presentation.v1');
    assert.equal(result.data.state.personaVariants,undefined);
    assert.equal(state.apiKey,'TOP-SECRET'); // no source mutation
    for(const link of Object.values(result.manifest.downloads)){
      assert.ok(link.startsWith('/integrations/v1/upg/profiles/42/artifacts/'));
      assert.ok(link.includes('revision='+result.manifest.revision));
      assert.doesNotMatch(link,/key=/i);
    }
  }
});
test('artifact revisions change only when selected render data or renderer changes, not credentials or unrelated personas',()=>{
  const state=make();const initial=buildProfileArtifacts(state,options);
  state.apiKey='ignored';state.personaVariants={service:snapshotView(state)};
  assert.equal(buildProfileArtifacts(state,options).manifest.revision,initial.manifest.revision);
  state.personaVariants.service.strategy={lens:'service',objective:'resolve'};
  state.personaVariants.service.recommendations.items[0].title='Service only';
  const service=buildProfileArtifacts(state,{...options,persona:'service'});
  assert.equal(service.manifest.persona,'service');assert.match(service.html,/Service only/);
  assert.notEqual(service.manifest.revision,initial.manifest.revision);
  assert.equal(buildProfileArtifacts(state,options).manifest.revision,initial.manifest.revision);
  state.profile.name='Changed';
  assert.notEqual(buildProfileArtifacts(state,options).manifest.revision,initial.manifest.revision);
  assert.throws(()=>buildProfileArtifacts(state,{...options,persona:'marketing'}),error=>error.code==='persona_not_found');
});
test('manifest reports external and missing imagery without claiming a complete screenshot',()=>{
  const state=make();state.recommendations.items[0].image='https://customer.example/photo.png';
  const external=buildProfileArtifacts(state,{...options,captureAvailable:true});
  assert.equal(external.manifest.assets.selfContained,false);assert.ok(external.manifest.assets.externalImages>0);
  state.profile.photo='';state.recommendations.items.forEach(item=>item.image='');
  const missing=buildProfileArtifacts(state,options);
  assert.equal(missing.manifest.assets.missingRecommendationImages,2);
  assert.equal(missing.manifest.assets.selfContained,true);
});
test('oversized nested row sets fail explicitly rather than silently truncate',()=>{
  const state=make();state.insights.items=Array.from({length:501},()=>({label:'x',value:'y'}));
  assert.throws(()=>buildProfileArtifacts(state,options),error=>error.code==='artifact_data_limit'&&error.status===413);
});
