import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
test('OTA publication is deterministic, integrity-addressed and isolated from private files',async()=>{
 const root=await mkdtemp(join(tmpdir(),'liveai-ota-'));const source=join(root,'web');await mkdir(join(source,'assets'),{recursive:true});await writeFile(join(source,'index.html'),'<html>LiveAI</html>');await writeFile(join(source,'assets/a.js'),'console.log("public fixture")');
 function publish(dest){return JSON.parse(execFileSync('python3',['-c',"import sys,json;sys.path.insert(0,sys.argv[1]);from publish_web_update import publish;print(json.dumps(publish(sys.argv[2],sys.argv[3],'test-version')))",resolve('scripts'),source,dest],{encoding:'utf8'}))}
 try {const first=publish(join(root,'one')),second=publish(join(root,'two'));assert.equal(first.sha256,second.sha256);assert.equal(first.channel,'liveai-stable');assert.equal(first.minShellVersion,1);const bytes=await readFile(join(root,'one',first.sha256+'.zip'));assert.equal(createHash('sha256').update(bytes).digest('hex'),first.sha256);await writeFile(join(source,'private.env'),'private test-only config');assert.throws(()=>publish(join(root,'bad')));}finally{await rm(root,{recursive:true,force:true})}
});
