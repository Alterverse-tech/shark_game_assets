---
name: tripo-rig-clip
description: Animate an existing Tripo GLB/model task by running Tripo rig plus one-preset-at-a-time retarget, producing separate GLB files for idle/walk/run/jump clips.
---

# Tripo Rig Clip

Use this subskill when the user already has a GLB or Tripo model task and asks for rigging, auto-rigging, animation clips, retargeting, idle, walk, run, jump, or fixing Tripo multi-animation retarget issues. Also use it as the required continuation of the `gemini_reference` route for generated `character` or `creature` assets.

## Non-negotiable rules

- Stable biped pipeline: `animate_rig` then `animate_retarget`.
- For biped humanoids, use Rig model `v1.0-20240301` for `/animations/rig` and retarget against the same rig version.
- Never send multiple presets in a single `/animations/retarget` request. Do not send `animations: ["preset:biped:idle", "preset:biped:walk"]` directly to Tripo.
- Tripo batch retarget can corrupt the second and later clips, often as arm crossing, center-line hand collapse, or exaggerated shoulder rotation. This is a Tripo retarget pipeline problem, not a GLB multi-clip limitation.
- Store each retargeted clip as its own GLB. Do not merge clips into one GLB in this flow.
- Default required biped clips are `preset:biped:idle` and `preset:biped:walk`.
- Optional biped clips are only `preset:biped:run` and `preset:biped:jump`, and only when the user explicitly requests them.

## Preferred client workflow

When the parent `generate` command uses `route: "gemini_reference"` for `assetKind: "character"` or `"creature"`, the remote asset API runs this rig/clip flow automatically after Tripo image-to-model succeeds. In that case, do not call `animate` again unless the user asks to regenerate a specific optional clip or repair a bad clip.

Use the parent skill's bundled client. It calls the asset API and splits explicit multi-preset requests into one `/api/asset-jobs/animate` call per preset.

For required default clips (`idle` + `walk`), omit `animations`:

```bash
node <skill-dir>/scripts/game-assets-mcp.mjs animate --cwd "$(pwd)" --params '{
  "originalModelTaskId": "task_xxxxxxxx",
  "assetId": "eleanor-blackwood",
  "assetName": "Eleanor Blackwood",
  "role": "player",
  "spec": "mixamo",
  "modelVersion": "v1.0-20240301"
}'
```

For one optional clip:

```bash
node <skill-dir>/scripts/game-assets-mcp.mjs animate --cwd "$(pwd)" --params '{
  "originalModelTaskId": "task_xxxxxxxx",
  "assetId": "eleanor-blackwood",
  "assetName": "Eleanor Blackwood",
  "animations": ["preset:biped:run"]
}'
```

If the user asks for both optional clips, the client may accept `["preset:biped:run", "preset:biped:jump"]`, but it must split them into separate API calls. The server and Tripo must never receive a multi-preset retarget call.

## Output contract

The client writes or updates `asset_manifest.json`:

```json
{
  "assets": [
    {
      "id": "eleanor-blackwood",
      "role": "player",
      "name": "Eleanor Blackwood",
      "url": "/generated-assets/eleanor-blackwood-rigged.glb",
      "format": "glb",
      "rigged": true,
      "rigType": "biped",
      "animationClips": [
        { "name": "idle", "preset": "preset:biped:idle", "url": "/generated-assets/eleanor-blackwood-idle.glb", "format": "glb" },
        { "name": "walk", "preset": "preset:biped:walk", "url": "/generated-assets/eleanor-blackwood-walk.glb", "format": "glb" }
      ]
    }
  ]
}
```

The main rigged model is for the character skin/skeleton. Each `animationClips[].url` is a separate GLB containing a retargeted clip for the compatible rig.

## Runtime wiring

- Load the main rigged GLB with `GLTFLoader`.
- Load each clip GLB separately, read its `gltf.animations`, and map clips by `name` / `preset` substrings such as `idle`, `walk`, `run`, `jump`.
- Play clips on the main character with `THREE.AnimationMixer`.
- Call `mixer.update(delta)` every frame.
- If a clip GLB has no usable `gltf.animations`, keep the character playable and fall back to procedural bob/tilt only for that state.

## QA checklist

- Confirm `asset_manifest.json` has separate `animationClips` entries, not one GLB claiming multiple generated clips.
- Inspect each generated GLB's `gltf.animations.length`.
- Visually test idle and walk first. Test run/jump only if explicitly generated.
- Watch for hand crossing, wrist collapse, shoulder over-rotation, foot sliding, and root motion drift.
- If a clip is malformed, regenerate that single preset only. Do not retry a batch retarget request.
