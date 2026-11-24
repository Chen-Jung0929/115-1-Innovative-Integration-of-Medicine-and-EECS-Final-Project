import { describe, expect, it } from 'vitest';
import { pickRecorderMime, videoExtension } from './recorder';
describe('segment video recorder', () => {
  it('prefers MP4 where supported (Safari, iPad) and falls back to WebM (Chrome)', () => {
    expect(pickRecorderMime(t => t.startsWith('video/mp4'))).toBe('video/mp4;codecs=avc1');
    expect(pickRecorderMime(t => t === 'video/webm;codecs=vp8')).toBe('video/webm;codecs=vp8');
    expect(pickRecorderMime(() => false)).toBe('');
    expect(pickRecorderMime(() => { throw new Error('x'); })).toBe('');
  });
  it('names the file by container', () => {
    expect(videoExtension('video/mp4;codecs=avc1')).toBe('mp4');
    expect(videoExtension('video/webm;codecs=vp9')).toBe('webm');
  });
});
