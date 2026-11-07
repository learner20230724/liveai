import React, {useEffect, useRef, useState} from 'react';
import {ArrowRight, RefreshCw} from 'lucide-react';
import {api} from './workspace.js';
import {nativeShell} from './native.js';
import {nativeTools} from './native-tools.js';
import {ImageStudio, VisionStudio, Models} from './WorkspaceTools.jsx';

// Kept mounted across tabs so uploads, image results and in-flight work survive.
export default function MobileWorkspace({section, onError, onNotice}) {
  const [auth,setAuth]=useState(null),[busy,setBusy]=useState(false),[password,setPassword]=useState(''),[remember,setRemember]=useState(true),[catalog,setCatalog]=useState(null),[stats,setStats]=useState(null),[failure,setFailure]=useState('');
  const alive=useRef(false),attempted=useRef(false);
  async function load() {
    const [models,usage]=await Promise.all([api('/models'),api('/stats')]);
    if(alive.current){setCatalog(models);setStats(usage);setFailure('');}
  }
  function problem(message,error){
    if(!alive.current)return;
    if(error?.status===401){setAuth(false);setFailure('工具登录已过期，请重新解锁。已输入的内容保留。');check(true);}
    else onError(message);
  }
  async function check(auto=false){
    try{
      const session=await api('/session');if(!alive.current)return;
      setAuth(session.authenticated);
      if(session.authenticated){setBusy(false);await load();attempted.current=false;return;}
      let prefs={};try{prefs=JSON.parse(nativeShell()?.preferences?.()||'{}')}catch{}
      if(auto&&prefs.remembered&&!attempted.current){attempted.current=true;setBusy(true);nativeShell()?.refreshDirect?.();}
      else setBusy(false);
    }catch(error){if(alive.current){setAuth(false);setBusy(false);setFailure(error.message);}}
  }
  useEffect(()=>{
    alive.current=true;
    function event(e){
      if(e.detail?.type==='configured'&&e.detail.value==='ready'){setPassword('');check();}
      if(e.detail?.type==='configured'&&e.detail.value==='login'){setAuth(false);setBusy(false);}
      if(e.detail?.type==='error'&&attempted.current){setBusy(false);setFailure(e.detail.value);}
    }
    window.addEventListener('liveai:native',event);check(true);
    return()=>{alive.current=false;window.removeEventListener('liveai:native',event)};
  },[]);
  const details={images:['图像工作室','选择模型与比例，把想法变成画面。'],vision:['视觉理解','上传图片，提取文字、识别物品或描述场景。'],models:['模型与费用','默认免费；付费模型需单独输入密码解锁。']}[section];
  function unlock(e){e.preventDefault();setFailure('');setBusy(true);attempted.current=true;nativeShell()?.configureDirect?.(password,remember);}
  return <div className="mobile-workspace">
    {details&&<header className="mobile-page-heading"><h1>{details[0]}</h1><p>{details[1]}</p></header>}
    {!nativeTools()&&<p className="native-upgrade-note">完整直连、10 路并发与相册保存需要 APP 3.0。<a href="/liveai/downloads/liveai-latest.apk">下载新版 APP</a></p>}
    {auth!==true&&<section className="mobile-tool-login">
      <h2>{auth===null?'正在读取工具配置':'解锁工具工作台'}</h2>
      <p>{nativeTools()?'全部 AI 工具由手机直接连接 MOSS 官网。':'APP 3.0 支持全部 AI 工具直连 MOSS。'}</p>
      {failure&&<p role="alert" className="mobile-tool-error">{failure}</p>}
      {auth===null||busy?<p className="mobile-tool-loading"><RefreshCw size={17} className="spin"/>正在连接工具服务…</p>:<form onSubmit={unlock}>
        <label htmlFor="tool-password">访问密码<input id="tool-password" type="password" autoComplete="current-password" maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} required/></label>
        <label className="remember"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>在本机加密记住密码</label>
        <button className="simple-primary" disabled={!password}><ArrowRight size={18}/>解锁工具</button>
        <button className="simple-secondary" type="button" onClick={()=>check(true)}>重新检查连接</button>
      </form>}
    </section>}
    <div hidden={auth!==true}>
      <section hidden={section!=='images'} aria-label="图像工作室"><ImageStudio onError={problem} onNotice={onNotice}/></section>
      <section hidden={section!=='vision'} aria-label="视觉理解"><VisionStudio onError={problem} active={section==='vision'&&auth===true}/></section>
      <section hidden={section!=='models'} aria-label="模型与费用"><Models catalog={catalog} stats={stats} onRefresh={()=>load().then(()=>onNotice('信息已刷新')).catch(e=>problem(e.message,e))}/></section>
    </div>
  </div>;
}
