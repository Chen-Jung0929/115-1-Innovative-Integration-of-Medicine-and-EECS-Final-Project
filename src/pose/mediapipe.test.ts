import { afterEach, beforeEach, expect, it, vi } from 'vitest';
let adapter: typeof import('./mediapipe');
beforeEach(async () => { vi.resetModules(); adapter = await import('./mediapipe'); });
const signal = () => new AbortController().signal;
const binary = () => new Response('abc', {status:200,headers:{'content-type':'application/octet-stream'}});
afterEach(()=>vi.unstubAllGlobals());
it('prefers explicitly selected local file and never fetches it', async () => {
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const asset=await adapter.modelBytes(new File(['abc'],'pose_landmarker_lite.task'),signal(),true);
  expect(fetcher).not.toHaveBeenCalled(); expect(asset.id).toBe('local-task-file');
  expect(asset.hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
it('loads same-origin project model before official download', async () => {
  const fetcher=vi.fn().mockResolvedValue(binary());vi.stubGlobal('fetch',fetcher);
  const asset=await adapter.modelBytes(null,signal(),true);
  expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0]?.[0]).toBe(adapter.PROJECT_MODEL_URL);expect(asset.id).toBe(adapter.PROJECT_MODEL_URL);
});
it.each([new Response('',{status:404}),new Response('<html/>',{headers:{'content-type':'text/html'}})])('missing project asset never triggers unapproved remote download', async response => {
  const fetcher=vi.fn().mockResolvedValue(response);vi.stubGlobal('fetch',fetcher);
  await expect(adapter.modelBytes(null,signal(),false)).rejects.toThrow(adapter.MODEL_LOAD_ERROR);expect(fetcher).toHaveBeenCalledTimes(1);
});
it('defaults to the pinned official fallback and reuses its bytes', async () => {
  const fetcher=vi.fn().mockResolvedValueOnce(new Response('',{status:404})).mockResolvedValueOnce(binary());vi.stubGlobal('fetch',fetcher);
  const asset=await adapter.modelBytes(null,signal());
  expect(await adapter.modelBytes(null,signal())).toBe(asset);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1]?.[0]).toBe(adapter.MODEL_URL); expect(asset.id).toBe(adapter.MODEL_URL);
});
it('does not mask same-origin deployment permission errors with remote fallback', async () => {
  const fetcher=vi.fn().mockResolvedValue(new Response('',{status:403}));vi.stubGlobal('fetch',fetcher);
  await expect(adapter.modelBytes(null,signal(),true)).rejects.toThrow(adapter.MODEL_LOAD_ERROR);expect(fetcher).toHaveBeenCalledTimes(1);
});
it('rejects empty model files', async () => { await expect(adapter.modelBytes(new File([],'x.task'),signal())).rejects.toThrow(adapter.MODEL_LOAD_ERROR); });
