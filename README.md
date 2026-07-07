# agent-skills

Agent skills by cppeng. Install with the [skills CLI](https://skills.sh):

```bash
npx skills add https://github.com/Alterverse-tech/shark_game_assets --skill 3d-game-assets
```

## Skills

### 3d-game-assets

Generate game-ready GLB assets (player, enemies, collectibles, props) for Three.js / WebGL games while your agent codes. Generation runs on a remote asset service — no Tripo or Gemini API keys needed locally.

Requires two environment variables (ask the publisher for a token):

```bash
export GAME_ASSETS_API_URL=http://54.81.110.182:3001
export GAME_ASSETS_API_TOKEN=<your token>
```

Docs & downloads: http://54.81.110.182:3001/generated-assets/site/
