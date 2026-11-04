import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LiveSession} from '../src/live.js';
import {encodeLiveFrame,AUDIO_QUEUE_LIMIT,VIDEO_FRAME_LIMIT} from '../src/live-upload.js';
globalThis.WebSocket={OPEN:1};
function transport(){
  const errors=[],packets=[],network=[];
  const session=new LiveSession({onState(){},onEvent(){},onError:v=>errors.push(v),onMedia(){},onNetwork:v=>network.push(v)});
  session.ready=true;session.ws={readyState:1,bufferedAmount:0,send(packet){packets.push(packet);if(packet instanceof Uint8Array)this.bufferedAmount+=packet.length;},close(){this.readyState=3}};
  return {session,errors,packets,network};
}
test('a large screenshot cannot enqueue a burst that trips the next microphone chunk',()=>{
  const {session,errors,packets}=transport();session.media.set('screen',{});
  assert.equal(session.sendVideo('screen',new Uint8Array(200000)),false);assert.equal(session.ws.bufferedAmount,0);
  assert.equal(session.sendVideo('screen',new Uint8Array(VIDEO_FRAME_LIMIT)),true);
  assert.equal(session.sendMicrophone(new ArrayBuffer(640)),true);assert.ok(session.ws.bufferedAmount<=AUDIO_QUEUE_LIMIT);assert.equal(session.stopped,false);assert.deepEqual(errors,[]);assert.equal(packets[0][0],2);assert.equal(packets[1][0],0);
});
test('transient microphone congestion recovers; only continuous ten-second stalls stop with routing context',()=>{
  const {session,errors,network}=transport();session.ws.bufferedAmount=128001;
  assert.equal(session.sendMicrophone(new ArrayBuffer(640),0),false);assert.equal(session.sendMicrophone(new ArrayBuffer(640),9999),false);assert.equal(session.stopped,false);
  session.ws.bufferedAmount=0;assert.equal(session.sendMicrophone(new ArrayBuffer(640),10000),true);assert.deepEqual(network,[true,false]);
  session.ws.bufferedAmount=128001;session.sendMicrophone(new ArrayBuffer(640),20000);session.sendMicrophone(new ArrayBuffer(640),30000);assert.equal(session.stopped,true);assert.equal(errors.length,1);assert.match(errors[0],/到官网的上传持续拥塞/);
});
test('camera and screen are separately tagged and alternate instead of starving one source',()=>{
  const {session,packets}=transport();session.media.set('camera',{});session.media.set('screen',{});
  assert.equal(session.sendVideo('camera',new Uint8Array(10000),0),true);session.ws.bufferedAmount=0;
  assert.equal(session.sendVideo('camera',new Uint8Array(10000),1000),false);assert.equal(session.sendVideo('screen',new Uint8Array(10000),1000),true);session.ws.bufferedAmount=0;
  assert.equal(session.sendVideo('screen',new Uint8Array(10000),2000),false);assert.equal(session.sendVideo('camera',new Uint8Array(10000),2000),true);assert.deepEqual(packets.map(p=>p[0]),[1,2,1]);
  session.media.delete('camera');assert.equal(session.sendVideo('camera',new Uint8Array(1),3000),false);
});
test('JPEG capture reduces quality and dimensions until within the payload budget',async()=>{
  const attempts=[];const canvas={width:0,height:0,getContext:()=>({drawImage(){}}),toBlob(callback,type,quality){attempts.push({width:this.width,height:this.height,quality});const size=this.width>720?90000:quality>.3?40000:20000;callback(new Blob([new Uint8Array(size)],{type}));}};
  const bytes=await encodeLiveFrame({videoWidth:1920,videoHeight:1080},canvas,'screen');assert.equal(bytes.length,20000);assert.ok(attempts.every(a=>a.width<=960));assert.ok(attempts.some(a=>a.width===720));assert.ok(bytes.length<=VIDEO_FRAME_LIMIT);
});
