'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {selectSavedView, renderSavedProfile} = require('./profile-runtime');
const {canonicalJSON} = require('../js/profile-contract');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const rendererVersion = 'upg-' + hash(['js/generator.js','js/defaults.js','js/profile-contract.js','lib/profile-runtime.js', 'lib/profile-artifacts.js'].map(file => fs.readFileSync(path.join(__dirname,'..',file),'utf8')).join('\n')).slice(0,16);
const record = keys => Object.fromEntries(keys.split(' ').map(key => [key,true]));
const item = record('id icon label value visible');
const moduleCard = {...record('title icon moduleId origin placement visibility'),items:[item]};
// This is a render-data schema, not a recursive copy of saved browser state.
// Unknown properties, credentials, local settings and other personas never pass.
const schema = {
  ...record('schemaVersion brandName appName tabName logo userAvatar userName profileType accountViewTab'),
  colors:record('primary accent secondary menu menuText pageBg'), navLinks:[true],
  profile:record('name city customerId email parentEmail secondaryEmail secondaryEmailLabel secondaryEmailInclude phone address segment photo'),
  loyalty:record('title memberId tier points redeemedPoints'),
  account:record('name headquarters accountId industry type owner website employees address tier parentAccount logo'),
  accountMetrics:record('revenue revenueTrend pipeline usageScore usageTrend activeUsers healthScore healthTrend supportCases renewalDate utilization'),
  profileStrategy:record('lens objective customRole'),
  insights:{title:true,items:[item]}, preferences:{...record('title icon'),items:[item]},
  events:{...record('title icon'),items:[record('name date confirmation')]},
  membership:{...record('title icon'),items:[item]},
  affinities:{...record('title includeAggregate'),seriesA:record('label color'),seriesB:record('label color'),groups:[{name:true,items:[record('label a b')]}]},
  recommendations:{title:true,items:[record('eyebrow title cta image imageSource imageForTitle')]},
  activity:{title:true,items:[record('icon title body time')]},
  railFields:[item],extraCards:[moduleCard],rightExtraCards:[moduleCard],
  b2cSections:record('affinities preferences events membership recommendations activity'),
  b2bSections:record('overviewMetrics overviewDetails overviewSignals peopleStakeholders salesProducts salesActions successInsights relatedActivity'),
  layout:record('leftColWidth middleColWidth rightColWidth accountRailWidth actionRailWidth')
};
function project(value, spec) {
  if (spec === true) return value === null || ['string','number','boolean'].includes(typeof value) ? value : undefined;
  if (Array.isArray(spec)) {
    if (!Array.isArray(value)) return undefined;
    if (value.length > 500) throw Object.assign(Error('artifact_data_limit'),{code:'artifact_data_limit',status:413});
    return value.map(item => project(item,spec[0])).filter(item => item !== undefined);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const result = {};
  for (const [key, shape] of Object.entries(spec)) {
    if (!Object.prototype.hasOwnProperty.call(value,key)) continue;
    const clean = project(value[key],shape);
    if (clean !== undefined) result[key] = clean;
  }
  return result;
}
function buildProfileArtifacts(payload,{persona,origin,profileId,captureAvailable=false}={}) {
  const state = project(selectSavedView(payload,persona),schema);
  const rendered = renderSavedProfile(state,{origin});
  // Include actual HTML bytes: embedded bundled image updates must invalidate
  // an old manifest even when no saved data or renderer source changed.
  const revision = 'art_' + hash(rendererVersion+'\n'+canonicalJSON(state)+'\n'+rendered.html).slice(0,40);
  const selected = rendered.persona;
  const query = '?persona='+encodeURIComponent(selected)+'&revision='+revision;
  const base = '/integrations/v1/upg/profiles/'+encodeURIComponent(profileId)+'/artifacts';
  const externalImages = (rendered.html.match(/<img\b[^>]*\bsrc="(?!data:)[^"]+"/gi)||[]).length;
  const missingRecommendations = (state.recommendations?.items||[]).filter(item => !item.image).length;
  const manifest = {
    schemaVersion:'upg.artifacts.v1',profileId:String(profileId),persona:selected,revision,rendererVersion,
    subject:rendered.subject,profileType:state.profileType,
    canvas:{width:1600,height:900},image:{width:1920,height:1080,mimeType:'image/png'},
    assets:{selfContained:externalImages===0,externalImages,missingRecommendationImages:missingRecommendations},
    downloads:{html:base+'/html'+query,json:base+'/json'+query,png:base+'/png'+query},
    capture:{available:Boolean(captureAvailable),mode:'on-demand',...(!captureAvailable?{error:'capture_not_configured'}:{})},
    authentication:{header:'X-API-Key',note:'Fetch paths from the UPG origin with your key in the header, never the URL. Download files before publishing a presentation.'},
    editableCopy:{scope:'local-only',note:'HTML edits require a new local screenshot. JSON contains selected render data, not a full cloud-project backup. No local edit is saved back automatically.'},
    modeledData:true
  };
  return {manifest,html:rendered.html,data:{schemaVersion:'upg.presentation.v1',revision,rendererVersion,persona:selected,state}};
}
module.exports = {buildProfileArtifacts,rendererVersion};
