// CPU — top-level state machine, single-cycle datapath (32-bit)

import { decode, signExtend, type DecodedInstruction, IMEM_SIZE, DMEM_SIZE } from './isa';
import { aluExecute, type AluResult } from './alu';
import { createRegisters, readReg, writeReg, type RegisterFile } from './registers';
import { createInstructionMemory, createDataMemory, memRead, memWrite, memReadByte, memWriteByte, loadProgram, type Memory } from './memory';
import { generateControl, type ControlSignals } from './control';

export interface CpuFlags {
  zero: boolean;
  negative: boolean;
  carry: boolean;
  overflow: boolean;
}

export interface CpuState {
  pc: number;
  registers: RegisterFile;
  imem: Memory;       // instruction memory (64K words)
  dmem: Memory;       // data memory (2M words = 8MB)
  flags: CpuFlags;
  halted: boolean;
  cycle: number;
  // Trace of last execution (for visualization)
  lastInstruction: DecodedInstruction | null;
  lastControl: ControlSignals | null;
  lastAlu: AluResult | null;
  lastRegWriteIdx: number;
  lastRegWriteVal: number;
  lastMemAddr: number;
  lastMemWriteVal: number;
  lastPc: number;
  // Active datapath signals for visualization
  activePaths: Set<string>;
  // Memory-mapped I/O output:
  //   Write 0x1FFFFF → print number
  //   Write 0x1FFFFE → print ASCII char
  //   Read  0x1FFFFD → keyboard input (auto-clear)
  outputBuffer: string[];
  inputKey: number;
}

// I/O addresses (word addresses in data memory space)
const IO_INPUT    = 0x1FFFFD;
const IO_PRINT    = 0x1FFFFF;
const IO_PRINTCH  = 0x1FFFFE;

export function createCpu(): CpuState {
  return {
    pc: 0,
    registers: createRegisters(),
    imem: createInstructionMemory(),
    dmem: createDataMemory(),
    flags: { zero: false, negative: false, carry: false, overflow: false },
    halted: false,
    cycle: 0,
    lastInstruction: null,
    lastControl: null,
    lastAlu: null,
    lastRegWriteIdx: -1,
    lastRegWriteVal: 0,
    lastMemAddr: -1,
    lastMemWriteVal: 0,
    lastPc: 0,
    activePaths: new Set(),
    outputBuffer: [],
    inputKey: 0,
  };
}

export function loadProgramIntoCpu(cpu: CpuState, program: number[]): CpuState {
  return {
    ...cpu,
    imem: loadProgram(cpu.imem, program),
  };
}

export function resetCpu(cpu: CpuState): CpuState {
  return {
    ...createCpu(),
    imem: cpu.imem, // keep program loaded
  };
}

export function step(cpu: CpuState): CpuState {
  if (cpu.halted) return cpu;

  const activePaths = new Set<string>();
  const lastPc = cpu.pc;

  // === FETCH ===
  const word = memRead(cpu.imem, cpu.pc & (IMEM_SIZE - 1));
  activePaths.add('pc-to-imem');
  activePaths.add('imem-to-decoder');

  // === DECODE ===
  const inst = decode(word);
  const ctrl = generateControl(inst.opcode, inst.func);
  activePaths.add('decoder-to-control');

  // Read registers
  const rsVal = readReg(cpu.registers, inst.rs);
  const rdVal = readReg(cpu.registers, inst.rd);
  const rtVal = readReg(cpu.registers, inst.rt);
  activePaths.add('decoder-to-regfile');
  activePaths.add('regfile-read');

  // === EXECUTE ===
  let aluA = rsVal;
  let aluB: number;

  if (ctrl.aluSrc) {
    // Immediate operand — choose zero-extend or sign-extend
    if (ctrl.oriMode || ctrl.andiMode) {
      aluB = inst.imm20 & 0xFFFFF; // zero-extend 20-bit
    } else {
      aluB = signExtend(inst.imm20, 20) >>> 0; // sign-extend to 32-bit unsigned
    }
    activePaths.add('imm-to-alu');
  } else {
    aluB = rtVal;
    activePaths.add('regfile-to-alu-b');
  }

  // For branches, compare rd and rs
  if (ctrl.branch) {
    aluA = rdVal;
    aluB = rsVal;
  }

  activePaths.add('regfile-to-alu-a');
  activePaths.add('alu-execute');

  const aluResult = aluExecute(ctrl.aluOp, aluA, aluB);

  // LUI special handling: imm20 << 12 (fills upper 20 bits, lower 12 zero)
  let writeBackValue: number;
  if (ctrl.luiMode) {
    writeBackValue = (inst.imm20 << 12) >>> 0;
    activePaths.add('lui-path');
  } else {
    writeBackValue = aluResult.result;
  }

  // === MEMORY ===
  let memReadVal = 0;
  let newDmem = cpu.dmem;
  let lastMemAddr = -1;
  let lastMemWriteVal = 0;

  let inputKeyConsumed = false;

  if (ctrl.memRead) {
    const readAddr = aluResult.result >>> 0;
    if (ctrl.byteMode) {
      // LB — byte address
      if (readAddr === IO_INPUT) {
        memReadVal = cpu.inputKey;
        inputKeyConsumed = true;
      } else {
        memReadVal = memReadByte(cpu.dmem, readAddr);
      }
    } else {
      // LW — word address
      if (readAddr === IO_INPUT) {
        memReadVal = cpu.inputKey;
        inputKeyConsumed = true;
      } else {
        memReadVal = memRead(cpu.dmem, readAddr & (DMEM_SIZE - 1));
      }
    }
    writeBackValue = memReadVal;
    lastMemAddr = readAddr;
    activePaths.add('alu-to-dmem');
    activePaths.add('dmem-read');
    activePaths.add('dmem-to-regfile');
  }

  // Memory-mapped I/O output
  const newOutput: string[] = [];

  if (ctrl.memWrite) {
    const writeAddr = aluResult.result >>> 0;
    lastMemAddr = writeAddr;
    lastMemWriteVal = rdVal;

    // I/O: print number / print ASCII char
    if (writeAddr === IO_PRINT) {
      // Print as signed for readability
      const signed = rdVal | 0;
      newOutput.push(String(signed));
    } else if (writeAddr === IO_PRINTCH) {
      newOutput.push(String.fromCharCode(rdVal & 0x7F));
    } else if (ctrl.byteMode) {
      // SB — byte write
      newDmem = memWriteByte(cpu.dmem, writeAddr, rdVal);
    } else {
      // SW — word write
      newDmem = memWrite(cpu.dmem, writeAddr & (DMEM_SIZE - 1), rdVal);
    }

    activePaths.add('alu-to-dmem');
    activePaths.add('regfile-to-dmem');
    activePaths.add('dmem-write');
  }

  // === WRITEBACK ===
  let newRegs = cpu.registers;
  let lastRegWriteIdx = -1;
  let lastRegWriteVal = 0;

  if (ctrl.regWrite) {
    if (ctrl.link) {
      // JAL: write PC+1 to R7
      lastRegWriteIdx = 7;
      lastRegWriteVal = ((cpu.pc + 1) & (IMEM_SIZE - 1)) >>> 0;
      newRegs = writeReg(newRegs, 7, lastRegWriteVal);
    } else {
      lastRegWriteIdx = inst.rd;
      lastRegWriteVal = writeBackValue >>> 0;
      newRegs = writeReg(newRegs, inst.rd, writeBackValue);
    }
    activePaths.add('writeback');
  }

  // === PC UPDATE ===
  let nextPc = (cpu.pc + 1) & (IMEM_SIZE - 1);

  if (ctrl.jump) {
    nextPc = inst.addr26 & (IMEM_SIZE - 1);
    activePaths.add('jump');
  } else if (ctrl.jumpReg) {
    nextPc = rsVal & (IMEM_SIZE - 1);
    activePaths.add('jump-reg');
  } else if (ctrl.branch) {
    let takeBranch = false;
    switch (ctrl.branchType) {
      case 'eq': takeBranch = aluResult.zero; break;
      case 'ne': takeBranch = !aluResult.zero; break;
      case 'lt': takeBranch = aluResult.negative !== aluResult.overflow; break;
      case 'ge': takeBranch = aluResult.negative === aluResult.overflow; break;
    }
    if (takeBranch) {
      nextPc = (cpu.pc + 1 + signExtend(inst.imm20, 20)) & (IMEM_SIZE - 1);
      activePaths.add('branch-taken');
    } else {
      activePaths.add('branch-not-taken');
    }
  }

  activePaths.add('pc-update');

  return {
    pc: nextPc,
    registers: newRegs,
    imem: cpu.imem,
    dmem: newDmem,
    flags: {
      zero: aluResult.zero,
      negative: aluResult.negative,
      carry: aluResult.carry,
      overflow: aluResult.overflow,
    },
    halted: ctrl.halt,
    cycle: cpu.cycle + 1,
    lastInstruction: inst,
    lastControl: ctrl,
    lastAlu: aluResult,
    lastRegWriteIdx,
    lastRegWriteVal,
    lastMemAddr,
    lastMemWriteVal,
    lastPc,
    activePaths,
    outputBuffer: [...cpu.outputBuffer, ...newOutput],
    inputKey: inputKeyConsumed ? 0 : cpu.inputKey,
  };
}
