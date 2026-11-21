import type { ReactNode } from 'react';

/**
 * One row in the measurement list: a plain name, one big value, an optional
 * one-line meaning, and a tap-to-open "怎麼算？" with the definition and QC detail.
 */
export function Metric({ name, value, alt, note, warn, children }: { name: string; value: string; alt?: string | undefined; note?: string; warn?: boolean; children?: ReactNode }) {
  return <article className={warn ? 'metric warn' : 'metric'}>
    <div className="metric-row">
      <div className="metric-text"><h3>{name}</h3>{note && <p className="metric-note">{note}</p>}</div>
      <div className="metric-value"><p className={value === 'N/A' ? 'angle na' : 'angle'}>{value}</p>{alt && <p className="metric-alt">{alt}</p>}</div>
    </div>
    {children && <details className="explain"><summary>怎麼算？</summary><div>{children}</div></details>}
  </article>;
}
