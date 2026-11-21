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

const PAVEMENT_OFFSET = 6.5;

const MUTED_COLORS = [
  '#6b5b4f', '#5a6b5a', '#6b6b6b', '#5b5b6b', '#7a6b5a',
  '#5f5f5f', '#6b5a5a', '#4f5a5b', '#78624d', '#5d5d6b',
];
const SKIN_COLORS = ['#d9b08c', '#c9946d', '#e0b596', '#b98a67', '#d2a17a'];

// Convert a road's start/end/position into a plain { x, z } point, tolerating
// plain objects, THREE.Vector2, THREE.Vector3 and [x, z] arrays.
function asVec(p) {
  if (p == null) return null;
  if (Array.isArray(p)) return { x: p[0], z: p[1] };
  let x, z;
  if (typeof p.x === 'number') x = p.x;
  else if (typeof p[0] === 'number') x = p[0];
  if (typeof p.z === 'number') z = p.z;
  else if (typeof p.y === 'number') z = p.y; // Vector2: y is the 2D second axis
  else if (typeof p[1] === 'number') z = p[1];
  if (x == null || z == null || !isFinite(x) || !isFinite(z)) return null;
  return { x, z };
}

// Normalise a road into a usable centreline description, or null when the road
// cannot be understood. Returns { axis, min, max, cross, length } where axis is
// the axis the road runs along and cross is the fixed perpendicular coordinate.
function roadGeometry(road) {
  const s = asVec(road.start ?? road.from ?? road.a ?? road.p0);
  const e = asVec(road.end ?? road.to ?? road.b ?? road.p1);

  let axis = null;
  if (road.axis === 'x' || road.axis === 'z') axis = road.axis;
  if (!axis && s && e) axis = Math.abs(e.x - s.x) >= Math.abs(e.z - s.z) ? 'x' : 'z';
  if (!axis) axis = 'x';

  const along = axis;
  const cross = axis === 'x' ? 'z' : 'x';

  let min, max, crossVal;
  if (s && e) {
    min = Math.min(s[along], e[along]);
    max = Math.max(s[along], e[along]);
    crossVal = (s[cross] + e[cross]) / 2;
  } else if (road.length != null) {
    const c = asVec(road.position ?? road.center ?? road.pos) ?? { x: 0, z: 0 };
    min = c[along] - road.length / 2;
    max = c[along] + road.length / 2;
    crossVal = c[cross];
  } else {
    return null;
  }

  if (!isFinite(min) || !isFinite(max) || max <= min) return null;
  return { axis, min, max, cross: crossVal, length: max - min };
}

export class Pedestrians {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.roads = Array.isArray(options.roads)
      ? options.roads
      : options.roads
        ? [options.roads]
        : [];
    this.count = options.count || 0;
    this.rng = mulberry32(options.seed == null ? 1 : options.seed);

    this.agents = [];
    this.frozen = false;
    this.fleeing = false;

    this._spawn();
  }

  _spawn() {
    const geoms = [];
    const weights = [];
    for (const road of this.roads) {
      const g = roadGeometry(road);
      if (g) {
        geoms.push(g);
        weights.push(g.length);
      }
    }
    if (geoms.length === 0) return;

    const total = weights.reduce((a, b) => a + b, 0);
    const pick = () => {
      let t = this.rng() * total;
      for (let i = 0; i < geoms.length; i++) {
        t -= weights[i];
        if (t <= 0) return i;
      }
      return geoms.length - 1;
    };

    for (let i = 0; i < this.count; i++) {
      const gi = pick();
      const g = geoms[gi];
      const lane = this.rng() < 0.5 ? -1 : 1;
      const dir = this.rng() < 0.5 ? -1 : 1;
      const pos = this.rng() * g.length;
      const speed = 0.9 + this.rng() * (1.6 - 0.9);
      const phase = this.rng() * Math.PI * 2;

      const bodyColor = MUTED_COLORS[(this.rng() * MUTED_COLORS.length) | 0];
      const legColor = MUTED_COLORS[(this.rng() * MUTED_COLORS.length) | 0];
      const skinColor = SKIN_COLORS[(this.rng() * SKIN_COLORS.length) | 0];

      const mesh = this._buildPedestrian(bodyColor, legColor, skinColor);
      const p = this._positionFor(g, lane, pos);
      mesh.position.set(p.x, Math.sin(phase) * 0.04, p.z);
      mesh.rotation.y = -this._headingFor(g.axis, dir);
      this.scene.add(mesh);

      this.agents.push({
        mesh,
        road: this.roads[gi],
        axis: g.axis,
        lane,
        dir,
        pos,
        speed,
        phase,
        _geom: g,
      });
    }
  }

  _buildPedestrian(bodyColor, legColor, skinColor) {
    const group = new THREE.Group();
    const mat = (c) => new THREE.MeshLambertMaterial({ color: new THREE.Color(c) });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.26), mat(bodyColor));
    body.position.y = 1.16;
    group.add(body);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 0.26), mat(skinColor));
    head.position.y = 1.61;
    group.add(head);

    const legGeo = new THREE.BoxGeometry(0.16, 0.85, 0.16);
    const legMat = mat(legColor);
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.12, 0.425, 0);
    group.add(legL);
    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set(0.12, 0.425, 0);
    group.add(legR);

    return group;
  }

  _positionFor(geom, lane, pos) {
    const along = geom.min + pos;
    const cross = geom.cross + lane * PAVEMENT_OFFSET;
    return geom.axis === 'x' ? { x: along, z: cross } : { x: cross, z: along };
  }

  _headingFor(axis, dir) {
    const dx = axis === 'x' ? dir : 0;
    const dz = axis === 'z' ? dir : 0;
    return Math.atan2(dx, -dz);
  }

  update(dt) {
    if (this.frozen) return;
    for (const a of this.agents) {
      const g = a._geom;
      const speed = this.fleeing ? a.speed * 3 : a.speed;
      a.pos = ((a.pos + speed * a.dir * dt) % g.length + g.length) % g.length;
      a.phase += dt * 8;

      const p = this._positionFor(g, a.lane, a.pos);
      a.mesh.position.set(p.x, Math.sin(a.phase) * 0.04, p.z);
      a.mesh.rotation.y = -this._headingFor(a.axis, a.dir);
    }
  }

  setFrozen(frozen) {
    this.frozen = !!frozen;
  }

  setFleeing(fleeing) {
    this.fleeing = !!fleeing;
  }

  clear() {
    for (const a of this.agents) this.scene.remove(a.mesh);
    this.agents.length = 0;
  }
}
