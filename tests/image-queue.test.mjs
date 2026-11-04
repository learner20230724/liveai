import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ImageQueue} from '../src/image-queue.js';
import {createPermitPool} from '../server/concurrency.mjs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('continuous submission starts ten jobs and releases slots without blocking other work',async()=>{
  const resolvers=[],seen=[];let n=0;
  const q=new ImageQueue({id:()=>String(++n),run:input=>{seen.push(input);return new Promise(resolve=>resolvers.push(resolve));}});
  for(let i=0;i<12;i++)q.submit({model:'moss-image-sft-1.0',prompt:'test '+i,size:'512x512'});
  await flush();assert.equal(seen.length,10);assert.equal(q.running,10);assert.equal(q.jobs.filter(j=>j.status==='queued').length,2);
  let unrelated=false;await Promise.resolve().then(()=>{unrelated=true});assert.equal(unrelated,true);
  resolvers.shift()({data:[]});await flush();assert.equal(seen.length,11);assert.equal(q.running,10);assert.equal(q.jobs.filter(j=>j.status==='succeeded').length,1);
  resolvers.shift()({data:[]});await flush();assert.equal(seen.length,12);assert.equal(q.running,10);
  while(resolvers.length)resolvers.shift()({data:[]});await flush();assert.equal(q.running,0);assert.equal(q.jobs.filter(j=>j.status==='succeeded').length,12);
});
test('failed, cancelled and queued jobs do not get automatically resubmitted',async()=>{
  let n=0,calls=0;
  const q=new ImageQueue({limit:1,id:()=>String(++n),run:(_,signal)=>{calls++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('cancelled'))));}});
  q.submit({prompt:'one'});const second=q.submit({prompt:'two'});q.cancel(second);await flush();q.cancel('1');await flush();assert.equal(calls,1);assert.equal(q.running,0);assert.ok(q.jobs.every(j=>j.status==='cancelled'));
  const failed=new ImageQueue({run:()=>{throw new Error('rate limited')}});failed.submit({prompt:'fail'});await flush();assert.equal(failed.jobs[0].status,'failed');assert.equal(failed.jobs[0].error,'rate limited');
});
test('web image concurrency permits are isolated from vision permits and release idempotently',()=>{
  const image=createPermitPool(10),vision=createPermitPool(4),releases=[];
  for(let i=0;i<10;i++)releases.push(image.acquire('owner'));
  assert.ok(releases.every(Boolean));assert.equal(image.acquire('owner'),null);assert.equal(typeof vision.acquire('owner'),'function');assert.equal(typeof image.acquire('another-owner'),'function');
  releases[0]();releases[0]();assert.equal(typeof image.acquire('owner'),'function');assert.equal(image.acquire('owner'),null);
});

test('explicit provider concurrency rejection is queued safely; other failures are not retried',async()=>{
  let n=0;const q=new ImageQueue({run:()=>{if(n++===0)throw Object.assign(new Error('limited'),{status:429,code:'concurrency_limit_exceeded'});return {data:[]}}});q.submit({prompt:'fixture'});await flush();assert.equal(q.jobs[0].status,'queued');assert.equal(q.effectiveLimit,9);assert.equal(n,1);clearTimeout(q.wakeup);q.wakeup=null;q.pausedUntil=0;q.pump();await flush();assert.equal(n,2);assert.equal(q.jobs[0].status,'succeeded');
});
