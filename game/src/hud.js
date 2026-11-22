// game/src/hud.js
// HUD controller — drives every HUD element in game/index.html.

export class Hud {
  constructor() {
    // Cache every element by id.
    this.hud = document.getElementById('hud');
    this.minimap = document.getElementById('minimap');
    this.loadoutPanel = document.getElementById('loadout-panel');
    this.weaponList = document.getElementById('weapon-list');
    this.cashLine = document.getElementById('cash-line');
    this.starsLine = document.getElementById('stars-line');
    this.districtLine = document.getElementById('district-line');
    this.missionPanel = document.getElementById('mission-panel');
    this.missionTitle = document.getElementById('mission-title');
    this.missionStep = document.getElementById('mission-step');
    this.missionObjective = document.getElementById('mission-objective');
    this.missionReward = document.getElementById('mission-reward');
    this.policePanel = document.getElementById('police-panel');
    this.policeCount = document.getElementById('police-count');
    this.policeList = document.getElementById('police-list');
    this.healthBar = document.getElementById('health-bar');
    this.healthText = document.getElementById('health-text');
    this.armourBar = document.getElementById('armour-bar');
    this.armourText = document.getElementById('armour-text');
    this.subtitleLine = document.getElementById('subtitle-line');
    this.weaponName = document.getElementById('weapon-name');
    this.ammoText = document.getElementById('ammo-text');
    this.speedText = document.getElementById('speed-text');

    // Minimap canvas and its 2d context.
    this.minimapCtx = this.minimap ? this.minimap.getContext('2d') : null;

    // Subtitle expiry timestamp (epoch ms); 0 means nothing pending.
    this.subtitleExpiry = 0;
  }

  show() {
    if (this.hud) this.hud.classList.remove('hidden');
  }

  hide() {
    if (this.hud) this.hud.classList.add('hidden');
  }

  setHealth(current, max) {
    this._setBar(this.healthBar, this.healthText, current, max);
  }

  setArmour(current, max) {
    this._setBar(this.armourBar, this.armourText, current, max);
  }

  setCash(amount) {
    if (!this.cashLine) return;
    const n = Math.round(Number(amount) || 0);
    const formatted = '$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    this.cashLine.textContent = formatted;
  }

  setStars(count) {
    if (!this.starsLine) return;
    const n = Math.max(0, Math.min(5, Math.round(Number(count) || 0)));
    let html = '';
    for (let i = 0; i < 5; i++) {
      html += `<span class="${i < n ? 'star' : 'star empty'}">★</span>`;
    }
    this.starsLine.innerHTML = html;
  }

  setDistrict(name) {
    if (this.districtLine) this.districtLine.textContent = name;
  }

  setMission(view) {
    if (!this.missionPanel) return;
    if (!view) {
      this.missionPanel.classList.add('hidden');
      return;
    }
    this.missionPanel.classList.remove('hidden');
    if (this.missionTitle) this.missionTitle.textContent = view.title ?? '';
    if (this.missionStep) this.missionStep.textContent = `${view.step ?? 0}/${view.total ?? 0}`;
    if (this.missionObjective) this.missionObjective.textContent = view.objective ?? '';
    if (this.missionReward) this.missionReward.textContent = '+$' + (view.reward ?? 0);
  }

  setPolice(count, units = []) {
    if (!this.policePanel) return;
    if (this.policeCount) this.policeCount.textContent = String(count);
    if (!count) {
      this.policePanel.classList.add('hidden');
      return;
    }
    this.policePanel.classList.remove('hidden');
    if (this.policeList) {
      this.policeList.innerHTML = units.map((u) => {
        const label = this._esc(u.label ?? '');
        const dist = Math.round(Number(u.distance) || 0);
        return (
          '<div class="police-row">' +
          `<span class="police-label" style="text-transform:uppercase;letter-spacing:.05em">${label}</span>` +
          `<span class="police-distance" style="font-variant-numeric:tabular-nums;text-align:right">${dist} m</span>` +
          '</div>'
        );
      }).join('');
    }
  }

  setLoadout(weapons = [], selectedId) {
    const selected = weapons.find((w) => w.id === selectedId) || weapons[0] || null;

    if (this.weaponList) {
      this.weaponList.innerHTML = weapons.map((w) => {
        const sel = w.id === selectedId ? ' selected' : '';
        const ammo = this._ammo(w);
        return (
          `<div class="weapon-row${sel}" data-id="${this._esc(w.id)}">` +
          `<span class="weapon-label" style="text-transform:uppercase;letter-spacing:.05em">${this._esc(w.name)}</span>` +
          `<span class="weapon-ammo" style="font-variant-numeric:tabular-nums;text-align:right">${ammo}</span>` +
          '</div>'
        );
      }).join('');
    }

    if (selected) {
      if (this.weaponName) this.weaponName.textContent = selected.name;
      if (this.ammoText) {
        this.ammoText.textContent = this._ammo(selected);
      }
    }
  }

  setSpeed(kmh) {
    if (this.speedText) this.speedText.textContent = `${Math.round(Number(kmh) || 0)} km/h`;
  }

  setSubtitle(text, seconds = 3) {
    if (!this.subtitleLine) return;
    this.subtitleLine.textContent = text;
    this.subtitleLine.classList.remove('hidden');
    this.subtitleExpiry = Date.now() + Number(seconds) * 1000;
  }

  drawMinimap(state) {
    const ctx = this.minimapCtx;
    if (!ctx || !this.minimap) return;

    const canvas = this.minimap;
    const w = canvas.width || canvas.clientWidth || 160;
    const h = canvas.height || canvas.clientHeight || 160;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    const range = Number(state.range) || 1;
    const heading = Number(state.heading) || 0;
    const [px, pz] = this._pointXY(state.player);

    // World-to-canvas helper: north up (world -z at the top, +z down).
    const scale = w / range;
    const toCanvas = (x, z) => [
      w / 2 + (x - px) * scale,
      h / 2 + (z - pz) * scale,
    ];

    // Background.
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0c1118';
    ctx.fillRect(0, 0, w, h);

    // Roads.
    ctx.strokeStyle = '#2c3644';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const road of state.roads || []) {
      const segments = this._isSegment(road) ? [road] : road;
      for (const seg of segments) {
        if (!Array.isArray(seg) || seg.length < 2) continue;
        const [x1, z1] = seg[0];
        const [x2, z2] = seg[1];
        if (x1 == null || z1 == null || x2 == null || z2 == null) continue;
        const [c1x, c1y] = toCanvas(x1, z1);
        const [c2x, c2y] = toCanvas(x2, z2);
        ctx.moveTo(c1x, c1y);
        ctx.lineTo(c2x, c2y);
      }
    }
    ctx.stroke();

    // Police units as small blue dots.
    ctx.fillStyle = '#3b82f6';
    for (const unit of state.police || []) {
      const [x, z] = this._pointXY(unit);
      const [cx, cy] = toCanvas(x, z);
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Waypoint as a yellow diamond.
    if (state.waypoint) {
      const [x, z] = this._pointXY(state.waypoint);
      const [cx, cy] = toCanvas(x, z);
      const s = 4;
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(cx, cy - s);
      ctx.lineTo(cx + s, cy);
      ctx.lineTo(cx, cy + s);
      ctx.lineTo(cx - s, cy);
      ctx.closePath();
      ctx.fill();
    }

    // Player as a white triangle rotated to the heading.
    const [pcx, pcy] = toCanvas(px, pz);
    const r = 5;
    ctx.save();
    ctx.translate(pcx, pcy);
    ctx.rotate(heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.4);
    ctx.lineTo(-r, r);
    ctx.lineTo(r, r);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  update(nowMs) {
    if (this.subtitleExpiry && nowMs >= this.subtitleExpiry) {
      this.subtitleExpiry = 0;
      if (this.subtitleLine) this.subtitleLine.classList.add('hidden');
    }
  }

  // --- internal helpers -------------------------------------------------

  _setBar(bar, text, current, max) {
    if (!bar) return;
    const ratio = max > 0 ? current / max : 0;
    const pct = Math.max(0, Math.min(1, ratio)) * 100;
    const fill = this._fillOf(bar);
    if (fill) {
      fill.style.width = pct + '%';
      if (ratio < 0.3) fill.classList.add('low');
      else fill.classList.remove('low');
    }
    if (text) text.textContent = `${current}/${max}`;
  }

  _fillOf(bar) {
    if (!bar) return null;
    return bar.querySelector('.fill') || bar.firstElementChild || bar;
  }

  _pointXY(p) {
    if (Array.isArray(p)) return [p[0] || 0, p[1] || 0];
    if (!p) return [0, 0];
    if (p.x != null) return [p.x, p.z != null ? p.z : 0];
    if (p.position) return [p.position.x || 0, p.position.z || 0];
    return [0, 0];
  }

  _isSegment(r) {
    return Array.isArray(r) && r.length >= 2 && Array.isArray(r[0]) && !Array.isArray(r[0][0]);
  }

  _esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  _ammo(w) {
    if (!Number.isFinite(w.ammo)) return '∞';
    return Number.isFinite(w.reserve) ? `${w.ammo}/${w.reserve}` : `${w.ammo}`;
  }
}
