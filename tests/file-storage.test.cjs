const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('src/file-storage.js', 'utf8');
const helpers = require('../src/schedule.js');
const valid = value => JSON.parse(JSON.stringify(helpers.validate(value)));
const empty = () => valid({version:5,tasks:[],completed:{}});
const sample = title => valid({version:5,tasks:[{id:'task1',title,kind:'once',date:'2026-11-01'}],completed:{}});
const settle = async () => { for (let n = 0; n < 60; n++) await Promise.resolve(); };
function disk(initial = '', name = 'Day-by-Day-tasks.json') {
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
// A chosen folder holding one file. An empty file stands for "no task file yet", and is created on request.
function folderWith(file) {
  const missing=()=>Object.assign(Error('Missing'),{name:'NotFoundError'});
  return {name:'Tasks',async getFileHandle(name,{create}={}){
    if(name===file.name)return file;
    if(file.raw===''&&create){file.name=name;return file;}
    throw missing();
  }};
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
function boot({data=empty(),store={},file=disk(),supported=true,storageFails=false,recovery=false,locks,keepCopy,database,quickTimeouts=false}={}) {
  let state=data;
  const nodes={}, listeners={}, shell={};
  const node=id=>nodes[id] ||= {hidden:false,disabled:false,textContent:'',dataset:{},listeners:{},setAttribute(key,value){this[key]=String(value);},addEventListener(key,fn){this.listeners[key]=fn;},showModal(){this.open=true;},close(){this.open=false;}};
  const window={isSecureContext:supported,addEventListener:(key,fn)=>listeners[key]=fn,confirm:()=>true,
    showDirectoryPicker:async()=>folderWith(file), showOpenFilePicker:async()=>[file],
    showSaveFilePicker:async()=>{throw Error('Create new task file must never use a Save dialog.');}};
  const context={window,document:{getElementById:node,querySelector:()=>shell},indexedDB:database||idb(store,storageFails),setTimeout:quickTimeouts?(fn,ms)=>ms===4000?(queueMicrotask(fn),0):setTimeout(fn,ms):setTimeout,clearTimeout,console,Blob,navigator:{locks}};
  vm.createContext(context);vm.runInContext(source,context);
  const controller=window.createTaskFileStorage({sizeLimit:helpers.SIZE_LIMIT,getData:()=>state,validate:valid,applyData:value=>state=valid(value),backup:()=>{},hasRecovery:()=>recovery,keepCopy});
  return {controller,nodes,window,store,file,listeners,shell,state:()=>state,change(value){state=value;controller.changed();},click:id=>nodes[id].onclick(),title:()=>nodes.taskFileStatus.textContent};
}
async function main() {
  const file=disk(),store={}; let app=boot({data:sample('First'),file,store});
  await app.controller.init(); await app.click('createTaskFile');
  assert.equal(app.nodes.taskFileDetails.hidden,true);
  assert.equal(app.nodes.manageTaskFile['aria-expanded'],'false');
  app.click('manageTaskFile');assert.equal(app.nodes.taskFileDetails.hidden,false);
  assert.equal(JSON.parse(file.raw).tasks[0].title,'First'); assert.match(app.title(),/^Saved to/);
  assert.equal(store.value.handle,file); assert.equal(app.shell.inert,false);
  app.change(sample('Edited')); await app.controller.flush();
  assert.equal(app.nodes.taskFileDetails.hidden,false); // user-opened details stay open after a save
  app.click('manageTaskFile');assert.equal(app.nodes.taskFileDetails.hidden,true);
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
  assert.equal(app.nodes.taskFileDetails.hidden,false); // errors cannot be hidden by the compact status
  delete file.closeFails;
  // The file still matches the last synced copy, so Reconnect saves the newer browser tasks without asking.
  await app.click('reconnectTaskFile');assert.notEqual(app.nodes.fileChoiceDialog.open,true);assert.equal(JSON.parse(file.raw).tasks[0].title,'Unsaved edit');
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
  assert.equal(unsupported.nodes.taskFileDetails.hidden,false);
  // A slow remembered-file permission check must not make the checklist inert.
  const slowFile=disk(JSON.stringify(sample('Before startup')));
  let releasePermission;slowFile.queryPermission=()=>new Promise(resolve=>releasePermission=resolve);
  const slow=boot({data:sample('Before startup'),file:slowFile,store:{value:{handle:slowFile,baseline:JSON.stringify(sample('Before startup'))}}});
  const initializing=slow.controller.init();await settle();assert.equal(slow.shell.inert,false);
  slow.change(sample('Edited while connecting'));releasePermission('granted');await settle();
  assert.notEqual(slow.nodes.fileChoiceDialog.open,true);await initializing; // file unchanged, so the edit simply saves
  assert.equal(JSON.parse(slowFile.raw).tasks[0].title,'Edited while connecting');assert.equal(slow.shell.inert,false);
  // Reconnect after permission expires: an unchanged file never asks, and the edit is kept (audit F-02).
  const synced=disk(),syncedStore={};let expiry=boot({data:sample('Synced'),file:synced,store:syncedStore});await expiry.controller.init();await expiry.click('createTaskFile');
  synced.permission='prompt';expiry=boot({data:sample('Synced'),file:synced,store:syncedStore});await expiry.controller.init();assert.match(expiry.title(),/^Reconnect/);
  expiry.change(sample('Edited before reconnect'));synced.permission='granted';await expiry.click('reconnectTaskFile');
  assert.notEqual(expiry.nodes.fileChoiceDialog.open,true);assert.equal(expiry.state().tasks[0].title,'Edited before reconnect');
  assert.equal(JSON.parse(synced.raw).tasks[0].title,'Edited before reconnect');assert.match(expiry.title(),/^Saved to/);
  // When both the file and the browser copy changed, it still asks.
  synced.permission='prompt';expiry=boot({data:sample('Edited before reconnect'),file:synced,store:syncedStore});await expiry.controller.init();
  synced.raw=JSON.stringify(sample('Edited in another program'));expiry.change(sample('Edited here too'));synced.permission='granted';
  const asking=expiry.click('reconnectTaskFile');await settle();assert.equal(expiry.nodes.fileChoiceDialog.open,true);expiry.click('fileChoiceCurrent');await asking;
  assert.equal(JSON.parse(synced.raw).tasks[0].title,'Edited here too');
  // Create new task file asks for a folder and makes Day-by-Day-tasks.json there (audit F-01).
  // Chrome empties a file chosen in a Save dialog before the app can read it, so no Save dialog is used.
  const fresh=boot({data:sample('Brand new')});await fresh.controller.init();await fresh.click('createTaskFile');
  assert.equal(fresh.file.name,'Day-by-Day-tasks.json');assert.equal(JSON.parse(fresh.file.raw).tasks[0].title,'Brand new');assert.match(fresh.title(),/^Saved to Day-by-Day-tasks\.json/);
  // A folder that already has a task file opens it instead of replacing it. After browser cleanup, its tasks simply load.
  for(const name of ['Day-by-Day-tasks.json','Day-by-Day-data.json']){
    const existing=disk(JSON.stringify(sample('Old history')),name),cleaned=boot({data:empty(),file:existing});
    await cleaned.controller.init();await cleaned.click('createTaskFile');
    assert.equal(cleaned.state().tasks[0].title,'Old history');assert.equal(JSON.parse(existing.raw).tasks[0].title,'Old history');
    assert.match(cleaned.nodes.taskFileDetail.textContent,/already had a task file/);
  }
  // With different tasks in the browser, it asks which to keep, and Cancel leaves the file untouched.
  const kept=disk(JSON.stringify(sample('Old history')),'Day-by-Day-tasks.json'),askingNew=boot({data:sample("Browser tasks"),file:kept});
  await askingNew.controller.init();const choosing=askingNew.click('createTaskFile');await settle();assert.equal(askingNew.nodes.fileChoiceDialog.open,true);
  askingNew.click('fileChoiceCancel');await choosing;assert.equal(JSON.parse(kept.raw).tasks[0].title,'Old history');assert.equal(askingNew.controller.isConnected(),false);
  // A rejected Change file keeps the working file saving (audit F-03).
  const working=disk(),notTasks=disk('not json','notes.json');const switching=boot({data:sample('Working'),file:working});
  await switching.controller.init();await switching.click('createTaskFile');switching.window.showOpenFilePicker=async()=>[notTasks];
  await switching.click('openTaskFile');assert.match(switching.title(),/^Still saving to/);assert.match(switching.nodes.taskFileDetail.textContent,/not a valid/);
  assert.equal(switching.nodes.reconnectTaskFile.hidden,true);switching.change(sample('Saved after a wrong pick'));await switching.controller.flush();
  assert.equal(JSON.parse(working.raw).tasks[0].title,'Saved after a wrong pick');assert.equal(notTasks.raw,'not json');assert.match(switching.title(),/^Saved to/);
  // Cancelling a switch also keeps the working file saving.
  const otherTasks=disk(JSON.stringify(sample('Other file')),'other.json');switching.window.showOpenFilePicker=async()=>[otherTasks];
  const switchCancel=switching.click('openTaskFile');await settle();switching.click('fileChoiceCancel');await switchCancel;
  assert.match(switching.title(),/^Still saving to/);switching.change(sample('Saved after cancel'));await switching.controller.flush();
  assert.equal(JSON.parse(working.raw).tasks[0].title,'Saved after cancel');assert.equal(JSON.parse(otherTasks.raw).tasks[0].title,'Other file');
  // A slow browser database at startup is reported, not shown as first-time setup, and is tried again (audit F-04).
  const slowDb={value:undefined},slowStoreFile=disk(JSON.stringify(sample('Slow lookup')));let opens=0;const realIdb=idb(slowDb);
  const hanging={open(){opens++;return opens===1?{}:realIdb.open();}}; // the first open never answers
  const lookupApp=boot({data:sample('Slow lookup'),file:slowStoreFile,database:hanging,quickTimeouts:true});
  await lookupApp.controller.init();assert.match(lookupApp.title(),/^Could not check/);assert.equal(lookupApp.nodes.taskFileDetails.hidden,false);
  await lookupApp.click('openTaskFile');assert.equal(opens,2);assert.equal(slowDb.value.handle,slowStoreFile);assert.match(lookupApp.title(),/^Saved to/);
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
  const options={fileWindow:{isSecureContext:true,showDirectoryPicker:async()=>folderWith(realFile),showOpenFilePicker:async()=>[realFile]},indexedDB:idb(realStore)};
  let integrated=harness.boot(cache,new Date(2026,10,1,10).getTime(),options);await settle();
  await integrated.ids.createTaskFile.onclick();
  integrated.ids.addTask.onclick();integrated.ids.taskTitle.value='Form autosave';integrated.ids.taskForm.dispatch('submit');await settle();
  assert.equal(JSON.parse(realFile.raw).tasks[0].title,'Form autosave');
  integrated.ids.taskList.querySelector('.check-button').onclick();await settle();
  assert.equal(JSON.parse(realFile.raw).completed['2026-11-01'].length,1);
  integrated=harness.boot(cache,new Date(2026,10,2,10).getTime(),options);await settle();
  assert.equal(integrated.state().tasks[0].title,'Form autosave');assert.match(integrated.ids.taskFileStatus.textContent,/Saved to/);
  // Startup must not replace data underneath an editor, including a task deleted
  // from the file. Save asks which copy to keep; Cancel follows the latest file.
  for (const deleted of [false,true]) for (const saveDraft of [false,true]) {
    const before=sample('Cached task'),latest=deleted?empty():sample('Updated on disk');
    const startupFile=disk(JSON.stringify(before));
    let release;startupFile.queryPermission=()=>new Promise(resolve=>release=resolve);
    const startupCache=new Map([['day-by-day.v1',JSON.stringify(before)]]);
    const editing=harness.boot(startupCache,new Date(2026,10,1,10).getTime(),{
      fileWindow:{isSecureContext:true,showDirectoryPicker:async()=>folderWith(startupFile),showOpenFilePicker:async()=>[startupFile]},
      indexedDB:idb({value:{handle:startupFile,baseline:JSON.stringify(before)}})
    });
    await settle();editing.ids.taskList.querySelector('.edit-task').onclick();
    editing.ids.taskTitle.value='Draft while connecting';release('granted');await settle();
    assert.equal(editing.ids.taskDialog.open,true);
    assert.equal(editing.ids.fileChoiceDialog.open,false);
    assert.equal(editing.state().tasks[0].title,'Cached task');
    assert.match(editing.ids.taskFileStatus.textContent,/Finish editing/);
    startupFile.raw=JSON.stringify(latest); // change after the first file read
    if (saveDraft) {
      editing.ids.taskForm.dispatch('submit');await settle();
      assert.equal(editing.ids.fileChoiceDialog.open,true);
      assert.equal(editing.state().tasks[0].title,'Draft while connecting');
      assert.equal(startupFile.raw,JSON.stringify(latest));
      editing.ids.fileChoiceCurrent.onclick();await settle();
      assert.equal(JSON.parse(startupFile.raw).tasks[0].title,'Draft while connecting');
    } else {
      editing.ids.cancelDialog.onclick();await settle();
      assert.equal(JSON.stringify(editing.state().tasks),JSON.stringify(latest.tasks));
      assert.equal(startupFile.writes,0);
    }
    assert.equal(editing.ids.taskDialog.open,false);
    assert.match(editing.ids.taskFileStatus.textContent,/^Saved to/);
    assert.equal(editing.context.document.querySelector('.app-shell').inert,false);
  }
  console.log('Startup editor safety passed: updated/deleted file tasks wait for Save or Cancel, the latest file is reread, and saved drafts require an explicit conflict choice.');
  const noCache=harness.boot(new Map(),new Date(2026,10,2,10).getTime(),{...options,indexedDB:idb({}),storageWriteFails:true});await settle();
  noCache.context.crypto.randomUUID=()=> 'fresh_after_cleanup';
  await noCache.ids.openTaskFile.onclick();noCache.ids.addTask.onclick();noCache.ids.taskTitle.value='Works without cache';noCache.ids.taskForm.dispatch('submit');await settle();
  assert.equal(JSON.parse(realFile.raw).tasks.length,2);assert.match(noCache.ids.taskFileStatus.textContent,/Saved to/);
  // Deferring from today's Overdue list and Undo both reach the autosave JSON.
  const deferFile=disk(),deferConnection={},deferCache=new Map([['day-by-day.v1',JSON.stringify({version:5,tasks:[{id:'defer',kind:'once',title:'Carry forward',date:'2026-11-04',time:'18:30',description:'Keep notes',reminders:[15]}],completed:{}})]]);
  const deferOptions={fileWindow:{isSecureContext:true,showDirectoryPicker:async()=>folderWith(deferFile),showOpenFilePicker:async()=>[deferFile]},indexedDB:idb(deferConnection)};
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
  // Choosing which copy to keep first saves a recovery copy of the one being replaced.
  for(const [answer,expected] of [['fileChoiceDisk','Shown tasks'],['fileChoiceCurrent','File tasks']]){
    const kept=[],choiceApp=boot({data:sample('Shown tasks'),file:disk(JSON.stringify(sample('File tasks'))),keepCopy:(reason,value)=>kept.push([reason,value.tasks[0].title])});
    await choiceApp.controller.init();const opening=choiceApp.click('openTaskFile');await settle();choiceApp.click(answer);await opening;
    assert.deepEqual(kept,[['choice',expected]]);
  }
  const quiet=[],sameApp=boot({data:sample('Same'),file:disk(JSON.stringify(sample('Same'))),keepCopy:(...args)=>quiet.push(args)});
  await sameApp.controller.init();await sameApp.click('openTaskFile');assert.equal(quiet.length,0); // nothing replaced, nothing copied
  console.log('File persistence passed: creation, autosave, automatic reopening, cleanup/reconnect, permission renewal, queued edits, failed writes, pending recovery, external conflict, invalid files, blocked browser storage, cancellation, unsupported browser, missing file, disconnect, retrying a failed file save, and recovery copies before which-copy choices.');
}
// A step that waits forever (for example on a dialog nobody answers) would otherwise end the run silently with success.
let finished=false;
process.on('exit',code=>{if(!finished&&code===0){console.error('File tests stopped before finishing: a step never completed.');process.exitCode=1;}});
main().then(()=>{finished=true;},error=>{finished=true;console.error(error);process.exitCode=1;});
