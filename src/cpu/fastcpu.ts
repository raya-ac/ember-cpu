// FastCPU — mutable, high-speed Ember CPU engine for real workloads
// No immutable copies, no visualization tracing, just raw execution speed.
// Shares the same ISA as the educational CPU but runs 100,000x faster.

import { Opcode, AluFunc, IMEM_SIZE, DMEM_SIZE } from './isa';

// Memory-mapped I/O addresses (word addresses)
const IO_INPUT     = 0x1FFFFD;
const IO_PRINTCH   = 0x1FFFFE;
const IO_PRINT     = 0x1FFFFF;

// Framebuffer MMIO
const FB_BASE      = 0x100000;  // 320×200 pixels, 8-bit indexed, packed 4 per word
const FB_SIZE      = 16000;     // 64000 bytes / 4 = 16000 words
const PALETTE_BASE = 0x110000;  // 256 RGB entries (R in low byte, G mid, B high)
const FB_CONTROL   = 0x110400;  // write 1 = frame ready
const TIMER_ADDR   = 0x110401;  // read = milliseconds since start

export interface FastCpuState {
  pc: number;
  regs: Int32Array;       // 8 registers, signed for arithmetic
  imem: Uint32Array;      // instruction memory
  dmem: Uint32Array;      // data memory (mutable!)
  halted: boolean;
  cycle: number;
  inputKey: number;
  frameReady: boolean;    // set when program writes 1 to FB_CONTROL
  startTime: number;      // performance.now() at creation
}

export const FRAMEBUFFER = {
  BASE: FB_BASE,
  SIZE: FB_SIZE,
  WIDTH: 320,
  HEIGHT: 200,
  PALETTE_BASE: PALETTE_BASE,
  CONTROL: FB_CONTROL,
  TIMER: TIMER_ADDR,
} as const;

export function createFastCpu(): FastCpuState {
  return {
    pc: 0,
    regs: new Int32Array(8),  // R0 always 0
    imem: new Uint32Array(IMEM_SIZE),
    dmem: new Uint32Array(DMEM_SIZE),
    halted: false,
    cycle: 0,
    inputKey: 0,
    frameReady: false,
    startTime: performance.now(),
  };
}

export function loadProgramFast(cpu: FastCpuState, program: number[]): void {
  for (let i = 0; i < program.length; i++) {
    cpu.imem[i] = program[i] >>> 0;
  }
  cpu.pc = 0;
  cpu.halted = false;
  cpu.cycle = 0;
  cpu.regs.fill(0);
  cpu.startTime = performance.now();
}

// Load raw data into data memory at a word address
export function loadDataFast(cpu: FastCpuState, data: Uint32Array | number[], wordAddr: number): void {
  for (let i = 0; i < data.length; i++) {
    cpu.dmem[(wordAddr + i) & (DMEM_SIZE - 1)] = (typeof data[i] === 'number' ? data[i] : 0) >>> 0;
  }
}

// Execute N instructions. Returns actual count executed (may be less if halted).
export function executeFast(cpu: FastCpuState, count: number): number {
  const { regs, imem, dmem } = cpu;
  const imemMask = IMEM_SIZE - 1;
  const dmemMask = DMEM_SIZE - 1;
  let pc = cpu.pc;
  let executed = 0;

  for (let i = 0; i < count; i++) {
    if (cpu.halted) break;

    const word = imem[pc & imemMask] >>> 0;
    const opcode = (word >>> 26) & 0x3F;

    // Ensure R0 is always 0
    regs[0] = 0;

    switch (opcode) {
      case Opcode.ALU: {
        const rd = (word >>> 23) & 0x7;
        const rs = (word >>> 20) & 0x7;
        const rt = (word >>> 17) & 0x7;
        const func = word & 0x1FFFF;
        let result: number;
        switch (func) {
          case AluFunc.ADD: result = (regs[rs] + regs[rt]) | 0; break;
          case AluFunc.SUB: result = (regs[rs] - regs[rt]) | 0; break;
          case AluFunc.AND: result = regs[rs] & regs[rt]; break;
          case AluFunc.OR:  result = regs[rs] | regs[rt]; break;
          case AluFunc.XOR: result = regs[rs] ^ regs[rt]; break;
          case AluFunc.SHL: result = (regs[rs] << (regs[rt] & 31)) | 0; break;
          case AluFunc.SHR: result = (regs[rs] >>> (regs[rt] & 31)) | 0; break;
          case AluFunc.SRA: result = (regs[rs] >> (regs[rt] & 31)) | 0; break;
          case AluFunc.SLT: result = (regs[rs] < regs[rt]) ? 1 : 0; break;
          case AluFunc.MUL: result = Math.imul(regs[rs], regs[rt]); break;
          case AluFunc.DIV: result = regs[rt] !== 0 ? (regs[rs] / regs[rt]) | 0 : 0; break;
          case AluFunc.MOD: result = regs[rt] !== 0 ? (regs[rs] % regs[rt]) | 0 : 0; break;
          default: result = 0;
        }
        if (rd !== 0) regs[rd] = result;
        pc = (pc + 1) & imemMask;
        break;
      }

      case Opcode.ADDI: {
        const rd = (word >>> 23) & 0x7;
        const rs = (word >>> 20) & 0x7;
        const imm = (word << 12) >> 12; // sign-extend 20-bit
        if (rd !== 0) regs[rd] = (regs[rs] + imm) | 0;
        pc = (pc + 1) & imemMask;
        break;
      }

      case Opcode.MULI: {
        const rd = (word >>> 23) & 0x7;
        const rs = (word >>> 20) & 0x7;
        const imm = (word << 12) >> 12;
        if (rd !== 0) regs[rd] = Math.imul(regs[rs], imm);
        pc = (pc + 1) & imemMask;
        break;
      }

      case Opcode.LW: {
        const rd = (word >>> 23) & 0x7;
        const rs = (word >>> 20) & 0x7;
        const imm = (word << 12) >> 12;
        const addr = ((regs[rs] + imm) | 0) >>> 0;
        let val: number;
        if (addr === IO_INPUT) {
          val = cpu.inputKey;
          cpu.inputKey = 0;
        } else if (addr === TIMER_ADDR) {
          val = ((performance.now() - cpu.startTime) | 0) >>> 0;
        } else {
          val = dmem[addr & dmemMask] | 0;
        }
        if (rd !== 0) regs[rd] = val;
        pc = (pc + 1) & imemMask;
        break;
      }

      case Opcode.SW: {
        const rd = (word >>> 23) & 0x7;
        const rs = (word >>> 20) & 0x7;
        const imm = (word << 12) >> 12;
        const addr = ((regs[rs] + imm) | 0) >>> 0;
        if (addr === IO_PRINT || addr === IO_PRINTCH) {
          // skip I/O prints in fast mode
        } else if (addr === FB_CONTROL) {
          if (regs[rd] === 1) cpu.frameReady = true;
        } else {
          dmem[addr & dmemMask] = regs[rd] >>> 0;
        }
        pc = (pc + 1) & imemMask;
        break;
      }

      case Opcode.LB: {
        const rd = (word >>> 23) & 0x7;
        const rs = (word >>> 20) & 0x7;
        const imm = (word << 12) >> 12;
        const byteAddr = ((regs[rs] + imm) | 0) >>> 0;
        if (byteAddr === IO_INPUT) {
          if (rd !== 0) regs[rd] = cpu.inputKey;
          cpu.inputKey = 0;
        } else {
          const wordIdx = (byteAddr >>> 2) & dmemMask;
          const byteOff = byteAddr & 3;
          if (rd !== 0) regs[rd] = (dmem[wordIdx] >>> (byteOff * 8)) & 0xFF;
        }
        pc = (pc + 1) & imemMask;
        break;
      }

      case Opcode.SB: {
        const rd = (word >>> 23) & 0x7;
        const rs = (word >>> 20) & 0x7;
        const imm = (word << 12) >> 12;
        const byteAddr = ((regs[rs] + imm) | 0) >>> 0;
        const wordIdx = (byteAddr >>> 2) & dmemMask;
        const byteOff = byteAddr & 3;
        const mask = ~(0xFF << (byteOff * 8));
        dmem[wordIdx] = ((dmem[wordIdx] & mask) | ((regs[rd] & 0xFF) << (byteOff * 8))) >>> 0;
        pc = (pc + 1) & imemMask;
        break;
      }

      case Opcode.BEQ: {
        const rd = (word >>> 23) & 0x7;
        const rs = (word >>> 20) & 0x7;
        const imm = (word << 12) >> 12;
        if (regs[rd] === regs[rs]) {
          pc = (pc + 1 + imm) & imemMask;
        } else {
          pc = (pc + 1) & imemMask;
        }
        break;
      }

      case Opcode.BNE: {
        const rd = (word >>> 23) & 0x7;
        const rs = (word >>> 20) & 0x7;
        const imm = (word << 12) >> 12;
        if (regs[rd] !== regs[rs]) {
          pc = (pc + 1 + imm) & imemMask;
        } else {
          pc = (pc + 1) & imemMask;
        }
        break;
      }

      case Opcode.BLT: {
        const rd = (word >>> 23) & 0x7;
        const rs = (word >>> 20) & 0x7;
        const imm = (word << 12) >> 12;
        if (regs[rd] < regs[rs]) {
          pc = (pc + 1 + imm) & imemMask;
        } else {
          pc = (pc + 1) & imemMask;
        }
        break;
      }

      case Opcode.BGE: {
        const rd = (word >>> 23) & 0x7;
        const rs = (word >>> 20) & 0x7;
        const imm = (word << 12) >> 12;
        if (regs[rd] >= regs[rs]) {
          pc = (pc + 1 + imm) & imemMask;
        } else {
          pc = (pc + 1) & imemMask;
        }
        break;
      }

      case Opcode.LUI: {
        const rd = (word >>> 23) & 0x7;
        const imm20 = word & 0xFFFFF;
        if (rd !== 0) regs[rd] = (imm20 << 12) | 0;
        pc = (pc + 1) & imemMask;
        break;
      }

      case Opcode.ORI: {
        const rd = (word >>> 23) & 0x7;
        const rs = (word >>> 20) & 0x7;
        const imm20 = word & 0xFFFFF; // zero-extend
        if (rd !== 0) regs[rd] = regs[rs] | imm20;
        pc = (pc + 1) & imemMask;
        break;
      }

      case Opcode.ANDI: {
        const rd = (word >>> 23) & 0x7;
        const rs = (word >>> 20) & 0x7;
        const imm20 = word & 0xFFFFF;
        if (rd !== 0) regs[rd] = regs[rs] & imm20;
        pc = (pc + 1) & imemMask;
        break;
      }

      case Opcode.XORI: {
        const rd = (word >>> 23) & 0x7;
        const rs = (word >>> 20) & 0x7;
        const imm20 = word & 0xFFFFF;
        if (rd !== 0) regs[rd] = regs[rs] ^ imm20;
        pc = (pc + 1) & imemMask;
        break;
      }

      case Opcode.SLTI: {
        const rd = (word >>> 23) & 0x7;
        const rs = (word >>> 20) & 0x7;
        const imm = (word << 12) >> 12;
        if (rd !== 0) regs[rd] = (regs[rs] < imm) ? 1 : 0;
        pc = (pc + 1) & imemMask;
        break;
      }

      case Opcode.JMP: {
        const addr26 = word & 0x3FFFFFF;
        pc = addr26 & imemMask;
        break;
      }

      case Opcode.JAL: {
        const addr26 = word & 0x3FFFFFF;
        regs[7] = (pc + 1) & imemMask;
        pc = addr26 & imemMask;
        break;
      }

      case Opcode.JR: {
        const rs = (word >>> 20) & 0x7;
        pc = regs[rs] & imemMask;
        break;
      }

      case Opcode.HALT: {
        cpu.halted = true;
        pc = (pc + 1) & imemMask;
        break;
      }

      default: {
        // Unknown opcode — halt
        cpu.halted = true;
        break;
      }
    }

    executed++;
  }

  // Write back PC
  cpu.pc = pc;
  cpu.cycle += executed;
  // Ensure R0 stays 0
  regs[0] = 0;

  return executed;
}
