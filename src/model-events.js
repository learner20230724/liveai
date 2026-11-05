const quiet=new Set(['response.audio.context','response.audio.done','output.transcript.updated','input.transcript.updated','output.transcript.done','input.transcript.done','response.audio.stop']);
export function cleanEventValue(value,depth=0){
 if(depth>4)return '[省略]';if(typeof value==='string')return value.replace(/sk-[A-Za-z0-9_-]{16,}/g,'[已隐藏]').replace(/Bearer\s+\S+/gi,'[已隐藏]').slice(0,1600);
 if(Array.isArray(value))return value.slice(0,12).map(v=>cleanEventValue(v,depth+1));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!/token|secret|authorization|api.?key|session_id|reasoning|thought|audio|base64/i.test(k)).slice(0,20).map(([k,v])=>[k,cleanEventValue(v,depth+1)]));return value;
}
export function observeModelEvent(state,event){
 const action=String(event.action||'');if(!action||quiet.has(action))return state;
 const data=cleanEventValue(event.data||{});let next={...state};
 if(action==='session_attached'){next.delegation=data.delegation??'未返回';next.memory=data.memory_scope??'未返回'}
 if(action==='session.updated'&&Array.isArray(data.tools))next.tools=data.tools.map(t=>typeof t==='string'?t:t.name).filter(Boolean);
 if(action==='voice_changed')next.voice=data.name||'官网默认';
 const entry={action,data,origin:event.origin==='client'?'client':'provider',at:Date.now()};next.events=[...(state.events||[]),entry].slice(-80);return next;
}
export const emptyModelState=()=>({delegation:'未连接',memory:'—',voice:'官网默认',tools:[],events:[]});
