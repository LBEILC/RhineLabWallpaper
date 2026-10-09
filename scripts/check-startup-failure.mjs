// Run after build:wallpaper; pass --web after a regular build to check the entry gate.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';

const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const web=process.argv.includes('--web');
const root=resolve(web?'dist':'release/wallpaper');
const output=resolve('verification/startup-failure');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml','.json':'application/json'};
const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');
  const file=resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
  if(!file.startsWith(root+sep))throw Error('path');
  let body=await readFile(file);
  if(!web && extname(file)==='.html') body=Buffer.from(body.toString().replace('</head>',`<script>wallpaperPropertyListener.applyUserProperties({language:{value:'${url.searchParams.get('en')?'en-US':'zh-CN'}'},boot:{value:false},load3donstartup:{value:${url.searchParams.get('three')!=='off'}},sound:{value:false},music:{value:false},superperformance:{value:true}})</script></head>`));
  res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'}).end(body);
}catch{res.writeHead(404).end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
await mkdir(output,{recursive:true});
let browser;
const results=[];
try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const cases=web?['baseline','font-missing','model-missing','webgl-unavailable']:
    ['baseline','font-missing','font-missing-2d','font-timeout','font-sync-error','model-missing','model-corrupt','label-decode','webgl-unavailable','model-missing-en'];
  for(const name of cases){
    const page=await browser.newPage({viewport:{width:1280,height:720},serviceWorkers:'block'});
    const warnings=[],errors=[];let injected=0;
    page.on('console',m=>{if(m.type()==='warning')warnings.push(m.text())});
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{window.wallpaperRegisterAudioListener=()=>{}});
    if(name.startsWith('font-missing'))await page.route('**/*.woff2',r=>{injected++;return r.fulfill({status:404,body:''})});
    if(name==='font-timeout')await page.addInitScript(()=>{document.fonts.load=()=>new Promise(()=>{})});
    if(name==='font-sync-error')await page.addInitScript(()=>{document.fonts.load=()=>{throw Error('Injected font failure')}});
    if(name.startsWith('model-'))await page.route('**/archive-cassette*.glb',r=>{injected++;return r.fulfill({status:name==='model-corrupt'?200:404,body:'invalid model'})});
    if(name==='label-decode')await page.addInitScript(()=>{
      const original=HTMLImageElement.prototype.decode;
      HTMLImageElement.prototype.decode=function(){return this.src.startsWith('data:image/svg+xml')?Promise.reject(Error('<img src=x onerror=alert(1)>')):original.call(this)};
    });
    if(name==='webgl-unavailable')await page.addInitScript(()=>{
      const original=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/i.test(type)?null:original.call(this,type,...args)};
    });
    const start=Date.now();
    await page.goto(`http://127.0.0.1:${server.address().port}/?three=${name.endsWith('2d')?'off':'on'}${name.endsWith('-en')?'&en=1':''}`);
    await page.waitForFunction(()=>document.querySelector('.error-state')||window.rhine?.stats().ready,null,{timeout:30000});
    const expected=name.startsWith('model-')?'MODEL_RESOURCE':name==='webgl-unavailable'?'WEBGL_INIT':name==='label-decode'?'LABEL_RESOURCE':null;
    const actual=await page.evaluate(()=>document.querySelector('#loading')?.dataset.startupError??null);
    assert.equal(actual,expected,name);
    if(name.startsWith('font-missing')||name.startsWith('model-'))assert.ok(injected>0,'Fault must hit a real request');
    if(name.startsWith('font-'))assert.ok(warnings.some(w=>w.includes('STARTUP_FONT_FALLBACK')));
    if(name==='font-timeout')assert.ok(Date.now()-start>=7800,'Exercise the real timeout');
    if(expected){
      assert.equal(await page.locator('#three-scene canvas').count(),0,'Failed scene must release its canvas');
      assert.equal(await page.locator('.error-state button').evaluate(el=>el===document.activeElement),true);
      const text=await page.locator('.error-state').innerText();
      if(!web)assert.ok(!text.includes('浏览器硬件加速'));
      if(name.endsWith('-en'))assert.ok(!/\p{Script=Han}/u.test(text));
      if(name==='label-decode')assert.equal(await page.locator('.startup-error-detail img').count(),0);
      await page.screenshot({path:resolve(output,`${web?'web-':''}${name}.png`)});
      await page.setViewportSize({width:390,height:844});
      assert.equal(await page.locator('.error-state').evaluate(el=>el.getBoundingClientRect().right<=innerWidth&&el.scrollWidth<=el.clientWidth),true);
      await page.screenshot({path:resolve(output,`${web?'web-':''}${name}-portrait.png`)});
      if(name==='model-missing'){
        // The old StartupGate must not swallow Tab or activate its detached buttons.
        if(web){
          await page.locator('.error-state button').focus();
          await page.keyboard.press('Tab');
          assert.equal(await page.locator('.error-state button').evaluate(el=>el===document.activeElement),false);
        }
        await page.unroute('**/archive-cassette*.glb');
        await Promise.all([page.waitForEvent('domcontentloaded'),page.locator('.error-state button').click()]);
        await page.waitForFunction(()=>window.rhine?.stats().ready,null,{timeout:30000});
        assert.equal(await page.locator('.error-state').count(),0,'Reload recovers when the missing file is restored');
      }
    }else{
      if(web){
        await page.waitForFunction(()=>window.rhine?.stats().startup==='waiting');
        assert.equal(await page.locator('.entry-start').isEnabled(),true);
      }else{
        await page.waitForFunction(()=>window.rhine?.stats().startup==='started'&&!document.querySelector('#loading'));
        assert.equal(await page.locator('#stage').evaluate(el=>el.inert),false);
      }
    }
    assert.deepEqual(errors,[],`Unhandled errors in ${name}`);
    results.push({name,code:actual,passed:true});console.log(`${web?'web':'wallpaper'}: ${name} passed`);
    await page.close();
  }
}finally{
  await writeFile(resolve(output,web?'web-results.json':'wallpaper-results.json'),JSON.stringify(results,null,2));
  await browser?.close();server.close();
}
