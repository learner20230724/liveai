// Explicit, bounded real-provider check. Never run as part of CI.
import WebSocket from 'ws';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {sessionConfiguration} from '../src/conversation.js';
const key=(await readFile(process.env.MOSS_KEY_FILE||'/etc/liveai/moss.key','utf8')).trim();
const base='wss://api.mosi.cn/v1/realtime?model=moss-live-1.0';
function probe(label,query='',mode='handshake'){
 return new Promise(resolve=>{
  const result={label},ws=new WebSocket(base+query,{headers:{Authorization:'Bearer '+key}});let finished=false;
  const done=()=>{if(finished)return;finished=true;clearTimeout(timer);ws.close();resolve(result)};
  const timer=setTimeout(()=>{result.timeout=true;ws.terminate();done()},10000);
  ws.on('open',()=>{result.opened=true;if(mode==='handshake')return done();ws.send(JSON.stringify({action:'attach_session',memory_scope:mode==='memory'?'user':'session',...(mode==='attach-voice'?{voice:'moss-live-female-long-20261021-f753f18a'}:{})}))});
  ws.on('unexpected-response',(_,response)=>{result.httpStatus=response.statusCode;let body='';response.on('data',b=>{body+=b.toString().slice(0,500)});response.on('end',()=>{result.reason=body.trim().replace(key,'[redacted]');ws.terminate();done()});response.resume()});
  ws.on('error',()=>{if(!finished){result.transportError=true;done()}});
  ws.on('message',(raw,binary)=>{if(binary)return;const e=JSON.parse(raw),d=e.data||{};if(e.action==='session_attached'){result.delegation=d.delegation;result.memoryScope=d.memory_scope;const session=sessionConfiguration('你是中文助手。',{clockTools:mode==='tools'});if(mode==='session-voice')session.voice='moss-live-female-long-20261021-f753f18a';ws.send(JSON.stringify({action:'session.update',session}));}
   if(e.action==='session.updated'){result.configurationAccepted=!d.error;result.error=d.error||'';if(d.tools)result.tools=d.tools;done()}
   if(e.action==='error'){result.protocolRejected=true;result.reason=String(d.error?.message||d.error||'invalid or unsupported request').slice(0,300).replace(key,'[redacted]');done()}
  });
 });
}
const cases=[];
for(const args of [ ['default'],['stable-user','&user=liveai-options-check'],['user-memory','&user=liveai-options-check','memory'],['female-voice','&voice=moss-live-female-long-20261021-f753f18a'],['male-voice','&voice=moss-live-male-long-20261021-ff18acd1'],['voice-in-attach','','attach-voice'],['voice-in-session','','session-voice'],['client-tool-registration','','tools'] ]){const result=await probe(...args);cases.push(result);console.log(result)}
await mkdir('artifacts',{recursive:true});await writeFile('artifacts/live-options-provider.json',JSON.stringify({at:new Date().toISOString(),realMossProvider:true,physicalDevice:false,cases},null,2)+'\n');
assert.equal(cases[0].opened,true);assert.equal(cases[2].configurationAccepted,true);for(const c of cases.slice(3,5)){assert.equal(c.httpStatus,400);assert.equal(c.reason,'unsupported public query option')};assert.equal(cases[7].configurationAccepted,true);assert.ok(cases[7].tools.includes('liveai_current_time'));
