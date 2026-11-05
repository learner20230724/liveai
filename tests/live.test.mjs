import { test } from "node:test";
import assert from "node:assert/strict";
import { LiveSession } from "../src/live.js";
import { selectModel } from "../server/catalog.mjs";
globalThis.WebSocket = { OPEN: 1 };
function player() {
  const messages = [],
    nodes = [];
  const session = new LiveSession({
    onState() {},
    onEvent() {},
    onError() {},
    onMedia() {},
  });
  session.ws = {
    readyState: 1,
    send(v) {
      messages.push(JSON.parse(v));
    },
  };
  session.audio = {
    currentTime: 0,
    createBuffer(ch, n, sr) {
      return {
        duration: n / sr,
        getChannelData() {
          return new Float32Array(n);
        },
      };
    },
    createBufferSource() {
      const node = {
        playbackRate:{value:1},
        connect() {},
        disconnect() {},
        start(t,offset=0) {
          this.offset=offset;this.at = t;
        },
        stop() {
          this.onended?.();
        },
      };
      nodes.push(node);
      return node;
    },
  };
  return { session, messages, nodes };
}
test("never acknowledge chunks until playback really ends; turn ack waits for final chunk", () => {
  const { session, messages, nodes } = player();
  const ctx = { chunk_id: "c1", run_id: "r", turn_id: "t" };
  session.event({ action: "response.audio.context", data: ctx });
  session.play(new Int16Array(4800).buffer);
  session.event({ action: "response.audio.done", data: ctx });
  assert.equal(messages.length, 0);
  session.audio.currentTime=.115;nodes[0].onended();
  assert.deepEqual(
    messages.map((m) => m.action),
    ["playback.chunk.completed", "playback.completed"],
  );
  assert.equal(messages[0].chunk_id, "c1");
});
test("interruption cancels queued chunks and reports only elapsed playback of current chunk", () => {
  const { session, messages, nodes } = player();
  for (let i = 0; i < 2; i++) {
    session.contexts.push({ chunk_id: "c" + i, run_id: "r", turn_id: "t" });
    session.play(new Int16Array(48000).buffer);
  }
  session.audio.currentTime = 0.515;
  session.stopPlayback({ run_id: "r", turn_id: "t" });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].action, "playback.stopped");
  assert.equal(messages[0].played_audio_ms, 500);
  assert.equal(
    messages.filter((m) => m.action === "playback.chunk.completed").length,
    0,
  );
});
test("transcripts are full-text replacements, events forwarded without duplication", () => {
  const events = [];
  const session = new LiveSession({
    onState() {},
    onEvent: (m) => events.push(m),
  });
  for (const text of ["你", "你好"])
    session.event({ action: "input.transcript.updated", data: { text } });
  assert.equal(events[1].data.text, "你好");
});
test("paid and unknown model selection never falls back to another model", () => {
  assert.throws(
    () => selectModel("moss-tts-1.5-flash", undefined, false),
    (e) => e.code === "PAID_DISABLED",
  );
  assert.throws(
    () => selectModel("unknown", "image", false),
    (e) => e.code === "INVALID_MODEL",
  );
  assert.equal(selectModel("moss-image-sft-1.0", "image").tier, "free");
});

test('changing playback speed reschedules remaining samples without premature or duplicate acknowledgements',()=>{
 const {session,messages,nodes}=player();session.gain={gain:{setValueAtTime(value){this.value=value}}};
 for(let i=0;i<2;i++){session.contexts.push({chunk_id:'s'+i,run_id:'r',turn_id:'t'});session.play(new Int16Array(48000).buffer)}
 session.audio.currentTime=.515;session.setPlayback(2,.4);assert.equal(messages.length,0);assert.equal(nodes[0].onended,null);assert.equal(nodes[1].onended,null);assert.equal(nodes.length,4);assert.equal(nodes[2].offset,.5);assert.equal(nodes[2].playbackRate.value,2);assert.equal(session.gain.gain.value,.4);assert.ok(Math.abs(nodes[3].at-.78)<1e-8);
 session.audio.currentTime=.655;session.stopPlayback({run_id:'r',turn_id:'t'});assert.equal(messages.length,1);assert.equal(messages[0].played_audio_ms,750);assert.ok(messages.every(m=>m.action!=='playback.chunk.completed'));
});
test('rescheduled audio acknowledges each original chunk only when its replacement source ends',()=>{
 const {session,messages,nodes}=player();session.contexts.push({chunk_id:'s',run_id:'r',turn_id:'t'});session.play(new Int16Array(48000).buffer);session.event({action:'response.audio.done',data:{run_id:'r',turn_id:'t'}});session.audio.currentTime=.215;session.setPlayback(.5,1);assert.equal(messages.length,0);session.audio.currentTime=1.83;nodes[1].onended();assert.deepEqual(messages.map(m=>m.action),['playback.chunk.completed','playback.completed']);nodes[1].onended();assert.equal(messages.length,2);
});

test('an early browser ended callback cannot acknowledge before the scheduled media end',()=>{
 const {session,messages,nodes}=player();session.contexts.push({chunk_id:'early',run_id:'r',turn_id:'t'});session.play(new Int16Array(48000).buffer);session.audio.currentTime=.8;nodes[0].onended();assert.equal(messages.length,0);session.audio.currentTime=1.02;session.completeAudio([...session.sources][0]);assert.equal(messages[0].action,'playback.chunk.completed');
});
