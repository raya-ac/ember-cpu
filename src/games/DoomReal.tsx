import { useEffect, useRef, useState, useCallback } from 'react';
import { parseWad, loadLevel, loadPalette, loadColormap, type WadFile, type DoomLevel } from './wad';
import { renderFrame, type RenderState, type FramebufferWriter } from './doom-renderer';

const SCREEN_W = 320;
const SCREEN_H = 200;
const SCALE = 3;
const MOVE_SPEED = 8;
const TURN_SPEED = 3;
const EYE_HEIGHT = 41;

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

      // Render the frame
      renderFrame(level, stateRef.current, writer, cmap);

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
