# shark-game-assets skill/plugin

Agent skills by cppeng for generating and wiring GLB assets into browser 3D games.

Install with the [skills CLI](https://skills.sh):

```bash
npx skills add https://github.com/Alterverse-tech/shark_game_assets --skill shark-game-assets
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

## Live Regeneration Preview Template

This repo includes a canonical live-preview template at:

```text
shark-game-assets/templates/regeneration/
```

Use it when a game regeneration process needs to show models dynamically as they complete. The template provides:

- `public/regeneration.html`: fixed UI structure with a left progress list and right Three.js model viewer.
- `src/regeneration-preview.js`: polling viewer logic using `GLTFLoader` and `OrbitControls`.
- `public/regeneration-status.json`: status data shape for progress, ready URLs, clips, and errors.

The served page should remain `/regeneration.html`. In the blood moon castle project this is the page seen at `http://127.0.0.1:4173/regeneration.html`, but the source of truth is the bundled template, not a scraped localhost page.

Static contract check:

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
  subskills/
    tripo-rig-clip.md
    third-person-escape-room-game.md
  templates/regeneration/
    regeneration.html
    regeneration-preview.js
    regeneration-status.sample.json
    README.md
```
