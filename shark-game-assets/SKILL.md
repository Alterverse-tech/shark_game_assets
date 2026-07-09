---
name: shark-game-assets
description: Generate and wire key GLB assets for Codex-built 3D web games. Use when a Three.js, WebGL, or 3D mini game has recognizable entities such as a player, character, enemy, collectible, vehicle, weapon, hazard, boss, mascot, or key prop.
---

# Shark Game Assets

Use this skill when a 3D game needs concrete, recognizable GLB assets rather than only primitive geometry. The skill owns the end-to-end workflow: choose the route, generate a small focused asset set, write/read `asset_manifest.json`, and wire the GLBs into the game with fallbacks.

## Required behavior

- If the game prompt contains explicit or implicit entities, such as a player, character, enemy, collectible, vehicle, weapon, obstacle, boss, mascot, key prop, or environment object, GLB generation is a required stage when the tool is available.
- Generate only 1-3 key assets by default. Prioritize the player/main character first, then the gameplay-critical enemy, collectible, vehicle, hazard, or key prop. Do not generate decorative filler.
- When the user explicitly asks to regenerate a game and says not to reuse historical assets, do not reuse existing GLBs from `asset_manifest.json`; create fresh stable ids, usually with a timestamp or run suffix, and pass `force: true`.
- For regeneration work with concrete characters or critical entity props, use the Gemini-Tripo branch (`route: "gemini_reference"`) for those key assets and keep that set to 1-5 models total. If the client/API batch cap is lower than the requested total, split into multiple generate calls.
- For secondary static props that do not need strong visual control or rigged animation, use the faster Tripo branch (`route: "tripo"`) and keep that set to 3-10 models total. Do not include decorative filler just to reach the lower bound.
- Use primitive Three.js geometry only as an interim placeholder while assets are pending and as the runtime fallback if a GLB fails to load.
- Do not regenerate existing assets unless the user explicitly asks. If `asset_manifest.json` already has loadable assets, reuse it.
- Avoid copyrighted characters, brand names, logos, and celebrity likenesses. Rewrite into original designs.

## Game Regeneration With Live Preview

When the user asks, in Chinese or English, for the game to be regenerated with new entity character/prop models and says the generation process should dynamically show those models, follow this workflow:

- Treat the request as an explicit regeneration request: generate fresh GLBs and do not wire any historical GLB into the regenerated game.
- Treat the bundled template files in `templates/regeneration/` as the canonical source of truth for `/regeneration.html`, not as loose inspiration. In the blood moon castle project this canonical page is served as `http://127.0.0.1:4173/regeneration.html`; if the dev server uses a different port, keep the same path and UI structure. Do not scrape or download the localhost URL at runtime; that URL is only a served instance of the bundled template.
- When a project is missing this page, or when the page has drifted from the contract, restore it from the skill template: copy `templates/regeneration/regeneration.html` to `public/regeneration.html`, copy `templates/regeneration/regeneration-preview.js` to `src/regeneration-preview.js`, create/update `public/regeneration-status.json` from `templates/regeneration/regeneration-status.sample.json`, and bundle the preview script to `public/regeneration-preview.bundle.js`.
- Preserve or recreate the same DOM contract: `.app` grid root, left `aside`, right `main`, `#list` for item buttons, `#stage` for the Three.js canvas, `.status#status` for the compact status panel, and `<script src="./regeneration-preview.bundle.js"></script>`.
- Preserve or recreate the same visual contract: dark `#11141b`/`#191d25` page, 360px left column on desktop, responsive two-row mobile layout, compact 8px-radius item buttons, progress bars with `#e5b76c`, green ready border, amber active state, right-side full-height viewer, bottom overlay status panel.
- Preserve or recreate the same viewer behavior in `src/regeneration-preview.js`: poll `./regeneration-status.json` every 2 seconds, render left-side item buttons with status/progress, disable buttons until `runtimeUrl` exists, load completed GLBs with `GLTFLoader`, use `OrbitControls`, normalize each model to fit the viewer, play the first animation clip when present, auto-load the first ready model, and rotate the current model slowly.
- Do not redesign, theme, simplify, or move this page during game regeneration unless the user explicitly requests a different regeneration UI. If the page already exists, reuse it and only update data/status; if it is missing, rebuild it to this canonical contract before generation starts.
- After editing or regenerating the page, run a static contract check before claiming it is ready: `public/regeneration.html` must contain `id="list"`, `id="stage"`, `id="status"`, `.app`, `regeneration-preview.bundle.js`; the preview script must fetch `regeneration-status.json`, instantiate `GLTFLoader`, instantiate `OrbitControls`, and append the renderer canvas to `#stage`.
- Suggested static check:

```bash
rg -n 'id="list"|id="stage"|id="status"|class="app"|regeneration-preview\.bundle\.js' public/regeneration.html
rg -n 'regeneration-status\.json|new GLTFLoader|new OrbitControls|stage\.appendChild|setInterval\\(poll, 2000\\)' src/regeneration-preview.js
```

- Back the page with a status JSON file, normally `public/regeneration-status.json`, containing per-asset `id`, `name`, `role`, `status`, `progress`, `runtimeUrl`, `clips`, and `error`. Update it throughout generation so the page can poll and refresh without browser automation.
- As each GLB completes, copy it into the runtime `public/generated-assets/` tree, set `runtimeUrl`, and make it available in the live preview before the full batch is complete.
- On completion, update `asset_manifest.json`, the game asset constants/import paths, and any asset preview page so they list only the freshly generated assets actually used by the latest game.
- Keep primitive fallbacks in the game for failed slots, but do not silently replace a failed regenerated asset with an older GLB.

## Route choice

Use `tripo` for the fast route: direct text prompt to Tripo3D text-to-model. This is best for generic props, enemies, collectibles, vehicles, obstacles, and fast iteration.

Use `gemini_reference` when visual control matters; this is the Gemini-Tripo branch when the user describes it that way. Gemini first creates a pure-white-background reference image, then Tripo image-to-model creates the GLB. For `assetKind: "character"` or `"creature"`, this route must continue into the `tripo-rig-clip` flow so the final manifest contains a rigged main GLB plus default `idle` and `walk` animation support. Prefer this route when the user mentions Gemini, Nano Banana, T-pose, white background, reference image, image-to-model, character sheet, style consistency, or when a key character's silhouette must be controlled.

Use `auto` only when you are comfortable with the server choosing from the prompt. If in doubt, choose the route yourself and pass it explicitly.

## Environment

The generation client is bundled with this skill at `scripts/game-assets-mcp.mjs` (Node >= 20, zero dependencies). It talks to the default remote asset API at `http://54.81.110.182:3001`.

- `GAME_ASSETS_API_URL` — optional override for the asset API base URL
- `GAME_ASSETS_API_TOKEN` — required per-user access token

`GAME_ASSETS_API_TOKEN` is mandatory. Before running readiness, generate, animate, or any other asset API action, check that the token is present in the environment or already provided in the conversation. If the token is missing, stop the asset workflow and ask the user to provide `GAME_ASSETS_API_TOKEN`; do not continue with readiness checks, generation, animation, fallbacks-as-a-substitute, or speculative planning that assumes generation can proceed. Only ask for `GAME_ASSETS_API_URL` when the user needs to override the default service. Never ask for Tripo or Gemini API keys; they live on the server.

## Help / Trigger Examples

When the user asks "how do I use this skill?", "how do I trigger this skill?", "help", "怎么使用这个 skill", "怎么触发这个 skill", or similar, summarize the token requirement and show examples like these.

Always mention: `GAME_ASSETS_API_TOKEN` is required before any asset API readiness/generate/animate call. If it is not already available, ask the user for it and pause the asset workflow.

Explicit skill invocation examples:

```md
[$shark-game-assets](/Users/cppeng/Documents/study/.agents/skills/shark-game-assets/SKILL.md) 请帮我生成一个可直接运行的 3D 密室逃脱小游戏。剧本、画风、逻辑剧情、地图、人物主题见上传的剧本。

游戏类型：第三人称俯视角 3D 密室逃脱
技术栈：Three.js，原生 JavaScript 或 React Three Fiber 均可
运行方式：浏览器中直接运行
注意遵守现实物理规律
```

```md
[$shark-game-assets](/Users/cppeng/Documents/study/.agents/skills/shark-game-assets/SKILL.md) 重新生成这个 3D 游戏。玩家、NPC、反派和关键道具模型都不要复用历史 GLB。生成过程中用 /regeneration.html 动态展示模型进度，完成后只把本轮实际用到的新素材写进 asset_manifest.json。
```

```md
[$shark-game-assets](/Users/cppeng/Documents/study/.agents/skills/shark-game-assets/SKILL.md) 请为我的 Three.js 游戏生成并接入 3 个 GLB 资产：玩家骑士、骷髅敌人、魔法钥匙。用 GLTFLoader 加载，统一缩放和落地，并保留 primitive fallback。
```

```md
[$shark-game-assets](/Users/cppeng/Documents/study/.agents/skills/shark-game-assets/SKILL.md) 请给这个已有角色 GLB 自动 rig，并生成 idle 和 walk 动作 clips。每个动作单独输出 GLB，不要把多个 retarget preset 合并成一次请求。
```

Natural-language trigger examples that do not explicitly name the skill:

```md
请帮我做一个可直接运行的 Three.js 3D 跑酷小游戏，玩家是宇航员，敌人是巡逻机器人，收集物是能量水晶。需要生成并接入对应 GLB 模型。
```

```md
我上传了一个密室逃脱剧本。请根据剧本生成一个浏览器可运行的第三人称俯视角 3D 密室逃脱游戏，地图、剧情、谜题、人物和道具都来自剧本，并生成关键人物和道具模型。
```

```md
这个 Three.js 游戏现在玩家、敌人和收集物都是方块/球体。请生成对应 GLB 模型并接入，保留加载失败时的基础几何 fallback。
```

```md
请用 Gemini 先生成白底角色参考图，再用 Tripo 生成游戏角色 GLB。角色需要清晰轮廓、T-pose、可用于 Three.js，并带 idle/walk 动作。
```

## Tool workflow

If MCP tools named `mcp__game_assets__*` are available in your session, prefer them. Otherwise run the bundled client via Bash. Both expose the same readiness, generate, and animate operations.

1. Run `pwd` if you do not already know the current workspace path.
2. Confirm `GAME_ASSETS_API_TOKEN` is available. If it is absent, ask the user for it and pause the asset generation workflow until they provide it.
3. If planning 3 or more assets, or if this is the first asset generation in the thread, check readiness (`<skill-dir>` is this skill's directory):

```bash
node <skill-dir>/scripts/game-assets-mcp.mjs readiness --cwd "$(pwd)"
```

4. Generate the selected asset set. By default generate 1-3 assets (batch max 4). For explicit game-regeneration requests, follow the quantity limits above: 1-5 Gemini-Tripo key entity models, and optionally 3-10 Tripo static prop models. Split into multiple generate calls when a desired set is larger than the current client/API batch cap. Pass parameters as one JSON object:

```bash
node <skill-dir>/scripts/game-assets-mcp.mjs generate --cwd "$(pwd)" --params '{
  "gamePrompt": "...",
  "route": "tripo",
  "assets": [{ "id": "...", "role": "player", "name": "...", "prompt": "..." }]
}'
```

   - `route`: `tripo`, `gemini_reference`, or `auto`.
   - `assets`: objects with stable kebab-case `id`, `role`, `name`, `prompt`, and optionally `assetKind`; keep counts within the default or regeneration-specific limits.
   - On `gemini_reference`, character/creature assets are automatically rigged after GLB generation. Prefer `animationClips` when present; if Tripo retarget failed, expect main-GLB fallback fields `animations: ["Idle", "Walk"]` and `animationSource: "procedural_native_clips"`.
   - `force`: only when the user explicitly asked to regenerate assets.
   - The command blocks while polling the remote job (typically 1-3 minutes per batch) and prints a JSON result; exit code 1 means the batch failed.
5. After the command returns, read `asset_manifest.json` from `cwd`. Treat that file as the source of truth.
6. Wire `manifest.assets` into the game code with Three.js `GLTFLoader`.
7. Keep a local primitive fallback for every generated asset. The game must remain playable when a GLB fails to load.

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
- If `manifest.assets` contains `rigged`, `rigType`, `animationClips`, `animations`, or `animationSource`, inspect the loaded `gltf.animations` before claiming native animation exists.
- If `animationSource` is `procedural_native_clips`, play the main GLB's embedded `Idle`/`Walk` clips directly and label them as procedural fallback clips, not Tripo retarget clips.
- When native clips exist, create a `THREE.AnimationMixer`, map clips by case-insensitive substrings such as `idle`, `walk`, `run`, and `jump`, and call `mixer.update(delta)` every frame.
- If no native clips exist, use whole-group bob/tilt/rotation or explicitly labeled procedural clips as fallback animation.
- Add a short `README.md` section named `3D Asset Pipeline` or `3D 素材流水线` describing which assets were generated, which route was used, and what runtime animation source is used.

## Third-Person Escape Room Game Generation

Use the bundled subskill [third-person-escape-room-game](subskills/third-person-escape-room-game.md) when the user asks to build, regenerate, or substantially revise a browser-runnable third-person top-down 3D escape room game from a supplied script. Load that subskill before planning, coding, asset selection, control implementation, collision work, or playtest reporting for this game type.

## Existing GLB animation clip generation

Use the bundled subskill [tripo-rig-clip](subskills/tripo-rig-clip.md) when the user asks to animate, rig, auto-rig, retarget, or add idle/walk/run/jump clips to an existing GLB or Tripo task. Also treat it as the required continuation of the `gemini_reference` route for character/creature assets. Load that file before doing existing-GLB animation work or explaining the Gemini character pipeline.

## Failure handling

- Missing `GAME_ASSETS_API_TOKEN`: stop before any readiness/generate/animate call and ask the user to provide `GAME_ASSETS_API_TOKEN`. Do not continue the asset generation workflow until the token is available.
- Asset API unreachable (readiness reports `unreachable`): explain that remote model generation is unavailable, ask the user to check the default asset service, network access, and `GAME_ASSETS_API_TOKEN`; only ask for `GAME_ASSETS_API_URL` when overriding the default service. Keep primitive fallbacks only for the playable game shell, not as a substitute for a requested authenticated generation step.
- Server missing Gemini key on the `gemini_reference` route: switch to `tripo` if acceptable, or tell the user the server operator must configure the Gemini key.
- Zero Tripo balance: do not retry in a loop. Keep fallbacks and record the skipped stage in the README.
- Partial success: use generated assets that succeeded and fallback geometry for the rest.
