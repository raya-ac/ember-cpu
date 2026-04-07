import type { CpuState } from '@/cpu/cpu';
import { memRead } from '@/cpu/memory';

interface Props {
  cpu: CpuState;
  onBlockClick?: (block: string) => void;
}

// Layout constants
const W = 900;
const H = 400;

// Block positions and sizes
const blocks = {
  pc:      { x: 30,  y: 160, w: 60,  h: 50, label: 'PC' },
  imem:    { x: 130, y: 140, w: 80,  h: 90, label: 'I-MEM' },
  decoder: { x: 260, y: 40,  w: 80,  h: 50, label: 'Decode' },
  control: { x: 260, y: 310, w: 80,  h: 50, label: 'Control' },
  regfile: { x: 400, y: 120, w: 90,  h: 100, label: 'Reg File' },
  alu:     { x: 570, y: 150, w: 70,  h: 80, label: 'ALU' },
  dmem:    { x: 710, y: 140, w: 80,  h: 90, label: 'D-MEM' },
  muxAlu:  { x: 530, y: 260, w: 30,  h: 40, label: 'M' },
  muxWb:   { x: 810, y: 160, w: 30,  h: 40, label: 'M' },
};

type BlockKey = keyof typeof blocks;

function Block({ id, cpu, onClick }: { id: BlockKey; cpu: CpuState; onClick?: (block: string) => void }) {
  const b = blocks[id];
  const active = cpu.activePaths;

  let isActive = false;
  switch (id) {
    case 'pc': isActive = active.has('pc-update') || active.has('pc-to-imem'); break;
    case 'imem': isActive = active.has('imem-to-decoder'); break;
    case 'decoder': isActive = active.has('decoder-to-control') || active.has('decoder-to-regfile'); break;
    case 'control': isActive = active.has('decoder-to-control'); break;
    case 'regfile': isActive = active.has('regfile-read') || active.has('writeback'); break;
    case 'alu': isActive = active.has('alu-execute'); break;
    case 'dmem': isActive = active.has('dmem-read') || active.has('dmem-write'); break;
    default: break;
  }

  // Value annotations
  let annotation = '';
  switch (id) {
    case 'pc': annotation = `0x${cpu.pc.toString(16).padStart(8, '0')}`; break;
    case 'alu':
      if (cpu.lastAlu && cpu.cycle > 0) annotation = `= 0x${cpu.lastAlu.result.toString(16).padStart(8, '0')}`;
      break;
    case 'imem': annotation = `[${cpu.pc}] = 0x${memRead(cpu.imem, cpu.pc).toString(16).padStart(8, '0')}`; break;
  }

  return (
    <g
      onClick={() => onClick?.(id)}
      className="cursor-pointer"
    >
      <rect
        x={b.x} y={b.y} width={b.w} height={b.h}
        rx={6}
        className={`transition-all duration-200 ${
          isActive
            ? 'fill-amber-500/20 stroke-amber-500 stroke-2'
            : 'fill-card stroke-border stroke-1'
        }`}
      />
      <text
        x={b.x + b.w / 2} y={b.y + b.h / 2}
        textAnchor="middle" dominantBaseline="middle"
        className={`text-xs font-semibold pointer-events-none ${
          isActive ? 'fill-amber-400' : 'fill-foreground'
        }`}
      >
        {b.label}
      </text>
      {annotation && (
        <text
          x={b.x + b.w / 2} y={b.y + b.h + 14}
          textAnchor="middle"
          className="text-[10px] fill-muted-foreground font-mono pointer-events-none"
        >
          {annotation}
        </text>
      )}
    </g>
  );
}

function Wire({ path, active, value, labelPos }: {
  path: string;
  active: boolean;
  value?: string;
  labelPos?: { x: number; y: number };
}) {
  return (
    <g>
      <path
        d={path}
        fill="none"
        className={`transition-all duration-200 ${
          active
            ? 'stroke-amber-500 stroke-[2.5]'
            : 'stroke-border stroke-1'
        }`}
        markerEnd={active ? 'url(#arrowActive)' : 'url(#arrow)'}
      />
      {value && labelPos && active && (
        <text
          x={labelPos.x} y={labelPos.y}
          className="text-[9px] fill-amber-400 font-mono pointer-events-none"
          textAnchor="middle"
        >
          {value}
        </text>
      )}
    </g>
  );
}

export function CpuDiagram({ cpu, onBlockClick }: Props) {
  const a = cpu.activePaths;

  // Wire values from last execution
  const pcVal = `0x${cpu.pc.toString(16).padStart(8, '0')}`;
  const instrVal = cpu.lastInstruction ? `0x${cpu.lastInstruction.raw.toString(16).padStart(8, '0')}` : '';
  const aluVal = cpu.lastAlu ? `0x${cpu.lastAlu.result.toString(16).padStart(8, '0')}` : '';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5"
          markerWidth="6" markerHeight="6" orient="auto-start-reverse"
          className="fill-border"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" />
        </marker>
        <marker id="arrowActive" viewBox="0 0 10 10" refX="9" refY="5"
          markerWidth="6" markerHeight="6" orient="auto-start-reverse"
          className="fill-amber-500"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" />
        </marker>
      </defs>

      {/* Title */}
      <text x={W / 2} y={20} textAnchor="middle" className="text-sm fill-muted-foreground font-semibold">
        Ember — Single-Cycle Datapath
      </text>

      {/* Wires (drawn first, behind blocks) */}

      {/* PC → I-MEM */}
      <Wire
        path={`M ${blocks.pc.x + blocks.pc.w} ${blocks.pc.y + blocks.pc.h / 2} L ${blocks.imem.x} ${blocks.imem.y + blocks.imem.h / 2}`}
        active={a.has('pc-to-imem')}
        value={pcVal}
        labelPos={{ x: 105, y: 178 }}
      />

      {/* I-MEM → Decoder */}
      <Wire
        path={`M ${blocks.imem.x + blocks.imem.w / 2} ${blocks.imem.y} L ${blocks.imem.x + blocks.imem.w / 2} ${blocks.decoder.y + blocks.decoder.h / 2} L ${blocks.decoder.x} ${blocks.decoder.y + blocks.decoder.h / 2}`}
        active={a.has('imem-to-decoder')}
        value={instrVal}
        labelPos={{ x: 200, y: 55 }}
      />

      {/* Decoder → Control */}
      <Wire
        path={`M ${blocks.decoder.x + blocks.decoder.w / 2} ${blocks.decoder.y + blocks.decoder.h} L ${blocks.control.x + blocks.control.w / 2} ${blocks.control.y}`}
        active={a.has('decoder-to-control')}
      />

      {/* Decoder → Reg File */}
      <Wire
        path={`M ${blocks.decoder.x + blocks.decoder.w} ${blocks.decoder.y + blocks.decoder.h / 2} L ${blocks.regfile.x} ${blocks.regfile.y + 20}`}
        active={a.has('decoder-to-regfile')}
      />

      {/* Reg File → ALU (A input) */}
      <Wire
        path={`M ${blocks.regfile.x + blocks.regfile.w} ${blocks.regfile.y + 30} L ${blocks.alu.x} ${blocks.alu.y + 20}`}
        active={a.has('regfile-to-alu-a')}
      />

      {/* Reg File → Mux → ALU (B input) */}
      <Wire
        path={`M ${blocks.regfile.x + blocks.regfile.w} ${blocks.regfile.y + 60} L ${blocks.muxAlu.x} ${blocks.muxAlu.y + blocks.muxAlu.h / 2}`}
        active={a.has('regfile-to-alu-b')}
      />

      {/* Imm → Mux ALU */}
      <Wire
        path={`M ${blocks.decoder.x + blocks.decoder.w} ${blocks.decoder.y + blocks.decoder.h} L ${blocks.muxAlu.x} ${blocks.muxAlu.y + 10}`}
        active={a.has('imm-to-alu')}
      />

      {/* Mux → ALU (B) */}
      <Wire
        path={`M ${blocks.muxAlu.x + blocks.muxAlu.w} ${blocks.muxAlu.y + blocks.muxAlu.h / 2} L ${blocks.alu.x} ${blocks.alu.y + 60}`}
        active={a.has('regfile-to-alu-b') || a.has('imm-to-alu')}
      />

      {/* ALU → D-MEM */}
      <Wire
        path={`M ${blocks.alu.x + blocks.alu.w} ${blocks.alu.y + blocks.alu.h / 2} L ${blocks.dmem.x} ${blocks.dmem.y + blocks.dmem.h / 2}`}
        active={a.has('alu-to-dmem')}
        value={aluVal}
        labelPos={{ x: 660, y: 178 }}
      />

      {/* ALU → Mux WB (bypass memory) */}
      <Wire
        path={`M ${blocks.alu.x + blocks.alu.w} ${blocks.alu.y + 20} L ${blocks.muxWb.x} ${blocks.muxWb.y + 10}`}
        active={a.has('alu-execute') && !a.has('dmem-read')}
      />

      {/* D-MEM → Mux WB */}
      <Wire
        path={`M ${blocks.dmem.x + blocks.dmem.w} ${blocks.dmem.y + blocks.dmem.h / 2} L ${blocks.muxWb.x} ${blocks.muxWb.y + 30}`}
        active={a.has('dmem-to-regfile')}
      />

      {/* Mux WB → Reg File (writeback) */}
      <Wire
        path={`M ${blocks.muxWb.x + blocks.muxWb.w / 2} ${blocks.muxWb.y + blocks.muxWb.h} L ${blocks.muxWb.x + blocks.muxWb.w / 2} ${H - 20} L ${blocks.regfile.x + blocks.regfile.w / 2} ${H - 20} L ${blocks.regfile.x + blocks.regfile.w / 2} ${blocks.regfile.y + blocks.regfile.h}`}
        active={a.has('writeback')}
      />

      {/* Reg File → D-MEM write data */}
      <Wire
        path={`M ${blocks.regfile.x + blocks.regfile.w} ${blocks.regfile.y + blocks.regfile.h - 15} L ${blocks.dmem.x + 20} ${blocks.regfile.y + blocks.regfile.h - 15} L ${blocks.dmem.x + 20} ${blocks.dmem.y}`}
        active={a.has('regfile-to-dmem')}
      />

      {/* PC+1 feedback (top) */}
      <Wire
        path={`M ${blocks.pc.x + blocks.pc.w / 2} ${blocks.pc.y} L ${blocks.pc.x + blocks.pc.w / 2} ${blocks.pc.y - 25} L ${blocks.pc.x - 10} ${blocks.pc.y - 25} L ${blocks.pc.x - 10} ${blocks.pc.y + blocks.pc.h + 20} L ${blocks.pc.x + blocks.pc.w / 2} ${blocks.pc.y + blocks.pc.h}`}
        active={a.has('pc-update')}
      />

      {/* Branch/Jump wire */}
      {(a.has('branch-taken') || a.has('jump')) && (
        <Wire
          path={`M ${blocks.alu.x + blocks.alu.w / 2} ${blocks.alu.y} L ${blocks.alu.x + blocks.alu.w / 2} ${30} L ${blocks.pc.x + blocks.pc.w / 2} ${30} L ${blocks.pc.x + blocks.pc.w / 2} ${blocks.pc.y}`}
          active={true}
        />
      )}

      {/* Blocks */}
      {(Object.keys(blocks) as BlockKey[]).map(id => (
        <Block key={id} id={id} cpu={cpu} onClick={onBlockClick} />
      ))}

      {/* Stage labels */}
      {[
        { x: 60, label: 'FETCH' },
        { x: 200, label: 'DECODE' },
        { x: 450, label: 'EXECUTE' },
        { x: 720, label: 'MEMORY' },
        { x: 830, label: 'WB' },
      ].map(({ x, label }) => (
        <text key={label} x={x} y={H - 5} textAnchor="middle" className="text-[9px] fill-muted-foreground/50 font-semibold uppercase tracking-widest">
          {label}
        </text>
      ))}
    </svg>
  );
}
