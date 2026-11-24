import type { FrontalMetrics } from '../biomechanics/frontal';
import type { LateralMetrics, SidePlumb } from '../biomechanics/lateral';

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
  maxShown: 3,
  /** Side view (handout p.12). Knee ahead of the toe line, in shank lengths. */
  kneeForwardShank: 0.6,
  /** Side view trunk forward lean vs vertical, degrees. */
  trunkForwardDeg: 45,
  /** Side view: shoulder in front of the ankle (lateral malleolus) baseline, in shank lengths, while squatting. */
  sideShoulderForwardShank: 0.4,
  // --- ADR-098: filled from the literature (SOMA 2025, FMS overhead squat). 暫定, PT review pending. ---
  // Only checks that had no threshold before; none of the values above were changed.
  /** Frontal: shin (ankle→knee) tilted inward this much from vertical → knee-inward prompt (alongside kneeToeHipWidths). */
  shinValgusDeg: 3,
  /** Side: trunk lean may exceed the shin lean by at most this much (trunk and shin roughly parallel). */
  trunkTibiaMarginDeg: 0,
  /**
   * The trunk–shin rule is judged at the bottom of the squat (as in the source), not on the way down where the
   * trunk normally leans first: only when the hip is below the knee OR the knee flexion proxy reaches this.
   * Engineering default (暫定), not from the literature.
   */
  trunkTibiaMinKneeFlexionDeg: 90,
  /** Side: hip lower than the knee by more than this (shank lengths) = full squat depth reached (shown as information, not a warning). */
  hipBelowKneeShank: 0,
} as const;

export type CueId = 'trunk' | 'pelvis' | 'knee-left' | 'knee-right' | 'head' | 'shoulder' | 'shift' | 'knee-forward' | 'trunk-forward' | 'trunk-tibia' | 'side-forward';
export type BodyPart = 'head' | 'shoulder' | 'trunk' | 'pelvis' | 'knee-left' | 'knee-right' | 'side-knee' | 'side-trunk' | 'side-plumb';
export interface Cue {
  id: CueId;
  /** Handout page the check relates to. */
  page: number;
  /** Set when the rule itself comes from the literature rather than the handout (ADR-098); never shown in the UI. */
  source?: 'literature-soma-2025';
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
    const v = m.kneeToe[s], shin = m.shinTilt[s];
    if (flex === null || flex < p.kneeMinFlexionDeg) continue;
    const pastToe = v.valid && v.value > p.kneeToeHipWidths;
    // ADR-098: the shin leaning inward is a second, independent sign of the same knee-inward fault (one prompt).
    const shinIn = shin.valid && shin.value >= p.shinValgusDeg;
    if (pastToe || shinIn)
      cues.push({ id: `knee-${s}`, page: 11, ...(pastToe ? {} : { source: 'literature-soma-2025' as const }), text: `${s === 'left' ? '左' : '右'}膝往內，${pastToe ? '沒有對準腳尖' : '小腿往內斜'}`, parts: [`knee-${s}`] });
  }
  if (head !== null && !headFromTrunk) cues.push({ id: 'head', page: 7, text: `頭偏離中線（往${side(head)}）`, parts: ['head'] });
  if (shoulder !== null && !shoulderFromTrunk) cues.push({ id: 'shoulder', page: 8, text: `${shoulder > 0 ? '左' : '右'}肩比較低（兩肩不平）`, parts: ['shoulder'] });
  if (over(m.shift, p.shiftHipWidths) && trunk === null) cues.push({ id: 'shift', page: 9, text: `重心往${side(m.shift.value!)}偏`, parts: ['trunk'] });
  return cues;
}

/** Side-view prompts (handout p.12). Knee and baseline checks only once the near knee is clearly bent. */
export function lateralCues(m: LateralMetrics, nearKneeFlexionDeg: number | null, plumb: SidePlumb | null = null, p: typeof CUE_POLICY = CUE_POLICY): Cue[] {
  const cues: Cue[] = [];
  const bent = nearKneeFlexionDeg !== null && nearKneeFlexionDeg >= p.kneeMinFlexionDeg;
  if (m.trunkLean.valid && m.trunkLean.value > p.trunkForwardDeg) cues.push({ id: 'trunk-forward', page: 12, text: '上身前傾太多', parts: ['side-trunk'] });
  // ADR-098: at the bottom of the squat, the upper body should stay roughly parallel to the shin.
  const bottom = deepEnough(m, p) || (nearKneeFlexionDeg !== null && nearKneeFlexionDeg >= p.trunkTibiaMinKneeFlexionDeg);
  if (bottom && m.trunkLean.valid && m.tibiaLean.valid && m.trunkLean.value - m.tibiaLean.value > p.trunkTibiaMarginDeg)
    cues.push({ id: 'trunk-tibia', page: 12, source: 'literature-soma-2025', text: '上身比小腿更往前倒（上身應與小腿大致平行）', parts: ['side-trunk'] });
  // Shoulder far in front of the ankle baseline = weight shifted forward (merged with the lean for display: mergeSideCues).
  if (bent && plumb && plumb.shoulder.valid && plumb.shoulder.value > p.sideShoulderForwardShank) cues.push({ id: 'side-forward', page: 12, text: '重心偏前（肩膀超過外踝基準線太多）', parts: ['side-plumb'] });
  if (nearKneeFlexionDeg !== null && nearKneeFlexionDeg >= p.kneeMinFlexionDeg && m.kneeForward.valid && m.kneeForward.value > p.kneeForwardShank)
    cues.push({ id: 'knee-forward', page: 12, text: '膝蓋超過腳尖太多', parts: ['side-knee'] });
  return cues;
}

/**
 * Leaning too far forward is the usual cause of the weight shifting forward, so when both debounced side
 * prompts are shown they become one (same idea as the frontal cause merging). Applied AFTER debouncing so
 * each condition keeps its own hold timer.
 */
export function mergeSideCues(cues: readonly Cue[]): Cue[] {
  // "Leaning too far" already covers "leaning more than the shin": show only the stronger one.
  let out = cues.some(c => c.id === 'trunk-forward') ? cues.filter(c => c.id !== 'trunk-tibia') : [...cues];
  const lean = out.find(c => c.id === 'trunk-forward' || c.id === 'trunk-tibia'), fwd = out.find(c => c.id === 'side-forward');
  if (!lean || !fwd) return out;
  const text = lean.id === 'trunk-forward' ? '上身前傾太多（肩膀超過基準線，重心偏前）' : '上身比小腿更往前倒（肩膀超過基準線，重心偏前）';
  out = out.filter(c => c !== fwd).map(c => c === lean ? { ...lean, text, parts: ['side-trunk', 'side-plumb'] } : c);
  return out;
}

/** ADR-098: full squat depth (hip lower than the knee) in a side view; information only, never a warning. */
export function deepEnough(m: LateralMetrics | null, p: typeof CUE_POLICY = CUE_POLICY): boolean {
  return !!m && m.hipDepth.valid && m.hipDepth.value > p.hipBelowKneeShank;
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
