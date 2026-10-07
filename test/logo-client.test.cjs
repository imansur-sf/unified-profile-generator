const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function client(fetch, extract = () => ({})) {
  const context = vm.createContext({
    window: { UPG_Shared: { normalizeURL: value => value, extractCoreHTML: extract } },
    localStorage: { getItem: () => '' }, fetch, console, URL, Date, AbortController, setTimeout, clearTimeout
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/localai.js'),'utf8'),context);
  return context.window.LocalAI;
}
test('remote logos use the GET normalization endpoint', async () => {
  let requested;
  const api=client(async (url,options)=>{requested={url,options};return new Response(JSON.stringify({imageData:'data:image/png;base64,cG5n'}));});
  assert.equal((await api.embedBrandImage('https://brand.example/logo.svg')).imageData,'data:image/png;base64,cG5n');
  assert.equal(requested.url,'/api/brand-image?url=https%3A%2F%2Fbrand.example%2Flogo.svg');
});
test('legacy embedded SVG and ICO use bounded POST instead of putting image data in a URL', async () => {
  for(const mime of ['svg+xml','x-icon','vnd.microsoft.icon']) {
    let requested;
    const api=client(async (url,options)=>{requested={url,options};return new Response(JSON.stringify({imageData:'data:image/png;base64,cG5n'}));});
    const imageData=`data:image/${mime};base64,b2xk`;
    await api.embedBrandImage(imageData);
    assert.equal(requested.url,'/api/brand-image');assert.equal(requested.options.method,'POST');
    assert.deepEqual(JSON.parse(requested.options.body),{imageData});
  }
});
test('existing embedded raster images need no conversion request', async () => {
  const api=client(async()=>assert.fail('No request for existing PNG'));
  assert.equal((await api.embedBrandImage('data:image/png;base64,cG5n')).imageData,'data:image/png;base64,cG5n');
});
test('relative logo discovery uses the final website URL after redirects', async () => {
  let extracted;
  const api=client(async()=>new Response('<html><head><title>Customer website title</title></head></html>',{headers:{'content-type':'text/plain','x-scraper-url':'https://www.brand.example/en/'}}), (html,url)=>{extracted={html,url};return {url,logoCandidates:['https://www.brand.example/en/logo.svg']};});
  const result=await api.collectCustomerContext('https://brand.example/');
  assert.equal(extracted.url,'https://www.brand.example/en/');
  assert.equal(result.url,'https://brand.example/'); // preserve entered customer identity
  assert.equal(result.scraped.logoCandidates[0],'https://www.brand.example/en/logo.svg');
});
