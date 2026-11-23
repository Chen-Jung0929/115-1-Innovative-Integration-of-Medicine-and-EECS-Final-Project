# Agent working agreement

## Mission and scope
Build the NTU 115-1 Real-Time Joint Motion Analysis System as an academic PoC.
Read README.md, docs/PROJECT_SPEC.md, docs/DECISIONS.md and the latest iteration update before work.
The current authorized tasks are Dataset Demo V0 and the V1 live camera input (see docs/updates/iteration-14-live-camera.md). Keep clinical definitions provisional and do not start clinical analysis features.
V2 (authorized 2026-11-17 by the team, iteration 15): frontal checks from the Movement analysis handout — p.5 landmarks, baseline locked from a standing calibration (default: standing trunk midline; handout heel midpoint selectable), provisional prompts relative to the standing calibration; automatic view detection (frontal / side / oblique) with side-view knee-forward and trunk-lean checks (handout p.12) in side views. Thresholds stay provisional until the PT group confirms them; prompts are derived at display time, not persisted.
Use the existing checkout. Do not create worktrees unless explicitly requested.

## Engineering rules
- React + TypeScript + Vite. Keep input adapters, MediaPipe adapter, pure biomechanics,
  motion analysis, visualization, serialization and Python validation separate.
- Video and camera must call the same core angle implementation. Core modules must not import React,
  browser capture APIs or MediaPipe runtime classes.
- Install with `npm ci`; commit package-lock.json. Node pin: .nvmrc.
  Cloud fallback for an unwritable default cache: `npm ci --cache /workspace/.cache/npm`.
- Run `npm run typecheck`, `npm test`, `npm run build` for relevant frontend changes.
  Add meaningful mathematical fixtures when algorithms are introduced; do not claim geometry
  validation from the current screen tests. Run pytest once Python analysis is implemented.
- Maintain strict TypeScript. Do not silence errors or weaken tests to pass.
- Avoid adding unused libraries; MediaPipe, Recharts and Python dependencies enter with their actual features.

## Scientific rules
- Label 2D image-plane geometry, clinically defined angles, model-estimated 3D and reference
  measurements distinctly. Never claim MediaPipe is validated clinical measurement.
- Keep source timestamps, model/package/asset identifiers and hash, QC and definition versions,
  raw angle and validity. Missing measurements are null, never zero or silent interpolation.
- Correct normalized x/y for aspect ratio before 2D geometry. Model z is not calibrated depth.
  Anatomical left/right is not screen left/right; record display and inference mirroring separately.
- Definitions, clinical endpoints and acceptable errors require PT review. Record decisions, not guesses.
- Dataset form labels and future dual-camera estimates are not angle ground truth.

## Public repository and collaboration
- Never commit participant videos, faces, identifiers, raw landmarks, private annotations,
  session exports, secrets or credentials. Inspect staged paths and diff before every commit.
  .gitignore is only an accident guard; JSON can also contain sensitive data.
- Keep research data local and ignored or in approved restricted storage. No analytics or remote
  upload by default. Audit model/CDN/network behavior when inference is added.
- Each iteration: update Traditional Chinese README; add docs/updates/iteration-XX.md with
  completed work, exact checks/results, limitations and next steps; update decisions as needed.
- Commit and push authorized work; report SHA and PR URL if a PR actually exists. Never fabricate
  test results, license details, push success or clinical validity. Preserve unrelated user changes.

## Subject tracking rules
- Formal course name: 醫學電資創意整合專題. Preserve Git history.
- Read docs/ROI_TRACKING.md (current controller) and docs/SUBJECT_TRACKING.md (human metrics and historical baseline) before changing ROI, tracking or annotation metrics.
- Never equate landmark visibility, temporal consistency or candidate index with verified identity.
- Preserve per-candidate raw crop landmarks and source-mapped points; never stitch people.
- Version thresholds, record ROI/source timestamps, and keep raw, automatic and human-reviewed outcomes separate.
- Wrong/mixed/uncertain human review must invalidate final angles without erasing automatic decisions.
- Distinguish user-reported real-video evidence, synthetic regression and independently rerun measurements.

## Architecture comparison scope
- Read docs/PIPELINE_COMPARISON.md first. Pause ROI tracking expansion; retain B for regression.
- A/C must infer on original full frames. Target reference is selection metadata, never an implicit crop.
- Keep detection, selection, temporal identity, observation QC and angles separate. Never use candidate order as identity.
- Freeze source/model hashes and the sampling rate for comparisons (10 Hz since ADR-081; use `?hz=5` to reproduce runs made at the earlier 5 Hz); disclose decoder alignment and denominator limits.
- No fabricated human results or claims that cropping hypotheses are confirmed. Preserve raw/auto/manual results per pipeline.

## QC recovery and replay scope
- Read docs/QC_REPLAY.md before changing QC or recovery. The v0.5.1 restriction on UI applied to that iteration; v0.6 explicitly authorizes simplifying the main UI. Keep camera and new motion types out of scope.
- A local knee failure must not alone set a permanent subject identity lock. Keep torso identity, side observation and temporal evidence separate.
- Never auto-clear ambiguity/torso-jump/manual identity locks. Joint recovery needs consecutive reliable observations; do not interpolate angles.
- src/tracking/legacy is the frozen v0.5.0 replay baseline; do not tune it. Replay uses saved candidates/ROIs and is not a new detector run.
- Always report newly accepted samples and manual-label applicability. Increased validity/coverage is not accuracy. Preserve original research files.

## v0.6 primary scope
- Default to Full Frame + Single Pose in both UI and analyze. A valid upload must not require ROI confirmation.
- Mark generated whole-frame references controlled-single-default, never manual identity annotations; keep schema/version provenance.
- ROI, Multi-Pose and comparisons are experimental, collapsed by default; preserve their regression tests without expanding algorithms.
- Read docs/SINGLE_SUBJECT_DEMO.md. Local anomalies must remain side-local and recover conservatively; ambiguity/manual identity locks still reject.
- Separate software verification from real single-person Squat acceptance. Do not declare human stability from synthetic or mock tests.

## v0.6.1 bounded exception
- Only full-frame-single with controlled-single-default may treat a torso discontinuity as a bounded tentative recovery. Preserve hard ambiguity, explicit manual, timeout and out-of-anchor locks.
- Do not broaden ROI or multi-person tracking. Reports from saved candidates are QC replay, not new MediaPipe or identity/angle accuracy evidence.

## V1 live camera scope
- Camera is an input adapter only (src/input/camera.ts). Reuse motion/measure.ts and tracking/identity.ts; do not fork QC or angle logic for camera.
- A live manual-review lock ends that segment as-is (never unlocked). A new segment (new analyzer) may start hands-free only after the ready gate (READY_POLICY in motion/live.ts) sees one still, full-body pose. Never mirror inference frames.
- Camera e2e tests use Chromium's synthetic fake device; never commit recorded camera frames, faces or live exports.

