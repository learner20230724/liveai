// Only this site's top-level workspace can invoke the extension.
if(window.top===window){
 const marker='liveai-direct-v1';
 window.addEventListener('message',async e=>{
  if(e.source!==window||e.origin!=='https://guihualab.cn'||e.data?.channel!==marker||e.data.direction!=='request')return;
  const {id,operation,payload}=e.data;
  if(!['prepare','configure','images','vision','status'].includes(operation))return;
  try{const result=await chrome.runtime.sendMessage({operation,payload});window.postMessage({channel:marker,direction:'response',id,...result},location.origin)}catch{window.postMessage({channel:marker,direction:'response',id,error:'直连扩展已更新，请刷新网页'},location.origin)}
 });
}
