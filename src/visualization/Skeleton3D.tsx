import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { Sample } from '../domain/analysis';
import { worldFlexion } from '../biomechanics/world';

const W = 480, H = 360;
const BONES: [number, number][] = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 29], [29, 31], [27, 31], [28, 30], [30, 32], [28, 32]];
const LEFT = '#0071e3', RIGHT = '#e8590c', MID = '#8e8e93';
const VIEWS = [{ id: 'front', label: '正面', yaw: 0 }, { id: 'oblique', label: '斜角', yaw: 45 }, { id: 'side', label: '側面', yaw: 90 }] as const;
const colorOf = (a: number, b: number) => a % 2 === 1 && b % 2 === 1 ? LEFT : a % 2 === 0 && b % 2 === 0 && a > 10 ? RIGHT : MID;

/**
 * Experimental 3D skeleton from MediaPipe world landmarks (ADR-069). Display only: drag to turn,
 * or pick 正面／斜角／側面. Uses the same world points as the "3D 骨架" angles; depth is a model
 * estimate, so it can be wrong even when the 2D overlay looks right.
 */
export function Skeleton3D({ sample }: { sample: Sample | undefined }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [yaw, setYaw] = useState(30), [pitch, setPitch] = useState(10);
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const usable = !!sample && sample.tracking.accepted && (!sample.review || sample.review.label === 'correct-target');
  const hasWorld = !!sample && sample.landmarks.some(p => p.world);
  useEffect(() => {
    const c = ref.current, ctx = c?.getContext('2d'); if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr; c.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!usable || !hasWorld) return;
    const y0 = yaw * Math.PI / 180, p0 = pitch * Math.PI / 180;
    const pts = sample!.landmarks.map(l => l.world);
    const feet = Math.max(...[27, 28, 29, 30, 31, 32].map(i => pts[i]?.[1] ?? -Infinity));
    const floorY = Number.isFinite(feet) ? feet : 0.9;
    const heads = pts[0]?.[1] ?? floorY - 1.6;
    const scale = H * 0.82 / Math.max(1.2, floorY - heads + 0.15), cx = W / 2, cy = H / 2 - (floorY + heads) / 2 * scale;
    const proj = (x: number, y: number, z: number) => {
      const rx = x * Math.cos(y0) + z * Math.sin(y0), rz = -x * Math.sin(y0) + z * Math.cos(y0);
      const ry = y * Math.cos(p0) - rz * Math.sin(p0), dz = y * Math.sin(p0) + rz * Math.cos(p0);
      return { x: cx + rx * scale, y: cy + ry * scale, z: dz };
    };
    // Floor grid at foot level (1 m × 1 m, 25 cm steps).
    ctx.strokeStyle = 'rgba(142,142,147,.35)'; ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      for (const [a, b] of [[proj(i * .25, floorY, -.5), proj(i * .25, floorY, .5)], [proj(-.5, floorY, i * .25), proj(.5, floorY, i * .25)]] as const) {
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    const P = pts.map(p => p ? proj(p[0], p[1], p[2]) : null);
    const bones = BONES.filter(([a, b]) => P[a] && P[b]).map(([a, b]) => ({ a, b, z: (P[a]!.z + P[b]!.z) / 2 })).sort((m, n) => n.z - m.z);
    ctx.lineCap = 'round';
    for (const { a, b } of bones) {
      ctx.strokeStyle = colorOf(a, b); ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(P[a]!.x, P[a]!.y); ctx.lineTo(P[b]!.x, P[b]!.y); ctx.stroke();
    }
    const head = P[0]; if (head) { ctx.fillStyle = MID; ctx.beginPath(); ctx.arc(head.x, head.y, 9, 0, 2 * Math.PI); ctx.fill(); }
    for (const i of [11, 12, 23, 24, 25, 26, 27, 28]) { const q = P[i]; if (q) { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1c1c1e'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(q.x, q.y, 4, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); } }
    ctx.font = '600 13px system-ui, sans-serif'; ctx.textBaseline = 'middle';
    for (const [side, i, dir] of [['left', 25, 1], ['right', 26, -1]] as const) {
      const f = worldFlexion(sample!.landmarks, 'knee', side), q = P[i];
      if (f === null || !q) continue;
      const text = `${side === 'left' ? '左' : '右'}膝 ${Math.round(f)}°`;
      const tw = ctx.measureText(text).width + 12, x = dir > 0 ? q.x + 10 : q.x - 10 - tw, y = q.y + (side === 'left' ? 4 : -4) - 10;
      ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.beginPath(); ctx.roundRect(x, y, tw, 20, 10); ctx.fill();
      ctx.textAlign = 'left'; ctx.fillStyle = side === 'left' ? LEFT : RIGHT; ctx.fillText(text, x + 6, y + 10);
    }
  }, [sample, usable, hasWorld, yaw, pitch]);
  const down = (e: PointerEvent<HTMLCanvasElement>) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, yaw, pitch }; };
  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current; if (!d) return;
    setYaw(((d.yaw + (e.clientX - d.x) * 0.5) % 360 + 360) % 360);
    setPitch(Math.max(-30, Math.min(60, d.pitch - (e.clientY - d.y) * 0.3)));
  };
  return <div className="skeleton3d">
    <div className="skeleton3d-head"><span>3D 骨架（試驗）</span>
      <div className="segmented small-seg" role="group" aria-label="3D 骨架視角">{VIEWS.map(v => <button key={v.id} aria-pressed={Math.round(yaw) === v.yaw && Math.round(pitch) === 0} onClick={() => { setYaw(v.yaw); setPitch(0); }}>{v.label}</button>)}</div>
    </div>
    <div className="skeleton3d-stage">
      <canvas ref={ref} aria-label="3D 骨架，可拖曳旋轉" onPointerDown={down} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />
      {!usable ? <p className="skeleton3d-empty">這一格沒有可用的骨架</p> : !hasWorld ? <p className="skeleton3d-empty">這次分析沒有 3D 點，請重新分析</p> : null}
    </div>
    <p className="muted small">拖曳可旋轉。藍色 = 個案左側、橘色 = 右側。深度是模型估計的，僅供參考。</p>
  </div>;
}
