---
name: 3d-game-assets
description: Generate and wire key GLB assets for Codex-built 3D web games. Use when a Three.js, WebGL, or 3D mini game has recognizable entities such as a player, character, enemy, collectible, vehicle, weapon, hazard, boss, mascot, or key prop.
---

# 3D Game Assets

Use this skill when a 3D game needs concrete, recognizable GLB assets rather than only primitive geometry. The skill owns the end-to-end workflow: choose the route, generate a small focused asset set, write/read `asset_manifest.json`, and wire the GLBs into the game with fallbacks.

## Required behavior

- If the game prompt contains explicit or implicit entities, such as a player, character, enemy, collectible, vehicle, weapon, obstacle, boss, mascot, key prop, or environment object, GLB generation is a required stage when the tool is available.
- Generate only 1-3 key assets by default. Prioritize the player/main character first, then the gameplay-critical enemy, collectible, vehicle, hazard, or key prop. Do not generate decorative filler.
- Use primitive Three.js geometry only as an interim placeholder while assets are pending and as the runtime fallback if a GLB fails to load.
- Do not regenerate existing assets unless the user explicitly asks. If `asset_manifest.json` already has loadable assets, reuse it.
- Avoid copyrighted characters, brand names, logos, and celebrity likenesses. Rewrite into original designs.

## Route choice

Use `tripo` for the fast route: direct text prompt to Tripo3D text-to-model. This is best for generic props, enemies, collectibles, vehicles, obstacles, and fast iteration.

Use `gemini_reference` when visual control matters: Gemini first creates a pure-white-background reference image, then Tripo image-to-model creates the GLB. Prefer this route when the user mentions Gemini, Nano Banana, T-pose, white background, reference image, image-to-model, character sheet, style consistency, or when a key character's silhouette must be controlled.

Use `auto` only when you are comfortable with the server choosing from the prompt. If in doubt, choose the route yourself and pass it explicitly.

## Environment

The generation client is bundled with this skill at `scripts/game-assets-mcp.mjs` (Node >= 20, zero dependencies). It talks to the default remote asset API at `http://54.81.110.182:3001`.

- `GAME_ASSETS_API_URL` — optional override for the asset API base URL
- `GAME_ASSETS_API_TOKEN` — per-user access token

If the token is missing and the service requires authentication, ask the user to set `GAME_ASSETS_API_TOKEN` before generating. Only ask for `GAME_ASSETS_API_URL` when the user needs to override the default service. Never ask for Tripo or Gemini API keys; they live on the server.

## Tool workflow

If MCP tools named `mcp__game_assets__*` are available in your session, prefer them. Otherwise run the bundled client via Bash. Both expose the same two operations.

1. Run `pwd` if you do not already know the current workspace path.
2. If planning 3 or more assets, or if this is the first asset generation in the thread, check readiness (`<skill-dir>` is this skill's directory):

```bash
node <skill-dir>/scripts/game-assets-mcp.mjs readiness --cwd "$(pwd)"
```

3. Generate 1-3 assets (batch max 4). Pass parameters as one JSON object:

```bash
node <skill-dir>/scripts/game-assets-mcp.mjs generate --cwd "$(pwd)" --params '{
  "gamePrompt": "...",
  "route": "tripo",
  "assets": [{ "id": "...", "role": "player", "name": "...", "prompt": "..." }]
}'
```

   - `route`: `tripo`, `gemini_reference`, or `auto`.
   - `assets`: 1-3 objects with stable kebab-case `id`, `role`, `name`, `prompt`, and optionally `assetKind`.
   - `force`: only when the user explicitly asked to regenerate assets.
   - The command blocks while polling the remote job (typically 1-3 minutes per batch) and prints a JSON result; exit code 1 means the batch failed.
4. After the command returns, read `asset_manifest.json` from `cwd`. Treat that file as the source of truth.
5. Wire `manifest.assets` into the game code with Three.js `GLTFLoader`.
6. Keep a local primitive fallback for every generated asset. The game must remain playable when a GLB fails to load.

Example `--params` JSON:

```json
{
  "cwd": "/absolute/path/to/project",
  "gamePrompt": "3D runner with an astronaut cat collecting crystals and dodging patrol robots",
  "route": "gemini_reference",
  "assets": [
    {
      "id": "astronaut-cat",
      "role": "player",
      "name": "Astronaut Cat",
      "assetKind": "character",
      "prompt": "original low-poly astronaut cat hero, round helmet, compact readable silhouette, blue and white suit, friendly arcade game character"
    },
    {
      "id": "energy-crystal",
      "role": "collectible",
      "name": "Energy Crystal",
      "assetKind": "prop",
      "prompt": "bright cyan faceted energy crystal pickup, clean silhouette, game collectible"
    }
  ]
}
```

## Runtime integration rules

- Normalize every loaded GLB with `THREE.Box3().setFromObject()`: scale to target size, center horizontally, place the bottom at `y = 0`, and apply a stable facing offset.
- Separate visuals from gameplay hitboxes. Collision should use stable gameplay dimensions, not raw model bounds or mesh origins.
- If `manifest.assets` contains `rigged`, `rigType`, or `animations`, inspect the loaded `gltf.animations` before claiming native animation exists.
- When native clips exist, create a `THREE.AnimationMixer`, map clips by case-insensitive substrings such as `idle`, `walk`, `run`, and `jump`, and call `mixer.update(delta)` every frame.
- If no native clips exist, use whole-group bob/tilt/rotation or explicitly labeled procedural clips as fallback animation.
- Add a short `README.md` section named `3D Asset Pipeline` or `3D 素材流水线` describing which assets were generated, which route was used, and what runtime animation source is used.

## Failure handling

- Asset API unreachable (readiness reports `unreachable`): explain that remote model generation is unavailable, ask the user to check the default asset service, network access, and `GAME_ASSETS_API_TOKEN` if required; only ask for `GAME_ASSETS_API_URL` when overriding the default service. Keep primitive fallbacks and continue the playable game.
- Server missing Gemini key on the `gemini_reference` route: switch to `tripo` if acceptable, or tell the user the server operator must configure the Gemini key.
- Zero Tripo balance: do not retry in a loop. Keep fallbacks and record the skipped stage in the README.
- Partial success: use generated assets that succeeded and fallback geometry for the rest.
