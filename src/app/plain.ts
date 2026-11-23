import type { AngleValue, InvalidReason, ScalarValue } from '../domain/measurement';

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

export function plainReason(value: AngleValue | ScalarValue | undefined, hasSample: boolean): string {
  if (!hasSample) return '這一格沒有分析結果';
  if (!value) return '此分析版本沒有此指標，請重新分析';
  if (value.valid) return '';
  return PLAIN[value.invalidReasons[0]] ?? '這一格看不清楚';
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
