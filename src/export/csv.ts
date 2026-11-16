import type { Session } from '../domain/analysis';
import { flexionProxy } from '../biomechanics/knee';
import { PROXY_DEFINITION } from '../domain/analysis';
function cell(value: string | number | boolean | null): string {
  // Text that spreadsheet software could execute is explicitly neutralized.
  let text = value === null ? '' : String(value);
  if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function toCsv(session: Session): string {
  const header = ['session_id', 'source_filename', 'source_time_ms', 'requested_time_ms', 'sample_index', 'joint', 'side', 'raw_angle_deg', 'provisional_flexion_proxy_deg', 'valid', 'invalid_reason', 'angle_definition_version', 'proxy_definition_version', 'model_version', 'model_asset_sha256', 'qc_policy_version', 'schema_version', 'sampling_hz'];
  const rows: (string | number | boolean | null)[][] = [header];
  for (const s of session.samples) for (const side of ['left', 'right'] as const) {
    const a = s[side], m = session.metadata;
    rows.push([m.sessionId, session.sourceFilename, s.sourceTimeMs, s.requestedTimeMs, s.sampleIndex, 'knee', side, a.rawAngleDeg, flexionProxy(a), a.valid, a.invalidReasons.join('|'), m.angleDefinitionVersion, PROXY_DEFINITION, m.model.packageVersion, m.model.assetSha256, m.qcPolicyVersion, m.schemaVersion, session.samplingHz]);
  }
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
export function downloadFile(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
