import { useEffect, useRef } from 'react';
import type { CpuState } from '@/cpu/cpu';
import { memRead } from '@/cpu/memory';

interface Props {
  cpu: CpuState;
  programName: string;
}

export function OutputPanel({ cpu, programName }: Props) {
  // Route to the right visual renderer based on program
  const renderer = RENDERERS[programName] ?? GenericRenderer;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Output</h3>
        {cpu.halted && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">HALTED</span>
        )}
        {!cpu.halted && cpu.cycle > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">CYCLE {cpu.cycle}</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {renderer({ cpu })}
      </div>

      {/* Final register summary */}
      {cpu.halted && (
        <div className="border-t border-border p-3">
          <div className="text-xs text-muted-foreground mb-1">Final state ({cpu.cycle} cycles):</div>
          <div className="font-mono text-xs flex flex-wrap gap-x-3 gap-y-0.5">
            {cpu.registers.values.map((val, i) =>
              val !== 0 && (
                <span key={i}>
                  <span className="text-muted-foreground">R{i}=</span>
                  <span className="text-amber-400">{val}</span>
                </span>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// === Visual renderers per program ===

function CountRenderer({ cpu }: { cpu: CpuState }) {
  const current = memRead(cpu.dmem, 0);
  const limit = cpu.registers.values[2] || 10;

  return (
    <div className="space-y-4">
      {/* Big counter display */}
      <div className="flex flex-col items-center py-4">
        <div className="text-6xl font-bold font-mono text-amber-400 tabular-nums">
          {current}
        </div>
        <div className="text-sm text-muted-foreground mt-2">/ {limit}</div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
        <div
          className="h-full bg-amber-500 rounded-full transition-all duration-150"
          style={{ width: `${(current / limit) * 100}%` }}
        />
      </div>

      {/* Step indicator */}
      <div className="flex justify-between text-xs text-muted-foreground font-mono">
        <span>0</span>
        <span>{limit}</span>
      </div>
    </div>
  );
}

function FibonacciRenderer({ cpu }: { cpu: CpuState }) {
  const values: number[] = [];
  for (let i = 0; i < 10; i++) {
    values.push(memRead(cpu.dmem, i));
  }
  const maxVal = Math.max(...values, 1);

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">Fibonacci sequence in memory:</div>

      {/* Bar chart */}
      <div className="flex items-end gap-1 h-32">
        {values.map((val, i) => {
          const height = maxVal > 0 ? (val / maxVal) * 100 : 0;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] font-mono text-amber-400">{val || ''}</span>
              <div
                className="w-full rounded-t bg-amber-500/60 transition-all duration-150"
                style={{ height: `${Math.max(height, 2)}%` }}
              />
              <span className="text-[10px] font-mono text-muted-foreground">F({i})</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MultiplyRenderer({ cpu }: { cpu: CpuState }) {
  const result = memRead(cpu.dmem, 0);
  // Original values were 13 * 7
  const a = 13, b = 7;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-3 py-4 font-mono">
        <span className="text-3xl text-cyan-400">{a}</span>
        <span className="text-2xl text-muted-foreground">×</span>
        <span className="text-3xl text-cyan-400">{b}</span>
        <span className="text-2xl text-muted-foreground">=</span>
        <span className="text-4xl font-bold text-amber-400">{result}</span>
      </div>

      {/* Show the shift-and-add steps in binary */}
      <div className="text-xs text-muted-foreground">Shift-and-add algorithm (binary):</div>
      <div className="font-mono text-xs space-y-0.5">
        <div className="text-cyan-400">  {a.toString(2).padStart(8, '0')} ({a})</div>
        <div className="text-cyan-400">× {b.toString(2).padStart(8, '0')} ({b})</div>
        <div className="text-muted-foreground">{'─'.repeat(18)}</div>
        <div className="text-amber-400">= {result.toString(2).padStart(8, '0')} ({result})</div>
      </div>
    </div>
  );
}

function BubbleSortRenderer({ cpu }: { cpu: CpuState }) {
  const values: number[] = [];
  for (let i = 0; i < 5; i++) {
    values.push(memRead(cpu.dmem, i));
  }
  const maxVal = Math.max(...values, 1);
  const sorted = [...values].every((v, i, a) => i === 0 || a[i - 1] <= v);

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Sorting [5, 3, 8, 1, 4] → {sorted ? 'sorted!' : 'sorting...'}
      </div>

      {/* Bar chart */}
      <div className="flex items-end gap-2 h-40">
        {values.map((val, i) => {
          const height = maxVal > 0 ? (val / maxVal) * 100 : 0;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-sm font-mono font-bold text-amber-400">{val}</span>
              <div
                className={`w-full rounded-t transition-all duration-150 ${
                  sorted ? 'bg-green-500/60' : 'bg-amber-500/60'
                }`}
                style={{ height: `${Math.max(height, 5)}%` }}
              />
              <span className="text-[10px] font-mono text-muted-foreground">[{i}]</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SnakeRenderer({ cpu }: { cpu: CpuState }) {
  // Read 16-cell grid from memory
  const grid: number[] = [];
  for (let i = 0; i < 16; i++) {
    grid.push(memRead(cpu.dmem, i));
  }
  const headPos = cpu.registers.values[1]; // R1 = head

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        16-cell grid — snake (3 cells) moving right, wrapping around
      </div>

      {/* Grid display — 4x4 */}
      <div className="grid grid-cols-4 gap-1.5 max-w-48 mx-auto">
        {grid.map((cell, i) => (
          <div
            key={i}
            className={`aspect-square rounded flex items-center justify-center text-xs font-mono font-bold transition-all duration-150 ${
              cell > 0
                ? i === headPos
                  ? 'bg-green-500 text-green-950'
                  : 'bg-green-500/60 text-green-300'
                : 'bg-muted text-muted-foreground/30'
            }`}
          >
            {cell > 0 ? (i === headPos ? '●' : '■') : i}
          </div>
        ))}
      </div>

      {/* Linear strip view */}
      <div className="flex gap-0.5">
        {grid.map((cell, i) => (
          <div
            key={i}
            className={`flex-1 h-6 rounded-sm transition-all duration-150 ${
              cell > 0
                ? i === headPos
                  ? 'bg-green-500'
                  : 'bg-green-500/50'
                : 'bg-muted'
            }`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
        <span>0</span>
        <span>15</span>
      </div>
    </div>
  );
}

function PrimesRenderer({ cpu }: { cpu: CpuState }) {
  // Read primes from output memory
  const primes: number[] = [];
  for (let i = 0; i < 20; i++) {
    const val = memRead(cpu.dmem, i);
    if (val === 0 && i > 0) break;
    if (val > 0) primes.push(val);
  }

  // Build sieve visualization for 2-19
  const allNums = Array.from({ length: 18 }, (_, i) => i + 2);

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Finding primes &lt; 20 using trial division
      </div>

      {/* Number grid — highlight primes */}
      <div className="grid grid-cols-6 gap-1.5">
        {allNums.map(n => {
          const isPrime = primes.includes(n);
          const checking = !cpu.halted && cpu.registers.values[1] === n;
          return (
            <div
              key={n}
              className={`h-10 rounded flex items-center justify-center text-sm font-mono font-bold transition-all duration-150 ${
                isPrime
                  ? 'bg-amber-500/30 text-amber-400 ring-1 ring-amber-500/50'
                  : checking
                    ? 'bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500/50'
                    : n <= (cpu.registers.values[1] || 1)
                      ? 'bg-muted/50 text-muted-foreground/40 line-through'
                      : 'bg-muted text-muted-foreground/60'
              }`}
            >
              {n}
            </div>
          );
        })}
      </div>

      {/* Prime list */}
      {primes.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Primes found:</span>
          {primes.map((p, i) => (
            <span key={i} className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 text-sm font-mono font-bold">
              {p}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function FunctionCallRenderer({ cpu }: { cpu: CpuState }) {
  const result = memRead(cpu.dmem, 0);

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">Subroutine call: double(5)</div>

      <div className="font-mono text-sm space-y-2 px-2">
        <div className="text-cyan-400">main:</div>
        <div className="pl-4">R1 = 5</div>
        <div className="pl-4">JAL double <span className="text-muted-foreground">→ R7 = return addr</span></div>
        <div className="text-cyan-400 mt-2">double:</div>
        <div className="pl-4">R1 = R1 + R1 = <span className="text-amber-400 font-bold">{result}</span></div>
        <div className="pl-4">JR R7 <span className="text-muted-foreground">→ return to main</span></div>
      </div>

      <div className="text-center py-2">
        <span className="text-xs text-muted-foreground">Result: </span>
        <span className="text-3xl font-bold font-mono text-amber-400">{result}</span>
      </div>
    </div>
  );
}

function GenericRenderer({ cpu }: { cpu: CpuState }) {
  // Show all non-zero data memory
  const entries: { addr: number; val: number }[] = [];
  for (let i = 0; i < 64; i++) {
    const val = memRead(cpu.dmem, i);
    if (val !== 0) entries.push({ addr: i, val });
  }

  if (entries.length === 0 && cpu.cycle === 0) {
    return <div className="text-xs text-muted-foreground italic">Run a program to see output.</div>;
  }

  return (
    <div className="space-y-2">
      {entries.length > 0 && (
        <>
          <div className="text-xs text-muted-foreground">Data memory (non-zero):</div>
          <div className="font-mono text-sm grid grid-cols-2 gap-x-4 gap-y-0.5">
            {entries.map(({ addr, val }) => (
              <div key={addr} className="flex justify-between">
                <span className="text-muted-foreground">MEM[{addr}]</span>
                <span className="text-amber-400">{val}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DrawRenderer({ cpu }: { cpu: CpuState }) {
  // 8x8 grid in MEM[0..63], cursor at MEM[56]=X, MEM[57]=Y
  const grid: number[] = [];
  for (let i = 0; i < 64; i++) {
    grid.push(memRead(cpu.dmem, i));
  }
  // Cursor stored via negative offset: MEM[56] = X, MEM[57] = Y
  // Actually the program stores at MEM[R0 + (-8)] which wraps... let's read from registers
  const cursorX = cpu.registers.values[1];
  const cursorY = cpu.registers.values[2];

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Use <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">↑↓←→</kbd> arrow keys to draw
      </div>

      {/* 8x8 pixel grid */}
      <div className="grid grid-cols-8 gap-0.5 max-w-56 mx-auto">
        {grid.map((cell, i) => {
          const x = i % 8;
          const y = Math.floor(i / 8);
          const isCursor = x === cursorX && y === cursorY;
          return (
            <div
              key={i}
              className={`aspect-square rounded-sm transition-all duration-100 ${
                isCursor
                  ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]'
                  : cell > 0
                    ? 'bg-green-500'
                    : 'bg-muted/60'
              }`}
            />
          );
        })}
      </div>

      <div className="text-center text-xs text-muted-foreground font-mono">
        Cursor: ({cursorX}, {cursorY})
      </div>
    </div>
  );
}

function LifeRenderer({ cpu }: { cpu: CpuState }) {
  // 4x4 grid in MEM[0..15]
  const grid: number[] = [];
  for (let i = 0; i < 16; i++) {
    grid.push(memRead(cpu.dmem, i));
  }
  const gen = cpu.registers.values[3]; // R3 = remaining generations

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Conway's Game of Life — {gen > 0 ? `${8 - gen}/8 generations` : 'complete (8 generations)'}
      </div>

      {/* 4x4 grid */}
      <div className="grid grid-cols-4 gap-2 max-w-40 mx-auto">
        {grid.map((cell, i) => (
          <div
            key={i}
            className={`aspect-square rounded-md transition-all duration-300 ${
              cell > 0
                ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.5)]'
                : 'bg-muted/40'
            }`}
          />
        ))}
      </div>

      {/* Pattern name hint */}
      <div className="text-center text-xs text-muted-foreground">
        {gen === 8 ? 'Blinker (vertical)' : gen === 7 ? 'Blinker (horizontal)' : 'Oscillating...'}
      </div>
    </div>
  );
}

function PongRenderer({ cpu }: { cpu: CpuState }) {
  // 8x8 grid in MEM[0..63]
  // Values: 0=empty, 2=ball, 3=paddle
  const grid: number[] = [];
  for (let i = 0; i < 64; i++) {
    grid.push(memRead(cpu.dmem, i));
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Use <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">↑↓</kbd> to move paddle — keep the ball alive!
      </div>

      {/* 8x8 game grid */}
      <div className="grid grid-cols-8 gap-0.5 max-w-56 mx-auto bg-muted/20 p-1 rounded-lg">
        {grid.map((cell, i) => (
          <div
            key={i}
            className={`aspect-square rounded-sm transition-all duration-75 ${
              cell === 2
                ? 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.7)] rounded-full'
                : cell === 3
                  ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]'
                  : 'bg-muted/30'
            }`}
          />
        ))}
      </div>

      <div className="text-center text-xs text-muted-foreground font-mono">
        Ball: ({cpu.registers.values[1]},{cpu.registers.values[2]}) Paddle: Y={cpu.registers.values[5]}
      </div>
    </div>
  );
}

function TetrisRenderer({ cpu }: { cpu: CpuState }) {
  // 8x10 grid in MEM[0..79], offset by global vars before board
  // Globals: board[80] starts at addr 0, pieces[16] at 80, then pieceX(96), pieceY(97), pieceType(98), score(99), gameOver(100)
  const grid: number[] = [];
  for (let i = 0; i < 80; i++) {
    grid.push(memRead(cpu.dmem, i));
  }
  const score = memRead(cpu.dmem, 99);
  const gameOver = memRead(cpu.dmem, 100);

  const COLORS: Record<number, string> = {
    0: 'bg-muted/20',
    1: 'bg-blue-500 shadow-[0_0_4px_rgba(59,130,246,0.5)]',
    2: 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]',
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Use <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">←→↓</kbd> to move pieces
        </div>
        <div className="text-sm font-mono font-bold text-amber-400">
          Score: {score}
        </div>
      </div>

      {/* 8-wide x 10-tall board */}
      <div className="grid grid-cols-8 gap-px max-w-48 mx-auto bg-border/30 p-px rounded-md overflow-hidden">
        {grid.map((cell, i) => (
          <div
            key={i}
            className={`aspect-square transition-all duration-75 ${COLORS[cell] ?? COLORS[0]}`}
          />
        ))}
      </div>

      {gameOver ? (
        <div className="text-center text-red-400 font-bold text-lg">GAME OVER</div>
      ) : (
        <div className="text-center text-xs text-muted-foreground font-mono">
          {cpu.halted ? 'Game ended' : 'Playing...'}
        </div>
      )}
    </div>
  );
}

const RENDERERS: Record<string, (props: { cpu: CpuState }) => JSX.Element> = {
  'Count to 10': CountRenderer,
  'Fibonacci': FibonacciRenderer,
  'Multiply': MultiplyRenderer,
  'Bubble Sort': BubbleSortRenderer,
  'Snake': SnakeRenderer,
  'Primes': PrimesRenderer,
  'Function Call': FunctionCallRenderer,
  'Draw': DrawRenderer,
  'Draw Pad': DrawRenderer,
  'Life': LifeRenderer,
  'Pong': PongRenderer,
  'Tetris': TetrisRenderer,
};
