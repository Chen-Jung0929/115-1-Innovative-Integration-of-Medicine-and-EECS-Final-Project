# Agent working agreement

## Mission and scope
Build the NTU 115-1 Real-Time Joint Motion Analysis System as an academic PoC.
Read README.md, docs/PROJECT_SPEC.md, docs/DECISIONS.md and the latest iteration update before work.
The current authorized task is Dataset Demo V0. Keep clinical definitions provisional and do not start camera or clinical analysis features.
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
