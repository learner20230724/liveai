import {ImageQueue} from './image-queue.js';
import {post,read,save} from './workspace.js';
import {nativeShell} from './native.js';
import {nativeTools,getTools,subscribeTools,submitNativeImage,cancelNativeImage,removeNativeImage,toolRequest} from './native-tools.js';
// Generated images are session-only; historical media are not restored.
try{localStorage.removeItem('liveai.imageJobs')}catch{}
const web=new ImageQueue({run:(input,signal)=>post('/images',input,{signal})});
export const subscribeImages=fn=>nativeTools()?subscribeTools(fn):web.subscribe(fn);
let empty=[];
export function imageSnapshot(){return nativeTools()?(getTools().images||empty):web.getSnapshot()}
export function submitImage(input){if(nativeTools())return submitNativeImage(input);if(nativeShell())throw new Error('完整直连与相册保存需要新版 APP 3.0，请覆盖安装');return web.submit(input)}
export function cancelImage(id){nativeTools()?cancelNativeImage(id):web.cancel(id)}
export function removeImage(id){nativeTools()?removeNativeImage(id):web.remove(id)}
export async function saveImage(job){if(nativeTools())return toolRequest('saveImage',{id:job.id});const url=job.data?.data?.[0]?.url;if(!url)throw new Error('图片地址为空');const response=await fetch(url);if(!response.ok)throw new Error('下载失败，请检查官方链接是否已过期');const blob=await response.blob(),object=URL.createObjectURL(blob);const a=document.createElement('a');a.href=object;a.download='LiveAI-'+job.id+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(object),30000);return {saved:true};}

export function imageQueueInfo(){return nativeTools()?{effectiveLimit:getTools().providerConcurrency||10}:{effectiveLimit:web.effectiveLimit};}
