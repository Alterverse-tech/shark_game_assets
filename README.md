# shark-game-assets skill/plugin

Agent skills by cppeng. Install with the [skills CLI](https://skills.sh):

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
