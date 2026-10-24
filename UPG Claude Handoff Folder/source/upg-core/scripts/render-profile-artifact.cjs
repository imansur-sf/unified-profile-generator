// Local re-capture after Claude edits a downloaded HTML copy. Never calls UPG.
'use strict';
const fs=require('node:fs/promises');
const {createProfileCapture}=require('../lib/profile-capture');
async function main(){
  const args=process.argv.slice(2);
  if(args.length!==4||args[0]!=='--html'||args[2]!=='--output')throw Error('Usage: node scripts/render-profile-artifact.cjs --html profile.html --output NEW_FILE.png');
  const info=await fs.stat(args[1]);
  if(!info.isFile()||info.size>24*1024*1024)throw Error('HTML input must be a file at most 24 MiB.');
  const html=await fs.readFile(args[1],'utf8');
  const {png}=await createProfileCapture().capture(html);
  await fs.writeFile(args[3],png,{flag:'wx',mode:0o600});
  console.log('Saved 1920x1080 local capture to '+args[3]+'. The cloud project was not changed.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
