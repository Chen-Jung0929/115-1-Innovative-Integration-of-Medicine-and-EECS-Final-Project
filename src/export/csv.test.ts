import { makeSample, selection } from '../test/fixtures';
import { expect, it } from 'vitest';
import { toCsv } from './csv';
import type { Session } from '../domain/analysis';
const session: Session = {
  subjectSelection:selection,trackingPolicy:{version:'test'},sourceFilename:'=SUM(1,2)".mp4',durationMs:1000,samplingHz:5,
  metadata:{schemaVersion:'2',sessionId:'synthetic-test',sourceId:'synthetic-fixture',inputKind:'video',sourceWidthPx:200,sourceHeightPx:100,inferenceMirrored:false,displayMirrored:false,model:{packageVersion:'test-only',assetId:'test',assetSha256:'test-hash',delegate:'CPU'},angleDefinitionVersion:'knee-image-interior-v1',qcPolicyVersion:'test',applicationVersion:'test',createdAtUtc:'2026-11-16T00:00:00Z'},
  samples:[makeSample({sampleIndex:0,requestedTimeMs:0,sourceTimeMs:0,landmarks:[],left:{valid:true,rawAngleDeg:0,invalidReasons:[]},right:{valid:false,rawAngleDeg:null,invalidReasons:['missing-landmark']}})],
};
it('serializes one row per side, preserves valid zero and null invalid measurement', () => {
  const rows=toCsv(session).split('\r\n');
  expect(rows).toHaveLength(4);
  expect(rows[0]).toContain('source_time_ms'); expect(rows[0]).toContain('model_asset_sha256');
  expect(rows[1]).toContain('"left","0","180","true",""');
  expect(rows[2]).toContain('"right","","","false","missing-landmark"');
});
it('quotes comma / quotes and neutralizes spreadsheet formula filenames', () => {
  expect(toCsv(session)).toContain('"\'=SUM(1,2)"".mp4"');
});
it('keeps metadata and definition identity on exported rows', () => {
  expect(toCsv(session)).toContain('knee-image-interior-v1'); expect(toCsv(session)).toContain('knee-flexion-proxy-180-minus-interior-v1');
  expect(toCsv(session)).toContain('test-only'); expect(toCsv(session)).toContain('test-hash');
});

it('exports human-rejected angles as invalid while retaining automatic decisions and ROI',async()=>{
 const {applyReview}=await import('../validation/targetMetrics');
 const reviewed=applyReview(session.samples[0]!,{label:'wrong-target',identityId:'person-B',reviewerId:'rater-A'});
 const csv=toCsv({...session,samples:[reviewed]});
 expect(csv).toContain('"left","","","false","identity-uncertain"');
 expect(csv).toContain('"wrong-target","person-B","rater-A"');
 expect(csv).toContain('"synthetic-selection"');expect(reviewed.automaticAngles.left.valid).toBe(true);
 expect(csv.split('\r\n')[0]).toContain('ungated_geometric_angle_deg');
});
