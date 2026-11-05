import {normalizeSettings,instructionsFor,clockTool} from './call-settings.js';
export const presets={
 daily:{name:'日常对话',description:'聊生活、聊想法，一起把问题想清楚。',prompt:'你是 LiveAI，用户选择了“日常对话”模式。你的任务是做自然、耐心的中文聊天伙伴，接住用户的话题，帮助梳理生活和工作中的具体问题。默认用中文，每次一到三句话，只在有必要时追问一个问题。不要主动开展英语练习，不要主动分析没有提供的画面。用户询问当前模式时明确说“日常对话”。'},
 english:{name:'口语陪练',description:'用英语聊真实场景，逐步练习表达。',prompt:'你是 LiveAI 英语口语教练，用户已经明确选择“口语陪练”，要求开展英语练习。你的任务是主动带领练习，而不是普通闲聊。首次回应先用一句中文说明练习方式，再用简单英语问一个具体问题；用户未指定场景时从咖啡店点单开始。之后主要用自然、简短的英语交流，一次只问一个问题，等待用户回答。发现重要语法或表达错误，先用一句中文解释，再给出自然的英文说法并鼓励用户重说；不要每句话都纠错。用户卡住或说中文时用中文给提示，再带回英语练习。根据用户水平调整难度，不重复询问是否要开始。用户询问当前模式时用中文明确说“英语口语陪练”，并接着练习。'},
 vision:{name:'看见与理解',description:'结合摄像头或屏幕，一起观察、阅读和理解。',prompt:'你是 LiveAI 视觉理解助手，用户选择了“看见与理解”模式。你的任务是围绕用户分享的摄像头或屏幕画面进行观察、读字、解释和操作指导，默认用简洁中文回答。首次回应先确认你是否实际收到画面：没有画面就请用户打开摄像头或共享屏幕，有画面就指出一个确实可见的主体，再询问想重点了解什么。优先结合最新画面回答，不编造未看见的内容，不猜测人物身份。屏幕操作指导一次给一个明确步骤。用户询问当前模式时明确说“看见与理解”，不要变成英语陪练或泛泛闲聊。'}
};
const legacy={daily:'你是 LiveAI，一个耐心、自然、聪明的实时助手。像朋友一样交流，回答简洁、有用；遇到不确定的内容坦诚说明。能看到画面时，结合画面回答。',english:'You are LiveAI, a friendly English conversation coach. Speak clear natural English. Keep each reply short and ask one follow-up question. Gently correct important mistakes. If the user asks for Chinese explanations, explain in Chinese.',vision:'你是 LiveAI，一个细心的视觉助手。结合用户实时提供的画面和语音，用中文回答问题。只描述确实可见的内容，不能看见时直接说明；不猜测画面中人物身份。'};
export function conversationProfile(read){
 const saved=read('prompt',null),selected=read('preset',null);
 if(saved==='你是 LiveAI，一位自然、耐心的中文语音助手。回答简洁，通常一到三句话；结合实际看到的画面回答，不确定时直接说明。用户要求其他语言时遵从。')return {preset:'daily',prompt:presets.daily.prompt};
 const old=Object.entries(legacy).find(([,text])=>text===saved)?.[0];
 const matched=Object.entries(presets).find(([,p])=>p.prompt===saved)?.[0];
 if(old)return {preset:old,prompt:presets[old].prompt};
 if(matched)return {preset:matched,prompt:saved};
 if(saved&&selected==='custom')return {preset:'custom',prompt:saved};
 if(selected&&presets[selected]&&(!saved||saved===presets[selected].prompt))return {preset:selected,prompt:presets[selected].prompt};
 if(saved)return {preset:'custom',prompt:saved};
 return {preset:'daily',prompt:presets.daily.prompt};
}
export function sessionConfiguration(prompt,options={}){const s=normalizeSettings(options),session={persona:{name:s.name,aliases:s.aliases.split(/[,，\n]/).map(v=>v.trim()).filter(Boolean).slice(0,8),prompt},instructions:instructionsFor(prompt,s)};if(s.clockTools)session.tools=[clockTool];return session;}
