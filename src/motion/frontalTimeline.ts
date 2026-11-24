import type { Sample } from '../domain/analysis';
import type { InvalidReason, ScalarValue } from '../domain/measurement';
import { FRONTAL_POLICY, frontalFrame, heelMidpoint, measureFrontal, type FrontalMetrics } from '../biomechanics/frontal';
import { flexionProxy } from '../biomechanics/knee';
import { gateReason } from '../tracking/gate';
import { BASELINE_POLICY, createBaselineAnchor, type BaselinePolicy, type BaselineState } from './baseline';
import { createCueTracker, instantCues, lateralCues, mergeSideCues, type Cue } from './frontalCues';
import { LATERAL_POLICY, classifyView, measureLateral, measureSidePlumb, nearSide, sideAnchor, viewRatio, type LateralMetrics, type SidePlumb, type ViewKind } from '../biomechanics/lateral';

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
/**
 * Camera-view smoothing (view-hold-v1): a new view (frontal / side / oblique) is adopted only after it
 * persists this long, so a momentary shoulder-width dip (hands crossing, a small turn, landmark jitter)
 * does not flash "too oblique" for a single frame. Provisional.
 */
export const VIEW_HOLD_MS = 600;
/**
 * Uploaded video: the camera does not move, so one view is decided for the whole clip when at least
 * this share of usable samples agree (whole-video-view-v1). Mixed clips (person really turns) fall
 * back to the 600 ms hold per sample.
 */
export const WHOLE_VIDEO_VIEW_MIN_SHARE = 0.6;
/**
 * oblique-reference-v2: oblique views (shoulder/torso ratio between the side and frontal limits) are
 * still checked and labelled reference-only: closer to frontal (ratio ≥ OBLIQUE_SPLIT_RATIO) with the
 * frontal checks, closer to side with the side checks. On by default; the user can turn it off.
 */
export const OBLIQUE_MIN_SHOULDER_RATIO = LATERAL_POLICY.sideMaxRatio;
export const OBLIQUE_SPLIT_RATIO = (LATERAL_POLICY.sideMaxRatio + LATERAL_POLICY.frontalMinRatio) / 2;
/**
 * Side-view baseline lock (side-ankle-baseline-lock-v1, 2026-11-24 team decision): a vertical line through the
 * near ankle (≈ lateral malleolus) locked like the frontal line — near knee straight (flexion proxy ≤ 20°)
 * and ankle still for about a second; redrawn only when the foot clearly moves. In this policy the
 * "HipWidths" fields are measured in SHANK lengths (≈ 2 hip widths): lock tolerance 0.08 (frontal 0.15),
 * relock distance 0.2 (frontal 0.35). Provisional.
 */
export const SIDE_BASELINE_POLICY: BaselinePolicy = { ...BASELINE_POLICY, version: 'side-ankle-baseline-lock-v1', lockToleranceHipWidths: 0.08, relockDistanceHipWidths: 0.2 };
const SEARCHING: BaselineState = { state: 'searching', x: null, heelY: null, lockedAtMs: null };
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
  /** View decided once for the whole clip (fixed camera), or null when the clip is mixed. */
  clipView: ViewKind | null;
  /**
   * True when an oblique view is being checked as if it were frontal because the user turned on
   * "oblique as reference" (oblique-reference-v1). Numbers are 2D projections: reference only.
   */
  approximate: boolean;
  /** The line was drawn before but the feet moved or tracking paused: waiting for a new standing lock. */
  relocking: boolean;
  /** Side view only: vertical line through the near ankle (≈ lateral malleolus); 'searching' otherwise. */
  sideBaseline: BaselineState;
  /** Gated ear/shoulder/hip offsets from the side baseline (shank lengths, + = forward); null unless side view. */
  sidePlumb: SidePlumb | null;
  /** How the side baseline was found, as for `calibration`. */
  sideCalibration: 'standing-lock' | 'whole-video' | null;
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
export function frontalTimeline(samples: readonly Sample[], width: number, height: number, source: BaselineSource = 'standing-trunk', obliqueAsFrontal = false): FrontalFrame[] {
  const ratio = obliqueAsFrontal ? OBLIQUE_MIN_SHOULDER_RATIO : FRONTAL_POLICY.minFrontalShoulderRatio;
  const offline = offlineCalibration(samples, width, height, source, ratio);
  const anchor = createBaselineAnchor();
  const sideLock = createBaselineAnchor(SIDE_BASELINE_POLICY);
  const offlineSide = offlineSideCalibration(samples, width, height);
  let sideLiveOnly = false;
  const clipView = wholeVideoView(samples, width, height);
  const clipRatio = clipView === 'oblique' ? uprightMedianRatio(samples, width, height) : null;
  let stableView: ViewKind | null = null;
  let pendingView: { view: ViewKind; since: number } | null = null;
  const tracker = createCueTracker();
  let standingBuf: { timeMs: number; m: FrontalMetrics }[] = [];
  let neutral: Neutral | null = null;
  let lockedAt: number | null = null;
  // Once this person had a live standing lock (or tracking was locked for identity), the whole-video
  // baseline is never used again: after the feet move or a pause, the line waits for a new standing lock.
  let liveOnly = false;
  return [...samples].sort((a, b) => a.sourceTimeMs - b.sourceTimeMs).map(s => {
    const rejected = s.review !== undefined && s.review.label !== 'correct-target';
    const usable = !rejected && s.tracking.accepted;
    // Identity lock (possible person change): forget the standing reference entirely.
    if (s.tracking.state === 'MANUAL_REVIEW_REQUIRED') { anchor.reset(); standingBuf = []; neutral = null; lockedAt = null; liveOnly = true; sideLock.reset(); sideLiveOnly = true; }
    const frame = usable ? frontalFrame(s.landmarks, width, height, ratio) : null;
    const heel = usable ? heelMidpoint(s.landmarks, width, height) : null;
    const f = frame && typeof frame !== 'string' ? frame : null;
    const h = heel && typeof heel !== 'string' ? heel : null;
    const knee = { left: flexionProxy(s.left), right: flexionProxy(s.right) };
    const standing = knee.left !== null && knee.right !== null && Math.max(knee.left, knee.right) <= STANDING_MAX_KNEE_FLEXION_DEG;
    const centerX = source === 'heel-midpoint' ? h?.x ?? null : f ? (f.shoulderMid.x + f.hipMid.x) / 2 : null;
    const live = anchor.update({ timeMs: s.sourceTimeMs, heel: h, hipWidthPx: f?.hipWidth ?? null, centerX, standing });
    const liveRaw = gated(measureFrontal(s.landmarks, width, height, live.x, ratio), s);
    if (usable && standing) standingBuf = [...standingBuf.filter(b => s.sourceTimeMs - b.timeMs <= 1000), { timeMs: s.sourceTimeMs, m: liveRaw }];
    if (live.state !== 'locked') { neutral = null; lockedAt = null; }
    else if (live.lockedAtMs !== lockedAt) { lockedAt = live.lockedAtMs; neutral = neutralFrom(standingBuf.map(b => b.m)); }
    if (live.state === 'locked') liveOnly = true;
    const useOffline = live.state !== 'locked' && offline !== null && !liveOnly;
    const baseline = useOffline ? offline.baseline : live;
    const raw = useOffline ? gated(measureFrontal(s.landmarks, width, height, offline.baseline.x, ratio), s) : liveRaw;
    const rel = relative(raw, useOffline ? offline.neutral : neutral);
    // Feet moved away from the locked line: the line is about to be redrawn, so no shift/head prompts against it.
    const metrics = !useOffline && anchor.away() ? { ...rel, shift: blocked('baseline-pending'), head: blocked('baseline-pending') } : rel;
    const calibration = baseline.state !== 'locked' ? null : useOffline ? 'whole-video' as const : 'standing-lock' as const;
    const rawView = usable ? classifyView(s.landmarks, width, height) : null;
    if (rawView !== null) {
      if (stableView === null || rawView === stableView) { stableView = rawView; pendingView = null; }
      else {
        if (pendingView?.view !== rawView) pendingView = { view: rawView, since: s.sourceTimeMs };
        if (s.sourceTimeMs - pendingView.since >= VIEW_HOLD_MS) { stableView = rawView; pendingView = null; }
      }
    }
    const detected = usable && rawView !== null ? clipView ?? stableView : null;
    const approximate = obliqueAsFrontal && detected === 'oblique';
    // A fixed-camera oblique clip uses one ratio for the whole clip, so the check type does not flip.
    const r = approximate ? clipRatio ?? viewRatio(s.landmarks, width, height) : null;
    const view = approximate ? (r !== null && r < OBLIQUE_SPLIT_RATIO ? 'side' : 'frontal') : detected;
    let lateral: LateralMetrics | null = null;
    if (view === 'side') {
      const m = measureLateral(s.landmarks, width, height);
      const reason = gateReason(s.tracking, [m.side]);
      lateral = reason ? { side: m.side, kneeForward: blocked(reason), trunkLean: blocked(reason), tibiaLean: blocked(reason) } : m;
    }
    // Side baseline: fed only in a side view so a frontal clip never locks it (no observation → lost after 2 s).
    let sideBaseline = SEARCHING, sidePlumb: SidePlumb | null = null, sideCalibration: FrontalFrame['sideCalibration'] = null;
    if (usable && view === 'side') {
      const near = lateral?.side ?? nearSide(s.landmarks);
      const a = sideAnchor(s.landmarks, width, height, near);
      const ok = typeof a === 'string' ? null : a;
      const nearFlex = knee[near];
      const live = sideLock.update({ timeMs: s.sourceTimeMs, heel: ok?.ankle ?? null, hipWidthPx: ok?.shank ?? null, centerX: ok?.ankle.x ?? null, standing: nearFlex !== null && nearFlex <= STANDING_MAX_KNEE_FLEXION_DEG });
      if (live.state === 'locked') sideLiveOnly = true;
      const useOfflineSide = live.state !== 'locked' && offlineSide !== null && !sideLiveOnly;
      sideBaseline = useOfflineSide ? offlineSide : live;
      sideCalibration = sideBaseline.state !== 'locked' ? null : useOfflineSide ? 'whole-video' : 'standing-lock';
      // Foot away from the line (about to relock, or not where the whole-video line was made): no offsets against it.
      // The whole-video line is a median over the clip, so it only counts while the ankle is within the lock tolerance of it.
      const footAway = useOfflineSide ? ok !== null && sideBaseline.state === 'locked' && Math.abs(ok.ankle.x - sideBaseline.x) / ok.shank > SIDE_BASELINE_POLICY.lockToleranceHipWidths : sideLock.away();
      const reason = gateReason(s.tracking, [near]) ?? (footAway ? 'baseline-pending' as const : null);
      const m = measureSidePlumb(s.landmarks, width, height, near, sideBaseline.x);
      sidePlumb = reason ? { ear: blocked(reason), shoulder: blocked(reason), hip: blocked(reason) } : m;
    } else sideLock.update({ timeMs: s.sourceTimeMs, heel: null, hipWidthPx: null });
    const instant = !usable ? [] : view === 'frontal' ? instantCues(metrics, knee) : view === 'side' && lateral ? lateralCues(lateral, knee[lateral.side], sidePlumb) : [];
    // Side prompts are debounced separately, then merged for display, so adding the trunk lean does not restart the hold.
    const tracked = tracker.update(s.sourceTimeMs, instant);
    const cues = view === 'side' ? mergeSideCues(tracked) : tracked;
    return { sampleIndex: s.sampleIndex, tracked: usable, baseline, metrics, neutral: useOffline ? offline.neutral : neutral, view, lateral, cues, calibration, clipView, approximate, relocking: liveOnly && baseline.state !== 'locked', sideBaseline, sidePlumb, sideCalibration };
  });
}

/**
 * Whole-video standing calibration: the most upright usable frontal samples (both knee flexion
 * proxies ≤ 20°, or ≤ 35° when fewer than 3 exist), line at the median centre, neutral tilts = mean
 * of those samples measured against that line. Null when no such samples exist.
 */
function offlineCalibration(samples: readonly Sample[], width: number, height: number, source: BaselineSource, ratio: number = FRONTAL_POLICY.minFrontalShoulderRatio): { baseline: Extract<BaselineState, { state: 'locked' }>; neutral: Neutral | null } | null {
  const pool = samples.flatMap(s => {
    if ((s.review !== undefined && s.review.label !== 'correct-target') || !s.tracking.accepted) return [];
    const v = classifyView(s.landmarks, width, height);
    if (v !== 'frontal' && !(ratio < FRONTAL_POLICY.minFrontalShoulderRatio && v === 'oblique')) return [];
    const f = frontalFrame(s.landmarks, width, height, ratio), h = heelMidpoint(s.landmarks, width, height);
    const l = flexionProxy(s.left), r = flexionProxy(s.right);
    if (typeof f === 'string' || typeof h === 'string' || l === null || r === null) return [];
    const cx = source === 'heel-midpoint' ? h.x : (f.shoulderMid.x + f.hipMid.x) / 2;
    return [{ s, cx, heelX: h.x, heelY: h.y, hipWidth: f.hipWidth, flex: Math.max(l, r) }];
  });
  let chosen = pool.filter(p => p.flex <= STANDING_MAX_KNEE_FLEXION_DEG);
  if (chosen.length < OFFLINE_CALIBRATION.minSamples) chosen = pool.filter(p => p.flex <= OFFLINE_CALIBRATION.relaxedMaxKneeFlexionDeg);
  if (chosen.length < OFFLINE_CALIBRATION.minSamples) return null;
  const median = (v: number[]) => { const a = [...v].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]!; };
  // The person stood in more than one place (stepped sideways): one whole-video line would be wrong for part of the clip.
  const heelXs = chosen.map(c => c.heelX), scale = median(chosen.map(c => c.hipWidth));
  if ((Math.max(...heelXs) - Math.min(...heelXs)) / scale > BASELINE_POLICY.relockDistanceHipWidths) return null;
  const x = median(chosen.map(c => c.cx)), heelY = median(chosen.map(c => c.heelY));
  const neutral = neutralFrom(chosen.map(c => gated(measureFrontal(c.s.landmarks, width, height, x, ratio), c.s)));
  return { baseline: { state: 'locked', x, heelY, lockedAtMs: chosen[0]!.s.sourceTimeMs }, neutral };
}

/**
 * Whole-video side calibration (fallback when the person never stood still for a second): the most
 * upright usable side-view samples (near knee flexion proxy ≤ 20°, or ≤ 35° when fewer than 3 exist),
 * line at their median ankle x. Null when there are too few, or no single stance holds most of them.
 */
function offlineSideCalibration(samples: readonly Sample[], width: number, height: number): Extract<BaselineState, { state: 'locked' }> | null {
  const pool = samples.flatMap(s => {
    if ((s.review !== undefined && s.review.label !== 'correct-target') || !s.tracking.accepted) return [];
    if (classifyView(s.landmarks, width, height) !== 'side') return [];
    const near = nearSide(s.landmarks);
    const a = sideAnchor(s.landmarks, width, height, near), flex = flexionProxy(near === 'left' ? s.left : s.right);
    if (typeof a === 'string' || flex === null || gateReason(s.tracking, [near])) return [];
    return [{ s, x: a.ankle.x, y: a.ankle.y, shank: a.shank, flex }];
  });
  let chosen = pool.filter(p => p.flex <= STANDING_MAX_KNEE_FLEXION_DEG);
  if (chosen.length < OFFLINE_CALIBRATION.minSamples) chosen = pool.filter(p => p.flex <= OFFLINE_CALIBRATION.relaxedMaxKneeFlexionDeg);
  if (chosen.length < OFFLINE_CALIBRATION.minSamples) return null;
  const median = (v: number[]) => { const a = [...v].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]!; };
  // Line at the median standing ankle position; the foot drifting a little over a long clip is normal, so the
  // line needs most (≥ 60%) standing samples within the lock tolerance of it (the same 0.08 shank used for measuring
  // against it), otherwise there is no single stance.
  const x = median(chosen.map(c => c.x)), shank = median(chosen.map(c => c.shank));
  const near = chosen.filter(c => Math.abs(c.x - x) / shank <= SIDE_BASELINE_POLICY.lockToleranceHipWidths);
  if (near.length / chosen.length < WHOLE_VIDEO_VIEW_MIN_SHARE) return null;
  return { state: 'locked', x, heelY: median(near.map(c => c.y)), lockedAtMs: Math.min(...near.map(c => c.s.sourceTimeMs)) };
}

/** The camera view most usable samples agree on, or null when no view reaches the required share. */
function wholeVideoView(samples: readonly Sample[], width: number, height: number): ViewKind | null {
  // Judge the view while the person is upright: in a deep squat the trunk leans forward, looks shorter
  // in the image and makes a diagonal camera look frontal. Fall back to all samples if too few are upright.
  const usable = samples.flatMap(s => {
    if ((s.review !== undefined && s.review.label !== 'correct-target') || !s.tracking.accepted) return [];
    const v = classifyView(s.landmarks, width, height);
    const l = flexionProxy(s.left), r = flexionProxy(s.right);
    return v === null ? [] : [{ v, upright: l !== null && r !== null && Math.max(l, r) <= OFFLINE_CALIBRATION.relaxedMaxKneeFlexionDeg }];
  });
  const upright = usable.filter(u => u.upright);
  const pool = upright.length >= OFFLINE_CALIBRATION.minSamples ? upright : usable;
  const counts = new Map<ViewKind, number>();
  const total = pool.length;
  for (const { v } of pool) counts.set(v, (counts.get(v) ?? 0) + 1);
  for (const [v, n] of counts) if (total > 0 && n / total >= WHOLE_VIDEO_VIEW_MIN_SHARE) return v;
  return null;
}

/** Median shoulder/torso ratio of the upright usable samples (all usable samples if too few are upright). */
function uprightMedianRatio(samples: readonly Sample[], width: number, height: number): number | null {
  const usable = samples.flatMap(s => {
    if ((s.review !== undefined && s.review.label !== 'correct-target') || !s.tracking.accepted) return [];
    const r = viewRatio(s.landmarks, width, height);
    const l = flexionProxy(s.left), rt = flexionProxy(s.right);
    return r === null ? [] : [{ r, upright: l !== null && rt !== null && Math.max(l, rt) <= OFFLINE_CALIBRATION.relaxedMaxKneeFlexionDeg }];
  });
  const upright = usable.filter(u => u.upright);
  const pool = (upright.length >= OFFLINE_CALIBRATION.minSamples ? upright : usable).map(u => u.r).sort((a, b) => a - b);
  return pool.length ? pool[Math.floor(pool.length / 2)]! : null;
}

/** Mean standing tilt per metric; a metric without any valid standing value stays uncalibrated. */
function neutralFrom(ms: FrontalMetrics[]): Neutral | null {
  const out = {} as Neutral;
  for (const k of TILTS) {
    const vals = ms.map(m => m[k]).filter(v => v.valid).map(v => v.value!);
    // Head out of frame while standing: no head neutral (head check stays N/A), the rest still calibrates.
    if (!vals.length && k === 'head') { out[k] = Number.NaN; continue; }
    if (!vals.length) return null;
    out[k] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  return out;
}
function relative(m: FrontalMetrics, n: Neutral | null): FrontalMetrics {
  const out = { ...m };
  for (const k of TILTS) {
    const v = m[k];
    out[k] = !v.valid ? v : n === null ? blocked('baseline-pending') : Number.isNaN(n[k]) ? blocked('out-of-frame') : { valid: true, value: v.value - n[k], invalidReasons: [] };
  }
  return out;
}
