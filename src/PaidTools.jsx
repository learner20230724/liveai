import React,{useState} from 'react';
import {LockKeyhole,Unlock,LoaderCircle,Volume2,Download} from 'lucide-react';
import {nativeTools,toolRequest,encodedFile} from './native-tools.js';
import {nativeShell} from './native.js';
import {models} from '../server/catalog.mjs';
import {download} from './workspace.js';

export default function PaidTools({unlocked}){
  const [password,setPassword]=useState(''),[unlocking,setUnlocking]=useState(false),[error,setError]=useState(''),[model,setModel]=useState(''),[text,setText]=useState(''),[voice,setVoice]=useState(''),[secondVoice,setSecondVoice]=useState(''),[instruction,setInstruction]=useState(''),[file,setFile]=useState(null),[busy,setBusy]=useState(false),[result,setResult]=useState(null),[voices,setVoices]=useState([]);
  async function unlock(e){e.preventDefault();setUnlocking(true);setError('');try{await toolRequest('unlockPaid',{password});setPassword('');}catch(e){setError(e.message)}finally{setUnlocking(false)}}
  async function lock(){setError('');try{await toolRequest('lockPaid')}catch(e){setError(e.message)}}
  async function loadVoices(){setError('');try{const result=await toolRequest('voices');setVoices(result.data||result.voices||[])}catch(e){setError(e.message)}}
  async function submit(e){e.preventDefault();setBusy(true);setError('');setResult(null);try{
    let operation,payload={model};
    if(model.startsWith('moss-tts-')){operation='speech';payload={...payload,input:text,voice_id:voice};}
    else if(model==='moss-ttsd-1.0'){
      operation='speakers';const segments=text.split('\n').map(s=>s.trim()).filter(Boolean).map((line,i)=>{const match=/^([AB]):\s*(.+)$/i.exec(line);return {speaker:match?match[1].toUpperCase():(i%2?'B':'A'),text:match?match[2]:line}});payload={...payload,speakers:[{id:'A',voice_id:voice},{id:'B',voice_id:secondVoice}],segments};
    }else if(model==='moss-voice-generator-1.0'){operation='voiceDesign';payload={...payload,input:text,instruction};}
    else{operation='transcribe';payload={...payload,file:await encodedFile(file)};}
    setResult(await toolRequest(operation,payload));
  }catch(e){setError(e.message)}finally{setBusy(false)}}
  const item=models.find(m=>m.id===model),speech=model.startsWith('moss-tts-'),dialogue=model==='moss-ttsd-1.0',design=model==='moss-voice-generator-1.0',transcribe=model.startsWith('moss-transcribe');
  const valid=model&&(transcribe?file:speech?text.trim()&&voice.trim():dialogue?text.trim()&&voice.trim()&&secondVoice.trim():design?text.trim()&&instruction.trim():false);
  return <section className="paid-tools">
    <header><LockKeyhole size={20}/><div><h2>付费工具</h2></div></header>
    {!nativeTools()?<a className="button subtle" href="/liveai/downloads/liveai-latest.apk">打开 APP 付费工具</a>:!unlocked?<form onSubmit={unlock} className="paid-unlock-form"><label htmlFor="paid-password">付费解锁密码<input id="paid-password" type="password" autoComplete="current-password" maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} required placeholder="现有 LiveAI 访问密码"/></label><button className="button primary" disabled={unlocking||!password}>{unlocking?<LoaderCircle size={17} className="spin"/>:<Unlock size={17}/>}解锁付费模型</button></form>:<>
      <div className="paid-unlocked"><span><Unlock size={16}/>已解锁</span><button className="button subtle" onClick={lock}>重新锁定</button></div>
      <form className="paid-operation-form" onSubmit={submit}>
        <label htmlFor="paid-model">选择付费模型<select id="paid-model" value={model} onChange={e=>{setModel(e.target.value);setError('');setResult(null)}} disabled={busy}><option value="">请选择模型</option>{models.filter(m=>m.tier==='paid').map(m=><option key={m.id} value={m.id}>{m.name} · {m.price}</option>)}</select></label>
        {item&&<p className="field-hint">{item.description} · {item.price}，实际以官网账单为准。</p>}
        {(speech||dialogue)&&<><label htmlFor="paid-voice">{dialogue?'角色 A 声音 ID':'声音 ID'}<input id="paid-voice" value={voice} onChange={e=>setVoice(e.target.value)} required list="paid-voices"/></label><button className="button subtle" type="button" onClick={loadVoices}>读取官网可用声音</button><datalist id="paid-voices">{voices.map(v=><option key={v.id} value={v.id}>{v.name||v.id}</option>)}</datalist></>}
        {dialogue&&<label htmlFor="second-voice">角色 B 声音 ID<input id="second-voice" value={secondVoice} onChange={e=>setSecondVoice(e.target.value)} required list="paid-voices"/></label>}
        {design&&<label htmlFor="voice-instruction">声音描述<textarea id="voice-instruction" rows={3} maxLength={4000} value={instruction} onChange={e=>setInstruction(e.target.value)} required placeholder="例如：沉稳、温暖的成年男声，语速适中。"/></label>}
        {(speech||dialogue||design)&&<label htmlFor="paid-input">{dialogue?'对话台词':'朗读文字'}<textarea id="paid-input" rows={5} maxLength={45000} value={text} onChange={e=>setText(e.target.value)} required placeholder={dialogue?'A: 你好，今天想聊什么？\nB: 聊聊最近的旅行。':'输入需要合成的文字。'}/></label>}
        {transcribe&&<label htmlFor="transcribe-file">音频或视频（20 MB 以内）<input id="transcribe-file" type="file" accept="audio/*,video/mp4,video/webm" onChange={e=>{const f=e.target.files?.[0];if(f&&f.size>20*1024*1024){setError('文件不能超过 20 MB');e.target.value='';return}setFile(f)}} required/></label>}
        {model&&<button className="button primary" disabled={busy||!valid}>{busy?<LoaderCircle size={17} className="spin"/>:<Volume2 size={17}/>} {busy?'官网正在处理':'提交付费任务'}</button>}
      </form>
    </>}
    {error&&<p className="paid-error" role="alert">{error}</p>}
    {result&&<div className="paid-result"><h3>处理结果</h3>{result.audio_url?<><audio controls preload="metadata" src={result.audio_url}/><button className="button primary" onClick={()=>nativeShell()?.saveOutput?.(result.outputToken,'LiveAI-'+Date.now()+'.mp3')}><Download size={16}/>保存音频文件</button></>:<><pre>{result.text||JSON.stringify(result,null,2)}</pre><button className="button subtle" onClick={()=>download(result.text||JSON.stringify(result,null,2),'LiveAI-转写.txt')}><Download size={16}/>导出文字</button></>}</div>}

  </section>;
}
