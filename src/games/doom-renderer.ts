// DOOM BSP software renderer with real WAD textures

import type { DoomLevel, Seg, Sector, Flat, WallTexture } from './wad';

const SW = 320;
const SH = 168; // 200 - 32 for status bar
const HH = SH / 2;
const FOV = Math.PI / 2;
const PROJ = SW / 2 / Math.tan(FOV / 2);

export interface RenderState {
  viewX: number;
  viewY: number;
  viewAngle: number;
  viewZ: number;
}

export interface FramebufferWriter {
  setPixel(x: number, y: number, c: number): void;
}

export interface TextureSet {
  walls: Map<string, WallTexture>;
  flats: Map<string, Flat>;
}

const clipTop = new Int32Array(SW);
const clipBot = new Int32Array(SW);

// Per-column: sector floor/ceil info for flat rendering
const colCeilSector = new Float64Array(SW); // screen Y of ceiling for flat rendering
const colFloorSector = new Float64Array(SW);

export function renderFrame(
  level: DoomLevel,
  state: RenderState,
  fb: FramebufferWriter,
  colormap: Uint8Array,
  textures: TextureSet,
): void {
  clipTop.fill(0);
  clipBot.fill(SH - 1);

  // Fill with sky color (DOOM palette index for sky)
  for (let y = 0; y < HH; y++)
    for (let x = 0; x < SW; x++) fb.setPixel(x, y, 97);
  // Floor color
  for (let y = HH; y < SH; y++)
    for (let x = 0; x < SW; x++) fb.setPixel(x, y, 112);

  if (level.nodes.length > 0)
    bspNode(level, state, fb, colormap, textures, level.nodes.length - 1);
}

function bspNode(
  level: DoomLevel, st: RenderState, fb: FramebufferWriter,
  cm: Uint8Array, tex: TextureSet, idx: number,
): void {
  if (idx & 0x8000) {
    drawSubSector(level, st, fb, cm, tex, idx & 0x7FFF);
    return;
  }
  if (idx >= level.nodes.length) return;
  const n = level.nodes[idx];
  const side = (st.viewX - n.x) * n.dy - (st.viewY - n.y) * n.dx;
  if (side >= 0) {
    bspNode(level, st, fb, cm, tex, n.children[0]);
    bspNode(level, st, fb, cm, tex, n.children[1]);
  } else {
    bspNode(level, st, fb, cm, tex, n.children[1]);
    bspNode(level, st, fb, cm, tex, n.children[0]);
  }
}

function drawSubSector(
  level: DoomLevel, st: RenderState, fb: FramebufferWriter,
  cm: Uint8Array, tex: TextureSet, ssIdx: number,
): void {
  if (ssIdx >= level.subsectors.length) return;
  const ss = level.subsectors[ssIdx];
  for (let i = 0; i < ss.numSegs; i++) {
    const si = ss.firstSeg + i;
    if (si < level.segs.length) drawSeg(level, st, fb, cm, tex, level.segs[si]);
  }
}

function drawSeg(
  level: DoomLevel, st: RenderState, fb: FramebufferWriter,
  cm: Uint8Array, tex: TextureSet, seg: Seg,
): void {
  if (seg.linedef >= level.linedefs.length) return;
  const ld = level.linedefs[seg.linedef];
  const va = level.vertexes[seg.v1];
  const vb = level.vertexes[seg.v2];
  if (!va || !vb) return;

  const wx1 = va.x >> 16, wy1 = va.y >> 16;
  const wx2 = vb.x >> 16, wy2 = vb.y >> 16;

  const rad = st.viewAngle * Math.PI / 180;
  const cs = Math.cos(rad), sn = Math.sin(rad);

  const rx1 = wx1 - st.viewX, ry1 = wy1 - st.viewY;
  const rx2 = wx2 - st.viewX, ry2 = wy2 - st.viewY;

  let tz1 = rx1 * cs + ry1 * sn;
  let tx1 = ry1 * cs - rx1 * sn;
  let tz2 = rx2 * cs + ry2 * sn;
  let tx2 = ry2 * cs - rx2 * sn;

  if (tz1 <= 0 && tz2 <= 0) return;

  // Track original values for texture mapping
  const otz1 = tz1, otx1 = tx1, otz2 = tz2, otx2 = tx2;

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

  const sx1 = Math.round(SW / 2 - tx1 * PROJ / tz1);
  const sx2 = Math.round(SW / 2 - tx2 * PROJ / tz2);

  if (sx1 === sx2) return;

  let lx: number, rx: number, lz: number, rz: number;
  if (sx1 < sx2) {
    lx = sx1; rx = sx2; lz = tz1; rz = tz2;
  } else {
    lx = sx2; rx = sx1; lz = tz2; rz = tz1;
  }

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

  const light = Math.max(0, Math.min(31, Math.floor((256 - fsc.lightLevel) / 8)));

  // Get wall texture
  const midTexName = fsd.midTexture && fsd.midTexture !== '-' ? fsd.midTexture.toUpperCase() : '';
  const upperTexName = fsd.upperTexture && fsd.upperTexture !== '-' ? fsd.upperTexture.toUpperCase() : '';
  const lowerTexName = fsd.lowerTexture && fsd.lowerTexture !== '-' ? fsd.lowerTexture.toUpperCase() : '';

  const midTex = midTexName ? tex.walls.get(midTexName) : undefined;
  const upperTex = upperTexName ? tex.walls.get(upperTexName) : undefined;
  const lowerTex = lowerTexName ? tex.walls.get(lowerTexName) : undefined;

  // Wall length for texture mapping
  const wallLen = Math.sqrt((wx2 - wx1) ** 2 + (wy2 - wy1) ** 2);

  const x0 = Math.max(0, lx);
  const x1 = Math.min(SW - 1, rx);

  for (let x = x0; x <= x1; x++) {
    if (clipTop[x] > clipBot[x]) continue;

    const t = rx > lx ? (x - lx) / (rx - lx) : 0;
    const z = 1 / ((1 - t) / lz + t / rz);

    const ceilY = Math.round(HH - (fsc.ceilHeight - st.viewZ) * PROJ / z);
    const floorY = Math.round(HH - (fsc.floorHeight - st.viewZ) * PROJ / z);

    const dl = Math.min(31, light + Math.floor(z / 600));
    const ci = Math.min(31, dl) * 256;

    // Texture column: interpolate position along wall
    const texU = (seg.offset + t * wallLen + fsd.xOffset) | 0;

    if (solid) {
      const yt = Math.max(ceilY, clipTop[x]);
      const yb = Math.min(floorY, clipBot[x]);

      // Draw ceiling flat
      drawFlatSpan(fb, cm, tex, fsc.ceilPic, st, x, clipTop[x], Math.min(yt - 1, clipBot[x]), fsc.ceilHeight, ci);
      // Draw floor flat
      drawFlatSpan(fb, cm, tex, fsc.floorPic, st, x, Math.max(yb + 1, clipTop[x]), clipBot[x], fsc.floorHeight, ci);

      // Draw textured wall
      if (midTex && yt <= yb) {
        drawTexturedColumn(fb, cm, midTex, x, yt, yb, ci, texU, fsc.ceilHeight - fsc.floorHeight, fsd.yOffset);
      } else {
        // Fallback: solid color
        const col = cm[ci + 96] || 96;
        for (let y = yt; y <= yb; y++) fb.setPixel(x, y, col);
      }

      clipTop[x] = SH;
      clipBot[x] = -1;
    } else if (bsc) {
      // Two-sided line

      // Ceiling flat above upper wall
      const frontCeilY = ceilY;
      const backCeilY = Math.round(HH - (bsc.ceilHeight - st.viewZ) * PROJ / z);
      const backFloorY = Math.round(HH - (bsc.floorHeight - st.viewZ) * PROJ / z);

      // Draw front ceiling flat
      drawFlatSpan(fb, cm, tex, fsc.ceilPic, st, x, clipTop[x], Math.min(frontCeilY - 1, clipBot[x]), fsc.ceilHeight, ci);

      // Upper wall
      if (fsc.ceilHeight > bsc.ceilHeight) {
        const yt = Math.max(frontCeilY, clipTop[x]);
        const yb = Math.min(backCeilY, clipBot[x]);
        if (yt <= yb) {
          if (upperTex) {
            drawTexturedColumn(fb, cm, upperTex, x, yt, yb, ci, texU, fsc.ceilHeight - bsc.ceilHeight, fsd.yOffset);
          } else {
            const col = cm[ci + 64] || 64;
            for (let y = yt; y <= yb; y++) fb.setPixel(x, y, col);
          }
        }
        if (backCeilY > clipTop[x]) clipTop[x] = backCeilY;
      }

      // Lower wall
      if (fsc.floorHeight < bsc.floorHeight) {
        const yt = Math.max(backFloorY, clipTop[x]);
        const yb = Math.min(floorY, clipBot[x]);
        if (yt <= yb) {
          if (lowerTex) {
            drawTexturedColumn(fb, cm, lowerTex, x, yt, yb, ci, texU, bsc.floorHeight - fsc.floorHeight, fsd.yOffset);
          } else {
            const col = cm[ci + 104] || 104;
            for (let y = yt; y <= yb; y++) fb.setPixel(x, y, col);
          }
        }
        if (backFloorY < clipBot[x]) clipBot[x] = backFloorY;
      }

      // Draw front floor flat
      drawFlatSpan(fb, cm, tex, fsc.floorPic, st, x, Math.max(floorY + 1, clipTop[x]), clipBot[x], fsc.floorHeight, ci);
    }
  }
}

function drawTexturedColumn(
  fb: FramebufferWriter, cm: Uint8Array,
  tex: WallTexture, x: number, yt: number, yb: number,
  cmapOfs: number, texU: number, wallHeight: number, yOffset: number,
): void {
  const tw = tex.width;
  const th = tex.height;
  const u = ((texU % tw) + tw) % tw;
  const colHeight = yb - yt + 1;

  for (let y = yt; y <= yb; y++) {
    const frac = (y - yt) / colHeight;
    let v = Math.round((frac * wallHeight + yOffset) % th);
    if (v < 0) v += th;
    v = v % th;
    const pixel = tex.pixels[v * tw + u];
    const lit = cm[cmapOfs + pixel] ?? pixel;
    fb.setPixel(x, y, lit);
  }
}

function drawFlatSpan(
  fb: FramebufferWriter, cm: Uint8Array, tex: TextureSet,
  flatName: string, st: RenderState,
  x: number, yt: number, yb: number,
  planeHeight: number, cmapOfs: number,
): void {
  if (yt > yb || yt >= SH || yb < 0) return;

  // Sky check
  if (flatName === 'F_SKY1') {
    // Draw sky gradient
    for (let y = Math.max(0, yt); y <= Math.min(SH - 1, yb); y++) {
      fb.setPixel(x, y, 97 + Math.floor(y * 3 / SH)); // sky gradient
    }
    return;
  }

  const flat = tex.flats.get(flatName);
  if (!flat) {
    // Fallback solid color
    const col = cm[cmapOfs + 112] ?? 112;
    for (let y = Math.max(0, yt); y <= Math.min(SH - 1, yb); y++) fb.setPixel(x, y, col);
    return;
  }

  const rad = st.viewAngle * Math.PI / 180;
  const cs = Math.cos(rad), sn = Math.sin(rad);

  for (let y = Math.max(0, yt); y <= Math.min(SH - 1, yb); y++) {
    // Calculate the distance for this screen row
    const rowDist = Math.abs((planeHeight - st.viewZ) * PROJ / (y - HH || 0.001));

    // Calculate world position of this floor/ceiling pixel
    const wx = st.viewX + (cs * rowDist * (x - SW / 2) / PROJ) + (sn * rowDist);
    const wy = st.viewY + (sn * rowDist * (x - SW / 2) / PROJ) - (cs * rowDist);

    // Map to flat texture coordinates
    const tx = ((Math.floor(wx) % 64) + 64) % 64;
    const ty = ((Math.floor(wy) % 64) + 64) % 64;

    const pixel = flat.pixels[ty * 64 + tx];
    const lit = cm[cmapOfs + pixel] ?? pixel;
    fb.setPixel(x, y, lit);
  }
}
