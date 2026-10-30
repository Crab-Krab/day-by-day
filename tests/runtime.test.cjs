const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('src/index.html', 'utf8');
const source = fs.readFileSync('src/app.js', 'utf8');
// A small in-memory DOM exercises application events without a browser, network, or user data.
function boot(storage, initialClock, options = {}) {
  let clock = initialClock, uid = 0;
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const intervals = [], timeouts = [], ids = {}, extras = {}, inputs = [], animations = [], notices = [];
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
    get classList() { return {toggle:(name, force) => { const names = new Set(this.className.split(' ').filter(Boolean)); const add = force === undefined ? !names.has(name) : force; add ? names.add(name) : names.delete(name); this.className = [...names].join(' '); return add; }}; }
    focus() { document.activeElement = this; }
    get isConnected() { return !this.detached; }
    scrollIntoView() {}
    getBoundingClientRect() { return {top:0,left:0,width:1}; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    click() { this.onclick?.(); }
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
  ids.taskForm.elements = {};
  for (const name of ['kind','timing']) {
    const radios = inputs.filter(input => input.name === name);
    Object.defineProperty(radios, 'value', {get(){return this.find(input=>input.checked)?.value || '';},set(value){this.forEach(input=>input.checked=input.value===value);}});
    ids.taskForm.elements[name] = radios;
  }
  const documentListeners={},windowListeners={};
  const document = {title:'',hidden:false,body:new Node('body'),getElementById(id){if(!ids[id])throw Error('Missing element '+id);return ids[id];},createElement:tag=>new Node(tag),createElementNS:(_,tag)=>new Node(tag),createTextNode:text=>Object.assign(new Node('text'),{_text:String(text)}),querySelector(selector){return extras[selector] ||= new Node(selector==='main'?'main':'div');},querySelectorAll(selector){const name=selector.match(/name="(.*?)"/)?.[1];return inputs.filter(input=>input.name===name);},addEventListener:(name,callback)=>{(documentListeners[name] ||= []).push(callback);}};
  const localStorage = {getItem:key=>storage.get(key) ?? null,setItem:(key,value)=>storage.set(key,String(value))};
  const context = {Date:Clock,document,localStorage,window:{isSecureContext:false,matchMedia:()=>({matches:Boolean(options.reducedMotion)}),addEventListener:(name,callback)=>{(windowListeners[name] ||= []).push(callback);},focus(){}},crypto:{randomUUID:()=>`runtime_${++uid}`},setTimeout:(fn,ms)=>{timeouts.push({fn,ms});return timeouts.length;},clearTimeout(id){if(timeouts[id-1])timeouts[id-1].cancelled=true;},queueMicrotask,setInterval:(fn,ms)=>{intervals.push({fn,ms});return intervals.length;},console,Blob,URL};
  if(options.navigator)context.navigator=options.navigator;
  if(options.secure)context.window.isSecureContext=true;
  if(options.notifications) {
    class Notice { static permission='granted'; constructor(title,settings){notices.push({title,settings});} close(){} }
    context.Notification=Notice;context.window.Notification=Notice;context.window.isSecureContext=true;
  }
  vm.createContext(context); vm.runInContext(options.countSorts ? source.replace('function sortTasksByTime(tasks) {','function sortTasksByTime(tasks) { globalThis.sortCalls=(globalThis.sortCalls||0)+1;') : source,context);
  return {ids,inputs,context,storage,animations,notices,documentListeners,windowListeners,flushTimeouts:()=>timeouts.splice(0).forEach(timer=>{if(!timer.cancelled)timer.fn();}),clock:time=>clock=time,tick:()=>intervals.find(timer=>timer.ms===10000).fn(),refresh:()=>intervals.find(timer=>timer.ms===30000).fn(),state:()=>JSON.parse(storage.get('day-by-day.v1'))};
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
  moving.ids.cancelDialog.onclick(); assert.equal(moving.ids.taskDialog.open,true);
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
  assert.equal(row.querySelector('details'),null); assert.equal(row.querySelector('.description-toggle'),null); assert.equal(body.textContent,notes); assert.equal(body.querySelector('script'),null);
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
  assert.equal(reload.state().tasks[0].description,''); assert.equal(reload.ids.routineList.querySelector('.description-body').textContent,'Updated details');
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
  assert.equal(work.ids.undoNotice.hidden,false);work.flushTimeouts();assert.equal(work.ids.undoNotice.hidden,false);assert.equal(work.ids.toast.hidden,true);
  work.ids.prevMonth.onclick();assert.equal(work.ids.undoNotice.hidden,false);work.ids.undoAction.onclick();assert.equal(work.state().tasks.some(task=>task.id==='current'),true);
  assert.equal(work.ids.statusAnnouncement.textContent,'Change undone.');assert.equal(work.ids.statusAnnouncement.hidden,false);
  assert.equal(work.documentListeners.keydown,undefined);
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
  const button=newPast.ids.overdueList.querySelector('.check-button');assert.equal(button.getAttribute('aria-label'),'Past due entry');button.onclick();
  assert.equal(newPast.ids.taskList.querySelector('.check-button').getAttribute('aria-label'),'Past due entry');
  console.log('Reliability runtime passed: overdue completion/move/undo, saved dates, edit focus, persistent Undo, live announcements, calendar counting, backup nudges/status/reload, restore cancel, removed single-key shortcut, and past-time reminders.');
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
