import { useEffect, useRef, type ReactNode } from 'react';
import type { Sample } from '../domain/analysis';
import { FRONTAL_LANDMARKS as L, frontalFrame, headPoint } from '../biomechanics/frontal';
import { sourcePoint, type Point } from '../biomechanics/knee';
import { LATERAL_INDICES } from '../biomechanics/lateral';
import type { BodyPart } from '../motion/frontalCues';
import type { FrontalFrame } from '../motion/frontalTimeline';

const BASE = '#ff5a36', LINE = '#ffd166', ALERT = '#ff2d55', TRUNK = '#5ab0ff', TOE = '#7cf0c0';

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
    const unit = Math.max(2.5, width / 170);
    const hot = new Set<BodyPart>(frame.cues.flatMap(c => c.parts));
    const pt = (i: number): Point | null => { const p = sourcePoint(sample.landmarks, i, width, height); return typeof p === 'string' ? null : p; };
    const line = (a: Point, b: Point, color: string, w = unit, dash: number[] = []) => {
      ctx.setLineDash(dash); ctx.lineCap = 'round';
      // Dark halo so lines stay visible on any background.
      ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = w + unit * 1.2; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
    };
    const dot = (p: Point, color: string, r = unit * 1.6) => { ctx.fillStyle = color; ctx.strokeStyle = '#101b1e'; ctx.lineWidth = unit * 0.5; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); };
    const label = (text: string, at: Point, color: string, align: CanvasTextAlign = 'left') => {
      ctx.font = `700 ${Math.round(unit * 5)}px system-ui, sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle';
      ctx.lineWidth = unit * 1.4; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(text, at.x, at.y); ctx.fillStyle = color; ctx.fillText(text, at.x, at.y);
    };
    /** Line through `c` at `tiltDeg` (+ = person's left side lower), half-length `half`. */
    const tilted = (c: Point, tiltDeg: number, half: number, leftDir: number): [Point, Point] => {
      const r = tiltDeg * Math.PI / 180, dx = Math.cos(r) * half * leftDir, dy = Math.sin(r) * half;
      return [{ x: c.x + dx, y: c.y + dy }, { x: c.x - dx, y: c.y - dy }];
    };
    const n = frame.neutral;

    // Side view (handout p.12): toe plumb line, trunk vs vertical, values next to the body.
    if (frame.view === 'side' && frame.lateral) {
      const lat = frame.lateral;
      const [S, H, K, A, E, T] = LATERAL_INDICES[lat.side].map(i => pt(i));
      const kc = hot.has('side-knee') ? ALERT : TOE, tc = hot.has('side-trunk') ? ALERT : TRUNK;
      if (T && K) {
        line({ x: T.x, y: T.y }, { x: T.x, y: K.y - unit * 14 }, kc, unit, [unit * 2.5, unit * 1.8]);
        label('腳尖線', { x: T.x + unit * 3, y: T.y - unit * 6 }, kc);
      }
      if (H && S) {
        const len = Math.hypot(S.x - H.x, S.y - H.y);
        line(H, { x: H.x, y: H.y - len }, 'rgba(255,255,255,.9)', unit * 0.7, [unit * 2.5, unit * 2]);
        line(H, S, tc, unit * 1.2);
        if (lat.trunkLean.valid) label(`上身前傾 ${Math.round(lat.trunkLean.value)}°`, { x: Math.max(H.x, S.x) + unit * 4, y: (H.y + S.y) / 2 }, tc);
      }
      if (A && K) line(A, K, 'rgba(255,255,255,.75)', unit * 0.8);
      if (K && lat.kneeForward.valid) {
        const v = lat.kneeForward.value;
        label(v > 0 ? `膝超過腳尖 ${Math.round(v * 100)}%小腿長` : '膝在腳尖後方', { x: K.x + unit * 5, y: K.y }, kc);
      }
      for (const q of [S, H, A, E]) if (q) dot(q, '#fff', unit * 1.6);
      if (K) dot(K, hot.has('side-knee') ? ALERT : '#fff', unit * 2.2);
      if (T) dot(T, TOE);
      return;
    }
    const f = frontalFrame(sample.landmarks, width, height);
    // Every remaining line is a FRONTAL check: in an oblique view draw nothing (the prompt box asks for a frontal/side recording).
    if (frame.view !== 'frontal' || typeof f === 'string') return;
    // Vertical baseline, locked at the standing calibration.
    const b = frame.baseline;
    if (b.state === 'locked') { line({ x: b.x, y: 0 }, { x: b.x, y: Math.min(height, b.heelY + unit * 4) }, BASE, unit * 1.3); label('基準線', { x: b.x + unit * 3, y: unit * 8 }, BASE); }

    if (typeof f !== 'string') {
      const half = (a: Point, c: Point) => Math.hypot(a.x - c.x, a.y - c.y) / 2 * 1.6;
      const sideX = (a: Point, c: Point) => Math.max(a.x, c.x) + unit * 4;
      // Standing reference (white dashed): how the line looked while standing, moved with the body.
      if (n) {
        const [r1, r2] = tilted(f.shoulderMid, n.shoulderTilt, half(f.ls, f.rs), f.leftDir); line(r1, r2, 'rgba(255,255,255,.9)', unit * 0.7, [unit * 2.5, unit * 2]);
        const [q1, q2] = tilted(f.hipMid, n.pelvisTilt, half(f.lh, f.rh), f.leftDir); line(q1, q2, 'rgba(255,255,255,.9)', unit * 0.7, [unit * 2.5, unit * 2]);
      }
      const [s1, s2] = tilted(f.shoulderMid, Math.atan2(f.ls.y - f.rs.y, Math.abs(f.ls.x - f.rs.x)) * 180 / Math.PI, half(f.ls, f.rs), f.leftDir);
      const sc = hot.has('shoulder') ? ALERT : LINE; line(s1, s2, sc, unit); label('肩線', { x: sideX(s1, s2), y: f.shoulderMid.y }, sc);
      const [p1, p2] = tilted(f.hipMid, Math.atan2(f.lh.y - f.rh.y, Math.abs(f.lh.x - f.rh.x)) * 180 / Math.PI, half(f.lh, f.rh), f.leftDir);
      const pc = hot.has('pelvis') ? ALERT : LINE; line(p1, p2, pc, unit); label('骨盆線', { x: sideX(p1, p2), y: f.hipMid.y }, pc);
      const tc = hot.has('trunk') ? ALERT : TRUNK; line(f.hipMid, f.shoulderMid, tc, unit, [unit * 3, unit * 2]);
      dot(f.shoulderMid, LINE); // ≈ 胸骨上緣
      dot(f.hipMid, LINE); // ≈ 恥骨聯合
    }
    // Toe plumb lines (handout p.11): vertical through each toe up to above the knee.
    for (const [toe, knee, part] of [[L.leftToe, L.leftKnee, 'knee-left'], [L.rightToe, L.rightKnee, 'knee-right']] as const) {
      const t = pt(toe), k = pt(knee);
      const c = hot.has(part) ? ALERT : TOE;
      if (t && k) line({ x: t.x, y: t.y }, { x: t.x, y: k.y - unit * 10 }, c, unit * 0.8, [unit * 2, unit * 1.6]);
      if (k) dot(k, hot.has(part) ? ALERT : '#fff', unit * 2);
      if (t) dot(t, TOE);
    }
    const lt = pt(L.leftToe), rt = pt(L.rightToe), lk = pt(L.leftKnee), rk = pt(L.rightKnee);
    if (lt && rt && lk && rk) label('腳尖線', { x: Math.max(lt.x, rt.x) + unit * 3, y: (Math.min(lk.y, rk.y) + Math.max(lt.y, rt.y)) / 2 }, hot.has('knee-left') || hot.has('knee-right') ? ALERT : TOE);
    for (const i of [L.leftShoulder, L.rightShoulder]) { const p = pt(i); if (p) dot(p, hot.has('shoulder') ? ALERT : '#fff', unit * 2); }
    for (const i of [L.leftHip, L.rightHip]) { const p = pt(i); if (p) dot(p, hot.has('pelvis') ? ALERT : '#fff', unit * 2); }
    for (const i of [L.leftHeel, L.rightHeel]) { const p = pt(i); if (p) dot(p, BASE, unit * 1.3); }
    for (const i of [L.leftEar, L.rightEar, L.nose]) { const p = pt(i); if (p) dot(p, '#fff', unit * 1.1); }
    const h = headPoint(sample.landmarks, width, height);
    if (typeof h !== 'string') dot(h, hot.has('head') ? ALERT : '#fff', unit * 2.2);
  }, [sample, frame, width, height]);
  return <canvas ref={ref} width={width} height={height} className="frontal-layer" aria-label="醫學組檢查疊圖：點位、基準線與檢查線" />;
}

/** Plain-language prompt box shown over the video. */
export function FrontalCuePanel({ frame, hasSample }: { frame: FrontalFrame | undefined; hasSample: boolean }) {
  let body: ReactNode;
  if (!hasSample || !frame) body = <p className="cue-muted">此影格沒有分析結果</p>;
  else if (!frame.tracked) body = <p className="cue-muted">這一格沒有穩定追到個案（例如被別人擋住、畫面有其他人），暫不判斷</p>;
  else if (frame.view === 'oblique') body = <p className="cue-muted">身體轉得太斜，先不判斷（正面或正側面拍才準）</p>;
  else if (frame.view === 'side') body = frame.cues.length ? <ul>{frame.cues.map(c => <li key={c.id}>⚠ {c.text}<span className="cue-page">講義 p.{c.page}</span></li>)}</ul> : <p className="cue-ok">✓ 側面：膝蓋與上身在範圍內</p>;
  else if (frame.view !== 'frontal') body = <p className="cue-muted">看不清楚軀幹點位，暫不判斷</p>;
  else if (frame.baseline.state !== 'locked') body = <p className="cue-muted">還找不到站直的畫面：請個案先站直、不動約 1 秒，才能畫基準線</p>;
  else if (frame.cues.length === 0) body = <p className="cue-ok">✓ 姿勢在基準線附近</p>;
  else body = <ul>{frame.cues.map(c => <li key={c.id}>⚠ {c.text}<span className="cue-page">講義 p.{c.page}</span></li>)}</ul>;
  return <div className="cue-panel" role="status" aria-live="polite">{body}</div>;
}

/** Colour key for the frontal overlay. */
export function FrontalLegend({ view }: { view: FrontalFrame['view'] | undefined }) {
  const items: [string, string, boolean][] = view === 'side' ? [
    ['腳尖鉛垂線（看膝蓋有沒有超過）', TOE, true], ['軀幹（髖→肩）', TRUNK, false], ['垂直參考線／小腿', '#ffffff', true], ['超過門檻（看提示）', ALERT, false],
  ] : [
    ['基準線（站直時的身體中線）', BASE, false], ['肩線／骨盆線', LINE, false], ['站直時的肩線／骨盆線', '#ffffff', true],
    ['軀幹', TRUNK, true], ['腳尖鉛垂線', TOE, true], ['偏離（看提示）', ALERT, false],
  ];
  return <ul className="frontal-legend" aria-label="疊圖顏色說明">{items.map(([t, c, dashed]) =>
    <li key={t}><span className="swatch" style={{ borderTopColor: c, borderTopStyle: dashed ? 'dashed' : 'solid' }} />{t}</li>)}</ul>;
}
