# Stable regeneration preview

Use this reference when a game asset run needs `/regeneration.html`, live progress, base-model previews, or semantic action GLB previews.

## Contents

1. Architecture and ownership
2. Plan contract
3. Derived status contract
4. Source discovery and merge rules
5. Model and action loading
6. Setup and run commands
7. Validation and localhost checks
8. Failure modes

## 1. Architecture and ownership

Keep four layers separate:

| Layer | Canonical file | Owns | Must not own |
| --- | --- | --- | --- |
| Plan | `regeneration-plan.json` | Current run id, requested base assets, semantic actions | Remote progress or guessed URLs |
| Facts | `asset-jobs.json`, `.asset-batches/*/asset-jobs.json`, manifests, local GLBs | Observed generation results | UI state |
| Derived status | `public/regeneration-status.json` | Normalized pending/running/ready/failed state | Historical assets from another run |
| Viewer | `public/regeneration.html` + bundle | Polling, buttons, GLB display, action playback | Editing generation state |

Never make the HTML discover model files by scanning directories. The synchronizer resolves the current plan against known job and manifest facts, validates local files, and writes the only JSON the viewer consumes.

## 2. Plan contract

Create a fresh plan before generation. Use a fresh `runId` and `startedAt` whenever the user explicitly requests regeneration without historical reuse.

```json
{
  "version": 1,
  "runId": "blood-moon-20260710-01",
  "startedAt": "2026-07-10T13:40:00.000Z",
  "items": [
    {
      "id": "detective-player",
      "name": "Detective Player",
      "role": "player",
      "actions": ["idle", "walk"]
    },
    {
      "id": "brass-key",
      "name": "Brass Key",
      "role": "key-prop",
      "actions": []
    }
  ]
}
```

Rules:

- Keep ids stable, unique, and kebab-case.
- List semantic actions explicitly. Do not infer them from filenames.
- Use `startedAt` to exclude stale job/manifest files from an older run.
- Keep base models in `items`; keep action GLBs in each item's `actions`/derived `clips`.

## 3. Derived status contract

The synchronizer writes:

```json
{
  "status": "running",
  "runId": "blood-moon-20260710-01",
  "updatedAt": "2026-07-10T13:45:00.000Z",
  "message": "2 个基础模型：1 可预览、1 生成中、0 失败；2 个动作模型：1 可预览、1 生成中、0 失败。",
  "items": [
    {
      "id": "detective-player",
      "name": "Detective Player",
      "role": "player",
      "status": "ready",
      "progress": 100,
      "runtimeUrl": "/generated-assets/detective-player.glb",
      "clips": [
        {
          "name": "idle",
          "status": "ready",
          "progress": 100,
          "runtimeUrl": "/generated-assets/detective-player-idle.glb",
          "error": ""
        }
      ],
      "error": ""
    }
  ],
  "failures": []
}
```

Use only `pending`, `running`, `ready`, and `failed` for item/clip state. A server-side `success` without a local GLB remains `running` at at most 99%; `ready` means the runtime file exists under `public/generated-assets`.

## 4. Source discovery and merge rules

`sync-regeneration-status.mjs` reads, oldest to newest:

- `<cwd>/asset-jobs.json`
- `<cwd>/asset_manifest.json`
- `<cwd>/.asset-batches/*/asset-jobs.json`
- `<cwd>/.asset-batches/*/asset_manifest.json`

It accepts v2 `model.url`/`actions`, legacy `url`/`animationClips`, job `localUrl`, and local HTTP URLs whose path begins `/generated-assets/`. It rejects Tripo/Gemini signed remote URLs as runtime URLs.

It also checks the deterministic client filenames `<id>.glb` and `<id>-<action>.glb`. It never guesses UUID directories or picks the first GLB in a folder.

Every write uses a temporary file plus atomic rename. `updatedAt` changes only when semantic status changes, so the viewer does not redraw continuously.

## 5. Model and action loading

The viewer renders base and action GLBs as separate buttons. Each button shows its actual filename.

For a base model:

1. Load `item.runtimeUrl` with `GLTFLoader`.
2. Normalize with `THREE.Box3`: uniform scale, horizontal centering, ground at `y=0`.
3. Display embedded animation only when the base GLB actually contains one.

For an action:

1. Load the visible base model from `item.runtimeUrl`.
2. Load the action GLB from `clip.runtimeUrl`.
3. Extract the first `AnimationClip` from the action GLB.
4. Verify at least one track target exists on the base model.
5. Play the clip with one `AnimationMixer` on the base root.
6. If the skeleton cannot bind, directly display the action GLB scene and play its clip, while stating that fallback in the status overlay.

Use a monotonically increasing request id so a slow prior GLB load cannot replace a newer user selection. Include `updatedAt` as a URL query to avoid stale browser-cached models after regeneration.

## 6. Setup and run commands

```bash
node <skill-dir>/scripts/setup-regeneration-preview.mjs --cwd "$(pwd)"
```

Edit `regeneration-plan.json`, then start the local-only synchronizer before the first generation call:

```bash
node <skill-dir>/scripts/sync-regeneration-status.mjs \
  --cwd "$(pwd)" \
  --watch \
  --interval 1000
```

For split batches, write each client run under `.asset-batches/<batch-name>`; the watcher discovers them automatically. These preview scripts do not use tokens and make no remote calls.

After assets finish, keep the watcher running until the final manifest and GLBs are in place, then stop it normally.

## 7. Validation and localhost checks

Run the deterministic validator:

```bash
node <skill-dir>/scripts/validate-regeneration-preview.mjs --cwd "$(pwd)"
```

It checks the DOM contract, Three.js imports/behavior markers, bundle existence, matching plan/status `runId`, exact planned base/action slots with no historical extras, safe runtime paths, and every ready GLB on disk.

Before reporting a localhost URL, verify the actual listener and content:

```bash
lsof -nP -iTCP:4173 -sTCP:LISTEN
curl -fsS -D - -o /tmp/regeneration-status.json \
  "http://127.0.0.1:4173/regeneration-status.json?t=$(date +%s)"
```

Do not assume the process bound to `0.0.0.0` receives `127.0.0.1` traffic when another process is already bound specifically to `127.0.0.1` on the same port. Stop the stale listener only when authorized, or choose a different port and report it.

## 8. Failure modes

- **Progress says success, button remains disabled:** the GLB has not been downloaded to `public/generated-assets`; keep it at 99% running.
- **Old models appear:** use a fresh plan `runId`/`startedAt`; remove or isolate stale job files and never merge previous status as truth.
- **Action buttons do not appear:** ensure actions are in the plan and clips are included in the status signature.
- **Action button loads a T-pose:** verify the action GLB contains an `AnimationClip`; use direct action-scene fallback if the clip cannot bind the base skeleton.
- **Page remains stale:** rebuild the bundle through the setup script; it writes a content-hash query into the script URL. Status fetches use `cache: no-store` plus a timestamp.
- **Wrong localhost project appears:** inspect `lsof` and response headers; a stale loopback-only server may shadow the intended dev server.
