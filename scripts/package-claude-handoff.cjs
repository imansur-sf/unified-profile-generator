'use strict';
// Explicit source allowlist only. Mechanical copies + generated synthetic fixtures.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const destination = path.join(root,'UPG Claude Handoff Folder');
const files = [
  'js/defaults.js','js/generator.js','js/profile-contract.js','js/brand-logo.js','js/pagehost.js','js/localai.js',
  'lib/profile-runtime.js','lib/generation-pipeline.js','lib/profile-artifacts.js','lib/profile-capture.js','lib/safe-fetch.js','lib/brand-image.js',
  'assets/tony-robbins-workshop-v1.jpg','assets/tony-robbins-coaching-v1.jpg',
  'scripts/render-profile-artifact.cjs','scripts/check-profile-capture.cjs',
  'test/profile-artifacts.test.cjs','test/profile-capture.test.cjs','test/server-generation.test.cjs'
];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const manifest = {schemaVersion:'upg.handoff.source.v1', sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(), files:[]};
for (const relative of files) {
  const bytes = fs.readFileSync(path.join(root,relative));
  const targetRelative = 'source/upg-core/'+relative;
  const target = path.join(destination,targetRelative);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  if (fs.existsSync(target) && !bytes.equals(fs.readFileSync(target))) throw Error('Refusing to overwrite modified source snapshot: '+relative);
  fs.copyFileSync(path.join(root,relative),target);
  manifest.files.push({source:relative,destination:targetRelative,bytes:bytes.length,sha256:hash(bytes)});
}
const save = (relative,value) => {
  const target = path.join(destination,relative);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,JSON.stringify(value,null,2)+'\n');
};
save('SOURCE-MANIFEST.json',manifest);
const lenses = ['sales','service','marketing','success','custom'];
const objectives = ['convert','resolve','engage','retain','engage'];
const briefs = ['Include call coaching and future-event propensity.','Reschedule a family assessment; resolve access friction.','Recommend an opted-in event campaign.','Improve adoption and renewal readiness.','Explain modeled invoice exposure for Finance.'];
function content(lens) {
  return {
    insights:{title:`${lens} insights`,items:[{label:`${lens} priority`,value:'Modeled demo signal'}]},
    affinities:{title:`${lens} signals`,seriesA:{label:'Recent intent',color:'#0B5CAB'},seriesB:{label:'Historical interest',color:'#00A1E0'},groups:[{name:`${lens} focus`,items:[{label:'Guided sessions',a:72,b:48},{label:'Resource usage',a:54,b:61}]}]},
    preferences:{title:`${lens} preferences`,items:[{label:'Preferred channel',value:'Email (fictional consent)'}]},
    events:{title:`${lens} touchpoints`,items:[{name:`${lens} planning session`,date:'Demo timeline',confirmation:'Synthetic event'}]},
    membership:{title:`${lens} program`,items:[{label:'Status',value:'Modeled active membership'}]},
    recommendations:{title:`${lens} recommendations`,items:[{eyebrow:'Next best action',title:`${lens}: ${briefs[lenses.indexOf(lens)]}`,cta:'Review plan',image:''},{eyebrow:'Recommended',title:`${lens}: Send a relevant guided resource`,cta:'View resource',image:''}]},
    activity:{title:`${lens} activity`,items:[{icon:'📋',title:`${lens} review requested`,body:'Fictional demo activity, not a live CRM record.',time:'Demo timeline'}]},
    railFields:[{icon:'🎟️',label:'Events attended',value:'3 (synthetic)',visible:true},{icon:'📈',label:'Future attendance propensity',value:'72% (modeled)',visible:true}],
    extraCards:[{title:lens==='custom'?'Finance exposure summary':lens==='sales'?'Call coaching summary':`${lens} context`,icon:'📋',items:[{label:'Suggested focus',value:briefs[lenses.indexOf(lens)]}]}],rightExtraCards:[]
  };
}
for (const lens of lenses.slice(1)) save(`examples/overlay-${lens}.json`,content(lens));
for (const mode of ['b2c','b2b']) {
  const input = {url:'https://northstar.example/',profileType:mode,views:lenses.map((lens,index)=>({lens,objective:objectives[index],brief:briefs[index],customRole:lens==='custom'?'Finance':''})),includeImages:false,tier:'balanced',projectName:'Northstar synthetic proof'};
  const base = {...content('sales'),brandName:'Northstar Demo',appName:'Data Cloud',industry:'generic',colors:{primary:'#0B5CAB',secondary:'#F1F7FF'},
    profile:{name:'Alex Morgan (fictional)',city:'Demo City',customerId:'DEMO-001',email:'alex@person.example',phone:'Not supplied',address:'Synthetic demo address',segment:'Modeled member'},
    account:{name:'Northstar Example Account',headquarters:'Demo City',accountId:'DEMO-ACC-001',industry:'Education services (synthetic)',type:'Demo customer',owner:'Demo account team',website:'northstar.example',employees:'120 (modeled)',tier:'Demo tier'},
    accountMetrics:{revenue:'$120,000 (modeled)',pipeline:'$20,000 (modeled)',usageScore:'72',healthScore:'80',supportCases:'1 demo case',renewalDate:'Demo renewal date'},
    loyalty:{title:'Demo membership',memberId:'DEMO-MEMBER-001',tier:'Demo tier',points:'100 (modeled)',redeemedPoints:'0'}};
  save(`examples/request-${mode}.json`,input);
  save(`examples/base-${mode}.json`,base);
  save(`examples/source-${mode}.json`,{url:input.url,title:'Northstar fictional company',description:'Synthetic context for offline verification, not researched facts.',siteName:'Northstar Demo',headings:'Programs and guided support',bodyText:'This fictional example offers educational programs, family assessments and guided resources. No public website was fetched.',navLinkCandidates:[],logoCandidates:[],favicon:''});
}
console.log(`Copied ${files.length} allowlisted source files and generated offline fixtures at ${destination}.`);
if (process.argv.includes('--zip')) {
  function walk(directory) {
    return fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(entry=>{
      if (entry.isSymbolicLink()) throw Error('No symlinks allowed in handoff');
      const target = path.join(directory,entry.name);
      if (entry.name === '.DS_Store') return [];
      if (/^(node_modules|\.git|\.env.*)$/i.test(entry.name)) throw Error('Forbidden package entry: '+entry.name);
      return entry.isDirectory() ? walk(target) : [path.relative(destination,target)];
    });
  }
  const kitFiles = walk(destination).filter(relative=>relative!=='PACKAGE-MANIFEST.json');
  save('PACKAGE-MANIFEST.json',{schemaVersion:'upg.handoff.package.v1',files:kitFiles.map(relative=>{
    const bytes=fs.readFileSync(path.join(destination,relative));
    return {path:relative,bytes:bytes.length,sha256:hash(bytes)};
  })});
  const temp=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'upg-handoff-zip-'));
  const archive=path.join(temp,'UPG Claude Handoff.zip');
  execFileSync('zip',['-q',archive,...walk(destination).map(relative=>path.join(path.basename(destination),relative))],{cwd:root});
  fs.copyFileSync(archive,path.join(root,'UPG Claude Handoff.zip'));
  console.log('Created UPG Claude Handoff.zip with package checksums.');
}
