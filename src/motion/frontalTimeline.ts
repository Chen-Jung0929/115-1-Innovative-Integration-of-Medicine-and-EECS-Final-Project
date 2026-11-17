import type { Sample } from '../domain/analysis';
import type { InvalidReason, ScalarValue } from '../domain/measurement';
import { frontalFrame, heelMidpoint, measureFrontal, type FrontalMetrics } from '../biomechanics/frontal';
import { flexionProxy } from '../biomechanics/knee';
import { gateReason } from '../tracking/gate';
import { createBaselineAnchor, type BaselineState } from './baseline';
import { createCueTracker, instantCues, type Cue } from './frontalCues';

export interface FrontalFrame {
  sampleIndex: number;
  baseline: BaselineState;
  metrics: FrontalMetrics;
  cues: Cue[];
}

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
export function frontalTimeline(samples: readonly Sample[], width: number, height: number): FrontalFrame[] {
  const anchor = createBaselineAnchor();
  const tracker = createCueTracker();
  return [...samples].sort((a, b) => a.sourceTimeMs - b.sourceTimeMs).map(s => {
    const rejected = s.review !== undefined && s.review.label !== 'correct-target';
    const usable = !rejected && s.tracking.accepted;
    const frame = usable ? frontalFrame(s.landmarks, width, height) : null;
    const heel = usable ? heelMidpoint(s.landmarks, width, height) : null;
    const baseline = anchor.update({
      timeMs: s.sourceTimeMs,
      heel: heel && typeof heel !== 'string' ? heel : null,
      hipWidthPx: frame && typeof frame !== 'string' ? frame.hipWidth : null,
    });
    const metrics = gated(measureFrontal(s.landmarks, width, height, baseline.x), s);
    const knee = { left: flexionProxy(s.left), right: flexionProxy(s.right) };
    const cues = tracker.update(s.sourceTimeMs, usable ? instantCues(metrics, knee) : []);
    return { sampleIndex: s.sampleIndex, baseline, metrics, cues };
  });
}
