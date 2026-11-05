import {connectionUrl,normalizeSettings} from './call-settings.js';
import {encodedFile} from './native-tools.js';
const channel='liveai-direct-v1',pending=new Map();
let ready=false,installed=false,extensionVersion='1.0.0';
function install(){if(installed||typeof window==='undefined')return;installed=true;window.addEventListener('message',e=>{if(e.source!==window||e.origin!==location.origin||e.data?.channel!==channel||e.data.direction!=='response')return;const p=pending.get(e.data.id);if(!p)return;pending.delete(e.data.id);clearTimeout(p.timer);e.data.error?p.reject(Object.assign(new Error(e.data.error),{status:e.data.status,code:e.data.code})):p.resolve(e.data.value);});}
export function extensionRequest(operation,payload={},timeout=900000){install();const id=crypto.randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error('请安装直连扩展，然后刷新网页'))},timeout);pending.set(id,{resolve,reject,timer});window.postMessage({channel,direction:'request',id,operation,payload},location.origin);});}
export function browserDirectReady(){return ready}
export async function prepareBrowserDirect(){
 try{
  const status=await extensionRequest('status',{},1200);extensionVersion=status.version||'1.0.0';if(status.ready){ready=true;return true}
  const {nonce,publicKey}=await extensionRequest('prepare',{},10000);
  const r=await fetch('/liveai/api/browser/bootstrap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({publicKey})});const data=await r.json();if(!r.ok)throw new Error(data.error||'连接配置失败');
  await extensionRequest('configure',{nonce,encryptedKey:data.encryptedKey},10000);ready=true;return true;
 }catch{ready=false;return false}
}
export async function requireBrowserDirect(options={}){if(!ready&&!await prepareBrowserDirect())throw new Error('请安装直连扩展，然后刷新网页');const s=normalizeSettings(options);if(s.memory==='user'&&extensionVersion==='1.0.0')throw new Error('请更新直连扩展以使用跨会话记忆');return connectionUrl(s)}
export async function browserApi(path,options={}){
 await requireBrowserDirect();
 if(path==='/images')return extensionRequest('images',JSON.parse(options.body));
 if(path==='/vision')return extensionRequest('vision',{prompt:options.body.get('prompt'),file:await encodedFile(options.body.get('file'))});
 throw new Error('未接入的直连操作');
}
