import {nativeShell} from './native.js';
import {models,verifiedAt} from '../server/catalog.mjs';
const pending=new Map(),listeners=new Set();
let installed=false,timer,snapshot={images:[],paidUnlocked:false,stats:{},running:0,queued:0};
export function nativeTools(){try{return (nativeShell()?.toolsVersion?.()||0)>=1}catch{return false}}
function parse(text,fallback){try{return JSON.parse(text)||fallback}catch{return fallback}}
function refresh(){if(!nativeTools())return;const next=parse(nativeShell().toolState(),null);if(next&&next.images){snapshot=next;for(const listener of listeners)listener();}}
function result(data){const p=pending.get(data?.id);if(!p||!data.done)return;pending.delete(data.id);clearTimeout(p.timer);if(data.error)p.reject(new Error(data.error));else p.resolve(data.value);}
function drain(){for(const id of pending.keys())result(parse(nativeShell()?.toolResult?.(id),null));}
function install(){if(installed||typeof window==='undefined')return;installed=true;window.addEventListener('liveai:native',e=>{if(e.detail?.type==='tools'){snapshot=e.detail.state;for(const fn of listeners)fn();}if(e.detail?.type==='tool-result')result(e.detail.result);if(e.detail?.type==='refresh'){refresh();drain();}});window.addEventListener('pageshow',()=>{refresh();drain()});refresh();}
export function getTools(){install();return snapshot}
export function subscribeTools(fn){install();listeners.add(fn);if(!timer)timer=setInterval(()=>{refresh();drain()},1000);return()=>{listeners.delete(fn);if(!listeners.size){clearInterval(timer);timer=undefined}}}
export function toolRequest(operation,payload={}){
  install();if(!nativeTools())return Promise.reject(Object.assign(new Error('此能力需要新版直连 APP，请覆盖安装 3.0。'),{code:'UPGRADE_REQUIRED'}));
  const id=crypto.randomUUID();return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('等待任务结果超时；官网可能仍在处理，请勿自动重复提交。'))},17*60*1000);
    pending.set(id,{resolve,reject,timer:timeout});
    try{nativeShell().requestTool(id,operation,JSON.stringify(payload));}catch(e){clearTimeout(timeout);pending.delete(id);reject(e)}
  });
}
export function submitNativeImage(input){install();const answer=parse(nativeShell().submitImage(JSON.stringify(input)),{});if(!answer.ok)throw new Error(answer.error||'未能提交图片任务');refresh();return answer.id}
export function cancelNativeImage(id){nativeShell().cancelImage(id);refresh()}
export function removeNativeImage(id){nativeShell().removeImage(id);refresh()}
export async function encodedFile(file){
  if(!file||file.size<=0||file.size>20*1024*1024)throw new Error('请选择 20 MB 以内的文件');
  const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('无法读取所选文件'));reader.readAsDataURL(file)});
  return {name:file.name,mime:file.type||'application/octet-stream',base64};
}
export async function nativeApi(path,options={}){
  install();
  if(path==='/session')return {authenticated:!!parse(nativeShell().preferences(),{}).configured};
  if(path==='/models')return {models,verifiedAt,paidEnabled:getTools().paidUnlocked,nativeDirect:true};
  if(path==='/stats')return getTools().stats;
  if(path==='/vision')return toolRequest('vision',{prompt:options.body.get('prompt'),file:await encodedFile(options.body.get('file'))});
  const operations={'/paid/unlock':'unlockPaid','/paid/lock':'lockPaid','/paid/speech':'speech','/paid/speakers':'speakers','/paid/voice-design':'voiceDesign','/paid/transcribe':'transcribe','/paid/voices':'voices'};
  if(operations[path])return toolRequest(operations[path],options.body?JSON.parse(options.body):{});
  throw new Error('原生直连未接入这个操作，不会改走服务器中转');
}
