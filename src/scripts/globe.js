// Mounts the interactive globe: loads lazily when the section approaches the
// viewport and pauses when off-screen. It spins slowly and leans gently towards
// the pointer. All motion is time-based (same on 60 Hz and 120 Hz screens) and eased.
import { createRenderer, decodeMesh } from './globe-renderer.js';

const BASE_SPEED = 0.25; // rad/s, steady spin (one turn in ~25 s)
const LEAN_Y = 0.35; // rad (~20°) sideways lean with the pointer at the section edge
const LEAN_X = 0.2; // rad (~11°) up/down lean
const LEAN_EASE = 0.6; // s, how softly the globe follows the pointer
const TURN_EASE = 0.8; // s, how softly the spin reverses when the pointer changes side

const ease = (seconds, dt) => 1 - Math.exp(-dt / seconds);

export function mountGlobe(container, pointerArea) {
  const canvas = document.createElement('canvas');
  canvas.className = 'block h-full w-full';
  canvas.setAttribute('aria-hidden', 'true');

  const pointer = { x: 0, y: 0 };
  pointerArea.addEventListener('mousemove', (e) => {
    const r = pointerArea.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  });
  pointerArea.addEventListener('mouseleave', () => {
    pointer.x = 0;
    pointer.y = 0;
  });

  const BASE_RX = (-10 * Math.PI) / 180;
  const state = {
    spin: (20 * Math.PI) / 180,
    px: 0, // eased pointer
    py: 0,
    dir: 1, // spin direction: +1 right, -1 left (eased in between)
    get rx() {
      return BASE_RX - this.py * LEAN_X;
    },
    get ry() {
      return this.spin + this.px * LEAN_Y;
    },
  };
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer = null;
  let visible = false;
  let raf = 0;
  let last = 0;

  const resize = () => {
    if (!renderer) return;
    const { width, height } = container.getBoundingClientRect();
    renderer.resize(width, height, Math.min(window.devicePixelRatio || 1, 2));
    renderer.render(state.rx, state.ry);
  };

  const step = (dt) => {
    const k = ease(LEAN_EASE, dt);
    state.px += (pointer.x - state.px) * k;
    state.py += (pointer.y - state.py) * k;
    // Spin towards the side the pointer is on; keep the last direction near the centre.
    const target = state.px > 0.05 ? 1 : state.px < -0.05 ? -1 : Math.sign(state.dir) || 1;
    state.dir += (target - state.dir) * ease(TURN_EASE, dt);
    state.spin += dt * BASE_SPEED * state.dir;
  };

  const frame = (now) => {
    raf = 0;
    if (!renderer || !visible) return;
    const delta = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    step(delta);
    renderer.render(state.rx, state.ry);
    raf = requestAnimationFrame(frame);
  };

  const start = () => {
    if (still || raf || !renderer || !visible) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  };

  const init = async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/globe.bin`);
      if (!res.ok) return;
      const mesh = decodeMesh(await res.arrayBuffer());
      renderer = createRenderer(canvas, mesh);
      if (!renderer) return; // no WebGL: leave the space empty, like before
      container.append(canvas);
      resize();
      new ResizeObserver(resize).observe(container);
      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        cancelAnimationFrame(raf);
        raf = 0;
        renderer = null;
      });
      canvas.addEventListener('webglcontextrestored', () => {
        renderer = createRenderer(canvas, mesh);
        resize();
        start();
      });
      start();
    } catch {
      renderer = null; // fail silently, the section still works without the globe
    }
  };

  let loading = null;
  new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      if (visible) {
        loading ??= init();
        start();
      }
    },
    { rootMargin: '300px 0px' },
  ).observe(container);
}
