'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const {getRuntime} = require('../source/upg-core/lib/profile-runtime');
const [mode, directory] = process.argv.slice(2);
if (!['b2c','b2b'].includes(mode) || !directory || process.argv.length !== 4) throw Error('Usage: node tools/emit-prompts.cjs b2c|b2b NEW_OUTPUT_DIRECTORY');
const read = name => JSON.parse(fs.readFileSync(path.join(root,'examples',name)));
const input = read(`request-${mode}.json`), source = read(`source-${mode}.json`), base = read(`base-${mode}.json`);
const runtime = getRuntime();
const files = {'system.txt':runtime.prompts.getSystemPrompt(mode)};
files['images-base.json'] = JSON.stringify(runtime.images.buildImagePrompts(base,mode,input.views[0]),null,2);
files['base-sales.txt'] = runtime.prompts.buildUserPrompt(source,{profileType:mode,strategy:input.views[0]});
for (const strategy of input.views) {
  if (strategy.lens !== 'sales') files[`overlay-${strategy.lens}.txt`] = runtime.prompts.buildPersonaOverlayPrompt(source,base,{profileType:mode,strategy});
  const data = strategy.lens === 'sales' ? base : read(`overlay-${strategy.lens}.json`);
  files[`images-${strategy.lens}.json`] = JSON.stringify(runtime.images.buildRecommendationImagePrompts({brandName:base.brandName,industry:base.industry,profileType:mode,recommendations:data.recommendations.items,strategy}),null,2);
}
fs.mkdirSync(path.resolve(directory),{recursive:false,mode:0o700});
for (const [name,value] of Object.entries(files)) fs.writeFileSync(path.join(directory,name),value,{flag:'wx',mode:0o600});
console.log(`Emitted ${Object.keys(files).length} original-engine prompt files. No model, research or image generation was performed.`);
