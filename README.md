

# Shark Game Assets

> **Generate production-ready 3D game assets without leaving your coding workflow.**

`shark-game-assets` is an agent skill for generating game-ready `.glb` assets while building Three.js and WebGL games.

Describe the asset you need, and your coding agent can generate players, enemies, collectibles, props, and environmental objects through the Shark Game Assets remote generation service.

```
Describe your game
        ↓
Agent writes the game code
        ↓
Shark Game Assets generates the 3D assets
        ↓
Ready-to-use GLB files are added to your project
```

## Highlights

- **Agent-native workflow** — generate assets directly from Codex, Claude Code, or other skill-compatible coding agents
- **Game-ready GLB output** — designed for Three.js, WebGL, and browser-based games
- **Multiple asset categories** — players, enemies, NPCs, collectibles, props, and environmental objects
- **Remote generation service** — no local GPU or 3D generation environment required
- **Code and assets together** — let your agent build gameplay while producing the required models
- **Rapid prototyping** — move from a game idea to a playable 3D experience faster

## Installation

Install the skill globally using the [Skills CLI](https://skills.sh):

```
npx skills add https://github.com/Alterverse-tech/shark_game_assets \
  --skill shark-game-assets \
  -g
```

After installation, the skill becomes available to compatible coding agents on your machine.

Documentation and downloads: https://studio.13-216-49-19.sslip.io/generated-assets/site/

## Authentication

Shark Game Assets uses a remote asset-generation service and requires an API token.

Contact the publisher to request access, then configure the token in your shell:

```
export GAME_ASSETS_API_TOKEN="<your-token>"
```

To make the token available across terminal sessions, add it to your shell configuration file.

The client uses `https://studio.13-216-49-19.sslip.io` by default. Set `GAME_ASSETS_API_URL` only when overriding that service. Before readiness, generation, or animation calls, explicitly authorize sending `GAME_ASSETS_API_TOKEN` to the configured service; the agent must never print the token.

## Usage

Once installed and authenticated, ask your coding agent to generate the assets required by your game.

For example:

```
Create a low-poly third-person survival game in Three.js.

Use shark-game-assets to generate:

- A stylized male survivor character
- Three mutant enemy variants
- A medical supply crate
- A collectible energy crystal
- A damaged sci-fi storage container

Generate the models as game-ready GLB assets and integrate them into the game.
```

You can also request an individual asset:

```
Use shark-game-assets to generate a low-poly sci-fi treasure chest.

Requirements:

- Game-ready GLB
- Separate lid and base
- Metallic PBR material
- Optimized for a browser game
- Approximately one meter wide
```

## Supported Asset Types

### Characters

- Player characters
- Enemies
- NPCs
- Creatures
- Bosses

### Gameplay Objects

- Collectibles
- Weapons
- Tools
- Keys
- Chests
- Interactive props

### Environment Assets

- Furniture
- Rocks
- Trees
- Containers
- Machines
- Architectural props
- Decorative objects

## Recommended Prompt Structure

Clear asset specifications produce more consistent results.

```
Asset type:
Visual style:
Shape and proportions:
Materials:
Required parts:
Target scale:
Polygon budget:
Animation requirements:
Game engine:
Output format:
```

Example:

```
Asset type: Enemy character
Visual style: Stylized low-poly sci-fi
Shape and proportions: Tall humanoid with long arms
Materials: Dark organic armor with emissive details
Required parts: Full body, separate eyes, clean silhouette
Target scale: 2.2 meters tall
Polygon budget: Optimized for a browser game
Animation requirements: T-pose, suitable for humanoid rigging
Game engine: Three.js
Output format: GLB
```

##   

## Get Access

Shark Game Assets is powered by a remote asset-generation service.

Contact the publisher to request a `GAME_ASSETS_API_TOKEN`, install the skill, and start generating 3D assets directly from your coding workflow.

## License

Free for non-commercial use. Commercial use requires prior written permission.

---

<p align="center"> <strong>Build the game. Generate the world.</strong> </p>
