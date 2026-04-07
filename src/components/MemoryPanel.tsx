import { useState } from 'react';
import type { Memory } from '@/cpu/memory';
import { memRead } from '@/cpu/memory';

interface Props {
  memory: Memory;
  label: string;
  highlightAddr?: number;
  highlightWrite?: boolean;
  pc?: number; // for instruction memory, highlight PC
}

export function MemoryPanel({ memory, label, highlightAddr = -1, highlightWrite = false, pc = -1 }: Props) {
  const [page, setPage] = useState(0);
  const ROWS = 16;
  const COLS = 4;
  const pageSize = ROWS * COLS;
  const startAddr = page * pageSize;

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="px-1.5 py-0.5 text-xs rounded bg-muted text-muted-foreground hover:bg-accent disabled:opacity-30"
          >
            ◀
          </button>
          <span className="text-xs text-muted-foreground font-mono">
            0x{startAddr.toString(16).padStart(6, '0')}
          </span>
          <button
            onClick={() => setPage(page + 1)}
            className="px-1.5 py-0.5 text-xs rounded bg-muted text-muted-foreground hover:bg-accent"
          >
            ▶
          </button>
        </div>
      </div>

      <div className="font-mono text-xs">
        {/* Header */}
        <div className="flex text-muted-foreground mb-1">
          <span className="w-12 text-right pr-2">Addr</span>
          {Array.from({ length: COLS }, (_, i) => (
            <span key={i} className="w-14 text-center">+{i}</span>
          ))}
        </div>

        {/* Rows */}
        {Array.from({ length: ROWS }, (_, row) => {
          const rowAddr = startAddr + row * COLS;
          return (
            <div key={row} className="flex items-center">
              <span className="w-12 text-right pr-2 text-muted-foreground">
                {rowAddr.toString(16).padStart(6, '0')}
              </span>
              {Array.from({ length: COLS }, (_, col) => {
                const addr = rowAddr + col;
                const val = memRead(memory, addr);
                const isHighlight = addr === highlightAddr;
                const isPc = addr === pc;
                return (
                  <span
                    key={col}
                    className={`w-14 text-center py-px rounded transition-colors ${
                      isPc
                        ? 'bg-amber-500/20 text-amber-400 font-bold'
                        : isHighlight
                          ? highlightWrite
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-green-500/20 text-green-400'
                          : val !== 0
                            ? 'text-foreground'
                            : 'text-muted-foreground/40'
                    }`}
                  >
                    {val.toString(16).padStart(8, '0')}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
