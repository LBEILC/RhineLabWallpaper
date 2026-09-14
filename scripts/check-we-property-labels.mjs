// Runs the installed WE translation service and exact property templates in Edge.
// WE's application files are read-only and never copied into the release.
import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {resolve} from 'node:path';
const install=process.env.WALLPAPER_ENGINE_DIR || 'D:/Game/Steam/steamapps/common/wallpaper_engine';
const ui=resolve(install,'ui/dist');
const scripts=await readFile(`${ui}/scripts/scripts.js`,'utf8');
const between=(start,end)=>{
 const a=scripts.indexOf(start),b=scripts.indexOf(end,a);
 assert.ok(a>=0&&b>a,`Installed WE source changed: ${start}`);
 return scripts.slice(a,b).replace(/,$/,';');
};
const service=between('angular.module("wallpaperbrowserApp").service("localeLoaderSupport"','angular.module("wallpaperbrowserApp").service("contextMenu"');
const droplist=between('angular.module("wallpaperbrowserApp").directive("droplist"','angular.module("wallpaperbrowserApp").directive("checkbox"');
const template=name=>{
 const marker=`e.put("${name}",`;
 const start=scripts.lastIndexOf(marker)+marker.length;
 const literal=scripts.slice(start).match(/^'(?:[^'\\]|\\.)*'/)?.[0];
 assert.ok(literal,`Template missing: ${name}`);
 return runInNewContext(literal);
};
const groupTemplate=template('views/includes/browseruserpropertiesgroup.html');
const dropTemplate=template('views/templates/droplist.html');
const labelTemplate=template('views/includes/browseruserproperties.html').match(/<span class="browsePropertyLabel"[^>]*><\/span>/)?.[0];
assert.ok(labelTemplate);
const project=JSON.parse(await readFile('wallpaper/project.json','utf8'));
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const results=[];
await mkdir('verification/localization',{recursive:true});
try {
 for(const language of ['zh-chs','en-us']) {
  const page=await browser.newPage({viewport:{width:400,height:1100}});
  await page.addScriptTag({path:`${ui}/scripts/vendor.js`});
  await page.evaluate(()=>angular.module('wallpaperbrowserApp',['ngSanitize','pascalprecht.translate']));
  await page.addScriptTag({content:service+droplist});
  const prepared=await page.evaluate(({project,language,groupTemplate,dropTemplate,labelTemplate})=>{
   const translations=structuredClone(project.general.localization);
   translations[language].ui_probe_regression='登录身份';
   const app=angular.module('wallpaperbrowserApp');
   app.config(['$translateProvider',p=>{p.useSanitizeValueStrategy('sce');p.useLoader('probe');p.preferredLanguage(language);}]);
   app.factory('probe',['localeLoaderSupport',s=>()=>{s.insertTranslations(translations);return Promise.resolve(s.getTranslations(language));}]);
   app.run(['$templateCache',c=>c.put('views/templates/droplist.html',dropTemplate)]);
   document.body.innerHTML='<main id="panel"></main><div id="regression"></div><div id="labels"></div>';
   const injector=angular.bootstrap(document.body,['wallpaperbrowserApp']);
   const root=injector.get('$rootScope'),compile=injector.get('$compile');
   function mount(markup,data,parent){const scope=root.$new();Object.assign(scope,data);const node=compile(markup)(scope);angular.element(document.querySelector(parent)).append(node);return node;}
   const expected=[];
   for(const [key,prop] of Object.entries(project.general.properties)) {
    if(prop.type==='group') {
     const node=mount(groupTemplate,{groupProperty:prop,open:false,evalCondition:()=>true},'#panel');node.attr('data-property',key);
     expected.push({selector:`[data-property="${key}"] .browserUserPropertyGroupTitleText`,text:prop.text});
    } else {
     const node=mount(labelTemplate,{property:prop},'#labels');node.attr('data-property',key);
     expected.push({selector:`[data-property="${key}"]`,text:translations[language][prop.text]});
     if(prop.options) {
      const drop=mount('<droplist dp-options="options" dp-selected="value"></droplist>',{options:prop.options,value:prop.value},'#labels');drop.attr('data-drop',key);
      prop.options.forEach((o,i)=>expected.push({selector:`[data-drop="${key}"] li:nth-child(${i+1}) .dropdown-san-item`,text:translations[language][o.label]}));
      expected.push({selector:`[data-drop="${key}"] button .dropdown-san-item`,text:translations[language][prop.options.find(o=>o.value===prop.value).label]});
     }
    }
   }
   mount(groupTemplate,{groupProperty:{text:'ui_probe_regression'},open:false},'#regression');
   root.$digest();return expected;
  },{project,language,groupTemplate,dropTemplate,labelTemplate});
  await page.waitForFunction(()=>document.querySelector('#regression .browserUserPropertyGroupTitleText').textContent.includes('&#30331;'));
  for(const item of prepared)assert.equal(await page.locator(item.selector).textContent(),item.text,`${language}: ${item.selector}`);
  await page.addStyleTag({path:`${ui}/styles/vendor.css`});
  await page.addStyleTag({path:`${ui}/styles/main.css`});
  const icons=(await readFile(`${ui}/bower_components/font-awesome/webfonts/fa-solid-900.woff2`)).toString('base64');
  await page.addStyleTag({content:`@font-face{font-family:WEProbeIcons;src:url(data:font/woff2;base64,${icons})}.fas{font-family:WEProbeIcons!important}`});
  await page.addStyleTag({content:'body{margin:0;padding:20px;background:#222;color:#eee}#regression,#labels{display:none}main{width:340px}'});
  await page.screenshot({path:`verification/localization/host-groups-${language}.png`});
  results.push({language,checkedLabels:prepared.length,originalBugReproduced:true,passed:true});
  await page.close();
 }
 await writeFile('verification/localization/property-labels.json',JSON.stringify({browser:browser.version(),method:'Installed WE service, group/label/dropdown templates in Edge',results},null,2)+'\n');
 console.log(JSON.stringify(results));
}finally{await browser.close();}
