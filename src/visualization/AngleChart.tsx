import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from 'recharts';
import type { Sample } from '../domain/analysis';
export function AngleChart({ samples, side, timeMs }: { samples: Sample[]; side: 'left' | 'right' | 'both'; timeMs: number }) {
  const data = samples.map(s => ({ seconds: s.sourceTimeMs / 1000, left: s.left.rawAngleDeg, right: s.right.rawAngleDeg }));
  return <div className="chart" role="img" aria-label="左右膝影像平面內角時間曲線；無效取樣為斷點">
    <ResponsiveContainer width="100%" height={300}><LineChart data={data} margin={{ top: 15, right: 25, bottom: 25, left: 10 }}>
      <CartesianGrid strokeDasharray="3 3" /><XAxis type="number" dataKey="seconds" domain={['dataMin','dataMax']} label={{ value: '來源時間（秒）', position: 'bottom' }} />
      <YAxis domain={[0,180]} label={{ value: '內角（°）', angle: -90, position: 'insideLeft' }} /><Tooltip /><Legend verticalAlign="top" />
      {side !== 'right' && <Line dataKey="left" name="左膝" stroke="#007d68" dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} />}
      {side !== 'left' && <Line dataKey="right" name="右膝" stroke="#b34b1b" dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} />}
      <ReferenceLine x={timeMs / 1000} stroke="#4a5870" />
    </LineChart></ResponsiveContainer>
  </div>;
}
