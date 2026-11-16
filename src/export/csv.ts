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
  const header = ['session_id', 'source_filename', 'source_time_ms', 'requested_time_ms', 'sample_index', 'joint', 'side', 'raw_angle_deg', 'provisional_flexion_proxy_deg', 'valid', 'invalid_reason', 'angle_definition_version', 'proxy_definition_version', 'model_version', 'model_asset_sha256', 'qc_policy_version', 'schema_version', 'sampling_hz', 'selection_id', 'roi_x', 'roi_y', 'roi_width', 'roi_height', 'tracking_identity', 'tracking_reasons', 'landmark_confidence', 'anatomical_plausibility', 'temporal_continuity', 'ungated_geometric_angle_deg', 'auto_valid', 'auto_invalid_reason', 'human_label', 'human_identity_id', 'reviewer_id', 'tracking_policy_version', 'ungated_invalid_reason', 'timestamp_basis', 'decode_method', 'decode_warnings', 'roi_source', 'roi_update_reason', 'manual_keyframe_id', 'selection_revision', 'parent_session_id', 'tracking_state', 'full_frame_search_status'];
  const rows: (string | number | boolean | null)[][] = [header];
  for (const s of session.samples) for (const side of ['left', 'right'] as const) {
    const a = s[side], m = session.metadata;
    rows.push([m.sessionId, session.sourceFilename, s.sourceTimeMs, s.requestedTimeMs, s.sampleIndex, 'knee', side, a.rawAngleDeg, flexionProxy(a), a.valid, a.invalidReasons.join('|'), m.angleDefinitionVersion, PROXY_DEFINITION, m.model.packageVersion, m.model.assetSha256, m.qcPolicyVersion, m.schemaVersion, session.samplingHz, session.subjectSelection.id, s.roi.x, s.roi.y, s.roi.width, s.roi.height, s.tracking.identity, s.tracking.reasons.join('|'), s.tracking.landmarkConfidence, s.tracking.plausibility, s.tracking.continuity, s.rawAngles[side].rawAngleDeg, s.automaticAngles[side].valid, s.automaticAngles[side].invalidReasons.join('|'), s.review?.label ?? '', s.review?.identityId ?? '', s.review?.reviewerId ?? '', String(session.trackingPolicy.version), s.rawAngles[side].invalidReasons.join('|'), s.decode.timeBasis, s.decode.method, s.decode.warnings.join('|'),s.roiSource,s.roiUpdateReason,s.manualKeyframeId,session.analysisRevision.selectionRevision,session.analysisRevision.parentSessionId,s.tracking.state,s.search?.status??'']);
  }
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
export function downloadFile(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
