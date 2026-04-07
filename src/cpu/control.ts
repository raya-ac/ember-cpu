// Control unit — generates control signals from opcode/func

import { Opcode } from './isa';

export interface ControlSignals {
  regWrite: boolean;    // write to register file
  memRead: boolean;     // read from data memory
  memWrite: boolean;    // write to data memory
  memToReg: boolean;    // register write data comes from memory (vs ALU)
  aluSrc: boolean;      // ALU second operand is immediate (vs register)
  branch: boolean;      // conditional branch
  jump: boolean;        // unconditional jump
  jumpReg: boolean;     // jump to register value
  link: boolean;        // save return address (JAL)
  halt: boolean;        // stop execution
  aluOp: number;        // ALU operation selector
  branchType: 'eq' | 'ne' | 'lt' | 'ge' | 'none';
  luiMode: boolean;     // LUI instruction
  oriMode: boolean;     // ORI instruction (zero-extend)
  andiMode: boolean;    // ANDI instruction (zero-extend)
  byteMode: boolean;    // LB/SB byte addressing
  isMuli: boolean;      // MULI instruction
}

export function generateControl(opcode: number, func: number): ControlSignals {
  const signals: ControlSignals = {
    regWrite: false,
    memRead: false,
    memWrite: false,
    memToReg: false,
    aluSrc: false,
    branch: false,
    jump: false,
    jumpReg: false,
    link: false,
    halt: false,
    aluOp: 0,
    branchType: 'none',
    luiMode: false,
    oriMode: false,
    andiMode: false,
    byteMode: false,
    isMuli: false,
  };

  switch (opcode) {
    case Opcode.ALU:
      signals.regWrite = true;
      signals.aluOp = func;
      break;

    case Opcode.ADDI:
      signals.regWrite = true;
      signals.aluSrc = true;
      signals.aluOp = 0; // ADD
      break;

    case Opcode.LW:
      signals.regWrite = true;
      signals.memRead = true;
      signals.memToReg = true;
      signals.aluSrc = true;
      signals.aluOp = 0; // ADD for address calc
      break;

    case Opcode.SW:
      signals.memWrite = true;
      signals.aluSrc = true;
      signals.aluOp = 0; // ADD for address calc
      break;

    case Opcode.BEQ:
      signals.branch = true;
      signals.branchType = 'eq';
      signals.aluOp = 1; // SUB for comparison
      break;

    case Opcode.BNE:
      signals.branch = true;
      signals.branchType = 'ne';
      signals.aluOp = 1; // SUB
      break;

    case Opcode.BLT:
      signals.branch = true;
      signals.branchType = 'lt';
      signals.aluOp = 1; // SUB
      break;

    case Opcode.BGE:
      signals.branch = true;
      signals.branchType = 'ge';
      signals.aluOp = 1; // SUB
      break;

    case Opcode.LUI:
      signals.regWrite = true;
      signals.luiMode = true;
      break;

    case Opcode.ORI:
      signals.regWrite = true;
      signals.aluSrc = true;
      signals.oriMode = true;
      signals.aluOp = 3; // OR
      break;

    case Opcode.ANDI:
      signals.regWrite = true;
      signals.aluSrc = true;
      signals.andiMode = true;
      signals.aluOp = 2; // AND
      break;

    case Opcode.XORI:
      signals.regWrite = true;
      signals.aluSrc = true;
      signals.aluOp = 4; // XOR
      break;

    case Opcode.SLTI:
      signals.regWrite = true;
      signals.aluSrc = true;
      signals.aluOp = 8; // SLT
      break;

    case Opcode.LB:
      signals.regWrite = true;
      signals.memRead = true;
      signals.memToReg = true;
      signals.aluSrc = true;
      signals.byteMode = true;
      signals.aluOp = 0; // ADD for address calc
      break;

    case Opcode.SB:
      signals.memWrite = true;
      signals.aluSrc = true;
      signals.byteMode = true;
      signals.aluOp = 0; // ADD for address calc
      break;

    case Opcode.MULI:
      signals.regWrite = true;
      signals.aluSrc = true;
      signals.isMuli = true;
      signals.aluOp = 9; // MUL
      break;

    case Opcode.JMP:
      signals.jump = true;
      break;

    case Opcode.JAL:
      signals.jump = true;
      signals.link = true;
      signals.regWrite = true;
      break;

    case Opcode.JR:
      signals.jumpReg = true;
      break;

    case Opcode.HALT:
      signals.halt = true;
      break;
  }

  return signals;
}
