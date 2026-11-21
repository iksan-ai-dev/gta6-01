import * as THREE from 'three';

// Deterministic seeded PRNG (mulberry32) — the project forbids Math.random().
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const WEAPONS = {
  fists:   { name: 'Fists',   damage: 8,  rpm: 120, range: 2.2,  spread: 0,     ammo: Infinity },
  pistol:  { name: 'Pistol',  damage: 22, rpm: 300, range: 60,   spread: 0.012, ammo: 12 },
  smg:     { name: 'SMG',     damage: 14, rpm: 750, range: 45,   spread: 0.03,  ammo: 30 },
  shotgun: { name: 'Shotgun', damage: 40, rpm: 70,  range: 22,   spread: 0.09,  ammo: 6 },
  rifle:   { name: 'Rifle',   damage: 34, rpm: 420, range: 90,   spread: 0.008, ammo: 25 },
};

const BULLET_SPEED = 120;
const ENEMY_RADIUS = 0.6;
const DEATH_FADE = 0.6; // seconds to fade a dead enemy out

export class Combat {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.player = options.player || null;
    this.city = options.city || null;
    this.rng = mulberry32(options.seed == null ? 1 : options.seed);

    this.enemies = [];
    this.bullets = [];
    this.lastShotAt = {};
    this._nowMs = 0;

    this._bulletGeo = new THREE.SphereGeometry(0.05, 6, 6);
    this._bulletMat = new THREE.MeshLambertMaterial({ color: 0xffe08a });
  }

  _buildEnemy() {
    const group = new THREE.Group();
    const mat = (c) => new THREE.MeshLambertMaterial({ color: new THREE.Color(c) });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.3), mat('#2b2f3a'));
    body.position.y = 1.225;
    group.add(body);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.25, 0.26), mat('#c9946d'));
    head.position.y = 1.675;
    group.add(head);

    const legGeo = new THREE.BoxGeometry(0.18, 0.9, 0.18);
    const legMat = mat('#1c1f27');
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.14, 0.45, 0);
    group.add(legL);
    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set(0.14, 0.45, 0);
    group.add(legR);

    const accentGeo = new THREE.BoxGeometry(0.16, 0.1, 0.32);
    const accentMat = mat('#c0392b');
    const accL = new THREE.Mesh(accentGeo, accentMat);
    accL.position.set(-0.19, 1.5, 0);
    group.add(accL);
    const accR = new THREE.Mesh(accentGeo, accentMat);
    accR.position.set(0.19, 1.5, 0);
    group.add(accR);

    return group;
  }

  spawnEnemy(x, z, options = {}) {
    const mesh = this._buildEnemy();
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);

    const enemy = {
      mesh,
      x,
      z,
      health: options.health != null ? options.health : 60,
      maxHealth: options.health != null ? options.health : 60,
      speed: options.speed != null ? options.speed : 1.4 + this.rng() * 1.0,
      radius: ENEMY_RADIUS,
      heading: 0,
      dead: false,
      deathTimer: 0,
      mats: [],
    };
    enemy.update = (dt) => this._updateEnemy(enemy, dt);

    this._updateEnemy(enemy, 0); // face the player immediately
    this.enemies.push(enemy);
    return enemy;
  }

  _playerPos() {
    const p = this.player;
    if (!p) return { x: 0, z: 0 };
    if (p.position) return { x: p.position.x, z: p.position.z };
    if (typeof p.x === 'number' && typeof p.z === 'number') return { x: p.x, z: p.z };
    return { x: 0, z: 0 };
  }

  _updateEnemy(enemy, dt) {
    const p = this._playerPos();
    const dx = p.x - enemy.x;
    const dz = p.z - enemy.z;
    const dist = Math.hypot(dx, dz);
    enemy.heading = Math.atan2(dx, -dz);

    if (dist <= 40 && dist > 6) {
      const step = enemy.speed * dt;
      enemy.x += (dx / dist) * step;
      enemy.z += (dz / dist) * step;
    }

    enemy.mesh.position.x = enemy.x;
    enemy.mesh.position.z = enemy.z;
    enemy.mesh.rotation.y = -enemy.heading;
  }

  shoot(originVec3, heading, weaponId) {
    const w = WEAPONS[weaponId];
    if (!w) return null;

    const now = this._nowMs;
    const last = this.lastShotAt[weaponId] ?? -Infinity;
    const interval = 60000 / w.rpm;
    if (now - last < interval) return null;
    this.lastShotAt[weaponId] = now;

    if (weaponId === 'fists') {
      let hitEnemy = null;
      for (const e of this.enemies) {
        if (e.health <= 0) continue;
        const d = Math.hypot(e.x - originVec3.x, e.z - originVec3.z);
        if (d <= w.range) {
          hitEnemy = e;
          break;
        }
      }
      if (hitEnemy) {
        this.damageEnemy(hitEnemy, w.damage);
        return { hit: true, damage: w.damage, melee: true };
      }
      return { hit: false, damage: w.damage, melee: true };
    }

    const dir = new THREE.Vector3(Math.sin(heading), 0, -Math.cos(heading));
    const bullet = {
      pos: new THREE.Vector3(originVec3.x, originVec3.y, originVec3.z),
      dir,
      speed: BULLET_SPEED,
      damage: w.damage,
      range: w.range,
      travelled: 0,
      mesh: new THREE.Mesh(this._bulletGeo, this._bulletMat),
    };
    bullet.mesh.position.copy(bullet.pos);
    bullet.mesh.rotation.y = -heading;
    this.scene.add(bullet.mesh);
    this.bullets.push(bullet);
    return { hit: false, damage: w.damage };
  }

  update(dt, nowMs) {
    if (typeof nowMs === 'number' && isFinite(nowMs)) {
      this._nowMs = nowMs;
    } else {
      this._nowMs = typeof performance !== 'undefined' ? performance.now() : this._nowMs + dt * 1000;
    }

    const alive = this.aliveEnemies();
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const step = b.speed * dt;
      b.pos.addScaledVector(b.dir, step);
      b.travelled += step;
      b.mesh.position.copy(b.pos);

      let hit = null;
      for (const e of alive) {
        if (Math.hypot(e.x - b.pos.x, e.z - b.pos.z) <= e.radius) {
          hit = e;
          break;
        }
      }

      if (hit) {
        this.damageEnemy(hit, b.damage);
        this._removeBullet(i);
      } else if (b.travelled >= b.range) {
        this._removeBullet(i);
      }
    }

    for (const e of this.enemies) {
      if (e.dead) {
        e.deathTimer += dt;
        const t = Math.min(e.deathTimer / DEATH_FADE, 1);
        for (const m of e.mats) m.opacity = 1 - t;
      } else {
        e.update(dt);
      }
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead && e.deathTimer >= DEATH_FADE) {
        this.scene.remove(e.mesh);
        this.enemies.splice(i, 1);
      }
    }
  }

  _removeBullet(index) {
    const b = this.bullets[index];
    this.scene.remove(b.mesh);
    this.bullets.splice(index, 1);
  }

  damageEnemy(enemy, amount) {
    if (!enemy || enemy.health <= 0) return;
    enemy.health -= amount;
    if (enemy.health <= 0) {
      enemy.health = 0;
      enemy.dead = true;
      enemy.deathTimer = 0;
      const mats = [];
      enemy.mesh.traverse((o) => {
        if (!o.isMesh) return;
        const list = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of list) {
          m.transparent = true;
          mats.push(m);
        }
      });
      enemy.mats = mats;
    }
  }

  aliveEnemies() {
    return this.enemies.filter((e) => e.health > 0);
  }

  clear() {
    for (const e of this.enemies) this.scene.remove(e.mesh);
    for (const b of this.bullets) this.scene.remove(b.mesh);
    this.enemies.length = 0;
    this.bullets.length = 0;
    this.lastShotAt = {};
  }
}
