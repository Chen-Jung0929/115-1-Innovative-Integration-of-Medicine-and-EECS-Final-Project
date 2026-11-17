import { useEffect, useRef, type ReactNode } from 'react';
import type { Sample } from '../domain/analysis';
import { FRONTAL_LANDMARKS as L, frontalFrame, headPoint } from '../biomechanics/frontal';
import { sourcePoint, type Point } from '../biomechanics/knee';
import type { BodyPart } from '../motion/frontalCues';
import type { FrontalFrame } from '../motion/frontalTimeline';

const BASE = '#ff5a36', LINE = '#ffd166', ALERT = '#ff2d55', TRUNK = '#5ab0ff';

/**
 * Draws the handout p.5 landmarks, the locked heel-midpoint baseline and the frontal check lines on
 * top of the video. Drawing only: every number comes from motion/frontalTimeline.ts.
 */
export function FrontalOverlay({ sample, frame, width, height }: { sample: Sample | undefined; frame: FrontalFrame | undefined; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (!sample || !frame || !sample.tracking.accepted || (sample.review && sample.review.label !== 'correct-target')) return;
    const unit = Math.max(2, width / 260);
    const hot = new Set<BodyPart>(frame.cues.flatMap(c => c.parts));
    const pt = (i: number): Point | null => { const p = sourcePoint(sample.landmarks, i, width, height); return typeof p === 'string' ? null : p; };
    const line = (a: Point, b: Point, color: string, w = unit, dash: number[] = []) => { ctx.setLineDash(dash); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]); };
    const dot = (p: Point, color: string, r = unit * 2.2) => { ctx.fillStyle = color; ctx.strokeStyle = '#101b1e'; ctx.lineWidth = unit * 0.6; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); };
    const extend = (a: Point, b: Point, k: number): [Point, Point] => { const dx = (b.x - a.x) * k, dy = (b.y - a.y) * k; return [{ x: a.x - dx, y: a.y - dy }, { x: b.x + dx, y: b.y + dy }]; };

    // Baseline: vertical line through the locked heel midpoint (handout p.5).
    const b = frame.baseline;
    if (b.state === 'locked') line({ x: b.x, y: 0 }, { x: b.x, y: Math.min(height, b.heelY + unit * 6) }, BASE, unit * 1.4);

    const f = frontalFrame(sample.landmarks, width, height);
    if (typeof f !== 'string') {
      const [s1, s2] = extend(f.ls, f.rs, 0.25); line(s1, s2, hot.has('shoulder') ? ALERT : LINE, unit);
      const [p1, p2] = extend(f.lh, f.rh, 0.25); line(p1, p2, hot.has('pelvis') ? ALERT : LINE, unit);
      line(f.hipMid, f.shoulderMid, hot.has('trunk') ? ALERT : TRUNK, unit, [unit * 3, unit * 2]);
      dot(f.shoulderMid, LINE, unit * 1.6); // ≈ 胸骨上緣
      dot(f.hipMid, LINE, unit * 1.6); // ≈ 恥骨聯合
    }
    // Toe plumb lines (handout p.11): vertical through each toe up to knee height.
    for (const [toe, knee, part] of [[L.leftToe, L.leftKnee, 'knee-left'], [L.rightToe, L.rightKnee, 'knee-right']] as const) {
      const t = pt(toe), k = pt(knee);
      if (t && k) line({ x: t.x, y: t.y }, { x: t.x, y: k.y - unit * 8 }, hot.has(part) ? ALERT : LINE, unit * 0.8, [unit * 2, unit * 2]);
      if (k) dot(k, hot.has(part) ? ALERT : '#fff');
      if (t) dot(t, '#fff', unit * 1.6);
    }
    for (const i of [L.leftShoulder, L.rightShoulder]) { const p = pt(i); if (p) dot(p, hot.has('shoulder') ? ALERT : '#fff'); }
    for (const i of [L.leftHip, L.rightHip]) { const p = pt(i); if (p) dot(p, hot.has('pelvis') ? ALERT : '#fff'); }
    for (const i of [L.leftHeel, L.rightHeel]) { const p = pt(i); if (p) dot(p, BASE, unit * 1.6); }
    for (const i of [L.leftEar, L.rightEar, L.nose]) { const p = pt(i); if (p) dot(p, '#fff', unit * 1.4); }
    const h = headPoint(sample.landmarks, width, height);
    if (typeof h !== 'string') dot(h, hot.has('head') ? ALERT : '#fff', unit * 2.6);
  }, [sample, frame, width, height]);
  return <canvas ref={ref} width={width} height={height} className="frontal-layer" aria-label="醫學組正面檢查疊圖：點位、基準線與檢查線" />;
}

/** Plain-language prompt box shown over the video. */
export function FrontalCuePanel({ frame, hasSample }: { frame: FrontalFrame | undefined; hasSample: boolean }) {
  let body: ReactNode;
  if (!hasSample || !frame) body = <p className="cue-muted">此影格沒有分析結果</p>;
  else if (frame.baseline.state !== 'locked') body = <p className="cue-muted">請先站穩約 1 秒，建立基準線</p>;
  else if (frame.cues.length === 0) body = <p className="cue-ok">✓ 姿勢在基準線附近</p>;
  else body = <ul>{frame.cues.map(c => <li key={c.id}>⚠ {c.text}<span className="cue-page">講義 p.{c.page}</span></li>)}</ul>;
  return <div className="cue-panel" role="status" aria-live="polite">{body}</div>;
}
