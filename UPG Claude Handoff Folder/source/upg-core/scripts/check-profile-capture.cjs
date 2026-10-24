// Opt-in local real-browser smoke test. No AI, cloud projects or network calls.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const {getRuntime} = require('../lib/profile-runtime');
const {buildProfileArtifacts} = require('../lib/profile-artifacts');
const {createProfileCapture} = require('../lib/profile-capture');
async function main(){
  const capture = createProfileCapture();
  assert.ok(capture.available,'Set UPG_CAPTURE_EXECUTABLE_PATH to an approved local Chromium executable.');
  const image='data:image/png;base64,'+(await sharp({create:{width:400,height:220,channels:3,background:'#075dcc'}}).png().toBuffer()).toString('base64');
  for(const mode of ['b2c','b2b']){
    const state = getRuntime().cloneProfileMode(mode,'generic');
    state.brandName='Capture verification';state.profile.photo=image;state.logo=image;
    state.recommendations.items.forEach(item=>item.image=image);
    if(mode==='b2b'){state.account.logo=image;state.accountViewTab='sales';}
    const artifact=buildProfileArtifacts(state,{origin:'https://upg.example',profileId:'1',captureAvailable:true});
    assert.equal(artifact.manifest.assets.selfContained,true);
    const result=await capture.capture(artifact.html);
    const meta=await sharp(result.png).metadata();
    assert.equal(meta.width,1920);assert.equal(meta.height,1080);
    const stats=await sharp(result.png).stats();assert.ok(stats.channels.some(channel=>channel.stdev>20),'Screenshot must contain rendered UI, not a blank canvas.');
    if(process.env.UPG_CAPTURE_OUTPUT_DIR)await fs.writeFile(path.join(process.env.UPG_CAPTURE_OUTPUT_DIR,'upg-artifact-'+mode+'.png'),result.png);
    console.log('PASS '+mode+': real sandboxed Chromium, inline images, 1920x1080 nonblank PNG, no browser network.');
    if(mode==='b2c'){
      const edited=await capture.capture(artifact.html.replaceAll(state.profile.name,'Edited locally by Claude'));
      assert.equal(edited.png.equals(result.png),false);
      console.log('PASS local HTML edit produces a new PNG without calling UPG or AI.');
    }
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
