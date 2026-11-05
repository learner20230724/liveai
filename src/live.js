import {normalizeSettings} from './call-settings.js';
import { nativeShell } from "./native.js";
import {AUDIO_QUEUE_LIMIT,VIDEO_QUEUE_LIMIT,VIDEO_FRAME_LIMIT,CONGESTION_TIMEOUT,encodeLiveFrame} from './live-upload.js';
import {requireBrowserDirect} from './browser-direct.js';
import {sessionConfiguration} from './conversation.js';
export class LiveSession {
  constructor({ onState, onEvent, onError, onMedia, onLevel, onNetwork }) {
    Object.assign(this, { onState, onEvent, onError, onMedia, onLevel, onNetwork });
    this.settings=normalizeSettings();this.handledTools=new Set();
    this.contexts = [];
    this.sources = new Set();
    this.turns = new Map();
    this.media = new Map();
    this.frames = new Map();
    this.nextTime = 0;
    this.stopped = false;
    this.muted = false;
    this.ready = false;
    this.stopping = false;
    this.congestedSince=null;
    this.networkBusy=false;
    this.droppedAudio=0;
    this.droppedVideo=0;
    this.lastVideoSource=null;this.lastVideoAt=0;
  }
  network(busy){if(this.networkBusy===busy)return;this.networkBusy=busy;this.onNetwork?.(busy);}
  sendMicrophone(pcm,now=performance.now()){
    if(!this.ready||this.stopped||this.ws?.readyState!==WebSocket.OPEN)return false;
    if(this.ws.bufferedAmount+pcm.byteLength+1>AUDIO_QUEUE_LIMIT){
      this.droppedAudio++;this.network(true);if(this.congestedSince===null)this.congestedSince=now;
      if(now-this.congestedSince>=CONGESTION_TIMEOUT)this.error('到官网的上传持续拥塞，请检查网络后重试。');
      return false;
    }
    this.congestedSince=null;if(this.ws.bufferedAmount<VIDEO_QUEUE_LIMIT)this.network(false);
    const packet=new Uint8Array(pcm.byteLength+1);packet.set(new Uint8Array(pcm),1);this.ws.send(packet);return true;
  }
  sendVideo(source,bytes,now=performance.now()){
    if(this.stopped||!this.ready||!this.media.has(source)||this.ws?.readyState!==WebSocket.OPEN)return false;
    if(this.media.has("camera")&&this.media.has("screen")&&this.lastVideoSource===source&&now-this.lastVideoAt<1500/this.settings.fps){this.droppedVideo++;return false;}
    if(bytes.byteLength>VIDEO_FRAME_LIMIT||this.ws.bufferedAmount>VIDEO_QUEUE_LIMIT||this.ws.bufferedAmount+bytes.byteLength+1>AUDIO_QUEUE_LIMIT){this.droppedVideo++;return false;}
    const packet=new Uint8Array(bytes.byteLength+1);packet[0]=source==='camera'?1:2;packet.set(bytes,1);this.ws.send(packet);this.lastVideoSource=source;this.lastVideoAt=now;return true;
  }
  send(value) {
    if (this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify(value));
  }
  async start(prompt,options={}) {
    this.settings=normalizeSettings(options);
    this.onState("connecting");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("当前浏览器不支持麦克风，请使用 HTTPS 和新版浏览器。");
      const endpoint=await requireBrowserDirect(this.settings);
      this.audio = new AudioContext({ latencyHint: "interactive" });
      await this.audio.resume();
      await this.audio.audioWorklet.addModule("/liveai/pcm-capture.js");
      this.gain=this.audio.createGain();this.gain.gain.value=this.settings.volume;this.gain.connect(this.audio.destination);
      this.mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(this.settings.inputDevice?{deviceId:{exact:this.settings.inputDevice}}:{}),
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      if (this.stopped) {
        this.mic.getTracks().forEach((t) => t.stop());
        return;
      }
      this.capture = new AudioWorkletNode(this.audio, "pcm-capture");
      this.input = this.audio.createMediaStreamSource(this.mic);
      this.input.connect(this.capture);
      this.capture.connect(this.audio.destination);
      this.capture.port.onmessage = (e) => {
        if(!this.sendMicrophone(e.data))return;
        if (this.onLevel) {
          const s = new Int16Array(e.data);
          let sum = 0;
          for (const v of s) sum += v * v;
          this.onLevel(Math.min(1, Math.sqrt(sum / s.length) / 6000));
        }
      };
      this.ws = new WebSocket(endpoint);
      this.ws.onopen=()=>this.send({action:"attach_session",memory_scope:this.settings.memory});
      this.ws.binaryType = "arraybuffer";
      this.timer = setTimeout(() => {
        if (!this.ready) this.error("连接超时，请检查网络后重试。");
      }, 25000);
      this.ws.onmessage = (e) => {
        if (e.data instanceof ArrayBuffer) {
          this.play(e.data);
          return;
        }
        try {
          this.event(JSON.parse(e.data), prompt);
        } catch {
          this.error("实时服务返回了无法识别的数据。");
        }
      };
      this.ws.onerror = () =>
        this.error("实时连接失败，请检查登录状态和网络后重试。");
      this.ws.onclose = () => {
        if (!this.stopped) {
          if (!this.ready) this.onError("连接未建立，请重新解锁或稍后重试。");
          this.stop();
        }
      };
    } catch (e) {
      this.error(
        e.name === "NotAllowedError"
          ? nativeShell() ? "麦克风权限未获允许，请到系统设置的 LiveAI 权限中允许麦克风后重试。" : "麦克风权限未获允许。请在浏览器地址栏授权后重试。"
          : e.name === "NotFoundError"
            ? "没有检测到麦克风，请连接设备后重试。"
            : e.message,
      );
    }
  }
  event(m, prompt) {
    const a = m.action,
      d = m.data || {};
    if (a === "proxy.connected")
      this.send({ action: "attach_session", memory_scope: "session" });
    if (a === "session_attached")
      this.send({
        action: "session.update",
        session: sessionConfiguration(prompt,this.settings),
      });
    if (a === "session.updated") {
      if (d.error) {
        this.error(d.error);
        return;
      }
      this.ready = true;
      clearTimeout(this.timer);
      this.send({ action: "media.mode", binary_protocol: "tagged-v1" });
      this.send({ action: "mic_state", enabled: true });
      this.onState("listening");
    }
    if (a === "response.audio.context") this.contexts.push(d);
    if (a === "response.audio.done") {
      const turn = this.turn(d);
      turn.done = true;
      this.finishTurn(d);
    }
    if (a === "response.audio.stop") this.stopPlayback(d);
    if (a === "response.interrupted") {
      this.onState("listening");
    }
    if (a === "output.transcript.updated") this.onState("speaking");
    if (a === "response.ended") {
      this.onState("listening");
      if (d.status === "failed")
        this.onError("本轮回答失败，可以继续说话重试。");
    }
    if (a === "error") {
      this.error(d.error?.message || "实时服务发生错误。");
      return;
    }
    if (a === "proxy.closed") {
      this.stop();
      return;
    }
    this.onEvent(m);
    if(a==='response.function_call_arguments.done')this.handleTool(d);
  }
  turn(d) {
    const key = `${d.run_id}:${d.turn_id}`;
    if (!this.turns.has(key))
      this.turns.set(key, { pending: 0, done: false, acked: false });
    return this.turns.get(key);
  }
  finishTurn(d) {
    const t = this.turn(d);
    if (t.done && t.pending === 0 && !t.acked && !t.cancelled) {
      t.acked = true;
      this.send({
        action: "playback.completed",
        run_id: d.run_id,
        turn_id: d.turn_id,
      });
    }
  }
  handleTool(data){
    const id=data.call_id;if(this.stopped||this.handledTools.size>=512||typeof id!=='string'||id.length>200||this.handledTools.has(id))return;this.handledTools.add(id);
    let result;this.onEvent({action:'tool.execution.started',origin:'client',data:{name:data.name}});
    if(this.settings.clockTools&&data.name==='liveai_current_time'){
      try{if(typeof data.arguments==='string'&&data.arguments.length>4096)throw new Error();const args=JSON.parse(data.arguments||'{}');if(!args||Array.isArray(args)||Object.keys(args).length)throw new Error();result={success:true,time:new Date().toISOString(),localTime:new Date().toLocaleString(),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone};}catch{result={success:false,error:'工具参数无效'}}
    }else result={success:false,error:'未启用该本机工具'};
    this.send({action:'conversation.item.create',item:{type:'function_call_output',call_id:id,output:JSON.stringify(result)}});
    this.onEvent({action:'tool.execution.completed',origin:'client',data:{name:data.name,result}});
  }
  scheduleAudio(item,start){
    const source=this.audio.createBufferSource();source.buffer=item.buffer;source.playbackRate.value=this.settings.rate;source.connect(this.gain||this.audio.destination);
    item.source=source;item.start=start;item.rate=this.settings.rate;item.end=start+(item.duration-item.offset)/item.rate;
    source.onended=()=>{source.disconnect();item.ended=true;this.completeAudio(item);};
    source.start(start,item.offset,item.duration-item.offset);
  }
  completeAudio(item){
    if(item.completed)return;
    const remaining=item.end-this.audio.currentTime;
    if(!item.cancelled&&!this.stopped&&remaining>.003){item.ackTimer=setTimeout(()=>this.completeAudio(item),Math.min(100,remaining*1000));item.ackTimer?.unref?.();return;}
    clearTimeout(item.ackTimer);item.completed=true;this.sources.delete(item);const turn=this.turn(item.ctx);turn.pending=Math.max(0,turn.pending-1);
    if(!item.cancelled&&!this.stopped){this.send({action:'playback.chunk.completed',...item.ctx});this.finishTurn(item.ctx);}
  }
  setPlayback(rate,volume){
    const next=normalizeSettings({...this.settings,rate,volume});const changed=next.rate!==this.settings.rate;this.settings=next;
    if(this.gain)this.gain.gain.setValueAtTime(next.volume,this.audio.currentTime);
    if(!changed||!this.audio)return;
    const now=this.audio.currentTime;let cursor=now+.015;
    for(const item of [...this.sources].filter(i=>!i.cancelled&&!i.completed&&!i.ended).sort((a,b)=>a.start-b.start)){
      const offset=item.offset+Math.max(0,Math.min(item.duration-item.offset,(now-item.start)*item.rate));
      if(offset>=item.duration-1e-7)continue;
      item.source.onended=null;try{item.source.stop();}catch{}item.source.disconnect();item.offset=offset;this.scheduleAudio(item,cursor);cursor=item.end;
    }
    this.nextTime=cursor;
  }
  play(bytes) {
    const ctx=this.contexts.shift();if(!ctx||!this.audio||this.stopped)return;
    if(bytes.byteLength%2){this.error('音频数据格式无效。');return;}
    const pcm=new DataView(bytes),buffer=this.audio.createBuffer(1,bytes.byteLength/2,48000),channel=buffer.getChannelData(0);
    for(let i=0;i<channel.length;i++)channel[i]=pcm.getInt16(i*2,true)/32768;
    const item={buffer,ctx,duration:buffer.duration,offset:0,cancelled:false,completed:false};this.sources.add(item);this.turn(ctx).pending++;
    this.scheduleAudio(item,Math.max(this.audio.currentTime+.015,this.nextTime));this.nextTime=item.end;this.onState('speaking');
  }
  stopPlayback(d) {
    let played = 0;
    for (const item of this.sources) {
      if (item.ctx.run_id === d.run_id && item.ctx.turn_id === d.turn_id) {
        item.cancelled = true;clearTimeout(item.ackTimer);
        played +=
          Math.max(
            0,
            Math.min(item.duration,item.offset+Math.max(0,this.audio.currentTime-item.start)*item.rate),
          ) * 1000;
        try {
          item.source.stop();
        } catch {}
      }
    }
    this.contexts = this.contexts.filter(
      (c) => c.run_id !== d.run_id || c.turn_id !== d.turn_id,
    );
    this.turn(d).cancelled = true;
    this.nextTime = Math.max(
      this.audio?.currentTime || 0,
      ...[...this.sources]
        .filter((i) => !i.cancelled)
        .map((i) => i.end),
    );
    this.send({
      action: "playback.stopped",
      run_id: d.run_id,
      turn_id: d.turn_id,
      played_audio_ms: Math.round(played),
    });
  }
  mute(value) {
    this.muted = value;
    this.capture?.port.postMessage({ muted: value });
    this.send({ action: "mic_state", enabled: !value });
  }
  async enableMedia(source) {
    if (!this.ready) throw new Error("请先开始实时对话。");
    if (source === "screen" && !navigator.mediaDevices.getDisplayMedia)
      throw new Error("当前浏览器不支持屏幕共享，可改用摄像头。");
    const stream =
      source === "camera"
        ? await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              facingMode: "environment",
            },
            audio: false,
          })
        : await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: this.settings.fps },
            audio: false,
          });
    if (this.stopped) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.media.set(source, stream);
    this.onMedia(source, stream);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    const canvas = document.createElement("canvas");
    this.send({ action: "video.state", source, enabled: true });
    this.send({ action: "video.stream_focus", source:this.settings.focus });
    let busy = false;
    const frame = async () => {
      if (
        busy ||
        this.stopped ||
        !this.media.has(source) ||
        !video.videoWidth || !video.videoHeight ||
        this.ws?.readyState !== 1
      )
        return;
      if(this.ws.bufferedAmount>VIDEO_QUEUE_LIMIT){this.droppedVideo++;return;}
      busy = true;
      try {
        const bytes=await encodeLiveFrame(video,canvas,source,this.settings);
        if(bytes)this.sendVideo(source,bytes);else this.droppedVideo++;
      } catch {
        // A failed snapshot must not terminate an otherwise healthy voice call.
        this.droppedVideo++;
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(frame, 1000/this.settings.fps);
    this.frames.set(source, { timer, video });
    frame();
    stream.getVideoTracks()[0].onended = () => this.disableMedia(source);
  }
  disableMedia(source) {
    const item = this.frames.get(source);
    if (item) {
      clearInterval(item.timer);
      item.video.pause();
      item.video.srcObject = null;
      this.frames.delete(source);
    }
    const stream = this.media.get(source);
    this.media.delete(source);
    stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    this.send({ action: "video.state", source, enabled: false });
    this.onMedia(source, null);
  }
  error(message) {
    if (this.stopped) return;
    this.onError(message);
    this.stop();
  }
  stop() {
    if (this.stopping || this.stopped) return;
    this.stopping = true;
    this.stopped = true;
    this.ready = false;
    clearTimeout(this.timer);
    for (const source of [...this.media.keys()]) this.disableMedia(source);
    this.mic?.getTracks().forEach((t) => t.stop());
    this.capture?.disconnect();
    this.input?.disconnect();
    if (this.capture) this.capture.port.onmessage = null;
    for (const item of this.sources) {
      item.cancelled = true;clearTimeout(item.ackTimer);
      try {
        item.source.stop();
      } catch {}
    }
    this.sources.clear();
    this.contexts = [];
    this.audio?.close().catch(() => {});
    if (this.ws && this.ws.readyState < 2) this.ws.close();
    this.onLevel?.(0);
    this.network(false);
    this.onState("idle");
    this.stopping = false;
  }
}
