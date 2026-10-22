const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let JSDOM;
try { ({JSDOM} = require(process.env.UPG_JSDOM_PATH || 'jsdom')); } catch (_) {}
const domTest = (name, fn) => test(name,{skip:!JSDOM && 'Set UPG_JSDOM_PATH to a jsdom installation to run browser DOM checks'},fn);
const tick = () => new Promise(resolve => setTimeout(resolve,0));
const settle = async () => { for (let i=0;i<4;i++) await tick(); };
const source = fs.readFileSync(path.join(__dirname,'../js/feedback.js'),'utf8');
const row = {id:'a',name:'Jane',email:'jane@example.test',description:'A useful feature',category:'feature',status:'new',createdAt:'2026-10-21',readAt:'2026-10-21'};
async function fixture(overrides={}, initialEmail='', target='index.html') {
  const html = fs.readFileSync(path.join(__dirname,'..',target),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
  const dom = new JSDOM(html,{url:'https://upg.test/' + (target.startsWith('preview')?'preview-v2/':''),runScripts:'outside-only'}), w=dom.window;
  await new Promise(resolve => w.document.addEventListener('DOMContentLoaded',resolve,{once:true}));
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  const revoked=[]; let urlCount=0, email=initialEmail;
  w.URL.createObjectURL=()=> 'blob:test-'+(++urlCount); w.URL.revokeObjectURL=url=>revoked.push(url);
  const calls=[];
  w.fetch=async()=>({ok:true,json:async()=>({tool:'upg',version:'1.1.0',commit:'1234567890abcdef'})});
  w.SaasyAuth={getEmail:()=>email,isSignedIn:()=>!!email,getFeedbackSession:async()=>({email:email||null,admin:false}),listFeedback:async()=>({items:[],unreadCount:0,total:0,page:1,pageSize:25}),submitFeedback:async(payload,key)=>{calls.push({payload,key});return{id:'saved-42'};},...overrides};
  w.eval('var state={profileType:"b2c",customerURL:"https://secret.example",apiKey:"secret",project:{secret:true}}; var currentStep=0; function getProfileStrategy(){return {lens:"sales"};}');
  w.eval(source); await settle();
  const $=id=>w.document.getElementById(id),fill=()=>{$('feedback-name').value='Jane';$('feedback-email').value='jane@example.test';$('feedback-description').value='Please add duplicates';};
  const submit=()=>{$('feedback-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));};
  return {w,$,fill,submit,calls,revoked,setEmail:value=>{email=value;},close:()=>w.close()};
}
function images(f,{defer=false,blobSize=8}={}) {
  f.w.Image=class{constructor(){this.naturalWidth=2400;this.naturalHeight=1200;}set src(value){if(value)queueMicrotask(()=>this.onload());}};
  f.w.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){},drawImage(){}});
  const pending=[];
  f.w.HTMLCanvasElement.prototype.toBlob=function(callback){const finish=()=>callback(new f.w.Blob([new Uint8Array(blobSize)],{type:'image/jpeg'}));if(defer)pending.push(finish);else finish();};
  return pending;
}
function upload(f, files) {const input=f.$('feedback-files');Object.defineProperty(input,'files',{value:files,configurable:true});input.dispatchEvent(new f.w.Event('change'));}
function image(f,name='screen.png'){return new f.w.File(['picture'],name,{type:'image/png'});}
function adminFixture(overrides={}) {return fixture({getFeedbackSession:async tool=>{assert.equal(tool,'upg');return {email:'imansur@salesforce.com',admin:true};},...overrides},'imansur@salesforce.com');}

domTest('feedback opens accessibly in both editors and restores focus after close',async()=>{
  for (const target of ['index.html','preview-v2/index.html']) {
    const f=await fixture({},'',target);try{f.$('feedback-open').focus();f.$('feedback-open').click();assert.equal(f.$('feedback-dialog').open,true);assert.equal(f.$('feedback-dialog').getAttribute('aria-labelledby'),'feedback-title');assert.equal(f.w.document.activeElement.id,'feedback-category');f.$('feedback-dialog').querySelector('[data-feedback-close]').click();assert.equal(f.$('feedback-dialog').open,false);assert.equal(f.w.document.activeElement.id,'feedback-open');}finally{f.close();}
  }
});
domTest('guest submits once, waits for persistent acknowledgement and sends only explicit allowlisted context',async()=>{
  let done;const calls=[];const f=await fixture({submitFeedback:(payload,key)=>{calls.push({payload,key});return new Promise(resolve=>done=resolve);}});
  try{f.fill();f.submit();f.submit();assert.equal(calls.length,1);assert.equal(f.$('feedback-submit').disabled,true);assert.equal(f.$('feedback-success').hidden,true);assert.equal(calls[0].payload.tool,'upg');assert.deepEqual(Object.keys(calls[0].payload.context).sort(),['appName','appVersion','step']);assert.equal(calls[0].payload.context.step,'Customer · Individual · Sales');assert.equal(calls[0].payload.context.appVersion,'1.1.0 (1234567890ab)');assert.doesNotMatch(JSON.stringify(calls[0].payload),/secret|customerURL|apiKey/);done({id:'persisted-42'});await settle();assert.equal(f.$('feedback-success').hidden,false);assert.match(f.$('feedback-reference').textContent,/persisted-42/);f.$('feedback-done').click();assert.equal(f.$('feedback-description').value,'');}finally{f.close();}
});
domTest('ambiguous or failed saves preserve draft/key/context across retries and renew key on edits',async()=>{
  const calls=[];const f=await fixture({submitFeedback:async(payload,key)=>{calls.push({payload,key});if(calls.length===1)return {};throw Error('Offline');}});
  try{f.fill();f.submit();await settle();assert.equal(f.$('feedback-success').hidden,true);assert.match(f.$('feedback-message').textContent,/did not confirm/);f.w.eval('currentStep=5;state.profileType="b2b"');f.submit();await settle();assert.equal(calls[0].key,calls[1].key);assert.deepEqual(calls[0].payload.context,calls[1].payload.context);assert.equal(f.$('feedback-description').value,'Please add duplicates');f.$('feedback-description').value='Changed request';f.submit();await settle();assert.notEqual(calls[1].key,calls[2].key);assert.match(calls[2].payload.context.step,/Recommendations · Account/);}finally{f.close();}
});
domTest('known signed-in contact prefills; contact email never grants admin rights',async()=>{
  const f=await fixture({getName:()=> 'Known Person'},'jane@salesforce.com');try{f.$('feedback-open').click();assert.equal(f.$('feedback-name').value,'Known Person');assert.equal(f.$('feedback-email').value,'jane@salesforce.com');f.$('feedback-email').value='imansur@salesforce.com';await f.w.UPGFeedback.refreshSession(true);assert.equal(f.$('feedback-inbox-open').hidden,true);}finally{f.close();}
  const bad=await fixture({getFeedbackSession:async()=>({admin:true,email:'another@salesforce.com'})},'another@salesforce.com');try{assert.equal(bad.$('feedback-inbox-open').hidden,true);}finally{bad.close();}
});
domTest('account change clears contact/draft/filters and ignores late submission acknowledgements',async()=>{
  let done;const f=await fixture({submitFeedback:()=>new Promise(resolve=>done=resolve)},'jane@salesforce.com');try{f.fill();f.$('feedback-filter-category').value='bug';f.submit();f.setEmail('other@salesforce.com');await f.w.UPGFeedback.refreshSession();assert.equal(f.$('feedback-name').value,'');assert.equal(f.$('feedback-email').value,'');assert.equal(f.$('feedback-description').value,'');assert.equal(f.$('feedback-filter-category').value,'');assert.equal(f.$('feedback-submit').disabled,false);done({id:'private-previous-account'});await settle();assert.equal(f.$('feedback-success').hidden,true);assert.equal(f.$('feedback-reference').textContent,'');}finally{f.close();}
});
domTest('uploads compress before sending, allow removal, and revoke preview URLs',async()=>{
  const f=await fixture();try{const pending=images(f,{defer:true});upload(f,[image(f)]);await tick();assert.equal(f.$('feedback-submit').disabled,true);f.fill();f.submit();assert.equal(f.calls.length,0);pending.shift()();await settle();assert.equal(f.$('feedback-submit').disabled,false);assert.equal(f.$('feedback-previews').querySelectorAll('img').length,1);f.submit();await settle();assert.equal(f.calls[0].payload.attachments[0].type,'image/jpeg');assert.equal(f.calls[0].payload.attachments[0].name,'screen.jpg');assert.ok(f.calls[0].payload.attachments[0].data);f.$('feedback-done').click();assert.equal(f.$('feedback-previews').children.length,0);assert.ok(f.revoked.length>=2);upload(f,[image(f)]);await tick();pending.shift()();await settle();f.$('feedback-previews').querySelector('button').click();assert.equal(f.$('feedback-previews').children.length,0);}finally{f.close();}
});
domTest('paste/drop work, text paste remains native, unsupported/too-many/oversized results stay blocked',async()=>{
  const f=await fixture();try{images(f);const textPaste=new f.w.Event('paste',{cancelable:true});Object.defineProperty(textPaste,'clipboardData',{value:{items:[{kind:'string',type:'text/plain'}]}});f.$('feedback-dialog').dispatchEvent(textPaste);assert.equal(textPaste.defaultPrevented,false);
    const paste=new f.w.Event('paste',{cancelable:true});Object.defineProperty(paste,'clipboardData',{value:{items:[{kind:'file',type:'image/png',getAsFile:()=>image(f)}]}});f.$('feedback-dialog').dispatchEvent(paste);await settle();assert.equal(paste.defaultPrevented,true);assert.equal(f.$('feedback-previews').children.length,1);
    const drop=new f.w.Event('drop',{cancelable:true});Object.defineProperty(drop,'dataTransfer',{value:{files:[image(f,'drop.png')]}});f.$('feedback-drop').dispatchEvent(drop);await settle();assert.equal(f.$('feedback-previews').children.length,2);upload(f,[image(f),image(f)]);await settle();assert.match(f.$('feedback-message').textContent,/up to 3/);assert.equal(f.$('feedback-previews').children.length,2);
    upload(f,[new f.w.File(['svg'],'bad.svg',{type:'image/svg+xml'})]);await settle();assert.match(f.$('feedback-message').textContent,/PNG, JPEG, or WebP/);images(f,{blobSize:1024*1024+1});upload(f,[image(f)]);await settle();assert.match(f.$('feedback-message').textContent,/could not fit within 1 MB/);assert.equal(f.$('feedback-previews').children.length,2);
  }finally{f.close();}
});
domTest('late compression cannot repopulate screenshots or messages after signout',async()=>{
  const f=await fixture({},'jane@salesforce.com');try{const pending=images(f,{defer:true});upload(f,[image(f)]);await tick();f.setEmail('');await f.w.UPGFeedback.refreshSession();assert.ok(f.revoked.includes('blob:test-1'));pending.shift()();await settle();assert.equal(f.$('feedback-previews').children.length,0);assert.equal(f.$('feedback-message').textContent,'');assert.equal(f.$('feedback-submit').disabled,false);}finally{f.close();}
});
domTest('admin filters, pagination, details, read/status/attachment/delete calls always carry upg',async()=>{
  const queries=[],updates=[],details=[],attachments=[],deletes=[];let deleted=false;
  const f=await adminFixture({listFeedback:async query=>{queries.push(query);return {items:deleted?[]:[row],total:deleted?25:26,unreadCount:2,pageSize:25};},getFeedback:async(id,tool)=>{details.push(tool);return{feedback:{...row,readAt:null,description:'<b>literal</b>',attachments:[{id:'image',name:'screen.jpg'}]}};},updateFeedback:async(id,patch,tool)=>{updates.push({patch,tool});},getFeedbackAttachment:async(id,aid,tool)=>{attachments.push(tool);return new f.w.Blob(['img'],{type:'image/jpeg'});},deleteFeedback:async(id,tool)=>{deletes.push(tool);deleted=true;}});
  try{assert.equal(f.$('feedback-inbox-open').hidden,false);assert.equal(f.$('feedback-unread').textContent,'2');f.$('feedback-inbox-open').click();await settle();f.$('feedback-next').click();await settle();assert.equal(queries.at(-1).page,2);f.$('feedback-filter-category').value='bug';f.$('feedback-filter-category').dispatchEvent(new f.w.Event('change'));await settle();assert.equal(queries.at(-1).page,1);assert.equal(queries.at(-1).category,'bug');f.$('feedback-filter-status').value='reviewing';f.$('feedback-filter-status').dispatchEvent(new f.w.Event('change'));await settle();assert.equal(queries.at(-1).status,'reviewing');f.$('feedback-next').click();await settle();f.$('feedback-inbox-list').querySelector('button').click();await settle();assert.equal(f.$('feedback-inbox-detail').querySelector('b'),null);assert.match(f.$('feedback-inbox-detail').textContent,/<b>literal<\/b>/);assert.equal(updates[0].patch.read,true);assert.equal(f.$('feedback-unread').textContent,'1');const status=f.$('feedback-detail-status');status.value='completed';status.dispatchEvent(new f.w.Event('change'));await settle();assert.equal(updates.at(-1).patch.status,'completed');assert.equal(f.$('feedback-inbox-detail').querySelectorAll('img').length,1);f.w.confirm=()=>false;f.$('feedback-delete').click();await settle();assert.equal(deletes.length,0);f.w.confirm=()=>true;f.$('feedback-delete').click();await settle();assert.equal(deletes.length,1);assert.equal(queries.at(-1).page,1);assert.ok(queries.every(query=>query.tool==='upg'));assert.ok(updates.every(item=>item.tool==='upg'));assert.deepEqual(details,['upg']);assert.deepEqual(attachments,['upg']);assert.deepEqual(deletes,['upg']);assert.ok(f.revoked.length);}finally{f.close();}
});
domTest('stale detail/attachments and status writes cannot render after account changes',async()=>{
  let detailDone;const f=await adminFixture({listFeedback:async()=>({items:[row],total:1,unreadCount:1}),getFeedback:()=>new Promise(resolve=>detailDone=resolve)});
  try{f.$('feedback-inbox-open').click();await settle();f.$('feedback-inbox-list').querySelector('button').click();await tick();f.setEmail('other@salesforce.com');f.w.SaasyAuth.getFeedbackSession=async()=>({admin:false,email:'other@salesforce.com'});await f.w.UPGFeedback.refreshSession();detailDone({feedback:{...row,description:'PRIVATE',attachments:[]}});await settle();assert.equal(f.$('feedback-inbox-detail').textContent,'');assert.equal(f.$('feedback-inbox-list').textContent,'');assert.equal(f.$('feedback-inbox-open').hidden,true);assert.equal(f.$('feedback-inbox-dialog').open,false);}finally{f.close();}
  let attachmentDone;const a=await adminFixture({listFeedback:async()=>({items:[row],total:1,unreadCount:0}),getFeedback:async()=>({feedback:{...row,attachments:[{id:'photo',name:'private.png'}]}}),getFeedbackAttachment:()=>new Promise(resolve=>attachmentDone=resolve)});
  try{a.$('feedback-inbox-open').click();await settle();a.$('feedback-inbox-list').querySelector('button').click();await settle();a.setEmail('');a.w.SaasyAuth.getFeedbackSession=async()=>({admin:false});await a.w.UPGFeedback.refreshSession();attachmentDone(new a.w.Blob(['secret'],{type:'image/png'}));await settle();assert.equal(a.$('feedback-inbox-detail').textContent,'');assert.equal(a.$('feedback-inbox-detail').querySelectorAll('img').length,0);}finally{a.close();}
});
domTest('expired in-flight admin requests clear private content and service failures can retry',async()=>{
  let fail;const f=await adminFixture({listFeedback:async()=>({items:[row],total:1,unreadCount:0}),getFeedback:async()=>({feedback:{...row,attachments:[]}}),updateFeedback:()=>new Promise((_,reject)=>fail=reject)});
  try{f.$('feedback-inbox-open').click();await settle();f.$('feedback-inbox-list').querySelector('button').click();await settle();const status=f.$('feedback-detail-status');status.value='completed';status.dispatchEvent(new f.w.Event('change'));f.setEmail('');f.w.SaasyAuth.getFeedbackSession=async()=>({admin:false});fail(Object.assign(new Error('invalid_token'),{code:'invalid_token'}));await settle();assert.equal(f.$('feedback-inbox-detail').textContent,'');assert.equal(f.$('feedback-inbox-dialog').open,false);}finally{f.close();}
  let tries=0;const g=await fixture({getFeedbackSession:async()=>{if(++tries===1)throw new TypeError('Offline');return{admin:true,email:'imansur@salesforce.com'};}},'imansur@salesforce.com');try{assert.equal(g.$('feedback-inbox-open').hidden,true);g.w.dispatchEvent(new g.w.Event('focus'));await settle();assert.equal(g.$('feedback-inbox-open').hidden,false);}finally{g.close();}
});
domTest('pagehide clears private content and pageshow revalidates admin access',async()=>{
  let sessions=0;const f=await adminFixture({getFeedbackSession:async()=>{sessions++;return{admin:true,email:'imansur@salesforce.com'};},listFeedback:async()=>({items:[row],total:1,unreadCount:1})});
  try{f.$('feedback-inbox-open').click();await settle();f.$('feedback-name').value='Private name';f.w.dispatchEvent(new f.w.Event('pagehide'));assert.equal(f.$('feedback-name').value,'');assert.equal(f.$('feedback-inbox-list').textContent,'');assert.equal(f.$('feedback-inbox-open').hidden,true);const prior=sessions;f.w.dispatchEvent(new f.w.Event('pageshow'));await settle();assert.equal(sessions,prior+1);assert.equal(f.$('feedback-inbox-open').hidden,false);}finally{f.close();}
});
domTest('closing the inbox clears its private contents but keeps the unread toolbar badge',async()=>{
  const f=await adminFixture({listFeedback:async()=>({items:[row],total:1,unreadCount:3})});
  try{f.$('feedback-inbox-open').click();await settle();assert.equal(f.$('feedback-unread').textContent,'3');f.$('feedback-inbox-dialog').close();assert.equal(f.$('feedback-inbox-list').textContent,'');assert.equal(f.$('feedback-unread').textContent,'3');}finally{f.close();}
});
domTest('expired JWT with retained account email preserves draft/images/idempotency and revokes inbox access',async()=>{
  let signed=true,sessions=0;const calls=[];
  const f=await adminFixture({isSignedIn:()=>signed,getFeedbackSession:async()=>{sessions++;return{admin:signed,email:signed?'imansur@salesforce.com':null};},submitFeedback:async(payload,key)=>{calls.push({payload,key});if(calls.length===1){signed=false;throw Object.assign(new Error('invalid_token'),{code:'invalid_token'});}return{id:'persisted-after-retry'};}});
  try{images(f);f.$('feedback-open').click();f.fill();upload(f,[image(f)]);await settle();assert.equal(f.$('feedback-inbox-open').hidden,false);const prior=sessions;f.submit();await settle();assert.equal(f.$('feedback-description').value,'Please add duplicates');assert.equal(f.$('feedback-name').value,'Jane');assert.equal(f.$('feedback-email').value,'jane@example.test');assert.equal(f.$('feedback-previews').querySelectorAll('img').length,1);assert.equal(f.$('feedback-submit').disabled,false);assert.equal(f.$('feedback-success').hidden,true);assert.match(f.$('feedback-message').textContent,/sign-in has expired/);assert.equal(f.$('feedback-inbox-open').hidden,true);assert.equal(f.$('feedback-inbox-list').textContent,'');assert.ok(sessions>prior);f.submit();await settle();assert.equal(calls[0].key,calls[1].key);assert.deepEqual(calls[0].payload,calls[1].payload);assert.equal(f.$('feedback-success').hidden,false);}finally{f.close();}
});
