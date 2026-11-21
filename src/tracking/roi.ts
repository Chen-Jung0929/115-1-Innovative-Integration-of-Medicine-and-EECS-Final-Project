import type { Roi } from '../domain/tracking';
import type { Landmark } from '../domain/analysis';
export function checkedRoi(roi: Roi, width: number, height: number): Roi {
  if (![roi.x,roi.y,roi.width,roi.height,width,height].every(Number.isFinite) || width <= 0 || height <= 0) throw new Error('ROI 尺寸必須為有限正值');
  const x = Math.round(roi.x), y = Math.round(roi.y), w = Math.round(roi.width), h = Math.round(roi.height);
  if (x < 0 || y < 0 || w < 32 || h < 32 || x + w > width || y + h > height) throw new Error('ROI 必須在來源畫面內，寬高至少 32 像素');
  return {x, y, width:w, height:h};
}
export function fromCrop(points: readonly Landmark[], roi: Roi, width: number, height: number): Landmark[] {
  return points.map(p => ({ ...p, x: (roi.x + p.x * roi.width) / width, y: (roi.y + p.y * roi.height) / height }));
}
