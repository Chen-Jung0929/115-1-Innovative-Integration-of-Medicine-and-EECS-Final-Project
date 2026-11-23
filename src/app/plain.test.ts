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

import { framingHint, kneeToeNote, kneeToeValue, lockedBannerText, noticeText, trackingCause, trackingNotices, NOTICE_HOLD_MS, TRACKING_TEXT, type TrackingCause } from './plain';
import { accepted, humanPose, makeSample } from '../test/fixtures';
import type { Landmark } from '../domain/analysis';
import type { TrackingQuality } from '../domain/tracking';

const lost: TrackingQuality = { ...accepted, state: 'UNCERTAIN', accepted: false, identity: 'identity-uncertain', reasons: ['unreliable-torso-anchors', 'target-not-continuous'] };
const moved = (edits: [number, Partial<Landmark>][]) => { const p = humanPose(); for (const [i, e] of edits) p[i] = { ...p[i]!, ...e }; return p; };
const untracked = (landmarks: Landmark[], tracking: Partial<TrackingQuality> = {}, t = 0, i = 0) => makeSample({ landmarks, tracking: { ...lost, ...tracking }, sourceTimeMs: t, sampleIndex: i });

describe('why the person was not tracked (tracking-notice-v1)', () => {
  it('maps each real trigger to a short, true reason with something to do', () => {
    const cases: [TrackingCause, ReturnType<typeof makeSample>][] = [
      // User report: one person, head above the frame (MediaPipe extrapolates the nose above y = 0, shoulders at the edge).
      ['head-cut', untracked(moved([[0, { y: -0.05 }], [11, { y: 0 }], [12, { y: 0.01 }]]))],
      // lab_headcut (the user's screenshot): face points squashed INSIDE the frame, nothing below 0.
      ['head-cut', untracked(moved([[0, { y: 0.064 }], [7, { y: 0.04 }], [8, { y: 0.04 }], [11, { y: 0.083 }], [12, { y: 0.083 }]]))],
      // Head fully out: MediaPipe usually returns no pose at all.
      ['no-person', untracked([], { state: 'LOST', identity: 'target-lost', reasons: ['no-pose', 'waiting-for-initial-reliable-pose'] })],
      ['feet-cut', untracked(moved([[27, { y: 1.04 }], [28, { y: 1.03 }]]))],
      ['too-close', untracked(moved([[0, { y: -0.1 }], [27, { y: 1.1 }]]))],
      ['side-cut', untracked(moved([[12, { x: 1.02 }], [24, { x: 1.01 }]]))],
      ['others', untracked(humanPose(), { state: 'MANUAL_REVIEW_REQUIRED', reasons: ['ambiguous-candidates', 'manual-reselection-required'] })],
      ['unclear', untracked(moved([[23, { visibility: 0.2 }]]))],
      ['confirming', untracked(humanPose(), { reasons: ['identity-recovery-confirmation-pending'] })],
      ['lost-track', untracked(humanPose(), { reasons: ['target-not-continuous'] })],
      ['rejected', makeSample({ review: { label: 'wrong-target', identityId: 'x', reviewerId: 'r' } })],
      ['teleport', untracked(humanPose(), { state: 'MANUAL_REVIEW_REQUIRED', reasons: ['feet-teleport', 'manual-reselection-required'] })],
    ];
    for (const [want, s] of cases) expect(trackingCause(s), want).toBe(want);
    expect(noticeText('head-cut', false, 'video')).toBe('頭沒有完整入鏡：手機往後移，讓頭入鏡');
    expect(noticeText('head-cut', false, 'live')).toBe('頭沒有完整入鏡：請往後退，讓頭入鏡');
    expect(noticeText('feet-cut', false, 'video')).toBe('腳沒有完整入鏡：手機往後移，讓腳跟入鏡');
    expect(noticeText('others', false, 'live')).toBe('畫面有其他人：只留個案一人入鏡');
    expect(noticeText('head-cut', true, 'video')).toBe('頭沒有完整入鏡，暫停判斷');
    expect(noticeText('confirming', false, 'video')).toBe('無法確認是同一人：這一格暫不判斷');
    expect(lockedBannerText('head-cut', 'video', 2200)).toBe('從 2.2 秒起無法確定是同一人（頭沒有完整入鏡），暫停判斷。個案站直不動約 1 秒後會重新開始一段。重拍時手機往後移，讓頭入鏡。');
  });
  it('never blames other people or blocking unless that is what happened, and shows no codes', () => {
    for (const c of Object.keys(TRACKING_TEXT) as TrackingCause[]) {
      for (const mode of ['video', 'live'] as const) {
        const text = noticeText(c, false, mode);
        expect(text).not.toMatch(/[a-z]{3,}|講義|p\.\d/);
        expect(text.length, text).toBeLessThanOrEqual(19); // one line in the 390 px phone prompt box
        if (c !== 'others') expect(text).not.toMatch(/其他人|擋住/);
        if (c !== 'teleport') expect(text).not.toMatch(/換了人/);
      }
    }
  });
  it('uses the tracking reason for metric notes instead of a generic code word', () => {
    const bad = { valid: false as const, rawAngleDeg: null, invalidReasons: ['identity-uncertain'] as ['identity-uncertain'] };
    expect(plainReason(bad, true, { cause: 'head-cut', blocking: true, locked: false, text: '' })).toBe('頭沒有完整入鏡');
    const hip = { valid: false as const, rawAngleDeg: null, invalidReasons: ['joint-landmark-invalid'] as ['joint-landmark-invalid'] };
    expect(plainReason(hip, true, { cause: 'feet-cut', blocking: false, locked: false, text: '' })).toBe('腳沒有完整入鏡');
    expect(plainReason(hip, true, { cause: 'head-cut', blocking: false, locked: false, text: '' })).toBe('這個關節位置不合理');
    expect(plainReason(bad, true)).toBe('還在確認是不是同一人');
  });
  it('holds a reason for at least 0.5 s so it cannot flicker frame to frame', () => {
    const head = moved([[0, { y: -0.05 }], [11, { y: 0 }]]);
    const ok = (t: number, i: number) => makeSample({ sourceTimeMs: t, sampleIndex: i });
    // 10 Hz: head cut, then alternating confirming / head cut / tracked every 100 ms.
    const seq = [untracked(head, {}, 0, 0), untracked(humanPose(), { reasons: ['identity-recovery-confirmation-pending'] }, 100, 1), untracked(head, {}, 200, 2), ok(300, 3), untracked(head, {}, 400, 4), ok(500, 5), ok(600, 6), ok(700, 7), ok(800, 8), ok(900, 9), ok(1000, 10)];
    const n = trackingNotices(seq);
    for (let i = 0; i <= 8; i++) expect(n.get(i)?.cause, `#${i}`).toBe('head-cut');
    expect(n.get(10)).toBeNull(); // tracked for ≥ NOTICE_HOLD_MS → notice clears
    expect(NOTICE_HOLD_MS).toBe(500);
    // An untracked frame never shows "no notice" (it would let a stale "OK" through).
    const fresh = trackingNotices([ok(0, 0), untracked(head, {}, 100, 1)]);
    expect(fresh.get(0)).toBeNull(); expect(fresh.get(1)?.cause).toBe('head-cut');
  });
  it('keeps the cause that led to an identity lock for the rest of the video', () => {
    const head = moved([[0, { y: -0.05 }], [11, { y: 0 }]]);
    const lock = { state: 'MANUAL_REVIEW_REQUIRED' as const, reasons: ['identity-observation-gap-exceeded', 'manual-reselection-required'] };
    const n = trackingNotices([untracked(head, {}, 0, 0), untracked(head, {}, 700, 1), untracked(humanPose(), lock, 800, 2), untracked(head, lock, 900, 3), untracked(humanPose(), lock, 3000, 4)]);
    expect(n.get(2)).toEqual({ cause: 'head-cut', blocking: true, locked: true, sinceMs: 800, text: '頭沒有完整入鏡，暫停判斷' });
    expect(n.get(4)?.text).toBe('頭沒有完整入鏡，暫停判斷');
  });
});

describe('framing hints on tracked frames and the knee-to-toe note', () => {
  it('flags a cut head or cut feet even when the person is tracked, without blocking prompts', () => {
    const head = moved([[0, { y: 0.064 }], [7, { y: 0.04 }], [11, { y: 0.083 }]]);
    expect(framingHint(head)).toBe('head-cut');
    expect(framingHint(moved([[29, { y: 1.08 }], [30, { y: 1.1 }]]))).toBe('feet-cut');
    expect(framingHint(humanPose())).toBeNull();
    // tall_top: hair touches the top edge, eyes at 0.059, but the neck is normal → not a cut head.
    const tall = moved([[0, { y: 0.071 }], [2, { y: 0.059 }], [5, { y: 0.059 }], [11, { y: 0.18 }], [12, { y: 0.18 }], [23, { y: 0.45 }], [24, { y: 0.45 }]]);
    expect(framingHint(tall, 720, 1280)).toBeNull();
    // Real head cut (lab_headcut): face squashed to the top, nose just above the shoulders.
    expect(framingHint(moved([[0, { y: 0.064 }], [7, { y: 0.04 }], [11, { y: 0.083 }], [12, { y: 0.083 }]]), 720, 1280)).toBe('head-cut');
    const n = trackingNotices([makeSample({ landmarks: head, sourceTimeMs: 0, sampleIndex: 0 })]);
    expect(n.get(0)).toMatchObject({ cause: 'head-cut', blocking: false });
  });
  it('uses a dead band around the toe line and gives the real reason when the value is missing', () => {
    const val = (value: number) => ({ valid: true as const, value, invalidReasons: [] as [] });
    expect(kneeToeValue(val(0.001))).toBe('0.00');
    expect(kneeToeNote(val(0.004), 'frontal', true)).toBe('膝蓋在腳尖線上');
    expect(kneeToeNote(val(0.2), 'frontal', true)).toContain('內側');
    expect(kneeToeNote(val(-0.2), 'frontal', true)).toBe('膝蓋在腳尖線外側');
    const missing = (r: 'unsupported-view' | 'out-of-frame') => ({ valid: false as const, value: null, invalidReasons: [r] as [typeof r] });
    expect(kneeToeNote(missing('unsupported-view'), 'frontal', true)).toBe('只適用正面拍攝');
    expect(kneeToeNote(missing('out-of-frame'), 'side', true)).toBe('只適用正面拍攝');
    expect(kneeToeNote(missing('out-of-frame'), 'frontal', true, { cause: 'feet-cut', blocking: false, locked: false, text: '' })).toBe('腳沒有完整入鏡');
  });
});
