import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const native = process.argv.includes('--host');
const root = resolve('release/wallpaper'), output = resolve('verification/model-precision-settings');
const scratch = resolve('.tools/model-precision-host');
assert.ok(scratch.startsWith(resolve('.tools') + sep));
await mkdir(output, {recursive:true});
const project = JSON.parse(await readFile(`${root}/project.json`, 'utf8'));
const property = project.general.properties.modelprecision;
assert.equal(property.value, 'high');
assert.deepEqual(property.options.map(item => item.value), ['high','medium','low']);
assert.equal(property.condition, undefined);
const defaults = {boot:false, modelprecision:'medium', reduced:true, sound:false, music:false, breathing:false,
  renderquality:'performance', desktopmode:'archive'};
async function probe() {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async predicate => { const end = Date.now()+45000; while(!predicate()) { if(Date.now()>end) throw Error('Probe timed out'); await wait(50); } };
  const check = (value, message) => {if(!value) throw Error(message)};
  const stats = () => window.rhine.stats();
  const push = values => window.wallpaperPropertyListener.applyUserProperties(Object.fromEntries(Object.entries(values).map(([key,value]) => [key,{value}])));
  const tier = async value => { push({modelprecision:value}); await until(()=>stats().modelPrecision===value); await wait(150); };
  const results = {};
  await until(()=>window.rhine?.stats().ready);
  results.initial = stats();
  check(stats().modelPrecision==='medium','Initial native precision');
  check(stats().arrayModelTriangles===2072 && stats().selectedModelTriangles===82348,'Medium geometry');
  await tier('high'); results.high = stats();
  check(stats().arrayModelTriangles===4200 && stats().selectedModelTriangles===82348,'High geometry');
  await wait(5000); // allow the entrance camera to reach its archive pose
  const original = {selected:stats().selected, position:stats().modelPosition, camera:stats().cameraPosition};
  push({modelprecision:'low'}); push({modelprecision:'high'}); await wait(1600);
  check(stats().modelPrecision==='high','Newest request wins');
  await tier('low'); results.low = stats();
  check(stats().arrayModelTriangles===1554 && stats().selectedModelTriangles===21869,'Low geometry');
  check(original.selected===stats().selected && original.position.every((value,i)=>Math.abs(value-stats().modelPosition[i])<.01) && original.camera.every((value,i)=>Math.abs(value-stats().cameraPosition[i])<.01),'Precision preserves selection and camera: '+JSON.stringify({original,current:{selected:stats().selected,position:stats().modelPosition,camera:stats().cameraPosition}}));
  push({soundvolume:23, superperformance:true}); await wait(150);
  check(stats().modelPrecision==='low' && stats().superPerformance,'Partial callback and super mode preserve precision');
  push({superperformance:false}); await wait(150);
  check(stats().modelPrecision==='low' && !stats().superPerformance && stats().motion.reduced,'Quality and motion are independent');
  const click = () => document.querySelector('[data-action="toggle-three"]').click();
  click(); await until(()=>stats().threeState==='off');
  check(document.querySelectorAll('#three-scene canvas').length===0,'3D releases context');
  push({modelprecision:'medium'}); click(); await until(()=>stats().threeState==='on');
  results.reload = stats(); check(stats().modelPrecision==='medium' && stats().arrayModelTriangles===2072,'Reload reads saved choice');
  await tier('low'); window.rhine.detail(); await until(()=>stats().mode==='detail');
  document.querySelector('[data-action="model-viewer"]').click();
  await until(()=>document.querySelectorAll('canvas').length===2); await wait(1800);
  await tier('high');
  check(document.querySelectorAll('canvas').length===2,'Open viewer survives precision change');
  document.querySelector('[data-viewer="close"]').click(); await until(()=>document.querySelector('.model-viewer').hidden);
  window.rhine.archive();
  push({reduced:false}); window.rhine.select(1); await wait(250); window.rhine.select(2);
  await tier('low'); results.returning = stats();
  await tier('high'); push({reduced:true}); await wait(1200);
  results.final = stats();
  check(stats().arrayModelTriangles===4200 && stats().selectedModelTriangles===82348,'Original geometry restored');
  return results;
}
let complete;
const report = new Promise(resolve => { complete=resolve; });
const port=5197;
const server=createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.url==='/result'){let body=''; for await(const chunk of req)body+=chunk; complete(JSON.parse(body));res.end('ok');return;}
  try{
    const path=resolve(root, '.' + (req.url==='/'?'/index.html':decodeURIComponent(req.url.split('?')[0])));
    assert.ok(path.startsWith(root+sep));
    let data=await readFile(path);
    const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.glb':'model/gltf-binary','.woff2':'font/woff2'};
    if(path.endsWith('index.html')) data=Buffer.from(data.toString().replace('</head>',`<script>wallpaperPropertyListener.applyUserProperties(${JSON.stringify(Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,{value}])))});</script></head>`));
    res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(data);
  }catch{res.statusCode=404;res.end();}
});
await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
let browser, timeout;
const exe='D:/Game/Steam/steamapps/common/wallpaper_engine/wallpaper64.exe';
const location='Rhine Lab model precision diagnostic';
const run=args=>new Promise((resolve,reject)=>{const child=spawn(exe,args,{windowsHide:true});child.on('error',reject);child.on('close',resolve)});
try{
  let result;
  if(native){
    await mkdir(scratch,{recursive:true});await cp(root,scratch,{recursive:true});
    delete project.workshopid; delete project.workshopurl;
    for(const [key,value] of Object.entries(defaults)) if(project.general.properties[key])project.general.properties[key].value=value;
    await writeFile(`${scratch}/project.json`,JSON.stringify(project));
    const html=await readFile(`${scratch}/index.html`,'utf8');
    await writeFile(`${scratch}/index.html`,html+`<script>(${probe.toString()})().then(result=>fetch('http://127.0.0.1:${port}/result',{method:'POST',body:JSON.stringify(result)})).catch(error=>fetch('http://127.0.0.1:${port}/result',{method:'POST',body:JSON.stringify({error:String(error),stack:error.stack})}));</script>`);
    await run(['-control','openWallpaper','-file',`${scratch}/project.json`,'-playInWindow',location,'-width','960','-height','540','-x','-30000','-y','-30000']);
    result=await Promise.race([report,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Native host timeout')),100000)})]);
    assert.equal(result.error,undefined,JSON.stringify(result));
  }else{
    const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
    browser=await chromium.launch({channel:'msedge',headless:true});
    const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
    page.on('pageerror',error=>errors.push(String(error)));
    await page.goto(`http://127.0.0.1:${port}/`);
    result=await page.evaluate(probe);
    // Force an uncached load failure after a fresh scene is created. It must
    // leave usable high geometry, then allow a later retry of that same tier.
    const click=()=>page.locator('[data-action="toggle-three"]').click();
    const push=values=>page.evaluate(values=>wallpaperPropertyListener.applyUserProperties(Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{value}]))),values);
    await click();await page.waitForFunction(()=>rhine.stats().threeState==='off');
    await page.route('**/archive-precision-low.*.glb',route=>route.abort());
    await push({modelprecision:'low'});await click();await page.waitForFunction(()=>rhine.stats().threeState==='on');
    assert.equal(await page.evaluate(()=>rhine.stats().modelPrecision),'high');
    await page.unroute('**/archive-precision-low.*.glb');await push({modelprecision:'low'});
    await page.waitForFunction(()=>rhine.stats().modelPrecision==='low');result.failureRetry=await page.evaluate(()=>rhine.stats());
    for(const tier of ['high','medium','low','high']){
      await push({modelprecision:tier});await page.waitForFunction(tier=>rhine.stats().modelPrecision===tier,tier);
      await page.waitForTimeout(500);await page.screenshot({path:`${output}/${tier}.png`});
    }
    assert.deepEqual(errors,[]);result.errors=errors;
  }
  await writeFile(`${output}/${native?'host':'browser'}.json`,JSON.stringify(result,null,2)+'\n');
  console.log(`${native?'Native WE':'Edge'} model precision lifecycle passed.`);
} finally {
  clearTimeout(timeout);await browser?.close();server.close();
  if(native){await run(['-control','closeWallpaper','-location',location]);await rm(scratch,{recursive:true,force:true});}
}
