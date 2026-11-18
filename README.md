# neon-harbor

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/shangjf98-max/neon-harbor/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/shangjf98-max/neon-harbor/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Neon Harbor is an original open-world crime game that runs entirely offline in a desktop browser. You are Rook, new in town, broke, and good behind a wheel. Mara, who runs the garage on the south side, has work for you: four story missions across a hand-built city of gridded streets, parks, a harbor, a police station, a hospital, and Warehouse 9. Walk the sidewalks, steal cars off the street, outrun the police, and earn your rank from Newcomer to Harbor Legend.

Everything here is invented for this game — the city, the people, the cars, the story, the art, and the sounds. All art is drawn in code, all sound is synthesised with WebAudio, and the game makes zero network requests. No libraries, no build step: plain static files under `game/`.

## How to play

- **WASD / arrow keys** — walk on foot; drive when in a car (accelerate, steer, brake/reverse). **Shift** sprints on foot, **Space** (or click) punches.
- **E** — get in / out of a car. Stealing a car that is not yours raises your wanted level.
- **Tab** — mission list. **P** — pause (progress saves). **M** — mute. **Enter** — start / confirm.
- **Wanted level** — crime earns stars, up to 5. Police cars chase and ram; break line of sight and hide to cool down. Get cornered on foot and you are busted; lose all health and you wake up at the hospital. Both cost a fine.
- **Missions** — follow the yellow beacon and the objective line. Missions pay cash and unlock the next job: *First Wheels*, *Harbor Run* (timed delivery), *Rough Crowd* (a fight at the warehouse), and *The Getaway* (steal the Comet and lose the cops).
- **Saving** — progress autosaves every 30 seconds, on pause, and on mission completion. Continue from the title screen to pick up where you left off.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. No internet connection is needed after the files are on disk.

---

<sub>Entered on [make.fun](https://make.fun/?ref=3h1pepd7&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
