import {test} from 'node:test';import assert from 'node:assert/strict';
import {presets,conversationProfile,sessionConfiguration} from '../src/conversation.js';
import {LiveSession} from '../src/live.js';
test('all three role configurations use Chinese and transmit mode-specific instructions',()=>{
 for(const [id,p] of Object.entries(presets)){
  assert.match(p.prompt,/用户/);assert.ok(!/^[A-Za-z]/.test(p.prompt));
  const sent=[],session=new LiveSession({onEvent(){}});session.send=value=>sent.push(value);session.event({action:'session_attached'},p.prompt);
  assert.deepEqual(sent[0].session,sessionConfiguration(p.prompt));assert.equal(sent[0].session.instructions,p.prompt);
 }
 assert.match(presets.english.prompt,/英语练习/);assert.match(presets.english.prompt,/咖啡店/);assert.match(presets.vision.prompt,/没有画面/);assert.match(presets.daily.prompt,/不要主动开展英语练习/);
});
test('legacy English preset migrates without overwriting a custom preference',()=>{
 const old='You are LiveAI, a friendly English conversation coach. Speak clear natural English. Keep each reply short and ask one follow-up question. Gently correct important mistakes. If the user asks for Chinese explanations, explain in Chinese.';
 assert.equal(conversationProfile((k,f)=>k==='prompt'?old:f).prompt,presets.english.prompt);
 assert.deepEqual(conversationProfile((k,f)=>({prompt:'我的自定义要求',preset:'custom'})[k]??f),{preset:'custom',prompt:'我的自定义要求'});
 assert.equal(conversationProfile((k,f)=>k==='prompt'?presets.vision.prompt:f).preset,'vision');
});
