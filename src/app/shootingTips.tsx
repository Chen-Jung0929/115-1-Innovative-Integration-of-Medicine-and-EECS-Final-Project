/**
 * How to film for the most accurate numbers, shared by the upload and live-camera pages (ADR-098).
 * Plain Traditional Chinese for therapists and patients; the sources behind each tip are recorded in
 * docs/DECISIONS.md and docs/angle-definitions.md, never in the UI text.
 */
export const SHOOTING_TIPS: readonly { id: string; text: string }[] = [
  { id: 'side', text: '看膝蓋、髖部彎曲和上身前傾：從正側面拍。鏡頭放在髖部高度，正對身體側面（與身體成直角），不要斜斜地拍，斜拍時膝蓋角度會差很多。' },
  { id: 'front', text: '看膝蓋往內夾、骨盆歪斜：從正面拍，鏡頭正對身體。' },
  { id: 'clothing', text: '請穿貼身長褲或短褲，避免寬褲遮住膝蓋。' },
  { id: 'frame', text: '鏡頭固定不動、頭到腳完整入鏡、畫面中只有一人。' },
];

/** One-line reminder for places with no room for the full list (oblique-view prompts). */
export const OBLIQUE_TIP = '膝、髖角度請改從正側面拍';

/** The tips as a short list (same wording on both pages). */
export function ShootingTips({ title = '怎麼拍最準', ids }: { title?: string; ids?: readonly string[] }) {
  const tips = ids ? SHOOTING_TIPS.filter(t => ids.includes(t.id)) : SHOOTING_TIPS;
  return <div className="shooting-tips">{title && <p className="shooting-tips-title">{title}</p>}<ul>{tips.map(t => <li key={t.id}>{t.text}</li>)}</ul></div>;
}

/** The live camera only measures knee angles (no frontal checks), so it shows the side-view tips only. */
export const LIVE_TIP_IDS = ['side', 'clothing', 'frame'] as const;
