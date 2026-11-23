import {expect,it,vi} from 'vitest';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {main} from './cli';
import {syntheticResearch} from '../test/replayFixture';
it('offline CLI writes separate exclusive derived outputs and report, preserving source bytes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'qc-replay-test-')),input=join(dir,'synthetic-no-human.json'),output=resolve('outputs',`qc-test-${crypto.randomUUID()}`);
 const source=JSON.stringify(syntheticResearch());const log=vi.spyOn(console,'log').mockImplementation(()=>{});
 try{
  await writeFile(input,source);await main(['--input',input,'--output',output]);
  const report=JSON.parse(await readFile(join(output,'report.json'),'utf8'));
  expect(report.inputFileSha256).toMatch(/^[a-f0-9]{64}$/);expect(report.reports[0].strategies).toHaveLength(3);
  const newSession=JSON.parse(await readFile(join(output,'session-1-separated-2.json'),'utf8'));expect(newSession.analysisRevision.parentSessionId).toBe('synthetic-full-frame-single');
  expect(await readFile(input,'utf8')).toBe(source);
  await expect(main(['--input',input,'--output',output])).rejects.toThrow('EEXIST');
  await expect(main(['--input',input,'--output',resolve('src','private-output')])).rejects.toThrow('outputs/');
 }finally{log.mockRestore();await rm(dir,{recursive:true,force:true});await rm(output,{recursive:true,force:true});}
});
