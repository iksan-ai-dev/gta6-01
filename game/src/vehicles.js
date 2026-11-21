import * as THREE from 'three';

// Build a low-poly car as a THREE.Group. Origin sits at ground level (y = 0),
// and the chassis length runs along local -z, so the nose points toward local
// -z. This matches the heading convention: heading 0 faces world -z.
export function makeVehicleMesh(colour, kind) {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.4, metalness: 0.3 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.6, metalness: 0.2 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1c2b36, roughness: 0.15, metalness: 0.7 });

  // Lower chassis: 1.9 wide, 0.7 tall, 4.4 long (length along local z).
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 4.4), bodyMat);
  chassis.position.y = 0.45;
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  group.add(chassis);

  // Cabin: 1.7 wide, 0.6 tall, 2.2 long, on top of the chassis.
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.2), glassMat);
  cabin.position.y = 1.05;
  cabin.castShadow = true;
  group.add(cabin);

  // Four wheels: short cylinders, axle along local x (across the car width).
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 12);
  const wheelSpots = [
    [-0.85, -1.4], [0.85, -1.4], // front pair (nose = -z)
    [-0.85, 1.4], [0.85, 1.4],   // rear pair
  ];
  for (const [wx, wz] of wheelSpots) {
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    wheel.rotation.z = Math.PI / 2; // cylinder axis y -> x
    wheel.position.set(wx, 0.38, wz);
    wheel.castShadow = true;
    group.add(wheel);
  }

  // Tail lights (rear, +z) red; headlights (front, -z) white.
  const lightGeo = new THREE.BoxGeometry(0.32, 0.2, 0.06);
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 2 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.5 });

  for (const lx of [-0.6, 0.6]) {
    const tail = new THREE.Mesh(lightGeo, tailMat);
    tail.position.set(lx, 0.65, 2.21);
    group.add(tail);

    const head = new THREE.Mesh(lightGeo, headMat);
    head.position.set(lx, 0.65, -2.21);
    group.add(head);
  }

  // Optional per-kind detail.
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.18, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0xffcc00, emissiveIntensity: 0.6 })
    );
    sign.position.y = 1.42;
    group.add(sign);
  }

  return group;
}

export class Vehicle {
  constructor(scene, options) {
    const o = options || {};

    this.mesh = makeVehicleMesh(o.colour ?? 0x3a6ea5, o.kind ?? 'car');
    this.position = new THREE.Vector3(o.x ?? 0, 0, o.z ?? 0);
    this.heading = o.heading ?? 0;
    this.speed = 0;
    this.maxSpeed = 32;
    this.accel = 14;
    this.brakeDecel = 26;
    this.drag = 4;
    this.health = 100;
    this.occupied = false;

    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = -this.heading;
    if (scene) scene.add(this.mesh);
  }

  forward() {
    return { x: Math.sin(this.heading), z: -Math.cos(this.heading) };
  }

  update(dt, controls) {
    const c = controls || {};
    const throttle = c.throttle > 0;
    const brake = !!c.brake;
    const handbrake = !!c.handbrake;
    const steer = c.steer ?? 0;

    if (throttle) {
      this.speed += this.accel * dt;
    } else if (handbrake) {
      this.speed = Math.max(0, this.speed - this.brakeDecel * 1.6 * dt);
    } else if (brake) {
      this.speed = Math.max(0, this.speed - this.brakeDecel * dt);
    } else {
      this.speed = Math.max(0, this.speed - this.drag * dt);
    }
    this.speed = Math.min(this.maxSpeed, this.speed);

    // Steering: turn rate scales with speed and is capped near 1.6 rad/s.
    const speedFactor = Math.min(1, Math.abs(this.speed) / 10);
    this.heading += 1.6 * steer * speedFactor * dt;

    const f = this.forward();
    this.position.x += f.x * this.speed * dt;
    this.position.z += f.z * this.speed * dt;

    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = -this.heading;
    this.mesh.rotation.z = -steer * speedFactor * 0.08; // body roll opposite the steer
  }

  takeDamage(n) {
    const applied = Math.min(this.health, n);
    this.health = Math.max(0, this.health - n);
    return applied;
  }

  isWrecked() {
    return this.health <= 0;
  }
}
