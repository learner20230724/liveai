// Native bridge and provider are simulated here. Real provider checks are recorded separately.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {models,verifiedAt} from '../server/catalog.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const origin='https://liveai.test',errors=[],network=[],popups=[];
const context=await browser.newContext({viewport:{width:390,height:844}});
await context.addInitScript(()=>{
  const get=()=>JSON.parse(localStorage.getItem('qa.tools')||'{"images":[],"paidUnlocked":false,"providerConcurrency":10,"stats":{"since":"2026-11-04","images":0,"success":0,"failed":0,"nativeDirect":true}}');
  let state=get(),call={phase:'idle',lines:[]};const events=(type,rest)=>window.dispatchEvent(new CustomEvent('liveai:native',{detail:{type,...rest}}));
  function changed(){state={...state,images:[...state.images]};localStorage.setItem('qa.tools',JSON.stringify(state));events('tools',{state});}
  function pump(){let active=state.images.filter(j=>j.status==='running').length;for(const j of [...state.images].reverse()){if(active>=(state.providerConcurrency||10))break;if(j.status==='queued'){j.status='running';j.startedAt=Date.now();active++;}}changed();}
  const records={};window.__requests=[];window.__saves=[];window.__exported=false;
  window.LiveAIAndroid={ready(){},directVersion:()=>1,toolsVersion:()=>1,shellVersion:()=>4,
    preferences:()=>JSON.stringify({configured:true,remembered:true,route:'auto',shellVersion:'3.0.0'}),
    callState:()=>JSON.stringify(call),history:()=>JSON.stringify([{id:'fixture',at:'2026-11-04',title:'测试记录',lines:[{role:'user',text:'测试内容'}]}]),prepareDirect:()=>setTimeout(()=>events('configured',{value:'ready'}),10),
    startCall:prompt=>{call={phase:'listening',background:true,startedAt:Date.now(),input:'测试耳机麦克风',lines:[]};window.__prompt=prompt;},endCall:()=>{call={phase:'idle',lines:[]};window.__ends=(window.__ends||0)+1;},muteCall(){},audioRoute(){},appSettings(){},allowBackground(){},
    toolState:()=>JSON.stringify(state),toolResult:id=>records[id]?JSON.stringify(records[id]):'',
    submitImage:payload=>{const input=JSON.parse(payload),id=crypto.randomUUID();state.images.unshift({...input,id,status:'queued',createdAt:Date.now(),error:''});pump();return JSON.stringify({ok:true,id});},
    cancelImage:id=>{const j=state.images.find(j=>j.id===id);if(j)j.status='cancelled';pump();},removeImage:id=>{state.images=state.images.filter(j=>j.id!==id);changed();},
    requestTool:(id,operation,payload)=>{const data=JSON.parse(payload);window.__requests.push({operation,data});setTimeout(()=>{
      let value={},error='';
      if(operation==='unlockPaid'){if(data.password==='synthetic-approved'){state.paidUnlocked=true;changed();value={unlocked:true};}else error='访问密码不正确';}
      else if(operation==='lockPaid'){state.paidUnlocked=false;changed();value={unlocked:false};}
      else if(operation==='saveImage'){window.__saves.push(data.id);value={saved:true};}
      else if(operation==='vision'){value={output:[{content:[{type:'output_text',text:'测试图片包含一个绿色圆形。'}]}]};}
      else if(operation==='voices'){value={data:[{id:'fixture-voice',name:'测试声音'}]};}
      else if(!state.paidUnlocked)error='请先输入密码解锁付费模型';
      else if(operation==='transcribe')value={text:'测试转写结果'};
      else value={audio_url:'data:audio/mpeg;base64,SUQz',outputToken:'fixture.mp3'};
      records[id]={id,done:true,value,error};events('tool-result',{result:records[id]});
    },20);},saveOutput:()=>{window.__savedOutput=true;},saveText:()=>{window.__exported=true;}
  };
  window.__fixture={complete:()=>{const job=state.images.find(j=>j.status==='running');job.status='succeeded';job.data={data:[{url:'data:image/svg+xml;base64,'+btoa('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#fafbf8"/><circle cx="256" cy="256" r="155" fill="#d2e2bd"/></svg>')}]};state.stats.images++;pump();},throttle:()=>{state.providerConcurrency=3;let n=0;for(const j of [...state.images].reverse())if(j.status==='running'&&++n>3)j.status='queued';changed();},state:()=>state};
});
await context.route('**/*',async route=>{
  const url=new URL(route.request().url());network.push(url.pathname);
  if(url.origin!==origin||url.pathname.includes('/api/'))return route.abort();
  const relative=url.pathname.replace(/^\/liveai\//,'')||'index.html';
  try{return route.fulfill({body:await readFile(resolve('dist',relative)),contentType:({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(relative)]||'application/octet-stream'});}catch{return route.abort();}
});
try{
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(String(e)));page.on('popup',()=>popups.push(true));
  await page.goto(origin+'/liveai/');const nav=page.getByRole('navigation',{name:'工作台导航'});await nav.waitFor();assert.equal(await nav.getByRole('button').count(),5);
  await page.getByRole('button',{name:'开始对话',exact:true}).click();await page.getByText('后台与锁屏通话已开启',{exact:true}).waitFor();await nav.getByRole('button',{name:'图像',exact:true}).click();
  await page.getByLabel('画面描述').fill('连续生成测试');await page.getByLabel('画面比例').selectOption('512x512');for(let i=0;i<12;i++)await page.getByRole('button',{name:'生成图像',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.__fixture.state().images.filter(j=>j.status==='running').length),10);assert.equal(await page.evaluate(()=>window.__fixture.state().images.filter(j=>j.status==='queued').length),2);assert.equal(await page.getByRole('button',{name:'生成图像',exact:true}).isEnabled(),true);
  await nav.getByRole('button',{name:'视觉',exact:true}).click();await page.getByLabel('选择一张图片').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});await page.getByRole('button',{name:'重试上游视觉模型',exact:true}).click();await page.getByText('测试图片包含一个绿色圆形。',{exact:true}).waitFor();
  await nav.getByRole('button',{name:'模型',exact:true}).click();await page.getByRole('button',{name:/付费能力/}).click();await page.getByLabel('付费解锁密码').fill('wrong');await page.getByRole('button',{name:'解锁付费模型',exact:true}).click();await page.getByText('访问密码不正确',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__requests.filter(r=>['speech','voiceDesign','transcribe','speakers'].includes(r.operation)).length),0);await page.getByLabel('付费解锁密码').fill('synthetic-approved');await page.getByRole('button',{name:'解锁付费模型',exact:true}).click();await page.getByLabel('选择付费模型').waitFor();assert.equal(await page.getByLabel('选择付费模型').inputValue(),'');
  assert.equal(await page.evaluate(()=>window.__requests.filter(r=>['speech','voiceDesign','transcribe','speakers'].includes(r.operation)).length),0);await page.getByLabel('选择付费模型').selectOption('moss-voice-generator-1.0');await page.getByLabel('声音描述').fill('温暖的测试声音');await page.getByLabel('朗读文字').fill('你好，这是测试');await page.getByRole('button',{name:'提交付费任务',exact:true}).click();await page.getByRole('button',{name:'保存音频文件',exact:true}).waitFor();await page.getByRole('button',{name:'保存音频文件',exact:true}).click();assert.equal(await page.evaluate(()=>window.__savedOutput),true);
  await page.getByRole('button',{name:'重新锁定',exact:true}).click();await page.getByLabel('付费解锁密码').waitFor();await page.evaluate(()=>window.__fixture.complete());await nav.getByRole('button',{name:'图像',exact:true}).click();await page.getByRole('button',{name:'保存到相册',exact:true}).click();await page.getByText('已保存到相册 · Pictures/LiveAI',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__saves.length),1);assert.equal(popups.length,0);assert.equal(page.url(),origin+'/liveai/');
  assert.equal(await page.getByLabel('图像模型').inputValue(),'moss-image-sft-1.0');assert.equal(await page.evaluate(()=>window.__ends||0),0);assert.ok(!network.some(p=>p.includes('/api/')));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.evaluate(()=>window.__fixture.throttle());await page.getByText('官网限流，暂按 3 路自动排队',{exact:true}).waitFor();
  await page.getByRole('status').waitFor({state:'hidden',timeout:5000});await page.evaluate(()=>window.scrollTo(0,0));
  await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/parallel-images.png',fullPage:false});await nav.getByRole('button',{name:'模型',exact:true}).click();await page.screenshot({path:'artifacts/paid-unlock.png',fullPage:false});await nav.getByRole('button',{name:'记录',exact:true}).click();await page.getByRole('button',{name:/测试记录/}).click();await page.getByRole('button',{name:'导出文字',exact:true}).click();assert.equal(await page.evaluate(()=>window.__exported),true);
  const desktop=await browser.newContext({viewport:{width:1440,height:1000}});
  await desktop.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(u.pathname.includes('/api/'))return route.fulfill({json:u.pathname.endsWith('/session')?{authenticated:true}:u.pathname.endsWith('/models')?{models,verifiedAt,paidEnabled:false}:u.pathname.endsWith('/images')?{data:[{url:'data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="green"/></svg>').toString('base64')}]}:{since:'2026-11-04',images:1,liveSessions:1,liveSeconds:60,success:1,failed:0}});const relative=u.pathname.replace(/^\/liveai\//,'')||'index.html';try{return route.fulfill({body:await readFile(resolve('dist',relative)),contentType:({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(relative)]||'application/octet-stream'});}catch{return route.abort();}});
  const web=await desktop.newPage();web.on('pageerror',e=>errors.push(String(e)));await web.goto(origin+'/liveai/');await web.getByText('网页兼容 · 经本站中转',{exact:true}).waitFor();await web.getByLabel('当前连接方式',{exact:true}).waitFor();await web.screenshot({path:'artifacts/web-route.png'});await web.getByRole('button',{name:'图像工作室',exact:true}).click();await web.getByLabel('画面描述').fill('桌面兼容测试');await web.getByRole('button',{name:'生成图像',exact:true}).click();await web.getByRole('button',{name:'下载图片',exact:true}).waitFor();await web.getByRole('button',{name:'模型与费用',exact:true}).click();await web.getByRole('button',{name:/付费能力/}).click();await web.getByText('付费直连和相册保存需要 APP 3.0。',{exact:false}).waitFor();
  assert.deepEqual(errors,[]);const result={nativeBridgeSimulated:true,providerResponsesSimulated:true,physicalDevice:false,continuousClicks:true,tenRunningTwoQueued:true,providerQuotaDisplayed:true,otherToolsDuringGeneration:true,passwordRequiredForPaid:true,noAutomaticPaidRequest:true,explicitPaidAction:true,freeImageDefault:true,nativeAlbumSaveNoBrowserPopup:true,nativeAudioSave:true,nativeCallRetained:true,historyExport:true,desktopCompatibility:true,noHubApiRequests:true,horizontalOverflow:false,errors};await writeFile('artifacts/parallel-tools-verification.json',JSON.stringify(result,null,2)+'\n');console.log(result);
}finally{await browser.close()}
