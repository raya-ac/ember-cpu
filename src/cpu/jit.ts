// JIT Compiler — translates Ember machine code → JavaScript functions
// Compiles basic blocks (sequences of instructions until a branch/jump/halt)
// into JS functions that operate directly on the CPU's mutable state.

import { Opcode, AluFunc, IMEM_SIZE, DMEM_SIZE } from './isa';
import type { FastCpuState } from './fastcpu';
import { FRAMEBUFFER } from './fastcpu';

type CompiledBlock = (cpu: FastCpuState) => void;

interface BlockInfo {
  fn: CompiledBlock;
  startPc: number;
  length: number;  // number of instructions
}

export class EmberJIT {
  private cache = new Map<number, BlockInfo>();
  private imemSnapshot: Uint32Array | null = null;

  clear(): void {
    this.cache.clear();
    this.imemSnapshot = null;
  }

  // Execute until halted, frame ready, or maxCycles reached
  run(cpu: FastCpuState, maxCycles: number): number {
    const imemMask = IMEM_SIZE - 1;
    let executed = 0;

    // Snapshot imem for invalidation check
    if (!this.imemSnapshot) {
      this.imemSnapshot = new Uint32Array(cpu.imem);
    }

    while (executed < maxCycles && !cpu.halted && !cpu.frameReady) {
      const pc = cpu.pc & imemMask;

      let block = this.cache.get(pc);
      if (!block) {
        block = this.compile(cpu.imem, pc);
        this.cache.set(pc, block);
      }

      block.fn(cpu);
      executed += block.length;
    }

    cpu.cycle += executed;
    return executed;
  }

  private compile(imem: Uint32Array, startPc: number): BlockInfo {
    const imemMask = IMEM_SIZE - 1;
    const dmemMask = DMEM_SIZE - 1;
    const lines: string[] = [];
    let pc = startPc;
    let length = 0;

    // Emit preamble — destructure for speed
    lines.push('const r = cpu.regs;');
    lines.push('const d = cpu.dmem;');
    lines.push(`const DM = ${dmemMask};`);
    lines.push(`const IM = ${imemMask};`);

    let done = false;
    while (!done && length < 256) {
      const word = imem[pc & imemMask] >>> 0;
      const opcode = (word >>> 26) & 0x3F;
      const rd = (word >>> 23) & 0x7;
      const rs = (word >>> 20) & 0x7;
      const rt = (word >>> 17) & 0x7;
      const func = word & 0x1FFFF;
      const imm20 = word & 0xFFFFF;
      const simm20 = (imm20 << 12) >> 12; // sign-extend
      const addr26 = word & 0x3FFFFFF;

      lines.push('r[0]=0;');

      switch (opcode) {
        case Opcode.ALU: {
          const dst = rd === 0 ? '/*nop*/' : `r[${rd}]`;
          if (rd === 0) { lines.push(''); break; }
          switch (func) {
            case AluFunc.ADD: lines.push(`${dst}=(r[${rs}]+r[${rt}])|0;`); break;
            case AluFunc.SUB: lines.push(`${dst}=(r[${rs}]-r[${rt}])|0;`); break;
            case AluFunc.AND: lines.push(`${dst}=r[${rs}]&r[${rt}];`); break;
            case AluFunc.OR:  lines.push(`${dst}=r[${rs}]|r[${rt}];`); break;
            case AluFunc.XOR: lines.push(`${dst}=r[${rs}]^r[${rt}];`); break;
            case AluFunc.SHL: lines.push(`${dst}=(r[${rs}]<<(r[${rt}]&31))|0;`); break;
            case AluFunc.SHR: lines.push(`${dst}=(r[${rs}]>>>(r[${rt}]&31))|0;`); break;
            case AluFunc.SRA: lines.push(`${dst}=(r[${rs}]>>(r[${rt}]&31))|0;`); break;
            case AluFunc.SLT: lines.push(`${dst}=(r[${rs}]<r[${rt}])?1:0;`); break;
            case AluFunc.MUL: lines.push(`${dst}=Math.imul(r[${rs}],r[${rt}]);`); break;
            case AluFunc.DIV: lines.push(`${dst}=r[${rt}]!==0?(r[${rs}]/r[${rt}])|0:0;`); break;
            case AluFunc.MOD: lines.push(`${dst}=r[${rt}]!==0?(r[${rs}]%r[${rt}])|0:0;`); break;
            default: lines.push(`${dst}=0;`);
          }
          break;
        }

        case Opcode.ADDI:
          if (rd !== 0) lines.push(`r[${rd}]=(r[${rs}]+${simm20})|0;`);
          break;

        case Opcode.MULI:
          if (rd !== 0) lines.push(`r[${rd}]=Math.imul(r[${rs}],${simm20});`);
          break;

        case Opcode.LW: {
          if (rd !== 0) {
            lines.push(`{const a=((r[${rs}]+${simm20})|0)>>>0;`);
            lines.push(`if(a===${FRAMEBUFFER.TIMER})r[${rd}]=((performance.now()-cpu.startTime)|0)>>>0;`);
            lines.push(`else if(a===0x1FFFFD){r[${rd}]=cpu.inputKey;cpu.inputKey=0;}`);
            lines.push(`else r[${rd}]=d[a&DM]|0;}`);
          }
          break;
        }

        case Opcode.SW: {
          lines.push(`{const a=((r[${rs}]+${simm20})|0)>>>0;`);
          lines.push(`if(a===${FRAMEBUFFER.CONTROL}){if(r[${rd}]===1){cpu.frameReady=true;cpu.pc=${(pc + 1) & imemMask};r[0]=0;return;}}`);
          lines.push(`else if(a!==0x1FFFFF&&a!==0x1FFFFE)d[a&DM]=r[${rd}]>>>0;}`);
          break;
        }

        case Opcode.LB: {
          if (rd !== 0) {
            lines.push(`{const ba=((r[${rs}]+${simm20})|0)>>>0;`);
            lines.push(`const wi=(ba>>>2)&DM;const bo=ba&3;`);
            lines.push(`r[${rd}]=(d[wi]>>>(bo*8))&0xFF;}`);
          }
          break;
        }

        case Opcode.SB: {
          lines.push(`{const ba=((r[${rs}]+${simm20})|0)>>>0;`);
          lines.push(`const wi=(ba>>>2)&DM;const bo=ba&3;`);
          lines.push(`const mk=~(0xFF<<(bo*8));`);
          lines.push(`d[wi]=((d[wi]&mk)|((r[${rd}]&0xFF)<<(bo*8)))>>>0;}`);
          break;
        }

        case Opcode.LUI:
          if (rd !== 0) lines.push(`r[${rd}]=(${imm20}<<12)|0;`);
          break;

        case Opcode.ORI:
          if (rd !== 0) lines.push(`r[${rd}]=r[${rs}]|${imm20};`);
          break;

        case Opcode.ANDI:
          if (rd !== 0) lines.push(`r[${rd}]=r[${rs}]&${imm20};`);
          break;

        case Opcode.XORI:
          if (rd !== 0) lines.push(`r[${rd}]=r[${rs}]^${imm20};`);
          break;

        case Opcode.SLTI:
          if (rd !== 0) lines.push(`r[${rd}]=(r[${rs}]<${simm20})?1:0;`);
          break;

        // Branches — end the basic block
        case Opcode.BEQ: {
          const target = (pc + 1 + simm20) & imemMask;
          const fallthrough = (pc + 1) & imemMask;
          lines.push(`r[0]=0;if(r[${rd}]===r[${rs}])cpu.pc=${target};else cpu.pc=${fallthrough};return;`);
          done = true;
          break;
        }

        case Opcode.BNE: {
          const target = (pc + 1 + simm20) & imemMask;
          const fallthrough = (pc + 1) & imemMask;
          lines.push(`r[0]=0;if(r[${rd}]!==r[${rs}])cpu.pc=${target};else cpu.pc=${fallthrough};return;`);
          done = true;
          break;
        }

        case Opcode.BLT: {
          const target = (pc + 1 + simm20) & imemMask;
          const fallthrough = (pc + 1) & imemMask;
          lines.push(`r[0]=0;if(r[${rd}]<r[${rs}])cpu.pc=${target};else cpu.pc=${fallthrough};return;`);
          done = true;
          break;
        }

        case Opcode.BGE: {
          const target = (pc + 1 + simm20) & imemMask;
          const fallthrough = (pc + 1) & imemMask;
          lines.push(`r[0]=0;if(r[${rd}]>=r[${rs}])cpu.pc=${target};else cpu.pc=${fallthrough};return;`);
          done = true;
          break;
        }

        case Opcode.JMP:
          lines.push(`r[0]=0;cpu.pc=${addr26 & imemMask};return;`);
          done = true;
          break;

        case Opcode.JAL:
          lines.push(`r[7]=${(pc + 1) & imemMask};r[0]=0;cpu.pc=${addr26 & imemMask};return;`);
          done = true;
          break;

        case Opcode.JR:
          lines.push(`r[0]=0;cpu.pc=r[${rs}]&IM;return;`);
          done = true;
          break;

        case Opcode.HALT:
          lines.push('cpu.halted=true;r[0]=0;return;');
          done = true;
          break;

        default:
          lines.push('cpu.halted=true;r[0]=0;return;');
          done = true;
          break;
      }

      pc = (pc + 1) & imemMask;
      length++;
    }

    // Fallthrough — set PC to next instruction
    if (!done) {
      lines.push(`r[0]=0;cpu.pc=${pc & imemMask};`);
    }

    const body = lines.join('\n');
    // eslint-disable-next-line no-new-func
    const fn = new Function('cpu', body) as CompiledBlock;

    return { fn, startPc, length };
  }
}
