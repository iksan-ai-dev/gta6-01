import * as THREE from 'three';

// Deterministic seeded PRNG (mulberry32) — never Math.random().
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

export class Police {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.player = options.player || null;
    this.city = options.city || null;
    this.seed = options.seed != null ? options.seed : 1;

    this.rng = mulberry32(this.seed);

    this.heat = 0;
    this.units = [];
    this.spawnTimer = 0;
    this.time = 0;

    // Read-only star level: assigning throws in strict mode, is a no-op otherwise.
    Object.defineProperty(this, 'stars', {
      get() {
        return Math.min(5, Math.floor(this.heat / 20));
      },
      enumerable: true,
      configurable: false,
    });
  }

  addHeat(n) {
    const before = this.stars;
    this.heat = Math.max(0, Math.min(100, this.heat + n));
    if (this.stars > before) {
      this.spawnWave();
    }
  }

  clearHeat() {
    this.heat = 0;
    this.clear();
  }

  clear() {
    for (const unit of this.units) {
      this.scene.remove(unit.mesh);
    }
    this.units = [];
  }

  spawnWave() {
    const count = Math.max(1, Math.min(6, this.stars));
    for (let i = 0; i < count; i++) {
      // Spread each cruiser around the player at 40..90 m.
      const angle = (i / count) * Math.PI * 2 + (this.rng() - 0.5) * 0.8;
      const dist = 40 + this.rng() * 50;
      const x = this.player.position.x + Math.sin(angle) * dist;
      const z = this.player.position.z - Math.cos(angle) * dist;
      const heading = Math.atan2(this.player.position.x - x, -(this.player.position.z - z));
      this.spawnAt(x, z, heading);
    }
  }

  spawnAt(x, z, heading) {
    const mesh = this.makeCruiserMesh();
    mesh.position.set(x, 0, z);
    mesh.rotation.y = -heading;
    this.scene.add(mesh);

    const unit = {
      mesh,
      position: new THREE.Vector3(x, 0, z),
      heading,
      speed: 18,
      health: 100,
      lightbar: mesh.userData.lightbar,
    };
    this.units.push(unit);
    return unit;
  }

  stage(list) {
    this.clear();
    for (const item of list) {
      this.spawnAt(item.x, item.z, item.heading);
    }
  }

  makeCruiserMesh() {
    const group = new THREE.Group();

    // White body — reads clearly against dark asphalt (never near-black).
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.6, 4.6),
      new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.35, metalness: 0.25 })
    );
    body.position.y = 0.55;
    group.add(body);

    // Dark cabin.
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.55, 2.0),
      new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.3, metalness: 0.2 })
    );
    cabin.position.set(0, 1.08, -0.15);
    group.add(cabin);

    // Black front push bar (front faces -z at heading 0).
    const pushBar = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.35, 0.22),
      new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.7, metalness: 0.5 })
    );
    pushBar.position.set(0, 0.5, -2.42);
    group.add(pushBar);

    // Roof light bar: two emissive boxes — red and blue.
    const lightbar = new THREE.Group();
    const redMat = new THREE.MeshStandardMaterial({
      color: 0xff2020,
      emissive: 0xff2020,
      emissiveIntensity: 1.5,
    });
    const blueMat = new THREE.MeshStandardMaterial({
      color: 0x2050ff,
      emissive: 0x2050ff,
      emissiveIntensity: 1.5,
    });
    const redBox = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.24, 1.6), redMat);
    redBox.position.set(-0.38, 0, 0);
    const blueBox = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.24, 1.6), blueMat);
    blueBox.position.set(0.38, 0, 0);
    lightbar.add(redBox);
    lightbar.add(blueBox);
    lightbar.position.set(0, 1.45, -0.15);
    group.add(lightbar);

    group.userData.lightbar = lightbar;
    return group;
  }

  distanceToPlayer(unit) {
    const dx = this.player.position.x - unit.position.x;
    const dz = this.player.position.z - unit.position.z;
    return Math.hypot(dx, dz);
  }

  update(dt) {
    this.time += dt;
    this.spawnTimer = Math.max(0, this.spawnTimer - dt);

    const px = this.player.position.x;
    const pz = this.player.position.z;

    for (const unit of this.units) {
      const dx = px - unit.position.x;
      const dz = pz - unit.position.z;
      const dist = Math.hypot(dx, dz);

      if (dist > 6) {
        unit.heading = Math.atan2(dx, -dz);
        unit.position.x += Math.sin(unit.heading) * unit.speed * dt;
        unit.position.z += -Math.cos(unit.heading) * unit.speed * dt;
        unit.mesh.position.set(unit.position.x, 0, unit.position.z);
        unit.mesh.rotation.y = -unit.heading;
      }

      // Pulse the light bar emissiveIntensity so it flashes.
      const flash = 0.4 + 0.6 * Math.abs(Math.sin(this.time * 7));
      for (const child of unit.lightbar.children) {
        if (child.material) {
          child.material.emissiveIntensity = 1.5 * flash;
        }
      }
    }
  }
}
