import type { Sample } from '../domain/analysis';
import type { InvalidReason, ScalarValue } from '../domain/measurement';
import { frontalFrame, heelMidpoint, measureFrontal, type FrontalMetrics } from '../biomechanics/frontal';
import { flexionProxy } from '../biomechanics/knee';
import { gateReason } from '../tracking/gate';
import { createBaselineAnchor, type BaselineState } from './baseline';
import { createCueTracker, instantCues, lateralCues, type Cue } from './frontalCues';
import { classifyView, measureLateral, type LateralMetrics, type ViewKind } from '../biomechanics/lateral';

/**
 * Where the baseline sits once locked.
 * - 'standing-trunk' (default, team decision 2026-11-17): the person's own trunk midline while
 *   standing (mean of shoulder-midpoint and hip-midpoint x). Absorbs an asymmetric stance and small
 *   camera offsets, so prompts mean "moved away from how this person stood".
 * - 'heel-midpoint': handout p.5 literal definition, the vertical through the midpoint of both heels.
 */
export type BaselineSource = 'standing-trunk' | 'heel-midpoint';
/** Both knees below this flexion proxy (degrees) count as standing for calibration. */
export const STANDING_MAX_KNEE_FLEXION_DEG = 20;
/**
 * Uploaded video only (whole recording is available): when the person never stands still for the
 * one-second lock (e.g. the clip starts mid-squat or they keep moving), calibrate from the most
 * upright samples anywhere in the video instead of showing "stand still" forever.
 * Provisional engineering values (offline-standing-calibration-v1).
 */
export const OFFLINE_CALIBRATION = { version: 'offline-standing-calibration-v1', relaxedMaxKneeFlexionDeg: 35, minSamples: 3 } as const;

export interface FrontalFrame {
  sampleIndex: number;
  /** False when person tracking rejected this sample (lost/switched subject) or review rejected it. */
  tracked: boolean;
  baseline: BaselineState;
  /**
   * Gated metrics. Head, shift, shoulder tilt, pelvis tilt and trunk side lean are RELATIVE to the
   * person's own standing calibration (the same second that locked the baseline), which also cancels
   * a slightly rolled camera or a habitual stance. Knee vs toe line stays absolute (handout p.11).
   * N/A ('baseline-pending') until calibrated.
   */
  metrics: FrontalMetrics;
  /** Standing values subtracted from the metrics, for display/audit. */
  neutral: Neutral | null;
  /** Detected camera view for this sample (null when the torso points are unusable). */
  view: ViewKind | null;
  /** Side-view metrics (handout p.12); null unless the view is 'side' and the subject passed QC. */
  lateral: LateralMetrics | null;
  cues: Cue[];
  /** How the baseline in use was found: a live one-second standing lock, or the whole-video fallback. */
  calibration: 'standing-lock' | 'whole-video' | null;
}
export interface Neutral { head: number; shift: number; shoulderTilt: number; pelvisTilt: number; trunkSide: number }
type Tilt = keyof Neutral;
const TILTS: Tilt[] = ['head', 'shift', 'shoulderTilt', 'pelvisTilt', 'trunkSide'];

const blocked = (reason: InvalidReason): ScalarValue => ({ valid: false, value: null, invalidReasons: [reason] });
function gated(m: FrontalMetrics, s: Sample): FrontalMetrics {
  const rejected = s.review !== undefined && s.review.label !== 'correct-target';
  const subject = rejected ? 'identity-uncertain' : gateReason(s.tracking, []);
  const g = (v: ScalarValue, reason: InvalidReason | null) => reason ? blocked(reason) : v;
  const sideReason = (side: 'left' | 'right') => subject ?? gateReason(s.tracking, [side]);
  return {
    head: g(m.head, subject), shoulderTilt: g(m.shoulderTilt, subject), trunkSide: g(m.trunkSide, subject),
    shift: g(m.shift, subject), pelvisTilt: g(m.pelvisTilt, subject),
    kneeToe: { left: g(m.kneeToe.left, sideReason('left')), right: g(m.kneeToe.right, sideReason('right')) },
  };
}

/**
 * Runs the baseline lock, frontal metrics and debounced prompts over analysed samples in source-time
 * order. Derived on demand (not persisted), so changing provisional thresholds never rewrites a
 * saved session. Only samples whose subject passed QC (and was not rejected by human review) feed
 * the baseline or produce prompts.
 */
export function frontalTimeline(samples: readonly Sample[], width: number, height: number, source: BaselineSource = 'standing-trunk'): FrontalFrame[] {
  const offline = offlineCalibration(samples, width, height, source);
  const anchor = createBaselineAnchor();
  const tracker = createCueTracker();
  let standingBuf: { timeMs: number; m: FrontalMetrics }[] = [];
  let neutral: Neutral | null = null;
  let lockedAt: number | null = null;
  return [...samples].sort((a, b) => a.sourceTimeMs - b.sourceTimeMs).map(s => {
    const rejected = s.review !== undefined && s.review.label !== 'correct-target';
    const usable = !rejected && s.tracking.accepted;
    const frame = usable ? frontalFrame(s.landmarks, width, height) : null;
    const heel = usable ? heelMidpoint(s.landmarks, width, height) : null;
    const f = frame && typeof frame !== 'string' ? frame : null;
    const h = heel && typeof heel !== 'string' ? heel : null;
    const knee = { left: flexionProxy(s.left), right: flexionProxy(s.right) };
    const standing = knee.left !== null && knee.right !== null && Math.max(knee.left, knee.right) <= STANDING_MAX_KNEE_FLEXION_DEG;
    const centerX = source === 'heel-midpoint' ? h?.x ?? null : f ? (f.shoulderMid.x + f.hipMid.x) / 2 : null;
    const live = anchor.update({ timeMs: s.sourceTimeMs, heel: h, hipWidthPx: f?.hipWidth ?? null, centerX, standing });
    const liveRaw = gated(measureFrontal(s.landmarks, width, height, live.x), s);
    if (usable && standing) standingBuf = [...standingBuf.filter(b => s.sourceTimeMs - b.timeMs <= 1000), { timeMs: s.sourceTimeMs, m: liveRaw }];
    if (live.state !== 'locked') { neutral = null; lockedAt = null; }
    else if (live.lockedAtMs !== lockedAt) { lockedAt = live.lockedAtMs; neutral = neutralFrom(standingBuf.map(b => b.m)); }
    const useOffline = live.state !== 'locked' && offline !== null;
    const baseline = useOffline ? offline.baseline : live;
    const raw = useOffline ? gated(measureFrontal(s.landmarks, width, height, offline.baseline.x), s) : liveRaw;
    const metrics = relative(raw, useOffline ? offline.neutral : neutral);
    const calibration = baseline.state !== 'locked' ? null : useOffline ? 'whole-video' as const : 'standing-lock' as const;
    const view = usable ? classifyView(s.landmarks, width, height) : null;
    let lateral: LateralMetrics | null = null;
    if (view === 'side') {
      const m = measureLateral(s.landmarks, width, height);
      const reason = gateReason(s.tracking, [m.side]);
      lateral = reason ? { side: m.side, kneeForward: blocked(reason), trunkLean: blocked(reason), tibiaLean: blocked(reason) } : m;
    }
    const instant = !usable ? [] : view === 'frontal' ? instantCues(metrics, knee) : view === 'side' && lateral ? lateralCues(lateral, knee[lateral.side]) : [];
    const cues = tracker.update(s.sourceTimeMs, instant);
    return { sampleIndex: s.sampleIndex, tracked: usable, baseline, metrics, neutral: useOffline ? offline.neutral : neutral, view, lateral, cues, calibration };
  });
}

/**
 * Whole-video standing calibration: the most upright usable frontal samples (both knee flexion
 * proxies ≤ 20°, or ≤ 35° when fewer than 3 exist), line at the median centre, neutral tilts = mean
 * of those samples measured against that line. Null when no such samples exist.
 */
function offlineCalibration(samples: readonly Sample[], width: number, height: number, source: BaselineSource): { baseline: Extract<BaselineState, { state: 'locked' }>; neutral: Neutral | null } | null {
  const pool = samples.flatMap(s => {
    if ((s.review !== undefined && s.review.label !== 'correct-target') || !s.tracking.accepted) return [];
    if (classifyView(s.landmarks, width, height) !== 'frontal') return [];
    const f = frontalFrame(s.landmarks, width, height), h = heelMidpoint(s.landmarks, width, height);
    const l = flexionProxy(s.left), r = flexionProxy(s.right);
    if (typeof f === 'string' || typeof h === 'string' || l === null || r === null) return [];
    const cx = source === 'heel-midpoint' ? h.x : (f.shoulderMid.x + f.hipMid.x) / 2;
    return [{ s, cx, heelY: h.y, flex: Math.max(l, r) }];
  });
  let chosen = pool.filter(p => p.flex <= STANDING_MAX_KNEE_FLEXION_DEG);
  if (chosen.length < OFFLINE_CALIBRATION.minSamples) chosen = pool.filter(p => p.flex <= OFFLINE_CALIBRATION.relaxedMaxKneeFlexionDeg);
  if (chosen.length < OFFLINE_CALIBRATION.minSamples) return null;
  const median = (v: number[]) => { const a = [...v].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]!; };
  const x = median(chosen.map(c => c.cx)), heelY = median(chosen.map(c => c.heelY));
  const neutral = neutralFrom(chosen.map(c => gated(measureFrontal(c.s.landmarks, width, height, x), c.s)));
  return { baseline: { state: 'locked', x, heelY, lockedAtMs: chosen[0]!.s.sourceTimeMs }, neutral };
}

/** Mean standing tilt per metric; a metric without any valid standing value stays uncalibrated. */
function neutralFrom(ms: FrontalMetrics[]): Neutral | null {
  const out = {} as Neutral;
  for (const k of TILTS) {
    const vals = ms.map(m => m[k]).filter(v => v.valid).map(v => v.value!);
    if (!vals.length) return null;
    out[k] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  return out;
}
function relative(m: FrontalMetrics, n: Neutral | null): FrontalMetrics {
  const out = { ...m };
  for (const k of TILTS) {
    const v = m[k];
    out[k] = !v.valid ? v : n === null ? blocked('baseline-pending') : { valid: true, value: v.value - n[k], invalidReasons: [] };
  }
  return out;
}
