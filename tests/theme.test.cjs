const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync('src/theme.js','utf8');
function boot(saved,systemDark,storageFails=false){
  const handlers={},buttonHandlers={},windowHandlers={},mediaHandlers={};
  const root={dataset:{},style:{}},button={setAttribute(){},addEventListener:(name,callback)=>buttonHandlers[name]=callback};
  const media={matches:systemDark,addEventListener:(name,callback)=>mediaHandlers[name]=callback};
  const state=new Map(saved?[['day-by-day.theme',saved]]:[]);
  const localStorage={getItem:key=>{if(storageFails)throw Error('blocked');return state.get(key)??null;},setItem:(key,value)=>{if(storageFails)throw Error('blocked');state.set(key,value);}};
  const context={document:{documentElement:root,getElementById:()=>button,querySelector:()=>({setAttribute(){}}),addEventListener:(name,callback)=>handlers[name]=callback},window:{matchMedia:()=>media,addEventListener:(name,callback)=>windowHandlers[name]=callback},localStorage};
  vm.runInNewContext(source,context); handlers.DOMContentLoaded();
  return {root,state,toggle:()=>buttonHandlers.click(),system:dark=>{media.matches=dark;mediaHandlers.change({matches:dark});},storage:value=>windowHandlers.storage({key:'day-by-day.theme',newValue:value})};
}
let app=boot(null,true);assert.equal(app.root.dataset.theme,'dark');app.system(false);assert.equal(app.root.dataset.theme,'light');
app.toggle();assert.equal(app.root.dataset.theme,'dark');app.system(false);assert.equal(app.root.dataset.theme,'dark');assert.equal(app.state.get('day-by-day.theme'),'dark');
app=boot('light',true);assert.equal(app.root.dataset.theme,'light');app.storage('dark');assert.equal(app.root.dataset.theme,'dark');app.storage(null);assert.equal(app.root.dataset.theme,'dark');app.system(false);assert.equal(app.root.dataset.theme,'light');
app=boot(null,true,true);assert.equal(app.root.dataset.theme,'dark');app.toggle();assert.equal(app.root.dataset.theme,'light');
console.log('Theme passed: system default and changes, saved overrides, cross-tab updates, preference removal, and unavailable storage.');
