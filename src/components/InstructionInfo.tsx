import type { CpuState } from '@/cpu/cpu';
import { memRead } from '@/cpu/memory';
import { decode } from '@/cpu/isa';
import { disassemble } from '@/cpu/assembler';

interface Props {
  cpu: CpuState;
}

export function InstructionInfo({ cpu }: Props) {
  const word = memRead(cpu.imem, cpu.pc);
  const inst = decode(word);
  const disasm = disassemble(word);

  const bits = word.toString(2).padStart(32, '0');
  const opBits = bits.slice(0, 6);
  const rdBits = bits.slice(6, 9);
  const rsBits = bits.slice(9, 12);
  const restBits = bits.slice(12);

  return (
    <div className="p-3 space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Current Instruction</h3>

      {/* Binary breakdown */}
      <div className="font-mono text-sm flex gap-1 items-center">
        <span className="px-1 rounded bg-blue-500/20 text-blue-400" title="Opcode">{opBits}</span>
        <span className="px-1 rounded bg-green-500/20 text-green-400" title="Rd">{rdBits}</span>
        <span className="px-1 rounded bg-amber-500/20 text-amber-400" title="Rs">{rsBits}</span>
        <span className="px-1 rounded bg-purple-500/20 text-purple-400" title={inst.format === 'R' ? 'Rt|Func' : 'Imm'}>
          {restBits}
        </span>
      </div>

      {/* Legend */}
      <div className="flex gap-3 text-xs text-muted-foreground">
        <span><span className="text-blue-400">■</span> opcode</span>
        <span><span className="text-green-400">■</span> rd</span>
        <span><span className="text-amber-400">■</span> rs</span>
        <span><span className="text-purple-400">■</span> {inst.format === 'R' ? 'rt|func' : inst.format === 'I' ? 'imm20' : 'addr26'}</span>
      </div>

      {/* Decoded */}
      <div className="space-y-1 text-sm font-mono">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs w-16">Asm:</span>
          <span className="text-foreground font-semibold">{disasm}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs w-16">Hex:</span>
          <span>0x{word.toString(16).padStart(8, '0')}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs w-16">Format:</span>
          <span>{inst.format}-type</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs w-16">Effect:</span>
          <span className="text-muted-foreground">{inst.description}</span>
        </div>
      </div>

      {/* Control signals (if we have them from last step) */}
      {cpu.lastControl && cpu.cycle > 0 && (
        <div className="border-t border-border pt-2">
          <div className="text-xs text-muted-foreground mb-1">Control Signals (last):</div>
          <div className="flex flex-wrap gap-1">
            {Object.entries(cpu.lastControl).map(([key, val]) => {
              if (typeof val === 'boolean' && val) {
                return (
                  <span key={key} className="px-1.5 py-0.5 text-xs rounded bg-cyan-500/15 text-cyan-400 font-mono">
                    {key}
                  </span>
                );
              }
              return null;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
