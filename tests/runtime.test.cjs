const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('src/index.html', 'utf8');
const source = fs.readFileSync('src/app.js', 'utf8');
// A small in-memory DOM exercises application events without a browser, network, or user data.
function boot(storage, initialClock, options = {}) {
  let clock = initialClock, uid = 0;
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const intervals = [], ids = {}, extras = {}, inputs = [], animations = [];
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
    scrollIntoView() {}
    getBoundingClientRect() { return {top:0,left:0,width:1}; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    click() { this.onclick?.(); }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); }
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
  const document = {title:'',hidden:false,body:new Node('body'),getElementById(id){if(!ids[id])throw Error('Missing element '+id);return ids[id];},createElement:tag=>new Node(tag),createElementNS:(_,tag)=>new Node(tag),createTextNode:text=>Object.assign(new Node('text'),{_text:String(text)}),querySelector(selector){return extras[selector] ||= new Node(selector==='main'?'main':'div');},querySelectorAll(selector){const name=selector.match(/name="(.*?)"/)?.[1];return inputs.filter(input=>input.name===name);},addEventListener(){}};
  const localStorage = {getItem:key=>storage.get(key) ?? null,setItem:(key,value)=>storage.set(key,String(value))};
  const context = {Date:Clock,document,localStorage,window:{isSecureContext:false,matchMedia:()=>({matches:Boolean(options.reducedMotion)}),addEventListener(){},focus(){}},crypto:{randomUUID:()=>`runtime_${++uid}`},setTimeout:()=>1,clearTimeout(){},setInterval:(fn,ms)=>{intervals.push({fn,ms});return intervals.length;},console,confirm:()=>true,Blob,URL};
  vm.createContext(context); vm.runInContext(source,context);
  return {ids,inputs,context,storage,animations,clock:time=>clock=time,tick:()=>intervals.find(timer=>timer.ms===10000).fn(),state:()=>JSON.parse(storage.get('day-by-day.v1'))};
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
assert.equal(state.version,4); assert.equal(state.tasks[0].time,null);
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
  const reload=boot(notesApp.storage,clock); assert.equal(reload.ids.taskList.querySelector('.description-body').textContent,'Updated details');
  reload.ids.nextWeek.onclick(); assert.equal(reload.ids.taskList.querySelector('.description-body').textContent,'Updated details');
  assert.equal(reload.ids.taskList.querySelector('.check-button').getAttribute('aria-pressed'),'false');
  reload.ids.routinesNav.onclick(); assert.equal(reload.ids.routineList.querySelector('.description-body').textContent,'Updated details');
  reload.ids.routineList.querySelector('.edit-task').onclick(); reload.ids.taskDescription.value=''; reload.ids.taskForm.dispatch('submit');
  assert.equal(reload.state().tasks[0].description,''); assert.equal(reload.ids.routineList.querySelector('.task-description'),null);
  reload.ids.addTask.onclick(); assert.equal(reload.ids.taskDescription.value,''); reload.ids.cancelDialog.onclick();
  reload.ids.restoreFile.files=[{size:200,text:async()=>JSON.stringify({version:4,tasks:[{...reload.state().tasks[0],description:notes}],completed:{}})}];
  await reload.ids.restoreFile.onchange(); assert.equal(reload.state().tasks[0].description,notes);
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
  assert.equal(sorted.state().sortMode,'manual'); assert.equal(sorted.ids.sortDay.hidden,false);
  assert.deepEqual(rowIds(sorted.ids.taskList).slice(0,6),['nine-1','midnight','nine-2','late','all-1','all-2']);
  findRow('all-1').querySelector('.move-up').onclick();
  assert.deepEqual(rowIds(sorted.ids.taskList).slice(0,6),['nine-1','midnight','nine-2','all-1','late','all-2']);
  findRow('late').querySelector('.edit-task').onclick(); sorted.ids.taskTime.value='07:00'; sorted.ids.taskForm.dispatch('submit');
  assert.deepEqual(rowIds(sorted.ids.taskList).slice(0,6),['nine-1','midnight','nine-2','all-1','late','all-2']);
  sorted=boot(storage,clock); assert.equal(sorted.ids.sortDay.hidden,false);
  assert.deepEqual(rowIds(sorted.ids.taskList).slice(0,6),['nine-1','midnight','nine-2','all-1','late','all-2']);
  sorted.ids.routinesNav.onclick();
  assert.deepEqual(rowIds(sorted.ids.routineList),['nine-1','done-early','midnight','nine-2','all-1','done-late','late','all-2','done-all']);
  sorted.ids.nextWeek.onclick();
  assert.deepEqual(rowIds(sorted.ids.taskList),['nine-1','done-early','midnight','nine-2','all-1','done-late','late','all-2','done-all']);
  sorted.ids.sortDay.onclick(); assert.equal(sorted.state().sortMode,'due'); assert.equal(sorted.ids.sortDay.hidden,true);
  assert.deepEqual(rowIds(sorted.ids.taskList),['midnight','late','done-early','nine-1','nine-2','done-late','all-1','all-2','done-all']);
  sorted=boot(storage,clock); assert.equal(sorted.ids.sortDay.hidden,true);
  assert.deepEqual(rowIds(sorted.ids.taskList).slice(0,6),['midnight','late','nine-1','nine-2','all-1','all-2']);
  console.log('Sorting runtime passed: automatic defaults, unrestricted arrows, switching from displayed order, saved custom order, reload, editing times, routines, future dates, and reset to due-time order.');
}
verifyTimeSorting();
