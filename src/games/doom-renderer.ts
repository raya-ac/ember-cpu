// DOOM BSP software renderer
// Renders DOOM levels using the real BSP tree, segs, and sectors
// Writes to a 320x200 8-bit indexed framebuffer

import type { DoomLevel, Vertex, Seg, SubSector, BspNode, Sector, Linedef, Sidedef } from './wad';

const SCREENWIDTH = 320;
const SCREENHEIGHT = 200;
const HALF_HEIGHT = SCREENHEIGHT / 2;
const FOV = 90; // degrees
const HALF_FOV = FOV / 2;
const PROJECTION = SCREENWIDTH / 2 / Math.tan((HALF_FOV * Math.PI) / 180);

// Fixed-point helpers (16.16)
const FRACBITS = 16;
const FRACUNIT = 1 << FRACBITS;

export interface RenderState {
  viewX: number;     // player position (integer, map units)
  viewY: number;
  viewAngle: number; // degrees 0-360
  viewZ: number;     // eye height (41 = standing)
}

export interface FramebufferWriter {
  setPixel(x: number, y: number, colorIndex: number): void;
}

// Column clipping arrays
const floorClip = new Int32Array(SCREENWIDTH);    // bottom of unclipped area
const ceilingClip = new Int32Array(SCREENWIDTH);  // top of unclipped area

// Angle normalization
function normalizeAngle(a: number): number {
  a = a % 360;
  if (a < 0) a += 360;
  return a;
}

function angleDiff(a: number, b: number): number {
  let d = normalizeAngle(a - b);
  if (d > 180) d -= 360;
  return d;
}

// Get the angle from viewpoint to a vertex
function pointToAngle(vx: number, vy: number, px: number, py: number): number {
  return (Math.atan2(py - vy, px - vx) * 180) / Math.PI;
}

export function renderFrame(
  level: DoomLevel,
  state: RenderState,
  fb: FramebufferWriter,
  colormap: Uint8Array, // 34 light levels × 256 color mappings
): void {
  // Clear clipping arrays
  floorClip.fill(SCREENHEIGHT);
  ceilingClip.fill(-1);

  // Clear screen — sky color (index 0) above, floor color below
  for (let x = 0; x < SCREENWIDTH; x++) {
    for (let y = 0; y < HALF_HEIGHT; y++) fb.setPixel(x, y, 97); // sky blue-ish
    for (let y = HALF_HEIGHT; y < SCREENHEIGHT; y++) fb.setPixel(x, y, 104); // dark floor
  }

  // Traverse BSP tree
  const rootNode = level.nodes.length - 1;
  renderBspNode(level, state, fb, colormap, rootNode);
}

function renderBspNode(
  level: DoomLevel,
  state: RenderState,
  fb: FramebufferWriter,
  colormap: Uint8Array,
  nodeIdx: number,
): void {
  // Check for subsector (leaf node)
  if (nodeIdx & 0x8000) {
    const ssIdx = nodeIdx & 0x7FFF;
    renderSubSector(level, state, fb, colormap, ssIdx);
    return;
  }

  if (nodeIdx >= level.nodes.length) return;
  const node = level.nodes[nodeIdx];

  // Determine which side of the partition the player is on
  const dx = state.viewX - node.x;
  const dy = state.viewY - node.y;
  const side = dx * node.dy - dy * node.dx;

  if (side >= 0) {
    // Player is on the right side — render right first
    renderBspNode(level, state, fb, colormap, node.children[0]);
    renderBspNode(level, state, fb, colormap, node.children[1]);
  } else {
    // Player is on the left side — render left first
    renderBspNode(level, state, fb, colormap, node.children[1]);
    renderBspNode(level, state, fb, colormap, node.children[0]);
  }
}

function renderSubSector(
  level: DoomLevel,
  state: RenderState,
  fb: FramebufferWriter,
  colormap: Uint8Array,
  ssIdx: number,
): void {
  if (ssIdx >= level.subsectors.length) return;
  const ss = level.subsectors[ssIdx];

  for (let i = 0; i < ss.numSegs; i++) {
    const segIdx = ss.firstSeg + i;
    if (segIdx >= level.segs.length) continue;
    renderSeg(level, state, fb, colormap, level.segs[segIdx]);
  }
}

function renderSeg(
  level: DoomLevel,
  state: RenderState,
  fb: FramebufferWriter,
  colormap: Uint8Array,
  seg: Seg,
): void {
  // Get the linedef this seg belongs to
  if (seg.linedef >= level.linedefs.length) return;
  const linedef = level.linedefs[seg.linedef];

  // Get vertex positions
  const v1 = level.vertexes[seg.v1];
  const v2 = level.vertexes[seg.v2];
  if (!v1 || !v2) return;

  // Convert from 16.16 fixed to integer
  const x1 = v1.x >> 16;
  const y1 = v1.y >> 16;
  const x2 = v2.x >> 16;
  const y2 = v2.y >> 16;

  // Calculate angles to both endpoints
  const angle1 = pointToAngle(state.viewX, state.viewY, x1, y1);
  const angle2 = pointToAngle(state.viewX, state.viewY, x2, y2);

  // Clip to field of view
  let span = angleDiff(angle1, angle2);
  if (span <= 0) return; // back-facing

  // Check if wall is in FOV
  let rw_angle1 = angleDiff(angle1, state.viewAngle);
  let rw_angle2 = angleDiff(angle2, state.viewAngle);

  // Clip left
  if (rw_angle1 > HALF_FOV) {
    if (rw_angle1 - span > HALF_FOV) return; // entirely outside FOV
    rw_angle1 = HALF_FOV;
  }

  // Clip right
  if (rw_angle2 < -HALF_FOV) {
    if (-rw_angle2 > HALF_FOV + span) return;
    rw_angle2 = -HALF_FOV;
  }

  // Map angles to screen X coordinates
  const sx1 = Math.round(SCREENWIDTH / 2 - Math.tan((rw_angle1 * Math.PI) / 180) * PROJECTION);
  const sx2 = Math.round(SCREENWIDTH / 2 - Math.tan((rw_angle2 * Math.PI) / 180) * PROJECTION);

  if (sx1 >= sx2) return; // zero-width

  // Get sector info
  const frontSide = seg.direction === 0 ? linedef.sidenum[0] : linedef.sidenum[1];
  const backSide = seg.direction === 0 ? linedef.sidenum[1] : linedef.sidenum[0];

  if (frontSide < 0 || frontSide >= level.sidedefs.length) return;
  const frontSidedef = level.sidedefs[frontSide];
  const frontSector = level.sectors[frontSidedef.sector];
  if (!frontSector) return;

  // Calculate distance to wall (perpendicular distance for correct projection)
  const dx = (x1 + x2) / 2 - state.viewX;
  const dy = (y1 + y2) / 2 - state.viewY;
  const viewCos = Math.cos((state.viewAngle * Math.PI) / 180);
  const viewSin = Math.sin((state.viewAngle * Math.PI) / 180);
  const dist = Math.abs(dx * viewCos + dy * viewSin);

  if (dist < 1) return;

  // Calculate wall height on screen
  const wallHeight = frontSector.ceilHeight - frontSector.floorHeight;
  const projectedHeight = (wallHeight * PROJECTION) / dist;

  // Calculate top and bottom of wall on screen
  const ceilProj = ((frontSector.ceilHeight - state.viewZ) * PROJECTION) / dist;
  const floorProj = ((frontSector.floorHeight - state.viewZ) * PROJECTION) / dist;

  const wallTop = Math.round(HALF_HEIGHT - ceilProj);
  const wallBottom = Math.round(HALF_HEIGHT - floorProj);

  // Determine wall color based on light level and texture
  const light = Math.max(0, Math.min(31, Math.floor((255 - frontSector.lightLevel) / 8)));
  const cmapOffset = light * 256;

  // Choose a base color based on texture name
  let baseColor = 96; // gray
  const tex = frontSidedef.midTexture || frontSidedef.upperTexture || frontSidedef.lowerTexture || '';
  if (tex.includes('BROWN') || tex.includes('WOOD')) baseColor = 64;
  else if (tex.includes('GRAY') || tex.includes('STONE') || tex.includes('METAL')) baseColor = 104;
  else if (tex.includes('STAR') || tex.includes('COMP')) baseColor = 176;
  else if (tex.includes('DOOR')) baseColor = 44;
  else if (tex.includes('LITE') || tex.includes('LIGHT')) baseColor = 192;
  else if (tex.includes('NUKAGE') || tex.includes('SLIME')) baseColor = 112;
  else if (tex.startsWith('SW')) baseColor = 200;
  else baseColor = 96;

  // Is this a one-sided wall (solid) or two-sided (portal)?
  const isSolid = backSide < 0 || backSide >= level.sidedefs.length;

  let backSector: Sector | null = null;
  if (!isSolid) {
    const backSidedef = level.sidedefs[backSide];
    backSector = level.sectors[backSidedef.sector] || null;
  }

  // Draw wall columns
  for (let x = Math.max(0, sx1); x < Math.min(SCREENWIDTH, sx2); x++) {
    // Column-accurate distance (interpolated)
    const frac = (x - sx1) / (sx2 - sx1);
    const colAngle = rw_angle1 + (rw_angle2 - rw_angle1) * frac;
    const colDist = dist / Math.cos((colAngle * Math.PI) / 180);
    if (colDist < 1) continue;

    const colCeilProj = ((frontSector.ceilHeight - state.viewZ) * PROJECTION) / colDist;
    const colFloorProj = ((frontSector.floorHeight - state.viewZ) * PROJECTION) / colDist;
    let yt = Math.round(HALF_HEIGHT - colCeilProj);
    let yb = Math.round(HALF_HEIGHT - colFloorProj);

    // Clip to column bounds
    yt = Math.max(yt, ceilingClip[x] + 1);
    yb = Math.min(yb, floorClip[x] - 1);

    if (isSolid) {
      // Solid wall — draw full wall and update clipping
      const litColor = colormap[cmapOffset + baseColor] || baseColor;
      for (let y = yt; y <= yb; y++) {
        if (y >= 0 && y < SCREENHEIGHT) {
          // Add some texture variation based on y
          const shade = Math.max(0, litColor - Math.floor(Math.abs(y - (yt + yb) / 2) * 0.3));
          fb.setPixel(x, y, shade);
        }
      }
      // Mark this column as fully drawn
      ceilingClip[x] = SCREENHEIGHT;
      floorClip[x] = -1;
    } else if (backSector) {
      // Two-sided line — draw upper and lower walls
      const backCeilProj = ((backSector.ceilHeight - state.viewZ) * PROJECTION) / colDist;
      const backFloorProj = ((backSector.floorHeight - state.viewZ) * PROJECTION) / colDist;

      // Upper wall (if front ceiling > back ceiling)
      if (frontSector.ceilHeight > backSector.ceilHeight) {
        const upperBot = Math.round(HALF_HEIGHT - backCeilProj);
        const litColor = colormap[cmapOffset + baseColor] || baseColor;
        for (let y = yt; y < Math.min(upperBot, yb); y++) {
          if (y >= 0 && y < SCREENHEIGHT) fb.setPixel(x, y, litColor);
        }
        ceilingClip[x] = Math.max(ceilingClip[x], Math.min(upperBot, yb));
      }

      // Lower wall (if front floor < back floor)
      if (frontSector.floorHeight < backSector.floorHeight) {
        const lowerTop = Math.round(HALF_HEIGHT - backFloorProj);
        const litColor = colormap[cmapOffset + (baseColor + 8)] || baseColor;
        for (let y = Math.max(lowerTop, yt); y <= yb; y++) {
          if (y >= 0 && y < SCREENHEIGHT) fb.setPixel(x, y, litColor);
        }
        floorClip[x] = Math.min(floorClip[x], Math.max(lowerTop, yt));
      }
    }
  }
}
