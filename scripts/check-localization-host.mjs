// Actual Wallpaper Engine CEF, isolated scratch project. Never changes the
// desktop wallpaper, workshop ID or user's saved project preferences.
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import assert from 'node:assert/strict';
const scratch=resolve('.tools/localization-host');
assert.ok(scratch.startsWith(resolve('.tools')+sep));
await mkdir(scratch,{recursive:true});
await cp('release/wallpaper',scratch,{recursive:true});
const project=JSON.parse(await readFile(`${scratch}/project.json`,'utf8'));
delete project.workshopid;delete project.workshopurl;
for(const [key,value] of Object.entries({language:'en-US',boot:false,load3donstartup:false,desktopmode:'workbench',sound:false,music:false,reduced:true,task1:'今日事项'})) project.general.properties[key].value=value;
await writeFile(`${scratch}/project.json`,JSON.stringify(project));
async function probe(){
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const until=async f=>{for(let i=0;i<600;i++){if(f())return;await sleep(100);}throw Error('Host readiness timeout');};
 const check=(v,m)=>{if(!v)throw Error(m);};
 const push=values=>wallpaperPropertyListener.applyUserProperties(Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{value}])));
 await until(()=>window.rhine?.stats().ready&&rhine.stats().startup==='started');
 check(location.protocol==='file:','Must be a real file-based host');
 check(rhineWallpaperHost.properties.language.value==='en-US','Host delivered initial language');
 check(document.documentElement.lang==='en-US','English initial UI');
 check(document.querySelector('.wb-heading h2').textContent==="Today's tasks",'English workspace');
 check(!document.querySelector('.settings-button'),'No settings button');
 check(document.querySelector('.wb-task > span:last-child').textContent==='今日事项','User task preserved');
 document.querySelector('.wb-task').click();
 document.querySelector('[data-wb-lane="4"]').click();
 document.querySelector('[data-wb-timer="reset"]').click();
 document.querySelector('[data-wb-timer="toggle"]').click();
 const before=JSON.parse(localStorage.getItem('rhine-workbench-v1'));
 push({language:'zh-CN'});
 check(document.querySelector('.wb-title').textContent==='专注计时','Chinese switch');
 push({language:'en-US'});
 const after=JSON.parse(localStorage.getItem('rhine-workbench-v1'));
 check(document.querySelector('.wb-title').textContent==='Focus timer','English switch');
 check(before.timer.deadline===after.timer.deadline,'Timer deadline preserved');
 check(JSON.stringify(before.done)===JSON.stringify(after.done),'Completed tasks preserved');
 push({showsettings:true});
 check(!document.querySelector('.settings-button'),'Obsolete property cannot restore settings');
 push({reduced:false,boot:true});
 rhine.seek(8.75);
 await until(()=> (document.querySelector('#auth-message .boot-phrase-label')?.textContent || '').includes('ID CONFIRMED'));
 const opening={text:document.querySelector('#auth-message .boot-phrase-label').textContent,html:document.querySelector('#boot').innerHTML};
 check(opening.text.startsWith('ID CONFIRMED'),'Authored English identity text is actually rendered');
 push({language:'zh-CN'});
 check(document.querySelector('#boot').innerHTML===opening.html,'Existing English opening graphics unchanged');
 push({language:'en-US'});
 check(document.querySelector('#boot').innerHTML===opening.html,'English option leaves opening graphics unchanged');
 return {passed:true,userAgent:navigator.userAgent,protocol:location.protocol,initialLanguage:rhineWallpaperHost.properties.language.value,openingText:opening.text,checks:['actual host property on startup','live language callbacks','timer/tasks preserved','settings removed','opening graphics identical across languages']};
}
const port=5196;let complete;
const result=new Promise(r=>complete=r);
const server=createServer(async(req,res)=>{res.setHeader('Access-Control-Allow-Origin','*');let body='';for await(const c of req)body+=c;try{complete(JSON.parse(body));}catch{}res.end('ok');});
await new Promise(r=>server.listen(port,'127.0.0.1',r));
await writeFile(`${scratch}/index.html`,await readFile(`${scratch}/index.html`,'utf8')+`<script>(${probe.toString()})().then(result=>fetch('http://127.0.0.1:${port}',{method:'POST',body:JSON.stringify(result)})).catch(error=>fetch('http://127.0.0.1:${port}',{method:'POST',body:JSON.stringify({error:String(error),stack:error.stack})}));</script>`);
const location='Rhine Lab localization diagnostic';
const run=args=>new Promise((r,j)=>{const child=spawn('D:/Game/Steam/steamapps/common/wallpaper_engine/wallpaper64.exe',args,{windowsHide:true});child.on('error',j);child.on('close',r);});
let timer;
try{
 await run(['-control','openWallpaper','-file',`${scratch}/project.json`,'-playInWindow',location,'-width','1280','-height','720','-x','-30000','-y','-30000']);
 const data=await Promise.race([result,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Native host timeout')),90000);})]);
 await mkdir('verification/localization',{recursive:true});
 await writeFile('verification/localization/host.json',JSON.stringify(data,null,2)+'\n');
 assert.equal(data.error,undefined,JSON.stringify(data));console.log(JSON.stringify(data));
}finally{clearTimeout(timer);server.close();await run(['-control','closeWallpaper','-location',location]);}
