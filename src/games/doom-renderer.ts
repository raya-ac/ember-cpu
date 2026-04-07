// DOOM BSP software renderer
// Renders DOOM levels using the real BSP tree, segs, and sectors

import type { DoomLevel, Seg, Sector } from './wad';

const SW = 320;
const SH = 168; // 200 - 32 for status bar
const HH = SH / 2;
const FOV = Math.PI / 2;
const PROJ = SW / 2 / Math.tan(FOV / 2);

export interface RenderState {
  viewX: number;
  viewY: number;
  viewAngle: number; // degrees
  viewZ: number;
}

export interface FramebufferWriter {
  setPixel(x: number, y: number, c: number): void;
}

// Per-column clip arrays
const clipTop = new Int32Array(SW);
const clipBot = new Int32Array(SW);

let _dbg = 0;

export function renderFrame(
  level: DoomLevel,
  state: RenderState,
  fb: FramebufferWriter,
  colormap: Uint8Array,
): void {
  clipTop.fill(0);
  clipBot.fill(SH - 1);

  // Sky (top half) and floor (bottom half)
  for (let y = 0; y < HH; y++)
    for (let x = 0; x < SW; x++) fb.setPixel(x, y, 97);
  for (let y = HH; y < SH; y++)
    for (let x = 0; x < SW; x++) fb.setPixel(x, y, 104);

  if (level.nodes.length > 0)
    bspNode(level, state, fb, colormap, level.nodes.length - 1);

  _dbg++;
}

function bspNode(
  level: DoomLevel, st: RenderState, fb: FramebufferWriter,
  cm: Uint8Array, idx: number,
): void {
  if (idx & 0x8000) {
    drawSubSector(level, st, fb, cm, idx & 0x7FFF);
    return;
  }
  if (idx >= level.nodes.length) return;
  const n = level.nodes[idx];
  const side = (st.viewX - n.x) * n.dy - (st.viewY - n.y) * n.dx;
  if (side >= 0) {
    bspNode(level, st, fb, cm, n.children[0]);
    bspNode(level, st, fb, cm, n.children[1]);
  } else {
    bspNode(level, st, fb, cm, n.children[1]);
    bspNode(level, st, fb, cm, n.children[0]);
  }
}

function drawSubSector(
  level: DoomLevel, st: RenderState, fb: FramebufferWriter,
  cm: Uint8Array, ssIdx: number,
): void {
  if (ssIdx >= level.subsectors.length) return;
  const ss = level.subsectors[ssIdx];
  for (let i = 0; i < ss.numSegs; i++) {
    const si = ss.firstSeg + i;
    if (si < level.segs.length) drawSeg(level, st, fb, cm, level.segs[si]);
  }
}

function drawSeg(
  level: DoomLevel, st: RenderState, fb: FramebufferWriter,
  cm: Uint8Array, seg: Seg,
): void {
  if (seg.linedef >= level.linedefs.length) return;
  const ld = level.linedefs[seg.linedef];
  const va = level.vertexes[seg.v1];
  const vb = level.vertexes[seg.v2];
  if (!va || !vb) return;

  // World coords (integer)
  const wx1 = va.x >> 16, wy1 = va.y >> 16;
  const wx2 = vb.x >> 16, wy2 = vb.y >> 16;

  // Transform to view space
  const rad = st.viewAngle * Math.PI / 180;
  const cs = Math.cos(rad), sn = Math.sin(rad);

  const rx1 = wx1 - st.viewX, ry1 = wy1 - st.viewY;
  const rx2 = wx2 - st.viewX, ry2 = wy2 - st.viewY;

  // Rotate: tz = depth (forward), tx = right
  let tz1 = rx1 * cs + ry1 * sn;
  let tx1 = ry1 * cs - rx1 * sn;
  let tz2 = rx2 * cs + ry2 * sn;
  let tx2 = ry2 * cs - rx2 * sn;

  // Both behind?
  if (tz1 <= 0 && tz2 <= 0) return;

  // Clip to near plane
  if (tz1 <= 0) {
    const t = 1 / (1 - tz1 / tz2);
    tx1 = tx1 + (tx2 - tx1) * (1 - t);
    tz1 = 1;
  }
  if (tz2 <= 0) {
    const t = 1 / (1 - tz2 / tz1);
    tx2 = tx2 + (tx1 - tx2) * (1 - t);
    tz2 = 1;
  }

  // Project to screen X
  const sx1 = Math.round(SW / 2 - tx1 * PROJ / tz1);
  const sx2 = Math.round(SW / 2 - tx2 * PROJ / tz2);

  if (sx1 === sx2) return;

  // Ensure sx1 < sx2 (swap if needed)
  let lx: number, rx: number, lz: number, rz: number;
  if (sx1 < sx2) {
    lx = sx1; rx = sx2; lz = tz1; rz = tz2;
  } else {
    lx = sx2; rx = sx1; lz = tz2; rz = tz1;
  }

  // Get sector data
  const fsIdx = seg.direction === 0 ? ld.sidenum[0] : ld.sidenum[1];
  const bsIdx = seg.direction === 0 ? ld.sidenum[1] : ld.sidenum[0];
  if (fsIdx < 0 || fsIdx >= level.sidedefs.length) return;
  const fsd = level.sidedefs[fsIdx];
  const fsc = level.sectors[fsd.sector];
  if (!fsc) return;

  const solid = bsIdx < 0 || bsIdx >= level.sidedefs.length;
  let bsc: Sector | null = null;
  if (!solid) {
    const bd = level.sidedefs[bsIdx];
    bsc = level.sectors[bd.sector] || null;
  }

  // Light
  const light = Math.max(0, Math.min(31, Math.floor((256 - fsc.lightLevel) / 8)));
  const baseCol = wallColor(fsd.midTexture || fsd.upperTexture || fsd.lowerTexture || '');

  // Draw columns
  const x0 = Math.max(0, lx);
  const x1 = Math.min(SW - 1, rx);

  for (let x = x0; x <= x1; x++) {
    if (clipTop[x] > clipBot[x]) continue;

    // Interpolate depth
    const t = (x - lx) / (rx - lx);
    const z = 1 / ((1 - t) / lz + t / rz);

    // Project heights
    const ceilY = Math.round(HH - (fsc.ceilHeight - st.viewZ) * PROJ / z);
    const floorY = Math.round(HH - (fsc.floorHeight - st.viewZ) * PROJ / z);

    // Distance shading
    const dl = Math.min(31, light + Math.floor(z / 600));
    const ci = dl * 256;
    const col = cm[ci + baseCol] || baseCol;

    if (solid) {
      const yt = Math.max(ceilY, clipTop[x]);
      const yb = Math.min(floorY, clipBot[x]);
      for (let y = yt; y <= yb; y++) fb.setPixel(x, y, col);
      clipTop[x] = SH;
      clipBot[x] = -1;
    } else if (bsc) {
      // Upper wall
      if (fsc.ceilHeight > bsc.ceilHeight) {
        const bcY = Math.round(HH - (bsc.ceilHeight - st.viewZ) * PROJ / z);
        const yt = Math.max(ceilY, clipTop[x]);
        const yb = Math.min(bcY, clipBot[x]);
        for (let y = yt; y <= yb; y++) fb.setPixel(x, y, col);
        if (bcY > clipTop[x]) clipTop[x] = bcY;
      }
      // Lower wall
      if (fsc.floorHeight < bsc.floorHeight) {
        const bfY = Math.round(HH - (bsc.floorHeight - st.viewZ) * PROJ / z);
        const yt = Math.max(bfY, clipTop[x]);
        const yb = Math.min(floorY, clipBot[x]);
        for (let y = yt; y <= yb; y++) fb.setPixel(x, y, col);
        if (bfY < clipBot[x]) clipBot[x] = bfY;
      }
    }
  }
}

function wallColor(tex: string): number {
  if (!tex || tex === '-') return 96;
  const t = tex.toUpperCase();
  if (t.includes('BROWN')) return 64;
  if (t.includes('STONE') || t.includes('GRAY') || t.includes('ROCK')) return 6;
  if (t.includes('METAL') || t.includes('PIPE')) return 104;
  if (t.includes('STAR') || t.includes('COMP') || t.includes('TECH')) return 176;
  if (t.includes('DOOR')) return 44;
  if (t.includes('LITE') || t.includes('LIGHT')) return 192;
  if (t.includes('NUKE') || t.includes('SLIME')) return 124;
  if (t.includes('WOOD')) return 144;
  if (t.includes('BRICK') || t.includes('MARBLE')) return 48;
  if (t.includes('BLUE')) return 200;
  if (t.includes('RED')) return 176;
  if (t.startsWith('SW')) return 112;
  return 96;
}
