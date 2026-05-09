// ============================================================
// REVESVOIR — Water Simulation System
// Heightmap-based ripple physics with specular lighting
// This runs outside React on a persistent canvas layer
// ============================================================

export class WaterSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.offCanvas = document.createElement('canvas');
    this.offCtx = this.offCanvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';

    this.width = 0;
    this.height = 0;
    this.simScale = 4; // 1 sim pixel = 4 screen pixels
    this.simW = 0;
    this.simH = 0;
    this.buf1 = null;
    this.buf2 = null;
    this.damping = 0.985;
    this.time = 0;
    this.stars = null;
    this.imageData = null;
    this.animationId = null;
    this.running = false;
  }

  init() {
    this.resize();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.start();
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    this.simW = Math.ceil(this.width / this.simScale);
    this.simH = Math.ceil(this.height / this.simScale);
    this.offCanvas.width = this.simW;
    this.offCanvas.height = this.simH;
    const len = this.simW * this.simH;
    this.buf1 = new Float32Array(len);
    this.buf2 = new Float32Array(len);
    this.imageData = this.offCtx.createImageData(this.simW, this.simH);
    this.stars = null; // regenerate on next render
  }

  // Drop a ripple into the heightmap
  createRipple(screenX, screenY, strength = 1) {
    const cx = Math.floor(screenX / this.simScale);
    const cy = Math.floor(screenY / this.simScale);
    const radius = Math.floor(6 + strength * 4);
    const amp = 180 * strength;

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > radius) continue;
        const sx = cx + dx;
        const sy = cy + dy;
        if (sx < 1 || sx >= this.simW - 1 || sy < 1 || sy >= this.simH - 1) continue;
        const normDist = dist / radius;
        const ring = Math.sin(normDist * Math.PI) * (1 - normDist * 0.3);
        this.buf1[sy * this.simW + sx] += amp * ring;
      }
    }
  }

  // Cascade of ripples (used for emphasis moments)
  createRippleCascade(screenX, screenY, strength = 1) {
    this.createRipple(screenX, screenY, strength);
    setTimeout(() => this.createRipple(screenX, screenY, strength * 0.6), 300);
    setTimeout(() => this.createRipple(screenX, screenY, strength * 0.3), 700);
  }

  // Gentle ripple at random position (for ambient life)
  createAmbientRipple() {
    const x = 50 + Math.random() * (this.width - 100);
    const y = 50 + Math.random() * (this.height - 100);
    this.createRipple(x, y, 0.2 + Math.random() * 0.3);
  }

  step() {
    const { simW, simH, buf1, buf2, damping } = this;

    for (let y = 1; y < simH - 1; y++) {
      for (let x = 1; x < simW - 1; x++) {
        const i = y * simW + x;
        buf2[i] = (
          (buf1[i - 1] + buf1[i + 1] + buf1[i - simW] + buf1[i + simW]) * 0.5
          - buf2[i]
        ) * damping;
      }
    }

    const temp = this.buf1;
    this.buf1 = this.buf2;
    this.buf2 = temp;
  }

  addAmbientWaves() {
    const { simW, simH, buf1, time } = this;

    // Random gentle disturbance
    if (Math.random() < 0.02) {
      const rx = 5 + Math.random() * (simW - 10);
      const ry = 5 + Math.random() * (simH - 10);
      const i = Math.floor(ry) * simW + Math.floor(rx);
      if (i > 0 && i < buf1.length) {
        buf1[i] += (Math.random() - 0.5) * 30;
      }
    }

    // Edge breathing — tidal effect
    for (let x = 0; x < simW; x++) {
      const tideVal = Math.sin(time * 0.8 + x * 0.05) * 2;
      buf1[x] += tideVal * 0.1;
      buf1[(simH - 1) * simW + x] += tideVal * 0.1;
    }
  }

  render() {
    const { ctx, width, height, simW, simH, buf1, imageData, time, offCtx } = this;
    const pixels = imageData.data;

    // Deep blue palette
    const baseR = 6, baseG = 12, baseB = 24;
    const hiR = 22, hiG = 42, hiB = 72;
    const loR = 3, loG = 6, loB = 14;
    const moonR = 70, moonG = 90, moonB = 130;

    for (let gy = 0; gy < simH; gy++) {
      for (let gx = 0; gx < simW; gx++) {
        const pi = (gy * simW + gx) * 4;
        const gi = gy * simW + gx;

        const h = buf1[gi];
        const norm = h * 0.012;

        const hL = gx > 0 ? buf1[gi - 1] : 0;
        const hR = gx < simW - 1 ? buf1[gi + 1] : 0;
        const hU = gy > 0 ? buf1[gi - simW] : 0;
        const hD = gy < simH - 1 ? buf1[gi + simW] : 0;
        const nx = (hL - hR) * 0.5;
        const ny = (hU - hD) * 0.5;
        const specular = Math.min(1, Math.sqrt(nx * nx + ny * ny) * 0.035);

        let r, g, b;
        if (norm > 0) {
          const t = Math.min(1, norm);
          r = baseR + (hiR - baseR) * t + moonR * specular;
          g = baseG + (hiG - baseG) * t + moonG * specular;
          b = baseB + (hiB - baseB) * t + moonB * specular;
        } else {
          const t = Math.min(1, -norm);
          r = baseR + (loR - baseR) * t;
          g = baseG + (loG - baseG) * t;
          b = baseB + (loB - baseB) * t;
        }

        // Depth gradient
        const depthBias = 1 + Math.sin((gy / simH) * Math.PI) * 0.12;
        r *= depthBias; g *= depthBias; b *= depthBias;

        // Moonlight glow — cool blue-white
        const mDist = Math.sqrt(
          Math.pow((gx / simW - 0.7) * 1.3, 2) +
          Math.pow((gy / simH - 0.12) * 2.5, 2)
        );
        if (mDist < 0.8) {
          const moonFade = (1 - mDist / 0.8);
          const moonI = moonFade * moonFade * 0.15 * (1 + specular);
          r += moonR * moonI; g += moonG * moonI; b += moonB * moonI;
        }

        pixels[pi] = Math.max(0, Math.min(255, r));
        pixels[pi + 1] = Math.max(0, Math.min(255, g));
        pixels[pi + 2] = Math.max(0, Math.min(255, b));
        pixels[pi + 3] = 255;
      }
    }

    offCtx.putImageData(imageData, 0, 0);
    ctx.drawImage(this.offCanvas, 0, 0, simW, simH, 0, 0, width, height);

    this.renderStars(ctx, width, height);
  }

  renderStars(ctx, w, h) {
    if (!this.stars) {
      this.stars = [];
      const count = Math.floor(w * h / 10000);
      for (let i = 0; i < count; i++) {
        this.stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() * 1 + 0.3,
          alpha: Math.random() * 0.35 + 0.08,
          speed: Math.random() * 0.005 + 0.001,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }

    const { buf1, simW, simScale, time } = this;

    for (const s of this.stars) {
      const flicker = Math.sin(time * 200 * s.speed + s.phase) * 0.3 + 0.7;
      const gx = Math.min(Math.floor(s.x / simScale), simW - 2);
      const gy = Math.min(Math.floor(s.y / simScale), this.simH - 2);
      const gi = gy * simW + gx;
      const h = buf1[gi] || 0;
      const dx = h * 0.15;
      const dy = h * 0.1;

      ctx.beginPath();
      ctx.arc(s.x + dx, s.y + dy, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180, 200, 230, ${s.alpha * flicker})`;
      ctx.fill();
    }
  }

  animate = () => {
    this.time += 0.004;
    this.addAmbientWaves();
    this.step();
    this.render();
    if (this.running) {
      this.animationId = requestAnimationFrame(this.animate);
    }
  };

  start() {
    this.running = true;
    this.animate();
  }

  stop() {
    this.running = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }
}
