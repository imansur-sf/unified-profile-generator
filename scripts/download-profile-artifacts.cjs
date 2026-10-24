// Claude/local integrations: credentials belong in the environment, not prompts,
// filenames, generated presentations, URLs, or command-line arguments.
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const personas = ['sales','service','marketing','success','custom'];
function originURL(raw){
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('UPG_ORIGIN must be an HTTPS origin without credentials or a path.');
  return url.origin;
}
async function downloadArtifacts({origin,key,profileId,persona,skipPng=false,outputDir,fetchImpl=fetch}){
  origin=originURL(origin);
  if(!key||typeof key!=='string'||/[\r\n]/.test(key))throw Error('Set UPG_API_KEY in the environment.');
  if(!/^\d+$/.test(profileId||''))throw Error('Provide a numeric --profile-id.');
  if(persona!==undefined&&!personas.includes(persona))throw Error('Invalid persona.');
  const base='/integrations/v1/upg/profiles/'+profileId+'/artifacts';
  async function get(relative,limit){
    const response=await fetchImpl(origin+relative,{headers:{'X-API-Key':key},redirect:'error',signal:AbortSignal.timeout(30000)});
    if(!response.ok){const error=await response.json().catch(()=>({}));throw Error('Artifact download failed ('+response.status+'): '+(/^[a-z_]+$/.test(error.error||'')?error.error:'request_failed'));}
    const chunks=[];let bytes=0;
    try{for await(const chunk of response.body){bytes+=chunk.byteLength;if(bytes>limit)throw Error('Artifact exceeds the download limit.');chunks.push(Buffer.from(chunk));}}
    catch(error){await response.body?.cancel?.().catch(()=>{});throw error;}
    return {bytes:Buffer.concat(chunks),headers:response.headers};
  }
  const manifest=JSON.parse((await get(base+(persona?'?persona='+persona:''),65536)).bytes.toString('utf8'));
  if(manifest.schemaVersion!=='upg.artifacts.v1'||manifest.profileId!==profileId||!personas.includes(manifest.persona)||!/^art_[a-f0-9]{40}$/.test(manifest.revision)||persona&&manifest.persona!==persona)throw Error('Unexpected artifact manifest.');
  if(!skipPng&&!manifest.capture?.available)throw Error('Hosted PNG capture is not configured. Use --skip-png to download editable HTML/JSON only.');
  if(!skipPng&&!manifest.assets?.selfContained)throw Error('The saved view has external images. Embed them first or use --skip-png.');
  const files=[];
  for(const format of skipPng?['html','json']:['html','json','png']){
    const relative=manifest.downloads?.[format];
    const url=new URL(relative,origin);
    const query=url.searchParams;
    if(typeof relative!=='string'||!relative.startsWith('/')||url.origin!==origin||url.hash||url.pathname!==base+'/'+format||query.getAll('persona').length!==1||query.get('persona')!==manifest.persona||query.getAll('revision').length!==1||query.get('revision')!==manifest.revision||[...query.keys()].some(key=>!['persona','revision'].includes(key)))throw Error('Unsafe artifact download reference.');
    const downloaded=await get(url.pathname+url.search,format==='png'?8*1024*1024:24*1024*1024);
    if(downloaded.headers.get('x-upg-artifact-revision')!==manifest.revision)throw Error('Artifact revision mismatch.');
    if(format==='json'){
      const data=JSON.parse(downloaded.bytes.toString('utf8'));
      if(data.schemaVersion!=='upg.presentation.v1'||data.revision!==manifest.revision)throw Error('Unexpected profile JSON.');
    }
    if(format==='png'&&(downloaded.bytes.length<24||downloaded.bytes.toString('hex',0,8)!=='89504e470d0a1a0a'||downloaded.bytes.readUInt32BE(16)!==1920||downloaded.bytes.readUInt32BE(20)!==1080))throw Error('Unexpected PNG dimensions or format.');
    files.push({name:'profile.'+format,bytes:downloaded.bytes});
  }
  // Do not overwrite an existing project or leave a misleading half-download
  // when the service is unavailable: create the new output folder only now.
  const directory=path.resolve(outputDir||'upg-artifacts-'+Date.now());
  await fs.mkdir(directory,{mode:0o700});
  for(const file of files)await fs.writeFile(path.join(directory,file.name),file.bytes,{flag:'wx',mode:0o600});
  await fs.writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
  return {directory,revision:manifest.revision,files:files.map(file=>file.name)};
}
async function main(){
  const options={},args=process.argv.slice(2);
  for(let i=0;i<args.length;i++){
    if(args[i]==='--skip-png'){options.skipPng=true;continue;}
    const key={'--profile-id':'profileId','--persona':'persona','--output':'outputDir'}[args[i]];
    if(!key||!args[i+1]||args[i+1].startsWith('--'))throw Error('Usage: node scripts/download-profile-artifacts.cjs --profile-id ID [--persona service] [--output NEW_FOLDER] [--skip-png]');
    options[key]=args[++i];
  }
  const result=await downloadArtifacts({...options,origin:process.env.UPG_ORIGIN,key:process.env.UPG_API_KEY});
  console.log('Downloaded '+result.files.join(', ')+' to '+result.directory+' ('+result.revision+').');
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={downloadArtifacts};
