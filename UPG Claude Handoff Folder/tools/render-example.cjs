'use strict';
// Structural proof helper, not the finished skill. Never researches or calls a model.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const {buildState, addView, selectSavedView} = require('../source/upg-core/lib/profile-runtime');
const {buildProfileArtifacts} = require('../source/upg-core/lib/profile-artifacts');
const [mode, directory] = process.argv.slice(2);
if (!['b2c', 'b2b'].includes(mode) || !directory || process.argv.length !== 4) throw Error('Usage: node tools/render-example.cjs b2c|b2b NEW_OUTPUT_DIRECTORY');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'examples', name)));
const input = read(`request-${mode}.json`);
const state = buildState(read(`base-${mode}.json`), input, input.views[0]);
// Correct legacy provenance in this local proof, without changing source code.
state._aiContext.provider = 'local-synthetic-fixture';
for (const strategy of input.views.slice(1)) addView(state, read(`overlay-${strategy.lens}.json`), strategy);
const outputs = [];
for (const strategy of input.views) {
  const selected = selectSavedView(state, strategy.lens);
  const artifact = buildProfileArtifacts(state, {persona: strategy.lens, origin: 'https://offline.example/', profileId: 'local-proof'});
  assert.equal(selected.profile.name, state.profile.name);
  assert.equal(selected.account.name, state.account.name);
  assert.equal(artifact.data.persona, strategy.lens);
  assert.ok(artifact.html.includes(selected.recommendations.items[0].title));
  // Verify the companion JSON can be edited/rendered independently, without UPG.
  const edited = JSON.parse(JSON.stringify(artifact.data.state));
  edited.insights.title = 'Local edit proof';
  const rerendered = buildProfileArtifacts(edited, {persona: strategy.lens, origin: 'https://offline.example/'});
  assert.notEqual(artifact.data.revision, rerendered.data.revision);
  outputs.push({strategy, artifact});
}
// Validate everything before creating output; never overwrite an existing directory.
fs.mkdirSync(path.resolve(directory), {recursive: false, mode: 0o700});
const save = (name, value) => fs.writeFileSync(path.join(directory, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', {flag:'wx', mode:0o600});
save('project.json', {schemaVersion:'upg.local-proof.v1', modeledData:true, payload:state});
const manifest = {schemaVersion:'upg.local-proof.manifest.v1', profileType:mode, modeledData:true,
  provenance:'Synthetic fixtures only; no website was researched and no images were generated.',
  canvas:{width:1600,height:900}, png:{width:1920,height:1080,status:'not-generated'},
  warnings:['Structural smoke test, not premium personalized output.', 'Portrait/logo/recommendation images are missing intentionally.'], views:[]};
for (const {strategy, artifact} of outputs) {
  const lens = strategy.lens;
  save(lens + '.html', artifact.html);
  save(lens + '.json', artifact.data);
  manifest.views.push({persona:lens, revision:artifact.data.revision, rendererVersion:artifact.data.rendererVersion,
    files:{html:lens+'.html',json:lens+'.json'}, assets:artifact.manifest.assets});
}
save('manifest.json', manifest);
console.log(`PASS: ${mode}, ${outputs.length} lenses, stable identity, selected-view rendering and local edit/revision checks. Files: ${path.resolve(directory)}. PNG NOT RUN; images intentionally absent.`);
