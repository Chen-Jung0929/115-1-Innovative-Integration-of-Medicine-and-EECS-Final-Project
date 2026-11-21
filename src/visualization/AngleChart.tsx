import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from 'recharts';
import type { Sample } from '../domain/analysis';
export type ChartMetric = 'knee' | 'hip' | 'trunkLean' | 'kneeToe';
export const CHART_METRICS: Record<ChartMetric, { label: string; aria: string; axis: string; domain: [number | 'auto', number | 'auto']; bilateral: boolean }> = {
  knee: { label: '膝角', aria: '左右膝影像平面內角時間曲線；無效取樣為斷點', axis: '內角（°）', domain: [0, 180], bilateral: true },
  hip: { label: '髖角', aria: '左右髖影像平面內角時間曲線；無效取樣為斷點', axis: '內角（°）', domain: [0, 180], bilateral: true },
  trunkLean: { label: '上身（軀幹）前傾', aria: '上身（軀幹）前傾角時間曲線；無效取樣為斷點', axis: '與垂直線夾角（°）', domain: [0, 90], bilateral: false },
  kneeToe: { label: '膝蓋對腳尖線（膝蓋內夾）', aria: '左右膝相對腳尖鉛垂線位置時間曲線；無效取樣為斷點', axis: '骨盆寬（+ = 膝在內側）', domain: ['auto', 'auto'], bilateral: true },
};
function values(s: Sample, metric: ChartMetric): { left: number | null; right: number | null; value: number | null } {
  const p = s.posture?.final;
  if (metric === 'knee') return { left: s.left.rawAngleDeg, right: s.right.rawAngleDeg, value: null };
  if (metric === 'hip') return { left: p?.hip.left.rawAngleDeg ?? null, right: p?.hip.right.rawAngleDeg ?? null, value: null };
  if (metric === 'trunkLean') return { left: null, right: null, value: p?.trunkLean.rawAngleDeg ?? null };
  return { left: p?.kneeToe.left.value ?? null, right: p?.kneeToe.right.value ?? null, value: null };
}
export function AngleChart({ samples, side, timeMs, metric = 'knee' }: { samples: Sample[]; side: 'left' | 'right' | 'both'; timeMs: number; metric?: ChartMetric }) {
  const spec = CHART_METRICS[metric];
  const data = samples.map(s => ({ seconds: s.sourceTimeMs / 1000, ...values(s, metric) }));
  const name = metric === 'hip' ? '髖' : '膝';
  return <div className="chart" role="img" aria-label={spec.aria}>
    <ResponsiveContainer width="100%" height={300}><LineChart data={data} margin={{ top: 15, right: 25, bottom: 25, left: 10 }}>
      <CartesianGrid strokeDasharray="3 3" /><XAxis type="number" dataKey="seconds" domain={['dataMin','dataMax']} tickFormatter={(v:number)=>v.toFixed(1)} label={{ value: '來源時間（秒）', position: 'bottom' }} />
      <YAxis domain={spec.domain} label={{ value: spec.axis, angle: -90, position: 'insideLeft' }} /><Tooltip /><Legend verticalAlign="top" />
      {spec.bilateral && side !== 'right' && <Line dataKey="left" name={`左${name}`} stroke="#007d68" dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} />}
      {spec.bilateral && side !== 'left' && <Line dataKey="right" name={`右${name}`} stroke="#b34b1b" dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} />}
      {!spec.bilateral && <Line dataKey="value" name={spec.label} stroke="#3b5bdb" dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} />}
      {metric === 'kneeToe' && <ReferenceLine y={0} stroke="#8a94a6" strokeDasharray="4 4" />}
      <ReferenceLine x={timeMs / 1000} stroke="#4a5870" />
    </LineChart></ResponsiveContainer>
  </div>;
}
