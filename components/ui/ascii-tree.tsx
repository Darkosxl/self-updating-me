"use client";

import { useEffect, useRef } from "react";

const REPEL_RADIUS = 60;
const REPEL_STRENGTH = 2.5;
const SPRING = 0.06;
const DAMPING = 0.86;

// silhouette space (offscreen render + sampling grid)
const SW = 200;
const SH = 280;
const STEP_X = 1.9;
const STEP_Y = 2.6;

const HEAVY = "$&@W#8B";
const MID = "ox*%=+ZX";
const LIGHT = "~:;.,'\"i";

type Particle = {
  char: string;
  sx: number; // silhouette-space rest coords
  sy: number;
  bx: number; // canvas-space rest coords (recomputed on resize)
  by: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  sway: number;
  alpha: number;
};

// Draw a bonsai silhouette offscreen and sample it into a char point cloud.
function buildParticles(): Particle[] {
  const os = document.createElement("canvas");
  os.width = SW;
  os.height = SH;
  const c = os.getContext("2d");
  if (!c) return [];
  c.fillStyle = "#000";
  c.strokeStyle = "#000";
  c.lineCap = "round";

  // pot
  c.beginPath();
  c.moveTo(58, 248);
  c.lineTo(142, 248);
  c.lineTo(132, 272);
  c.lineTo(68, 272);
  c.closePath();
  c.fill();
  c.fillRect(50, 241, 100, 7);

  // trunk: tapered S-curve
  c.lineWidth = 15;
  c.beginPath();
  c.moveTo(104, 246);
  c.bezierCurveTo(94, 205, 118, 172, 100, 135);
  c.stroke();
  c.lineWidth = 9;
  c.beginPath();
  c.moveTo(100, 138);
  c.bezierCurveTo(88, 110, 96, 92, 80, 72);
  c.stroke();
  // branch → right pad
  c.lineWidth = 6;
  c.beginPath();
  c.moveTo(103, 152);
  c.bezierCurveTo(120, 142, 136, 128, 150, 116);
  c.stroke();
  // branch → left pad
  c.lineWidth = 5;
  c.beginPath();
  c.moveTo(98, 182);
  c.bezierCurveTo(80, 172, 66, 162, 52, 154);
  c.stroke();

  // foliage pads: clusters of random ellipses → lumpy organic edges
  const pad = (cx: number, cy: number, rx: number, ry: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random());
      c.globalAlpha = 0.45 + Math.random() * 0.55;
      c.beginPath();
      c.ellipse(
        cx + Math.cos(a) * rx * r,
        cy + Math.sin(a) * ry * r * 0.9,
        6 + Math.random() * 10,
        3 + Math.random() * 5,
        0,
        0,
        Math.PI * 2,
      );
      c.fill();
    }
    c.globalAlpha = 1;
  };
  pad(76, 58, 54, 28, 110); // main canopy
  pad(120, 88, 30, 14, 40); // canopy spill right
  pad(152, 108, 34, 15, 55); // right pad
  pad(52, 150, 38, 15, 55); // left pad
  pad(96, 232, 46, 6, 30); // moss at pot rim

  const data = c.getImageData(0, 0, SW, SH).data;
  const particles: Particle[] = [];
  for (let sy = 1; sy < SH - 1; sy += STEP_Y) {
    for (let sx = 1; sx < SW - 1; sx += STEP_X) {
      const a = data[(Math.round(sy) * SW + Math.round(sx)) * 4 + 3];
      if (a < 40) continue;
      if (Math.random() < 0.12) continue; // holes → grainy texture
      if (a < 110 && Math.random() < 0.45) continue; // ragged edges
      const pool = a > 200 ? HEAVY : a > 120 ? MID : LIGHT;
      particles.push({
        char: pool[Math.floor(Math.random() * pool.length)],
        sx,
        sy,
        bx: 0,
        by: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        sway: 1 - sy / SH,
        alpha: 0.45 + (a / 255) * 0.5 + Math.random() * 0.05,
      });
    }
  }
  return particles;
}

// fixed blue sparkle accents (silhouette space)
const SPARKLES = [
  { x: 40, y: 40 },
  { x: 158, y: 66 },
  { x: 118, y: 128 },
  { x: 60, y: 196 },
];

export function AsciiTree({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const particles = buildParticles();
    let fontSize = 5;
    let scale = 1;
    let ox = 0;
    let oy = 0;
    let w = 0;
    let h = 0;
    let raf = 0;
    let mouse: { x: number; y: number } | null = null;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mono =
      getComputedStyle(canvas).getPropertyValue("--font-geist-mono").trim() ||
      "monospace";

    const setup = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const padPx = 30;
      scale = Math.min((w - padPx * 2) / SW, (h - padPx * 2) / SH);
      ox = (w - SW * scale) / 2;
      oy = (h - SH * scale) / 2;
      fontSize = STEP_Y * scale * 1.25;

      for (const p of particles) {
        p.bx = ox + p.sx * scale;
        p.by = oy + p.sy * scale;
        p.x = p.bx;
        p.y = p.by;
        p.vx = 0;
        p.vy = 0;
      }
    };

    const drawFrameMarkers = () => {
      ctx.strokeStyle = "#000";
      ctx.fillStyle = "#000";
      ctx.lineWidth = 1;
      const xs = [8, w / 2, w - 8];
      const ys = [8, h / 2, h - 8];
      for (const x of xs) {
        for (const y of ys) {
          if (x === w / 2 && y === h / 2) continue;
          ctx.beginPath();
          ctx.moveTo(x - 4, y);
          ctx.lineTo(x + 4, y);
          ctx.moveTo(x, y - 4);
          ctx.lineTo(x, y + 4);
          ctx.stroke();
        }
      }
      const step = 24;
      for (let x = 8 + step; x < w - 8 - step / 2; x += step) {
        ctx.fillRect(x, 7.5, 1.5, 1.5);
        ctx.fillRect(x, h - 9, 1.5, 1.5);
      }
      for (let y = 8 + step; y < h - 8 - step / 2; y += step) {
        ctx.fillRect(7.5, y, 1.5, 1.5);
        ctx.fillRect(w - 9, y, 1.5, 1.5);
      }
    };

    const drawSparkles = (t: number) => {
      for (let i = 0; i < SPARKLES.length; i++) {
        const s = SPARKLES[i];
        const x = ox + s.x * scale;
        const y = oy + s.y * scale;
        const tw = 0.5 + 0.5 * Math.sin(t * 0.0012 + i * 1.7);
        ctx.strokeStyle = `rgba(90,110,200,${0.25 + tw * 0.6})`;
        ctx.lineWidth = 1;
        const r = 4 + tw * 2;
        ctx.beginPath();
        ctx.moveTo(x - r, y);
        ctx.lineTo(x + r, y);
        ctx.moveTo(x, y - r);
        ctx.lineTo(x, y + r);
        ctx.stroke();
      }
    };

    const render = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      drawFrameMarkers();
      drawSparkles(t);
      ctx.font = `${fontSize}px ${mono}, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const swayX = reduced ? 0 : Math.sin(t * 0.0006) * 4;
      const swayY = reduced ? 0 : Math.cos(t * 0.0004) * 2;

      for (const p of particles) {
        const tx = p.bx + swayX * p.sway;
        const ty = p.by + swayY * p.sway;

        if (mouse) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const d = Math.hypot(dx, dy);
          if (d < REPEL_RADIUS && d > 0.01) {
            const f = ((REPEL_RADIUS - d) / REPEL_RADIUS) * REPEL_STRENGTH;
            p.vx += (dx / d) * f;
            p.vy += (dy / d) * f;
          }
        }
        p.vx += (tx - p.x) * SPRING;
        p.vy += (ty - p.y) * SPRING;
        p.vx *= DAMPING;
        p.vy *= DAMPING;
        p.x += p.vx;
        p.y += p.vy;

        ctx.fillStyle = `rgba(28,28,38,${p.alpha})`;
        ctx.fillText(p.char, p.x, p.y);
      }
    };

    const loop = (t: number) => {
      render(t);
      raf = requestAnimationFrame(loop);
    };

    setup();
    if (reduced) {
      render(0);
    } else {
      raf = requestAnimationFrame(loop);
    }

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onLeave = () => {
      mouse = null;
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);

    const ro = new ResizeObserver(() => setup());
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={className} />;
}
