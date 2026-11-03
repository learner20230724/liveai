// Browser-only regression: no real credentials, media hardware or provider calls.
// npm run build, then PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/check-mobile-workspace.mjs
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {models,verifiedAt} from '../server/catalog.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const origin='https://liveai.test',errors=[],requests=[];
let finishImage,authenticated=true,refreshes=0;
const context=await browser.newContext({viewport:{width:390,height:844}});
await context.exposeFunction('restoreToolSession',()=>{authenticated=true;refreshes++;});
await context.addInitScript(()=>{
  const read=()=>JSON.parse(localStorage.getItem('qa.call')||'{"phase":"idle","lines":[]}');
  const update=data=>localStorage.setItem('qa.call',JSON.stringify({...read(),...data}));
  const ready=()=>window.dispatchEvent(new CustomEvent('liveai:native',{detail:{type:'configured',value:'ready'}}));
  window.LiveAIAndroid={ready(){},directVersion:()=>1,shellVersion:()=>3,
    preferences:()=>JSON.stringify({configured:true,remembered:true,shellVersion:'2.0.0',route:'auto'}),
    callState:()=>JSON.stringify(read()),history:()=>JSON.stringify([{id:'fixture',at:'2026-11-03T12:00:00Z',title:'测试对话',lines:[{role:'user',text:'测试记录'}]}]),
    prepareDirect:()=>setTimeout(ready,10),refreshDirect:()=>window.restoreToolSession().then(ready),
    startCall:prompt=>{window.__prompt=prompt;update({phase:'listening',startedAt:Date.now(),background:true,input:'测试耳机麦克风',lines:[]});},
    endCall:()=>{window.__ended=(window.__ended||0)+1;update({phase:'idle',background:false});},
    muteCall:muted=>update({muted}),audioRoute(){},saveText:()=>{window.__exported=true;},appSettings(){},allowBackground(){},toggleCamera(){},
  };
});
await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin)return route.abort();
  if(url.pathname.startsWith('/liveai/api/')){
    const name=url.pathname.slice('/liveai/api'.length);requests.push({name,method:request.method()});
    if(name==='/session')return route.fulfill({json:{authenticated}});
    if(!authenticated)return route.fulfill({status:401,json:{error:'请重新登录',code:'AUTH_REQUIRED'}});
    if(name==='/models')return route.fulfill({json:{models,verifiedAt,paidEnabled:false}});
    if(name==='/stats')return route.fulfill({json:{since:'2026-11-03',liveSessions:2,liveSeconds:90,images:1,success:3,failed:0}});
    if(name==='/images'){
      const body=request.postDataJSON();assert.equal(body.model,'moss-image-sft-1.0');
      await new Promise(r=>{finishImage=r});
      return route.fulfill({json:{data:[{url:origin+'/liveai/fixture.svg'}],usage:{output_width:512,output_height:512}}});
    }
    return route.fulfill({status:503,json:{error:'上游视觉模型暂不可用'}});
  }
  if(url.pathname==='/liveai/fixture.svg')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#dce8d4"/><text x="90" y="260" font-size="32">LiveAI QA</text></svg>'});
  let relative=url.pathname.replace(/^\/liveai\//,'')||'index.html';
  if(relative.includes('..'))return route.abort();
  try{const body=await readFile(resolve('dist',relative));return route.fulfill({body,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(relative)]||'application/octet-stream'});}catch{return route.abort();}
});
try{
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(origin+'/liveai/');await page.getByRole('button',{name:'开始对话',exact:true}).waitFor();
  const nav=page.getByRole('navigation',{name:'工作台导航'});assert.equal(await nav.getByRole('button').count(),5);
  console.log('Checking conversation presets');await page.getByRole('button',{name:'通话设置'}).click();await page.getByLabel('对话模式',{exact:true}).selectOption('english');assert.match(await page.getByLabel('回复偏好',{exact:true}).inputValue(),/English conversation coach/);await page.getByRole('button',{name:'关闭面板'}).click();
  await page.getByRole('button',{name:'开始对话',exact:true}).click();await page.getByText('后台与锁屏通话已开启',{exact:true}).waitFor();assert.match(await page.evaluate(()=>window.__prompt),/English conversation coach/);
  console.log('Checking image jobs and tab retention');await nav.getByRole('button',{name:'图像',exact:true}).click();await page.getByLabel('画面描述').fill('测试图像描述');await page.getByLabel('画面比例').selectOption('512x512');await page.getByRole('button',{name:'生成图像',exact:true}).click();await page.getByText('正在把想象变成画面',{exact:true}).waitFor();
  await nav.getByRole('button',{name:'模型',exact:true}).click();await page.getByRole('heading',{name:'模型与费用',exact:true}).waitFor();await page.getByRole('button',{name:/付费能力/}).click();await page.getByText('付费已锁定',{exact:true}).first().waitFor();finishImage();
  await nav.getByRole('button',{name:'视觉',exact:true}).click();await page.getByLabel('选择一张图片').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});await page.getByLabel('想了解什么？').fill('测试视觉问题');
  await nav.getByRole('button',{name:'对话',exact:true}).click();await page.getByText('后台与锁屏通话已开启',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__ended||0),0);
  await nav.getByRole('button',{name:'图像',exact:true}).click();await page.getByRole('link',{name:'打开原图保存'}).waitFor();assert.equal(await page.getByLabel('画面描述').inputValue(),'测试图像描述');
  await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/mobile-workspace-images.png',fullPage:true});
  await nav.getByRole('button',{name:'视觉',exact:true}).click();assert.equal(await page.getByLabel('想了解什么？').inputValue(),'测试视觉问题');await page.getByAltText('待分析图片').waitFor();
  await nav.getByRole('button',{name:'记录',exact:true}).click();await page.getByRole('button',{name:/测试对话/}).click();await page.getByRole('button',{name:'导出文字'}).click();assert.equal(await page.evaluate(()=>window.__exported),true);await page.getByRole('button',{name:'关闭面板'}).click();
  // Expired web-tool session can be restored from the native remembered login.
  console.log('Checking remembered tool login');authenticated=false;await page.reload();await page.getByRole('button',{name:'结束通话',exact:true}).waitFor();await nav.getByRole('button',{name:'模型',exact:true}).click();await page.getByRole('button',{name:/限时免费/}).waitFor();assert.equal(refreshes,1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.evaluate(()=>window.__ended||0),0);assert.ok(!requests.some(r=>r.name==='/live'));
  await page.screenshot({path:'artifacts/mobile-workspace-models.png',fullPage:true});await nav.getByRole('button',{name:'对话',exact:true}).click();await page.screenshot({path:'artifacts/mobile-workspace-call.png'});await page.getByRole('button',{name:'结束通话',exact:true}).click();await page.getByRole('button',{name:'开始对话',exact:true}).waitFor();
  const desktop=await browser.newContext({viewport:{width:1440,height:1000}});await desktop.route('**/*',async route=>{const u=new URL(route.request().url());if(u.pathname.startsWith('/liveai/api/'))return route.fulfill({json:u.pathname.endsWith('/session')?{authenticated:true}:u.pathname.endsWith('/models')?{models,verifiedAt,paidEnabled:false}:{}});const relative=u.pathname.replace(/^\/liveai\//,'')||'index.html';return route.fulfill({body:await readFile(resolve('dist',relative)),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(relative)]||'application/octet-stream'});});
  const web=await desktop.newPage();web.on('pageerror',e=>errors.push(String(e)));await web.goto(origin+'/liveai/');await web.getByRole('button',{name:'图像工作室',exact:true}).click();await web.getByRole('button',{name:'生成图像',exact:true}).waitFor();await web.getByRole('button',{name:'模型与费用',exact:true}).click();await web.getByRole('button',{name:/付费能力/}).waitFor();
  assert.deepEqual(errors,[]);const result={nativeBridgeSimulated:true,providerCallsMocked:true,physicalDevice:false,allFiveTabs:true,imageJobAndResultRetainedAcrossTabs:true,visionUploadAndDraftRetained:true,paidModelsRemainLocked:true,rememberedToolSessionRecovery:true,nativeCallRetainedAcrossTabsAndReload:true,noRelayCallStarted:true,historyExport:true,conversationPresets:true,desktopTools:true,horizontalOverflow:false,errors};await writeFile('artifacts/mobile-workspace-verification.json',JSON.stringify(result,null,2)+'\n');console.log(result);
}finally{await browser.close();}
