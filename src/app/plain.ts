import type { AngleValue, InvalidReason, ScalarValue } from '../domain/measurement';
import type { Sample } from '../domain/analysis';

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

/** `notice`: when the whole person was not tracked, say why (see trackingNotices) instead of a generic code word. */
export function plainReason(value: AngleValue | ScalarValue | undefined, hasSample: boolean, notice?: TrackingNotice | null): string {
  if (!hasSample) return '這一格沒有分析結果';
  if (!value) return '此分析版本沒有此指標，請重新分析';
  if (value.valid) return '';
  const first = value.invalidReasons[0];
  if (notice && (first === 'target-lost' || first === 'identity-uncertain')) return TRACKING_TEXT[notice.cause].problem;
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
 * Why the person in a sample was not tracked, in plain words with something to do about it
 * (tracking-notice-v1, ADR-082). One place for every "not tracked" message on screen; the raw
 * tracking codes stay in the research panel, CSV and JSON.
 *
 * Decided from what the sample actually shows, in this order: human review, more than one person,
 * no pose at all, body cut by the frame edge, unclear torso points, then the tracker's own state.
 * MediaPipe usually finds NO pose when the head is out of frame (its detector starts from the face),
 * so "no person" also tells the user to get the head in.
 */
export type TrackingCause = 'rejected' | 'others' | 'no-person' | 'too-close' | 'head-cut' | 'feet-cut' | 'side-cut' | 'unclear' | 'lost-track' | 'confirming';
export type NoticeMode = 'video' | 'live';
interface CauseText { problem: string; video: string; live: string }
export const TRACKING_TEXT: Record<TrackingCause, CauseText> = {
  'rejected': { problem: '已標記為不是個案', video: '這一格不判斷', live: '這一格不判斷' },
  'others': { problem: '畫面有其他人', video: '只留個案一人入鏡', live: '只留個案一人入鏡' },
  'no-person': { problem: '偵測不到人', video: '請讓頭到腳都入鏡（含頭頂）', live: '請讓頭到腳都入鏡（含頭頂）' },
  'too-close': { problem: '人離鏡頭太近', video: '手機往後移，頭到腳都入鏡', live: '請往後退，頭到腳都入鏡' },
  'head-cut': { problem: '頭沒有完整入鏡', video: '手機往後移，讓頭入鏡', live: '請往後退，讓頭入鏡' },
  'feet-cut': { problem: '腳沒有入鏡', video: '手機往後移或放低', live: '請往後退或把手機放低' },
  'side-cut': { problem: '身體超出畫面邊緣', video: '請站到畫面中央', live: '請站到畫面中央' },
  'unclear': { problem: '看不清楚身體', video: '光線要足、軀幹別被遮住', live: '光線要足、軀幹別被遮住' },
  'lost-track': { problem: '追蹤中斷', video: '個案需一直留在畫面內', live: '請一直留在畫面內' },
  'confirming': { problem: '確認是同一人中', video: '請稍候', live: '請稍停一下' },
};
/** Landmarks this close to the frame edge (normalized) count as cut by the edge. */
const EDGE = 0.02;
const seen = (p: { x: number; y: number; visibility: number } | undefined) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.visibility >= 0.5;

export function trackingCause(sample: Pick<Sample, 'landmarks' | 'tracking' | 'review'>): TrackingCause {
  if (sample.review && sample.review.label !== 'correct-target') return 'rejected';
  const t = sample.tracking;
  if (t.reasons.some(r => r.startsWith('ambiguous'))) return 'others';
  const pts = sample.landmarks;
  if (!pts.length) return 'no-person';
  const at = (i: number) => pts[i];
  const top = [0, 7, 8].some(i => { const p = at(i); return !!p && Number.isFinite(p.y) && p.y < 0; })
    || [11, 12].some(i => { const p = at(i); return !!p && Number.isFinite(p.y) && p.y < EDGE; });
  const feet = [27, 28].map(at);
  const bottom = feet.some(p => !!p && Number.isFinite(p.y) && p.y > 1) || feet.every(p => !seen(p));
  if (top && bottom) return 'too-close';
  if (top) return 'head-cut';
  if (bottom) return 'feet-cut';
  if ([11, 12, 23, 24, 25, 26].some(i => { const p = at(i); return !!p && Number.isFinite(p.x) && (p.x < 0 || p.x > 1); })) return 'side-cut';
  if ([11, 12, 23, 24].some(i => !seen(at(i)))) return 'unclear';
  if ((t.state === 'UNCERTAIN' && t.reasons.includes('identity-recovery-confirmation-pending')) || t.reasons.includes('controlled-single-recovery-pending')) return 'confirming';
  return 'lost-track';
}

export interface TrackingNotice { cause: TrackingCause; /** Tracking stopped for the rest of this recording (identity lock). */ locked: boolean; text: string }
export function noticeText(cause: TrackingCause, locked: boolean, mode: NoticeMode): string {
  const t = TRACKING_TEXT[cause];
  if (locked && cause !== 'rejected') return `${t.problem}，之後暫停判斷`;
  return `${t.problem}：${t[mode]}`;
}
/** Full sentence for the "paused" banner: what happened, why it stays paused, what to do. */
export function lockedBannerText(cause: TrackingCause, mode: NoticeMode): string {
  const t = TRACKING_TEXT[cause];
  const action = cause === 'confirming' || cause === 'rejected' ? TRACKING_TEXT['lost-track'][mode] : t[mode];
  return `${t.problem}，為避免認錯人，之後的畫面暫停判斷。${mode === 'video' ? '重拍時' : ''}${action}。`;
}

/**
 * A notice must not flicker at the sampling rate (tracking-notice-hold-v1): it appears at once on an
 * untracked sample (never claim "OK" for a frame we could not check), but a DIFFERENT cause, or going
 * back to no notice, is adopted only after it lasted NOTICE_HOLD_MS. Once the tracker locks (manual
 * review required), the cause shown at that moment is kept for the rest of the recording, because
 * later frames may look fine while measurement stays paused.
 */
export const NOTICE_HOLD_MS = 500;
/** Causal (past-only) hold, shared by uploaded videos and the live camera. */
export function createNoticeHold(mode: NoticeMode = 'video') {
  let shown: TrackingNotice | null = null;
  let pending = null as { key: string; since: number } | null;
  let frozen: TrackingCause | null = null;
  return {
    update(s: Pick<Sample, 'landmarks' | 'tracking' | 'review' | 'sourceTimeMs'>): TrackingNotice | null {
      const locked = s.tracking.state === 'MANUAL_REVIEW_REQUIRED';
      const rejected = !!s.review && s.review.label !== 'correct-target';
      let raw: TrackingNotice | null = null;
      if (rejected || !s.tracking.accepted) {
        let cause = trackingCause(s);
        if (locked && !rejected) {
          frozen ??= shown && shown.cause !== 'confirming' ? shown.cause : cause === 'confirming' ? 'lost-track' : cause;
          cause = frozen;
        }
        raw = { cause, locked: locked && !rejected, text: noticeText(cause, locked && !rejected, mode) };
      }
      const key = raw ? raw.text : '';
      if (shown === null) { shown = raw; pending = null; }
      else if (key === shown.text) pending = null;
      else {
        if (pending?.key !== key) pending = { key, since: s.sourceTimeMs };
        if (s.sourceTimeMs - pending.since >= NOTICE_HOLD_MS || (raw?.locked && !shown.locked)) { shown = raw; pending = null; }
      }
      return shown;
    },
  };
}
export function trackingNotices(samples: readonly Sample[], mode: NoticeMode = 'video'): Map<number, TrackingNotice | null> {
  const hold = createNoticeHold(mode);
  return new Map([...samples].sort((a, b) => a.sourceTimeMs - b.sourceTimeMs).map(s => [s.sampleIndex, hold.update(s)] as const));
}
