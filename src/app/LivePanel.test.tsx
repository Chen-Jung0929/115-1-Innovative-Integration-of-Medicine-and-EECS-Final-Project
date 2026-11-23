import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LivePanel, liveStatus, perfText, waitStatus } from './LivePanel';
import { createPerformanceRecorder } from '../motion/livePerformance';
import { makeSample } from '../test/fixtures';
describe('live camera panel', () => {
  it('starts with the camera off and states that frames stay on the device', () => {
    const html = renderToStaticMarkup(<LivePanel model={null} allowDownload={false} side="both" onSide={() => {}} disabled={false} />);
    expect(html).toContain('開啟鏡頭'); expect(html).toContain('不會上傳'); expect(html).toContain('N/A');
    expect(html).not.toContain('<button>停止</button>');
  });
  it('explains states in plain words, including hands-free waiting', () => {
    const locked = makeSample({ tracking: { ...makeSample().tracking, state: 'MANUAL_REVIEW_REQUIRED', accepted: false } });
    expect(liveStatus(locked)).toContain('已結束');
    expect(waitStatus(null)).toContain('自動開始');
    expect(waitStatus({ ready: false, heldMs: 0, reason: 'not-full-body' })).toContain('全身');
    expect(waitStatus({ ready: false, heldMs: 0, reason: 'multiple-people' })).toContain('不只一人');
    expect(waitStatus({ ready: false, heldMs: 700, reason: 'holding' })).toContain('0.7 / 1.5');
    expect(liveStatus(undefined)).toContain('等待');
    expect(liveStatus(makeSample())).toBe('量測中');
  });
  it('shows measured performance, labels presentation-based latency as an estimate, and never invents numbers', () => {
    const r = createPerformanceRecorder({ userAgent: 't', delegate: 'CPU', width: 640, height: 360, warmUpMs: 0, sourceClockOffsetMs: 0 });
    expect(perfText(r.summary())).toContain('N/A');
    r.frame(0, 1); r.frame(1000, 31); r.sample(0, 25, 50, 'presentation-callback');
    const text = perfText(r.summary());
    expect(text).toContain('（估計）'); expect(text).toContain('掉幀 29'); expect(text).toContain('推論中位數 25 ms');
  });
});
