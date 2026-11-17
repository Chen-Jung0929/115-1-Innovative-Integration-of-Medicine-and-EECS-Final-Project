import type { Session } from '../domain/analysis';
import { flexionProxy } from '../biomechanics/knee';
import { PROXY_DEFINITION } from '../domain/analysis';
import type { AngleValue, AnatomicalSide, ScalarValue } from '../domain/measurement';
import { POSTURE_POLICY, hipFlexionProxy } from '../biomechanics/posture';
type Validity = AngleValue | ScalarValue;
/** One exported measurement row; knee rows keep their original column meaning. */
interface MetricRow { joint: string; side: string; angle: number | null; proxy: number | null; final: Validity; raw: Validity; auto: Validity; rawValue: number | null; angleDefinition: string; proxyDefinition: string; qc: AnatomicalSide | null; value: number | null; unit: 'deg' | 'hip-width' }
function cell(value: string | number | boolean | null): string {
  // Text that spreadsheet software could execute is explicitly neutralized.
  let text = value === null ? '' : String(value);
  if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function serializeCsv(rows:readonly(readonly(string|number|boolean|null)[])[]):string {
  return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
export function toCsv(session: Session): string {
  const run=session.run??session.qcReplay?.detectionRun;
  const header = ['session_id', 'source_filename', 'source_time_ms', 'requested_time_ms', 'sample_index', 'joint', 'side', 'raw_angle_deg', 'provisional_flexion_proxy_deg', 'valid', 'invalid_reason', 'angle_definition_version', 'proxy_definition_version', 'model_version', 'model_asset_sha256', 'qc_policy_version', 'schema_version', 'sampling_hz', 'selection_id', 'roi_x', 'roi_y', 'roi_width', 'roi_height', 'tracking_identity', 'tracking_reasons', 'landmark_confidence', 'anatomical_plausibility', 'temporal_continuity', 'ungated_geometric_angle_deg', 'auto_valid', 'auto_invalid_reason', 'human_label', 'human_identity_id', 'reviewer_id', 'tracking_policy_version', 'ungated_invalid_reason', 'timestamp_basis', 'decode_method', 'decode_warnings', 'roi_source', 'roi_update_reason', 'manual_keyframe_id', 'selection_revision', 'parent_session_id', 'tracking_state', 'full_frame_search_status', 'pipeline_id', 'inference_space', 'num_poses', 'source_sha256', 'comparison_id', 'selected_candidate_index', 'proposed_candidate_index', 'subject_selection_reason', 'analysis_duration_ms', 'target_reference_x', 'target_reference_y', 'target_reference_width', 'target_reference_height','subject_tracking_accepted','joint_qc_state','joint_qc_valid','joint_qc_reasons','joint_recovery_confirmations','qc_replay_strategy','metric_value','metric_unit','ungated_metric_value'];
  const rows: (string | number | boolean | null)[][] = [header];
  const m = session.metadata;
  const row = (s: Session['samples'][number], x: MetricRow) => [m.sessionId, session.sourceFilename, s.sourceTimeMs, s.requestedTimeMs, s.sampleIndex, x.joint, x.side, x.angle, x.proxy, x.final.valid, x.final.invalidReasons.join('|'), x.angleDefinition, x.proxyDefinition, m.model.packageVersion, m.model.assetSha256, m.qcPolicyVersion, m.schemaVersion, session.samplingHz, session.subjectSelection.id, s.roi.x, s.roi.y, s.roi.width, s.roi.height, s.tracking.identity, s.tracking.reasons.join('|'), s.tracking.landmarkConfidence, s.tracking.plausibility, s.tracking.continuity, x.rawValue, x.auto.valid, x.auto.invalidReasons.join('|'), s.review?.label ?? '', s.review?.identityId ?? '', s.review?.reviewerId ?? '', String(session.trackingPolicy.version), x.raw.invalidReasons.join('|'), s.decode.timeBasis, s.decode.method, s.decode.warnings.join('|'),s.roiSource,s.roiUpdateReason,s.manualKeyframeId,session.analysisRevision.selectionRevision,session.analysisRevision.parentSessionId,s.tracking.state,s.search?.status??'',run?.pipeline.id??'legacy-roi-crop',run?.inputSpace??'roi-crop',run?.pipeline.numPoses??1,run?.sourceSha256??'',run?.comparisonId??'',s.subjectDecision?.selectedIndex??null,s.subjectDecision?.proposedIndex??null,s.subjectDecision?.reason??'',session.run?.analysisDurationMs??null,s.targetReferenceRoi?.x??null,s.targetReferenceRoi?.y??null,s.targetReferenceRoi?.width??null,s.targetReferenceRoi?.height??null,s.tracking.accepted,x.qc?s.tracking.joints?.[x.qc].state??null:null,x.qc?s.tracking.joints?.[x.qc].valid??null:null,x.qc?s.tracking.joints?.[x.qc].reasons.join('|')??null:null,x.qc?s.tracking.joints?.[x.qc].confirmationCount??null:null,session.qcReplay?.strategy??null,x.value,x.unit,x.raw.valid?('rawAngleDeg' in x.raw?x.raw.rawAngleDeg:x.raw.value):null];
  const angleRow = (joint: string, side: string, final: AngleValue, raw: AngleValue, auto: AngleValue, angleDefinition: string, proxyDefinition: string, proxy: number | null, qc: AnatomicalSide | null): MetricRow =>
    ({ joint, side, angle: final.rawAngleDeg, proxy, final, raw, auto, rawValue: raw.rawAngleDeg, angleDefinition, proxyDefinition, qc, value: final.rawAngleDeg, unit: 'deg' });
  for (const s of session.samples) {
    for (const side of ['left', 'right'] as const) rows.push(row(s, angleRow('knee', side, s[side], s.rawAngles[side], s.automaticAngles[side], m.angleDefinitionVersion, PROXY_DEFINITION, flexionProxy(s[side]), side)));
    const p = s.posture;
    if (!p) continue; // Sessions before schema 10 have knee rows only.
    for (const side of ['left', 'right'] as const) rows.push(row(s, angleRow('hip', side, p.final.hip[side], p.raw.hip[side], p.automatic.hip[side], POSTURE_POLICY.hipDefinition, POSTURE_POLICY.hipProxyDefinition, hipFlexionProxy(p.final.hip[side]), side)));
    rows.push(row(s, angleRow('trunk_lean', 'midline', p.final.trunkLean, p.raw.trunkLean, p.automatic.trunkLean, POSTURE_POLICY.trunkLeanDefinition, '', null, null)));
    for (const side of ['left', 'right'] as const) {
      const r = p.final.kneeToe[side];
      rows.push(row(s, { joint: 'knee_toe_offset', side, angle: null, proxy: null, final: r, raw: p.raw.kneeToe[side], auto: p.automatic.kneeToe[side], rawValue: null, angleDefinition: POSTURE_POLICY.kneeToeDefinition, proxyDefinition: '', qc: side, value: r.value, unit: 'hip-width' }));
    }
  }
  return serializeCsv(rows);
}
export function downloadFile(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
