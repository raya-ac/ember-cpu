import { useEffect, useRef, useState, useCallback } from 'react';
import { createFastCpu, loadProgramFast, type FastCpuState, FRAMEBUFFER } from '@/cpu/fastcpu';
import { EmberJIT } from '@/cpu/jit';
import { assemble } from '@/cpu/assembler';

const SCREEN_W = 320;
const SCREEN_H = 200;
const SCALE = 3;

// Memory layout for DOOM framebuffer staging
const STAGING_BASE = 0x180000;   // DOOM writes pixels here (packed 4 per word)
const STAGING_SIGNAL = 0x180400; // Write 1 = new frame available

// Ember CPU display controller program
// Waits for frame signal, copies staging → framebuffer, signals frame ready
const DISPLAY_ASM = `
LUI R7, 0x80

main_loop:
  LUI R1, 0x180
  ORI R1, R1, 0x400
  LW  R2, R1, 0
  BEQ R2, R0, main_loop
  SW  R0, R1, 0

  LUI R3, 0x180
  LUI R4, 0x100
  LI  R5, 16000

copy_loop:
  LW  R1, R3, 0
  SW  R1, R4, 0
  ADDI R3, R3, 1
  ADDI R4, R4, 1
  ADDI R5, R5, -1
  BNE R5, R0, copy_loop

  LUI R1, 0x110
  ORI R1, R1, 0x400
  LI  R2, 1
  SW  R2, R1, 0

  JMP main_loop
`;

function toDoomKey(key: string): number {
  const map: Record<string, number> = {
    ArrowUp: 0xAD, ArrowDown: 0xAF, ArrowLeft: 0xAC, ArrowRight: 0xAE,
    w: 0xAD, s: 0xAF, a: 0xA0, d: 0xA1,  // WASD: up/down/strafe left/strafe right
    ' ': 0xA3, e: 0xA2,                     // Space=fire, E=use
    Control: 0xA3, Shift: 0xB6, Alt: 0xB8,
    Enter: 0x0D, Escape: 0x1B, '=': 0x3D, '+': 0x3D, '-': 0x2D,
    Tab: 0x09,
  };
  if (map[key]) return map[key];
  if (key.length === 1 && !map[key.toLowerCase()]) return key.toLowerCase().charCodeAt(0);
  return map[key.toLowerCase()] || 0;
}

export function DoomRealGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const cpuRef = useRef<FastCpuState | null>(null);
  const jitRef = useRef<EmberJIT | null>(null);
  const rafRef = useRef<number>(0);
  const [running, setRunning] = useState(false);
  const [fps, setFps] = useState(0);
  const [ips, setIps] = useState(0);
  const [status, setStatus] = useState('Loading DOOM...');
  const doomReady = useRef(false);
  const paletteRef = useRef<Uint32Array>(new Uint32Array(256));

  // Load palette from WAD
  const loadPalette = useCallback(async (cpu: FastCpuState) => {
    try {
      const resp = await fetch('/DOOM1.WAD');
      const buf = await resp.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const view = new DataView(buf);
      const numLumps = view.getInt32(4, true);
      const dirOfs = view.getInt32(8, true);
      const pal = new Uint32Array(256);

      for (let i = 0; i < numLumps; i++) {
        const ofs = dirOfs + i * 16;
        let name = '';
        for (let j = 0; j < 8; j++) {
          const ch = bytes[ofs + 8 + j];
          if (ch === 0) break;
          name += String.fromCharCode(ch);
        }
        if (name === 'PLAYPAL') {
          const palOfs = view.getInt32(ofs, true);
          for (let c = 0; c < 256; c++) {
            const r = bytes[palOfs + c * 3];
            const g = bytes[palOfs + c * 3 + 1];
            const b = bytes[palOfs + c * 3 + 2];
            pal[c] = (255 << 24) | (b << 16) | (g << 8) | r;
            cpu.dmem[FRAMEBUFFER.PALETTE_BASE + c] = (r | (g << 8) | (b << 16)) >>> 0;
          }
          break;
        }
      }
      paletteRef.current = pal;
    } catch (e) {
      console.error('Failed to load palette:', e);
    }
  }, []);

  // Initialize
  useEffect(() => {
    const cpu = createFastCpu();
    const result = assemble(DISPLAY_ASM);
    if (!result.success) {
      setStatus(`ASM error: ${result.errors[0]?.message}`);
      return;
    }
    loadProgramFast(cpu, result.program);
    cpuRef.current = cpu;
    jitRef.current = new EmberJIT();

    loadPalette(cpu);

    // Listen for messages from DOOM iframe
    const onMessage = (e: MessageEvent) => {
      if (e.data.type === 'ready') {
        doomReady.current = true;
        setStatus('DOOM running on Ember CPU');
        setRunning(true);
      } else if (e.data.type === 'frame') {
        // Copy 8-bit indexed pixels into CPU staging memory
        const pixels = new Uint8Array(e.data.pixels);
        const dmem = cpu.dmem;
        for (let i = 0; i < pixels.length; i += 4) {
          dmem[STAGING_BASE + (i >>> 2)] =
            (pixels[i] | (pixels[i+1] << 8) | (pixels[i+2] << 16) | (pixels[i+3] << 24)) >>> 0;
        }
        dmem[STAGING_SIGNAL] = 1;
      } else if (e.data.type === 'log') {
        console.log('[DOOM]', e.data.text);
      } else if (e.data.type === 'err') {
        console.error('[DOOM]', e.data.text);
      }
    };
    window.addEventListener('message', onMessage);

    return () => {
      window.removeEventListener('message', onMessage);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [loadPalette]);

  // Render loop
  useEffect(() => {
    if (!running) return;

    let frameCount = 0;
    let instrCount = 0;
    let lastFps = performance.now();

    const tick = () => {
      const cpu = cpuRef.current;
      const jit = jitRef.current;
      if (!cpu || !jit) { rafRef.current = requestAnimationFrame(tick); return; }

      // DOOM runs its own tick loop via emscripten_set_main_loop in the iframe.
      // It posts frame data to us via postMessage → onMessage writes to CPU staging memory.

      // Run Ember CPU display controller
      cpu.frameReady = false;
      const before = cpu.cycle;
      jit.run(cpu, 2_000_000);
      instrCount += cpu.cycle - before;

      if (cpu.frameReady) {
        // Render framebuffer to canvas
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const img = ctx.createImageData(SCREEN_W, SCREEN_H);
            const px = new Uint32Array(img.data.buffer);
            const pal = paletteRef.current;
            const dmem = cpu.dmem;
            const base = FRAMEBUFFER.BASE;
            for (let i = 0; i < SCREEN_W * SCREEN_H; i++) {
              px[i] = pal[(dmem[base + (i >>> 2)] >>> ((i & 3) * 8)) & 0xFF];
            }
            ctx.putImageData(img, 0, 0);
          }
        }
        frameCount++;
      }

      const now = performance.now();
      if (now - lastFps >= 1000) {
        setFps(frameCount);
        setIps(instrCount);
        frameCount = 0;
        instrCount = 0;
        lastFps = now;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [running]);

  // Keyboard → DOOM iframe
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const dk = toDoomKey(e.key);
      if (dk && iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ type: 'key', pressed: 1, key: dk }, '*');
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Tab'].includes(e.key)) e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      const dk = toDoomKey(e.key);
      if (dk && iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ type: 'key', pressed: 0, key: dk }, '*');
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  return (
    <div style={{
      background: '#000', minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', color: '#fff',
    }}>
      <div style={{ marginBottom: 16, textAlign: 'center' }}>
        <h1 style={{ fontSize: 28, color: '#ff4444', margin: '0 0 4px 0', letterSpacing: 4 }}>DOOM</h1>
        <div style={{ fontSize: 12, color: '#666' }}>
          Running on Ember 32-bit CPU &bull; Every pixel through the CPU framebuffer
        </div>
      </div>

      <div style={{ fontSize: 13, color: '#888', marginBottom: 8 }}>{status}</div>

      <canvas
        ref={canvasRef}
        width={SCREEN_W}
        height={SCREEN_H}
        style={{
          width: SCREEN_W * SCALE, height: SCREEN_H * SCALE,
          imageRendering: 'pixelated', border: '2px solid #333', borderRadius: 4,
        }}
        tabIndex={0}
        onClick={() => canvasRef.current?.focus()}
      />

      <div style={{ marginTop: 12, display: 'flex', gap: 24, fontSize: 13, color: '#888' }}>
        <span>{fps} FPS</span>
        <span>{(ips / 1_000_000).toFixed(1)}M IPS</span>
      </div>

      <div style={{ marginTop: 8, fontSize: 11, color: '#555' }}>
        WASD = move &bull; Arrows = turn &bull; Space = fire &bull; E = use/open &bull; Shift = run
      </div>

      {/* Hidden iframe running DOOM WASM */}
      <iframe
        ref={iframeRef}
        src="/doom-frame.html"
        style={{ width: 0, height: 0, border: 'none', position: 'absolute', left: -9999 }}
      />
    </div>
  );
}
