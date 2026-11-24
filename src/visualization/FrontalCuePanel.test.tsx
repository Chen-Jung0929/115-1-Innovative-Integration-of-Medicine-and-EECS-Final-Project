import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FrontalCuePanel } from './FrontalOverlay';
import { frontalTimeline, type FrontalFrame } from '../motion/frontalTimeline';
import { humanPose, makeSample } from '../test/fixtures';
import type { Landmark } from '../domain/analysis';
import type { LateralMetrics } from '../biomechanics/lateral';

const v = (x: number, y: number, visibility = 1): Landmark => ({ x, y, visibility });
const frontal = (): Landmark[] => { const p = humanPose(); p[29] = v(.42, .95); p[30] = v(.58, .95); p[31] = v(.4, .97); p[32] = v(.6, .97); return p; };
const side = (): Landmark[] => {
  const p = humanPose();
  p[11] = v(.5, .3); p[12] = v(.51, .3, .6); p[23] = v(.5, .6); p[24] = v(.51, .6, .6);
  p[25] = v(.5, .75); p[26] = v(.51, .75, .6); p[27] = v(.5, .9); p[28] = v(.51, .9, .6);
  p[29] = v(.47, .92); p[30] = v(.48, .92, .6); p[31] = v(.56, .92); p[32] = v(.57, .92, .6);
  return p;
};
const at = (i: number, landmarks: Landmark[]) => makeSample({ sampleIndex: i, sourceTimeMs: i * 200, requestedTimeMs: i * 200, landmarks });
const html = (frame: FrontalFrame | undefined) => renderToStaticMarkup(<FrontalCuePanel frame={frame} hasSample={true} />);
const ok = (value: number) => ({ valid: true as const, value, invalidReasons: [] as [] });

describe('cue panel: manual check type and depth (ADR-098)', () => {
  it('manual side on a frontal picture says it was chosen and is reference only', () => {
    const t = frontalTimeline([0, 1, 2].map(i => at(i, frontal())), 100, 100, 'standing-trunk', false, 'side');
    const out = html(t[2]);
    expect(out).toContain('已手動指定用側面檢查');
    expect(out).toContain('畫面看起來不是側面，僅供參考');
  });
  it('manual side on a side picture confirms the choice without the reference-only note', () => {
    const t = frontalTimeline([0, 1, 2].map(i => at(i, side())), 100, 100, 'standing-trunk', false, 'side');
    const out = html(t[2]);
    expect(out).toContain('已手動指定用側面檢查');
    expect(out).not.toContain('僅供參考');
  });
  it('manual frontal on a true side pose cannot be measured and says what to pick instead', () => {
    const t = frontalTimeline([0, 1, 2].map(i => at(i, side())), 100, 100, 'standing-trunk', false, 'frontal');
    const out = html(t[2]);
    expect(out).toContain('無法用正面檢查');
    expect(out).toContain('請改選「側面」或「自動判斷」');
  });
  it('automatic mode shows no manual line', () => {
    const t = frontalTimeline([0, 1, 2].map(i => at(i, side())), 100, 100);
    expect(html(t[2])).not.toContain('手動指定');
  });
  it('side view at full depth shows the information line, never as a warning', () => {
    const base = frontalTimeline([0, 1, 2].map(i => at(i, side())), 100, 100)[2]!;
    const lateral: LateralMetrics = { ...base.lateral!, hipDepth: ok(.2) };
    const out = html({ ...base, lateral });
    expect(out).toContain('✓ 蹲得夠深（髖部低於膝蓋）');
    expect(out).not.toContain('⚠ 蹲');
    expect(html({ ...base, lateral: { ...lateral, hipDepth: ok(-.2) } })).not.toContain('蹲得夠深');
  });
});
