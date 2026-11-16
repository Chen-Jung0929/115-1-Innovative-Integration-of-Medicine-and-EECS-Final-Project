import { useEffect, useRef } from 'react';
import type { Sample } from '../domain/analysis';
import type { AnatomicalSide } from '../domain/measurement';
const connections = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,29],[29,31],[27,31],[28,30],[30,32],[28,32]];
export function Overlay({ sample, width, height, side }: { sample: Sample | undefined; width: number; height: number; side: AnatomicalSide | 'both' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (!sample) return;
    const shown = (i: number) => side === 'both' || (side === 'left' ? i % 2 === 1 : i % 2 === 0);
    const good = (i: number) => { const p = sample.landmarks[i]; return p && [p.x,p.y,p.visibility,p.presence ?? 1].every(Number.isFinite) && p.visibility >= 0.5 && p.visibility <= 1 && (p.presence ?? 1) >= 0.5 && (p.presence ?? 1) <= 1 && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1; };
    ctx.lineWidth = Math.max(2, width / 250); ctx.strokeStyle = '#35f1bc'; ctx.fillStyle = '#fff';
    for (const [a,b] of connections) if (a !== undefined && b !== undefined && shown(a) && shown(b) && good(a) && good(b)) {
      const p = sample.landmarks[a]!, q = sample.landmarks[b]!;
      ctx.beginPath(); ctx.moveTo(p.x * width, p.y * height); ctx.lineTo(q.x * width, q.y * height); ctx.stroke();
    }
    sample.landmarks.forEach((p,i) => { if (shown(i) && good(i)) { ctx.beginPath(); ctx.arc(p.x * width, p.y * height, Math.max(3,width/180), 0, 2*Math.PI); ctx.fill(); } });
  }, [sample, width, height, side]);
  return <canvas ref={ref} width={width} height={height} className="overlay" aria-label="已分析影格的骨架疊圖" />;
}
