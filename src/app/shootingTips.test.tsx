import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LIVE_TIP_IDS, SHOOTING_TIPS, ShootingTips } from './shootingTips';

describe('filming tips (ADR-098)', () => {
  it('upload page: side view for flexion and trunk, front view for knee-in and pelvis, tight clothing', () => {
    const html = renderToStaticMarkup(<ShootingTips />);
    for (const t of ['正側面', '髖部高度', '直角', '從正面拍', '貼身長褲']) expect(html).toContain(t);
  });
  it('plain words only: no paper, author or handout names on screen', () => {
    const all = SHOOTING_TIPS.map(t => t.text).join('');
    for (const w of ['SOMA', 'Panni', 'Tayko', '文獻', '講義', 'et al', '%']) expect(all).not.toContain(w);
  });
  it('a subset can be shown', () => {
    const html = renderToStaticMarkup(<ShootingTips ids={LIVE_TIP_IDS} />);
    expect(html).not.toContain('從正面拍'); expect(html).toContain('正側面');
  });
});
