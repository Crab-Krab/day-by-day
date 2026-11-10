// The simulated browser shared by the runtime, interface and file tests. It loads the real app
// sources into a small in-memory page, with no network, real files or user data.
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
    close() { this.open = false; queueMicrotask(() => this.dispatch('close')); }
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
module.exports = { boot, html, source };
