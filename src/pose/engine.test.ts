import {expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({create:vi.fn(),files:vi.fn().mockResolvedValue({}),detect:vi.fn(),close:vi.fn()}));
vi.mock('@mediapipe/tasks-vision',()=>({FilesetResolver:{forVisionTasks:mock.files},PoseLandmarker:{createFromOptions:mock.create}}));
import {createPoseEngine} from './mediapipe';
it('requests independent VIDEO engines and preserves every candidate without stitching',async()=>{
 mock.create.mockResolvedValue({detectForVideo:mock.detect,close:mock.close});
 mock.detect.mockReturnValue({landmarks:[[{x:.2,y:.3,z:.1,visibility:.9}],[{x:.8,y:.7,z:-.1,visibility:.8}]]});
 const primary=await createPoseEngine(new Uint8Array([1]));const search=await createPoseEngine(new Uint8Array([1]),2);
 expect(mock.create.mock.calls[0]![1].numPoses).toBe(1);expect(mock.create.mock.calls[1]![1].numPoses).toBe(2);
 expect(mock.create.mock.calls[1]![1].runningMode).toBe('VIDEO');expect(mock.files.mock.calls[0]![0]).toContain('/mediapipe/wasm');
 expect(mock.files).toHaveBeenCalledTimes(1);
 const result=search.detect({} as HTMLCanvasElement,400);expect(result.map(p=>p[0]!.x)).toEqual([.2,.8]);expect(result[0]![0]!.z).toBe(.1);
 primary.close();search.close();expect(mock.close).toHaveBeenCalledTimes(2);
});
