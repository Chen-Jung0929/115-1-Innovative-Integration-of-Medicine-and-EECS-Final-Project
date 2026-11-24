import type { AngleValue, InvalidReason, ScalarValue } from '../domain/measurement';
import type { Landmark, Sample } from '../domain/analysis';
import { feetCutOff, headCutOff } from '../biomechanics/frontal';

/** Short, plain-language reason for a missing value; the exact codes stay in the detail text and exports. */
const PLAIN: Record<InvalidReason, string> = {
  'missing-landmark': '看不到這個關節',
  'low-confidence': '這個關節看不清楚',
  'non-finite': '無法計算',
  'target-lost': '沒有追到個案',
  'identity-uncertain': '還在確認是不是同一人',
  'out-of-range-confidence': '點位資料異常',
  'degenerate-geometry': '點位重疊，無法計算',
  'out-of-frame': '關節在畫面外',
  'unsupported-view': '這個角度不適用（請換正面或側面拍）',
  'joint-landmark-invalid': '這個關節位置不合理',
  'joint-temporal-discontinuity': '點位突然跳動',
  'joint-recovery-pending': '剛恢復追蹤，確認中',
  'baseline-pending': '請先站直不動約 1 秒',
};

const FEET_JOINT_REASONS = new Set<InvalidReason>(['joint-landmark-invalid', 'out-of-frame', 'low-confidence', 'missing-landmark', 'joint-temporal-discontinuity', 'joint-recovery-pending']);
/** `notice`: when the whole person was not tracked, say why (see trackingNotices) instead of a generic code word. */
export function plainReason(value: AngleValue | ScalarValue | undefined, hasSample: boolean, notice?: TrackingNotice | null): string {
  if (!hasSample) return '這一格沒有分析結果';
  if (!value) return '此分析版本沒有此指標，請重新分析';
  if (value.valid) return '';
  const first = value.invalidReasons[0];
  if (notice?.blocking && (first === 'target-lost' || first === 'identity-uncertain')) return TRACKING_TEXT[notice.cause].problem;
  // Cut-off feet explain the invalid hip/knee points better than a generic joint word.
  if (notice && !notice.blocking && notice.cause !== 'head-cut' && FEET_JOINT_REASONS.has(first)) return TRACKING_TEXT[notice.cause].problem;
  return PLAIN[first] ?? '這一格看不清楚';
}

/** Detailed status line kept for researchers (codes are what CSV / JSON contain). */
export function qcStatus(value: AngleValue | ScalarValue | undefined, hasSample: boolean): string {
  if (!hasSample) return '無對應取樣';
  if (!value) return '此分析版本沒有此指標，請重新分析';
  return value.valid ? '自動 QC 通過（身分仍待人工確認）' : `無效（${value.invalidReasons.join(', ')}）`;
}

export const showAngle = (angle: AngleValue | undefined): string => angle?.valid ? `${angle.rawAngleDeg.toFixed(1)}°` : 'N/A';

/** Big number in the list: flexion (standing ≈ 0°, deeper = larger), 自訂 clinical convention = 180° − image-plane inner angle. */
export const showFlexion = (angle: AngleValue | undefined, toFlexion: (a: AngleValue) => number | null): string => {
  const f = angle?.valid ? toFlexion(angle) : null;
  return f === null || f === undefined ? 'N/A' : `${f.toFixed(0)}°`;
};

/**
 * Why the person in a sample was not tracked, or what about the framing makes a check impossible, in
 * plain words with something to do about it (tracking-notice-v2, ADR-082/085). One place for every such
 * message; the raw tracking codes stay in the research panel, CSV and JSON.
 *
 * Untracked samples (blocking notice), decided in this order: human review, more than one person, no
 * pose at all, body cut by the frame edge, unclear torso points, then the tracker's own state.
 * Tracked samples can still carry a non-blocking framing hint (head or feet cut off), shown next to the
 * posture prompts and instead of "stand still" when the cut feet keep the baseline from locking.
 */
export type TrackingCause = 'rejected' | 'others' | 'teleport' | 'no-person' | 'too-close' | 'head-cut' | 'feet-cut' | 'side-cut' | 'unclear' | 'lost-track' | 'confirming';
export type NoticeMode = 'video' | 'live';
interface CauseText { problem: string; video: string; live: string }
export const TRACKING_TEXT: Record<TrackingCause, CauseText> = {
  'rejected': { problem: '已標記為不是個案', video: '這一格不判斷', live: '這一格不判斷' },
  'others': { problem: '畫面有其他人', video: '只留個案一人入鏡', live: '只留個案一人入鏡' },
  'teleport': { problem: '畫面跳動或換了人', video: '手機固定、同一人重拍', live: '手機固定，只留個案' },
  'no-person': { problem: '偵測不到人', video: '請讓頭到腳都入鏡（含頭頂）', live: '請讓頭到腳都入鏡（含頭頂）' },
  'too-close': { problem: '人離鏡頭太近', video: '手機往後移，頭到腳都入鏡', live: '請往後退，頭到腳都入鏡' },
  'head-cut': { problem: '頭沒有完整入鏡', video: '手機往後移，讓頭入鏡', live: '請往後退，讓頭入鏡' },
  'feet-cut': { problem: '腳沒有完整入鏡', video: '手機往後移，讓腳跟入鏡', live: '請往後退，讓腳跟入鏡' },
  'side-cut': { problem: '身體超出畫面邊緣', video: '請站到畫面中央', live: '請站到畫面中央' },
  'unclear': { problem: '看不清楚身體', video: '光線要足、軀幹別被遮住', live: '光線要足、軀幹別被遮住' },
  'lost-track': { problem: '追蹤中斷', video: '個案需一直留在畫面內', live: '請一直留在畫面內' },
  'confirming': { problem: '無法確認是同一人', video: '這一格暫不判斷', live: '請稍停一下' },
};
/** Landmarks this close to the frame edge (normalized) count as cut by the edge. */
const EDGE = 0.02;
const seen = (p: { x: number; y: number; visibility: number } | undefined) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.visibility >= 0.5;

/** Framing problem visible even when the person is tracked: head or feet cut by the frame edge. */
export function framingHint(landmarks: readonly Landmark[], width = 1, height = 1): 'head-cut' | 'feet-cut' | 'too-close' | null {
  if (!landmarks.length) return null;
  const head = headCutOff(landmarks, width, height), feet = feetCutOff(landmarks);
  return head && feet ? 'too-close' : head ? 'head-cut' : feet ? 'feet-cut' : null;
}

export function trackingCause(sample: Pick<Sample, 'landmarks' | 'tracking' | 'review'>, width = 1, height = 1): TrackingCause {
  if (sample.review && sample.review.label !== 'correct-target') return 'rejected';
  const t = sample.tracking;
  if (t.reasons.some(r => r.startsWith('ambiguous'))) return 'others';
  // Feet jumped to a new place / stance in one step (hard cut, person swap): ADR-086.
  if (t.reasons.some(r => r.startsWith('feet-teleport'))) return 'teleport';
  const pts = sample.landmarks;
  if (!pts.length) return 'no-person';
  const at = (i: number) => pts[i];
  const top = headCutOff(pts, width, height) || [11, 12].some(i => { const p = at(i); return !!p && Number.isFinite(p.y) && p.y < EDGE; });
  const ankles = [27, 28].map(at);
  const bottom = feetCutOff(pts) || ankles.every(p => !seen(p));
  if (top && bottom) return 'too-close';
  if (top) return 'head-cut';
  if (bottom) return 'feet-cut';
  if ([11, 12, 23, 24, 25, 26].some(i => { const p = at(i); return !!p && Number.isFinite(p.x) && (p.x < 0 || p.x > 1); })) return 'side-cut';
  if ([11, 12, 23, 24].some(i => !seen(at(i)))) return 'unclear';
  if ((t.state === 'UNCERTAIN' && t.reasons.includes('identity-recovery-confirmation-pending')) || t.reasons.some(r => r.endsWith('recovery-pending'))) return 'confirming';
  return 'lost-track';
}

export interface TrackingNotice {
  cause: TrackingCause;
  /** False for a framing hint on a tracked sample: posture prompts still show. */
  blocking: boolean;
  /** Identity lock (manual review required); `sinceMs` = when this lock started. */
  locked: boolean;
  sinceMs?: number;
  text: string;
}
export function noticeText(cause: TrackingCause, locked: boolean, mode: NoticeMode): string {
  const t = TRACKING_TEXT[cause];
  if (locked && cause !== 'rejected') return `${t.problem}，暫停判斷`;
  return `${t.problem}：${t[mode]}`;
}
/** Full sentence for the "paused" banner: since when, why, what to do. */
export function lockedBannerText(cause: TrackingCause, mode: NoticeMode, sinceMs?: number): string {
  const t = TRACKING_TEXT[cause];
  const action = cause === 'confirming' || cause === 'rejected' ? TRACKING_TEXT['lost-track'][mode] : t[mode];
  const since = sinceMs === undefined ? '' : `從 ${(sinceMs / 1000).toFixed(1)} 秒起`;
  return mode === 'video'
    ? `${since}無法確定是同一人（${t.problem}），暫停判斷。畫面上只剩一個人、連續看清楚約 1 秒（或站直不動）後會自動重新開始一段。重拍時${action}。`
    : `${since}無法確定是同一人（${t.problem}），暫停判斷，數字不顯示。${action}。`;
}

/**
 * A notice must not flicker at the sampling rate (tracking-notice-hold-v1): a blocking notice appears at
 * once on an untracked sample (never claim "OK" for a frame we could not check), but a DIFFERENT notice,
 * or going back to none, is adopted only after it lasted NOTICE_HOLD_MS. During an identity lock the cause
 * shown when it started is kept until the lock clears.
 */
export const NOTICE_HOLD_MS = 500;
/** Causal (past-only) hold, shared by uploaded videos and the live camera. */
export function createNoticeHold(mode: NoticeMode = 'video', width = 1, height = 1) {
  let shown: TrackingNotice | null = null;
  let pending = null as { key: string; since: number } | null;
  let frozen: { cause: TrackingCause; since: number } | null = null;
  return {
    update(s: Pick<Sample, 'landmarks' | 'tracking' | 'review' | 'sourceTimeMs'>): TrackingNotice | null {
      const locked = s.tracking.state === 'MANUAL_REVIEW_REQUIRED';
      const rejected = !!s.review && s.review.label !== 'correct-target';
      if (!locked) frozen = null;
      let raw: TrackingNotice | null = null;
      if (rejected || !s.tracking.accepted) {
        let cause = trackingCause(s, width, height);
        if (locked && !rejected) {
          frozen ??= { cause: shown && shown.cause !== 'confirming' ? shown.cause : cause === 'confirming' ? 'lost-track' : cause, since: s.sourceTimeMs };
          cause = frozen.cause;
        }
        const isLock = locked && !rejected;
        raw = { cause, blocking: true, locked: isLock, ...(isLock ? { sinceMs: frozen!.since } : {}), text: noticeText(cause, isLock, mode) };
      } else {
        const hint = framingHint(s.landmarks, width, height);
        if (hint) raw = { cause: hint, blocking: false, locked: false, text: noticeText(hint, false, mode) };
      }
      const key = raw ? `${raw.blocking}|${raw.text}` : '';
      const shownKey = shown ? `${shown.blocking}|${shown.text}` : '';
      if (shown === null || (raw?.blocking && !shown.blocking)) { shown = raw; pending = null; }
      else if (key === shownKey) pending = null;
      else {
        if (pending?.key !== key) pending = { key, since: s.sourceTimeMs };
        // A lock starting or ending (new segment, ADR-088) shows at once: no stale "paused" next to live numbers.
        if (s.sourceTimeMs - pending.since >= NOTICE_HOLD_MS || (raw?.locked && !shown.locked) || (shown.locked && !locked)) { shown = raw; pending = null; }
      }
      return shown;
    },
  };
}
export function trackingNotices(samples: readonly Sample[], mode: NoticeMode = 'video', width = 1, height = 1): Map<number, TrackingNotice | null> {
  const hold = createNoticeHold(mode, width, height);
  return new Map([...samples].sort((a, b) => a.sourceTimeMs - b.sourceTimeMs).map(s => [s.sampleIndex, hold.update(s)] as const));
}

/** Knee-to-toe-line values closer than this (hip widths) read as "on the line" (dead band, provisional; ADR-085). */
export const KNEE_TOE_ON_LINE = 0.1;
export function kneeToeValue(v: ScalarValue | undefined): string {
  if (!v?.valid) return 'N/A';
  const r = Math.round(v.value * 100) / 100;
  return r === 0 ? '0.00' : `${r > 0 ? '+' : ''}${r.toFixed(2)}`;
}
/** Note under 膝對腳尖線: direction with a dead band, or the real reason it is missing. */
export function kneeToeNote(v: ScalarValue | undefined, view: string | null | undefined, hasSample: boolean, notice?: TrackingNotice | null): string {
  if (v?.valid) return Math.abs(v.value) < KNEE_TOE_ON_LINE ? '膝蓋在腳尖線上' : v.value > 0 ? '膝蓋偏向內側（膝蓋內夾方向）' : '膝蓋在腳尖線外側';
  if (v && (v.invalidReasons[0] === 'unsupported-view' || view === 'side' || view === 'oblique')) return '只適用正面拍攝';
  return plainReason(v, hasSample, notice);
}
