import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve('release/wallpaper'),out='verification/workbench-controls';
await mkdir(out,{recursive:true});
const defaults={boot:false,load3donstartup:false,desktopmode:'workbench',sound:false,music:false,reduced:true,superperformance:true,showclock:false,showtasks:false,showmodule:false,shownavigation:false,showbrand:false,showfooter:false,enabletime:false,enabletasks:false,enableevent:false,enablemedia:false,enablefocus:false,focusminutes:1,task1:'完成实验记录'};
const server=createServer(async(req,res)=>{
  try{
    let path=new URL(req.url,'http://localhost').pathname;if(path==='/')path='/index.html';
    const target=resolve(root,'.'+decodeURIComponent(path));assert.ok(target.startsWith(root+sep));
    let data=await readFile(target);
    if(path==='/index.html')data=Buffer.from(data.toString().replace('</head>',`<script>wallpaperPropertyListener.applyUserProperties(${JSON.stringify(Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,{value}])) )})</script></head>`));
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.svg':'image/svg+xml'})[extname(target)]||'application/octet-stream');res.end(data);
  }catch{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser,page;
const results=[],errors=[];
try{
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  page=await browser.newPage({viewport:{width:1920,height:1080}});
  page.on('pageerror',error=>errors.push(error.message));
  const push=async values=>{await page.evaluate(values=>wallpaperPropertyListener.applyUserProperties(Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{value}]))),values);await page.waitForTimeout(120);};
  const ready=()=>page.waitForFunction(()=>window.rhine?.stats().ready&&rhine.stats().startup==='started');
  const expanded=page.locator('[data-action="toggle-workbench-expanded"]'),mode=page.locator('[data-action="toggle-workbench-mode"]');
  const isVisible=selector=>page.locator(selector).isVisible();
  const countSounds=async type=>page.evaluate(type=>rhine.stats().audio.playedSounds[type]??0,type);
  await page.goto(`http://127.0.0.1:${server.address().port}`);await ready();
  assert.equal(await isVisible('.wb-overview'),false);assert.equal(await isVisible('.footer-identity'),false);
  assert.equal(await expanded.isVisible(),true);assert.equal(await mode.isVisible(),true);
  const selected=await page.evaluate(()=>rhine.stats().selected);
  await expanded.click();
  assert.equal(await isVisible('.wb-overview'),true);assert.equal(await isVisible('.wb-module'),true);
  assert.equal(await page.locator('.wb-nav button:visible').count(),5);
  assert.equal(await isVisible('.footer-identity'),false,'Full workspace does not override footer settings');
  await push({showclock:true,enablemedia:true,soundvolume:12});
  assert.equal(await page.locator('.wb-nav button:visible').count(),5);
  await expanded.click();
  assert.equal(await isVisible('.wb-time'),true);assert.equal(await isVisible('.wb-module'),false);
  assert.equal(await page.evaluate(()=>rhine.stats().selected),selected);
  await expanded.click();await mode.click();
  assert.equal(await page.locator('#stage').getAttribute('data-workbench'),'false');
  await mode.click();
  assert.equal(await isVisible('.wb-module'),false,'Explicit mode switch leaves the temporary full state');
  await push({desktopmode:'archive'});
  assert.equal(await page.locator('#stage').getAttribute('data-workbench'),'true','Runtime mode survives host refresh');
  await push({showmodebutton:false,showworkbenchbutton:false});
  assert.equal(await mode.isVisible(),false);assert.equal(await expanded.isVisible(),false);
  await push({showmodebutton:true,showworkbenchbutton:true,showfooter:true,showfooterclock:false});
  assert.equal(await isVisible('#session-name'),true);assert.equal(await isVisible('#clock'),false);
  assert.equal(await isVisible('.footer-clock-separator'),false);
  results.push('independent page controls, hidden footer recovery, partial host updates and mode defaults');
  await push({showclock:true,showtasks:true,showmodule:true,shownavigation:true,showbrand:true,enabletime:true,enabletasks:false,enableevent:true,enablemedia:false,enablefocus:true});
  assert.deepEqual(await page.locator('.wb-nav button:visible small').allTextContents(),['01','02','03']);
  await page.locator('[data-wb-lane="4"]').click();
  assert.equal(await page.locator('.wb-index').innerText(),'03 / 03');
  await page.locator('.wb-task').click();
  await push({sound:true,soundvolume:25});
  await page.evaluate(()=>{window.testNow=Date.now();Date.now=()=>window.testNow;});
  await page.locator('[data-wb-timer="toggle"]').click();
  await page.waitForTimeout(180);
  assert.ok(await countSounds('ui-tick')>0,'Timer button uses existing audio channel');
  const progress=await page.evaluate(()=>JSON.parse(localStorage.getItem('rhine-workbench-v1')));
  await expanded.click();await expanded.click();
  const preserved=await page.evaluate(()=>JSON.parse(localStorage.getItem('rhine-workbench-v1')));
  assert.equal(preserved.timer.deadline,progress.timer.deadline);assert.deepEqual(preserved.done,progress.done);
  await page.evaluate(()=>{window.testNow+=59000;});await page.waitForTimeout(180);
  await page.evaluate(()=>{window.testNow+=1500;});await page.waitForTimeout(180);
  assert.equal(await countSounds('focus-done'),1);
  await page.evaluate(()=>{window.testNow+=1500;});await page.waitForTimeout(180);
  assert.equal(await countSounds('focus-done'),1,'Reminder is once per completion');
  await page.locator('[data-wb-timer="toggle"]').click();await page.waitForTimeout(150);
  await page.evaluate(()=>{wallpaperPropertyListener.setPaused(true);window.testNow+=61000;wallpaperPropertyListener.setPaused(false);});await page.waitForTimeout(180);
  assert.equal(await countSounds('focus-done'),1,'Paused deadlines do not ring on resume');
  await push({sound:false});await page.locator('[data-wb-timer="toggle"]').click();
  await page.evaluate(()=>{window.testNow+=59000;});await page.waitForTimeout(150);
  await page.evaluate(()=>{window.testNow+=1500;});await page.waitForTimeout(150);
  assert.equal(await countSounds('focus-done'),1,'Muted completion is silent');
  await push({sound:true});await page.waitForTimeout(150);assert.equal(await countSounds('focus-done'),1);
  results.push('continuous numbering, task/timer persistence, click audio, one completion reminder, pause and mute');
  await push({sound:false,showfooterclock:true,language:'en-US',hudparallax:true,hudtracking:false,huddepth:20});
  const selectors=['.wb-overview','.wb-module','.wb-nav button:not([hidden])'];
  const measure=()=>page.evaluate(selectors=>selectors.map(s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}),selectors);
  for(const [width,height] of [[1920,1080],[2560,1440],[1600,900]]){
    await page.setViewportSize({width,height});
    await push({wboverviewx:0,wboverviewy:0,wbmodulex:0,wbmoduley:0,wbnavigationx:0,wbnavigationy:0,uimarginbottom:0});await page.waitForTimeout(250);
    const before=await measure();
    await push({wboverviewx:45,wboverviewy:30,wbmodulex:-60,wbmoduley:-25,wbnavigationx:-50,wbnavigationy:-30});
    const after=await measure();
    for(const [i,[x,y]] of [[45,30],[-60,-25],[-50,-30]].entries()){
      assert.ok(Math.abs(after[i].x-before[i].x-x)<1.2,JSON.stringify({width,i,before,after,axis:'x'}));
      assert.ok(Math.abs(after[i].y-before[i].y-y)<1.2,JSON.stringify({width,i,before,after,axis:'y'}));
    }
    await push({uimarginbottom:60});const inset=await measure();
    assert.ok(Math.abs(inset[0].y-after[0].y)<1);assert.ok(Math.abs(inset[1].y-after[1].y)<1);
    assert.ok(Math.abs(inset[2].y-after[2].y+60)<1,'Navigation offset composes with bottom inset');
  }
  await page.screenshot({path:`${out}/desktop-offsets.png`});
  await push({wboverviewx:0,wboverviewy:0,wbmodulex:0,wbmoduley:0,wbnavigationx:0,wbnavigationy:0,uimarginbottom:0,colortheme:'dark'});
  await page.screenshot({path:`${out}/dark-footer.png`});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);
  for(const button of await page.locator('.system-footer button:visible').all()){
    const r=await button.boundingBox();assert.ok(r.x>=-1&&r.x+r.width<=391&&r.y+r.height<=845,JSON.stringify(r));
  }
  await page.screenshot({path:`${out}/portrait-footer.png`});
  results.push('physical-pixel region offsets at three desktop sizes, HUD, bottom margin composition, dark and portrait footer');
  await page.setViewportSize({width:1920,height:1080});
  await push({reduced:false,colortheme:'light'});
  await mode.click();await mode.click();await mode.click();await mode.click();await page.waitForTimeout(800);
  assert.equal(await page.locator('#stage').getAttribute('data-workbench'),'true');assert.equal(await isVisible('.wb-module'),true);
  assert.equal(await page.locator('.workbench').evaluate(n=>n.inert),false);
  await page.reload();await ready();
  assert.equal(await isVisible('.wb-module'),false,'Reload returns to WE defaults');
  assert.equal(await expanded.getAttribute('aria-pressed'),'false');
  assert.equal(await countSounds('focus-done'),0);
  await expanded.click();
  await page.locator('[data-action="toggle-three"]').click();
  await page.waitForFunction(()=>rhine.stats().threeState==='on',null,{timeout:60000});
  const modelBefore=await page.evaluate(()=>{window.testCanvas=document.querySelector('#three-scene canvas');return rhine.stats().selected;});
  await mode.click();await mode.click();
  assert.equal(await page.evaluate(()=>rhine.stats().selected),modelBefore);
  assert.equal(await page.evaluate(()=>window.testCanvas===document.querySelector('#three-scene canvas')),true);
  await push({reactiveintensity:300,audioreactive:true,language:'zh-CN',showfooter:true,showclock:true,showtasks:true,showmodule:true,shownavigation:true,enabletime:true,enabletasks:true,enableevent:true,enablemedia:true,enablefocus:true});
  await page.screenshot({path:`${out}/workspace-3d.png`});
  await push({reduced:false,idlebreathing:false,selectionstyle:'flat'});
  await page.evaluate(()=>{window.testSpectrum=setInterval(()=>{window.rhineWallpaperSpectrum={samples:Array(128).fill(.8),time:performance.now()/1000};},30);});
  for(const rhythmstyle of ['legacy','wave','lift']){
    await push({rhythmstyle});await page.waitForTimeout(1600);
    const frames=[];
    for(let i=0;i<5;i++){frames.push(await page.evaluate(()=>({activity:rhine.stats().spectrumActivity,y:rhine.stats().modelPosition[1],count:rhine.stats().archiveCount})));await page.waitForTimeout(100);}
    assert.ok(frames.every(f=>f.activity>.8&&Number.isFinite(f.y)&&f.count>0));
    assert.ok(Math.max(...frames.map(f=>f.y))-Math.min(...frames.map(f=>f.y))>.005,'Sustained audio moves all styles');
    await page.screenshot({path:`${out}/music-300-${rhythmstyle}.png`});
  }
  await page.evaluate(()=>clearInterval(window.testSpectrum));
  results.push('interrupted mode transitions, reload defaults, preserved live 3D canvas and selection');
  results.push('all three 300% rhythm styles under sustained simulated host audio');
  assert.deepEqual(errors,[]);
  const report={passed:true,browser:await browser.version(),checks:results,errors};
  await writeFile(`${out}/browser.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){await page?.screenshot({path:`${out}/failure.png`}).catch(()=>{});console.error({checks:results,pageErrors:errors});throw error;}
finally{await browser?.close();server.close();}
