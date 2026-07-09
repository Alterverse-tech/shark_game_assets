---
name: shark-game-assets
description: Generate and wire key GLB assets for Codex-built 3D web games. Use when a Three.js, WebGL, or 3D mini game has recognizable entities such as a player, character, enemy, collectible, vehicle, weapon, hazard, boss, mascot, or key prop.
---

# Shark Game Assets

Use this skill when a 3D game needs concrete, recognizable GLB assets rather than only primitive geometry. The skill owns the end-to-end workflow: choose the route, generate a small focused asset set, write/read `asset_manifest.json`, and wire the GLBs into the game with fallbacks.

## Self-update before use

Before taking task actions with this skill, perform a best-effort self-update check so installed copies stay current without requiring the user to ask for updates.

- After reading this `SKILL.md`, locate the skill directory and nearest git repository, if any.
- If the skill is in a git repository with a configured upstream or `origin`, run a non-interactive remote check such as `git fetch --quiet --prune`.
- Compare the local commit with the upstream commit. If the upstream is ahead and there are no local uncommitted changes under this skill directory, update with a fast-forward-only command such as `git pull --ff-only`, then re-read the updated `SKILL.md` before continuing.
- If the skill directory has local changes, the repository has no remote/upstream, the remote check fails, or a fast-forward update is not possible, do not overwrite local files and do not block the user's task. Briefly note that the installed skill could not be auto-updated and continue with the local copy.
- Do not use browser use or computer use for this update check. Use local git or the available plugin/skill installer tooling only when it is already part of the user's installed skill workflow.
- This self-update check is for the skill files only. It does not authorize asset API readiness/generation/animation calls and does not replace the `GAME_ASSETS_API_TOKEN` and remote-call authorization rules below.

## Required behavior

- If the game prompt contains explicit or implicit entities, such as a player, character, enemy, collectible, vehicle, weapon, obstacle, boss, mascot, key prop, or environment object, GLB generation is a required stage when the tool is available.
- Generate only 1-3 key assets by default. Prioritize the player/main character first, then the gameplay-critical enemy, collectible, vehicle, hazard, or key prop. Do not generate decorative filler.
- When the user explicitly asks to regenerate a game and says not to reuse historical assets, do not reuse existing GLBs from `asset_manifest.json`; create fresh stable ids, usually with a timestamp or run suffix, and pass `force: true`.
- For regeneration work with concrete characters or critical entity props, use the Gemini-Tripo branch (`route: "gemini_reference"`) for those key assets and keep that set to 1-5 models total. If the client/API batch cap is lower than the requested total, split into multiple generate calls.
- For secondary static props that do not need strong visual control or rigged animation, use the faster Tripo branch (`route: "tripo"`) and keep that set to 3-10 models total. Do not include decorative filler just to reach the lower bound.
- Use primitive Three.js geometry only as an interim placeholder while assets are pending and as the runtime fallback if a GLB fails to load.
- If `GAME_ASSETS_API_TOKEN` is missing for a task that triggers this skill, stop the entire game-generation or asset-integration workflow and ask the user for the token. Do not downgrade to a playable procedural-geometry Three.js version, do not scaffold the game shell with primitive stand-ins, and do not continue implementation until the token is available.
- If `GAME_ASSETS_API_TOKEN` exists but the user has not clearly authorized sending it to `GAME_ASSETS_API_URL` or the default remote asset service, stop before any remote call and ask for explicit authorization. Do not treat token presence as consent to send it to an external IP or host.
- If remote asset authorization is denied, blocked by policy, or the asset service is unreachable, pause the asset generation workflow and ask the user how to proceed. Do not silently replace requested GLB generation with local placeholder/procedural models and present that as completed `shark-game-assets` work.
- Do not regenerate existing assets unless the user explicitly asks. If `asset_manifest.json` already has loadable assets, reuse it.
- Avoid copyrighted characters, brand names, logos, and celebrity likenesses. Rewrite into original designs.

## Game Regeneration With Live Preview

When the user asks, in Chinese or English, for the game to be regenerated with new entity character/prop models and says the generation process should dynamically show those models, follow this workflow:

- Treat the request as an explicit regeneration request: generate fresh GLBs and do not wire any historical GLB into the regenerated game.
- Treat the regeneration preview website as a first-class subtask of game model generation, not as a final optional polish step. The overall game generation should be organized as: preview website subtask, model generation subtask, `asset_manifest.json`/status update subtask, then game integration subtask.
- After token presence and remote-call authorization are satisfied, restore or create the preview website before the first remote asset generation call. The user should be able to open `/regeneration.html` while models are still pending/running.
- Keep this preview website lightweight and standardized so it does not materially slow the game generation task. Copy the template, write/update JSON, bundle the preview script, and start or reuse the local static/dev server; do not redesign the page or add custom UI unless the user explicitly asks.
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
- The status JSON should make semantic model state visible, not just raw file completion. For animated character/creature assets, list the base model and each semantic action GLB separately or expose them in `clips`, for example player base, player `idle`, player `walk`, boss base, boss `idle`, boss `walk`. This helps users and Codex verify that the correct action GLB is used at the correct gameplay state.
- During generation, update each status item from `pending` to `running` to `ready` or `failed`, with progress and a clear error if one stage fails. Do not wait until the entire batch completes before making successful GLBs previewable.
- As each GLB completes, copy it into the runtime `public/generated-assets/` tree, set `runtimeUrl`, and make it available in the live preview before the full batch is complete.
- On completion, update `asset_manifest.json`, the game asset constants/import paths, and any asset preview page so they list only the freshly generated assets actually used by the latest game.
- Keep primitive fallbacks in the game for failed slots, but do not silently replace a failed regenerated asset with an older GLB.

Suggested live-preview subtask checklist:

1. Restore `public/regeneration.html`, `src/regeneration-preview.js`, `public/regeneration-status.json`, and `public/regeneration-preview.bundle.js` from the template contract.
2. Start or reuse the local static/dev server and give the user the `/regeneration.html` URL.
3. Write initial status items for every planned asset and semantic action slot, including base model, `idle`, `walk`, `run`, or `jump` when those actions are expected.
4. Run the asset generation or regeneration calls.
5. After each model or retarget action completes, copy the GLB to `public/generated-assets/`, update that item's `runtimeUrl`, `status`, and `progress`, and leave the page to auto-refresh by polling.
6. After all tasks finish, update `asset_manifest.json` and game code using the same semantic mapping shown in the preview page.
7. Run the static contract checks before claiming the preview website is ready.

## Route choice

Use `tripo` for the fast route: direct text prompt to Tripo3D text-to-model. This is best for generic props, enemies, collectibles, vehicles, obstacles, and fast iteration.

Use `gemini_reference` when visual control matters; this is the Gemini-Tripo branch when the user describes it that way. Gemini first creates a pure-white-background reference image, then Tripo image-to-model creates the GLB. For `assetKind: "character"` or `"creature"`, this route must continue into the `tripo-rig-clip` flow so the final manifest contains a rigged main GLB plus default `idle` and `walk` animation support. Prefer this route when the user mentions Gemini, Nano Banana, T-pose, white background, reference image, image-to-model, character sheet, style consistency, or when a key character's silhouette must be controlled.

Use `auto` only when you are comfortable with the server choosing from the prompt. If in doubt, choose the route yourself and pass it explicitly.

## Environment

The generation client is bundled with this skill at `scripts/game-assets-mcp.mjs` (Node >= 20, zero dependencies). It talks to the default remote asset API at `http://54.81.110.182:3001`.

- `GAME_ASSETS_API_URL` — optional override for the asset API base URL
- `GAME_ASSETS_API_TOKEN` — required per-user access token

`GAME_ASSETS_API_TOKEN` is mandatory. Before running readiness, generate, animate, or any other asset API action, check that the token is present in the environment or already provided in the conversation. If the token is missing, stop the entire game-generation or asset-integration workflow and ask the user to provide `GAME_ASSETS_API_TOKEN`; do not continue with readiness checks, generation, animation, fallbacks-as-a-substitute, procedural-model implementation, playable placeholder shells, or speculative planning that assumes generation can proceed. Only ask for `GAME_ASSETS_API_URL` when the user needs to override the default service. Never ask for Tripo or Gemini API keys; they live on the server.

Token presence is not remote-call consent. Before sending `GAME_ASSETS_API_TOKEN` to the default asset service (`http://54.81.110.182:3001`) or to a custom `GAME_ASSETS_API_URL`, confirm that the user authorizes using that token with that service for readiness/generate/animate. If authorization is absent or ambiguous, ask a concise clarification such as: "I need to use `GAME_ASSETS_API_TOKEN` to call `http://54.81.110.182:3001` for asset readiness/generation/animation. Please confirm that this is authorized." Pause the asset workflow until the user confirms.

If the remote call is blocked by policy because it would send the token to an external host, explain that authorization is required and ask the user to confirm or provide a different approved asset service URL. Do not continue by creating a local procedural placeholder version unless the user explicitly changes scope and asks for a non-GLB prototype; in that case, clearly state that `shark-game-assets` GLB generation has not been completed.

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
2. Confirm `GAME_ASSETS_API_TOKEN` is available. If it is absent, ask the user for it and pause the whole game-generation or asset-integration workflow until they provide it. Do not build a procedural Three.js fallback game or continue with primitive stand-ins while waiting.
3. Confirm the user has authorized sending `GAME_ASSETS_API_TOKEN` to the configured asset API host for readiness/generate/animate. If authorization is missing or ambiguous, ask for confirmation and pause the workflow.
4. If planning 3 or more assets, or if this is the first asset generation in the thread, check readiness (`<skill-dir>` is this skill's directory):

```bash
node <skill-dir>/scripts/game-assets-mcp.mjs readiness --cwd "$(pwd)"
```

5. Generate the selected asset set. By default generate 1-3 assets (batch max 4). For explicit game-regeneration requests, follow the quantity limits above: 1-5 Gemini-Tripo key entity models, and optionally 3-10 Tripo static prop models. Split into multiple generate calls when a desired set is larger than the current client/API batch cap. Pass parameters as one JSON object:

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
6. After the command returns, read `asset_manifest.json` from `cwd`. Treat that file as the source of truth.
7. Wire `manifest.assets` into the game code with Three.js `GLTFLoader`. Treat the manifest as a semantic registry: choose assets by `bindings`, `id`, or `role`, and choose animations by `actions.<name>.url` or legacy `animationClips[].name`/`preset`, never by guessing file names or folders.
8. Keep a local primitive fallback for every generated asset. The game must remain playable when a GLB fails to load.

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

## Manifest organization and action registry

Treat `asset_manifest.json` as the source of truth for asset identity and action identity. Do not infer meaning from file names such as `model.glb`, UUID folders, URL order, or natural-language descriptions. A generated asset can have several GLBs with the same basename in different folders; the manifest fields are the contract.

Prefer this semantic registry shape for new or rewritten manifests:

```json
{
  "version": 2,
  "schema": "shark-game-assets-manifest",
  "route": "gemini_image_then_tripo_image_to_model",
  "gamePrompt": "...",
  "bindings": {
    "player": "checkout-guest-player",
    "boss": "blind-grandma-boss"
  },
  "assets": [
    {
      "id": "checkout-guest-player",
      "role": "player",
      "gameplayRole": "player",
      "name": "Checkout Guest Player",
      "assetKind": "character",
      "model": {
        "kind": "base-rig",
        "url": "/generated-assets/main-task/model.glb",
        "format": "glb",
        "source": "gemini_image_then_tripo_image_to_model",
        "referenceImageUrl": "/generated-assets/gemini-reference-images/checkout-guest-player.jpg"
      },
      "rig": {
        "rigged": true,
        "rigType": "biped",
        "animationSource": "tripo_retarget_clips"
      },
      "actions": {
        "idle": {
          "url": "/generated-assets/idle-task/model.glb",
          "format": "glb",
          "source": "tripo_retarget_clip",
          "preset": "preset:biped:idle",
          "loop": true,
          "rootMotion": "none"
        },
        "walk": {
          "url": "/generated-assets/walk-task/model.glb",
          "format": "glb",
          "source": "tripo_retarget_clip",
          "preset": "preset:biped:walk",
          "loop": true,
          "rootMotion": "in_place"
        }
      },
      "actionAliases": {
        "default": "idle",
        "stand": "idle",
        "move": "walk",
        "moving": "walk"
      },
      "fallback": {
        "model": "primitive:humanoid",
        "animation": "group-bob-tilt"
      }
    }
  ]
}
```

Manifest authoring rules:

- `model.url` is the visible base model or base rig. It is not automatically the `idle`, `walk`, or `run` action.
- `actions` is the primary action registry. Runtime code should resolve `walk` from `asset.actions.walk.url`, `idle` from `asset.actions.idle.url`, and so on.
- `bindings` maps game slots to asset ids. Prefer `manifest.bindings.player` over searching for the first asset with `role: "player"` when a binding exists.
- `role` and `gameplayRole` should describe game semantics such as `player`, `boss`, `npc`, `collectible`, or `hazard`. `assetKind` should describe asset form such as `character`, `creature`, `prop`, `vehicle`, or `environment`.
- Keep legacy `url`, `animationClips`, `animations`, and `animationSource` fields readable for backward compatibility, but normalize them into `model` and `actions` at runtime before use.

Runtime resolver pattern for backward compatibility:

```js
function getModelUrl(asset) {
  return asset.model?.url ?? asset.url ?? null;
}

function getActionUrl(asset, actionName) {
  const alias = asset.actionAliases?.[actionName] ?? actionName;
  const action = asset.actions?.[alias];
  if (action?.url) return action.url;

  const legacyClip = asset.animationClips?.find((clip) =>
    clip.name === alias || clip.name === actionName || clip.preset?.endsWith(`:${alias}`) || clip.preset?.endsWith(`:${actionName}`)
  );
  return legacyClip?.url ?? null;
}
```

Standard animated character loading chain for retarget clips:

1. Load the main character GLB with `GLTFLoader` from `getModelUrl(asset)`.
2. Normalize and add the main character `gltf.scene` to the game scene.
3. Create one `THREE.AnimationMixer` on the main character root.
4. Load each action GLB with `GLTFLoader` from `getActionUrl(asset, "idle")`, `getActionUrl(asset, "walk")`, and any other required actions.
5. Extract `THREE.AnimationClip`s from the action GLBs' `gltf.animations`; do not add those action GLB scenes to the game scene unless using the fallback described below.
6. Play those clips on the main character mixer, for example `mixer.clipAction(walkClip, mainRoot)`.
7. Switch actions from game state and call `mixer.update(delta)` every frame.

Minimal Three.js shape:

```js
const mainGltf = await loadGLB(getModelUrl(asset));
const mainRoot = normalizeModel(mainGltf.scene);
scene.add(mainRoot);

const mixer = new THREE.AnimationMixer(mainRoot);
const idleGltf = await loadGLB(getActionUrl(asset, "idle"));
const walkGltf = await loadGLB(getActionUrl(asset, "walk"));

const idleAction = mixer.clipAction(idleGltf.animations[0], mainRoot);
const walkAction = mixer.clipAction(walkGltf.animations[0], mainRoot);

idleAction.play();

function tick(delta) {
  mixer.update(delta);
}
```

## Runtime integration rules

- Normalize every loaded GLB with `THREE.Box3().setFromObject()`: scale to target size, center horizontally, place the bottom at `y = 0`, and apply a stable facing offset.
- Separate visuals from gameplay hitboxes. Collision should use stable gameplay dimensions, not raw model bounds or mesh origins.
- If `manifest.assets` contains `rigged`, `rigType`, `actions`, `animationClips`, `animations`, or `animationSource`, inspect the loaded `gltf.animations` before claiming native animation exists.
- For `animationSource: "tripo_retarget_clips"` or a character/creature asset with `actions`/`animationClips`, load the visible main model from `model.url` or legacy `url`, then separately load each action GLB from `actions.<name>.url` or legacy `animationClips[].url`. The action GLB scene is normally only a clip source and should not be added to the game scene.
- Extract `THREE.AnimationClip`s from action GLBs and play them on the main model's root with one `THREE.AnimationMixer`, for example `mixer.clipAction(walkClip, mainRoot)`. This depends on the action GLB and main model sharing a compatible rig, which Tripo retarget clips for the same asset are expected to do.
- If `animationSource` is `procedural_native_clips`, play the main GLB's embedded `Idle`/`Walk` clips directly and label them as procedural fallback clips, not Tripo retarget clips.
- When native clips exist, create a `THREE.AnimationMixer`, map clips by case-insensitive substrings such as `idle`, `walk`, `run`, and `jump`, and call `mixer.update(delta)` every frame.
- Drive action switching from game state: idle/stand states should play `idle`, movement should play `walk` or `run`, and jump/air states should play `jump` when available. Use cross-fades when changing between actions.
- If no native clips exist, use whole-group bob/tilt/rotation or explicitly labeled procedural clips as fallback animation.
- If a retarget clip does not bind to the main model's skeleton, fall back to directly displaying the action GLB scene for that state or to a clearly labeled procedural/group fallback. Do not silently claim the main rig is playing that retarget clip.
- Add a short `README.md` section named `3D Asset Pipeline` or `3D 素材流水线` describing which assets were generated, which route was used, and what runtime animation source is used.

## Third-Person Escape Room Game Generation

Use the bundled subskill [third-person-escape-room-game](subskills/third-person-escape-room-game.md) when the user asks to build, regenerate, or substantially revise a browser-runnable third-person top-down 3D escape room game from a supplied script. Load that subskill before planning, coding, asset selection, control implementation, collision work, or playtest reporting for this game type.

## Existing GLB animation clip generation

Use the bundled subskill [tripo-rig-clip](subskills/tripo-rig-clip.md) when the user asks to animate, rig, auto-rig, retarget, or add idle/walk/run/jump clips to an existing GLB or Tripo task. Also treat it as the required continuation of the `gemini_reference` route for character/creature assets. Load that file before doing existing-GLB animation work or explaining the Gemini character pipeline.

## Failure handling

- Missing `GAME_ASSETS_API_TOKEN`: stop before any readiness/generate/animate call and ask the user to provide `GAME_ASSETS_API_TOKEN`. Do not continue the asset generation workflow, game shell implementation, or asset integration until the token is available. Do not downgrade to a playable Three.js procedural-model version, primitive-only prototype, or placeholder-based implementation.
- Missing remote-token authorization: stop before any readiness/generate/animate call and ask the user to confirm that `GAME_ASSETS_API_TOKEN` may be sent to the configured asset API host. Do not proceed just because the token exists.
- Remote call blocked by policy, denied by the user, or asset API unreachable (readiness reports `unreachable`): explain the specific blocker and ask the user whether to authorize the remote call, provide a different approved `GAME_ASSETS_API_URL`, or explicitly change scope to a non-GLB prototype. Do not silently continue with local placeholder/procedural models or present a primitive-only version as completed asset generation. Runtime primitive fallbacks remain allowed only as fallbacks around generated or existing assets, not as a substitute for a requested authenticated generation step.
- Server missing Gemini key on the `gemini_reference` route: switch to `tripo` if acceptable, or tell the user the server operator must configure the Gemini key.
- Zero Tripo balance: do not retry in a loop. Keep fallbacks and record the skipped stage in the README.
- Partial success: use generated assets that succeeded and fallback geometry for the rest.
