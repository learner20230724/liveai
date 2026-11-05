export const defaults={name:'LiveAI',aliases:'Live AI',instructions:'',language:'auto',length:'auto',tone:'auto',rate:1,volume:1,memory:'session',user:'',focus:'auto',fps:1,cameraEdge:480,screenEdge:960,quality:.6,inputDevice:'',clockTools:false};
const pick=(value,values,fallback)=>values.includes(value)?value:fallback;
const number=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;
export function normalizeSettings(value={}){
 const s={...defaults,...value};
 return {clockTools:s.clockTools===true,name:String(s.name||'LiveAI').trim().slice(0,40)||'LiveAI',aliases:String(s.aliases||'').slice(0,240),instructions:String(s.instructions||'').slice(0,8000),language:pick(s.language,['auto','zh','en'],'auto'),length:pick(s.length,['auto','short','detailed'],'auto'),tone:pick(s.tone,['auto','warm','lively','formal'],'auto'),rate:number(s.rate,.5,2,1),volume:number(s.volume,0,1,1),memory:pick(s.memory,['session','user'],'session'),user:/^[A-Za-z0-9_-]{1,64}$/.test(s.user)?s.user:'',focus:pick(s.focus,['auto','camera','screen'],'auto'),fps:number(s.fps,.5,2,1),cameraEdge:number(s.cameraEdge,320,640,480),screenEdge:number(s.screenEdge,640,1280,960),quality:number(s.quality,.3,.8,.6),inputDevice:String(s.inputDevice||'').slice(0,200)};
}
export function loadSettings(read){const value=normalizeSettings(read('callSettings',{}));if(!value.user)value.user=read('callUser','')||globalThis.crypto.randomUUID();return value;}
export function instructionsFor(prompt,value){
 const s=normalizeSettings(value),parts=[s.instructions.trim()||prompt];
 if(s.language!=='auto')parts.push(s.language==='zh'?'默认使用中文回答，用户明确要求其他语言时遵从。':'默认使用英语回答，需要解释时按用户要求切换语言。');
 if(s.length!=='auto')parts.push(s.length==='short'?'回答尽量简短，一到三句话。':'按问题需要给出详细、清晰的解释。');
 if(s.tone!=='auto')parts.push(({warm:'使用温和、耐心、自然的交流语气。',lively:'使用活泼、轻快、自然的交流语气。',formal:'使用正式、专业、直接的交流语气。'})[s.tone]);
 return parts.join('\n').slice(0,8000);
}
export function connectionUrl(value){const s=normalizeSettings(value),url=new URL('wss://api.mosi.cn/v1/realtime?model=moss-live-1.0');if(s.memory==='user'){if(!s.user)throw new Error('用户记忆标识无效');url.searchParams.set('user',s.user)}return url.href;}

export const clockTool={type:'function',name:'liveai_current_time',description:'读取用户设备的当前日期、时间和时区。只在用户需要知道本地日期或时间时调用。',parameters:{type:'object',properties:{},additionalProperties:false}};
