import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve, extname} from 'node:path';
import {createRequire} from 'node:module';
import {loadContent, archiveText} from './archive-content.mjs';

const zh=await loadContent(), en=await loadContent('en-US');
assert.deepEqual(en.records.map(r=>r.id),zh.records.map(r=>r.id));
assert.deepEqual(en.records.map(r=>en.columns.indexOf(r.category)),zh.records.map(r=>zh.columns.indexOf(r.category)));
for (const [i,r] of en.records.entries()) {
  assert.equal(r.en,zh.records[i].en,'Existing English headings stay unchanged');
  assert.equal(r.source,zh.records[i].source,'Keep the original reference');
  assert.equal(r.findings.length,zh.records[i].findings.length);
  for(const key of ['title','department','date','abstract', 'category', 'lead', 'clearance']) assert.ok(!/\p{Script=Han}/u.test(r[key]),`${r.id}.${key}`);
  assert.ok(r.findings.every(f=>!(/\p{Script=Han}/u.test(f))));
  assert.equal(await readFile(`public/archives/en/RHINE-LAB-${r.id}.txt`,'utf8'),archiveText(r,'en-US'));
}
const project=JSON.parse(await readFile('wallpaper/project.json','utf8'));
assert.equal(project.general.properties.language.value,'zh-CN');
assert.ok(!Object.hasOwn(project.general.properties,'showsettings'));
for(const prop of Object.values(project.general.properties)) {
 if(prop.type==='group') {
  // WE sanitizes custom translations, then renders group headings as text.
  // Literal bilingual headings avoid showing decimal HTML entities.
  assert.ok(!prop.text.startsWith('ui_') && /\p{Script=Han}/u.test(prop.text) && /[A-Za-z]/.test(prop.text));
  assert.ok(!/[<>]|&#?\w+;/.test(prop.text));
  continue;
 }
 for(const key of [prop.text,...(prop.options??[]).map(o=>o.label)]) {
  assert.ok(key.startsWith('ui_'));
  for(const lang of ['zh-chs','en-us']) assert.ok(project.general.localization[lang][key],`${lang}: ${key}`);
 }
}
console.log('40 bilingual records, matching navigation, English exports and host labels passed.');
if(process.argv.includes('--content-only')) process.exit(0);

const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve('release/wallpaper'), out='verification/localization';
await mkdir(out,{recursive:true});
const defaults={language:'en-US',boot:false,load3donstartup:false,desktopmode:'workbench',sound:false,music:false,reduced:true,renderquality:'performance',task1:'今日事项',eventname:'My event',eventdate:'2027-01-01'};
const properties=Object.fromEntries(Object.entries(defaults).map(([k,v])=>[k,{value:v}]));
const server=createServer(async(req,res)=>{
 try{
  let path=new URL(req.url,'http://localhost').pathname;
  if(path==='/')path='/index.html';
  const target=resolve(root, '.'+decodeURIComponent(path));
  assert.ok(target.startsWith(root));
  let data=await readFile(target);
  if(path==='/index.html')data=Buffer.from(data.toString().replace('</head>',`<script>wallpaperPropertyListener.applyUserProperties(${JSON.stringify(properties)})</script></head>`));
  res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.woff2':'font/woff2'})[extname(target)]||'application/octet-stream');res.end(data);
 }catch{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(5194,'127.0.0.1',r));
let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1920,height:1080}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const push=values=>page.evaluate(values=>window.wallpaperPropertyListener.applyUserProperties(Object.fromEntries(Object.entries(values).map(([k,v])=>[k,{value:v}]))),values);
 const ready=()=>page.waitForFunction(()=>window.rhine?.stats().ready&&rhine.stats().startup==='started');
 await page.goto('http://127.0.0.1:5194');await ready();
 assert.equal(await page.locator('html').getAttribute('lang'),'en-US');
 assert.equal(await page.locator('.settings-button,[data-action="settings"]').count(),0);
 assert.equal(await page.locator('.wb-heading h2').innerText(),"Today's tasks");
 assert.equal(await page.locator('.wb-task').innerText(),'今日事项','Never translate user text even if it matches a label');
 assert.ok(!(await page.locator('.wb-date').innerText()).includes('年'));
 await page.locator('.wb-task').click();
 await page.locator('[data-wb-lane="4"]').click();
 await page.locator('[data-wb-timer="toggle"]').click();
 const progress=await page.evaluate(()=>JSON.parse(localStorage.getItem('rhine-workbench-v1')));
 await push({language:'zh-CN'});
 assert.equal(await page.locator('.wb-heading h2').innerText(),'今日事项');
 assert.equal(await page.locator('.wb-title').innerText(),'专注计时');
 await push({language:'en-US'});
 assert.equal(await page.locator('.wb-title').innerText(),'Focus timer');
 assert.equal(await page.locator('[data-wb-timer="toggle"]').innerText(),'Pause');
 const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('rhine-workbench-v1')));
 assert.equal(after.timer.deadline,progress.timer.deadline);assert.deepEqual(after.done,progress.done);
 await push({soundvolume:17,language:'invalid'});
 assert.equal(await page.locator('html').getAttribute('lang'),'en-US');
 for(const size of [{width:1920,height:1080},{width:2560,height:1440},{width:390,height:844}]){
  await page.setViewportSize(size);
  await page.screenshot({path:`${out}/workspace-${size.width}.png`});
  const clipped=await page.locator('.wb-nav button,.wb-title,.wb-date').evaluateAll(nodes=>nodes.filter(n=>{
    if(!n.getClientRects().length)return false;
    const bounds=n.getBoundingClientRect(),walker=document.createTreeWalker(n,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()) {const range=document.createRange();range.selectNodeContents(walker.currentNode);if([...range.getClientRects()].some(r=>r.right>bounds.right+2||r.left<bounds.left-2))return true;}
    return false;
  }).map(n=>n.textContent));
  assert.deepEqual(clipped,[],`Text overflow at ${size.width}`);
 }
 await page.setViewportSize({width:1920,height:1080});
 await page.locator('[data-wb-lane="2"]').click();
 await push({eventdate:'2027-01-01'});
 assert.ok(!/\p{Script=Han}/u.test(await page.locator('.wb-content').innerText()));
 await page.screenshot({path:`${out}/event-en.png`});
 await push({eventdate:'invalid'});
 assert.equal(await page.locator('.wb-empty').innerText(),'Invalid target date');
 await push({eventdate:''});
 assert.equal(await page.locator('.wb-empty').innerText(),'Keep a date to look forward to.');
 await page.locator('[data-wb-lane="3"]').click();
 await page.evaluate(()=>{rhineWallpaperMedia.status={enabled:true};rhineWallpaperMedia.properties={title:'今日事项',artist:'Sample artist'};window.dispatchEvent(new Event('rhine-wallpaper-media'));});
 await push({language:'zh-CN'});await push({language:'en-US'});
 assert.equal(await page.locator('.wb-media h3').innerText(),'今日事项');
 await page.reload();await ready();
 assert.equal(await page.locator('html').getAttribute('lang'),'en-US');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('rhine-workbench-v1')).timer.deadline),progress.timer.deadline);
 // Obsolete property and even an injected stale action cannot reopen settings.
 await push({showsettings:true,desktopmode:'archive'});
 await page.evaluate(()=>{const b=document.createElement('button');b.dataset.action='settings';document.body.append(b);b.click();b.remove();});
 assert.equal(await page.locator('.settings-modal').count(),0);
 await page.locator('[data-action="toggle-three"]').click();
 await page.waitForFunction(()=>rhine.stats().threeState==='on',{},{timeout:60000});
 await page.evaluate(()=>rhine.select(39));
 await page.locator('[data-action="open"]').first().click();
 await page.waitForFunction(()=>rhine.stats().mode==='detail');
 await page.locator('[data-tab="notes"]').click();
 await page.locator('[data-action="bookmark"]').click();
 const sceneBefore=await page.evaluate(()=>({selected:rhine.stats().selected,canvas:document.querySelector('#three-scene canvas')?.dataset}));
 await page.evaluate(()=>window.checkCanvas=document.querySelector('#three-scene canvas'));
 await push({language:'zh-CN'});await push({language:'en-US'});
 assert.equal(await page.evaluate(()=>rhine.stats().selected),sceneBefore.selected);
 assert.ok(await page.evaluate(()=>window.checkCanvas===document.querySelector('#three-scene canvas')));
 assert.equal(await page.locator('[data-tab="notes"]').getAttribute('aria-selected'),'true');
 assert.equal(await page.locator('[data-action="bookmark"]').getAttribute('aria-pressed'),'true');
 assert.ok((await page.locator('.export-button').getAttribute('href')).includes('/en/'));
 assert.ok(!/\p{Script=Han}/u.test(await page.locator('#detail-content').innerText()));
 await page.screenshot({path:`${out}/archive-en.png`});
 await page.locator('[data-action="model-viewer"]').click();
 await page.waitForFunction(()=>document.querySelector('.viewer-loading').hidden);
 await page.locator('[data-viewer="explode"]').click();
 await page.evaluate(()=>window.checkViewer=document.querySelector('.viewer-canvas canvas'));
 await push({language:'zh-CN'});await push({language:'en-US'});
 assert.equal(await page.locator('#viewer-title').innerText(),'Hall of Stasis');
 assert.equal(await page.locator('.model-viewer').getAttribute('data-exploded'),'true');
 assert.ok(await page.evaluate(()=>window.checkViewer===document.querySelector('.viewer-canvas canvas')));
 assert.ok(!/\p{Script=Han}/u.test(await page.locator('.model-viewer').innerText()));
 await page.screenshot({path:`${out}/viewer-en.png`});
 await page.locator('[data-viewer="close"]').click();
 assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-action')),'model-viewer','Viewer focus returns after locale refresh');
 await page.locator('[data-action="search"]').click();
 await page.locator('.category-filters button').nth(2).click();
 await page.locator('#archive-search').fill('X-');
 const count=await page.locator('.result-row').count();
 await push({language:'zh-CN'});await push({language:'en-US'});
 assert.equal(await page.locator('#archive-search').inputValue(),'X-');
 assert.equal(await page.locator('.result-row').count(),count);
 assert.equal(await page.locator('.category-filters button.active').innerText(),'Engineering');
 assert.ok(!/\p{Script=Han}/u.test(await page.locator('.terminal-modal').innerText()));
 await page.screenshot({path:`${out}/search-en.png`});
 await page.locator('[data-action="close-modal"]').click();
 await push({desktopmode:'workbench',hudparallax:true,huddepth:20,colortheme:'dark'});
 await page.screenshot({path:`${out}/workspace-dark-hud.png`});
 await page.locator('.relay-entry').click();
 await push({language:'zh-CN'});await push({language:'en-US'});
 assert.equal(await page.locator('.relay-exit').innerText(),'Exit game');
 await page.locator('.relay-exit').click();
 assert.equal(await page.locator('.settings-button').count(),0);
 assert.deepEqual(errors,[]);
 const result={passed:true,browser:await browser.version(),checks:['host language on startup/reload','settings removed and stale actions ignored','all 40 English exports','canonical navigation','user tasks/media unchanged','timer deadline and tasks preserved','detail tab/bookmark/model canvas preserved','viewer model/explosion preserved','search/filter preserved','workspace 1920/2560/390 layouts','dark HUD','relay switching'],errors};
 await writeFile(`${out}/results.json`,JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
}finally{await browser?.close();server.close();}
