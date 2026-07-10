# shark-game-assets skill/plugin

Agent skills by cppeng for generating and wiring GLB assets into browser 3D games.

Install with the [skills CLI](https://skills.sh):

```bash
npx skills add https://github.com/Alterverse-tech/shark_game_assets --skill shark-game-assets -g
```

## Skills

### shark-game-assets

Generate game-ready GLB assets (player, enemies, collectibles, props) for Three.js / WebGL games while your agent codes. Generation runs on a remote asset service — no Tripo or Gemini API keys needed locally.

Uses the default asset service at `http://54.81.110.182:3001`. Ask the publisher for a token:

```bash
export GAME_ASSETS_API_TOKEN=<your token>
```

Set `GAME_ASSETS_API_URL` only if you need to override the default service.

Docs & downloads: http://54.81.110.182:3001/generated-assets/site/

## Publish Finished Games

The skill can publish a checked static build to a Shark Coding Agent portal after the user explicitly chooses to upload it:

```bash
export SHARK_PORTAL_URL=https://your-portal.example.com
export SHARK_PORTAL_TOKEN=<portal-upload-token>

node shark-game-assets/scripts/publish-game.mjs check --cwd "$PWD" --dist dist --title "My Game"
node shark-game-assets/scripts/publish-game.mjs publish --cwd "$PWD" --dist dist --title "My Game" --confirm-upload
```

The portal token is separate from `GAME_ASSETS_API_TOKEN`. Only built files under `dist/` are uploaded; the script rejects project roots, symlinks, hidden/secret files, source maps, unsafe paths, and non-portable root-relative asset URLs.

## Token And Remote Authorization

`GAME_ASSETS_API_TOKEN` is required, but token presence is not the same as consent to send it to a remote host. Before the skill calls readiness, generate, or animate, the user must authorize using the token with the configured asset service, for example:

```md
I authorize using GAME_ASSETS_API_TOKEN with http://54.81.110.182:3001 for shark-game-assets readiness/generate/animate calls. Do not print the token.
```

If the token is missing, the remote call is not authorized, the call is blocked by policy, or the asset service is unreachable, the skill must pause and ask the user how to proceed. It must not silently replace requested GLB generation with local placeholder/procedural models and present that as completed asset generation.

## What This Skill Covers

- Generates focused GLB assets for playable 3D games, not decorative filler.
- Wires generated assets into Three.js/WebGL projects through `GLTFLoader`.
- Keeps primitive gameplay fallbacks so missing GLBs do not break the game.
- Normalizes imported GLBs for runtime scale, ground placement, facing, and hitbox separation.
- Supports rigged character workflows with idle/walk clips through the Gemini-Tripo branch.

## Generation Routes

- `tripo`: fast text-to-model route for generic props, collectibles, hazards, vehicles, and secondary static objects.
- `gemini_reference`: Gemini creates a white-background reference image first, then Tripo creates the GLB. Use this for key characters, creatures, story-critical props, or anything that needs stronger silhouette control.
- Character/creature assets on `gemini_reference` continue into the rig/clip flow, producing a rigged GLB plus default idle/walk support when the remote service succeeds.

For explicit game regeneration requests:

- Key entity characters or critical entity props: use the Gemini-Tripo branch, `1-5` models total.
- Secondary static props: use the Tripo branch, `3-10` models total when those props materially improve gameplay.
- If the user says not to reuse historical assets, generate fresh IDs and do not wire old GLBs back into the regenerated game.

## Default Live Asset Preview

This repo includes a canonical live-preview template at:

```text
shark-game-assets/templates/regeneration/
```

The skill uses it by default for every generation, regeneration, rigging, animation, or GLB integration task, even when the user does not explicitly request a preview. Publish-only, explanation-only, read-only inspection, and explicit opt-out are excluded. The template provides:

- `public/regeneration.html`: fixed UI structure with a left progress list and right Three.js model viewer.
- `src/regeneration-preview.js`: polling viewer logic using `GLTFLoader` and `OrbitControls`, including separate base/action GLB buttons and action-clip playback on the base rig.
- `regeneration-plan.json`: current-run asset/action intent, kept separate from generated status.
- `public/regeneration-status.json`: derived progress, ready URLs, clips, and errors.

Set up and run the stable preview pipeline with:

```bash
# Write the current task's regeneration-plan.json first.
node shark-game-assets/scripts/setup-regeneration-preview.mjs --cwd "$PWD" --plan regeneration-plan.json --reset-status
node shark-game-assets/scripts/sync-regeneration-status.mjs --cwd "$PWD" --watch --interval 1000
node shark-game-assets/scripts/validate-regeneration-preview.mjs --cwd "$PWD"
```

This local preview setup is the first asset action after locating the workspace; it runs before token/authorization checks or remote calls. The synchronizer reads root and `.asset-batches/*` job/manifest files, writes status atomically, and marks an asset ready only after its GLB exists under `public/generated-assets`.

The served page should remain `/regeneration.html`. In the blood moon castle project this is the page seen at `http://127.0.0.1:4173/regeneration.html`, but the source of truth is the bundled template, not a scraped localhost page.

Static contract check (the validator also checks schemas and ready files):

```bash
rg -n 'id="list"|id="stage"|id="status"|class="app"|regeneration-preview\.bundle\.js' public/regeneration.html
rg -n 'regeneration-status\.json|new GLTFLoader|new OrbitControls|stage\.appendChild|setInterval\(poll, 2000\)' src/regeneration-preview.js
```

## Third-Person Escape Room Subskill

The bundled subskill `subskills/third-person-escape-room-game.md` is for browser-runnable third-person top-down 3D escape room games built from a supplied script.

It captures requirements for:

- Three.js/native JS or React Three Fiber.
- Script-faithful story, visual style, map, puzzles, characters, and themes.
- Playable brightness for dark/gothic scenes.
- Camera-relative WASD movement.
- Keyboard shortcuts for interaction, hints/objectives, and modal choices.
- Player face/body rotation toward actual movement direction.
- Circular-footprint collision instead of center-point-only collision.
- Realistic physical constraints for doors, locks, props, mechanisms, and walls.
- Focused browser/computer playtesting when the user explicitly allows or requests it.

Playable handoff is prioritized: when automated/browser verification is slow but the game is runnable, provide the URL first and clearly state what has and has not been tested.

## Files

```text
shark-game-assets/
  SKILL.md
  scripts/game-assets-mcp.mjs
  scripts/setup-regeneration-preview.mjs
  scripts/sync-regeneration-status.mjs
  scripts/validate-regeneration-preview.mjs
  scripts/publish-game.mjs
  references/regeneration-preview.md
  subskills/
    tripo-rig-clip.md
    third-person-escape-room-game.md
  templates/regeneration/
    regeneration.html
    regeneration-preview.js
    regeneration-plan.sample.json
    regeneration-status.sample.json
```
