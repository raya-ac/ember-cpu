import { useEffect, useRef, useState, useCallback } from 'react';
import { parseWad, loadLevel, loadPalette, loadColormap, loadFlats, loadWallTextures, type WadFile, type DoomLevel, type Flat, type WallTexture } from './wad';
import { renderFrame, type RenderState, type FramebufferWriter, type TextureSet } from './doom-renderer';

const SCREEN_W = 320;
const SCREEN_H = 200;
const SCALE = 3;
const MOVE_SPEED = 8;
const TURN_SPEED = 3;
const EYE_HEIGHT = 41;

// Simple bitmap font for HUD numbers (3x5 pixel digits)
const DIGITS: Record<string, number[]> = {
  '0': [0b111, 0b101, 0b101, 0b101, 0b111],
  '1': [0b010, 0b110, 0b010, 0b010, 0b111],
  '2': [0b111, 0b001, 0b111, 0b100, 0b111],
  '3': [0b111, 0b001, 0b111, 0b001, 0b111],
  '4': [0b101, 0b101, 0b111, 0b001, 0b001],
  '5': [0b111, 0b100, 0b111, 0b001, 0b111],
  '6': [0b111, 0b100, 0b111, 0b101, 0b111],
  '7': [0b111, 0b001, 0b010, 0b010, 0b010],
  '8': [0b111, 0b101, 0b111, 0b101, 0b111],
  '9': [0b111, 0b101, 0b111, 0b001, 0b111],
  '%': [0b101, 0b001, 0b010, 0b100, 0b101],
};

function drawChar(fb: Uint8Array, w: number, cx: number, cy: number, ch: string, color: number, scale: number) {
  const glyph = DIGITS[ch];
  if (!glyph) return;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      if (glyph[row] & (4 >> col)) {
        for (let sy = 0; sy < scale; sy++)
          for (let sx = 0; sx < scale; sx++) {
            const px = cx + col * scale + sx;
            const py = cy + row * scale + sy;
            if (px >= 0 && px < w && py >= 0 && py < 200)
              fb[py * w + px] = color;
          }
      }
    }
  }
}

function drawString(fb: Uint8Array, w: number, x: number, y: number, str: string, color: number, scale: number) {
  for (let i = 0; i < str.length; i++) {
    drawChar(fb, w, x + i * (3 * scale + scale), y, str[i], color, scale);
  }
}

function drawHUD(fb: Uint8Array, w: number, h: number) {
  const barY = h - 32;
  const barH = 32;

  // Dark gray background
  for (let y = barY; y < h; y++)
    for (let x = 0; x < w; x++)
      fb[y * w + x] = 0;  // black

  // Gray bar background
  for (let y = barY + 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++)
      fb[y * w + x] = 100;  // dark gray

  // Divider lines
  for (let y = barY; y < h; y++) {
    fb[y * w + 0] = 108;
    fb[y * w + w - 1] = 108;
    fb[y * w + 64] = 108;
    fb[y * w + 128] = 108;
    fb[y * w + 192] = 108;
    fb[y * w + 256] = 108;
  }
  for (let x = 0; x < w; x++) {
    fb[barY * w + x] = 108;
  }

  // AMMO
  drawString(fb, w, 6, barY + 4, '50', 176, 2);  // red number
  // Labels
  drawString(fb, w, 4, barY + 20, 'AMMO', 96, 1);

  // HEALTH
  drawString(fb, w, 70, barY + 4, '100%', 176, 2);
  drawString(fb, w, 68, barY + 20, 'HEALTH', 96, 1);

  // ARMS area (simplified)
  drawString(fb, w, 134, barY + 4, 'ARMS', 176, 1);
  drawString(fb, w, 134, barY + 14, '1234', 96, 1);
  drawString(fb, w, 134, barY + 22, '567', 96, 1);

  // Face placeholder — just a yellow square
  const faceX = 198, faceY = barY + 3, faceS = 26;
  for (let y = faceY; y < faceY + faceS; y++)
    for (let x = faceX; x < faceX + faceS; x++)
      fb[y * w + x] = 231;  // yellow-ish

  // Eyes
  fb[(faceY + 8) * w + faceX + 8] = 0;
  fb[(faceY + 8) * w + faceX + 9] = 0;
  fb[(faceY + 8) * w + faceX + 17] = 0;
  fb[(faceY + 8) * w + faceX + 18] = 0;
  // Mouth
  for (let x = faceX + 9; x < faceX + 18; x++)
    fb[(faceY + 18) * w + x] = 0;

  // ARMOR
  drawString(fb, w, 262, barY + 4, '0%', 96, 2);
  drawString(fb, w, 260, barY + 20, 'ARMOR', 96, 1);
}

export function DoomRealGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const [running, setRunning] = useState(false);
  const [fps, setFps] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [levelName, setLevelName] = useState('E1M1');

  const wadRef = useRef<WadFile | null>(null);
  const levelRef = useRef<DoomLevel | null>(null);
  const paletteRef = useRef<Uint32Array | null>(null);
  const colormapRef = useRef<Uint8Array | null>(null);
  const flatsRef = useRef<Map<string, Flat>>(new Map());
  const wallTexRef = useRef<Map<string, WallTexture>>(new Map());
  const keysRef = useRef<Set<string>>(new Set());

  // Player state
  const stateRef = useRef<RenderState>({
    viewX: 0,
    viewY: 0,
    viewAngle: 0,
    viewZ: EYE_HEIGHT,
  });

  // Framebuffer — 320x200 indexed color
  const fbRef = useRef(new Uint8Array(SCREEN_W * SCREEN_H));

  // Load WAD file
  const loadWad = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/DOOM1.WAD');
      if (!response.ok) throw new Error(`Failed to fetch WAD: ${response.status}`);
      const buffer = await response.arrayBuffer();
      const wad = parseWad(buffer);
      wadRef.current = wad;

      const pal = loadPalette(wad);
      paletteRef.current = pal;

      const cmap = loadColormap(wad);
      colormapRef.current = cmap;

      flatsRef.current = loadFlats(wad);
      wallTexRef.current = loadWallTextures(wad);
      console.log(`Loaded ${flatsRef.current.size} flats, ${wallTexRef.current.size} wall textures`);

      // Load initial level
      loadLevelData(wad, levelName);
      setLoading(false);
      setRunning(true);
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  }, [levelName]);

  const loadLevelData = useCallback((wad: WadFile, name: string) => {
    const level = loadLevel(wad, name);
    levelRef.current = level;

    // Find player start (thing type 1)
    const playerStart = level.things.find(t => t.type === 1);
    if (playerStart) {
      stateRef.current = {
        viewX: playerStart.x,
        viewY: playerStart.y,
        viewAngle: playerStart.angle,
        viewZ: EYE_HEIGHT + (level.sectors[0]?.floorHeight ?? 0),
      };
    }
  }, []);

  // Render framebuffer to canvas
  const renderToCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const pal = paletteRef.current;
    if (!canvas || !pal) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageData = ctx.createImageData(SCREEN_W, SCREEN_H);
    const pixels = new Uint32Array(imageData.data.buffer);
    const fb = fbRef.current;

    for (let i = 0; i < SCREEN_W * SCREEN_H; i++) {
      pixels[i] = pal[fb[i]];
    }

    ctx.putImageData(imageData, 0, 0);
  }, []);

  // Handle input
  const handleInput = useCallback(() => {
    const keys = keysRef.current;
    const state = stateRef.current;
    const level = levelRef.current;
    if (!level) return;

    const rad = (state.viewAngle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    let dx = 0, dy = 0;
    if (keys.has('w') || keys.has('ArrowUp')) { dx += cos * MOVE_SPEED; dy += sin * MOVE_SPEED; }
    if (keys.has('s') || keys.has('ArrowDown')) { dx -= cos * MOVE_SPEED; dy -= sin * MOVE_SPEED; }
    if (keys.has('a')) { dx += sin * MOVE_SPEED; dy -= cos * MOVE_SPEED; }
    if (keys.has('d')) { dx -= sin * MOVE_SPEED; dy += cos * MOVE_SPEED; }
    if (keys.has('ArrowLeft')) state.viewAngle = (state.viewAngle + TURN_SPEED) % 360;
    if (keys.has('ArrowRight')) state.viewAngle = (state.viewAngle - TURN_SPEED + 360) % 360;

    // Simple collision — just move and don't worry about walls for now
    state.viewX += dx;
    state.viewY += dy;
  }, []);

  // Main game loop
  useEffect(() => {
    if (!running) return;

    let frameCount = 0;
    let lastFpsTime = performance.now();

    const tick = () => {
      const level = levelRef.current;
      const cmap = colormapRef.current;
      if (!level || !cmap) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Handle input
      handleInput();

      // Clear framebuffer
      fbRef.current.fill(0);

      // Create framebuffer writer
      const fb = fbRef.current;
      const writer: FramebufferWriter = {
        setPixel(x: number, y: number, colorIndex: number) {
          if (x >= 0 && x < SCREEN_W && y >= 0 && y < SCREEN_H) {
            fb[y * SCREEN_W + x] = colorIndex;
          }
        },
      };

      // Render the 3D view
      const texSet: TextureSet = {
        walls: wallTexRef.current,
        flats: flatsRef.current,
      };
      renderFrame(level, stateRef.current, writer, cmap, texSet);

      // Draw DOOM status bar HUD (bottom 32 pixels)
      drawHUD(fb, SCREEN_W, SCREEN_H);

      // Blit to canvas
      renderToCanvas();

      frameCount++;
      const now = performance.now();
      if (now - lastFpsTime >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastFpsTime = now;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [running, handleInput, renderToCanvas]);

  // Keyboard handlers
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Auto-load WAD
  useEffect(() => { loadWad(); }, [loadWad]);

  return (
    <div style={{
      background: '#000',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'monospace',
      color: '#fff',
    }}>
      <div style={{ marginBottom: 16, textAlign: 'center' }}>
        <h1 style={{ fontSize: 28, color: '#ff4444', margin: '0 0 4px 0', letterSpacing: 4 }}>
          DOOM
        </h1>
        <div style={{ fontSize: 12, color: '#666' }}>
          {levelName} • BSP renderer • DOOM1.WAD • WASD + Arrow keys
        </div>
      </div>

      {loading && (
        <div style={{ color: '#888', fontSize: 14, marginBottom: 16 }}>
          Loading DOOM1.WAD...
        </div>
      )}

      {error && (
        <pre style={{
          background: '#1a0000',
          color: '#ff4444',
          padding: 16,
          borderRadius: 8,
          maxWidth: 600,
          overflow: 'auto',
          fontSize: 12,
        }}>
          {error}
        </pre>
      )}

      <canvas
        ref={canvasRef}
        width={SCREEN_W}
        height={SCREEN_H}
        style={{
          width: SCREEN_W * SCALE,
          height: SCREEN_H * SCALE,
          imageRendering: 'pixelated',
          border: '2px solid #333',
          borderRadius: 4,
        }}
        tabIndex={0}
      />

      <div style={{
        marginTop: 12,
        display: 'flex',
        gap: 24,
        fontSize: 13,
        color: '#888',
      }}>
        <span>{fps} FPS</span>
        <span>{levelName}</span>
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button
          onClick={() => setRunning(r => !r)}
          style={{
            background: running ? '#441111' : '#114411',
            color: '#fff',
            border: '1px solid #444',
            padding: '6px 16px',
            borderRadius: 4,
            cursor: 'pointer',
            fontFamily: 'monospace',
          }}
        >
          {running ? 'Pause' : 'Resume'}
        </button>
      </div>

      <div style={{
        marginTop: 24,
        fontSize: 11,
        color: '#444',
        textAlign: 'center',
        maxWidth: 500,
      }}>
        BSP renderer reading real DOOM WAD data.
        E1M1 from DOOM1.WAD shareware.
      </div>
    </div>
  );
}
