const ORIGIN='https://guihualab.cn';
let offscreenReady;
async function ensureOffscreen(){if(await chrome.offscreen.hasDocument())return;if(!offscreenReady)offscreenReady=chrome.offscreen.createDocument({url:'offscreen.html',reasons:['BLOBS'],justification:'构造图片上传 Blob，并在网页切换时完成官网任务'}).finally(()=>{offscreenReady=undefined});await offscreenReady;}
const WS='wss://api.mosi.cn/v1/realtime?model=moss-live-1.0';
const pairs=new Map();
const from64=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
const to64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
async function configure(payload){
 const pair=pairs.get(payload?.nonce);pairs.delete(payload?.nonce);if(!pair)throw new Error('直连配置已失效，请重试');
 const key=new TextDecoder().decode(await crypto.subtle.decrypt({name:'RSA-OAEP'},pair.privateKey,from64(payload.encryptedKey)));
 if(!/^sk-[A-Za-z0-9_-]{20,200}$/.test(key))throw new Error('官网配置无效');
 await chrome.storage.session.set({mossKey:key});
 await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:[1],addRules:[{id:1,priority:1,action:{type:'modifyHeaders',requestHeaders:[{header:'Authorization',operation:'set',value:'Bearer '+key},{header:'Origin',operation:'remove'}]},condition:{regexFilter:'^wss://api\\.mosi\\.cn/v1/realtime\\?model=moss-live-1\\.0$',initiatorDomains:['guihualab.cn'],resourceTypes:['websocket']}}]});
 return {ready:true,endpoint:WS};
}
async function execute(operation,payload){
 if(operation==='status')return {ready:!!(await chrome.storage.session.get('mossKey')).mossKey};
 if(operation==='prepare'){
  const pair=await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},false,['encrypt','decrypt']);
  const nonce=crypto.randomUUID();pairs.clear();pairs.set(nonce,pair);const pub=await crypto.subtle.exportKey('spki',pair.publicKey);
  return {nonce,publicKey:'-----BEGIN PUBLIC KEY-----\n'+to64(pub)+'\n-----END PUBLIC KEY-----'};
 }
 if(operation==='configure')return configure(payload);
 if(['images','vision'].includes(operation)){
  await ensureOffscreen();
  const {mossKey}=await chrome.storage.session.get('mossKey');if(!mossKey)throw new Error('请重新连接直连扩展');
  const result=await chrome.runtime.sendMessage({target:'offscreen',operation,payload,mossKey});if(result.error)throw Object.assign(new Error(result.error),{status:result.status,code:result.code});return result.value;
 }
 throw new Error('不支持这个操作');
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 if(sender.frameId!==0||!sender.tab||!sender.url?.startsWith(ORIGIN+'/liveai/'))return;
 execute(message.operation,message.payload).then(value=>reply({value})).catch(e=>reply({error:e.message,status:e.status,code:e.code}));return true;
});
