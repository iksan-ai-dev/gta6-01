import * as THREE from 'three';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createCity(scene, options = {}) {
  const rand = mulberry32(options.seed ?? 1337);
  const group = new THREE.Group();
  const roads = [];
  const buildings = [];
  const districts = [
    { name: 'Downtown', x: 0, z: 0, radius: 90 },
    { name: 'Sunset Harbor', x: 60, z: 245, radius: 90 },
    { name: 'Docks', x: -180, z: 180, radius: 90 },
    { name: 'Beachfront', x: 200, z: 40, radius: 80 },
    { name: 'Old Town', x: -120, z: -140, radius: 80 },
  ];

  const matGround = new THREE.MeshLambertMaterial({ color: 0x14161c });
  const matRoad = new THREE.MeshLambertMaterial({ color: 0x2a2e38 });
  const matKerb = new THREE.MeshLambertMaterial({ color: 0x3a3f4a });
  const matSand = new THREE.MeshLambertMaterial({ color: 0xcbb487 });
  const matWater = new THREE.MeshLambertMaterial({ color: 0x0d2233 });
  const facadeMats = [0x1b1e26, 0x22262f, 0x191c23, 0x262a34].map(c => new THREE.MeshLambertMaterial({ color: c }));
  const matWindow = new THREE.MeshStandardMaterial({ color: 0xffb15e, emissive: 0xffb15e, emissiveIntensity: 0.9 });
  const matLamp = new THREE.MeshLambertMaterial({ color: 0x555b66 });
  const matLampGlow = new THREE.MeshStandardMaterial({ color: 0xffcf8a, emissive: 0xffb15e, emissiveIntensity: 1.2 });
  const matTrunk = new THREE.MeshLambertMaterial({ color: 0x6b4f33 });
  const matFrond = new THREE.MeshLambertMaterial({ color: 0x2f7d3a });
  const containerMats = [0xb03030, 0x1f7a7a, 0xc9a227].map(c => new THREE.MeshLambertMaterial({ color: c }));

  const unitBox = new THREE.BoxGeometry(1, 1, 1);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), matGround);
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  const sand = new THREE.Mesh(unitBox, matSand);
  sand.scale.set(50, 0.3, 700);
  sand.position.set(325, 0.01, 0);
  group.add(sand);

  const water = new THREE.Mesh(unitBox, matWater);
  water.scale.set(160, 0.3, 160);
  water.position.set(285, 0.06, 285);
  group.add(water);

  const roadLen = 620;
  const roadPositions = [-225, -135, -45, 45, 135, 225];
  const addKerb = (cx, cz, len, axis) => {
    const off = 5 + 0.2;
    for (const side of [-1, 1]) {
      const k = new THREE.Mesh(unitBox, matKerb);
      if (axis === 'x') {
        k.scale.set(len, 0.12, 0.4);
        k.position.set(cx, 0.05, cz + side * off);
      } else {
        k.scale.set(0.4, 0.12, len);
        k.position.set(cx + side * off, 0.05, cz);
      }
      group.add(k);
    }
  };
  for (const z of roadPositions) {
    const road = new THREE.Mesh(unitBox, matRoad);
    road.scale.set(roadLen, 0.04, 10);
    road.position.set(0, 0.02, z);
    group.add(road);
    roads.push({ x: 0, z, w: roadLen, d: 10, axis: 'x' });
    addKerb(0, z, roadLen, 'x');
  }
  for (const x of roadPositions) {
    const road = new THREE.Mesh(unitBox, matRoad);
    road.scale.set(10, 0.04, roadLen);
    road.position.set(x, 0.02, 0);
    group.add(road);
    roads.push({ x, z: 0, w: 10, d: roadLen, axis: 'z' });
    addKerb(x, 0, roadLen, 'z');
  }

  const windowInstances = [];
  const addWindows = (bx, bz, w, d, h) => {
    const rows = Math.max(2, Math.min(8, Math.round(h / 5)));
    const colsW = Math.max(1, Math.min(6, Math.round(w / 5)));
    const colsD = Math.max(1, Math.min(6, Math.round(d / 5)));
    const winH = Math.max(0.6, (h - 3) / rows);
    const winD = 0.12;
    const step = (h - 2.4) / rows;
    for (let r = 0; r < rows; r++) {
      const y = 1.2 + (r + 0.5) * step;
      const winWx = Math.max(0.5, (w - 2) / colsW);
      const winWz = Math.max(0.5, (d - 2) / colsD);
      for (let c = 0; c < colsW; c++) {
        const x = bx - w / 2 + (c + 0.5) * (w / colsW);
        windowInstances.push({ p: [x, y, bz + d / 2 + winD], ry: 0, s: [winWx, winH, winD] });
        windowInstances.push({ p: [x, y, bz - d / 2 - winD], ry: 0, s: [winWx, winH, winD] });
      }
      for (let c = 0; c < colsD; c++) {
        const z = bz - d / 2 + (c + 0.5) * (d / colsD);
        windowInstances.push({ p: [bx + w / 2 + winD, y, z], ry: Math.PI / 2, s: [winWz, winH, winD] });
        windowInstances.push({ p: [bx - w / 2 - winD, y, z], ry: Math.PI / 2, s: [winWz, winH, winD] });
      }
    }
  };

  const placeBuilding = (xMin, xMax, zMin, zMax) => {
    const w = 10 + rand() * 10;
    const d = 10 + rand() * 10;
    const x = xMin + 2 + rand() * (xMax - xMin - 4 - w);
    const z = zMin + 2 + rand() * (zMax - zMin - 4 - d);
    const t = Math.min(1, Math.hypot(x, z) / 320);
    const h = Math.max(8, Math.min(60, 8 + (1 - t) * 48 + rand() * 8));
    const mesh = new THREE.Mesh(unitBox, facadeMats[Math.floor(rand() * facadeMats.length)]);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, h / 2, z);
    group.add(mesh);
    buildings.push({ x, z, w, d, h, mesh });
    addWindows(x, z, w, d, h);
  };

  for (let ix = 0; ix < roadPositions.length - 1; ix++) {
    for (let iz = 0; iz < roadPositions.length - 1; iz++) {
      const xMin = roadPositions[ix] + 5, xMax = roadPositions[ix + 1] - 5;
      const zMin = roadPositions[iz] + 5, zMax = roadPositions[iz + 1] - 5;
      for (let b = 0; b < 5; b++) placeBuilding(xMin, xMax, zMin, zMax);
    }
  }
  for (let i = 0; i < 5; i++) placeBuilding(-40, 40, -40, 40);

  if (windowInstances.length > 0) {
    const winMesh = new THREE.InstancedMesh(unitBox, matWindow, windowInstances.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    windowInstances.forEach((wi, i) => {
      q.setFromAxisAngle(up, wi.ry);
      p.set(wi.p[0], wi.p[1], wi.p[2]);
      s.set(wi.s[0], wi.s[1], wi.s[2]);
      m.compose(p, q, s);
      winMesh.setMatrixAt(i, m);
    });
    winMesh.instanceMatrix.needsUpdate = true;
    group.add(winMesh);
  }

  const lampPostGeom = new THREE.CylinderGeometry(0.08, 0.12, 6, 6);
  const lampGlowGeom = new THREE.SphereGeometry(0.35, 8, 8);
  for (let i = 0; i < 30; i++) {
    const road = roads[Math.floor(rand() * roads.length)];
    let x, z;
    if (road.axis === 'x') {
      x = -280 + rand() * 560;
      z = road.z + (rand() < 0.5 ? -7 : 7);
    } else {
      z = -280 + rand() * 560;
      x = road.x + (rand() < 0.5 ? -7 : 7);
    }
    const pole = new THREE.Mesh(lampPostGeom, matLamp);
    pole.position.set(x, 3, z);
    group.add(pole);
    const glow = new THREE.Mesh(lampGlowGeom, matLampGlow);
    glow.position.set(x, 6.2, z);
    group.add(glow);
  }

  const containerGeom = new THREE.BoxGeometry(8, 2.6, 2.5);
  for (let i = 0; i < 10; i++) {
    const c = new THREE.Mesh(containerGeom, containerMats[Math.floor(rand() * containerMats.length)]);
    c.position.set(-180 + (rand() - 0.5) * 60, 1.3, 180 + (rand() - 0.5) * 60);
    c.rotation.y = Math.floor(rand() * 4) * (Math.PI / 2);
    group.add(c);
  }

  const trunkGeom = new THREE.CylinderGeometry(0.25, 0.4, 6, 8);
  const frondGeom = new THREE.ConeGeometry(1.6, 0.12, 5);
  for (let i = 0; i < 12; i++) {
    const x = 200 + (rand() - 0.5) * 40;
    const z = 40 + (rand() - 0.5) * 40;
    const trunk = new THREE.Mesh(trunkGeom, matTrunk);
    trunk.position.set(x, 3, z);
    group.add(trunk);
    for (let f = 0; f < 5; f++) {
      const frond = new THREE.Mesh(frondGeom, matFrond);
      const a = (f / 5) * Math.PI * 2;
      frond.position.set(x + Math.cos(a) * 1.4, 6, z + Math.sin(a) * 1.4);
      frond.rotation.z = -0.8;
      frond.rotation.y = a;
      group.add(frond);
    }
  }

  if (!scene.fog) scene.fog = new THREE.Fog(0x0d1520, 60, 320);

  let clock = 0;
  return {
    group,
    roads,
    buildings,
    districts,
    districtAt(x, z) {
      let best = null, bestD = Infinity;
      for (const d of districts) {
        const dd = (d.x - x) * (d.x - x) + (d.z - z) * (d.z - z);
        if (dd < bestD) { bestD = dd; best = d; }
      }
      return best ? best.name : 'Sunset Harbor';
    },
    update(dt) {
      clock += dt;
      matLampGlow.emissiveIntensity = 1.0 + Math.sin(clock * 2) * 0.3;
    },
    dispose() {
      scene.remove(group);
      group.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    },
  };
}
