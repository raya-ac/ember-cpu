import type { CpuState } from '@/cpu/cpu';

interface Props {
  cpu: CpuState;
}

const REG_NAMES = ['R0 (zero)', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7 (sp/ra)'];

export function RegisterPanel({ cpu }: Props) {
  return (
    <div className="p-3 space-y-3">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Registers</h3>

      <div className="space-y-1">
        {cpu.registers.values.map((val, i) => {
          const isWritten = cpu.lastRegWriteIdx === i && cpu.cycle > 0;
          return (
            <div
              key={i}
              className={`flex items-center justify-between font-mono text-sm px-2 py-0.5 rounded transition-colors ${
                isWritten ? 'bg-green-500/15 text-green-400' : ''
              }`}
            >
              <span className="text-muted-foreground text-xs w-20">{REG_NAMES[i]}</span>
              <div className="flex gap-3 items-center">
                <span className="text-xs text-muted-foreground">{val}</span>
                <span className="w-12 text-right">0x{val.toString(16).padStart(8, '0')}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* PC and flags */}
      <div className="border-t border-border pt-2 space-y-1">
        <div className="flex items-center justify-between font-mono text-sm px-2">
          <span className="text-muted-foreground text-xs w-20">PC</span>
          <span>0x{cpu.pc.toString(16).padStart(8, '0')}</span>
        </div>
        <div className="flex items-center justify-between font-mono text-sm px-2">
          <span className="text-muted-foreground text-xs w-20">Cycle</span>
          <span>{cpu.cycle}</span>
        </div>
      </div>

      {/* Flags */}
      <div className="border-t border-border pt-2">
        <div className="flex gap-2 px-2">
          {(['zero', 'negative', 'carry', 'overflow'] as const).map(flag => (
            <div
              key={flag}
              className={`px-2 py-0.5 rounded text-xs font-mono ${
                cpu.flags[flag]
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {flag[0].toUpperCase()}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
