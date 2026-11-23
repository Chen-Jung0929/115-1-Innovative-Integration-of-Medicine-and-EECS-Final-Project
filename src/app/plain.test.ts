import { describe, expect, it } from 'vitest';
import { plainReason, qcStatus, showAngle, showFlexion } from './plain';
describe('plain-language measurement status', () => {
  it('turns QC codes into short words but keeps the codes for the detail line', () => {
    const bad = { valid: false as const, rawAngleDeg: null, invalidReasons: ['low-confidence'] as ['low-confidence'] };
    expect(plainReason(bad, true)).toBe('這個關節看不清楚');
    expect(qcStatus(bad, true)).toContain('low-confidence');
    expect(plainReason(undefined, false)).toContain('沒有分析結果');
    expect(showAngle(bad)).toBe('N/A');
    expect(showAngle({ valid: true, rawAngleDeg: 90.04, invalidReasons: [] })).toBe('90.0°');
    expect(showFlexion({ valid: true, rawAngleDeg: 176, invalidReasons: [] }, a => a.valid ? 180 - a.rawAngleDeg : null)).toBe('4°');
    expect(showFlexion(bad, () => 1)).toBe('N/A');
  });
});
