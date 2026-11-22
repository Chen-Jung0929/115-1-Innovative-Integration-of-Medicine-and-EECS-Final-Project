import type { FrontalMetrics } from '../biomechanics/frontal';
import type { LateralMetrics } from '../biomechanics/lateral';

/**
 * Plain-language prompts for the frontal checks in the Movement analysis handout. Thresholds are
 * PROVISIONAL placeholders (the handout gives none) and must be confirmed by the PT group.
 * Left/right are the person's own anatomical sides.
 */
export const CUE_POLICY = {
  version: 'squat-frontal-cues-v1',
  thresholdsStatus: 'provisional-pending-pt-review',
  headHipWidths: 0.35,
  shoulderDeg: 5,
  trunkDeg: 8,
  shiftHipWidths: 0.25,
  pelvisDeg: 5,
  kneeToeHipWidths: 0.45,
  /** Knee checks only once the person is clearly squatting (knee flexion proxy, degrees). */
  kneeMinFlexionDeg: 30,
  /** A condition must hold this long before its prompt appears (≈ 2 samples at 10 Hz). */
  holdMs: 200,
  maxShown: 2,
  /** Side view (handout p.12). Knee ahead of the toe line, in shank lengths. */
  kneeForwardShank: 0.6,
  /** Side view trunk forward lean vs vertical, degrees. */
  trunkForwardDeg: 45,
} as const;

export type CueId = 'trunk' | 'pelvis' | 'knee-left' | 'knee-right' | 'head' | 'shoulder' | 'shift' | 'knee-forward' | 'trunk-forward';
export type BodyPart = 'head' | 'shoulder' | 'trunk' | 'pelvis' | 'knee-left' | 'knee-right' | 'side-knee' | 'side-trunk';
export interface Cue {
  id: CueId;
  /** Handout page the check comes from. */
  page: number;
  text: string;
  /** Body parts to highlight on the overlay. */
  parts: BodyPart[];
}

const side = (v: number) => (v > 0 ? '左' : '右');
const over = (v: { valid: boolean; value: number | null }, limit: number) => v.valid && Math.abs(v.value!) > limit;

/**
 * Instantaneous conditions for one pose (no time persistence). Explains the cause the way the
 * handout does: head off the midline and uneven shoulders "due to trunk leaning" become one prompt.
 */
export function instantCues(m: FrontalMetrics, kneeFlexionDeg: { left: number | null; right: number | null }, p: typeof CUE_POLICY = CUE_POLICY): Cue[] {
  const cues: Cue[] = [];
  const trunk = over(m.trunkSide, p.trunkDeg) ? m.trunkSide.value! : null;
  const head = over(m.head, p.headHipWidths) ? m.head.value! : null;
  const shoulder = over(m.shoulderTilt, p.shoulderDeg) ? m.shoulderTilt.value! : null;
  // Leaning to one side drops the shoulder on that side and carries the head the same way.
  const headFromTrunk = trunk !== null && head !== null && Math.sign(head) === Math.sign(trunk);
  const shoulderFromTrunk = trunk !== null && shoulder !== null && Math.sign(shoulder) === Math.sign(trunk);

  if (trunk !== null) {
    const extra = [headFromTrunk ? '頭偏離中線' : '', shoulderFromTrunk ? '兩肩不平' : ''].filter(Boolean).join('、');
    cues.push({ id: 'trunk', page: 9, text: `上身往${side(trunk)}傾${extra ? `（${extra}）` : ''}`,
      parts: ['trunk', ...(headFromTrunk ? ['head' as const] : []), ...(shoulderFromTrunk ? ['shoulder' as const] : [])] });
  }
  if (over(m.pelvisTilt, p.pelvisDeg)) cues.push({ id: 'pelvis', page: 10, text: `骨盆往${side(m.pelvisTilt.value!)}傾（兩側不水平）`, parts: ['pelvis'] });
  for (const s of ['left', 'right'] as const) {
    const flex = kneeFlexionDeg[s];
    const v = m.kneeToe[s];
    if (flex !== null && flex >= p.kneeMinFlexionDeg && v.valid && v.value > p.kneeToeHipWidths)
      cues.push({ id: `knee-${s}`, page: 11, text: `${s === 'left' ? '左' : '右'}膝往內，沒有對準腳尖`, parts: [`knee-${s}`] });
  }
  if (head !== null && !headFromTrunk) cues.push({ id: 'head', page: 7, text: `頭偏離中線（往${side(head)}）`, parts: ['head'] });
  if (shoulder !== null && !shoulderFromTrunk) cues.push({ id: 'shoulder', page: 8, text: `${shoulder > 0 ? '左' : '右'}肩比較低（兩肩不平）`, parts: ['shoulder'] });
  if (over(m.shift, p.shiftHipWidths) && trunk === null) cues.push({ id: 'shift', page: 9, text: `重心往${side(m.shift.value!)}偏`, parts: ['trunk'] });
  return cues;
}

/** Side-view prompts (handout p.12). Knee check only once the near knee is clearly bent. */
export function lateralCues(m: LateralMetrics, nearKneeFlexionDeg: number | null, p: typeof CUE_POLICY = CUE_POLICY): Cue[] {
  const cues: Cue[] = [];
  if (m.trunkLean.valid && m.trunkLean.value > p.trunkForwardDeg) cues.push({ id: 'trunk-forward', page: 12, text: '上身前傾太多', parts: ['side-trunk'] });
  if (nearKneeFlexionDeg !== null && nearKneeFlexionDeg >= p.kneeMinFlexionDeg && m.kneeForward.valid && m.kneeForward.value > p.kneeForwardShank)
    cues.push({ id: 'knee-forward', page: 12, text: '膝蓋超過腳尖太多', parts: ['side-knee'] });
  return cues;
}

/**
 * Debounces prompts so they do not flicker: a cue is shown only after its condition has held for
 * `holdMs`, and at most `maxShown` cues are returned in priority order (instantCues order).
 */
export function createCueTracker(p: typeof CUE_POLICY = CUE_POLICY) {
  const since = new Map<CueId, number>();
  return {
    update(timeMs: number, cues: readonly Cue[]): Cue[] {
      const active = new Set(cues.map(c => c.id));
      for (const id of [...since.keys()]) if (!active.has(id)) since.delete(id);
      for (const c of cues) if (!since.has(c.id)) since.set(c.id, timeMs);
      return cues.filter(c => timeMs - since.get(c.id)! >= p.holdMs).slice(0, p.maxShown);
    },
    reset: () => since.clear(),
  };
}
