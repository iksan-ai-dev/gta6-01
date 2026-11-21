import * as THREE from 'three';
import { makeVehicleMesh } from './vehicles.js';

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

const BODY_COLOURS = [
  0x3a6ea5, 0x8a3a3a, 0x3a8a5a, 0x9a9a3a,
  0x6a3a8a, 0x3a8a8a, 0x2a2a2a, 0xc0c0c0,
];

// A road segment is assumed to be: { axis: 'x'|'z', length: number, x, z }
// where (x, z) is the segment's start corner. For axis 'x' the segment runs
// from x to x + length at constant z; for axis 'z' it runs from z to z + length
// at constant x. The constant coordinate is the centreline; the lane offset is
// applied perpendicular to the axis.
export class Traffic {
  constructor(scene, options) {
    this.scene = scene;
    const o = options || {};

    this.roads = o.roads || [];
    this.agents = [];
    this.frozen = false;

    const rand = mulberry32(o.seed ?? 1);
    const count = o.count ?? 20;

    for (let i = 0; i < count; i++) {
      if (!this.roads.length) break;

      const road = this.roads[Math.floor(rand() * this.roads.length)];
      const axis = road.axis === 'z' ? 'z' : 'x';
      const length = road.length != null ? road.length : 10;

      const agent = {
        mesh: makeVehicleMesh(BODY_COLOURS[Math.floor(rand() * BODY_COLOURS.length)], 'car'),
        road,
        axis,
        lane: (rand() < 0.5 ? -1 : 1) * 2.5,
        dir: rand() < 0.5 ? 1 : -1,
        pos: rand() * length,
        speed: 8 + rand() * 8,
        length,
      };

      this.agents.push(agent);
      scene.add(agent.mesh);
      this._place(agent);
    }
  }

  _headingFor(axis, dir) {
    if (axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    return dir > 0 ? Math.PI : 0;
  }

  _place(agent) {
    const { road, axis, lane, dir, mesh } = agent;

    let p = agent.pos;
    if (agent.length > 0) p = ((p % agent.length) + agent.length) % agent.length;
    agent.pos = p;

    const rx = road.x ?? 0;
    const rz = road.z ?? 0;
    let wx, wz;
    if (axis === 'x') {
      wx = rx + p;
      wz = rz + lane;
    } else {
      wx = rx + lane;
      wz = rz + p;
    }

    mesh.position.set(wx, 0, wz);
    mesh.rotation.y = -this._headingFor(axis, dir);
  }

  update(dt) {
    if (this.frozen) return;
    for (const agent of this.agents) {
      agent.pos += agent.speed * agent.dir * dt;
      this._place(agent);
    }
  }

  setFrozen(bool) {
    this.frozen = !!bool;
  }

  clear() {
    for (const agent of this.agents) {
      if (agent.mesh && agent.mesh.parent) agent.mesh.parent.remove(agent.mesh);
    }
    this.agents = [];
  }
}
