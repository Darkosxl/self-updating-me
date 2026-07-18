"use client";

import { useEffect, useRef } from "react";
import { TREE_ROWS } from "@/components/ui/ascii-tree-art";

const TICKS = "·    +    ·    ✦    ·    +    ·    ✦    ·    +    ·    ✦    ·    +    ·";

const FONT_SIZE = 2.6;
const LINE_H = FONT_SIZE * 1.16;
const REPEL_RADIUS = 50;
const REPEL_STRENGTH = 2.2;
const SPRING = 0.06;
const DAMPING = 0.86;

function CornerSun({ className }: { className?: string }) {
  const rays = Array.from({ length: 16 }, (_, i) => {
    const a = (i * Math.PI) / 8;
    return {
      x1: 14 + Math.cos(a) * 7.4,
      y1: 14 + Math.sin(a) * 7.4,
      x2: 14 + Math.cos(a) * 10.9,
      y2: 14 + Math.sin(a) * 10.9,
    };
  });
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden="true">
      <circle cx="14" cy="14" r="6.4" fill="none" stroke="currentColor" strokeWidth="0.9" />
      {rays.map((r, i) => (
        <line key={i} {...r} stroke="currentColor" strokeWidth="0.75" strokeLinecap="round" />
      ))}
      <path
        d="M 15.3 10.7 A 3.7 3.7 0 1 0 15.3 17.3 A 3.3 3.3 0 1 1 15.3 10.7 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const SPARKLES = [
  { x: 28, y: 12, s: 2.2 },
  { x: 82, y: 28, s: 1.8 },
  { x: 12, y: 44, s: 1.8 },
  { x: 90, y: 62, s: 2.2 },
  { x: 20, y: 80, s: 1.8 },
  { x: 68, y: 90, s: 2.2 },
];

const tickCls =
  "pointer-events-none absolute flex items-center justify-center overflow-hidden whitespace-nowrap font-mono text-[7px] tracking-[0.28px] text-neutral-900/90 select-none";

function TreeCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const mono =
      getComputedStyle(canvas).getPropertyValue("--font-geist-mono").trim() || "monospace";
    const font = `${FONT_SIZE}px ${mono}, monospace`;
    ctx.font = font;
    const cw = ctx.measureText("M").width;
    const cols = TREE_ROWS[0].length;
    const w = cols * cw;
    const h = TREE_ROWS.length * LINE_H;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    // point cloud: one particle per non-space char, anchored at its grid cell
    type P = {
      ch: string;
      bx: number;
      by: number;
      x: number;
      y: number;
      vx: number;
      vy: number;
      sway: number;
    };
    const particles: P[] = [];
    for (let r = 0; r < TREE_ROWS.length; r++) {
      const row = TREE_ROWS[r];
      for (let c = 0; c < cols; c++) {
        if (row[c] === " ") continue;
        const bx = c * cw;
        const by = r * LINE_H;
        particles.push({
          ch: row[c],
          bx,
          by,
          x: bx,
          y: by,
          vx: 0,
          vy: 0,
          sway: 1 - r / TREE_ROWS.length, // top sways most
        });
      }
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let mouse: { x: number; y: number } | null = null;
    let raf = 0;

    const render = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.font = font;
      ctx.textBaseline = "top";
      ctx.fillStyle = "rgb(23,23,23)";

      // idle breathing sway
      const swayX = reduced ? 0 : Math.sin(t * 0.0006) * 2.5;
      const swayY = reduced ? 0 : Math.cos(t * 0.0004) * 1.2;

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

        ctx.fillText(p.ch, p.x, p.y);
      }
    };

    const loop = (t: number) => {
      render(t);
      raf = requestAnimationFrame(loop);
    };

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

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <canvas ref={ref} className="block" />;
}

export function AsciiTree({ className }: { className?: string }) {
  return (
    <div className={`relative bg-white p-[11px] ${className ?? ""}`}>
      {/* tick borders */}
      <span className={`${tickCls} inset-x-[14px] top-0 h-[15px]`}>{TICKS}</span>
      <span className={`${tickCls} inset-x-[14px] bottom-0 h-[15px]`}>{TICKS}</span>
      <span className={`${tickCls} inset-y-[14px] left-0 w-[15px] [writing-mode:vertical-rl]`}>
        {TICKS}
      </span>
      <span className={`${tickCls} inset-y-[14px] right-0 w-[15px] [writing-mode:vertical-rl]`}>
        {TICKS}
      </span>
      {/* corner suns */}
      <CornerSun className="absolute left-0 top-0 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 text-neutral-800" />
      <CornerSun className="absolute right-0 top-0 h-3.5 w-3.5 translate-x-1/2 -translate-y-1/2 text-neutral-800" />
      <CornerSun className="absolute bottom-0 left-0 h-3.5 w-3.5 -translate-x-1/2 translate-y-1/2 text-neutral-800" />
      <CornerSun className="absolute bottom-0 right-0 h-3.5 w-3.5 translate-x-1/2 translate-y-1/2 text-neutral-800" />
      {/* sparkle accents */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-[15px] h-auto text-[#79B4D1] opacity-55"
        aria-hidden="true"
      >
        {SPARKLES.map((p, i) => (
          <path
            key={i}
            d={`M${p.x} ${p.y - p.s}L${p.x + p.s / 4} ${p.y - p.s / 4}L${p.x + p.s} ${p.y}L${p.x + p.s / 4} ${p.y + p.s / 4}L${p.x} ${p.y + p.s}L${p.x - p.s / 4} ${p.y + p.s / 4}L${p.x - p.s} ${p.y}L${p.x - p.s / 4} ${p.y - p.s / 4}Z`}
            fill="currentColor"
          />
        ))}
      </svg>
      {/* the tree */}
      <TreeCanvas />
    </div>
  );
}
