import { useEffect, useRef, useState, useCallback } from 'react';

// ── Map (24x24, E1M1-inspired) ──────────────────────────────────────────────
const MAP_W = 24;
const MAP_H = 24;
const WORLD_MAP: number[][] = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,1,1,1,1,0,0,0,2,2,2,0,0,0,3,3,3,0,0,0,0,1],
  [1,0,0,1,0,0,1,0,0,0,0,0,2,0,0,0,0,0,3,0,0,0,0,1],
  [1,0,0,1,0,0,1,0,0,0,0,0,2,0,0,0,0,0,3,0,0,0,0,1],
  [1,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,1,0,0,0,0,0,0,0,0,4,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,1,1,1,0,0,0,0,0,4,4,4,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,0,0,1,1,1,1,1,0,0,0,1,1,1,1,1,0,0,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,2,2,0,0,0,0,0,0,0,0,0,0,0,0,3,3,0,0,0,0,1],
  [1,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,0,0,0,0,1],
  [1,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,4,4,0,0,0,1,1,0,0,0,4,4,0,0,0,0,0,1],
  [1,0,0,0,0,0,4,0,0,0,0,1,0,0,0,0,0,4,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

// ── Constants ────────────────────────────────────────────────────────────────
const SCREEN_W = 320;
const SCREEN_H = 200;
const FOV = 66 * (Math.PI / 180);
const HALF_FOV = FOV / 2;
const MOVE_SPEED = 3.0;
const ROT_SPEED = 2.5;
const MOUSE_SENS = 0.003;
const HUD_HEIGHT = 32;
const VIEW_H = SCREEN_H - HUD_HEIGHT;

// ── Wall colors by type & side ───────────────────────────────────────────────
const WALL_COLORS: Record<number, { ns: string; ew: string }> = {
  1: { ns: '#8B0000', ew: '#5C0000' },  // dark red brick
  2: { ns: '#4A4A4A', ew: '#333333' },  // gray stone
  3: { ns: '#2E4A1E', ew: '#1E3312' },  // green moss
  4: { ns: '#6B4226', ew: '#4A2E1A' },  // brown wood
};

// ── Brick texture generation ─────────────────────────────────────────────────
function generateBrickTexture(baseR: number, baseG: number, baseB: number): ImageData {
  const size = 64;
  const data = new ImageData(size, size);
  const d = data.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // Mortar lines
      const brickH = 8;
      const brickW = 16;
      const row = Math.floor(y / brickH);
      const offset = (row % 2) * (brickW / 2);
      const localY = y % brickH;
      const localX = (x + offset) % brickW;
      const isMortar = localY === 0 || localX === 0;
      if (isMortar) {
        d[i] = 40; d[i+1] = 40; d[i+2] = 40; d[i+3] = 255;
      } else {
        // Add noise to brick
        const noise = (Math.random() - 0.5) * 30;
        d[i]   = Math.max(0, Math.min(255, baseR + noise));
        d[i+1] = Math.max(0, Math.min(255, baseG + noise));
        d[i+2] = Math.max(0, Math.min(255, baseB + noise));
        d[i+3] = 255;
      }
    }
  }
  return data;
}

// ── EmberC pseudocode ────────────────────────────────────────────────────────
const EMBERC_SOURCE = `// DOOM Raycaster — EmberC pseudocode
// Compiled to Ember 32-bit ISA

struct Player {
  fixed16 posX, posY;
  fixed16 dirX, dirY;
  fixed16 planeX, planeY;
}

fn cast_ray(col: u16, player: &Player) -> WallHit {
  // camera x coordinate in [-1, 1]
  let cameraX: fixed16 = 2 * col / SCREEN_W - 1;

  // ray direction
  let rayDirX = player.dirX + player.planeX * cameraX;
  let rayDirY = player.dirY + player.planeY * cameraX;

  // which grid cell we're in
  let mapX: i16 = floor(player.posX);
  let mapY: i16 = floor(player.posY);

  // delta distance (distance ray travels per grid line)
  let deltaDistX = abs(1.0 / rayDirX);
  let deltaDistY = abs(1.0 / rayDirY);

  // step direction and initial side distance
  let (stepX, sideDistX) = if rayDirX < 0 {
    (-1, (player.posX - mapX) * deltaDistX)
  } else {
    (1, (mapX + 1.0 - player.posX) * deltaDistX)
  };

  let (stepY, sideDistY) = if rayDirY < 0 {
    (-1, (player.posY - mapY) * deltaDistY)
  } else {
    (1, (mapY + 1.0 - player.posY) * deltaDistY)
  };

  // DDA loop — step through grid cells
  let mut side: u8 = 0;
  loop {
    if sideDistX < sideDistY {
      sideDistX += deltaDistX;
      mapX += stepX;
      side = 0;  // hit NS wall
    } else {
      sideDistY += deltaDistY;
      mapY += stepY;
      side = 1;  // hit EW wall
    }
    if world_map[mapX][mapY] > 0 { break; }
  }

  // perpendicular distance (no fisheye)
  let perpDist = if side == 0 {
    (mapX - player.posX + (1 - stepX) / 2) / rayDirX
  } else {
    (mapY - player.posY + (1 - stepY) / 2) / rayDirY
  };

  // wall slice height
  let lineHeight = SCREEN_H / perpDist;

  return WallHit { lineHeight, side, wallType:
    world_map[mapX][mapY], perpDist };
}

fn render_frame(player: &Player, fb: &mut [u32]) {
  // ceiling + floor
  for y in 0..SCREEN_H/2 {
    let shade = 0x10 + y * 0x60 / (SCREEN_H/2);
    fill_row(fb, y, rgb(shade/3, shade/3, shade/2));
    fill_row(fb, SCREEN_H-1-y, rgb(shade/4, shade/5, shade/6));
  }

  // cast one ray per column
  for col in 0..SCREEN_W {
    let hit = cast_ray(col, player);
    draw_wall_slice(fb, col, hit);
  }

  draw_hud(fb, player);
  draw_weapon(fb);
}`;

// ── Component ────────────────────────────────────────────────────────────────
export function DoomGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const keysRef = useRef<Set<string>>(new Set());
  const playerRef = useRef({
    x: 2.5, y: 2.5,
    dirX: 1, dirY: 0,
    planeX: 0, planeY: 0.66, // FOV ~66 deg
  });
  const animFrameRef = useRef(0);
  const texturesRef = useRef<Map<string, ImageData>>(new Map());
  const lastTimeRef = useRef(0);
  const pointerLockedRef = useRef(false);
  const mouseDxRef = useRef(0);
  const fpsRef = useRef(60);

  // Build textures once
  const getTextures = useCallback(() => {
    if (texturesRef.current.size > 0) return texturesRef.current;
    const m = new Map<string, ImageData>();
    m.set('1_ns', generateBrickTexture(139, 20, 20));
    m.set('1_ew', generateBrickTexture(92, 12, 12));
    m.set('2_ns', generateBrickTexture(74, 74, 74));
    m.set('2_ew', generateBrickTexture(51, 51, 51));
    m.set('3_ns', generateBrickTexture(46, 74, 30));
    m.set('3_ew', generateBrickTexture(30, 51, 18));
    m.set('4_ns', generateBrickTexture(107, 66, 38));
    m.set('4_ew', generateBrickTexture(74, 46, 26));
    texturesRef.current = m;
    return m;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Offscreen buffer at native resolution
    const offscreen = document.createElement('canvas');
    offscreen.width = SCREEN_W;
    offscreen.height = SCREEN_H;
    offscreenRef.current = offscreen;
    const ctx = offscreen.getContext('2d', { willReadFrequently: true })!;
    const displayCtx = canvas.getContext('2d')!;
    displayCtx.imageSmoothingEnabled = false;

    const textures = getTextures();

    // Keyboard
    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase());
      if (e.key.toLowerCase() === 'h') setShowHelp(p => !p);
    };
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Pointer lock for mouse look
    const onClick = () => {
      canvas.requestPointerLock();
    };
    const onPointerLockChange = () => {
      pointerLockedRef.current = document.pointerLockElement === canvas;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (pointerLockedRef.current) {
        mouseDxRef.current += e.movementX;
      }
    };
    canvas.addEventListener('click', onClick);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('mousemove', onMouseMove);

    // ── Render loop ──────────────────────────────────────────────────────
    function frame(time: number) {
      const dt = Math.min((time - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = time;
      if (dt > 0) fpsRef.current = fpsRef.current * 0.95 + (1 / dt) * 0.05;

      const p = playerRef.current;
      const keys = keysRef.current;

      // ── Mouse rotation ─────────────────────────────────────────────
      const mouseDx = mouseDxRef.current;
      mouseDxRef.current = 0;
      if (mouseDx !== 0) {
        const angle = -mouseDx * MOUSE_SENS;
        const oldDirX = p.dirX;
        p.dirX = p.dirX * Math.cos(angle) - p.dirY * Math.sin(angle);
        p.dirY = oldDirX * Math.sin(angle) + p.dirY * Math.cos(angle);
        const oldPlaneX = p.planeX;
        p.planeX = p.planeX * Math.cos(angle) - p.planeY * Math.sin(angle);
        p.planeY = oldPlaneX * Math.sin(angle) + p.planeY * Math.cos(angle);
      }

      // ── Keyboard rotation (arrow keys / q/e) ──────────────────────
      const rotAmount = ROT_SPEED * dt;
      if (keys.has('arrowleft') || keys.has('q')) {
        const a = rotAmount;
        const oldDirX = p.dirX;
        p.dirX = p.dirX * Math.cos(a) - p.dirY * Math.sin(a);
        p.dirY = oldDirX * Math.sin(a) + p.dirY * Math.cos(a);
        const oldPlaneX = p.planeX;
        p.planeX = p.planeX * Math.cos(a) - p.planeY * Math.sin(a);
        p.planeY = oldPlaneX * Math.sin(a) + p.planeY * Math.cos(a);
      }
      if (keys.has('arrowright') || keys.has('e')) {
        const a = -rotAmount;
        const oldDirX = p.dirX;
        p.dirX = p.dirX * Math.cos(a) - p.dirY * Math.sin(a);
        p.dirY = oldDirX * Math.sin(a) + p.dirY * Math.cos(a);
        const oldPlaneX = p.planeX;
        p.planeX = p.planeX * Math.cos(a) - p.planeY * Math.sin(a);
        p.planeY = oldPlaneX * Math.sin(a) + p.planeY * Math.cos(a);
      }

      // ── Movement ───────────────────────────────────────────────────
      const speed = MOVE_SPEED * dt;
      const margin = 0.2;

      function canMove(nx: number, ny: number) {
        // Check corners of a small bounding box
        for (const ox of [-margin, margin]) {
          for (const oy of [-margin, margin]) {
            const mx = Math.floor(nx + ox);
            const my = Math.floor(ny + oy);
            if (mx < 0 || mx >= MAP_W || my < 0 || my >= MAP_H) return false;
            if (WORLD_MAP[my][mx] > 0) return false;
          }
        }
        return true;
      }

      // Forward / backward
      if (keys.has('w') || keys.has('arrowup')) {
        const nx = p.x + p.dirX * speed;
        const ny = p.y + p.dirY * speed;
        if (canMove(nx, p.y)) p.x = nx;
        if (canMove(p.x, ny)) p.y = ny;
      }
      if (keys.has('s') || keys.has('arrowdown')) {
        const nx = p.x - p.dirX * speed;
        const ny = p.y - p.dirY * speed;
        if (canMove(nx, p.y)) p.x = nx;
        if (canMove(p.x, ny)) p.y = ny;
      }
      // Strafe
      if (keys.has('a')) {
        const nx = p.x + p.dirY * speed;
        const ny = p.y - p.dirX * speed;
        if (canMove(nx, p.y)) p.x = nx;
        if (canMove(p.x, ny)) p.y = ny;
      }
      if (keys.has('d')) {
        const nx = p.x - p.dirY * speed;
        const ny = p.y + p.dirX * speed;
        if (canMove(nx, p.y)) p.x = nx;
        if (canMove(p.x, ny)) p.y = ny;
      }

      // ── Raycasting ────────────────────────────────────────────────
      const imgData = ctx.createImageData(SCREEN_W, VIEW_H);
      const buf = imgData.data;

      // Ceiling and floor with distance shading
      for (let y = 0; y < VIEW_H; y++) {
        const halfH = VIEW_H / 2;
        const distFromCenter = Math.abs(y - halfH);
        const shade = Math.floor(10 + (distFromCenter / halfH) * 60);
        for (let x = 0; x < SCREEN_W; x++) {
          const i = (y * SCREEN_W + x) * 4;
          if (y < halfH) {
            // Ceiling — dark blue-gray
            buf[i]   = Math.floor(shade * 0.15);
            buf[i+1] = Math.floor(shade * 0.15);
            buf[i+2] = Math.floor(shade * 0.25);
          } else {
            // Floor — dark brown-gray
            buf[i]   = Math.floor(shade * 0.2);
            buf[i+1] = Math.floor(shade * 0.15);
            buf[i+2] = Math.floor(shade * 0.1);
          }
          buf[i+3] = 255;
        }
      }

      // Cast rays
      const zBuffer = new Float64Array(SCREEN_W);

      for (let col = 0; col < SCREEN_W; col++) {
        const cameraX = 2 * col / SCREEN_W - 1;
        const rayDirX = p.dirX + p.planeX * cameraX;
        const rayDirY = p.dirY + p.planeY * cameraX;

        let mapX = Math.floor(p.x);
        let mapY = Math.floor(p.y);

        const deltaDistX = Math.abs(1 / rayDirX);
        const deltaDistY = Math.abs(1 / rayDirY);

        let stepX: number, stepY: number;
        let sideDistX: number, sideDistY: number;

        if (rayDirX < 0) {
          stepX = -1;
          sideDistX = (p.x - mapX) * deltaDistX;
        } else {
          stepX = 1;
          sideDistX = (mapX + 1 - p.x) * deltaDistX;
        }
        if (rayDirY < 0) {
          stepY = -1;
          sideDistY = (p.y - mapY) * deltaDistY;
        } else {
          stepY = 1;
          sideDistY = (mapY + 1 - p.y) * deltaDistY;
        }

        // DDA
        let side = 0;
        let hit = false;
        while (!hit) {
          if (sideDistX < sideDistY) {
            sideDistX += deltaDistX;
            mapX += stepX;
            side = 0;
          } else {
            sideDistY += deltaDistY;
            mapY += stepY;
            side = 1;
          }
          if (mapY >= 0 && mapY < MAP_H && mapX >= 0 && mapX < MAP_W) {
            if (WORLD_MAP[mapY][mapX] > 0) hit = true;
          } else {
            break;
          }
        }

        if (!hit) { zBuffer[col] = 1e9; continue; }

        // Perpendicular distance
        let perpDist: number;
        if (side === 0) {
          perpDist = (mapX - p.x + (1 - stepX) / 2) / rayDirX;
        } else {
          perpDist = (mapY - p.y + (1 - stepY) / 2) / rayDirY;
        }
        zBuffer[col] = perpDist;

        const lineHeight = Math.floor(VIEW_H / perpDist);
        let drawStart = Math.floor(-lineHeight / 2 + VIEW_H / 2);
        let drawEnd = Math.floor(lineHeight / 2 + VIEW_H / 2);
        if (drawStart < 0) drawStart = 0;
        if (drawEnd >= VIEW_H) drawEnd = VIEW_H - 1;

        const wallType = WORLD_MAP[mapY][mapX];
        const texKey = `${wallType}_${side === 0 ? 'ns' : 'ew'}`;
        const tex = textures.get(texKey);

        // Texture X coordinate
        let wallX: number;
        if (side === 0) {
          wallX = p.y + perpDist * rayDirY;
        } else {
          wallX = p.x + perpDist * rayDirX;
        }
        wallX -= Math.floor(wallX);

        const texX = Math.floor(wallX * 64);

        // Distance fog
        const fogFactor = Math.min(1, perpDist / 12);

        for (let y = drawStart; y <= drawEnd; y++) {
          const d = y - VIEW_H / 2 + lineHeight / 2;
          const texY = Math.floor((d * 64) / lineHeight) & 63;

          const i = (y * SCREEN_W + col) * 4;
          if (tex) {
            const ti = (texY * 64 + texX) * 4;
            const r = tex.data[ti];
            const g = tex.data[ti+1];
            const b = tex.data[ti+2];
            // Apply fog
            buf[i]   = Math.floor(r * (1 - fogFactor));
            buf[i+1] = Math.floor(g * (1 - fogFactor));
            buf[i+2] = Math.floor(b * (1 - fogFactor));
          } else {
            const c = WALL_COLORS[wallType] || WALL_COLORS[1];
            const hex = side === 0 ? c.ns : c.ew;
            const pr = parseInt(hex.slice(1,3), 16);
            const pg = parseInt(hex.slice(3,5), 16);
            const pb = parseInt(hex.slice(5,7), 16);
            buf[i]   = Math.floor(pr * (1 - fogFactor));
            buf[i+1] = Math.floor(pg * (1 - fogFactor));
            buf[i+2] = Math.floor(pb * (1 - fogFactor));
          }
          buf[i+3] = 255;
        }
      }

      ctx.putImageData(imgData, 0, 0);

      // ── HUD ────────────────────────────────────────────────────────
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, VIEW_H, SCREEN_W, HUD_HEIGHT);
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, VIEW_H, SCREEN_W, HUD_HEIGHT);

      // Health bar
      ctx.fillStyle = '#333';
      ctx.fillRect(8, VIEW_H + 6, 80, 10);
      ctx.fillStyle = '#ff2222';
      ctx.fillRect(8, VIEW_H + 6, 80, 10); // 100% health
      ctx.fillStyle = '#ccc';
      ctx.font = '8px monospace';
      ctx.fillText('HEALTH 100%', 10, VIEW_H + 14);

      // Face (center)
      ctx.font = '16px monospace';
      ctx.fillText('>:)', SCREEN_W / 2 - 12, VIEW_H + 20);

      // Ammo
      ctx.fillStyle = '#ffaa00';
      ctx.font = '8px monospace';
      ctx.fillText('SHELLS: 50', SCREEN_W - 80, VIEW_H + 10);
      ctx.fillStyle = '#888';
      ctx.fillText('SHOTGUN', SCREEN_W - 80, VIEW_H + 22);

      // FPS
      ctx.fillStyle = '#666';
      ctx.font = '7px monospace';
      ctx.fillText(`${Math.round(fpsRef.current)} FPS`, SCREEN_W / 2 - 16, VIEW_H + 30);

      // ── Weapon sprite ──────────────────────────────────────────────
      const weaponBob = Math.sin(time * 0.005) * 2;
      const wx = SCREEN_W / 2 - 20;
      const wy = VIEW_H - 40 + weaponBob;

      // Shotgun barrel
      ctx.fillStyle = '#555';
      ctx.fillRect(wx + 8, wy, 6, 35);
      ctx.fillRect(wx + 18, wy, 6, 35);
      // Stock
      ctx.fillStyle = '#6B4226';
      ctx.fillRect(wx + 4, wy + 30, 24, 14);
      ctx.fillStyle = '#4A2E1A';
      ctx.fillRect(wx + 6, wy + 32, 20, 10);
      // Grip
      ctx.fillStyle = '#555';
      ctx.fillRect(wx + 12, wy + 38, 8, 12);
      // Muzzle
      ctx.fillStyle = '#333';
      ctx.fillRect(wx + 7, wy - 2, 8, 4);
      ctx.fillRect(wx + 17, wy - 2, 8, 4);

      // ── Minimap ────────────────────────────────────────────────────
      const mmScale = 3;
      const mmSize = MAP_W * mmScale;
      const mmX = SCREEN_W - mmSize - 4;
      const mmY = 4;

      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(mmX - 1, mmY - 1, mmSize + 2, mmSize + 2);

      for (let my = 0; my < MAP_H; my++) {
        for (let mx = 0; mx < MAP_W; mx++) {
          if (WORLD_MAP[my][mx] > 0) {
            const wt = WORLD_MAP[my][mx];
            const c = WALL_COLORS[wt] || WALL_COLORS[1];
            ctx.fillStyle = c.ns;
            ctx.fillRect(mmX + mx * mmScale, mmY + my * mmScale, mmScale, mmScale);
          }
        }
      }

      // Player dot
      ctx.fillStyle = '#0f0';
      ctx.fillRect(mmX + p.x * mmScale - 1, mmY + p.y * mmScale - 1, 3, 3);

      // Direction line
      ctx.strokeStyle = '#0f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mmX + p.x * mmScale, mmY + p.y * mmScale);
      ctx.lineTo(mmX + (p.x + p.dirX * 2) * mmScale, mmY + (p.y + p.dirY * 2) * mmScale);
      ctx.stroke();

      // ── Scale to display canvas ────────────────────────────────────
      displayCtx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);

      animFrameRef.current = requestAnimationFrame(frame);
    }

    lastTimeRef.current = performance.now();
    animFrameRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('click', onClick);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('mousemove', onMouseMove);
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock();
      }
    };
  }, [getTextures]);

  // ── Resize canvas to fill screen ───────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function resize() {
      const ratio = SCREEN_W / SCREEN_H;
      let w = window.innerWidth;
      let h = window.innerHeight;
      if (w / h > ratio) {
        w = h * ratio;
      } else {
        h = w / ratio;
      }
      canvas!.width = Math.floor(w);
      canvas!.height = Math.floor(h);
      canvas!.style.width = `${Math.floor(w)}px`;
      canvas!.style.height = `${Math.floor(h)}px`;
      const ctx = canvas!.getContext('2d');
      if (ctx) ctx.imageSmoothingEnabled = false;
    }
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  return (
    <div style={{
      background: '#000',
      color: '#ccc',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      fontFamily: "'Courier New', monospace",
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        padding: '8px 16px',
        boxSizing: 'border-box',
        background: 'rgba(20,0,0,0.9)',
        borderBottom: '2px solid #8B0000',
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="#/" style={{
            color: '#888',
            textDecoration: 'none',
            fontSize: 13,
          }}>
            ← back to simulator
          </a>
          <span style={{
            color: '#ff2222',
            fontWeight: 'bold',
            fontSize: 24,
            letterSpacing: 4,
            textShadow: '0 0 10px #ff0000, 0 0 20px #880000',
          }}>
            DOOM
          </span>
          <span style={{ color: '#666', fontSize: 11 }}>
            running on a CPU we built from scratch
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => setShowSource(s => !s)}
            style={{
              background: showSource ? '#8B0000' : '#222',
              color: showSource ? '#fff' : '#aaa',
              border: '1px solid #555',
              padding: '4px 10px',
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: 'monospace',
            }}
          >
            {showSource ? 'hide' : 'show'} EmberC source
          </button>
          <span style={{
            background: '#1a1a2e',
            color: '#6a6aff',
            border: '1px solid #333',
            padding: '3px 8px',
            fontSize: 10,
            borderRadius: 3,
          }}>
            Powered by EmberC → Ember 32-bit CPU
          </span>
        </div>
      </div>

      {/* Main area */}
      <div style={{
        display: 'flex',
        flex: 1,
        width: '100%',
        position: 'relative',
      }}>
        {/* Game canvas */}
        <div style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          background: '#000',
          cursor: 'crosshair',
        }}>
          <canvas
            ref={canvasRef}
            style={{ imageRendering: 'pixelated' }}
          />
        </div>

        {/* Source panel */}
        {showSource && (
          <div style={{
            width: 400,
            background: '#0d0d0d',
            borderLeft: '2px solid #333',
            overflow: 'auto',
            padding: 16,
            fontSize: 11,
            lineHeight: 1.5,
          }}>
            <div style={{
              color: '#ff6666',
              fontWeight: 'bold',
              marginBottom: 8,
              fontSize: 13,
            }}>
              EmberC — Raycaster Source
            </div>
            <pre style={{
              color: '#88cc88',
              margin: 0,
              whiteSpace: 'pre-wrap',
              fontFamily: "'Courier New', monospace",
              fontSize: 10,
            }}>
              {EMBERC_SOURCE}
            </pre>
          </div>
        )}
      </div>

      {/* Help overlay */}
      {showHelp && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(0,0,0,0.92)',
          border: '2px solid #8B0000',
          padding: 24,
          zIndex: 100,
          minWidth: 300,
        }}>
          <div style={{ color: '#ff2222', fontWeight: 'bold', fontSize: 16, marginBottom: 12 }}>
            CONTROLS
          </div>
          <div style={{ color: '#aaa', fontSize: 13, lineHeight: 2 }}>
            <div><span style={{ color: '#fff' }}>W/S</span> — move forward/back</div>
            <div><span style={{ color: '#fff' }}>A/D</span> — strafe left/right</div>
            <div><span style={{ color: '#fff' }}>← →</span> — turn left/right</div>
            <div><span style={{ color: '#fff' }}>Mouse</span> — look (click to lock)</div>
            <div><span style={{ color: '#fff' }}>H</span> — toggle this help</div>
            <div><span style={{ color: '#fff' }}>ESC</span> — release mouse</div>
          </div>
          <div style={{ color: '#666', fontSize: 11, marginTop: 12 }}>
            Click the game to capture mouse for smooth look.
          </div>
        </div>
      )}

      {/* Press H hint */}
      <div style={{
        position: 'fixed',
        bottom: 8,
        left: 8,
        color: '#444',
        fontSize: 11,
        zIndex: 10,
      }}>
        Press H for controls
      </div>
    </div>
  );
}
