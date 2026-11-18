// Neon Harbor: an original open-world crime game for the make.fun "Make GTA 6"
// bounty (Node 22, standard library only). The game is this directory's game/
// folder, plain static files a desktop browser loads offline (game/index.html
// and its ES modules, no library and no network request), and this program
// hands it in. It copies game/ and screenshots/ from beside this file to
// /output and writes /output/dossier.json, the summary the judge reads, with
// the vendored make.fun library. The game itself: a hand-built city of roads,
// blocks, parks and a harbor, walked and driven in a top-down Canvas 2D view,
// with stealable cars, traffic and pedestrians, a five-star wanted level and
// pursuing police, four story missions, fist fights, a HUD with a minimap,
// and localStorage saves. All art is drawn in code and all sound is
// synthesised with WebAudio; nothing is taken from any other game.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
