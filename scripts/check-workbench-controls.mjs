import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const load = async path => {
  const source = ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
};
const {WorkbenchControls} = await load('src/workbench-visibility.ts');
const props = values => Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{value}]));
const c = new WorkbenchControls();
c.apply(props({desktopmode:'archive',showclock:false,showtasks:false,showmodule:false,shownavigation:false,showbrand:false,showfooter:false,enabletasks:false,enablefocus:false}));
assert.equal(c.enabled,false);
c.toggleExpanded();
assert.equal(c.enabled,true);assert.equal(c.visibility.clock,true);assert.equal(c.visibility.footer,false);
assert.equal(c.lanes.length,5);
c.apply(props({showmodule:true,enabletime:false,sound:false}));
assert.equal(c.visibility.clock,true);assert.equal(c.lanes.length,5);
c.toggleExpanded();assert.equal(c.enabled,false);assert.equal(c.visibility.clock,false);assert.equal(c.visibility.module,true);
assert.deepEqual(c.lanes,[2,3]);
c.setMode(true);c.apply(props({desktopmode:'archive',showtasks:true}));
assert.equal(c.enabled,true,'Temporary mode survives host refreshes');
assert.equal(c.visibility.tasks,true);
c.toggleExpanded();c.setMode(false);assert.equal(c.expanded,false);assert.equal(c.enabled,false,'Explicit archive switch exits full workspace');
const reload = new WorkbenchControls();reload.apply(c.properties);assert.equal(reload.enabled,false);assert.equal(reload.expanded,false);
const {shouldRemindTimer} = await load('src/workbench-state.ts');
const timer={phase:'focus',status:'running',deadline:10000,remaining:10000};
assert.equal(shouldRemindTimer(timer,10010,9000),true);
assert.equal(shouldRemindTimer(timer,10010,undefined),false,'Reload or resumed observation cannot ring');
assert.equal(shouldRemindTimer(timer,20000,9000),false,'Do not catch up a delayed reminder');
assert.equal(shouldRemindTimer(timer,11000,10010),false,'A crossed deadline is not a second reminder');
assert.equal(shouldRemindTimer({...timer,phase:'break'},10010,9000),false);
assert.equal(shouldRemindTimer({...timer,status:'paused'},10010,9000),false);
assert.equal(shouldRemindTimer(timer,8000,9000),false,'Clock moving backwards cannot ring');
const {musicDisplacement,rhythmDisplacement,reactiveStrength}=await load('src/archive-play-motion.ts');
const clamp=(v,l,h)=>Math.min(h,Math.max(l,v));
const original=(row,lane,time,b,s)=>clamp((b.low*.8*(.5+.5*Math.sin(row*.29-lane*.5-time*2.7))+b.mid*.48*(.5+.5*Math.sin(row*.72+lane*.9-time*4.3))+b.high*.18*Math.pow(Math.max(0,Math.sin(row*1.7-lane*2.2-time*6.4)),4))*clamp(s,0,2),0,1.8);
const bands={low:1,mid:1,high:1,activity:1};
let increases=0, peak=0;
for(let row=-12;row<=12;row++) for(let lane=0;lane<5;lane++) for(let t=0;t<4;t+=.2){
  for(const strength of [0,.5,1,1.5,2]) assert.equal(musicDisplacement(row,lane,t,bands,strength),original(row,lane,t,bands,strength),'Existing range remains exact');
  for(const style of ['legacy','wave','lift']) {
    const frame={style:{legacy:0,wave:0,lift:0,[style]:1}};
    const before=rhythmDisplacement(row,lane,t,bands,2,frame),after=rhythmDisplacement(row,lane,t,bands,3,frame);
    assert.ok(Number.isFinite(after)&&after>=before&&after<=3.96+1e-10);
    if(after>before+.01)increases++;peak=Math.max(peak,after);
  }
}
assert.ok(increases>1000);
assert.equal(reactiveStrength(300),3);assert.equal(reactiveStrength(999),3);assert.equal(reactiveStrength(NaN),1);
const project=JSON.parse(readFileSync('wallpaper/project.json','utf8')),properties=project.general.properties;
assert.equal(properties.reactiveintensity.max,300);
const context=structuredClone(properties);context.desktopmode.value='archive';
for(const key of ['groupfooter','showfooter','showmodebutton','showworkbenchbutton','groupworkbenchposition'])
  assert.ok(!properties[key].condition||vm.runInNewContext(properties[key].condition,context),`${key} accessible from archive defaults`);
for(const property of Object.values(properties)) if(property.condition) vm.runInNewContext(property.condition,context);
console.log(JSON.stringify({passed:true,checks:['host defaults versus temporary overrides','full workspace restores latest defaults','independent footer information','timer deadline and suspension policy','exact previous music range','300% all three styles','host conditions'],peakMotion:peak}));
