import * as THREE from 'three';

export function forwardVector(heading) {
  return { x: Math.sin(heading), z: -Math.cos(heading) };
}

function buildMesh() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2b2f3a });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xc99a7b });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.28), bodyMat);
  torso.position.y = 1.15;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), skinMat);
  head.position.y = 1.68;
  g.add(head);
  const armGeom = new THREE.BoxGeometry(0.14, 0.6, 0.14);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(armGeom, bodyMat);
    arm.position.set(side * 0.32, 1.15, 0);
    g.add(arm);
  }
  const legGeom = new THREE.BoxGeometry(0.18, 0.8, 0.18);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(legGeom, bodyMat);
    leg.position.set(side * 0.14, 0.4, 0);
    g.add(leg);
  }
  return g;
}

const BOUND = 330;

export class Player {
  constructor(scene, options = {}) {
    this.mesh = buildMesh();
    this.position = new THREE.Vector3(options.position?.x ?? 0, 0, options.position?.z ?? 0);
    this.velocity = new THREE.Vector3();
    this.heading = options.heading ?? 0;
    this.health = 100;
    this.armour = 0;
    this.cash = 500;
    this.wanted = 0;
    this.inCar = null;
    this.weapons = {};
    this.weaponSlot = null;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = -this.heading;
    scene.add(this.mesh);
  }

  update(dt, input, city) {
    if (this.inCar) {
      if (this.inCar.update) this.inCar.update(dt, input, city);
      this.position.copy(this.inCar.position);
      this.mesh.visible = false;
      return;
    }
    const f = forwardVector(this.heading);
    const r = { x: Math.cos(this.heading), z: Math.sin(this.heading) };
    let dx = 0, dz = 0;
    if (input.forward) { dx += f.x; dz += f.z; }
    if (input.back) { dx -= f.x; dz -= f.z; }
    if (input.right) { dx += r.x; dz += r.z; }
    if (input.left) { dx -= r.x; dz -= r.z; }
    const len = Math.hypot(dx, dz);
    if (len > 0) {
      dx /= len; dz /= len;
      const speed = input.run ? 8 : 4;
      const accel = 24;
      this.velocity.x += dx * accel * dt;
      this.velocity.z += dz * accel * dt;
      const sp = Math.hypot(this.velocity.x, this.velocity.z);
      if (sp > speed) {
        const k = speed / sp;
        this.velocity.x *= k;
        this.velocity.z *= k;
      }
    } else {
      const fr = Math.max(0, 1 - 12 * dt);
      this.velocity.x *= fr;
      this.velocity.z *= fr;
    }
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.position.x = Math.max(-BOUND, Math.min(BOUND, this.position.x));
    this.position.z = Math.max(-BOUND, Math.min(BOUND, this.position.z));
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = -this.heading;
  }

  setHeading(h) {
    this.heading = h;
    this.mesh.rotation.y = -h;
  }

  takeDamage(amount) {
    let remaining = amount;
    if (this.armour > 0) {
      const absorbed = Math.min(this.armour, remaining);
      this.armour -= absorbed;
      remaining -= absorbed;
    }
    const before = this.health;
    this.health = Math.max(0, this.health - remaining);
    return before - this.health;
  }

  addCash(n) { this.cash += n; }

  spendCash(n) {
    if (this.cash < n) return false;
    this.cash -= n;
    return true;
  }

  addWeapon(id, ammo) {
    this.weapons[id] = (this.weapons[id] || 0) + ammo;
    this.weaponSlot = id;
  }

  equip(id) {
    if (this.weapons[id] !== undefined) this.weaponSlot = id;
  }

  currentWeapon() {
    if (this.weaponSlot && this.weapons[this.weaponSlot] !== undefined) {
      return { id: this.weaponSlot, ammo: this.weapons[this.weaponSlot] };
    }
    return { id: 'fists', ammo: Infinity };
  }

  useAmmo(n) {
    const w = this.currentWeapon();
    if (w.id === 'fists' || this.weapons[w.id] < n) return false;
    this.weapons[w.id] -= n;
    return true;
  }

  enterCar(car) {
    this.inCar = car;
    this.mesh.visible = false;
    this.position.copy(car.position);
  }

  exitCar() {
    const car = this.inCar;
    this.inCar = null;
    this.mesh.visible = true;
    if (car) {
      this.position.set(car.position.x + 1.5, 0, car.position.z);
      this.mesh.position.copy(this.position);
    }
  }

  addWanted(n) {
    this.wanted = Math.max(0, Math.min(5, this.wanted + n));
  }

  reset() {
    this.health = 100;
    this.armour = 0;
    this.wanted = 0;
  }
}
