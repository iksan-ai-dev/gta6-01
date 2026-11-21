import * as THREE from 'three';

export const MISSIONS = [
  {
    id: 'the-drop',
    title: 'The Drop',
    steps: [
      { objective: 'Reach the drop point at the docks', target: { x: 30, z: 170 } },
      { objective: 'Lose the police', target: null },
    ],
    reward: 1500,
  },
  {
    id: 'harbor-run',
    title: 'Harbor Run',
    steps: [
      { objective: 'Collect the crate at the harbour', target: { x: -130, z: 150 } },
      { objective: 'Deliver it uptown', target: { x: 40, z: -170 } },
    ],
    reward: 2200,
  },
  {
    id: 'wrong-cargo',
    title: 'Wrong Cargo',
    steps: [
      { objective: 'Drive to the container yard', target: { x: 170, z: 40 } },
      { objective: 'Escape the ambush', target: null },
    ],
    reward: 1800,
  },
  {
    id: 'beachhead',
    title: 'Beachhead',
    steps: [
      { objective: 'Meet the contact on the beachfront', target: { x: -190, z: 60 } },
      { objective: 'Drive to the docks', target: { x: 60, z: 170 } },
    ],
    reward: 2600,
  },
  {
    id: 'last-ferry',
    title: 'Last Ferry',
    steps: [
      { objective: 'Reach the ferry terminal', target: { x: 210, z: -120 } },
      { objective: 'Survive two minutes', target: null },
    ],
    reward: 3400,
  },
];

export class Missions {
  constructor(options = {}) {
    this.player = options.player || null;
    this.city = options.city || null;
    this.active = null;
  }

  start(id) {
    const mission = MISSIONS.find((m) => m.id === id);
    if (!mission) {
      return null;
    }
    this.active = { mission, stepIndex: 0 };
    if (this.player && typeof this.player.addWanted === 'function') {
      this.player.addWanted(1);
    }
    return this.active;
  }

  currentStep() {
    if (!this.active) {
      return null;
    }
    return this.active.mission.steps[this.active.stepIndex] || null;
  }

  advance() {
    if (!this.active) {
      return false;
    }
    this.active.stepIndex += 1;
    if (this.active.stepIndex >= this.active.mission.steps.length) {
      if (this.player && typeof this.player.addCash === 'function') {
        this.player.addCash(this.active.mission.reward);
      }
      this.active = null;
      return true;
    }
    return false;
  }

  abort() {
    this.active = null;
  }

  checkProgress(playerPosition) {
    const step = this.currentStep();
    if (!step || !step.target) {
      return { reached: false };
    }
    const dx = playerPosition.x - step.target.x;
    const dz = playerPosition.z - step.target.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 12) {
      return { reached: true, step };
    }
    return { reached: false, distance };
  }

  update(dt, playerPosition) {
    const result = this.checkProgress(playerPosition);
    if (result.reached) {
      this.advance();
    }
  }

  list() {
    return MISSIONS;
  }
}
