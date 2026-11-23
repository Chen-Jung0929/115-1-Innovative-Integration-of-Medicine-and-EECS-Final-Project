import { describe, expect, it } from 'vitest';
import { createLiveAnalyzer, createReadyGate, dueForSample, liveSession, LIVE_SAMPLING_HZ, READY_POLICY } from './live';
import { fullFrameSelection } from '../input/singleSubject';
import { humanPose } from '../test/fixtures';
import { toCsv } from '../export/csv';
import { kneeAngle } from '../biomechanics/knee';
import { createPerformanceRecorder } from './livePerformance';
const info = (selection: ReturnType<typeof fullFrameSelection>) => ({ width: 640, height: 360, selection, displayMirrored: true, startedAt: 0, modelPreparationMs: 0, appVersion: 'test', model: { packageVersion: 'x', assetId: 'local-task-file', assetSha256: 'abc', delegate: 'CPU' } });
describe('live camera analysis', () => {
  it('rate-limits presented frames to the live sampling rate without reusing old poses', () => {
    expect(dueForSample(null, 0)).toBe(true);
    expect(dueForSample(0, 33)).toBe(false);
    expect(dueForSample(0, 99.9)).toBe(true); // 3 frames at 30 fps
    expect(dueForSample(0, Number.NaN)).toBe(false);
    expect(LIVE_SAMPLING_HZ).toBeGreaterThanOrEqual(5);
  });
  it('uses the same knee angle and QC gates as uploaded video', () => {
    const live = createLiveAnalyzer(640, 360, fullFrameSelection(640, 360));
    const out = [0, 100, 200, 300].map(t => live.step([humanPose()], t)!);
    const ready = out.at(-1)!;
    expect(ready.tracking.accepted).toBe(true);
    expect(ready.left).toEqual(kneeAngle(humanPose(), 'left', 640, 360));
    expect(ready.decode.timeBasis).toBe('presentation');
    expect(ready.requestedTimeMs).toBe(ready.sourceTimeMs);
  });
  it('drops duplicate or backwards timestamps instead of sending them to the model', () => {
    const live = createLiveAnalyzer(640, 360, fullFrameSelection(640, 360));
    expect(live.step([humanPose()], 100)).not.toBeNull();
    expect(live.step([humanPose()], 100)).toBeNull();
    expect(live.step([humanPose()], 50)).toBeNull();
    expect(live.samples).toHaveLength(1);
  });
  it('a second person in view stops measurement and stays locked until a new live segment', () => {
    const selection = fullFrameSelection(640, 360);
    const live = createLiveAnalyzer(640, 360, selection);
    for (let t = 0; t <= 500; t += 100) live.step([humanPose()], t);
    const crowded = live.step([humanPose(), humanPose(-.3)], 600)!;
    expect(crowded.left.valid).toBe(false);
    expect(crowded.tracking.state).toBe('MANUAL_REVIEW_REQUIRED');
    for (let t = 700; t <= 1500; t += 100) expect(live.step([humanPose()], t)!.tracking.accepted).toBe(false);
    const fresh = createLiveAnalyzer(640, 360, selection);
    for (let t = 0; t <= 300; t += 100) fresh.step([humanPose()], t);
    expect(fresh.samples.at(-1)!.left.valid).toBe(true);
  });
  it('packages a live segment as a camera session that exports to the existing CSV', () => {
    const selection = fullFrameSelection(640, 360);
    const live = createLiveAnalyzer(640, 360, selection);
    for (let t = 1000; t <= 1400; t += 100) live.step([humanPose()], t);
    const session = liveSession(live.samples, info(selection), 5000);
    expect(session.metadata.inputKind).toBe('camera');
    expect(session.metadata.inferenceMirrored).toBe(false);
    expect(session.metadata.displayMirrored).toBe(true);
    expect(session.durationMs).toBe(400);
    expect(session.sourceFilename).toBe('live-camera');
    expect(toCsv(session).trim().split('\r\n')).toHaveLength(1 + 5 * 2);
    expect(session.livePerformance).toBeUndefined();
    const perf = createPerformanceRecorder({ userAgent: 'test', delegate: 'CPU', width: 640, height: 360, warmUpMs: 1, sourceClockOffsetMs: 1000 }).summary();
    expect(liveSession(live.samples, info(selection), 5000, perf).livePerformance?.sourceClockOffsetMs).toBe(1000);
    expect(session.cameraPitch).toBeUndefined(); // optional field, schema not bumped
    expect(liveSession(live.samples, info(selection), 5000, undefined, { deg: 12, source: 'device-orientation', readings: 30 }).cameraPitch?.deg).toBe(12);
  });
});
describe('hands-free ready gate', () => {
  it('starts only after one still, full-body person has been seen for the hold time', () => {
    const gate = createReadyGate(640, 360);
    const results = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500].map(t => gate.observe([humanPose()], t));
    expect(results.slice(0, -1).every(r => !r.ready)).toBe(true);
    expect(results.at(-1)!.ready).toBe(true);
    expect(READY_POLICY.holdMs).toBe(1500);
  });
  it('restarts the hold when the person moves, is partly out of view, or someone else appears', () => {
    const gate = createReadyGate(640, 360);
    for (let t = 0; t <= 1000; t += 100) gate.observe([humanPose()], t);
    expect(gate.observe([humanPose(.2)], 1100).reason).toBe('moving');
    expect(gate.observe([humanPose(.2), humanPose(-.3)], 1200).reason).toBe('multiple-people');
    const cut = humanPose(.2); cut[25]!.visibility = .1; cut[26]!.visibility = .1;
    expect(gate.observe([cut], 1300).reason).toBe('not-full-body');
    expect(gate.observe([], 1400).reason).toBe('no-person');
    for (let t = 1500; t < 3000; t += 100) expect(gate.observe([humanPose(.2)], t).ready).toBe(false);
    expect(gate.observe([humanPose(.2)], 3000).ready).toBe(true);
  });
  it('a long gap between frames does not count as standing still', () => {
    const gate = createReadyGate(640, 360);
    gate.observe([humanPose()], 0);
    expect(gate.observe([humanPose()], 2000).ready).toBe(false);
  });
});
