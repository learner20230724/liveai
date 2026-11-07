import React,{useEffect,useRef,useState} from 'react';
import {Camera,RefreshCw,X} from 'lucide-react';
export default function CameraCapture({onCapture,onClose,onError}){
 const video=useRef(null),panel=useRef(null),alive=useRef(true),callbacks=useRef({onCapture,onClose,onError});callbacks.current={onCapture,onClose,onError};
 const [facing,setFacing]=useState('environment'),[ready,setReady]=useState(false),[busy,setBusy]=useState(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 useEffect(()=>{
  let disposed=false,stream;setReady(false);
  const close=()=>callbacks.current.onClose();
  const visibility=()=>{if(document.hidden)close()};
  const key=e=>{if(e.key==='Escape'){e.preventDefault();close()}if(e.key==='Tab'){const buttons=[...(panel.current?.querySelectorAll('button:not(:disabled)')||[])];const at=buttons.indexOf(document.activeElement);if(e.shiftKey&&at<=0){e.preventDefault();buttons.at(-1)?.focus()}else if(!e.shiftKey&&at===buttons.length-1){e.preventDefault();buttons[0]?.focus()}}};
  document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',close);document.addEventListener('keydown',key);panel.current.querySelector('button')?.focus();
  (async()=>{try{
   if(!navigator.mediaDevices?.getUserMedia)throw new Error('当前设备不支持拍照，请从相册选择');
   stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facing},width:{ideal:1920},height:{ideal:1080}}});
   if(disposed){stream.getTracks().forEach(t=>t.stop());return;}
   for(const track of stream.getVideoTracks())track.onended=()=>{if(!disposed)close()};
   video.current.srcObject=stream;await video.current.play();if(!disposed)setReady(true);
  }catch(e){if(disposed)return;const message=e.name==='NotAllowedError'?'未获相机权限，请允许后重试':e.name==='NotReadableError'?'相机被占用，请先关闭其他相机后重试':e.name==='NotFoundError'?'未检测到可用相机':e.message||'相机未能打开';callbacks.current.onError(message);close()}})();
  return()=>{disposed=true;document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',close);document.removeEventListener('keydown',key);if(stream)for(const t of stream.getTracks()){t.onended=null;t.stop()}if(video.current){video.current.pause();video.current.srcObject=null}};
 },[facing]);
 async function shoot(){if(!ready||busy)return;setBusy(true);try{const v=video.current;if(!v.videoWidth||!v.videoHeight)throw new Error('画面尚未就绪，请重试');const canvas=document.createElement('canvas');canvas.width=v.videoWidth;canvas.height=v.videoHeight;canvas.getContext('2d').drawImage(v,0,0);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));if(!alive.current)return;if(!blob)throw new Error('照片生成失败，请重拍');callbacks.current.onCapture(new File([blob],`LiveAI-photo-${Date.now()}.jpg`,{type:'image/jpeg'}));callbacks.current.onClose()}catch(e){if(alive.current){callbacks.current.onError(e.message);setBusy(false)}}}
 return <div className="camera-capture-shade"><section className="camera-capture" ref={panel} role="dialog" aria-modal="true" aria-label="拍照"><header><strong>拍照</strong><button type="button" aria-label="取消拍照" onClick={onClose}><X size={22}/></button></header><video ref={video} autoPlay playsInline muted aria-label="相机预览"/><div className="camera-capture-controls"><button type="button" disabled={busy} onClick={()=>setFacing(v=>v==='environment'?'user':'environment')}><RefreshCw size={18}/>切换镜头</button><button type="button" className="camera-shutter" disabled={!ready||busy} onClick={shoot}><Camera size={22}/>{busy?'正在拍照':'拍摄照片'}</button></div></section></div>;
}
