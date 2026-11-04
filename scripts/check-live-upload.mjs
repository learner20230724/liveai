// Uses real Chromium canvas/video capture with synthetic pixels and a local socket fixture.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const {chromium}=await import('playwright');
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
try{
  const page=await browser.newPage();
  await page.route('https://liveai.test/check/**',async route=>{
    const file=new URL(route.request().url()).pathname.slice('/check/'.length);
    if(!file)return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body>synthetic media check</body></html>'});
    if(!['live.js','live-upload.js','native.js'].includes(file))return route.abort();
    return route.fulfill({contentType:'text/javascript',body:await readFile(new URL('../src/'+file,import.meta.url))});
  });
  await page.goto('https://liveai.test/check/');
  const result=await page.evaluate(async()=>{
    const {LiveSession}=await import('/check/live.js');
    function noise(w,h){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');const image=ctx.createImageData(w,h);let n=17;for(let i=0;i<image.data.length;i+=4){n=(Math.imul(n,1664525)+1013904223)|0;image.data[i]=n&255;image.data[i+1]=(n>>>8)&255;image.data[i+2]=(n>>>16)&255;image.data[i+3]=255;}ctx.putImageData(image,0,0);return canvas;}
    const camera=noise(640,480),screen=noise(1920,1080),streams=[],packets=[],errors=[];let tick=0;const redraw=setInterval(()=>{for(const c of [camera,screen]){const ctx=c.getContext('2d');ctx.fillStyle=tick%2?'black':'white';ctx.fillRect(0,0,2,2)}tick++;},100);
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{const s=camera.captureStream(5);streams.push(s);return s}});
    Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{value:async()=>{const s=screen.captureStream(5);streams.push(s);return s}});
    const session=new LiveSession({onState(){},onEvent(){},onError:e=>errors.push(e),onMedia(){}});session.ready=true;
    session.ws={readyState:1,bufferedAmount:0,send(packet){if(packet instanceof Uint8Array){packets.push({tag:packet[0],bytes:packet.length});this.bufferedAmount+=packet.length;setTimeout(()=>{this.bufferedAmount=Math.max(0,this.bufferedAmount-packet.length)},40)}},close(){this.readyState=3}};
    const microphone=setInterval(()=>session.sendMicrophone(new ArrayBuffer(640)),20);
    try{await Promise.race([session.enableMedia('camera'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('synthetic camera timeout')),8000))]);await Promise.race([session.enableMedia('screen'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('synthetic screen timeout')),8000))]);await new Promise(resolve=>setTimeout(resolve,3300));const stayedConnected=!session.stopped;clearInterval(microphone);session.stop();return {syntheticMedia:true,realProvider:false,physicalDevice:false,stayedConnected,cameraPackets:packets.filter(p=>p.tag===1).length,screenPackets:packets.filter(p=>p.tag===2).length,audioPackets:packets.filter(p=>p.tag===0).length,maximumVideoPacket:Math.max(...packets.filter(p=>p.tag!==0).map(p=>p.bytes)),tracksReleased:streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')),errors};}finally{clearInterval(microphone);clearInterval(redraw);session.stop();}
  });
  assert.equal(result.stayedConnected,true);assert.ok(result.cameraPackets>0);assert.ok(result.screenPackets>0);assert.ok(result.audioPackets>20);assert.ok(result.maximumVideoPacket<=32769);assert.equal(result.tracksReleased,true);assert.deepEqual(result.errors,[]);
  await mkdir('artifacts',{recursive:true});await writeFile('artifacts/live-upload-verification.json',JSON.stringify(result,null,2)+'\n');console.log(result);
}finally{await browser.close()}
