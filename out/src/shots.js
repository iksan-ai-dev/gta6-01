// game/src/shots.js
// Deterministic scene staging for screenshots.
//
// The game constructs `new Shots(game)` and the constructor reads the URL's
// `?shot=` / `?seed=` parameters, staging the requested scene so an external
// harness can capture it. Once staging completes, `window.__shotReady` is set
// to true and `window.__game` exposes the live game state.

import { WEAPONS } from './combat.js';

const DEFAULT_SHOT = 'drive';
const DEFAULT_SEED = 7;

// Heading convention: 0 == north (-Z). `forward()` maps a heading to the unit
// direction the actor faces, so "ahead" is +forward and "behind" is -forward.
function forward(heading) {
  return { x: -Math.sin(heading), z: -Math.cos(heading) };
}

// mulberry32: deterministic PRNG so a fixed seed always reproduces the scene.
function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Set only x/z of a target (player, car mesh, agents), leaving y to the game's
// own ground height so actors stay on the road surface.
function setXZ(target, x, z) {
  if (!target) return;
  target.x = x;
  target.z = z;
}

// Set a full x/y/z position (used for the camera).
function setXYZ(target, x, y, z) {
  if (!target) return;
  if (typeof target.set === 'function') target.set(x, y, z);
  else {
    target.x = x;
    target.y = y;
    target.z = z;
  }
}

function setHeadingOn(obj, heading) {
  if (!obj) return;
  if (typeof obj.setHeading === 'function') obj.setHeading(heading);
  else if (obj.rotation) obj.rotation.y = heading;
}

export function shotFromQuery() {
  const search =
    typeof location !== 'undefined' && location.search ? location.search : '';
  const params = new URLSearchParams(search);
  const shot = params.get('shot') || DEFAULT_SHOT;
  const seedRaw = params.get('seed');
  const seed = seedRaw === null ? DEFAULT_SEED : parseInt(seedRaw, 10);
  return { shot, seed: Number.isFinite(seed) ? seed : DEFAULT_SEED };
}

export class Shots {
  constructor(game) {
    this.game = game;
    window.__game = game;
    const { shot, seed } = shotFromQuery();
    if (shot) this.stage(shot, seed);
  }

  stage(name, seed) {
    this.seed = Number.isFinite(seed) ? seed : DEFAULT_SEED;
    const rng = makeRng(this.seed);
    const handlers = {
      drive: () => this.stageDrive(rng),
      chase: () => this.stageChase(rng),
      mission: () => this.stageMission(rng),
      onfoot: () => this.stageOnfoot(rng),
    };
    const fn = handlers[name];
    if (!fn) throw new Error(`Unknown shot: ${name}`);
    const result = fn();
    this.finalize(result);
    return result;
  }

  // --- staging helpers ---

  clearScene() {
    const g = this.game;
    if (g.police && typeof g.police.clearHeat === 'function') g.police.clearHeat();
    if (g.traffic && typeof g.traffic.setFrozen === 'function') g.traffic.setFrozen(true);
    if (g.pedestrians && typeof g.pedestrians.setFrozen === 'function') {
      g.pedestrians.setFrozen(true);
    }
  }

  putPlayerInCar(x, z, heading) {
    const g = this.game;
    const player = g.player;
    let car = null;
    if (g.vehicles) {
      if (typeof g.vehicles.spawnPlayerCar === 'function') {
        car = g.vehicles.spawnPlayerCar(x, z, heading);
      } else if (typeof g.vehicles.spawn === 'function') {
        car = g.vehicles.spawn({ x, z, heading, player: true });
      }
    }
    if (!car && g.traffic) {
      const agents = g.traffic.agents || g.traffic.cars || [];
      const a = agents[0];
      car = a && (a.vehicle || a.mesh || a);
    }
    if (car) {
      if (typeof player.enterVehicle === 'function') player.enterVehicle(car);
      else if (typeof player.setVehicle === 'function') player.setVehicle(car);
      const mesh = car.mesh || car;
      setXZ(mesh && mesh.position ? mesh.position : mesh, x, z);
      setHeadingOn(car, heading);
    }
    setXZ(player.position, x, z);
    if (typeof player.setHeading === 'function') player.setHeading(heading);
    return car;
  }

  positionCamera(behindM, upM, lookAheadM, subjectX, subjectZ, heading) {
    const cam = this.game.camera;
    if (!cam) return;
    const f = forward(heading);
    setXYZ(cam.position, subjectX - f.x * behindM, upM, subjectZ - f.z * behindM);
    if (typeof cam.lookAt === 'function') {
      cam.lookAt(
        subjectX + f.x * lookAheadM,
        upM * 0.5,
        subjectZ + f.z * lookAheadM,
      );
    }
  }

  pinTraffic(entries) {
    const t = this.game.traffic;
    if (!t) return;
    if (typeof t.setFrozen === 'function') t.setFrozen(true);
    const agents = t.agents || t.cars || [];
    entries.forEach((e, i) => {
      const a = agents[i];
      if (!a) return;
      const unit = a.vehicle || a;
      const mesh = (unit && unit.mesh) || unit;
      setXZ(mesh && mesh.position ? mesh.position : mesh, e.x, e.z);
      setHeadingOn(unit, e.heading);
    });
  }

  pinPedestrians(entries) {
    const p = this.game.pedestrians;
    if (!p) return;
    if (typeof p.setFrozen === 'function') p.setFrozen(true);
    const agents = p.agents || [];
    entries.forEach((e, i) => {
      const a = agents[i];
      if (!a) return;
      const mesh = a.mesh || a;
      setXZ(mesh && mesh.position ? mesh.position : mesh, e.x, e.z);
      setHeadingOn(a, e.heading);
    });
  }

  equipSmg() {
    const c = this.game.combat;
    const player = this.game.player;
    if (c) {
      if (typeof c.equip === 'function') c.equip('smg');
      else if (typeof c.giveWeapon === 'function') c.giveWeapon('smg');
      else if (typeof c.setWeapon === 'function') c.setWeapon('smg');
    } else if (player && typeof player.equip === 'function') {
      player.equip('smg');
    }
  }

  startMission(name) {
    const m = this.game.missions;
    if (!m) return null;
    if (typeof m.start === 'function') return m.start(name);
    if (typeof m.activate === 'function') return m.activate(name);
    if (typeof m.setActive === 'function') return m.setActive(name);
    return null;
  }

  objectivePosition() {
    const m = this.game.missions;
    if (!m) return null;
    const obj = m.objective || m.currentObjective || (m.current && m.current.objective);
    if (!obj) return null;
    const p = obj.position || (obj.marker && obj.marker.position) || obj;
    if (p && typeof p.x === 'number' && typeof p.z === 'number') {
      return { x: p.x, z: p.z };
    }
    return null;
  }

  spawnEnemies(entries) {
    const combat = this.game.combat;
    if (!combat) return;
    const spawn = combat.spawnEnemies || combat.spawnHostiles || combat.spawn;
    if (typeof spawn === 'function') {
      spawn.call(combat, entries);
      return;
    }
    const actors = combat.enemies || combat.hostiles || [];
    entries.forEach((e, i) => {
      const a = actors[i];
      if (!a) return;
      const mesh = a.mesh || a;
      setXZ(mesh && mesh.position ? mesh.position : mesh, e.x, e.z);
      setHeadingOn(a, e.heading);
    });
  }

  setWeather(weather, time) {
    const city = this.game.city;
    if (!city) return;
    if (typeof city.setWeather === 'function') city.setWeather(weather);
    if (typeof city.setTimeOfDay === 'function') city.setTimeOfDay(time);
    else if (typeof city.setTime === 'function') city.setTime(time);
  }

  describe(name, extra) {
    return Object.assign({ shot: name, seed: this.seed }, extra);
  }

  blockade() {
    // Six cruisers in a wide V, 12-40 m ahead, facing back toward the player.
    const bx = this.baseX || 0;
    const bz = this.baseZ || 0;
    return [
      { x: 0, z: -12 },
      { x: -5, z: -19 },
      { x: 5, z: -19 },
      { x: -10, z: -28 },
      { x: 10, z: -28 },
      { x: 0, z: -40 },
    ].map((p) => ({ x: p.x + bx, z: p.z + bz, heading: Math.PI }));
  }

  // --- the four scenes ---

  stageDrive(rng) {
    this.clearScene();
    const x = -45;
    const z = -180;
    const heading = 0; // north
    this.putPlayerInCar(x, z, heading);
    this.setWeather('clear', 'sunset');
    // Traffic ahead (north); buildings line both sides of the straight road.
    const traffic = [];
    for (let i = 0; i < 5; i += 1) {
      traffic.push({
        x: x + (-3 + rng() * 6),
        z: z - (12 + i * 8 + rng() * 4),
        heading: 0,
      });
    }
    this.pinTraffic(traffic);
    this.pinPedestrians([
      { x: x + 7, z: z + 5, heading: Math.PI },
      { x: x - 7, z: z + 8, heading: 0 },
    ]);
    this.positionCamera(11, 5, 20, x, z, heading);
    return this.describe('drive', {
      description: 'car on a straight road heading north at sunset, clear weather',
      vehicle: true,
      wanted: 0,
      camera: '11 m behind, 5 m up, looking 20 m ahead',
    });
  }

  stageChase(rng) {
    this.clearScene();
    const x = -45;
    const z = -180;
    const heading = 0; // north
    this.baseX = x;
    this.baseZ = z;
    this.putPlayerInCar(x, z, heading);
    // Six cruisers in a wide V, 12-40 m ahead, each facing back toward the player.
    const blockade = this.blockade();
    if (this.game.police && typeof this.game.police.stage === 'function') {
      this.game.police.stage(blockade);
    }
    if (this.game.police && typeof this.game.police.addHeat === 'function') {
      this.game.police.addHeat(5);
    }
    this.startMission('the-drop');
    this.equipSmg();
    this.positionCamera(11, 4.8, 20, x, z, heading);
    return this.describe('chase', {
      description: 'car heading north into a six-cruiser police blockade',
      vehicle: true,
      wanted: 5,
      mission: 'the-drop',
      weapon: 'smg',
      camera: '11 m behind, 4.8 m up',
    });
  }

  stageMission(rng) {
    this.clearScene();
    this.startMission('the-drop');
    const obj = this.objectivePosition();
    const ox = obj ? obj.x : -45;
    const oz = obj ? obj.z : -180;
    const heading = 0; // north, toward the marker
    const px = ox;
    const pz = oz + 24; // 24 m south of the objective marker
    const player = this.game.player;
    setXZ(player.position, px, pz);
    if (typeof player.setHeading === 'function') player.setHeading(heading);
    if (this.game.police && typeof this.game.police.addHeat === 'function') {
      this.game.police.addHeat(1);
    }
    this.pinPedestrians([{ x: px + 4, z: pz - 1, heading: heading }]);
    this.positionCamera(7, 3.5, 24, px, pz, heading);
    return this.describe('mission', {
      description: 'on foot 24 m south of the objective marker',
      onFoot: true,
      wanted: 1,
      mission: 'the-drop',
      camera: '7 m behind, 3.5 m up, looking at the objective marker',
    });
  }

  stageOnfoot(rng) {
    this.clearScene();
    const x = 45;
    const z = 180;
    const heading = 0; // north
    const player = this.game.player;
    setXZ(player.position, x, z);
    if (typeof player.setHeading === 'function') player.setHeading(heading);
    if (this.game.police && typeof this.game.police.addHeat === 'function') {
      this.game.police.addHeat(3);
    }
    this.equipSmg();
    // Four hostile enemies 8-20 m ahead, facing the player.
    const enemies = [];
    for (let i = 0; i < 4; i += 1) {
      enemies.push({
        x: x + (-3 + rng() * 6),
        z: z - (8 + rng() * 12),
        heading: Math.PI, // facing south, toward the player
      });
    }
    this.spawnEnemies(enemies);
    this.positionCamera(6, 3, 12, x, z, heading);
    return this.describe('onfoot', {
      description: 'on foot facing four hostile enemies ahead',
      onFoot: true,
      enemies: 4,
      wanted: 3,
      weapon: 'smg',
      camera: '6 m behind, 3 m up',
    });
  }

  // --- HUD + finalize ---

  finalize(result) {
    // Hide the start and pause screens so only the HUD is captured.
    if (this.game.startScreen) this.game.startScreen.classList.add('hidden');
    if (this.game.pauseScreen) this.game.pauseScreen.classList.add('hidden');

    // Pin the police state to the shot's intent so the stars, the cruiser
    // count and the wanted readout all agree before the HUD refresh.
    this.pinPolice(result);

    // Stop the running game loop from overwriting the pinned HUD.
    this.game.shotStaged = true;

    this.updateHud(result);
    window.__shotReady = true;
    window.__game = this.game;
  }

  pinPolice(result) {
    const police = this.game.police;
    if (!police) return;
    const wanted = result && typeof result.wanted === 'number' ? result.wanted : 0;

    if (wanted === 0) {
      // No heat, no cruisers.
      if (typeof police.clearHeat === 'function') police.clearHeat();
      return;
    }

    if (wanted === 5) {
      // Five stars plus the blockade cruisers the chase shot expects.
      if (typeof police.addHeat === 'function') police.addHeat(100);
      if (typeof police.stage === 'function') police.stage(this.blockade());
      return;
    }

    if (wanted === 1) {
      // Exactly one star and no cruisers.
      if (typeof police.clearHeat === 'function') police.clearHeat();
      if (typeof police.addHeat === 'function') police.addHeat(20);
      if (typeof police.clear === 'function') police.clear();
      return;
    }

    if (wanted === 3) {
      // Exactly three stars and no cruisers.
      if (typeof police.clearHeat === 'function') police.clearHeat();
      if (typeof police.addHeat === 'function') police.addHeat(60);
      if (typeof police.clear === 'function') police.clear();
    }
  }

  updateHud(result) {
    const hud = this.game.hud;
    if (!hud) return;
    if (typeof hud.show === 'function') hud.show();

    const hasSmg = result.weapon === 'smg';

    // Health and armour: the HUD wants both current AND max.
    if (typeof hud.setHealth === 'function') hud.setHealth(100, 100);
    if (typeof hud.setArmour === 'function') hud.setArmour(hasSmg ? 100 : 50, 100);

    // Cash is a number; the HUD adds the dollar sign.
    if (typeof hud.setCash === 'function') hud.setCash(2500);

    if (typeof hud.setStars === 'function') hud.setStars(this.starCount(result));

    if (typeof hud.setDistrict === 'function') hud.setDistrict('Downtown');

    // Mission: a view object, or null to hide the panel.
    if (typeof hud.setMission === 'function') hud.setMission(this.buildMissionView(result));

    // Police: count first, then the unit rows.
    if (typeof hud.setPolice === 'function') {
      const rows = this.policeRows();
      hud.setPolice(rows.length, rows);
    }

    // Loadout: a weapons array plus the selected id.
    if (typeof hud.setLoadout === 'function') {
      const weapons = this.buildLoadout(result);
      hud.setLoadout(weapons, hasSmg ? result.weapon : 'fists');
    }

    if (typeof hud.setSpeed === 'function') hud.setSpeed(this.speedKmh(result));

    if (typeof hud.setSubtitle === 'function') {
      hud.setSubtitle(result.description || result.shot);
    }

    // Draw the minimap in screenshot mode too.
    if (typeof hud.drawMinimap === 'function') hud.drawMinimap(this.minimapState());
  }

  starCount(result) {
    if (result && typeof result.wanted === 'number') return result.wanted;
    const police = this.game.police;
    if (police && typeof police.stars === 'number') return police.stars;
    return 0;
  }

  buildMissionView(result) {
    if (result.shot !== 'chase' && result.shot !== 'mission') return null;
    if (typeof this.game.missionView === 'function') {
      const view = this.game.missionView();
      if (view) return view;
    }
    return {
      title: 'The Drop',
      step: 1,
      total: 2,
      objective: result.mission || 'Reach the drop point at the docks',
      reward: 1500,
    };
  }

  policeRows() {
    const police = this.game.police;
    const player = this.game.player;
    const units = (police && (police.units || police.cruisers || police.active)) || [];
    return (Array.isArray(units) ? units : []).slice(0, 8).map((u) => {
      const label = (u && (u.label || u.name || u.type)) || 'Police';
      let distance;
      if (u && typeof u.distance === 'number') {
        distance = u.distance;
      } else if (u && police && typeof police.distanceToPlayer === 'function') {
        distance = police.distanceToPlayer(u);
      } else if (u && u.position && player && player.position) {
        distance = Math.hypot(u.position.x - player.position.x, u.position.z - player.position.z);
      } else {
        distance = 0;
      }
      return { label, distance: Math.round(distance) };
    });
  }

  buildLoadout(result) {
    const list = [this.weaponEntry('fists')];
    if (result.weapon && result.weapon !== 'fists') {
      list.push(this.weaponEntry(result.weapon));
    }
    return list;
  }

  weaponEntry(id) {
    const def = WEAPONS ? WEAPONS[id] : null;
    return {
      id,
      name: (def && def.name) || (id.charAt(0).toUpperCase() + id.slice(1)),
      ammo: (def && typeof def.ammo === 'number') ? def.ammo : (id === 'fists' ? Infinity : 30),
      reserve: id === 'fists' ? null : 90,
    };
  }

  speedKmh(result) {
    if (!result.vehicle) return 0;
    return Math.round(24 * 3.6); // staged cruise speed, m/s -> km/h
  }

  minimapState() {
    if (typeof this.game.buildMinimapState === 'function') {
      return this.game.buildMinimapState();
    }
    const p = this.game.player;
    return {
      roads: [],
      police: [],
      waypoint: null,
      player: p && p.position ? { x: p.position.x, z: p.position.z } : { x: 0, z: 0 },
      range: 760,
      heading: p ? p.heading : 0,
    };
  }
}
