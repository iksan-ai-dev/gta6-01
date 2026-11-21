# Sunset Harbor

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/iksan-ai-dev/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/iksan-ai-dev/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Sunset Harbor is an original open-world crime game that runs in the browser on three.js, set in a harbour city at dusk. Drive, walk, fight, take missions and outrun a five-star police response.

## Controls

WASD or arrows to move, Shift to run, Space for the handbrake, F to enter or exit a vehicle, R to reload, 1-5 to switch weapons, click to shoot, Escape to pause.

## Features

- Procedural harbour city with named districts
- Drivable vehicles with arcade physics
- Ambient traffic and pedestrians
- A five-star wanted system with police cruisers
- Missions with staged objectives
- A weapon loadout
- A HUD with minimap, mission tracker, police proximity readout and wanted stars
- localStorage save and load

## Running it

Node 22.18 or later, then `node serve.ts` and open the printed address. To produce the build output run `node main.ts`, which writes out/dossier.json.

## Project layout

- game/index.html
- game/src/main.js
- Modules: city, player, vehicles, traffic, pedestrians, combat, police, missions, hud, save, shots
- main.ts
- serve.ts

## Screenshots

![The police give chase through the harbour district](screenshots/1-chase.jpg)

![Cruising the city at dusk](screenshots/2-drive.jpg)

![A mission in progress](screenshots/3-mission.jpg)

![On foot in the streets](screenshots/4-onfoot.jpg)

[make.fun · gta6-01](https://make.fun/bounty/gta6-01)

Built for the make.fun gta6-01 bounty.
