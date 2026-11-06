const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('src/file-storage.js', 'utf8');
const helpers = require('../src/schedule.js');
const valid = value => JSON.parse(JSON.stringify(helpers.validate(value)));
const empty = () => valid({version:5,tasks:[],completed:{}});
const sample = title => valid({version:5,tasks:[{id:'task1',title,kind:'once',date:'2026-11-01'}],completed:{}});
const settle = async () => { for (let n = 0; n < 60; n++) await Promise.resolve(); };
function disk(initial = '', name = 'Day-by-Day-data.json') {
  return { name, raw: initial, permission:'granted', requests:0, writes:0, active:0, maxActive:0, aborted:0,
    async queryPermission() { return this.permission; },
    async requestPermission() { this.requests++; return this.permission; },
    async getFile() { if(this.missing)throw Object.assign(Error('Missing'),{name:'NotFoundError'}); const raw=this.raw; return {size:Buffer.byteLength(raw),text:async()=>raw}; },
    async createWritable() {
      if(this.permission!=='granted')throw Object.assign(Error('Denied'),{name:'NotAllowedError'});
      const target=this; target.active++; target.maxActive=Math.max(target.maxActive,target.active); let next, ended=false;
      const end=()=>{if(!ended){target.active--;ended=true;}};
      return {async write(text){if(target.gate)await target.gate;if(target.writeFails)throw Error('Disk full');next=text;},async close(){if(target.closeFails)throw Error('Close failed');target.raw=next;target.writes++;end();},async abort(){target.aborted++;end();}};
    }
  };
}
function idb(store, fail = false) {
  return {open(){
    const request={}; queueMicrotask(()=>{
      if(fail){request.error=Error('Browser storage blocked');request.onerror();return;}
      request.result={close(){},transaction(){
        const tx={objectStore(){return {
          get(){const req={};queueMicrotask(()=>{req.result=store.value;tx.oncomplete();});return req;},
          put(value){const req={};queueMicrotask(()=>{store.value=value;tx.oncomplete();});return req;},
          delete(){const req={};queueMicrotask(()=>{delete store.value;tx.oncomplete();});return req;}
        };},abort(){tx.onabort?.();}};return tx;
      }};request.onsuccess();
    });return request;
  }};
}
function boot({data=empty(),store={},file=disk(),supported=true,storageFails=false,recovery=false,locks}={}) {
  let state=data;
  const nodes={}, listeners={}, shell={};
  const node=id=>nodes[id] ||= {hidden:false,disabled:false,textContent:'',dataset:{},listeners:{},addEventListener(key,fn){this.listeners[key]=fn;},showModal(){this.open=true;},close(){this.open=false;}};
  const window={isSecureContext:supported,addEventListener:(key,fn)=>listeners[key]=fn,confirm:()=>true,
    showSaveFilePicker:async()=>file, showOpenFilePicker:async()=>[file]};
  const context={window,document:{getElementById:node,querySelector:()=>shell},indexedDB:idb(store,storageFails),setTimeout,clearTimeout,console,Blob,navigator:{locks}};
  vm.createContext(context);vm.runInContext(source,context);
  const controller=window.createTaskFileStorage({getData:()=>state,validate:valid,applyData:value=>state=valid(value),backup:()=>{},hasRecovery:()=>recovery});
  return {controller,nodes,window,store,file,listeners,shell,state:()=>state,change(value){state=value;controller.changed();},click:id=>nodes[id].onclick(),title:()=>nodes.taskFileStatus.textContent};
}
async function main() {
  const file=disk(),store={}; let app=boot({data:sample('First'),file,store});
  await app.controller.init(); await app.click('createTaskFile');
  assert.equal(JSON.parse(file.raw).tasks[0].title,'First'); assert.match(app.title(),/^Saved to/);
  assert.equal(store.value.handle,file); assert.equal(app.shell.inert,false);
  app.change(sample('Edited')); await app.controller.flush();
  assert.equal(JSON.parse(file.raw).tasks[0].title,'Edited'); assert.equal(app.controller.isPending(),false);
  assert.equal(app.nodes.openTaskFile.disabled,false);
  // Fresh page, same remembered file: load automatically without requesting access.
  app=boot({data:sample('Edited'),file,store}); await app.controller.init();
  assert.equal(app.state().tasks[0].title,'Edited'); assert.equal(file.requests,1); assert.match(app.title(),/^Saved to/);
  file.raw=JSON.stringify(sample('Changed outside'));
  app=boot({data:sample('Edited'),file,store}); await app.controller.init();
  assert.equal(app.state().tasks[0].title,'Changed outside');
  // Complete browser cleanup leaves the real file intact; one Open reconnects it.
  app=boot({file,store:{}}); await app.controller.init(); await app.click('openTaskFile');
  assert.equal(app.state().tasks[0].title,'Changed outside'); assert.match(app.title(),/^Saved to/);
  // A remembered handle with expired permission makes no automatic request.
  file.permission='prompt';const oldRequests=file.requests;
  app=boot({data:sample('Changed outside'),file,store:app.store});await app.controller.init();
  assert.match(app.title(),/^Reconnect/);assert.equal(file.requests,oldRequests);
  file.permission='granted';await app.click('reconnectTaskFile');assert.match(app.title(),/^Saved to/);
  // Mutations during a slow write are serialized; latest state wins.
  let release;file.gate=new Promise(resolve=>release=resolve);
  app.change(sample('Slow first'));await settle();app.change(sample('Latest edit'));
  assert.equal(app.controller.isPending(),true);let prevented=false;app.listeners.beforeunload({preventDefault(){prevented=true;}});assert.equal(prevented,true);
  release();delete file.gate;await app.controller.flush();assert.equal(JSON.parse(file.raw).tasks[0].title,'Latest edit');assert.equal(file.maxActive,1);
  // Close failure is never reported as saved; original disk data survives.
  file.closeFails=true;app.change(sample('Unsaved edit'));await app.controller.flush();
  assert.match(app.title(),/not saved/);assert.equal(JSON.parse(file.raw).tasks[0].title,'Latest edit');assert.equal(app.nodes.reconnectTaskFile.disabled,false);
  delete file.closeFails;
  const reconnect=app.click('reconnectTaskFile');await settle();assert.equal(app.nodes.fileChoiceDialog.open,true);
  app.click('fileChoiceCurrent');await reconnect;assert.equal(JSON.parse(file.raw).tasks[0].title,'Unsaved edit');
  // External edits cannot be silently overwritten.
  file.raw=JSON.stringify(sample('External edit'));app.change(sample('My conflicting edit'));await app.controller.flush();
  assert.equal(JSON.parse(file.raw).tasks[0].title,'External edit');assert.match(app.nodes.taskFileDetail.textContent,/changed elsewhere/);
  const conflict=app.click('reconnectTaskFile');await settle();app.click('fileChoiceDisk');await conflict;
  assert.equal(app.state().tasks[0].title,'External edit');assert.match(app.title(),/^Saved to/);
  // Recovery after reopening with changes that were never written, including deleting all tasks.
  app=boot({data:empty(),file,store:app.store});const startup=app.controller.init();await settle();
  assert.equal(app.nodes.fileChoiceDialog.open,true);app.click('fileChoiceCurrent');await startup;
  assert.equal(JSON.parse(file.raw).tasks.length,0);
  // Malformed files are never replaced, even through Set up autosave.
  const bad=disk('not json');const invalid=boot({data:sample('Keep me'),file:bad});await invalid.controller.init();await invalid.click('createTaskFile');
  assert.equal(bad.raw,'not json');assert.equal(invalid.state().tasks[0].title,'Keep me');assert.match(invalid.nodes.taskFileDetail.textContent,/not a valid/);
  // Blocked IndexedDB must not prevent durable writes or leave the app inert.
  const blocked=boot({data:sample('No browser storage'),storageFails:true});await blocked.controller.init();await blocked.click('createTaskFile');
  assert.match(blocked.title(),/^Saved to/);assert.match(blocked.nodes.taskFileDetail.textContent,/could not remember/);assert.equal(blocked.shell.inert,false);
  blocked.change(sample('Still saving'));await blocked.controller.flush();assert.equal(JSON.parse(blocked.file.raw).tasks[0].title,'Still saving');
  // Unsupported browsers retain the checklist and cannot pretend file autosave works.
  const unsupported=boot({supported:false});await unsupported.controller.init();assert.match(unsupported.title(),/Chrome or Edge/);assert.equal(unsupported.nodes.createTaskFile.disabled,true);
  // Cancel replacement preserves both datasets.
  const cancel=boot({data:sample('Local'),file:disk(JSON.stringify(sample('Disk')))});await cancel.controller.init();const opening=cancel.click('openTaskFile');await settle();cancel.click('fileChoiceCancel');await opening;
  assert.equal(cancel.state().tasks[0].title,'Local');assert.equal(JSON.parse(cancel.file.raw).tasks[0].title,'Disk');assert.equal(cancel.controller.isConnected(),false);
  // Denied access and missing files produce actionable messages, with no writes.
  const denied=boot();await denied.controller.init();denied.file.permission='denied';await denied.click('createTaskFile');assert.equal(denied.file.writes,0);assert.match(denied.nodes.taskFileDetail.textContent,/Allow editing/);
  app.file.missing=true;app.change(sample('Keep after removal'));await app.controller.flush();assert.match(app.nodes.taskFileDetail.textContent,/moved or removed/);delete app.file.missing;
  // Disconnect removes only the browser connection, never the real file.
  const saved=blocked.file.raw;await blocked.click('disconnectTaskFile'); // denied database forget still releases the file and says it may reopen
  assert.match(blocked.title(),/Disconnected for this visit/);assert.match(blocked.nodes.taskFileDetail.textContent,/may reopen/);assert.equal(blocked.controller.isConnected(),false);assert.equal(blocked.file.raw,saved);
  app.window.confirm=()=>true;await app.click('disconnectTaskFile');assert.equal(app.controller.isConnected(),false);assert.equal(app.store.value,undefined);
  // Two pages writing one file: same-origin lock serializes the read/check/write;
  // a stale page stops rather than overwriting the winner's data.
  let lockTail=Promise.resolve();const locks={request(name,callback){const result=lockTail.then(callback);lockTail=result.catch(()=>{});return result;}};
  const shared=disk(JSON.stringify(sample('Shared')));
  const one=boot({data:sample('Shared'),file:shared,locks}),two=boot({data:sample('Shared'),file:shared,locks});
  await one.controller.init();await one.click('openTaskFile');await two.controller.init();await two.click('openTaskFile');
  one.change(sample('Winner'));two.change(sample('Stale'));
  await Promise.all([one.controller.flush(),two.controller.flush()]);
  assert.equal(JSON.parse(shared.raw).tasks[0].title,'Winner');assert.match(two.title(),/not saved/);assert.equal(shared.maxActive,1);
  // Integrate the real app's form/save/load paths with the file controller.
  const harnessSource=fs.readFileSync('tests/runtime.test.cjs','utf8');
  const harness={require,console,Blob,URL,queueMicrotask};vm.createContext(harness);
  vm.runInContext(harnessSource.slice(0,harnessSource.indexOf('const clock = new Date'))+';this.boot=boot;',harness);
  const realFile=disk(),realStore={},cache=new Map();
  const options={fileWindow:{isSecureContext:true,showSaveFilePicker:async()=>realFile,showOpenFilePicker:async()=>[realFile]},indexedDB:idb(realStore)};
  let integrated=harness.boot(cache,new Date(2026,10,1,10).getTime(),options);await settle();
  await integrated.ids.createTaskFile.onclick();
  integrated.ids.addTask.onclick();integrated.ids.taskTitle.value='Form autosave';integrated.ids.taskForm.dispatch('submit');await settle();
  assert.equal(JSON.parse(realFile.raw).tasks[0].title,'Form autosave');
  integrated.ids.taskList.querySelector('.check-button').onclick();await settle();
  assert.equal(JSON.parse(realFile.raw).completed['2026-11-01'].length,1);
  integrated=harness.boot(cache,new Date(2026,10,2,10).getTime(),options);await settle();
  assert.equal(integrated.state().tasks[0].title,'Form autosave');assert.match(integrated.ids.taskFileStatus.textContent,/Saved to/);
  const noCache=harness.boot(new Map(),new Date(2026,10,2,10).getTime(),{...options,indexedDB:idb({}),storageWriteFails:true});await settle();
  noCache.context.crypto.randomUUID=()=> 'fresh_after_cleanup';
  await noCache.ids.openTaskFile.onclick();noCache.ids.addTask.onclick();noCache.ids.taskTitle.value='Works without cache';noCache.ids.taskForm.dispatch('submit');await settle();
  assert.equal(JSON.parse(realFile.raw).tasks.length,2);assert.match(noCache.ids.taskFileStatus.textContent,/Saved to/);
  // Deferring from today's Overdue list and Undo both reach the autosave JSON.
  const deferFile=disk(),deferConnection={},deferCache=new Map([['day-by-day.v1',JSON.stringify({version:5,tasks:[{id:'defer',kind:'once',title:'Carry forward',date:'2026-11-04',time:'18:30',description:'Keep notes',reminders:[15]}],completed:{}})]]);
  const deferOptions={fileWindow:{isSecureContext:true,showSaveFilePicker:async()=>deferFile,showOpenFilePicker:async()=>[deferFile]},indexedDB:idb(deferConnection)};
  let deferring=harness.boot(deferCache,new Date(2026,10,4,19).getTime(),deferOptions);await settle();await deferring.ids.createTaskFile.onclick();
  deferring.ids.overdueList.querySelector('.move-tomorrow').onclick();await settle();assert.equal(JSON.parse(deferFile.raw).tasks[0].date,'2026-11-05');
  deferring.ids.undoAction.onclick();await settle();assert.equal(JSON.parse(deferFile.raw).tasks[0].date,'2026-11-04');
  deferring.ids.overdueList.querySelector('.move-tomorrow').onclick();await settle();
  deferring=harness.boot(deferCache,new Date(2026,10,5,10).getTime(),deferOptions);await settle();assert.equal(deferring.state().tasks[0].date,'2026-11-05');assert.equal(deferring.ids.taskList.querySelector('.task-name').textContent,'Carry forward');
  // Retry file save resumes after a failed write without asking which copy to keep, but never over outside changes.
  const retryFile=disk(),retryApp=boot({data:sample('Before retry'),file:retryFile});await retryApp.controller.init();await retryApp.click('createTaskFile');
  assert.equal(retryApp.nodes.retryTaskFile.hidden,true);
  retryFile.writeFails=true;retryApp.change(sample('Waiting edit'));await retryApp.controller.flush();
  assert.match(retryApp.title(),/not saved/);assert.equal(retryApp.nodes.retryTaskFile.hidden,false);assert.equal(JSON.parse(retryFile.raw).tasks[0].title,'Before retry');
  await retryApp.click('retryTaskFile');assert.match(retryApp.title(),/not saved/);assert.equal(retryApp.nodes.retryTaskFile.hidden,false); // still failing
  delete retryFile.writeFails;await retryApp.click('retryTaskFile');
  assert.match(retryApp.title(),/^Saved to/);assert.equal(JSON.parse(retryFile.raw).tasks[0].title,'Waiting edit');assert.equal(retryApp.nodes.retryTaskFile.hidden,true);assert.equal(retryApp.nodes.fileChoiceDialog.open,undefined);
  retryFile.writeFails=true;retryApp.change(sample('Second edit'));await retryApp.controller.flush();delete retryFile.writeFails;
  retryFile.raw=JSON.stringify(sample('Changed elsewhere'));await retryApp.click('retryTaskFile');
  assert.match(retryApp.nodes.taskFileDetail.textContent,/changed elsewhere/);assert.equal(JSON.parse(retryFile.raw).tasks[0].title,'Changed elsewhere');assert.equal(retryApp.controller.isPending(),true);
  console.log('File persistence passed: creation, autosave, automatic reopening, cleanup/reconnect, permission renewal, queued edits, failed writes, pending recovery, external conflict, invalid files, blocked browser storage, cancellation, unsupported browser, missing file, disconnect, and retrying a failed file save.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
