const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('src/index.html', 'utf8');
const source = ['schedule.js', 'recovery.js', 'file-storage.js', 'app.js'].map(name => fs.readFileSync('src/' + name, 'utf8')).join('\n');
// A small in-memory DOM exercises application events without a browser, network, or user data.
function boot(storage, initialClock, options = {}) {
  let clock = initialClock, uid = 0;
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const intervals = [], timeouts = new Map(), ids = {}, extras = {}, inputs = [], animations = [], notices = [], downloads = [], blobURLs = new Map();
  let blobId = 0;
  class DownloadURL extends URL {
    static createObjectURL(blob) { const url=`blob:runtime-${++blobId}`;blobURLs.set(url,blob);return url; }
    static revokeObjectURL(url) { blobURLs.delete(url); }
  }
  let timerId = 0;
  class Node {
    constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.style = {}; this.attrs = {}; this.listeners = {}; this.className = ''; this._text = ''; this.value = ''; this.checked = false; this.hidden = false; this.disabled = false; this.open = false; }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    append(...children) { for (const child of children) { const node = typeof child === 'string' ? Object.assign(new Node('text'), {_text:child}) : child; node.parentNode = this; this.children.push(node); } }
    prepend(...children) { for (const child of children.reverse()) { child.parentNode = this; this.children.unshift(child); } }
    replaceChildren(...children) { this._text = ''; this.children = []; this.append(...children); }
    setAttribute(key, value) { this.attrs[key] = String(value); }
    getAttribute(key) { return this.attrs[key] ?? null; }
    addEventListener(key, callback) { (this.listeners[key] ||= []).push(callback); }
    dispatch(key) { for (const callback of this.listeners[key] || []) callback({preventDefault(){},target:this}); }
    matches(selector) { if (selector.startsWith('.')) return this.className.split(' ').includes(selector.slice(1)); if (selector.startsWith('[data-move=')) return this.dataset.move === selector.match(/"(.*?)"/)[1]; return this.tagName.toLowerCase() === selector; }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    contains(node) { return this === node || this.children.some(child=>child.contains(node)); }
    get classList() { return {toggle:(name, force) => { const names = new Set(this.className.split(' ').filter(Boolean)); const add = force === undefined ? !names.has(name) : force; add ? names.add(name) : names.delete(name); this.className = [...names].join(' '); return add; }}; }
    focus() { document.activeElement = this; }
    get isConnected() { return !this.detached; }
    scrollIntoView() {}
    getBoundingClientRect() { return {top:0,left:0,width:1}; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    click() { if(this.tagName==='A'&&this.download)downloads.push({name:this.download,blob:blobURLs.get(this.href)});this.onclick?.(); }
    remove() { this.detached=true; if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); }
    reset() { for (const input of inputs) { input.value = input.initialValue || ''; input.checked = input.initialChecked || false; } }
  }
  if (options.motion) Node.prototype.animate = function(frames, settings) {
    let resolve, reject;
    const animation = {node:this,frames,settings,cancelled:false,finished:new Promise((yes,no)=>{resolve=yes;reject=no;}),finish(){resolve();},cancel(){this.cancelled=true;reject(new Error('Animation cancelled'));}};
    animations.push(animation); return animation;
  };
  for (const match of html.matchAll(/<(\w+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) { const node = new Node(match[1]); node.id = match[3]; node.hidden = /\bhidden\b/.test(match[2]); ids[node.id] = node; }
  for (const match of html.matchAll(/<(?:input|textarea)\b([^>]*)>/g)) {
    const attrs = match[1], id = attrs.match(/\bid="([^"]*)"/)?.[1], node = ids[id] || new Node('input');
    node.name = attrs.match(/\bname="([^"]*)"/)?.[1]; node.type = attrs.match(/\btype="([^"]*)"/)?.[1]; node.value = attrs.match(/\bvalue="([^"]*)"/)?.[1] || ''; node.initialValue = node.value; node.checked = /\bchecked\b/.test(attrs); node.initialChecked = node.checked; inputs.push(node);
  }
  ids.undoNotice.append(ids.undoMessage,ids.undoAction,ids.dismissUndo);
  ids.toast.append(ids.toastMessage,ids.dismissToast);
  ids.taskForm.elements = {};
  for (const name of ['kind','timing']) {
    const radios = inputs.filter(input => input.name === name);
    Object.defineProperty(radios, 'value', {get(){return this.find(input=>input.checked)?.value || '';},set(value){this.forEach(input=>input.checked=input.value===value);}});
    ids.taskForm.elements[name] = radios;
  }
  const documentListeners={},windowListeners={};
  const document = {title:'',hidden:false,body:new Node('body'),getElementById(id){if(!ids[id])throw Error('Missing element '+id);return ids[id];},createElement:tag=>new Node(tag),createElementNS:(_,tag)=>new Node(tag),createTextNode:text=>Object.assign(new Node('text'),{_text:String(text)}),querySelector(selector){return extras[selector] ||= new Node(selector==='main'?'main':'div');},querySelectorAll(selector){const name=selector.match(/name="(.*?)"/)?.[1];return inputs.filter(input=>input.name===name);},addEventListener:(name,callback)=>{(documentListeners[name] ||= []).push(callback);}};
  const localStorage = {getItem:key=>{if(options.storageReadFails&&key==='day-by-day.v1')throw Error('Storage unavailable');return storage.get(key)??null;},setItem:(key,value)=>{if(options.storageWriteFails&&key==='day-by-day.v1')throw Error('Storage full');storage.set(key,String(value));}};
  const context = {Date:Clock,Blob,document,localStorage,window:{isSecureContext:false,matchMedia:()=>({matches:Boolean(options.reducedMotion)}),addEventListener:(name,callback)=>{(windowListeners[name] ||= []).push(callback);},focus(){}},crypto:{randomUUID:()=>`runtime_${++uid}`},setTimeout:(fn,ms)=>{const id=++timerId;timeouts.set(id,{fn,ms,at:clock+ms});return id;},clearTimeout:id=>timeouts.delete(id),queueMicrotask,setInterval:(fn,ms)=>{intervals.push({fn,ms});return intervals.length;},console,Blob,URL:DownloadURL};
  if(options.navigator)context.navigator=options.navigator;
  if(options.fileWindow)Object.assign(context.window,options.fileWindow);
  if(options.indexedDB)context.indexedDB=options.indexedDB;
  if(options.secure)context.window.isSecureContext=true;
  if(options.notifications) {
    class Notice { static permission='granted'; constructor(title,settings){notices.push({title,settings});} close(){} }
    context.Notification=Notice;context.window.Notification=Notice;context.window.isSecureContext=true;
  }
  vm.createContext(context); vm.runInContext(options.countSorts ? source.replace('function sortTasksByTime(tasks) {','function sortTasksByTime(tasks) { globalThis.sortCalls=(globalThis.sortCalls||0)+1;') : source,context);
  function advance(ms) {
    const until=clock+ms;
    for(;;) {
      const next=[...timeouts].filter(([,timer])=>timer.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!next)break;
      clock=Math.max(clock,next[1].at);timeouts.delete(next[0]);next[1].fn();
    }
    clock=until;
  }
  return {ids,inputs,context,storage,animations,notices,downloads,documentListeners,windowListeners,advance,flushTimeouts:()=>{const pending=[...timeouts.values()];timeouts.clear();pending.forEach(timer=>timer.fn());},clock:time=>clock=time,tick:()=>intervals.find(timer=>timer.ms===10000).fn(),refresh:()=>intervals.find(timer=>timer.ms===30000).fn(),state:()=>JSON.parse(storage.get('day-by-day.v1'))};
}
const clock = new Date(2026,9,28,9,45).getTime();
const storage = new Map([['day-by-day.v1', JSON.stringify({version:2,tasks:[{id:'existing',title:'Existing routine',kind:'weekly',weekdays:[3],startDate:'2026-10-28'}],completed:{}})]]);
let app = boot(storage,clock);
app.ids.addTask.onclick();
app.ids.taskTitle.value = 'Timed reminder check';
app.ids.taskForm.elements.timing.value = 'timed';
app.ids.taskForm.elements.timing[1].onchange();
assert.equal(app.ids.taskTime.disabled,false);
app.ids.taskTime.value = '10:00';
app.inputs.find(input=>input.name==='reminders' && input.value==='15').checked = true;
app.ids.taskForm.dispatch('submit');
let state = app.state();
assert.equal(state.version,5); assert.equal(state.tasks[0].time,null);
assert.equal(state.tasks[1].time,'10:00'); assert.deepEqual(state.tasks[1].reminders,[15]);
assert.equal(app.ids.reminderPanel.hidden,false); assert.match(app.ids.reminderAlerts.textContent,/Timed reminder check/);
assert.equal(JSON.parse(storage.get('day-by-day.reminders.v1')).alerts.length,1);
app.tick(); assert.equal(JSON.parse(storage.get('day-by-day.reminders.v1')).alerts.length,1);
app = boot(storage,clock+60000);
assert.equal(app.ids.reminderPanel.hidden,false); assert.equal(JSON.parse(storage.get('day-by-day.reminders.v1')).alerts.length,1);
const taskId = app.state().tasks[1].id;
app.ids.taskList.querySelectorAll('.check-button').find(button=>button.dataset.id===taskId).onclick();
assert.equal(app.ids.reminderPanel.hidden,true); assert.equal(JSON.parse(storage.get('day-by-day.reminders.v1')).alerts.length,0);
assert.equal(app.state().completed['2026-10-28'].includes(taskId),true);
const row = app.ids.taskList.querySelectorAll('.task-row').find(row=>row.dataset.id===taskId);
row.querySelector('.edit-task').onclick();
assert.equal(app.ids.taskTime.value,'10:00'); assert.equal(app.ids.taskForm.elements.timing.value,'timed');
app.ids.taskForm.elements.timing.value = 'allday'; app.ids.taskForm.elements.timing[0].onchange(); app.ids.taskForm.dispatch('submit');
state=app.state(); assert.equal(state.tasks[1].time,null); assert.deepEqual(state.tasks[1].reminders,[]);
assert.equal(state.tasks[0].id,'existing'); assert.equal(state.completed['2026-10-28'].includes(taskId),true);
console.log('Runtime passed: form controls, saving, reminder panel delivery, duplicate prevention, reload, completion suppression, editing time, all-day reset, and legacy data preservation.');
async function verifyMotion() {
  const moving = boot(new Map(),clock,{motion:true});
  moving.ids.addTask.onclick(); assert.equal(moving.ids.taskDialog.open,true);
  moving.ids.cancelDialog.onclick(); assert.equal(moving.ids.taskDialog.open,false);
  moving.animations.filter(animation=>animation.node===moving.ids.taskDialog).at(-1).finish();
  await new Promise(resolve=>setImmediate(resolve)); assert.equal(moving.ids.taskDialog.open,false);
  assert.equal(moving.animations.every(animation=>animation.node!==moving.ids.taskDialog || animation.cancelled),true);
  assert.equal(moving.animations.filter(animation=>animation.node===moving.ids.taskDialog).every(animation=>animation.frames.every(frame=>!('transform' in frame))),true);
  moving.ids.addTask.onclick(); moving.ids.cancelDialog.onclick(); moving.ids.addTask.onclick();
  await new Promise(resolve=>setImmediate(resolve)); assert.equal(moving.ids.taskDialog.open,true);
  moving.ids.taskTitle.value='Save during transition';
  moving.ids.taskForm.dispatch('submit'); moving.ids.taskForm.dispatch('submit');
  assert.equal(moving.state().tasks.length,1);
  moving.animations.filter(animation=>animation.node===moving.ids.taskDialog).at(-1).finish();
  await new Promise(resolve=>setImmediate(resolve)); assert.equal(moving.ids.taskDialog.open,false);
  // Simulate a working session with reminders ticking and repeated edit cycles.
  for (let cycle=0;cycle<12;cycle++) {
    moving.clock(clock+cycle*60000); moving.tick();
    moving.ids.taskList.querySelector('.edit-task').onclick(); assert.equal(moving.ids.taskDialog.open,true);
    moving.animations.filter(animation=>animation.node===moving.ids.taskDialog).at(-1).finish();
    await new Promise(resolve=>setImmediate(resolve));
    moving.ids.cancelDialog.onclick(); moving.animations.filter(animation=>animation.node===moving.ids.taskDialog).at(-1).finish();
    await new Promise(resolve=>setImmediate(resolve)); assert.equal(moving.ids.taskDialog.open,false);
  }
  moving.ids.taskList.querySelector('.check-button').onclick();
  moving.ids.taskList.querySelector('.edit-task').onclick(); assert.equal(moving.ids.taskDialog.open,true);
  moving.ids.cancelDialog.onclick(); moving.animations.filter(animation=>animation.node===moving.ids.taskDialog).at(-1).finish();
  await new Promise(resolve=>setImmediate(resolve)); assert.equal(moving.ids.taskDialog.open,false);
  moving.ids.routinesNav.onclick(); assert.equal(moving.ids.routinesView.hidden,false);
  moving.ids.weekStrip.children[0].onclick();
  const weekButton=moving.ids.weekStrip.children[1], monthButton=moving.ids.calendarGrid.children[0];
  weekButton.onclick(); assert.equal(moving.ids.weekStrip.children[1],weekButton); assert.equal(moving.ids.calendarGrid.children[0],monthButton);
  moving.ids.weekStrip.children[6].onclick();
  assert.equal(moving.ids.dayTitle.textContent,'Sunday.'); assert.equal(moving.ids.routinesView.hidden,true);
  const dayFades=moving.animations.filter(animation=>animation.node===moving.ids.dayTitle);
  assert.equal(dayFades.length>=2,true); assert.equal(dayFades.some(animation=>animation.cancelled),true);
  assert.equal(dayFades.every(animation=>animation.frames.every(frame=>!('transform' in frame))),true);
  const interactiveContainers=[moving.ids.dailyView,moving.ids.routinesView,moving.ids.taskList,moving.ids.routineList];
  assert.equal(moving.animations.some(animation=>interactiveContainers.includes(animation.node) || animation.node.className.split(' ').includes('task-row')),false);
  moving.ids.addTask.onclick(); moving.ids.taskDialog.dispatch('cancel');
  moving.animations.filter(animation=>animation.node===moving.ids.taskDialog).at(-1).finish();
  await new Promise(resolve=>setImmediate(resolve)); assert.equal(moving.ids.taskDialog.open,false);
  const reduced=boot(new Map(),clock,{motion:true,reducedMotion:true});
  reduced.ids.addTask.onclick(); reduced.ids.cancelDialog.onclick(); reduced.ids.routinesNav.onclick();
  assert.equal(reduced.ids.taskDialog.open,false); assert.equal(reduced.animations.length,0);
  console.log('Motion passed: heading-only fades, no animation on checklist ancestors or rows, stable date controls, repeated edit cycles, interrupted dialogs, Escape, and reduced motion.');
}
verifyMotion().catch(error=>{console.error(error);process.exitCode=1;});
async function verifyDescriptions() {
  const notesApp = boot(new Map(),clock), notes='Check the queue.\nhttps://example.com/guide\n<script>alert(1)</script> javascript:alert(2)';
  notesApp.ids.addTask.onclick(); notesApp.ids.taskTitle.value='Opening checks'; notesApp.ids.taskDescription.value=notes;
  notesApp.ids.taskForm.elements.kind.value='weekly'; notesApp.ids.workdaysPreset.onclick(); notesApp.ids.taskForm.dispatch('submit');
  const id=notesApp.state().tasks[0].id;
  assert.equal(notesApp.state().tasks[0].description,notes); assert.equal(notesApp.state().tasks[0].weekdays.length,5);
  let row=notesApp.ids.taskList.querySelector('.task-row'), body=row.querySelector('.description-body');
  assert.equal(row.querySelector('.task-description').querySelector('details'),null); assert.equal(row.querySelector('.description-toggle'),null); assert.equal(body.textContent,notes); assert.equal(body.querySelector('script'),null);
  const link=body.querySelector('a'); assert.equal(link.href,'https://example.com/guide'); assert.equal(link.target,'_blank'); assert.equal(link.rel,'noopener noreferrer');
  row.querySelector('.check-button').onclick();
  assert.equal(notesApp.ids.taskList.querySelector('.description-body').textContent,notes);
  notesApp.ids.taskList.querySelector('.edit-task').onclick(); assert.equal(notesApp.ids.taskDescription.value,notes);
  notesApp.ids.taskDescription.value='Updated details'; notesApp.ids.taskForm.dispatch('submit');
  assert.equal(notesApp.state().completed['2026-10-28'].includes(id),true);
  const reload=boot(notesApp.storage,clock); assert.equal(reload.ids.taskList.querySelector('.description-body').textContent,notes);
  reload.ids.nextWeek.onclick(); assert.equal(reload.ids.taskList.querySelector('.description-body').textContent,'Updated details');
  assert.equal(reload.ids.taskList.querySelector('.check-button').getAttribute('aria-pressed'),'false');
  reload.ids.routinesNav.onclick(); assert.equal(reload.ids.routineList.querySelector('.description-body').textContent,'Updated details');
  reload.ids.routineList.querySelector('.edit-task').onclick(); reload.ids.taskDescription.value=''; reload.ids.taskForm.dispatch('submit');
  assert.equal(reload.state().tasks[0].description,''); assert.equal(reload.ids.routineList.querySelector('.description-body'),null);
  reload.ids.todayNav.onclick();reload.ids.nextWeek.onclick();assert.equal(reload.ids.taskList.querySelector('.task-description'),null);reload.ids.routinesNav.onclick();
  reload.ids.addTask.onclick(); assert.equal(reload.ids.taskDescription.value,''); reload.ids.cancelDialog.onclick();
  reload.ids.restoreFile.files=[{size:200,text:async()=>JSON.stringify({version:5,tasks:[{...reload.state().tasks[0],description:notes,versions:reload.state().tasks[0].versions.map(version=>({...version,description:notes}))}],completed:{}})}];
  const restored=reload.ids.restoreFile.onchange(); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(reload.ids.restoreDialog.open,true); reload.ids.confirmRestore.onclick();
  await restored; assert.equal(reload.state().tasks[0].description,notes);
  reload.ids.routineList.querySelector('.edit-task').onclick(); reload.ids.taskDescription.value='x'.repeat(5001); reload.ids.taskForm.dispatch('submit');
  assert.equal(reload.ids.taskDialog.open,true); assert.equal(reload.state().tasks[0].description,notes); assert.match(reload.ids.formError.textContent,/description/);
  const longApp=boot(new Map(),clock), url='https://example.com/'+ 'a'.repeat(300), longNotes=url+'\nAdditional details.\nAnother line.\nLast line.';
  longApp.ids.addTask.onclick(); longApp.ids.taskTitle.value='Long instructions'; longApp.ids.taskDescription.value=longNotes; longApp.ids.taskForm.dispatch('submit');
  row=longApp.ids.taskList.querySelector('.task-row'); body=row.querySelector('.description-body');
  const toggle=row.querySelector('.description-toggle'), arrows=row.querySelector('.task-order'), checkbox=row.querySelector('.check-button'), edit=row.querySelector('.edit-task');
  assert.equal(body.textContent,longNotes.slice(0,240)+'…'); assert.equal(body.querySelector('a').href,url);
  assert.equal(toggle.textContent,'Show more'); assert.equal(toggle.getAttribute('aria-expanded'),'false'); assert.equal(toggle.getAttribute('aria-controls'),body.id);
  toggle.onclick(); assert.equal(body.textContent,longNotes); assert.equal(toggle.textContent,'Show less'); assert.equal(toggle.getAttribute('aria-expanded'),'true');
  assert.equal(row.querySelector('.task-order'),arrows); assert.equal(row.querySelector('.check-button'),checkbox); assert.equal(row.querySelector('.edit-task'),edit);
  toggle.onclick(); assert.equal(body.textContent,longNotes.slice(0,240)+'…'); assert.equal(toggle.textContent,'Show more');
  toggle.onclick(); checkbox.onclick();
  assert.equal(longApp.ids.taskList.querySelector('.description-body').textContent,longNotes); assert.equal(longApp.ids.taskList.querySelector('.description-toggle').textContent,'Show less');
  console.log('Description runtime passed: visible short notes, long previews, Show more/less, complete URL targets, stable control nodes, create/edit/clear, recurring occurrences, reload, restore, and oversized input.');
}
verifyDescriptions().catch(error=>{console.error(error);process.exitCode=1;});
function verifyTimeSorting() {
  // Exercise sorting before any task is overdue; overdue grouping is tested below.
  const clock=new Date(2026,9,28,0,0).getTime();
  const tasks=[['all-1',null],['late','17:00'],['nine-1','09:00'],['midnight','00:00'],['nine-2','09:00'],['all-2',null],['done-late','18:00'],['done-early','08:00'],['done-all',null]].map(([id,time])=>({id,title:id,kind:'weekly',weekdays:[3],startDate:'2026-10-28',time,reminders:[]}));
  const storage=new Map([['day-by-day.v1',JSON.stringify({version:4,tasks,completed:{'2026-10-28':['done-late','done-early','done-all']}})]]);
  let sorted=boot(storage,clock);
  const rowIds=container=>container.querySelectorAll('.task-row').map(row=>row.dataset.id);
  const findRow=id=>sorted.ids.taskList.querySelectorAll('.task-row').find(row=>row.dataset.id===id);
  assert.deepEqual(rowIds(sorted.ids.taskList),['midnight','nine-1','nine-2','late','all-1','all-2','done-early','done-late','done-all']);
  assert.equal(sorted.ids.sortDay.hidden,true);
  findRow('late').querySelector('.edit-task').onclick(); sorted.ids.taskTime.value='07:00'; sorted.ids.taskForm.dispatch('submit');
  assert.deepEqual(rowIds(sorted.ids.taskList).slice(0,4),['midnight','late','nine-1','nine-2']);
  findRow('late').querySelector('.edit-task').onclick(); sorted.ids.taskTime.value='17:00'; sorted.ids.taskForm.dispatch('submit');
  assert.equal(findRow('nine-1').querySelector('.move-up').disabled,false);
  findRow('midnight').querySelector('.move-down').onclick();
  assert.ok(sorted.state().weekdayOrders[3]); assert.equal(sorted.ids.sortDay.hidden,false);
  assert.deepEqual(rowIds(sorted.ids.taskList).slice(0,6),['nine-1','midnight','nine-2','late','all-1','all-2']);
  findRow('all-1').querySelector('.move-up').onclick();
  assert.deepEqual(rowIds(sorted.ids.taskList).slice(0,6),['nine-1','midnight','nine-2','all-1','late','all-2']);
  findRow('late').querySelector('.edit-task').onclick(); sorted.ids.taskTime.value='07:00'; sorted.ids.taskForm.dispatch('submit');
  assert.deepEqual(rowIds(sorted.ids.taskList).slice(0,6),['nine-1','midnight','nine-2','all-1','late','all-2']);
  sorted=boot(storage,clock); assert.equal(sorted.ids.sortDay.hidden,false);
  assert.deepEqual(rowIds(sorted.ids.taskList).slice(0,6),['nine-1','midnight','nine-2','all-1','late','all-2']);
  sorted.ids.routinesNav.onclick();
  assert.deepEqual(rowIds(sorted.ids.routineList),['midnight','late','done-early','nine-1','nine-2','done-late','all-1','all-2','done-all']);
  sorted.ids.nextWeek.onclick();
  assert.deepEqual(rowIds(sorted.ids.taskList),['done-early','nine-1','midnight','nine-2','all-1','late','done-late','all-2','done-all']);
  sorted.ids.sortDay.onclick(); assert.equal(sorted.state().weekdayOrders[3],undefined); assert.equal(sorted.ids.sortDay.hidden,true);
  assert.deepEqual(rowIds(sorted.ids.taskList),['midnight','late','done-early','nine-1','nine-2','done-late','all-1','all-2','done-all']);
  sorted=boot(storage,clock); assert.equal(sorted.ids.sortDay.hidden,true);
  assert.deepEqual(rowIds(sorted.ids.taskList).slice(0,6),['midnight','late','nine-1','nine-2','all-1','all-2']);
  console.log('Sorting runtime passed: automatic defaults, unrestricted arrows, switching from displayed order, saved custom order, reload, editing times, routines, future dates, and reset to due-time order.');
}
verifyTimeSorting();
function verifyAlphabeticalSorting() {
  const tasks=[['b','Task B','12:00'],['z','Zebra',null],['a','task a','12:00'],['apple','Apple',null]].map(([id,title,time])=>({id,title,time,kind:'weekly',weekdays:[3],startDate:'2026-10-28',reminders:[]}));
  const storage=new Map([['day-by-day.v1',JSON.stringify({version:4,tasks,completed:{}})]]);
  let sorted=boot(storage,clock);
  const ids=container=>container.querySelectorAll('.task-row').map(row=>row.dataset.id);
  assert.deepEqual(ids(sorted.ids.taskList),['a','b','apple','z']);
  sorted.ids.routinesNav.onclick(); assert.deepEqual(ids(sorted.ids.routineList),['a','b','apple','z']);
  sorted.ids.routineList.querySelectorAll('.task-row').find(row=>row.dataset.id==='b').querySelector('.move-up').onclick();
  assert.deepEqual(ids(sorted.ids.routineList),['b','a','apple','z']);
  sorted=boot(storage,clock); assert.deepEqual(ids(sorted.ids.taskList),['a','b','apple','z']);
  sorted.ids.routinesNav.onclick();assert.deepEqual(ids(sorted.ids.routineList),['b','a','apple','z']);
  sorted.ids.sortRoutines.onclick();assert.deepEqual(ids(sorted.ids.routineList),['a','b','apple','z']);sorted.ids.todayNav.onclick();
  sorted.ids.taskList.querySelectorAll('.task-row').find(row=>row.dataset.id==='a').querySelector('.edit-task').onclick();
  sorted.ids.taskTitle.value='Task Z'; sorted.ids.taskForm.dispatch('submit');
  assert.deepEqual(ids(sorted.ids.taskList),['b','a','apple','z']);
  console.log('Alphabetical runtime passed: same-time and all-day defaults, routines, manual override, persisted custom order, reset, and renamed tasks.');
}
verifyAlphabeticalSorting();
async function verifyReliability() {
  const tasks=[{id:'old',title:'Old task',kind:'once',date:'2026-10-27',time:'08:00',reminders:[5],description:'Keep these notes'},{id:'done',title:'Done old task',kind:'once',date:'2026-10-26'},{id:'routine',title:'Yesterday routine',kind:'weekly',weekdays:[2],startDate:'2026-10-20'},{id:'current',title:'Current task',kind:'once',date:'2026-10-28'}];
  const stored=new Map([['day-by-day.v1',JSON.stringify({version:4,tasks,completed:{'2026-10-26':['done']}})]]);
  const work=boot(stored,clock,{countSorts:true});
  assert.equal(work.ids.overdueSection.hidden,false);assert.equal(work.ids.overdueList.querySelectorAll('.task-row').length,1);
  assert.equal(work.ids.todayCount.textContent,'2');assert.equal(work.context.sortCalls,2);
  work.ids.nextMonth.onclick();assert.equal(work.context.sortCalls,2);
  work.ids.overdueList.querySelector('.check-button').onclick();
  assert.deepEqual(work.state().completed['2026-10-27'],['old']);assert.equal(work.state().tasks[0].date,'2026-10-27');assert.equal(work.ids.overdueSection.hidden,true);
  work.ids.prevWeek.onclick(); assert.equal(work.ids.overdueSection.hidden,true); work.ids.todayNav.onclick();
  // Edit/save restores focus to the replacement Edit button after the dialog closes.
  work.ids.taskList.querySelector('.edit-task').onclick();work.ids.taskTitle.value='Updated current task';work.ids.taskForm.dispatch('submit');
  await new Promise(resolve=>setImmediate(resolve));assert.equal(work.context.document.activeElement,work.ids.taskList.querySelector('.edit-task'));
  work.ids.taskList.querySelector('.edit-task').onclick();work.ids.deleteTask.onclick();
  assert.equal(work.ids.undoNotice.hidden,false);assert.equal(work.ids.toast.hidden,true);
  work.ids.prevMonth.onclick();assert.equal(work.ids.undoNotice.hidden,false);work.ids.undoAction.onclick();assert.equal(work.state().tasks.some(task=>task.id==='current'),true);
  assert.equal(work.ids.statusAnnouncement.textContent,'Change undone.');assert.equal(work.ids.statusAnnouncement.hidden,false);
  for(const fn of work.documentListeners.keydown)fn({key:'n',target:work.context.document.body,preventDefault(){}});assert.equal(work.ids.taskDialog.open,false); // pressing N no longer opens Add task
  const moving=boot(new Map([['day-by-day.v1',JSON.stringify({version:4,tasks:[tasks[0]],completed:{}})]]),clock);
  moving.ids.overdueList.querySelector('.move-today').onclick();assert.equal(moving.state().tasks[0].date,'2026-10-28');assert.equal(moving.state().tasks[0].description,'Keep these notes');assert.equal(moving.ids.reminderPanel.hidden,true);
  moving.ids.undoAction.onclick();assert.equal(moving.state().tasks[0].date,'2026-10-27');assert.equal(moving.state().tasks[0].reminderFrom,0);
  const backup=boot(new Map([['day-by-day.v1',JSON.stringify({version:4,tasks:[tasks[3]],completed:{}})]]),clock);
  for(let i=0;i<25;i++)backup.ids.taskList.querySelector('.check-button').onclick();
  assert.equal(backup.ids.backupNotice.hidden,false);backup.ids.backupLater.onclick();assert.equal(backup.ids.backupNotice.hidden,true);
  backup.clock(clock+86400001);backup.windowListeners.focus.forEach(callback=>callback());assert.equal(backup.ids.backupNotice.hidden,false);
  backup.ids.backupNow.onclick();assert.equal(backup.ids.backupNotice.hidden,true);assert.match(backup.ids.lastBackup.textContent,/Last backup exported/);
  assert.equal(JSON.parse(backup.storage.get('day-by-day.backup.v1')).changes,0);
  const reopened=boot(backup.storage,clock+86400001);assert.match(reopened.ids.lastBackup.textContent,/Last backup exported/);
  // The restore dialog can cancel replacement without altering the saved checklist.
  reopened.ids.restoreFile.files=[{size:100,text:async()=>JSON.stringify({version:4,tasks:[],completed:{}})}];
  const cancelRestore=reopened.ids.restoreFile.onchange();await new Promise(resolve=>setImmediate(resolve));reopened.ids.cancelRestore.onclick();await cancelRestore;
  assert.equal(reopened.state().tasks.length,1);
  const newPast=boot(new Map(),clock);newPast.ids.addTask.onclick();newPast.ids.taskTitle.value='Past due entry';newPast.ids.taskForm.elements.timing.value='timed';newPast.ids.taskTime.value='08:00';newPast.inputs.find(input=>input.name==='reminders'&&input.value==='5').checked=true;newPast.ids.taskForm.dispatch('submit');
  assert.equal(newPast.ids.reminderPanel.hidden,true);
  // Validate stable names for completion toggles in both states.
  const button=newPast.ids.overdueList.querySelector('.check-button'),label=button.getAttribute('aria-label');assert.match(label,/^Past due entry, /);assert.match(label,/2026/);button.onclick();
  assert.equal(newPast.ids.taskList.querySelector('.check-button').getAttribute('aria-label'),label);
  console.log('Reliability runtime passed: overdue completion/move/undo, saved dates, edit focus, accessible Undo placement, live announcements, calendar counting, backup nudges/status/reload, restore cancel, removed single-key shortcut, and past-time reminders.');
}
verifyReliability().catch(error=>{console.error(error);process.exitCode=1;});
async function verifyReminderCoordination() {
  const tasks=[{id:'shared',title:'Shared reminder',kind:'once',date:'2026-10-28',time:'10:00',reminders:[15]}];
  const shared=new Map([['day-by-day.v1',JSON.stringify({version:4,tasks,completed:{}})]]);
  let held=false;
  const locks={request:(_name,_options,callback)=>Promise.resolve().then(()=>{
    if(held)return callback(null);
    held=true;return Promise.resolve(callback({name:'test'})).finally(()=>{held=false;});
  })};
  const first=boot(shared,clock,{navigator:{locks},notifications:true}),second=boot(shared,clock,{navigator:{locks},notifications:true});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(first.notices.length+second.notices.length,1);
  first.tick();second.tick();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(first.notices.length+second.notices.length,1);
  const fallback=boot(new Map([['day-by-day.v1',JSON.stringify({version:4,tasks,completed:{}})]]),clock,{navigator:{locks:{request:()=>Promise.reject(Error('not supported for origin'))}},notifications:true});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(fallback.notices.length,1);
  const protection=boot(new Map(),clock,{secure:true,navigator:{storage:{persist:async()=>true}}});
  assert.equal(protection.ids.protectStorage.hidden,false);await protection.ids.protectStorage.onclick();assert.match(protection.ids.storageProtectionStatus.textContent,/granted/);
  const refused=boot(new Map(),clock,{secure:true,navigator:{storage:{persist:async()=>false}}});await refused.ids.protectStorage.onclick();assert.match(refused.ids.storageProtectionStatus.textContent,/did not grant/);
  const unsupported=boot(new Map(),clock);assert.equal(unsupported.ids.protectStorage.hidden,true);
  console.log('Reminder coordination passed: shared-tab lock, duplicate suppression, unsupported-origin fallback, and optional storage protection grant/refusal.');
}
verifyReminderCoordination().catch(error=>{console.error(error);process.exitCode=1;});
async function verifyWeekdayOrdersAndHistory() {
  const clock=new Date(2026,9,28,8,0).getTime();
  const weekdays=[[1,2,3],[1,2],[1,3]],titles=['A','B','C'];
  const tasks=titles.map((title,index)=>({id:title.toLowerCase(),title,kind:'weekly',weekdays:weekdays[index],startDate:'2026-10-01',time:`${String(9+index).padStart(2,'0')}:00`,reminders:[],description:'Original notes'}));
  const store=new Map([['day-by-day.v1',JSON.stringify({version:4,tasks,completed:{'2026-10-26':['a']}})]]);
  let work=boot(store,clock);
  const rows=()=>work.ids.taskList.querySelectorAll('.task-row');
  const ids=()=>rows().map(row=>row.dataset.id);
  assert.deepEqual(ids(),['a','c']);rows()[1].querySelector('.move-up').onclick();assert.deepEqual(ids(),['c','a']);
  assert.deepEqual(work.state().tasks.map(task=>task.id),['a','b','c']);
  work.ids.weekStrip.children[1].onclick();assert.deepEqual(ids(),['a','b']);rows()[1].querySelector('.move-up').onclick();assert.deepEqual(ids(),['b','a']);
  work.ids.weekStrip.children[0].onclick();assert.deepEqual(ids(),['b','c','a']); // A is completed on this Monday; pending tasks retain automatic order.
  work.ids.weekStrip.children[2].onclick();assert.deepEqual(ids(),['c','a']);work.ids.nextWeek.onclick();assert.deepEqual(ids(),['c','a']);
  work.ids.sortDay.onclick();assert.deepEqual(ids(),['a','c']);work.ids.weekStrip.children[1].onclick();assert.deepEqual(ids(),['b','a']);
  work=boot(store,clock);assert.deepEqual(ids(),['a','c']);work.ids.weekStrip.children[1].onclick();assert.deepEqual(ids(),['b','a']);
  work.ids.todayNav.onclick();
  const a=rows().find(row=>row.dataset.id==='a');a.querySelector('.check-button').onclick();
  rows().find(row=>row.dataset.id==='a').querySelector('.edit-task').onclick();
  assert.equal(work.ids.taskEffectiveDate.value,'2026-10-28');
  work.ids.taskTitle.value='A revised';work.ids.taskDescription.value='Revised notes';work.ids.taskTime.value='15:00';work.ids.taskEffectiveDate.value='2026-10-29';work.ids.taskForm.dispatch('submit');
  assert.equal(rows().find(row=>row.dataset.id==='a').querySelector('.task-name').textContent,'A');
  work.ids.nextWeek.onclick();assert.equal(rows().find(row=>row.dataset.id==='a').querySelector('.task-name').textContent,'A revised');
  assert.equal(rows().find(row=>row.dataset.id==='a').querySelector('.description-body').textContent,'Revised notes');
  rows().find(row=>row.dataset.id==='a').querySelector('.skip-task').onclick();assert.equal(ids().includes('a'),false);assert.equal(work.ids.skippedSection.hidden,false);
  work.ids.skippedList.querySelector('.restore-occurrence').onclick();assert.equal(ids().includes('a'),true);
  rows().find(row=>row.dataset.id==='a').querySelector('.skip-task').onclick();work.ids.nextWeek.onclick();assert.equal(ids().includes('a'),true);
  work.ids.todayNav.onclick();rows().find(row=>row.dataset.id==='a').querySelector('.edit-task').onclick();
  work.ids.taskEffectiveDate.value='2026-10-27';work.ids.taskForm.dispatch('submit');assert.match(work.ids.formError.textContent,/on or after today/);
  work.ids.taskEffectiveDate.value='2026-10-28';work.ids.deleteTask.onclick();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(work.state().tasks.length,3);assert.equal(work.ids.endedRoutines.hidden,false);assert.match(work.ids.endedRoutineList.textContent,/A/);
  assert.equal(rows().find(row=>row.dataset.id==='a').querySelector('.task-name').textContent,'A'); // completed today remains historical
  work=boot(store,clock);assert.equal(work.state().completed['2026-10-26'].includes('a'),true);assert.equal(work.state().tasks[0].endedOn,'2026-10-28');
  assert.equal(work.ids.endedRoutines.hidden,false);work.ids.nextWeek.onclick();assert.equal(ids().includes('a'),false);
  work.ids.todayNav.onclick();rows().find(row=>row.dataset.id==='a').querySelector('.edit-task').onclick();
  assert.equal(work.ids.dialogTitle.textContent,'Routine history');assert.equal(work.ids.saveTask.hidden,true);assert.equal(work.ids.taskTitle.disabled,true);assert.equal(work.ids.deleteTask.hidden,true);
  work.ids.cancelDialog.onclick();
  const backup=JSON.stringify(work.state());const restored=boot(new Map([['day-by-day.v1',backup]]),clock);
  assert.equal(restored.ids.storageWarning.hidden,true);assert.equal(restored.ids.endedRoutines.hidden,false);assert.equal(restored.ids.taskList.querySelectorAll('.task-row').some(row=>row.dataset.id==='a'),true);
  console.log('Weekday/history runtime passed: independent weekdays, future-week reuse, scoped reset, unchanged task array, dated edits, completed snapshots, skip/restore, ending without deletion, archive reload, read-only history, and backup migration.');
}
verifyWeekdayOrdersAndHistory().catch(error=>{console.error(error);process.exitCode=1;});
async function verifyOneTimeConversion() {
  for (const [date,completed] of [['2026-10-28',false],['2026-10-28',true],['2026-10-20',false],['2026-10-20',true],['2026-10-30',false],['2026-10-30',true]]) {
    const original={id:'once',kind:'once',title:'Test task',description:'Notes https://example.com',date,time:'11:00',reminders:[15],reminderFrom:0};
    const saved={version:5,tasks:[original],completed:completed?{[date]:['once']}:{},weekdayOrders:{3:['once']},routineOrder:null};
    const store=new Map([['day-by-day.v1',JSON.stringify(saved)]]);
    let work=boot(store,clock);
    // Open the original occurrence from its calendar week.
    if(date<'2026-10-26')work.ids.prevWeek.onclick();
    work.ids.weekStrip.children[date==='2026-10-20'?1:date==='2026-10-30'?4:2].onclick();
    work.ids.taskList.querySelector('.edit-task').onclick();
    const weekly=work.ids.taskForm.elements.kind.find(input=>input.value==='weekly');
    assert.equal(weekly.disabled,false);
    work.ids.taskForm.elements.kind.value='weekly';weekly.onchange();
    assert.equal(work.ids.weeklyDays.hidden,false);assert.equal(work.ids.routineChanges.hidden,true);
    work.ids.workdaysPreset.onclick();
    work.ids.taskTitle.value='Converted task';work.ids.taskForm.dispatch('submit');
    await new Promise(resolve=>setImmediate(resolve));
    const state=work.state(),task=state.tasks[0];
    assert.equal(state.tasks.length,1);assert.equal(task.id,'once');assert.equal(task.kind,'weekly');
    assert.deepEqual(task.weekdays,[1,2,3,4,5]);assert.equal(task.description,original.description);
    assert.equal(task.time,'11:00');assert.deepEqual(task.reminders,[15]);
    assert.deepEqual(state.weekdayOrders[3],['once']);assert.deepEqual(state.completed,saved.completed);
    assert.equal(task.versions[0].from,date<'2026-10-28'?'2026-10-28':date);
    const keepsOriginal=date<'2026-10-28'||completed;
    assert.equal(Boolean(task.snapshots[date]),keepsOriginal);
    if(keepsOriginal)assert.equal(task.snapshots[date].title,original.title);
    assert.equal(work.ids.formError.textContent,'');assert.equal(work.ids.storageWarning.hidden,true);
    // Serialized saved data uses the same validation path as reopening/restoring a backup.
    work=boot(store,clock);assert.equal(work.ids.storageWarning.hidden,true);assert.equal(work.state().tasks[0].kind,'weekly');
    work.ids.nextWeek.onclick();
    assert.equal(work.ids.taskList.querySelector('.check-button').getAttribute('aria-pressed'),'false');
    work.ids.taskList.querySelector('.edit-task').onclick();
    assert.equal(work.ids.taskForm.elements.kind.value,'weekly');assert.equal(work.ids.taskTitle.value,'Converted task');
  }
  const undo=boot(new Map([['day-by-day.v1',JSON.stringify({version:5,tasks:[{id:'undo',kind:'once',title:'Undo conversion',date:'2026-10-28'}],completed:{}})]]),clock);
  undo.ids.taskList.querySelector('.edit-task').onclick();
  undo.ids.taskForm.elements.kind.value='weekly';undo.ids.taskForm.elements.kind[1].onchange();undo.ids.taskForm.dispatch('submit');
  assert.equal(undo.state().tasks[0].kind,'weekly');undo.ids.undoAction.onclick();assert.equal(undo.state().tasks[0].kind,'once');
  assert.equal(undo.state().tasks[0].date,'2026-10-28');
  console.log('Conversion runtime passed: enabled frequency controls, weekday presets, past/today/future and completed tasks, notes/time/reminders, IDs/orders/history, reload, fresh future checkboxes, and Undo.');
}
verifyOneTimeConversion().catch(error=>{console.error(error);process.exitCode=1;});
async function verifyOverdue() {
  assert.ok(html.indexOf('id="overdueSection"')<html.indexOf('aria-label="Daily checklist"'));
  assert.match(html,/id="overdueTitle"[^>]*>Overdue /);assert.equal(html.includes('Earlier, unfinished'),false);
  const tasks=[
    {id:'old',title:'Yesterday',kind:'once',date:'2026-10-27'},
    {id:'once',title:'One-time deadline',kind:'once',date:'2026-10-28',time:'09:00',description:'Keep notes https://example.com'},
    {id:'routine',title:'Routine deadline',kind:'weekly',weekdays:[3,4],startDate:'2026-10-01',time:'09:30'},
    {id:'later',title:'Later deadline',kind:'once',date:'2026-10-28',time:'10:00'},
    {id:'all',title:'All day',kind:'once',date:'2026-10-28'},
    {id:'done',title:'Completed deadline',kind:'once',date:'2026-10-28',time:'08:00'},
    {id:'past-routine',title:'Missed yesterday routine',kind:'weekly',weekdays:[2],startDate:'2026-10-01',time:'08:00'},
    {id:'skipped',title:'Skipped deadline',kind:'weekly',weekdays:[3],startDate:'2026-10-01',time:'08:00',exceptions:['2026-10-28']}
  ];
  const store=new Map([['day-by-day.v1',JSON.stringify({version:5,tasks,completed:{'2026-10-28':['done']}})]]);
  let work=boot(store,clock);
  const ids=container=>container.querySelectorAll('.task-row').map(row=>row.dataset.id);
  const row=(container,id)=>container.querySelectorAll('.task-row').find(item=>item.dataset.id===id);
  assert.deepEqual(ids(work.ids.overdueList),['old','once','routine']);assert.equal(work.ids.overdueCount.textContent,'3');
  assert.deepEqual(ids(work.ids.taskList),['later','all','done']);assert.equal(work.ids.todayCount.textContent,'5');
  assert.equal(work.ids.taskTotal.textContent,'5');assert.equal(work.ids.completionText.textContent,'1 of 5 complete');
  // Today's overdue tasks retain weekday ordering controls beside their checkbox.
  row(work.ids.overdueList,'routine').querySelector('.move-up').onclick();
  assert.deepEqual(ids(work.ids.overdueList),['old','routine','once']);assert.ok(work.state().weekdayOrders[3]);
  assert.equal(work.context.document.activeElement,row(work.ids.overdueList,'routine'));
  row(work.ids.overdueList,'once').querySelector('.check-button').onclick();
  assert.deepEqual(work.state().completed['2026-10-28'],['done','once']);
  assert.equal(ids(work.ids.overdueList).includes('once'),false);assert.equal(ids(work.ids.taskList).includes('once'),true);
  assert.equal(work.context.document.activeElement,row(work.ids.taskList,'once').querySelector('.check-button'));
  row(work.ids.taskList,'once').querySelector('.check-button').onclick();assert.equal(ids(work.ids.overdueList).includes('once'),true);
  row(work.ids.overdueList,'once').querySelector('.edit-task').onclick();
  assert.equal(work.ids.taskDescription.value,'Keep notes https://example.com');
  work.ids.taskTime.value='13:00';work.ids.taskForm.dispatch('submit');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ids(work.ids.overdueList).includes('once'),false);assert.equal(ids(work.ids.taskList).includes('once'),true);
  row(work.ids.overdueList,'routine').querySelector('.skip-task').onclick();assert.equal(ids(work.ids.overdueList).includes('routine'),false);
  work.ids.skippedList.querySelector('.restore-occurrence').onclick();assert.equal(ids(work.ids.overdueList).includes('routine'),true);
  // Crossing a deadline updates the lists without reloading, double counting, or losing control focus.
  row(work.ids.taskList,'later').querySelector('.check-button').focus();
  const before=work.ids.taskList.querySelectorAll('.task-row')[0];
  work.clock(new Date(2026,9,28,10,0).getTime());work.refresh();
  assert.equal(row(work.ids.taskList,'later')!==undefined,true);assert.equal(work.ids.taskList.querySelectorAll('.task-row')[0],before);
  work.clock(new Date(2026,9,28,10,0,1).getTime());work.refresh();
  assert.equal(ids(work.ids.taskList).includes('later'),false);assert.equal(ids(work.ids.overdueList).includes('later'),true);
  assert.equal(work.context.document.activeElement,row(work.ids.overdueList,'later').querySelector('.check-button'));
  assert.equal(work.ids.todayCount.textContent,'5');
  work=boot(store,new Date(2026,9,28,10,1).getTime());assert.equal(ids(work.ids.overdueList).includes('later'),true);
  work.ids.nextWeek.onclick();assert.equal(work.ids.overdueSection.hidden,true);work.ids.todayNav.onclick();assert.equal(work.ids.overdueSection.hidden,false);
  // A sleeping tab catches up on focus/visibility; all-day tasks remain in the checklist until the date changes.
  work.clock(new Date(2026,9,28,14,0).getTime());work.windowListeners.focus.forEach(callback=>callback());
  assert.equal(ids(work.ids.overdueList).includes('once'),true);assert.equal(ids(work.ids.taskList).includes('all'),true);
  work.clock(new Date(2026,9,29,0,0).getTime());work.documentListeners.visibilitychange.forEach(callback=>callback());
  assert.equal(work.ids.dayTitle.textContent,'Thursday.');assert.equal(ids(work.ids.overdueList).includes('all'),true);
  assert.equal(ids(work.ids.overdueList).includes('routine'),false);assert.equal(ids(work.ids.taskList).includes('routine'),true);
  // Keep the edit dialog and unsaved text intact if a deadline passes while it is open.
  const editing=boot(new Map([['day-by-day.v1',JSON.stringify({version:5,tasks:[tasks[3]],completed:{}})]]),clock);
  editing.ids.taskList.querySelector('.edit-task').onclick();editing.ids.taskDescription.value='Unsaved notes';
  editing.clock(new Date(2026,9,28,10,0,1).getTime());editing.refresh();assert.equal(editing.ids.taskDialog.open,true);assert.equal(editing.ids.taskDescription.value,'Unsaved notes');
  editing.ids.taskForm.dispatch('submit');assert.equal(editing.state().tasks[0].description,'Unsaved notes');
  assert.match(editing.ids.taskList.textContent,/remaining tasks are overdue/);assert.equal(editing.ids.progressBar.style.width,'0%');
  editing.ids.overdueList.querySelector('.check-button').onclick();assert.equal(editing.ids.overdueSection.hidden,true);assert.equal(editing.ids.progressBar.style.width,'100%');
  console.log('Overdue runtime passed: section placement/wording, no duplicate rows/counts, completion focus/history, edit/reschedule, weekday arrows, skip/restore, timer/focus/visibility refresh, midnight, reload, and open-dialog safety.');
}
verifyOverdue().catch(error=>{console.error(error);process.exitCode=1;});
async function verifyNotificationTimeouts() {
  const task={id:'test',kind:'once',title:'Test',date:'2026-10-28',time:'11:00'};
  const makeWork=()=>boot(new Map([['day-by-day.v1',JSON.stringify({version:5,tasks:[task],completed:{}})]]),clock);
  function edit(work,title) {
    work.ids.taskList.querySelector('.edit-task').onclick();work.ids.taskTitle.value=title;work.ids.taskForm.dispatch('submit');
  }
  function remove(work) { work.ids.taskList.querySelector('.edit-task').onclick();work.ids.deleteTask.onclick(); }
  // Plain confirmations and action banners get the full ten seconds, without duplicate displays.
  const plain=makeWork();edit(plain,'Updated');assert.equal(plain.ids.toast.hidden,false);assert.equal(plain.ids.undoNotice.hidden,true);
  plain.advance(9999);assert.equal(plain.ids.toast.hidden,false);plain.advance(1);assert.equal(plain.ids.toast.hidden,true);
  assert.equal(plain.ids.statusAnnouncement.textContent,'Task updated.');assert.equal(plain.ids.statusAnnouncement.hidden,false);
  const expiry=makeWork();remove(expiry);assert.equal(expiry.ids.undoNotice.hidden,false);assert.equal(expiry.ids.toast.hidden,true);
  expiry.advance(9999);assert.equal(expiry.ids.undoNotice.hidden,false);expiry.advance(1);assert.equal(expiry.ids.undoNotice.hidden,true);
  expiry.ids.undoAction.onclick();assert.equal(expiry.state().tasks.length,0); // expired Undo cannot act later
  const undone=makeWork();remove(undone);undone.advance(9000);undone.ids.undoAction.onclick();assert.equal(undone.state().tasks.length,1);
  undone.advance(1000);assert.equal(undone.ids.toast.hidden,false);undone.advance(9000);assert.equal(undone.ids.toast.hidden,true);
  // Replacement, manual dismissal, and a superseding mutation cancel stale timer callbacks.
  const replaced=makeWork();edit(replaced,'First');replaced.advance(6000);edit(replaced,'Second');replaced.advance(4000);
  assert.equal(replaced.ids.toast.hidden,false);replaced.advance(6000);assert.equal(replaced.ids.toast.hidden,true);
  edit(replaced,'Dismiss me');replaced.ids.dismissToast.onclick();assert.equal(replaced.ids.toast.hidden,true);
  remove(replaced);replaced.ids.dismissUndo.onclick();assert.equal(replaced.ids.undoNotice.hidden,true);
  replaced.ids.undoAction.onclick();assert.equal(replaced.state().tasks.length,0);replaced.advance(10000);
  const superseded=makeWork();remove(superseded);superseded.ids.addTask.onclick();superseded.ids.taskTitle.value='Next action';superseded.ids.taskForm.dispatch('submit');
  assert.equal(superseded.ids.undoNotice.hidden,true);superseded.ids.undoAction.onclick();assert.equal(superseded.state().tasks.length,1);
  // Hover and keyboard focus pause the remaining time, including movement between banner controls.
  const hover=makeWork();remove(hover);hover.advance(6000);hover.ids.undoNotice.dispatch('pointerenter');hover.advance(60000);
  assert.equal(hover.ids.undoNotice.hidden,false);hover.ids.undoNotice.dispatch('pointerleave');hover.advance(3999);assert.equal(hover.ids.undoNotice.hidden,false);
  hover.advance(1);assert.equal(hover.ids.undoNotice.hidden,true);
  const focus=makeWork();remove(focus);await new Promise(resolve=>setImmediate(resolve));
  focus.advance(1000);focus.ids.undoAction.focus();focus.ids.undoNotice.dispatch('focusin');focus.advance(60000);
  assert.equal(focus.ids.undoNotice.hidden,false);focus.ids.dismissUndo.focus();focus.ids.undoNotice.dispatch('focusout');await new Promise(resolve=>setImmediate(resolve));focus.advance(60000);
  assert.equal(focus.ids.undoNotice.hidden,false);focus.ids.inlineAdd.focus();focus.ids.undoNotice.dispatch('focusout');await new Promise(resolve=>setImmediate(resolve));
  focus.advance(8999);assert.equal(focus.ids.undoNotice.hidden,false);focus.advance(1);assert.equal(focus.ids.undoNotice.hidden,true);
  const toastFocus=makeWork();edit(toastFocus,'Focused confirmation');toastFocus.ids.dismissToast.focus();toastFocus.ids.toast.dispatch('focusin');toastFocus.advance(60000);
  assert.equal(toastFocus.ids.toast.hidden,false);toastFocus.ids.dismissToast.onclick();assert.equal(toastFocus.ids.toast.hidden,true);
  // Hidden tabs don't consume the reading time. Reminder alerts never use these timers.
  const hidden=makeWork();edit(hidden,'Tab switch');hidden.advance(3000);hidden.context.document.hidden=true;
  hidden.documentListeners.visibilitychange.forEach(callback=>callback());hidden.advance(60000);assert.equal(hidden.ids.toast.hidden,false);
  hidden.context.document.hidden=false;hidden.documentListeners.visibilitychange.forEach(callback=>callback());hidden.advance(6999);
  assert.equal(hidden.ids.toast.hidden,false);hidden.advance(1);assert.equal(hidden.ids.toast.hidden,true);
  const reminders=boot(new Map([['day-by-day.v1',JSON.stringify({version:5,tasks:[task,{id:'reminder',kind:'once',title:'Due soon',date:'2026-10-28',time:'10:00',reminders:[15]}],completed:{}})]]),clock);
  reminders.ids.taskList.querySelectorAll('.task-row').find(row=>row.dataset.id==='test').querySelector('.edit-task').onclick();reminders.ids.deleteTask.onclick();
  reminders.advance(60000);assert.equal(reminders.ids.undoNotice.hidden,true);assert.equal(reminders.ids.reminderPanel.hidden,false);
  reminders.tick();assert.equal(reminders.ids.reminderPanel.hidden,false);assert.equal(JSON.parse(reminders.storage.get('day-by-day.reminders.v1')).alerts.length,1);
  reminders.ids.dismissAllReminders.onclick();assert.equal(reminders.ids.reminderPanel.hidden,true);
  console.log('Notification timing passed: 10-second boundaries, Undo expiry/use, manual dismissal, newer messages/mutations, hover/focus pauses, hidden tabs, live announcements, and persistent task reminders.');
}
verifyNotificationTimeouts().catch(error=>{console.error(error);process.exitCode=1;});
async function verifyLoadRecovery() {
  const key='day-by-day.v1';
  const valid={version:5,tasks:[{id:'kept',kind:'once',title:'Saved work',date:'2026-10-28'}],completed:{}};
  const invalids=[' {"version":5,\n broken JSON ',JSON.stringify({...valid,tasks:[...valid.tasks,{id:'bad',kind:'once',title:'Invalid time',date:'2026-10-28',time:'25:00'}]})];
  for(const raw of invalids) {
    const storage=new Map([[key,raw]]),work=boot(storage,clock);
    assert.equal(work.ids.storageWarning.hidden,false);assert.equal(work.ids.downloadOriginalData.hidden,false);
    assert.match(work.ids.storageWarningText.textContent,/kept untouched/);assert.equal(work.ids.taskList.querySelector('.task-row'),null);
    work.ids.downloadOriginalData.onclick();assert.equal(await work.downloads[0].blob.text(),raw);
    assert.match(work.downloads[0].name,/^day-by-day-recovery-/);assert.equal(storage.get(key),raw);
    work.ids.backupBtn.onclick();assert.equal(await work.downloads[1].blob.text(),raw);assert.equal(storage.has('day-by-day.backup.v1'),false);
    // Session edits remain exportable without overwriting or mislabelling the original data.
    work.ids.addTask.onclick();work.ids.taskTitle.value='Unsaved session task';work.ids.taskForm.dispatch('submit');
    assert.equal(storage.get(key),raw);work.ids.backupBtn.onclick();
    const session=work.downloads.at(-1);assert.match(session.name,/^day-by-day-session-/);
    assert.equal(JSON.parse(await session.blob.text()).tasks[0].title,'Unsaved session task');
    assert.equal(JSON.parse(storage.get('day-by-day.backup.v1')).lastExported,0);
    work.ids.downloadOriginalData.onclick();assert.equal(await work.downloads.at(-1).blob.text(),raw);
    const reopened=boot(storage,clock);assert.equal(reopened.ids.downloadOriginalData.hidden,false);assert.equal(storage.get(key),raw);
  }
  const raw=invalids[0],storage=new Map([[key,raw]]),options={storageWriteFails:true},work=boot(storage,clock,options);
  async function restore(accept) {
    work.ids.restoreFile.files=[{size:100,text:async()=>JSON.stringify(valid)}];
    const pending=work.ids.restoreFile.onchange();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(work.ids.restoreDialog.open,true);assert.match(work.ids.restoreMessage.textContent,/original saved data/);
    work.ids[accept?'confirmRestore':'cancelRestore'].onclick();await pending;
  }
  await restore(false);assert.equal(storage.get(key),raw);
  await restore(true);assert.equal(storage.get(key),raw);assert.equal(work.ids.storageWarning.hidden,false);assert.equal(work.ids.downloadOriginalData.hidden,false);
  work.ids.downloadOriginalData.onclick();assert.equal(await work.downloads.at(-1).blob.text(),raw);
  options.storageWriteFails=false;await restore(true);assert.equal(work.state().tasks[0].title,'Saved work');
  assert.equal(work.ids.storageWarning.hidden,true);assert.equal(work.ids.downloadOriginalData.hidden,true);
  work.ids.backupBtn.onclick();assert.match(work.downloads.at(-1).name,/^day-by-day-backup-/);assert.equal(JSON.parse(await work.downloads.at(-1).blob.text()).tasks[0].id,'kept');
  const blocked=boot(new Map(),clock,{storageReadFails:true});assert.equal(blocked.ids.storageWarning.hidden,false);assert.equal(blocked.ids.downloadOriginalData.hidden,true);
  blocked.ids.backupBtn.onclick();assert.equal(blocked.downloads.length,0);assert.match(blocked.ids.toastMessage.textContent,/could not be accessed/);
  blocked.ids.addTask.onclick();blocked.ids.taskTitle.value='Offline session';blocked.ids.taskForm.dispatch('submit');blocked.ids.backupBtn.onclick();
  assert.match(blocked.downloads.at(-1).name,/^day-by-day-session-/);
  // A normal quota error exports the valid session instead of switching to raw recovery.
  const quota=boot(new Map([[key,JSON.stringify(valid)]]),clock,{storageWriteFails:true});quota.ids.taskList.querySelector('.check-button').onclick();quota.ids.backupBtn.onclick();
  assert.equal(quota.ids.downloadOriginalData.hidden,true);assert.equal(JSON.parse(await quota.downloads.at(-1).blob.text()).completed['2026-10-28'][0],'kept');
  // Invalid cross-tab updates can be recovered; a later valid update clears recovery mode.
  storage.set(key,raw);work.windowListeners.storage.forEach(callback=>callback({key,newValue:raw}));
  assert.equal(work.ids.downloadOriginalData.hidden,false);work.ids.downloadOriginalData.onclick();assert.equal(await work.downloads.at(-1).blob.text(),raw);
  storage.set(key,JSON.stringify(valid));work.windowListeners.storage.forEach(callback=>callback({key,newValue:JSON.stringify(valid)}));
  assert.equal(work.ids.storageWarning.hidden,true);assert.equal(work.ids.downloadOriginalData.hidden,true);
  console.log('Load recovery passed: unchanged raw exports for malformed/invalid records, no empty fallback backups, separate session exports, protected originals, restore cancel/write failure/success, denied storage, quota errors, and cross-tab recovery.');
}
verifyLoadRecovery().catch(error=>{console.error(error);process.exitCode=1;});
async function verifyRoutineEditFixes() {
  const fields={title:'Original routine',description:'Original details',weekdays:[3],startDate:'2026-10-01',time:'11:00',reminders:[15],reminderFrom:0};
  const later={...fields,title:'Later planned routine',description:'Keep this future plan',time:'16:00'};
  const task={id:'routine',kind:'weekly',...later,versions:[{from:'2026-10-01',...fields},{from:'2026-11-05',...later}],snapshots:{'2026-10-21':fields},exceptions:['2026-11-11'],endedOn:null};
  const saved={version:5,tasks:[task],completed:{'2026-10-21':['routine']},weekdayOrders:{3:['routine']},routineOrder:['routine']};
  const storage=new Map([['day-by-day.v1',JSON.stringify(saved)]]),work=boot(storage,clock);
  const original=JSON.parse(JSON.stringify(work.context.window.DayByDay.validate(saved))).tasks[0];
  work.ids.nextWeek.onclick();work.ids.routinesNav.onclick();work.ids.routineList.querySelector('.edit-task').onclick();
  assert.equal(work.ids.taskEffectiveDate.value,'2026-10-28');assert.equal(work.ids.taskTitle.value,'Original routine');
  work.ids.taskTitle.value='Edited from catalog';work.ids.taskDescription.value='Changed today';work.ids.taskTime.value='12:00';work.ids.taskForm.dispatch('submit');
  assert.deepEqual(work.state().tasks[0].versions.map(version=>version.from),['2026-10-01','2026-10-28']);
  assert.equal(work.state().tasks[0].snapshots['2026-10-21'].title,'Original routine');assert.equal(work.ids.undoNotice.hidden,false);
  work.ids.undoAction.onclick();assert.deepEqual(work.state().tasks[0],original);assert.deepEqual(work.state().completed,saved.completed);
  assert.equal(work.context.document.activeElement,work.ids.addTask);
  // A deliberate future-day edit still defaults to that selected date.
  work.ids.weekStrip.children[2].onclick();work.ids.taskList.querySelector('.edit-task').onclick();
  assert.equal(work.ids.taskEffectiveDate.value,'2026-11-04');work.ids.taskTitle.value='Edit from future day';work.ids.taskForm.dispatch('submit');
  assert.equal(work.state().tasks[0].versions.at(-1).from,'2026-11-04');work.ids.undoAction.onclick();assert.deepEqual(work.state().tasks[0],original);
  await new Promise(resolve=>setImmediate(resolve));
  const reopened=boot(storage,clock);reopened.ids.routinesNav.onclick();assert.equal(reopened.ids.routineList.querySelector('.task-name').textContent,'Original routine');
  assert.deepEqual(reopened.state().tasks[0],original);
  console.log('Routine edit fixes passed: catalog defaults to today after future browsing, deliberate future-date edits, full Undo including future revisions/snapshots/exceptions/completions, visible catalog focus, and reload.');
}
verifyRoutineEditFixes().catch(error=>{console.error(error);process.exitCode=1;});
function verifyAnnouncementAndFocusFixes() {
  const key='day-by-day.v1';
  const tasks=['A','B','C','D'].map(title=>({id:title,title,kind:'once',date:'2026-10-28'}));
  const work=boot(new Map([[key,JSON.stringify({version:5,tasks,completed:{}})]]),clock);
  const row=()=>work.ids.taskList.querySelectorAll('.task-row').find(item=>item.dataset.id==='D');
  row().querySelector('.move-up').onclick();const message=work.ids.statusAnnouncement.textContent;assert.match(message,/moved up/);
  row().querySelector('.move-up').onclick();assert.equal(work.ids.statusAnnouncement.textContent,'');work.advance(49);assert.equal(work.ids.statusAnnouncement.textContent,'');
  work.advance(1);assert.equal(work.ids.statusAnnouncement.textContent,message);
  row().querySelector('.move-up').onclick();assert.equal(work.ids.statusAnnouncement.textContent,'');
  row().querySelector('.move-down').onclick();const latest=work.ids.statusAnnouncement.textContent;assert.match(latest,/moved down/);work.advance(100);assert.equal(work.ids.statusAnnouncement.textContent,latest);
  for(const time of [null,'08:00']) {
    const old={id:'moved',title:'Same title',kind:'once',date:'2026-10-27',time};
    const other={...old,id:'older',date:'2026-10-26'};
    const moving=boot(new Map([[key,JSON.stringify({version:5,tasks:[old,other],completed:{}})]]),clock);
    const labels=moving.ids.overdueList.querySelectorAll('.check-button').map(button=>button.getAttribute('aria-label'));
    assert.equal(new Set(labels).size,2);assert.ok(labels.every(label=>label.includes('2026')));
    moving.ids.weekStrip.children[1].onclick();moving.ids.taskList.querySelector('.move-today').onclick();
    assert.equal(moving.ids.dayTitle.textContent,'Wednesday.');assert.equal(moving.state().tasks[0].date,'2026-10-28');
    const container=time?moving.ids.overdueList:moving.ids.taskList;
    const moved=container.querySelectorAll('.task-row').find(item=>item.dataset.id==='moved');
    assert.equal(moving.context.document.activeElement,moved.querySelector('.edit-task'));
    const label=moved.querySelector('.check-button').getAttribute('aria-label');moved.querySelector('.check-button').onclick();
    const completed=moving.ids.taskList.querySelectorAll('.task-row').find(item=>item.dataset.id==='moved');
    assert.equal(completed.querySelector('.check-button').getAttribute('aria-label'),label);
  }
  console.log('Announcement/focus fixes passed: repeated messages re-announce, newer messages cancel pending announcements, same-name occurrence labels differ, stable completion labels, and Move to today focuses visible timed/all-day tasks.');
}
verifyAnnouncementAndFocusFixes();

function verifyMoveToTomorrow() {
  const key='day-by-day.v1',now=new Date(2026,10,4,19).getTime();
  const make=(tasks,completed={},at=now)=>{const store=new Map([[key,JSON.stringify({version:5,tasks,completed})]]);return boot(store,at);};
  const row=(app,id,list='overdueList')=>app.ids[list].querySelectorAll('.task-row').find(item=>item.dataset.id===id);
  const task={id:'tonight',kind:'once',title:'Evening task',date:'2026-11-04',time:'18:30',description:'Keep notes https://example.com',reminders:[15,5],reminderFrom:123};
  let app=make([task]);
  assert.equal(row(app,task.id).querySelector('.move-tomorrow').textContent,'Move to tomorrow');
  const old=app.context.window.DayByDay.validate(app.state()).tasks[0];
  const control=row(app,task.id).querySelector('.move-tomorrow');
  assert.equal(control.getAttribute('aria-label'),'Move Evening task to tomorrow');control.onclick();
  let moved=app.state().tasks[0];assert.equal(moved.date,'2026-11-05');assert.equal(moved.time,'18:30');assert.equal(moved.id,task.id);
  assert.equal(moved.description,task.description);assert.deepEqual(moved.reminders,[15,5]);assert.equal(moved.reminderFrom,now);
  assert.equal(app.ids.dayTitle.textContent,'Wednesday.');assert.equal(app.ids.overdueSection.hidden,true);assert.equal(app.ids.todayCount.textContent,'0');
  assert.equal(app.context.document.activeElement,app.ids.inlineAdd);assert.equal(app.ids.reminderPanel.hidden,true);
  assert.equal(app.state().completed['2026-11-04'],undefined);
  control.onclick();assert.equal(app.state().tasks[0].date,'2026-11-05'); // stale double click does not move again
  // Check Undo independently, then reopen the persisted deferred task.
  app=make([task]);row(app,task.id).querySelector('.move-tomorrow').onclick();app.ids.undoAction.onclick();
  assert.equal(JSON.stringify(app.state().tasks[0]),JSON.stringify(old));assert.ok(row(app,task.id));
  row(app,task.id).querySelector('.move-tomorrow').onclick();
  app=boot(app.storage,new Date(2026,10,5,18).getTime());
  assert.equal(row(app,task.id,'taskList').querySelector('.time-badge').textContent.includes('6:30')||row(app,task.id,'taskList').querySelector('.time-badge').textContent.includes('18:30'),true);
  assert.equal(row(app,task.id,'taskList').querySelector('.check-button').getAttribute('aria-pressed'),'false');
  assert.equal(row(app,task.id,'taskList').querySelector('.move-tomorrow'),null);
  // Only unfinished, timed, overdue tasks today offer the action; previous-day Move to today remains.
  app=make([task,{...task,id:'later',time:'20:00'},{...task,id:'done'},{...task,id:'all',time:null},{...task,id:'older',date:'2026-11-03'},{...task,id:'future',date:'2026-11-05'}],{'2026-11-04':['done']});
  assert.equal(app.ids.overdueList.querySelectorAll('.move-tomorrow').length,1);assert.ok(row(app,'older').querySelector('.move-today'));assert.equal(row(app,'older').querySelector('.move-tomorrow'),null);
  row(app,task.id).querySelector('.move-tomorrow').onclick();assert.equal(app.context.document.activeElement,row(app,'older').querySelector('.check-button'));
  app=make([task],{},new Date(2026,10,4,18,30).getTime());assert.equal(app.ids.overdueList.querySelector('.move-tomorrow'),null);
  app.clock(new Date(2026,10,4,18,30,1).getTime());app.refresh();assert.ok(row(app,task.id).querySelector('.move-tomorrow'));
  const completedControl=row(app,task.id).querySelector('.move-tomorrow');row(app,task.id).querySelector('.check-button').onclick();completedControl.onclick();assert.equal(app.state().tasks[0].date,'2026-11-04');assert.deepEqual(app.state().completed['2026-11-04'],[task.id]);
  // An overdue routine moves this resolved occurrence only. Tomorrow's normal repeat stays independent.
  const routine={id:'routine',kind:'weekly',title:'Current definition',weekdays:[3,4],startDate:'2026-10-01',time:'18:30',description:'Routine notes',reminders:[30],versions:[{from:'1900-01-01',title:'Current definition',weekdays:[3,4],startDate:'2026-10-01',time:'18:30',description:'Routine notes',reminders:[30]},{from:'2026-11-05',title:'Future definition',weekdays:[3,4],startDate:'2026-10-01',time:'20:00',description:'Future notes',reminders:[]}],snapshots:{'2026-11-04':{title:'Occurrence snapshot',weekdays:[3,4],startDate:'2026-10-01',time:'18:30',description:'Snapshot notes',reminders:[5]}}};
  app=make([routine],{'2026-10-28':['routine']});const original=JSON.parse(JSON.stringify(app.context.window.DayByDay.validate(app.state())));
  row(app,'routine').querySelector('.move-tomorrow').onclick();
  let state=app.state(),source=state.tasks.find(t=>t.id==='routine'),copy=state.tasks.find(t=>t.id!=='routine');
  assert.equal(copy.kind,'once');assert.equal(copy.date,'2026-11-05');assert.equal(copy.title,'Occurrence snapshot');assert.equal(copy.description,'Snapshot notes');assert.equal(copy.time,'18:30');assert.deepEqual(copy.reminders,[5]);
  assert.deepEqual(source.exceptions,['2026-11-04']);assert.equal(source.snapshots['2026-11-04'],undefined);assert.deepEqual(source.versions,original.tasks[0].versions);
  assert.deepEqual(state.completed,original.completed);assert.equal(app.ids.overdueSection.hidden,true);
  const roundtrip=app.context.window.DayByDay.validate(state);assert.equal(roundtrip.tasks.length,2);
  app.ids.undoAction.onclick();assert.deepEqual(app.state(),original);assert.ok(row(app,'routine'));
  row(app,'routine').querySelector('.move-tomorrow').onclick();state=app.state();copy=state.tasks.find(t=>t.id!=='routine');
  app=boot(app.storage,new Date(2026,10,5,17).getTime());
  assert.equal(app.ids.taskList.querySelectorAll('.task-row').length,2);assert.equal(row(app,'routine','taskList').querySelector('.task-name').textContent,'Future definition');assert.equal(row(app,copy.id,'taskList').querySelector('.task-name').textContent,'Occurrence snapshot');
  row(app,copy.id,'taskList').querySelector('.check-button').onclick();assert.equal(row(app,'routine','taskList').querySelector('.check-button').getAttribute('aria-pressed'),'false');
  // A once-weekly routine can move to a day that is not in its schedule.
  app=make([{...routine,weekdays:[3],versions:undefined,snapshots:undefined}]);row(app,'routine').querySelector('.move-tomorrow').onclick();
  const weekly=app.state().tasks[0];assert.equal(app.context.window.DayByDay.scheduled(weekly,'2026-11-05'),false);assert.equal(app.context.window.DayByDay.scheduled(weekly,'2026-11-11'),true);
  // Do not turn a stale post-midnight control into another date change.
  app=make([task]);const stale=row(app,task.id).querySelector('.move-tomorrow');app.clock(new Date(2026,10,5,0).getTime());stale.onclick();assert.equal(app.state().tasks[0].date,'2026-11-04');assert.equal(app.ids.dayTitle.textContent,'Thursday.');
  // Calendar arithmetic handles month/year changes, leap day, and DST without adding fixed milliseconds.
  for(const [from,to] of [['2026-12-31','2027-01-01'],['2028-02-28','2028-02-29'],['2026-10-31','2026-11-01'],['2026-03-08','2026-03-09']]) {
    const [y,m,d]=from.split('-').map(Number);app=make([{...task,date:from}],{},new Date(y,m-1,d,19).getTime());row(app,task.id).querySelector('.move-tomorrow').onclick();assert.equal(app.state().tasks[0].date,to);
  }
  console.log('Move to tomorrow passed: overdue-only action, details/reminders, one-time and routine occurrences, independent future repeats, snapshot handling, Undo, stale clicks, reload, focus, and calendar boundaries.');
}
verifyMoveToTomorrow();
function verifyReviewFixes() {
  const key='day-by-day.v1',wed=new Date(2026,10,4,19).getTime();
  const store=(tasks,completed={})=>new Map([[key,JSON.stringify({version:5,tasks,completed})]]);
  const row=(app,id,list='taskList')=>app.ids[list].querySelectorAll('.task-row').find(item=>item.dataset.id===id);
  const day=index=>{const d=new Date(1950,0,1+index,12);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  // Browser saving retries after a failure, and closing warns while changes reached no saved copy.
  const once={id:'plain',kind:'once',title:'Plain task',date:'2026-11-04'},options={storageWriteFails:true};
  let app=boot(store([once]),wed,options);
  const warns=()=>{let prevented=false;for(const fn of app.windowListeners.beforeunload||[])fn({preventDefault(){prevented=true;}});return prevented;};
  assert.equal(warns(),false);
  row(app,'plain').querySelector('.check-button').onclick();
  assert.equal(app.ids.storageWarning.hidden,false);assert.equal(app.state().completed['2026-11-04'],undefined);assert.equal(warns(),true);
  options.storageWriteFails=false;row(app,'plain').querySelector('.check-button').onclick();row(app,'plain').querySelector('.check-button').onclick();
  assert.deepEqual(app.state().completed['2026-11-04'],['plain']);assert.equal(app.ids.storageWarning.hidden,true);assert.equal(app.ids.saveStatus.textContent,'Saved in this browser');assert.equal(warns(),false);
  // Skip works on an unchecked occurrence that kept saved details from an earlier edit, and Restore brings those details back.
  const snap={title:'Saved details',weekdays:[3],startDate:'2026-10-01',time:null,reminders:[]};
  app=boot(store([{id:'gym',kind:'weekly',title:'Gym',weekdays:[3],startDate:'2026-10-01',snapshots:{'2026-11-04':snap}}]),wed);
  assert.equal(row(app,'gym').querySelector('.task-name').textContent,'Saved details');
  row(app,'gym').querySelector('.skip-task').onclick();
  assert.equal(row(app,'gym'),undefined);assert.equal(app.ids.skippedSection.hidden,false);assert.match(app.ids.skippedList.textContent,/Saved details/);
  app.ids.skippedList.querySelector('.restore-occurrence').onclick();assert.equal(row(app,'gym').querySelector('.task-name').textContent,'Saved details');
  // A moved routine occurrence is labeled, and its original date offers no Restore that would duplicate it.
  const routine={id:'routine',kind:'weekly',title:'Evening run',weekdays:[3,4],startDate:'2026-10-01',time:'18:30',reminders:[]};
  app=boot(store([routine]),wed);row(app,'routine','overdueList').querySelector('.move-tomorrow').onclick();
  let copy=app.state().tasks.find(task=>task.id!=='routine');
  assert.deepEqual(copy.movedFrom,{taskId:'routine',date:'2026-11-04'});
  assert.equal(app.ids.skippedSection.hidden,false);assert.equal(app.ids.skippedList.querySelector('.restore-occurrence'),null);assert.match(app.ids.skippedList.textContent,/Moved to/);
  app=boot(app.storage,new Date(2026,10,5,9).getTime());
  assert.match(row(app,copy.id).querySelector('.moved-link').textContent,/Moved from/);assert.equal(row(app,'routine').querySelector('.moved-link'),null);assert.equal(row(app,'routine').querySelector('.task-meta').textContent.includes('Moved'),false);
  row(app,copy.id).querySelector('.edit-task').onclick();app.ids.taskTitle.value='Evening run, renamed';app.ids.taskForm.dispatch('submit');
  assert.deepEqual(app.state().tasks.find(task=>task.id===copy.id).movedFrom,{taskId:'routine',date:'2026-11-04'});
  app=boot(app.storage,wed);
  const validate=app.context.window.DayByDay.validate;
  assert.equal(validate(app.state()).tasks.length,2);
  assert.throws(()=>validate({version:5,tasks:[{...once,movedFrom:{taskId:'routine',date:'not-a-date'}}],completed:{}}),/moved/);
  // Deleting the moved copy brings back Restore for the original date.
  app=boot(store([routine]),wed);row(app,'routine','overdueList').querySelector('.move-tomorrow').onclick();
  copy=app.state().tasks.find(task=>task.id!=='routine');app=boot(app.storage,wed);
  app.ids.weekStrip.children[3].onclick();row(app,copy.id).querySelector('.edit-task').onclick();app.ids.deleteTask.onclick();
  app.ids.jumpToday.onclick();assert.ok(app.ids.skippedList.querySelector('.restore-occurrence'));
  // Adding a reminder to a task that is already overdue sends no old alert.
  const at11=new Date(2026,10,4,11).getTime();
  app=boot(store([{id:'late',kind:'once',title:'Morning call',date:'2026-11-04',time:'09:00',reminders:[],reminderFrom:new Date(2026,10,4,8).getTime()}]),at11);
  row(app,'late','overdueList').querySelector('.edit-task').onclick();
  app.inputs.find(input=>input.name==='reminders'&&input.value==='15').checked=true;app.ids.taskForm.dispatch('submit');
  assert.deepEqual(app.state().tasks[0].reminders,[15]);assert.equal(app.state().tasks[0].reminderFrom,at11);
  app.tick();assert.equal(app.ids.reminderPanel.hidden,true);assert.equal(JSON.parse(app.storage.get('day-by-day.reminders.v1')||'{"alerts":[]}').alerts.length,0);
  // Saving stays within the limits that loading accepts.
  const many=Array.from({length:20000},(_,index)=>({id:`t${index}`,kind:'once',title:`Task ${index}`,date:day(index)}));
  app=boot(store(many),wed);app.ids.addTask.onclick();app.ids.taskTitle.value='One too many';app.ids.taskForm.dispatch('submit');
  assert.match(app.ids.formError.textContent,/20,000-task limit/);assert.equal(app.state().tasks.length,20000);
  const versions=Array.from({length:2000},(_,index)=>({from:day(index),title:`Version ${index}`,weekdays:[3],startDate:'1950-01-01'}));
  app=boot(store([{id:'busy',kind:'weekly',title:'Version 1999',weekdays:[3],startDate:'1950-01-01',versions}]),wed);
  row(app,'busy').querySelector('.edit-task').onclick();app.ids.taskTitle.value='Version 2000';app.ids.taskForm.dispatch('submit');
  assert.match(app.ids.formError.textContent,/2,000 dated changes/);assert.equal(app.state().tasks[0].versions.length,2000);
  const exceptions=Array.from({length:20000},(_,index)=>day(index));
  app=boot(store([{id:'skips',kind:'weekly',title:'Skipped often',weekdays:[3],startDate:'1950-01-01',exceptions}]),wed);
  row(app,'skips').querySelector('.skip-task').onclick();assert.equal(app.state().tasks[0].exceptions.length,20000);assert.match(app.ids.toastMessage.textContent,/20,000 skipped dates/);
  console.log('Review fixes passed: browser-save retry and close warning, Skip over saved details, moved-occurrence labels without duplicate Restore, quiet reminders added after the due time, and save-time data limits.');
}
verifyReviewFixes();
async function verifySecondReviewFixes() {
  const key='day-by-day.v1',wed=new Date(2026,10,4,10).getTime();
  const store=(tasks,completed={})=>new Map([[key,JSON.stringify({version:5,tasks,completed})]]);
  const row=(app,id,list='taskList')=>app.ids[list].querySelectorAll('.task-row').find(item=>item.dataset.id===id);
  // A. Older data could mark a day both done and skipped. It loads as done, and plain skips stay skipped.
  const snap={title:'Saved details',weekdays:[3],startDate:'2026-10-01',time:null,reminders:[]};
  let app=boot(store([{id:'gym',kind:'weekly',title:'Gym',weekdays:[3],startDate:'2026-10-01',snapshots:{'2026-11-04':snap},exceptions:['2026-10-28','2026-11-04']}],{'2026-11-04':['gym']}),wed);
  assert.equal(row(app,'gym').querySelector('.check-button').getAttribute('aria-pressed'),'true');assert.equal(app.ids.completionText.textContent,'1 of 1 complete');
  assert.deepEqual(Array.from(app.context.window.DayByDay.validate(app.state()).tasks[0].exceptions),['2026-10-28']);
  // B. Reminder edits compare with the routine as set up on the edited date, not a later scheduled change.
  const at11=new Date(2026,10,4,11).getTime(),created=new Date(2026,10,1,8).getTime();
  const base={title:'Standup',weekdays:[3],startDate:'2026-10-01',time:'09:00',reminderFrom:created};
  const routine={id:'r',kind:'weekly',...base,reminders:[15],versions:[{from:'1900-01-01',...base,reminders:[]},{from:'2026-11-11',...base,reminders:[15]}]};
  app=boot(store([routine]),at11);
  row(app,'r','overdueList').querySelector('.edit-task').onclick();
  app.inputs.find(input=>input.name==='reminders'&&input.value==='15').checked=true;app.ids.taskForm.dispatch('submit');app.tick();
  assert.equal(app.ids.reminderPanel.hidden,true);assert.equal(app.state().tasks[0].versions.find(version=>version.from==='2026-11-04').reminderFrom,at11);
  app=boot(store([routine]),at11);row(app,'r','overdueList').querySelector('.edit-task').onclick();app.ids.taskTitle.value='Standup, renamed';app.ids.taskForm.dispatch('submit');
  assert.equal(app.state().tasks[0].versions.find(version=>version.from==='2026-11-04').reminderFrom,created); // a rename keeps reminder timing
  // C. A change that would push saved tasks past 10 MB is not kept, and the dialog explains why.
  const limit=10000000,validate=app.context.window.DayByDay.validate;
  const bulky=Array.from({length:2000},(_,index)=>({id:`big${index}`,kind:'once',date:'2099-01-01',title:`Task ${index}`,description:'x'.repeat(4990)}));
  const bytes=count=>Buffer.byteLength(JSON.stringify(validate({version:5,tasks:bulky.slice(0,count),completed:{}}),null,2)+'\n');
  let low=1800,high=2000;while(low<high){const middle=Math.ceil((low+high)/2);if(bytes(middle)<=limit)low=middle;else high=middle-1;}
  app=boot(store(bulky.slice(0,low)),wed);const kept=app.storage.get(key);
  app.ids.addTask.onclick();app.ids.taskTitle.value='One too large';app.ids.taskDescription.value='y'.repeat(5000);app.ids.taskForm.dispatch('submit');
  assert.equal(app.storage.get(key),kept);assert.equal(app.ids.taskDialog.open,true);assert.match(app.ids.formError.textContent,/10 MB limit/);assert.equal(app.ids.dayTitle.textContent,'Wednesday.');
  // Data that is already too large can still shrink, so deleting is never blocked.
  app=boot(store(bulky.slice(0,low+10).map(task=>({...task,date:'2026-11-04'}))),wed);assert.ok(bytes(low+10)>limit);
  row(app,'big0').querySelector('.edit-task').onclick();app.ids.deleteTask.onclick();
  assert.equal(app.state().tasks.length,low+9);assert.equal(app.state().tasks.some(task=>task.id==='big0'),false);
  // A rejected backup leaves both the current tasks and an unreadable original untouched.
  const unreadable='{not json';app=boot(new Map([[key,unreadable]]),wed);
  const ids=Array.from({length:2000},(_,index)=>'c'+index),completed={};
  for(let day=0;day<600;day++)completed[new Date(2020,0,1+day,12).toISOString().slice(0,10)]=ids;
  const text=JSON.stringify({version:5,tasks:ids.map(id=>({id,kind:'once',date:'2020-01-01',title:id})),completed});
  assert.ok(Buffer.byteLength(text)<limit);
  app.ids.restoreFile.files=[{size:Buffer.byteLength(text),text:async()=>text}];
  const pending=app.ids.restoreFile.onchange();await new Promise(resolve=>setImmediate(resolve));app.ids.confirmRestore.onclick();await pending;
  assert.match(app.ids.toastMessage.textContent,/Change not saved/);assert.equal(app.storage.get(key),unreadable);assert.equal(app.ids.downloadOriginalData.hidden,false);
  app.ids.addTask.onclick();app.ids.taskTitle.value='Ordinary edit';app.ids.taskForm.dispatch('submit');assert.equal(app.storage.get(key),unreadable);
  // D. Another tab's save never silently replaces this tab's unsaved changes. The app asks which copy to keep.
  const options={storageWriteFails:true},plain={id:'a',kind:'once',title:'Mine',date:'2026-11-04'};
  const other=JSON.stringify({version:5,tasks:[plain,{id:'b',kind:'once',title:'From other tab',date:'2026-11-04'}],completed:{}});
  const warns=target=>{let prevented=false;for(const fn of target.windowListeners.beforeunload||[])fn({preventDefault(){prevented=true;}});return prevented;};
  const otherTabSaves=target=>{for(const fn of target.windowListeners.storage||[])fn({key,newValue:other});};
  app=boot(store([plain]),wed,options);row(app,'a').querySelector('.check-button').onclick();otherTabSaves(app);
  assert.equal(app.ids.tabChoiceDialog.open,true);assert.equal(row(app,'a').querySelector('.check-button').getAttribute('aria-pressed'),'true');assert.equal(row(app,'b'),undefined);assert.equal(app.ids.storageWarning.hidden,false);
  app.ids.tabChoiceDialog.dispatch('cancel');assert.equal(app.ids.tabChoiceDialog.open,true); // Escape cannot skip the choice
  options.storageWriteFails=false;app.ids.tabChoiceKeep.onclick();
  assert.equal(app.ids.tabChoiceDialog.open,false);assert.deepEqual(app.state().completed['2026-11-04'],['a']);assert.equal(app.state().tasks.length,1);assert.equal(warns(app),false);
  options.storageWriteFails=true;app=boot(store([plain]),wed,options);row(app,'a').querySelector('.check-button').onclick();otherTabSaves(app);
  app.ids.tabChoiceOther.onclick();
  assert.equal(app.ids.tabChoiceDialog.open,false);assert.ok(row(app,'b'));assert.equal(row(app,'a').querySelector('.check-button').getAttribute('aria-pressed'),'false');assert.equal(app.ids.storageWarning.hidden,true);assert.equal(warns(app),false);
  options.storageWriteFails=false;app=boot(store([plain]),wed,options);otherTabSaves(app);
  assert.equal(app.ids.tabChoiceDialog.open,false);assert.ok(row(app,'b')); // with nothing unsaved, tabs stay in step automatically
  console.log('Second review fixes passed: done-and-skipped history, reminder edits against the effective routine version, 10 MB save limit with shrinking allowed, protected originals after a rejected restore, and asking which tab copy to keep.');
}
verifySecondReviewFixes().catch(error=>{console.error(error);process.exitCode=1;});
function verifyRetryButtons() {
  const key='day-by-day.v1',wed=new Date(2026,10,4,10).getTime(),options={storageWriteFails:true};
  const store=tasks=>new Map([[key,JSON.stringify({version:5,tasks,completed:{}})]]);
  const warns=app=>{let prevented=false;for(const fn of app.windowListeners.beforeunload||[])fn({preventDefault(){prevented=true;}});return prevented;};
  // Retry saving tries the browser copy again without needing another edit.
  let app=boot(store([{id:'a',kind:'once',title:'Mine',date:'2026-11-04'}]),wed,options);
  assert.equal(app.ids.retrySave.hidden,true);
  app.ids.taskList.querySelector('.check-button').onclick();
  assert.equal(app.ids.storageWarning.hidden,false);assert.equal(app.ids.retrySave.hidden,false);assert.equal(warns(app),true);
  app.ids.retrySave.onclick();assert.equal(app.ids.storageWarning.hidden,false);assert.match(app.ids.toastMessage.textContent,/still could not save/);
  options.storageWriteFails=false;app.ids.retrySave.onclick();
  assert.equal(app.ids.storageWarning.hidden,true);assert.deepEqual(app.state().completed['2026-11-04'],['a']);assert.equal(warns(app),false);
  assert.equal(app.ids.saveStatus.textContent,'Saved in this browser');assert.equal(app.context.document.activeElement,app.ids.inlineAdd);
  // Unreadable saved data is never written over, so no retry is offered for it.
  app=boot(new Map([[key,'{not json']]),wed);
  assert.equal(app.ids.storageWarning.hidden,false);assert.equal(app.ids.retrySave.hidden,true);
  console.log('Retry buttons passed: browser retry without another edit, repeated failure, warning cleared on success, and no retry over unreadable saved data.');
}
verifyRetryButtons();
function verifyMovedLinks() {
  const key='day-by-day.v1',wed=new Date(2026,10,4,19).getTime();
  const row=(app,id,list='taskList')=>app.ids[list].querySelectorAll('.task-row').find(item=>item.dataset.id===id);
  const routine={id:'routine',kind:'weekly',title:'Evening run',weekdays:[3,4],startDate:'2026-10-01',time:'18:30',reminders:[]};
  let app=boot(new Map([[key,JSON.stringify({version:5,tasks:[routine],completed:{}})]]),wed);
  row(app,'routine','overdueList').querySelector('.move-tomorrow').onclick();
  const copy=app.state().tasks.find(task=>task.id!=='routine');
  // The original day links forward to the moved task, and the moved task links back.
  const forward=app.ids.skippedList.querySelector('.moved-link');
  assert.match(forward.textContent,/^Moved to /);assert.match(forward.getAttribute('aria-label'),/Evening run was moved to .*Go to that day/);
  forward.onclick();
  assert.equal(app.ids.dayTitle.textContent,'Thursday.');assert.equal(app.context.document.activeElement,row(app,copy.id).querySelector('.edit-task'));
  const back=row(app,copy.id).querySelector('.moved-link');
  assert.match(back.textContent,/^Moved from /);assert.equal(row(app,copy.id).querySelector('.task-meta').textContent,'One time');
  back.onclick();
  assert.equal(app.ids.dayTitle.textContent,'Wednesday.');assert.equal(app.context.document.activeElement,app.ids.skippedTitle);
  // The link survives a reload, and ordinary one-time tasks get none.
  app=boot(app.storage,new Date(2026,10,5,9).getTime());
  assert.ok(row(app,copy.id).querySelector('.moved-link'));assert.equal(row(app,'routine').querySelector('.moved-link'),null);
  console.log('Moved links passed: Moved to and Moved from navigate between both days, focus lands on the task or skipped list, and links survive reload.');
}
verifyMovedLinks();
function verifyCalendarKeyboard() {
  const wed=new Date(2026,10,4,10).getTime(),app=boot(new Map(),wed);
  const days=()=>app.ids.calendarGrid.children,tabbable=()=>days().filter(day=>day.tabIndex===0).map(day=>day.dataset.date);
  const press=(key,date)=>{let prevented=false;days().find(day=>day.dataset.date===date).onkeydown({key,preventDefault(){prevented=true;}});return prevented;};
  // Exactly one day can be reached with Tab: today at first, then the selected day.
  assert.deepEqual(tabbable(),['2026-11-04']);
  // Changing month never leaves the calendar unreachable. The 1st of the shown month takes the Tab stop.
  app.ids.nextMonth.onclick();assert.deepEqual(tabbable(),['2026-12-01']);
  app.ids.nextMonth.onclick();assert.deepEqual(tabbable(),['2027-01-01']);
  app.ids.prevMonth.onclick();app.ids.prevMonth.onclick();assert.deepEqual(tabbable(),['2026-11-04']);
  // Arrow keys move by day and week, select the day, and carry focus, across month and year boundaries.
  assert.equal(press('ArrowRight','2026-11-04'),true);assert.deepEqual(tabbable(),['2026-11-05']);assert.equal(app.context.document.activeElement.dataset.date,'2026-11-05');assert.equal(app.ids.dayTitle.textContent,'Thursday.');
  press('ArrowUp','2026-11-05');assert.equal(app.context.document.activeElement.dataset.date,'2026-10-29');assert.match(app.ids.monthLabel.textContent,/October/);
  press('ArrowLeft','2026-10-29');press('ArrowDown','2026-10-28');assert.equal(app.context.document.activeElement.dataset.date,'2026-11-04');
  app.ids.jumpDate.value='2026-12-29';app.ids.jumpDate.onchange();press('ArrowDown','2026-12-29');
  assert.equal(app.context.document.activeElement.dataset.date,'2027-01-05');assert.match(app.ids.monthLabel.textContent,/2027/);
  assert.equal(press('Enter','2027-01-05'),false);assert.equal(app.context.document.activeElement.dataset.date,'2027-01-05'); // other keys keep their usual meaning
  // Go to date opens any day, ignores an empty or invalid value, and follows other navigation.
  app.ids.jumpDate.value='2027-03-15';app.ids.jumpDate.onchange();assert.equal(app.ids.dayTitle.textContent,'Monday.');assert.deepEqual(tabbable(),['2027-03-15']);
  app.ids.jumpDate.value='';app.ids.jumpDate.onchange();app.ids.jumpDate.value='2027-02-30';app.ids.jumpDate.onchange();assert.equal(app.ids.dayTitle.textContent,'Monday.');
  app.ids.nextWeek.onclick();assert.equal(app.ids.jumpDate.value,'2027-03-22');
  console.log('Calendar keyboard passed: one Tab stop that survives month changes, arrow keys across month and year boundaries with focus, other keys untouched, and Go to date.');
}
verifyCalendarKeyboard();
async function verifyRecoveryCopies() {
  const key='day-by-day.v1',t0=new Date(2026,10,6,9).getTime(),HOUR=3600000;
  const tick=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setImmediate(resolve));};
  function fakeFolder() {
    const files=new Map(),top={name:'Private',permission:'granted',fail:false};
    const sub={files,async getFileHandle(name,{create}={}){if(!files.has(name)){if(!create)throw Error('Missing');files.set(name,{kind:'file',raw:'',async getFile(){const raw=this.raw;return {size:Buffer.byteLength(raw),text:async()=>raw};},async createWritable(){const file=this;let text='';return {async write(value){if(top.fail)throw Error('Disk full');text=value;},async close(){file.raw=text;},async abort(){}};}});}return files.get(name);},
      async removeEntry(name){files.delete(name);},async *entries(){yield* [...files.entries()];}};
    return Object.assign(top,{sub,async queryPermission(){return top.permission;},async requestPermission(){return top.permission;},async getDirectoryHandle(name){assert.equal(name,'Day-by-Day recovery copies');return sub;}});
  }
  function idb(store) {
    return {open(){const request={};queueMicrotask(()=>{request.result={transaction(){const tx={objectStore(){return {
      get(){const req={};queueMicrotask(()=>{req.result=store.value;tx.oncomplete();});return req;},
      put(value){const req={};queueMicrotask(()=>{store.value=value;tx.oncomplete();});return req;},
      delete(){const req={};queueMicrotask(()=>{delete store.value;tx.oncomplete();});return req;}};}};return tx;}};request.onsuccess();});return request;}};
  }
  const copies=folder=>[...folder.sub.files.keys()].filter(name=>name.startsWith('day-by-day-copy-')).sort();
  const newest=folder=>copies(folder).at(-1),titles=(folder,name)=>JSON.parse(folder.sub.files.get(name).raw).tasks.map(task=>task.title);
  const row=(app,id)=>app.ids.taskList.querySelectorAll('.task-row').find(item=>item.dataset.id===id);
  const tasks=[{id:'a',kind:'once',title:'Keep me',date:'2026-11-06'},{id:'b',kind:'once',title:'Delete me',date:'2026-11-06'},{id:'r',kind:'weekly',title:'Routine',weekdays:[5],startDate:'2026-10-01'}];
  // Browsers without folder access never see the panel.
  let app=boot(new Map(),t0);assert.equal(app.ids.recoveryPanel.hidden,true);
  // Off until turned on: edits make no copies.
  const folder=fakeFolder(),idbStore={},storageOptions={},options={secure:true,fileWindow:{showDirectoryPicker:async()=>folder},indexedDB:idb(idbStore)};
  const storage=new Map([[key,JSON.stringify({version:5,tasks,completed:{}})]]);
  app=boot(storage,t0,options);await tick();
  assert.equal(app.ids.recoveryPanel.hidden,false);assert.equal(app.ids.recoveryState.textContent,'Off');
  row(app,'a').querySelector('.check-button').onclick();await tick();assert.equal(folder.sub.files.size,0);
  // Turning on saves a first copy and remembers the folder.
  await app.ids.chooseRecoveryFolder.onclick();await tick();
  assert.equal(app.ids.recoveryState.textContent,'On');assert.equal(copies(folder).length,1);assert.match(newest(folder),/-first\.json$/);assert.equal(idbStore.value,folder);
  // Within the hour, edits make no new copy. After an hour, one hourly copy of the current tasks.
  row(app,'a').querySelector('.check-button').onclick();await tick();assert.equal(copies(folder).length,1);
  app.clock(t0+HOUR);row(app,'a').querySelector('.check-button').onclick();await tick();
  assert.equal(copies(folder).length,2);assert.match(newest(folder),/-hourly\.json$/);assert.deepEqual(JSON.parse(folder.sub.files.get(newest(folder)).raw).completed,app.state().completed);
  // Deleting a task and ending a routine copy the tasks from just before.
  row(app,'b').querySelector('.edit-task').onclick();app.ids.deleteTask.onclick();await tick();
  assert.match(newest(folder),/-delete\.json$/);assert.ok(titles(folder,newest(folder)).includes('Delete me'));assert.equal(app.state().tasks.some(task=>task.id==='b'),false);
  app.ids.routinesNav.onclick();app.ids.routineList.querySelector('.edit-task').onclick();app.ids.deleteTask.onclick();await tick();
  assert.match(newest(folder),/-end-routine\.json$/);assert.equal(JSON.parse(folder.sub.files.get(newest(folder)).raw).tasks.find(task=>task.id==='r').endedOn,null);
  app.ids.todayNav.onclick();
  // Restoring a copy asks first and saves the current tasks before replacing them.
  await app.ids.showRecoveryCopies.onclick();
  const deleted=app.ids.recoveryList.children.find(item=>item.textContent.includes('before deleting a task'));
  const pending=deleted.querySelector('button').onclick();await tick();
  assert.equal(app.ids.restoreDialog.open,true);assert.equal(app.ids.restoreTitle.textContent,'Restore this recovery copy?');assert.match(app.ids.restoreMessage.textContent,/recovery copy of your current tasks is saved first/);
  app.ids.confirmRestore.onclick();await pending;await tick();
  assert.ok(app.state().tasks.some(task=>task.id==='b'));assert.equal(app.ids.toastMessage.textContent,'Recovery copy restored.');
  assert.match(newest(folder),/-restore\.json$/);assert.equal(titles(folder,newest(folder)).includes('Delete me'),false);
  // A copy that can't be read changes nothing.
  folder.sub.files.get(copies(folder)[0]).raw='broken';await app.ids.showRecoveryCopies.onclick();
  const before=JSON.stringify(app.state());await app.ids.recoveryList.children.at(-1).querySelector('button').onclick();
  assert.match(app.ids.recoveryStatus.textContent,/could not be read/);assert.equal(JSON.stringify(app.state()),before);assert.equal(app.ids.restoreDialog.open,false);
  // Only the newest 20 copies are kept, and other files in the folder are never touched.
  folder.sub.files.set('my-notes.json',{kind:'file',raw:'mine'});folder.sub.files.set('day-by-day-recovery-2026-11-01.json',{kind:'file',raw:'export'});
  for(let hour=2;hour<30;hour++){app.clock(t0+hour*HOUR);row(app,'a').querySelector('.check-button').onclick();await tick();}
  assert.equal(copies(folder).length,20);assert.ok(folder.sub.files.has('my-notes.json'));assert.ok(folder.sub.files.has('day-by-day-recovery-2026-11-01.json'));
  // Losing folder access pauses copies but never stops saving.
  folder.permission='prompt';const count=copies(folder).length;app.clock(t0+40*HOUR);row(app,'a').querySelector('.check-button').onclick();await tick();
  assert.equal(app.ids.recoveryState.textContent,'Paused');assert.equal(app.ids.recoveryPanel.open,true);assert.match(app.ids.recoveryStatus.textContent,/still save normally/);
  assert.equal(JSON.parse(app.storage.get(key)).completed['2026-11-06'].length,JSON.parse(JSON.stringify(app.state())).completed['2026-11-06'].length);assert.equal(app.ids.storageWarning.hidden,true);
  row(app,'a').querySelector('.check-button').onclick();await tick();assert.equal(copies(folder).length,count); // paused copies stay off
  // Turn copies back on asks about the same folder.
  folder.permission='granted';await app.ids.chooseRecoveryFolder.onclick();await tick();assert.equal(app.ids.recoveryState.textContent,'On');assert.match(newest(folder),/-first\.json$/);
  // A failed copy write also pauses without stopping saving.
  folder.fail=true;app.clock(t0+50*HOUR);const last=newest(folder);row(app,'a').querySelector('.check-button').onclick();await tick();
  assert.equal(app.ids.recoveryState.textContent,'Paused');assert.equal(newest(folder),last);assert.equal(app.ids.storageWarning.hidden,true);folder.fail=false;
  // The folder is remembered across visits, and paused when the browser no longer allows it.
  app=boot(app.storage,t0+51*HOUR,options);await tick();assert.equal(app.ids.recoveryState.textContent,'On');
  folder.permission='prompt';app=boot(app.storage,t0+52*HOUR,options);await tick();assert.equal(app.ids.recoveryState.textContent,'Paused');folder.permission='granted';
  await app.ids.chooseRecoveryFolder.onclick();await tick();
  // Which-copy choices between tabs copy the tasks about to be replaced.
  storageOptions.storageWriteFails=true;Object.assign(options,storageOptions);
  app=boot(app.storage,t0+53*HOUR,options);await tick();app.ids.jumpDate.value='2026-11-06';app.ids.jumpDate.onchange();row(app,'a').querySelector('.check-button').onclick();
  const otherTab=JSON.stringify({version:5,tasks:[{id:'z',kind:'once',title:'Other tab',date:'2026-11-06'}],completed:{}});
  app.storage.set(key,otherTab);for(const fn of app.windowListeners.storage)fn({key,newValue:otherTab}); // the other tab writes, then this tab hears about it
  options.storageWriteFails=false;app.ids.tabChoiceOther.onclick();await tick();
  assert.match(newest(folder),/-choice\.json$/);assert.ok(titles(folder,newest(folder)).includes('Keep me'));assert.deepEqual(app.state().tasks.map(task=>task.id),['z']);
  // Turning off forgets the folder and leaves its copies.
  const kept=copies(folder).length;await app.ids.stopRecoveryCopies.onclick();
  assert.equal(app.ids.recoveryState.textContent,'Off');assert.equal(idbStore.value,undefined);assert.equal(copies(folder).length,kept);
  console.log('Recovery copies passed: off by default, first copy, hourly limit, copies before deleting, ending, restoring and which-copy choices, confirmed restore, unreadable copies, newest 20 kept, other files untouched, paused without blocking saving, reopening, and turning off.');
}
verifyRecoveryCopies().catch(error=>{console.error(error);process.exitCode=1;});
function verifyVisibleOverdueActionsAndBell() {
  const key='day-by-day.v1',wed=new Date(2026,10,4,19).getTime();
  const tasks=[{id:'late',kind:'once',title:'Late call',date:'2026-11-04',time:'18:00',reminders:[15]},{id:'older',kind:'once',title:'Old chore',date:'2026-11-02'},{id:'plain',kind:'once',title:'Plain',date:'2026-11-04'}];
  const app=boot(new Map([[key,JSON.stringify({version:5,tasks,completed:{}})]]),wed);
  const row=(id,list)=>app.ids[list].querySelectorAll('.task-row').find(item=>item.dataset.id===id);
  const inMenu=(row,selector)=>Boolean(row.querySelector('.task-menu').querySelector(selector));
  // Rescheduling stays visible on overdue rows instead of hiding under More.
  assert.ok(row('late','overdueList').querySelector('.move-tomorrow'));assert.equal(inMenu(row('late','overdueList'),'.move-tomorrow'),false);
  assert.ok(row('older','overdueList').querySelector('.move-today'));assert.equal(inMenu(row('older','overdueList'),'.move-today'),false);
  // A bell beside the time shows which tasks have reminders, with the details read aloud.
  const bell=row('late','overdueList').querySelector('.reminder-badge');
  assert.ok(bell);assert.equal(bell.title,'Reminder 15 min before');assert.match(bell.textContent,/Reminder 15 min before/);
  assert.equal(row('plain','taskList').querySelector('.reminder-badge'),null);
  console.log('Visible overdue actions and reminder bell passed: Move to today and Move to tomorrow outside More, and a bell only on tasks with reminders.');
}
verifyVisibleOverdueActionsAndBell();
