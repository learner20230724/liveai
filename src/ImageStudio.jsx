import React,{useState,useSyncExternalStore,useEffect} from 'react';
import {Sparkles,Plus,Download,RefreshCw,X,Trash2,Image as ImageIcon,LoaderCircle} from 'lucide-react';
import {read,save} from './workspace.js';
import {nativeTools} from './native-tools.js';
import {subscribeImages,imageSnapshot,submitImage,cancelImage,removeImage,saveImage,imageQueueInfo} from './image-jobs.js';

export default function ImageStudio({onError,onNotice}){
  const [prompt,setPrompt]=useState(()=>read('imagePrompt','')),[model,setModel]=useState('moss-image-sft-1.0'),[size,setSize]=useState('1024x1024'),[saving,setSaving]=useState(new Set()),[now,setNow]=useState(Date.now());
  const jobs=useSyncExternalStore(subscribeImages,imageSnapshot,imageSnapshot),running=jobs.filter(j=>j.status==='running').length,queued=jobs.filter(j=>j.status==='queued').length;
  useEffect(()=>{if(!running)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[running]);
  function enqueue(e,input={prompt,model,size}){e?.preventDefault();try{onError('');save('imagePrompt',prompt);submitImage(input);}catch(error){onError(error.message,error)}}
  async function album(job){setSaving(old=>new Set(old).add(job.id));try{await saveImage(job);onNotice(nativeTools()?'已保存到相册 · Pictures/LiveAI':'图片已下载');}catch(error){onError(error.message,error)}finally{setSaving(old=>{const next=new Set(old);next.delete(job.id);return next})}}
  return <div className="studio-layout image-workspace">
    <form className="studio-form" onSubmit={enqueue}>
      <div className="studio-title"><Sparkles size={20}/><h2>描述你的想象</h2><span className="pill">限时免费</span></div>
      <label htmlFor="image-prompt">画面描述<textarea id="image-prompt" rows={6} maxLength={4000} required value={prompt} onChange={e=>{setPrompt(e.target.value);save('imagePrompt',e.target.value)}} placeholder="主体、场景、风格、光线…"/></label>
      <div className="field-count">{prompt.length} / 4000</div>
      <label htmlFor="image-model">图像模型<select id="image-model" value={model} onChange={e=>setModel(e.target.value)}><option value="moss-image-sft-1.0">MOSS Image SFT · 免费</option><option value="moss-image-base-1.0">MOSS Image Base · 免费</option></select></label>
      <label htmlFor="image-size">画面比例<select id="image-size" value={size} onChange={e=>setSize(e.target.value)}><option value="1024x1024">1:1 · 1024 × 1024</option><option value="1024x1536">2:3 · 1024 × 1536</option><option value="1536x1024">3:2 · 1536 × 1024</option><option value="512x512">1:1 · 512 × 512</option></select></label>
      <button className="button primary wide" aria-label="生成图像" disabled={!prompt.trim()||running+queued>=100}><Plus size={19}/>生成图像</button>
      <p className="field-hint">可连续点击，每次提交一张，最多 10 个同时生成；超过后排队。可以继续通话、选图或使用其他功能。</p>
      <div className="image-queue-summary"><span>生成中 <strong>{running} / 10</strong></span><span>等待 <strong>{queued}</strong></span><span>无可见 AI 水印</span>{imageQueueInfo().effectiveLimit<10&&<span>官网限流，暂按 {imageQueueInfo().effectiveLimit} 路自动排队</span>}</div>
      <div className="example-list"><strong>从一点灵感开始</strong>{[['文字海报','极简咖啡海报，奶油色背景，深绿色文字“慢一点，也很好”，自然光，精致排版。'],['江南水彩','雨后苏州小巷，青石板路映着暖色灯光，水彩插画，安静而有生活气息。'],['想象建筑','悬浮在云层中的玻璃温室，绿植茂盛，清晨阳光，电影感构图。']].map(([title,text])=><button type="button" key={title} onClick={()=>{setPrompt(text);save('imagePrompt',text)}}>{title}<Sparkles size={13}/></button>)}</div>
    </form>
    <section className="image-job-list" aria-label="图片任务队列" aria-live="polite">
      {!jobs.length?<div className="image-result empty-large image-empty"><ImageIcon size={42}/><h2>下一张作品，从这里开始。</h2><p>任务独立进行，生成过程中可以继续使用其他功能。</p></div>:jobs.map(job=><article className={'image-job '+job.status} key={job.id}>
        <header><span>{({queued:'等待生成',running:'正在生成',succeeded:'生成完成',failed:'生成失败',cancelled:'已取消'})[job.status]||job.status}</span><small>{job.size} · {new Date(job.createdAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</small>{['queued','running'].includes(job.status)?<button aria-label="取消此任务" onClick={()=>cancelImage(job.id)}><X size={17}/></button>:<button aria-label="移除此任务" onClick={()=>removeImage(job.id)}><Trash2 size={16}/></button>}</header>
        <p className="image-job-prompt">{job.prompt}</p>
        {job.status==='running'&&<div className="image-job-progress"><LoaderCircle size={20} className="spin"/><span>正在由官网生成 · {Math.max(0,Math.floor((now-(job.startedAt||job.createdAt))/1000))}s</span></div>}
        {job.status==='queued'&&<p className="field-hint">已有任务运行，空出通道后自动开始。</p>}
        {job.status==='succeeded'&&<><img loading="lazy" src={job.data?.data?.[0]?.url} alt={job.prompt}/><div className="image-job-actions"><button className="button primary" disabled={saving.has(job.id)} onClick={()=>album(job)}>{saving.has(job.id)?<LoaderCircle size={17} className="spin"/>:<Download size={17}/>} {saving.has(job.id)?'正在保存':nativeTools()?'保存到相册':'下载图片'}</button><button className="button subtle" onClick={()=>enqueue(null,{prompt:job.prompt,model:job.model,size:job.size})}><RefreshCw size={15}/>再生成一张</button></div></>}
        {job.error&&<p className="image-job-error">{job.error}</p>}
        {job.status==='failed'&&<button className="button subtle" onClick={()=>enqueue(null,{prompt:job.prompt,model:job.model,size:job.size})}><RefreshCw size={15}/>重新提交</button>}
      </article>)}
    </section>
  </div>;
}
