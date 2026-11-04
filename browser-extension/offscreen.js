const API='https://api.mosi.cn/v1';
const from64=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
async function request(mossKey,path,body,method='POST'){

 const headers={Authorization:'Bearer '+mossKey};if(body&&!(body instanceof FormData))headers['Content-Type']='application/json';
 const response=await fetch(API+path,{method,headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(900000)});
 const data=await response.json();if(!response.ok){const error=new Error(data.error?.message||'官网请求失败');error.status=response.status;error.code=data.error?.code;throw error;}return data;
}
async function execute(operation,payload,mossKey){
 if(operation==='images'){
  if(!['moss-image-sft-1.0','moss-image-base-1.0'].includes(payload?.model)||!['512x512','1024x1024','768x1024','1024x768','1024x1536','1536x1024','2048x2048'].includes(payload?.size))throw new Error('请选择支持的免费图像模型和尺寸');
  const prompt=String(payload.prompt||'').trim();if(!prompt||prompt.length>4000)throw new Error('请填写画面描述');
  return request(mossKey,'/images/generations',{model:payload.model,prompt,size:payload.size,n:1,seed:Math.floor(Math.random()*Number.MAX_SAFE_INTEGER),response_format:'url',prompt_enhance:false,output_watermark:{enabled:false}});
 }
 if(operation==='vision'){
  const file=payload?.file;if(!file||!['image/png','image/jpeg','image/webp'].includes(file.mime)||file.base64.length>28*1024*1024)throw new Error('请选择 20 MB 以内的图片');
  const bytes=from64(file.base64);if(bytes.length>20*1024*1024)throw new Error('图片过大');const form=new FormData();form.set('purpose','image');form.set('file',new Blob([bytes],{type:file.mime}),file.name);
  const uploaded=await request(mossKey,'/files',form);try{return await request(mossKey,'/responses',{model:'moss-vl-1.0',input:[{role:'user',content:[{type:'input_text',text:String(payload.prompt||'').slice(0,4000)},{type:'input_image',file_id:uploaded.id}]}]})}finally{if(uploaded.id)try{await request(mossKey,'/files/'+encodeURIComponent(uploaded.id),null,'DELETE')}catch{}}
 }
}
chrome.runtime.onMessage.addListener((m,sender,reply)=>{if(m.target!=='offscreen'||sender.id!==chrome.runtime.id)return;const keep=setInterval(()=>chrome.runtime.sendMessage({target:'keepalive'}).catch(()=>{}),20000);execute(m.operation,m.payload,m.mossKey).then(value=>reply({value})).catch(e=>reply({error:e.message,status:e.status,code:e.code})).finally(()=>clearInterval(keep));return true;});
