import * as THREE from 'three';
import { createCity } from './city.js';
import { Player, forwardVector } from './player.js';
import { Vehicle } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './pedestrians.js';
import { Combat, WEAPONS } from './combat.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { Hud } from './hud.js';
import { Save } from './save.js';
import { Shots, shotFromQuery } from './shots.js';

const DEFAULT_WEAPON_IDS = ['fists', 'pistol', 'smg', 'shotgun', 'rifle'];
const HELD_KEYS = new Set(['forward', 'backward', 'left', 'right', 'run', 'handbrake']);
const EDGE_KEYS = new Set(['f', 'r', '1', '2', '3', '4', '5']);
const AUTO_SAVE_INTERVAL = 30;

export class Game {
  constructor() {
    this.paused = true;
    this.keys = {};
    this.pressed = {};
    this.currentCar = null;
    this.saveTimer = 0;
    this.district = null;
    this.cars = [];

    this.startScreen = this.findScreen([
      'start-screen', 'startScreen', 'menu', 'title-screen', 'title',
    ]);
    this.pauseScreen = this.findScreen([
      'pause-screen', 'pauseScreen', 'pause-menu', 'pause',
    ]);

    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0d14);
    this.scene.fog = new THREE.Fog(0x0a0d14, 90, 520);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      900
    );
    this.camera.position.set(0, 4, 12);

    const hemi = new THREE.HemisphereLight(0x8fb3d9, 0x2c3138, 0.75);
    const sun = new THREE.DirectionalLight(0xffc37d, 1.4);
    sun.position.set(-90, 28, -70);
    const ambient = new THREE.AmbientLight(0x404a5c, 0.4);
    this.scene.add(hemi, sun, ambient);

    this.city = createCity(this.scene, {});
    this.player = new Player(this.scene, {});
    this.traffic = new Traffic(this.scene, { city: this.city, roads: this.city.roads });
    this.pedestrians = new Pedestrians(this.scene, { city: this.city, roads: this.city.roads });
    this.combat = new Combat(this.scene, { player: this.player });
    this.police = new Police(this.scene, { city: this.city, player: this.player });
    this.missions = new Missions({ player: this.player });
    this.hud = new Hud();
    this.save = new Save();
    this.shots = new Shots(this);

    this.createParkedCars();
    this.bindInput();
    this.bindUi();

    window.addEventListener('resize', () => this.onResize());

    this.hud.hide();
    this.showScreen(this.startScreen);
    this.hideScreen(this.pauseScreen);

    this.clock = new THREE.Clock();
    requestAnimationFrame(() => this.tick());

    window.__game = this;
    window.__setWeapon = (id) => this.player.equip(id);
  }

  findScreen(ids) {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    return null;
  }

  showScreen(el) {
    if (el) el.style.display = '';
  }

  hideScreen(el) {
    if (el) el.style.display = 'none';
  }

  createParkedCars() {
    const start = this.player.position;
    const spots = [
      { x: 6, z: 2, heading: Math.PI },
      { x: -6, z: 2, heading: 0 },
      { x: 0, z: -6, heading: Math.PI / 2 },
    ];
    for (const spot of spots) {
      const car = new Vehicle(this.scene, {});
      car.position.x = start.x + spot.x;
      car.position.y = 0;
      car.position.z = start.z + spot.z;
      car.heading = spot.heading;
      if (car.mesh) {
        car.mesh.position.copy(car.position);
        car.mesh.rotation.y = spot.heading;
      }
      this.cars.push(car);
    }
  }

  bindInput() {
    window.addEventListener('keydown', (e) => {
      const key = this.mapKey(e);
      if (!key) return;
      e.preventDefault();
      if (HELD_KEYS.has(key)) {
        this.keys[key] = true;
      } else if (EDGE_KEYS.has(key) && !e.repeat) {
        this.pressed[key] = true;
      }
      if (key === 'escape' && !e.repeat) {
        this.togglePause();
      }
    });

    window.addEventListener('keyup', (e) => {
      const key = this.mapKey(e);
      if (!key) return;
      if (HELD_KEYS.has(key)) this.keys[key] = false;
    });

    this.renderer.domElement.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.shoot();
    });
  }

  mapKey(e) {
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        return 'forward';
      case 'KeyS':
      case 'ArrowDown':
        return 'backward';
      case 'KeyA':
      case 'ArrowLeft':
        return 'left';
      case 'KeyD':
      case 'ArrowRight':
        return 'right';
      case 'ShiftLeft':
      case 'ShiftRight':
        return 'run';
      case 'Space':
        return 'handbrake';
      case 'KeyF':
        return 'f';
      case 'KeyR':
        return 'r';
      case 'Digit1':
      case 'Numpad1':
        return '1';
      case 'Digit2':
      case 'Numpad2':
        return '2';
      case 'Digit3':
      case 'Numpad3':
        return '3';
      case 'Digit4':
      case 'Numpad4':
        return '4';
      case 'Digit5':
      case 'Numpad5':
        return '5';
      case 'Escape':
        return 'escape';
      default:
        return null;
    }
  }

  bindUi() {
    const newBtn = document.getElementById('new-game-btn');
    const resumeBtn = document.getElementById('resume-btn');
    if (newBtn) newBtn.addEventListener('click', () => this.start());
    if (resumeBtn) resumeBtn.addEventListener('click', () => this.resume());
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  tick() {
    requestAnimationFrame(() => this.tick());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.paused) {
      this.render();
      return;
    }
    this.update(dt, performance.now());
    this.render();
  }

  update(dt, nowMs) {
    this.city.update(dt);

    const input = this.buildInput();
    this.player.update(dt, input, this.city);
    this.traffic.update(dt);
    this.pedestrians.update(dt);
    this.combat.update(dt, nowMs);
    this.police.update(dt);
    this.missions.update(dt, this.player.position);

    const district = this.city.districtAt(
      this.player.position.x,
      this.player.position.z
    );
    if (district) this.district = district;

    if (this.consumePress('f')) this.handleCarInteract();
    if (this.consumePress('r')) this.reload();
    for (const key of ['1', '2', '3', '4', '5']) {
      if (this.consumePress(key)) this.switchWeapon(key);
    }

    this.updateMissionProgress();
    this.updateHud(district || this.district, nowMs);

    this.saveTimer += dt;
    if (this.saveTimer >= AUTO_SAVE_INTERVAL) {
      this.saveTimer = 0;
      this.autosave();
    }
  }

  buildInput() {
    const k = this.keys;
    return {
      forward: !!k.forward,
      backward: !!k.backward,
      left: !!k.left,
      right: !!k.right,
      run: !!k.run,
      handbrake: !!k.handbrake,
    };
  }

  consumePress(key) {
    if (this.pressed[key]) {
      this.pressed[key] = false;
      return true;
    }
    return false;
  }

  handleCarInteract() {
    if (this.player.inCar) {
      this.exitCar();
      return;
    }
    const car = this.nearestCar(4);
    if (car) this.enterCar(car);
  }

  nearestCar(maxDist) {
    let best = null;
    let bestDist = maxDist;
    const px = this.player.position.x;
    const pz = this.player.position.z;
    for (const car of this.cars) {
      if (!car || !car.position) continue;
      const d = Math.hypot(car.position.x - px, car.position.z - pz);
      if (d <= bestDist) {
        bestDist = d;
        best = car;
      }
    }
    return best;
  }

  enterCar(car) {
    this.player.enterCar(car);
    this.currentCar = car;
  }

  exitCar() {
    this.player.exitCar();
    this.currentCar = null;
  }

  reload() {
    if (this.player.inCar) return;
    const id = this.currentWeaponId();
    if (id === 'fists') return;
    const def = WEAPONS ? WEAPONS[id] : null;
    if (def && typeof def.ammo === 'number') {
      this.player.addWeapon(id, def.ammo);
    }
    this.hud.setSubtitle('Reloaded', 1.5);
  }

  switchWeapon(key) {
    const idx = Number(key) - 1;
    const ids = WEAPONS instanceof Map
      ? Array.from(WEAPONS.keys())
      : (WEAPONS ? Object.keys(WEAPONS) : []);
    const id = (ids.length >= 5 && ids[idx]) || DEFAULT_WEAPON_IDS[idx];
    if (id == null) return;
    this.player.equip(id);
  }

  currentWeaponId() {
    const w = this.player.currentWeapon();
    if (w == null) return 'fists';
    if (typeof w === 'string') return w;
    if (typeof w === 'object') {
      if (w.id != null) return w.id;
      if (w.name != null) return w.name;
    }
    return 'fists';
  }

  shoot() {
    if (this.paused || this.player.inCar) return;
    const id = this.currentWeaponId();
    const eye = new THREE.Vector3(
      this.player.position.x,
      this.player.position.y + 1.6,
      this.player.position.z
    );
    this.combat.shoot(eye, this.player.heading, id);
    if (id !== 'fists') this.player.useAmmo(1);
    this.player.addWanted(1);
    this.police.addHeat(1);
  }

  updateMissionProgress() {
    if (!this.missions.active) return;
    if (this.missions.checkProgress(this.player.position)) {
      this.missions.advance();
      const view = this.missionView();
      if (view) this.hud.setSubtitle(view.objective || 'Objective updated', 3);
      else this.hud.setSubtitle('Mission complete', 3);
    }
  }

  missionView() {
    const active = this.missions.active;
    if (!active) return null;
    const mission = active.mission;
    if (!mission) return null;
    const stepIndex = typeof active.stepIndex === 'number' ? active.stepIndex : 0;
    const steps = Array.isArray(mission.steps) ? mission.steps : [];
    const stepObj = steps[stepIndex] || this.missions.currentStep() || null;
    const total = steps.length || (typeof mission.total === 'number' ? mission.total : 1);
    return {
      title: mission.title || mission.name || mission.id || 'Mission',
      step: stepIndex + 1,
      total,
      objective: (stepObj && (stepObj.objective || stepObj.text || stepObj.name || stepObj.label))
        || mission.objective || '',
      reward: typeof mission.reward === 'number' ? mission.reward : 0,
    };
  }

  buildPoliceUnits() {
    const units = this.police.units || [];
    return units
      .map((u) => ({
        label: (u && (u.label || u.name || u.type)) || 'Police',
        distance: Math.round(this.police.distanceToPlayer(u)),
      }))
      .sort((a, b) => a.distance - b.distance);
  }

  buildLoadout() {
    const list = [];
    const seen = new Set();
    const add = (id, ammo) => {
      if (id == null || seen.has(id)) return;
      seen.add(id);
      list.push({ id, ammo });
    };
    add('fists', Infinity);
    const weapons = this.player.weapons;
    if (weapons instanceof Map) {
      for (const [id, v] of weapons) {
        add(id, (v && typeof v === 'object' && 'ammo' in v) ? v.ammo : v);
      }
    } else if (Array.isArray(weapons)) {
      for (const it of weapons) {
        if (it && typeof it === 'object') {
          add(it.id != null ? it.id : it.name, it.ammo);
        } else {
          add(it, undefined);
        }
      }
    } else if (weapons && typeof weapons === 'object') {
      for (const [id, v] of Object.entries(weapons)) {
        add(id, (v && typeof v === 'object' && 'ammo' in v) ? v.ammo : v);
      }
    }
    return list;
  }

  getWaypoint() {
    const m = this.missions.active;
    if (!m) return null;
    const step = this.missions.currentStep();
    const candidate = (step && typeof step === 'object') ? step : m;
    if (candidate && typeof candidate.x === 'number' && typeof candidate.z === 'number') {
      return { x: candidate.x, z: candidate.z };
    }
    return null;
  }

  buildRoadSegments() {
    const segments = [];
    for (const road of this.city.roads || []) {
      if (road.axis === 'x') {
        segments.push([
          [road.x - road.w / 2, road.z],
          [road.x + road.w / 2, road.z],
        ]);
      } else {
        segments.push([
          [road.x, road.z - road.d / 2],
          [road.x, road.z + road.d / 2],
        ]);
      }
    }
    return segments;
  }

  buildMinimapState() {
    const p = this.player;
    return {
      roads: this.buildRoadSegments(),
      police: (this.police.units || []).map((u) => ({ x: u.position.x, z: u.position.z })),
      waypoint: this.getWaypoint(),
      player: { x: p.position.x, z: p.position.z },
      range: 760,
      heading: p.heading,
    };
  }

  updateHud(district, nowMs) {
    const p = this.player;
    const hud = this.hud;
    const maxHealth = typeof p.maxHealth === 'number' ? p.maxHealth : 100;
    const maxArmour = typeof p.maxArmour === 'number' ? p.maxArmour : 100;
    hud.setHealth(p.health, maxHealth);
    hud.setArmour(p.armour, maxArmour);
    hud.setCash(p.cash);
    hud.setStars(this.police.stars);
    hud.setDistrict(district || '');
    hud.setMission(this.missionView());
    const units = this.buildPoliceUnits();
    hud.setPolice(units.length, units);
    hud.setLoadout(this.buildLoadout(), this.currentWeaponId());
    const speed = (p.inCar && this.currentCar) ? Math.abs(this.currentCar.speed) : 0;
    hud.setSpeed(Math.round(speed * 3.6));
    hud.drawMinimap(this.buildMinimapState());
    hud.update(nowMs);
  }

  render() {
    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
  }

  updateCamera() {
    const pos = (this.player.inCar && this.currentCar)
      ? this.currentCar.position
      : this.player.position;
    const fwd = forwardVector(this.player.heading);
    const inCar = this.player.inCar && !!this.currentCar;
    const dist = inCar ? 12 : 8;
    const height = inCar ? 5.5 : 3.5;
    this.camera.position.set(
      pos.x - fwd.x * dist,
      pos.y + height,
      pos.z - fwd.z * dist
    );
    this.camera.lookAt(pos.x, pos.y + 1.5, pos.z);
  }

  start() {
    this.hideScreen(this.startScreen);
    this.hideScreen(this.pauseScreen);
    this.hud.show();
    this.resetState();
    if (this.save.hasSave()) {
      const state = this.save.load();
      if (state) this.applyState(state);
    }
    this.paused = false;
    const district = this.city.districtAt(
      this.player.position.x,
      this.player.position.z
    );
    this.district = district;
    this.hud.setSubtitle('Welcome to ' + (district || 'the city'), 4);
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    this.showScreen(this.pauseScreen);
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.hideScreen(this.pauseScreen);
  }

  togglePause() {
    if (this.paused) this.resume();
    else this.pause();
  }

  resetState() {
    this.player.reset();
    this.player.setHeading(0);
    this.currentCar = null;
    this.traffic.clear();
    this.pedestrians.clear();
    this.combat.clear();
    this.police.clearHeat();
    this.police.clear();
    this.missions.abort();
    this.saveTimer = 0;
    this.district = null;
  }

  autosave() {
    this.save.save(this.buildState());
  }

  buildState() {
    const p = this.player;
    return {
      version: 1,
      savedAt: Date.now(),
      player: {
        x: p.position.x,
        z: p.position.z,
        heading: p.heading,
        health: p.health,
        armour: p.armour,
        cash: p.cash,
        wanted: p.wanted,
        weapons: this.serializeWeapons(p.weapons),
        weapon: this.currentWeaponId(),
      },
      missionId: this.missions.active
        ? (this.missions.active.id || this.missions.active.name)
        : null,
    };
  }

  serializeWeapons(weapons) {
    const out = {};
    if (!weapons) return out;
    if (weapons instanceof Map) {
      for (const [id, v] of weapons) {
        out[id] = (v && typeof v === 'object' && 'ammo' in v) ? v.ammo : v;
      }
    } else if (Array.isArray(weapons)) {
      for (const it of weapons) {
        if (it && typeof it === 'object' && it.id != null) out[it.id] = it.ammo;
        else if (typeof it === 'string') out[it] = 0;
      }
    } else if (typeof weapons === 'object') {
      for (const [id, v] of Object.entries(weapons)) {
        out[id] = (v && typeof v === 'object' && 'ammo' in v) ? v.ammo : v;
      }
    }
    return out;
  }

  applyState(state) {
    if (!state || typeof state !== 'object') return;
    const data = state.player;
    if (data && typeof data === 'object') {
      const p = this.player;
      p.reset();
      if (typeof data.x === 'number' && typeof data.z === 'number') {
        p.position.x = data.x;
        p.position.y = 0;
        p.position.z = data.z;
      }
      if (typeof data.heading === 'number') p.setHeading(data.heading);
      if (typeof data.health === 'number') p.health = data.health;
      if (typeof data.armour === 'number') p.armour = data.armour;
      if (typeof data.cash === 'number') p.cash = data.cash;
      if (typeof data.wanted === 'number') p.wanted = data.wanted;
      if (data.weapons && typeof data.weapons === 'object') {
        for (const [id, ammo] of Object.entries(data.weapons)) {
          try {
            p.addWeapon(id, ammo);
          } catch (e) {
            // Ignore weapons the player cannot hold.
          }
        }
      }
      if (typeof data.weapon === 'string') {
        try {
          p.equip(data.weapon);
        } catch (e) {
          // Ignore an unknown equipped weapon id.
        }
      }
    }
    if (state.missionId) {
      try {
        this.missions.start(state.missionId);
      } catch (e) {
        // Ignore an unknown mission id.
      }
    }
  }
}

export default Game;

function boot() {
  const game = new Game();
  const query = shotFromQuery();
  if (query && query.shot) {
    game.shots.stage(query.shot, query.seed);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
