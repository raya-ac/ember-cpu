import { useMemo } from 'react';
import type { CpuState } from '@/cpu/cpu';
import { readReg } from '@/cpu/registers';
import { memRead } from '@/cpu/memory';
import { rippleCarryAdder, rippleCarrySubtractor } from '@/cpu/gates/adder';
import { toBits } from '@/cpu/gates/gate';
import { decode } from '@/cpu/isa';

interface Props {
  cpu: CpuState;
  block: string;
  onClose: () => void;
}

const BLOCK_VIEWS: Record<string, (cpu: CpuState) => JSX.Element> = {
  alu: AluGateView,
  regfile: RegFileGateView,
  pc: PcGateView,
  decoder: DecoderGateView,
  imem: IMemGateView,
  dmem: DMemGateView,
  control: ControlGateView,
  muxAlu: MuxAluGateView,
  muxWb: MuxWbGateView,
};

export function GateView({ cpu, block, onClose }: Props) {
  const ViewComponent = BLOCK_VIEWS[block];
  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50">
        <span className="text-sm font-semibold">Gate-Level: {block.toUpperCase()}</span>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
      </div>
      <div className="p-3 overflow-auto max-h-80">
        {ViewComponent ? <ViewComponent cpu={cpu} /> : (
          <div className="text-sm text-muted-foreground">No gate view for {block}.</div>
        )}
      </div>
    </div>
  );
}

// Helper: render a row of bits with a label
function BitRow({ label, value, width = 32, color = 'amber' }: { label: string; value: number; width?: number; color?: string }) {
  const bits = toBits(value, width);
  const colorMap: Record<string, string> = {
    amber: 'bg-amber-500/20 text-amber-400',
    cyan: 'bg-cyan-500/20 text-cyan-400',
    green: 'bg-green-500/20 text-green-400',
    red: 'bg-red-500/20 text-red-400',
    purple: 'bg-purple-500/20 text-purple-400',
  };
  const activeClass = colorMap[color] ?? colorMap.amber;
  return (
    <div className="flex gap-px items-center font-mono text-xs">
      <span className="w-12 text-muted-foreground shrink-0">{label}</span>
      {bits.map((bit, i) => (
        <span key={i} className={`w-3.5 h-4 flex items-center justify-center rounded-sm text-[9px] ${
          bit ? activeClass : 'bg-muted text-muted-foreground/30'
        }`}>{bit}</span>
      ))}
      <span className="ml-2 text-muted-foreground shrink-0">= {value} (0x{value.toString(16).padStart(width / 4, '0')})</span>
    </div>
  );
}

function AluGateView({ cpu }: { cpu: CpuState }) {
  const inst = cpu.lastInstruction;
  const aluOp = cpu.lastControl?.aluOp ?? 0;
  const opNames = ['ADD', 'SUB', 'AND', 'OR', 'XOR', 'SHL', 'SHR', 'SLT'];

  const a = inst ? readReg(cpu.registers, inst.rs) : 0;
  const b = cpu.lastControl?.aluSrc ? (inst?.simm20 ?? 0) & 0xFFFFFFFF : (inst ? readReg(cpu.registers, inst.rt) : 0);

  const adderResult = useMemo(() => {
    if (aluOp === 1) return rippleCarrySubtractor(a, b);
    return rippleCarryAdder(a, b);
  }, [a, b, aluOp]);

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Operation: <span className="text-amber-400 font-semibold">{opNames[aluOp] ?? '???'}</span> —
        {aluOp <= 1 ? ' ripple-carry adder/subtractor, 32 full adders chained carry-to-carry' :
         aluOp <= 4 ? ' bitwise logic gates, 32 parallel gate pairs' :
         aluOp <= 6 ? ' barrel shifter via cascaded mux layers' :
         ' signed comparator via subtraction + flag check'}
      </div>

      <BitRow label="A:" value={a} color="amber" />
      <BitRow label="B:" value={b} color="cyan" />

      {(aluOp === 0 || aluOp === 1) && (
        <div className="space-y-0.5">
          <div className="text-xs text-muted-foreground mb-1">Full Adder Chain (MSB → LSB):</div>
          <div className="flex flex-wrap gap-1">
            {adderResult.traces.map((trace, i) => {
              const cin = trace.inputs.cin as number;
              const sum = trace.output as number;
              const cout = trace.intermediates?.carry as number;
              return (
                <div key={i} className="flex flex-col items-center border border-border rounded px-1 py-0.5 text-[10px] font-mono">
                  <span className="text-muted-foreground">FA{31 - i}</span>
                  <div className="flex gap-1">
                    <span className={cin ? 'text-red-400' : 'text-muted-foreground/40'}>c{cin}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className={sum ? 'text-green-400' : 'text-muted-foreground/40'}>s{sum}</span>
                    <span className={cout ? 'text-red-400' : 'text-muted-foreground/40'}>c{cout}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <BitRow label="Out:" value={adderResult.value} color="green" />
      <div className="font-mono text-xs text-muted-foreground">
        Flags: Z={cpu.flags.zero ? '1' : '0'} N={cpu.flags.negative ? '1' : '0'} C={cpu.flags.carry ? '1' : '0'} V={cpu.flags.overflow ? '1' : '0'}
      </div>
    </div>
  );
}

function RegFileGateView({ cpu }: { cpu: CpuState }) {
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        8 x 32-bit registers, each built from 32 D flip-flops with write-enable gating.
        Dual read ports (Rs, Rt) + single write port (Rd). R0 hardwired to zero -- write-enable permanently disabled.
      </div>
      <div className="grid grid-cols-2 gap-2 font-mono text-xs">
        {cpu.registers.values.map((val, i) => {
          const bits = toBits(val, 32);
          const isWritten = cpu.lastRegWriteIdx === i;
          const isRs = cpu.lastInstruction?.rs === i;
          const isRt = cpu.lastInstruction?.rt === i;
          return (
            <div key={i} className={`p-1.5 rounded border ${
              isWritten ? 'border-green-500/50 bg-green-500/5' :
              isRs || isRt ? 'border-amber-500/30 bg-amber-500/5' : 'border-border'
            }`}>
              <div className="flex justify-between mb-0.5">
                <span className="text-muted-foreground">
                  R{i}
                  {isRs && <span className="text-amber-400 ml-1">←read</span>}
                  {isWritten && <span className="text-green-400 ml-1">←write</span>}
                </span>
                <span>{val}</span>
              </div>
              <div className="flex gap-px">
                {bits.map((bit, j) => (
                  <div key={j} className={`w-2.5 h-3 flex items-center justify-center text-[8px] rounded-sm ${
                    bit ? 'bg-amber-500/20 text-amber-400' : 'bg-muted text-muted-foreground/30'
                  }`}>{bit}</div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PcGateView({ cpu }: { cpu: CpuState }) {
  const bits = toBits(cpu.pc, 32);
  const prevBits = cpu.cycle > 0 ? toBits(cpu.lastPc, 32) : null;

  const branchTaken = cpu.activePaths.has('branch-taken');
  const jump = cpu.activePaths.has('jump');
  const jumpReg = cpu.activePaths.has('jump-reg');
  const muxSel = jump || jumpReg ? 'jump target' : branchTaken ? 'branch target' : 'PC + 1';

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        32-bit program counter register (32 D flip-flops) fed by 3-input mux:
        PC+1 (sequential) / branch target (PC + offset) / jump target (absolute or register)
      </div>
      <div className="font-mono text-xs space-y-1">
        {prevBits && cpu.cycle > 0 && <BitRow label="Prev PC:" value={cpu.lastPc} color="red" />}
        <BitRow label="Next PC:" value={cpu.pc} color="green" />
        <div className="text-muted-foreground mt-1">
          Mux select: <span className="text-cyan-400">{muxSel}</span>
          {branchTaken && ' — branch condition met, offset applied'}
          {jump && ' — unconditional jump to absolute address'}
          {jumpReg && ' — jump to address in register'}
        </div>
      </div>
    </div>
  );
}

function DecoderGateView({ cpu }: { cpu: CpuState }) {
  const inst = cpu.lastInstruction;
  if (!inst || cpu.cycle === 0) {
    return <div className="text-xs text-muted-foreground">Step once to see decoder output.</div>;
  }

  const bits = toBits(inst.raw, 32);

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        Combinational decoder -- splits 32-bit instruction word into fields via wire routing, then generates
        control signals through AND/OR gate arrays (truth table implementation)
      </div>
      <div className="font-mono text-xs space-y-1">
        <div className="flex gap-px">
          {bits.map((bit, i) => {
            let color = 'bg-muted text-muted-foreground/40';
            if (i < 6) color = bit ? 'bg-blue-500/30 text-blue-400' : 'bg-blue-500/10 text-blue-400/50';
            else if (i < 9) color = bit ? 'bg-green-500/30 text-green-400' : 'bg-green-500/10 text-green-400/50';
            else if (i < 12) color = bit ? 'bg-amber-500/30 text-amber-400' : 'bg-amber-500/10 text-amber-400/50';
            else color = bit ? 'bg-purple-500/30 text-purple-400' : 'bg-purple-500/10 text-purple-400/50';
            return (
              <span key={i} className={`w-4 h-5 flex items-center justify-center rounded-sm text-[10px] ${color}`}>{bit}</span>
            );
          })}
        </div>
        <div className="flex gap-3 text-muted-foreground flex-wrap">
          <span>opcode=<span className="text-blue-400">{inst.opcode} (0x{inst.opcode.toString(16)})</span></span>
          <span>rd=<span className="text-green-400">R{inst.rd}</span></span>
          <span>rs=<span className="text-amber-400">R{inst.rs}</span></span>
          {inst.format === 'R' && (
            <>
              <span>rt=<span className="text-purple-400">R{inst.rt}</span></span>
              <span>func=<span className="text-purple-400">{inst.func} (0b{inst.func.toString(2).padStart(3, '0')})</span></span>
            </>
          )}
          {inst.format === 'I' && (
            <span>imm20=<span className="text-purple-400">{inst.imm20} (signed: {inst.simm20})</span></span>
          )}
          {inst.format === 'J' && (
            <span>addr26=<span className="text-purple-400">0x{inst.addr26.toString(16).padStart(7, '0')}</span></span>
          )}
        </div>
        <div className="text-muted-foreground">
          Format: <span className="text-cyan-400">{inst.format}-type</span> → {inst.mnemonic}
        </div>
      </div>
    </div>
  );
}

function IMemGateView({ cpu }: { cpu: CpuState }) {
  const addr = cpu.pc;
  const word = memRead(cpu.imem, addr);
  const addrBits = toBits(addr, 32);
  const wordBits = toBits(word, 32);

  // Show a window of instructions around PC
  const windowStart = Math.max(0, addr - 2);
  const windowEnd = Math.min(4095, addr + 5);
  const rows: { addr: number; word: number; disasm: string }[] = [];
  for (let a = windowStart; a <= windowEnd; a++) {
    const w = memRead(cpu.imem, a);
    if (w === 0 && a > addr + 2) break;
    const inst = decode(w);
    rows.push({ addr: a, word: w, disasm: `${inst.mnemonic} ${inst.description}` });
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        Read-only instruction memory (ROM). Address input from PC, outputs 32-bit instruction word.
        In hardware: address decoder drives word-line, sense amplifiers read bit-lines.
      </div>
      <div className="space-y-1">
        <BitRow label="Addr in:" value={addr} color="amber" />
        <BitRow label="Data out:" value={word} color="green" />
      </div>
      <div className="border-t border-border pt-2 space-y-0.5">
        <div className="text-xs text-muted-foreground mb-1">Memory window:</div>
        {rows.map(row => (
          <div key={row.addr} className={`flex gap-2 font-mono text-xs px-1 rounded ${
            row.addr === addr ? 'bg-amber-500/10 text-amber-400' : 'text-muted-foreground'
          }`}>
            <span className="w-12 text-right">{row.addr.toString(16).padStart(4, '0')}</span>
            <span className="w-20">{row.word.toString(16).padStart(8, '0')}</span>
            <span className="truncate">{row.disasm}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DMemGateView({ cpu }: { cpu: CpuState }) {
  const isRead = cpu.lastControl?.memRead ?? false;
  const isWrite = cpu.lastControl?.memWrite ?? false;
  const addr = cpu.lastMemAddr;
  const active = isRead || isWrite;

  // Show window around accessed address (or address 0 if nothing accessed)
  const baseAddr = active ? Math.max(0, addr - 2) : 0;
  const rows: { addr: number; val: number }[] = [];
  for (let a = baseAddr; a < baseAddr + 8 && a < 4096; a++) {
    rows.push({ addr: a, val: memRead(cpu.dmem, a) });
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        Read/write data memory (SRAM). Address from ALU output, data in from register file (writes),
        data out to writeback mux (reads). Write-enable gated by control signal.
      </div>
      {active ? (
        <div className="space-y-1">
          <BitRow label="Addr:" value={addr} color="amber" />
          {isRead && <BitRow label="Read:" value={memRead(cpu.dmem, addr)} color="green" />}
          {isWrite && <BitRow label="Write:" value={cpu.lastMemWriteVal} color="red" />}
          <div className="text-xs font-mono text-muted-foreground">
            Mode: <span className={isWrite ? 'text-red-400' : 'text-green-400'}>{isWrite ? 'WRITE' : 'READ'}</span>
            {' '}| WE={isWrite ? '1' : '0'} RE={isRead ? '1' : '0'}
          </div>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground font-mono">No memory access this cycle</div>
      )}
      <div className="border-t border-border pt-2 space-y-0.5">
        <div className="text-xs text-muted-foreground mb-1">Memory window:</div>
        {rows.map(row => (
          <div key={row.addr} className={`flex gap-2 font-mono text-xs px-1 rounded ${
            row.addr === addr && active ? (isWrite ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400') : 'text-muted-foreground'
          }`}>
            <span className="w-12 text-right">{row.addr.toString(16).padStart(4, '0')}</span>
            <span className="w-20">{row.val.toString(16).padStart(8, '0')}</span>
            <span>{row.val !== 0 ? `(${row.val})` : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ControlGateView({ cpu }: { cpu: CpuState }) {
  const ctrl = cpu.lastControl;
  const inst = cpu.lastInstruction;
  if (!ctrl || !inst || cpu.cycle === 0) {
    return <div className="text-xs text-muted-foreground">Step once to see control signals.</div>;
  }

  // Truth table: opcode → signals
  const signals: { name: string; value: boolean | number | string; desc: string }[] = [
    { name: 'regWrite', value: ctrl.regWrite, desc: 'Enable register file write port' },
    { name: 'memRead', value: ctrl.memRead, desc: 'Enable data memory read' },
    { name: 'memWrite', value: ctrl.memWrite, desc: 'Enable data memory write' },
    { name: 'memToReg', value: ctrl.memToReg, desc: 'Writeback mux: memory → register' },
    { name: 'aluSrc', value: ctrl.aluSrc, desc: 'ALU B input: immediate (vs register)' },
    { name: 'branch', value: ctrl.branch, desc: 'Conditional branch enable' },
    { name: 'jump', value: ctrl.jump, desc: 'Unconditional jump' },
    { name: 'jumpReg', value: ctrl.jumpReg, desc: 'Jump to register value' },
    { name: 'link', value: ctrl.link, desc: 'Save return address (JAL)' },
    { name: 'halt', value: ctrl.halt, desc: 'Stop execution' },
    { name: 'aluOp', value: ctrl.aluOp, desc: `ALU operation selector (${['ADD','SUB','AND','OR','XOR','SHL','SHR','SLT'][ctrl.aluOp] ?? '?'})` },
    { name: 'branchType', value: ctrl.branchType, desc: 'Branch comparison type' },
  ];

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        Control unit — combinational logic that decodes the opcode into datapath control signals.
        Implemented as AND/OR gate arrays forming a truth table (one row per opcode).
      </div>
      <div className="text-xs font-mono">
        <span className="text-muted-foreground">Input: opcode = </span>
        <span className="text-blue-400">0x{inst.opcode.toString(16)}</span>
        <span className="text-muted-foreground"> ({inst.mnemonic})</span>
      </div>
      <div className="border-t border-border pt-2 space-y-0.5">
        {signals.map(sig => {
          const isActive = sig.value === true || (typeof sig.value === 'number' && sig.value > 0) || (typeof sig.value === 'string' && sig.value !== 'none');
          return (
            <div key={sig.name} className={`flex items-center gap-2 font-mono text-xs px-1 rounded ${
              isActive ? 'text-cyan-400' : 'text-muted-foreground/50'
            }`}>
              <span className={`w-4 h-4 flex items-center justify-center rounded text-[10px] font-bold ${
                isActive ? 'bg-cyan-500/20 text-cyan-400' : 'bg-muted text-muted-foreground/30'
              }`}>{typeof sig.value === 'boolean' ? (sig.value ? '1' : '0') : String(sig.value)}</span>
              <span className="w-24">{sig.name}</span>
              <span className="text-muted-foreground/70 text-[10px]">{sig.desc}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MuxAluGateView({ cpu }: { cpu: CpuState }) {
  const ctrl = cpu.lastControl;
  const inst = cpu.lastInstruction;
  if (!ctrl || !inst || cpu.cycle === 0) {
    return <div className="text-xs text-muted-foreground">Step once to see mux state.</div>;
  }

  const regVal = readReg(cpu.registers, inst.rt);
  const immVal = ctrl.oriMode ? (inst.imm20 & 0xFFFFF) : inst.simm20 & 0xFFFFFFFF;
  const selected = ctrl.aluSrc;

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        2-to-1 multiplexer -- selects ALU B operand. Built from 32 parallel 2-input mux cells,
        each made of 2 AND gates, 1 OR gate, and 1 NOT gate (4 gates x 32 bits = 128 gates).
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className={`px-1 rounded ${!selected ? 'bg-green-500/20 text-green-400' : 'text-muted-foreground/40'}`}>
            Input 0 (Rt):
          </span>
          <span>R{inst.rt} = 0x{regVal.toString(16).padStart(8, '0')}</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className={`px-1 rounded ${selected ? 'bg-green-500/20 text-green-400' : 'text-muted-foreground/40'}`}>
            Input 1 (Imm):
          </span>
          <span>0x{immVal.toString(16).padStart(8, '0')} ({(immVal & 0x80000000) ? immVal - 0x100000000 : immVal})</span>
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          Sel = aluSrc = <span className="text-cyan-400">{selected ? '1' : '0'}</span> →
          <span className="text-green-400 ml-1">Output: {selected ? 'Immediate' : 'Register'}</span>
        </div>
      </div>
    </div>
  );
}

function MuxWbGateView({ cpu }: { cpu: CpuState }) {
  const ctrl = cpu.lastControl;
  if (!ctrl || cpu.cycle === 0) {
    return <div className="text-xs text-muted-foreground">Step once to see mux state.</div>;
  }

  const aluVal = cpu.lastAlu?.result ?? 0;
  const memVal = ctrl.memRead ? memRead(cpu.dmem, cpu.lastMemAddr) : 0;
  const pcPlus1 = (cpu.lastPc + 1) & 0xFFFFFFFF;
  const selected = ctrl.link ? 'PC+1' : ctrl.memToReg ? 'Memory' : ctrl.luiMode ? 'LUI' : 'ALU';

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        Writeback multiplexer — selects data written to register file. 4 possible sources:
        ALU result, memory read data, PC+1 (for JAL link), or LUI shifted immediate.
      </div>
      <div className="space-y-1 font-mono text-xs">
        <div className={`flex gap-2 px-1 rounded ${selected === 'ALU' ? 'bg-green-500/10 text-green-400' : 'text-muted-foreground/40'}`}>
          <span className="w-16">ALU:</span>
          <span>0x{aluVal.toString(16).padStart(8, '0')} ({aluVal})</span>
        </div>
        <div className={`flex gap-2 px-1 rounded ${selected === 'Memory' ? 'bg-green-500/10 text-green-400' : 'text-muted-foreground/40'}`}>
          <span className="w-16">Memory:</span>
          <span>0x{memVal.toString(16).padStart(8, '0')} ({memVal})</span>
        </div>
        <div className={`flex gap-2 px-1 rounded ${selected === 'PC+1' ? 'bg-green-500/10 text-green-400' : 'text-muted-foreground/40'}`}>
          <span className="w-16">PC+1:</span>
          <span>0x{pcPlus1.toString(16).padStart(8, '0')} ({pcPlus1})</span>
        </div>
        <div className="text-muted-foreground mt-1">
          Select: <span className="text-cyan-400">{selected}</span>
          {ctrl.regWrite && <span className="text-green-400"> → writing to R{cpu.lastRegWriteIdx}</span>}
        </div>
      </div>
    </div>
  );
}
