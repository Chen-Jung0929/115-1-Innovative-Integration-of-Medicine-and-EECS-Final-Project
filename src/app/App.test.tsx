import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from './App';
describe('dataset demo screen', () => {
  it('offers MP4 input but disables analysis until a video is decoded', () => {
    const html=renderToStaticMarkup(<App />);
    expect(html).toContain('accept=".mp4,.m4v,.mov,.webm,video/mp4,video/x-m4v,video/quicktime,video/webm"'); expect(html).toContain('disabled=""');
    expect(html).toContain('目前沒有分析結果');
  });
  it('labels provisional geometry and research limitations', () => {
    const html=renderToStaticMarkup(<App />);
    expect(html).toContain('不提供醫療診斷或治療建議'); expect(html).toContain('暫定屈曲 proxy'); expect(html).toContain('N/A');
  });
  it('offers a live camera mode next to uploaded video, without starting the camera on load', () => {
    const html=renderToStaticMarkup(<App />);
    expect(html).toContain('上傳影片'); expect(html).toContain('即時鏡頭');
    expect(html).not.toContain('開啟鏡頭');
  });
});
