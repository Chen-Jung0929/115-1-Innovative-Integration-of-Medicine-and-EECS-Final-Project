import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import type { Sample } from '../domain/analysis';
import * as THREE from 'three';
import { flexion3D, type Vec3 } from '../biomechanics/lift3d';
import { createBones, type Bones } from './bones';
import { groundForDisplay } from '../motion/world3d';

const W = 480, H = 360;
const BONES: [number, number][] = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 29], [29, 31], [27, 31], [28, 30], [30, 32], [28, 32]];
const LEFT = '#0071e3', RIGHT = '#e8590c', MID = '#8e8e93';
const VIEWS = [{ id: 'front', label: '正面', yaw: 0 }, { id: 'oblique', label: '斜角', yaw: 45 }, { id: 'side', label: '側面', yaw: 90 }] as const;
const colorOf = (a: number, b: number) => a % 2 === 1 && b % 2 === 1 ? LEFT : a % 2 === 0 && b % 2 === 0 && a > 10 ? RIGHT : MID;

/**
 * Experimental 3D skeleton (ADR-069), drawn as OpenSim bone meshes (ADR-070) or lines. Display only: drag
 * to turn, or pick 正面／斜角／側面. Draws the hybrid lifted pose (ADR-071: image x/y + world depth,
 * gravity-upright, feet on the floor at y = 0), the same points as the "3D 骨架" angles; depth is still
 * a model estimate, so it can be wrong even when the 2D overlay looks right.
 */
/** Lifted pose (y down, smaller z = nearer the camera) → three.js (y up, +z toward the viewer). */
const toThree = (w: Vec3 | undefined) => w ? new THREE.Vector3(w[0], -w[1], -w[2]) : null;
/** Camera aim: a fixed point above the floor, so a squat is seen as the body going down. */
const AIM_Y = 0.75;
/** Contact shadow under each foot (ellipse on the floor along heel→toe), so "standing on the floor" reads at a glance. */
const FOOT_IDX = { left: [27, 29, 31], right: [28, 30, 32] } as const;
function footShadow(pts: readonly Vec3[], side: 'left' | 'right') {
  const [a, h, t] = FOOT_IDX[side].map(i => pts[i]!) as [Vec3, Vec3, Vec3];
  const cx = (a[0] + h[0] + t[0]) / 3, cz = (a[2] + h[2] + t[2]) / 3, dx = t[0] - h[0], dz = t[2] - h[2], len = Math.hypot(dx, dz);
  return { cx, cz, angle: Math.atan2(dz, dx), half: Math.max(0.08, len / 2 + 0.04), width: 0.07 };
}

export function Skeleton3D({ sample, points: rawPoints, note, pitchText, children }: { sample: Sample | undefined; points: Vec3[] | undefined; note?: string | null; pitchText?: string | null; children?: ReactNode }) {
  // Feet on the grid, body at the grid centre every frame (ADR-090); angles are translation-free.
  const points = useMemo(() => groundForDisplay(rawPoints), [rawPoints]);
  const ref = useRef<HTMLCanvasElement>(null);
  const gl = useRef<HTMLCanvasElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const three = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; grid: THREE.GridHelper; shadows: THREE.Mesh[]; bones: Bones | null } | null>(null);
  const [mode, setMode] = useState<'bones' | 'lines'>('bones');
  const [bonesReady, setBonesReady] = useState(false);
  const [yaw, setYaw] = useState(30), [pitch, setPitch] = useState(10);
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const usable = !!sample && sample.tracking.accepted && (!sample.review || sample.review.label === 'correct-target');
  const hasWorld = !!sample && sample.landmarks.some(p => p.world);
  const ready = usable && hasWorld && !!points;
  useEffect(() => {
    const c = ref.current, ctx = c?.getContext('2d'); if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr; c.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!ready || (mode === 'bones' && bonesReady)) return;
    const y0 = yaw * Math.PI / 180, p0 = pitch * Math.PI / 180;
    const pts = points!, floorY = 0;
    const scale = H * 0.82 / 1.75, cx = W / 2, cy = H / 2 + AIM_Y * scale;
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
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    for (const side of ['left', 'right'] as const) {
      if (!FOOT_IDX[side].every(i => pts[i]?.every(Number.isFinite))) continue;
      const f = footShadow(pts, side), c = Math.cos(f.angle), sn = Math.sin(f.angle);
      ctx.beginPath();
      for (let k = 0; k <= 24; k++) { const u = Math.cos(k / 24 * 2 * Math.PI) * f.half, v = Math.sin(k / 24 * 2 * Math.PI) * f.width, q = proj(f.cx + u * c - v * sn, floorY, f.cz + u * sn + v * c); if (k) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }
      ctx.fill();
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
      const f = flexion3D(pts, 'knee', side), q = P[i];
      if (f === null || !q) continue;
      const text = `${side === 'left' ? '左' : '右'}膝 ${Math.round(f)}°`;
      const tw = ctx.measureText(text).width + 12, x = dir > 0 ? q.x + 10 : q.x - 10 - tw, y = q.y + (side === 'left' ? 4 : -4) - 10;
      ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.beginPath(); ctx.roundRect(x, y, tw, 20, 10); ctx.fill();
      ctx.textAlign = 'left'; ctx.fillStyle = side === 'left' ? LEFT : RIGHT; ctx.fillText(text, x + 6, y + 10);
    }
  }, [points, ready, yaw, pitch, mode, bonesReady]);
  // Bone meshes (WebGL). Falls back to the line drawing when WebGL or the mesh files are unavailable.
  useEffect(() => {
    const c = gl.current; if (!c) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true }); } catch { return; }
    renderer.setPixelRatio(window.devicePixelRatio || 1); renderer.setSize(W, H, false);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, W / H, 0.05, 50);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.2));
    const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(2, 4, 3); scene.add(dl);
    const grid = new THREE.GridHelper(2, 8, 0x8e8e93, 0x8e8e93); scene.add(grid);
    const shadows = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false })); m.rotation.order = 'YXZ'; scene.add(m); return m; });
    three.current = { renderer, scene, camera, grid, shadows, bones: null };
    let alive = true;
    createBones(scene, `${import.meta.env.BASE_URL}bones/`).then(b => { if (!alive) return; three.current!.bones = b; setBonesReady(true); }).catch(() => { if (alive) setMode('lines'); });
    return () => { alive = false; renderer.dispose(); three.current = null; setBonesReady(false); };
  }, []);
  useEffect(() => {
    const t = three.current, box = labels.current;
    if (box) box.replaceChildren();
    if (!t || !t.bones || mode !== 'bones') return;
    const P = points?.map(toThree);
    const ok = ready && P && [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32].every(i => P[i]);
    t.bones.group.visible = !!ok; t.grid.visible = !!ok;
    const target = new THREE.Vector3(0, AIM_Y, 0);
    if (ok) t.bones.update(P as THREE.Vector3[]);
    t.shadows.forEach((m, k) => {
      const side = k ? 'right' : 'left';
      m.visible = !!ok && FOOT_IDX[side].every(i => points![i]?.every(Number.isFinite)); if (!m.visible) return;
      // Lifted pose → three.js flips y and z, so the floor ellipse uses x and −z.
      const f = footShadow(points!, side);
      m.position.set(f.cx, 0.002, -f.cz); m.rotation.set(-Math.PI / 2, f.angle, 0); m.scale.set(f.half, f.width, 1);
    });
    const y0 = yaw * Math.PI / 180, p0 = pitch * Math.PI / 180, d = 4.6;
    t.camera.position.set(target.x + d * Math.sin(y0) * Math.cos(p0), target.y + d * Math.sin(p0), target.z + d * Math.cos(y0) * Math.cos(p0));
    t.camera.lookAt(target);
    t.renderer.render(t.scene, t.camera);
    if (!ok || !box) return;
    for (const [side, i] of [['left', 25], ['right', 26]] as const) {
      const f = flexion3D(points, 'knee', side); if (f === null) continue;
      const v = (P![i] as THREE.Vector3).clone().add(t.bones.group.position).project(t.camera);
      const el = document.createElement('span');
      el.className = `skeleton3d-label ${side}`; el.textContent = `${side === 'left' ? '左' : '右'}膝 ${Math.round(f)}°`;
      el.style.left = `${(v.x + 1) / 2 * 100}%`; el.style.top = `${(1 - v.y) / 2 * 100}%`;
      box.append(el);
    }
  }, [points, ready, yaw, pitch, mode, bonesReady]);
  const down = (e: PointerEvent<HTMLCanvasElement>) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, yaw, pitch }; };
  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current; if (!d) return;
    setYaw(((d.yaw + (e.clientX - d.x) * 0.5) % 360 + 360) % 360);
    setPitch(Math.max(-30, Math.min(60, d.pitch - (e.clientY - d.y) * 0.3)));
  };
  return <div className="skeleton3d">
    <div className="skeleton3d-head"><span>3D 骨架（試驗）</span>
      <div className="segmented small-seg" role="group" aria-label="3D 骨架樣式"><button aria-pressed={mode === 'bones'} disabled={!bonesReady} onClick={() => setMode('bones')}>骨頭</button><button aria-pressed={mode === 'lines'} onClick={() => setMode('lines')}>線條</button></div>
      <div className="segmented small-seg" role="group" aria-label="3D 骨架視角">{VIEWS.map(v => <button key={v.id} aria-pressed={Math.round(yaw) === v.yaw && Math.round(pitch) === 0} onClick={() => { setYaw(v.yaw); setPitch(0); }}>{v.label}</button>)}</div>
    </div>
    <div className="skeleton3d-stage">
      <canvas ref={gl} className="skeleton3d-gl" hidden={mode !== 'bones' || !bonesReady} aria-hidden="true" />
      <canvas ref={ref} aria-label="3D 骨架，可拖曳旋轉" onPointerDown={down} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />
      <div ref={labels} className="skeleton3d-labels" hidden={mode !== 'bones'} />
      {!usable || (hasWorld && !points) ? <p className="skeleton3d-empty">這一格沒有可用的骨架</p> : !hasWorld ? <p className="skeleton3d-empty">這次分析沒有 3D 點，請重新分析</p> : null}
    </div>
    {children}
    {pitchText && <p className="muted small">{pitchText}，已用來把骨架轉正。</p>}
    {note && <p className="muted small">{note}</p>}
    <p className="muted small">拖曳可旋轉。藍色 = 個案左側、橘色 = 右側。骨頭模型取自 OpenSim（只用來顯示，長度依個案縮放）。骨架的左右上下位置跟著影片，前後深度是模型估計的，腳踩在地板格線上；要做站直校正，請在開始或結束時站穩約 1 秒。{pitchText ? '' : '沒有鏡頭俯角時，手機若上下傾斜，整副骨架會跟著前後傾。'}僅供參考。</p>
  </div>;
}
