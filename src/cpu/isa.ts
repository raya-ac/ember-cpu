// Ember ISA — 32-bit custom architecture
//
// Encoding formats:
//   R-type: [6 opcode][3 rd][3 rs][3 rt][17 func]  — 32 bits
//   I-type: [6 opcode][3 rd][3 rs][20 imm]         — 20-bit signed immediate
//   J-type: [6 opcode][26 addr]

export const WORD_SIZE = 32;
export const NUM_REGISTERS = 8;
export const IMEM_SIZE = 65536;    // 64K instruction words
export const DMEM_SIZE = 2097152;  // 2M data words = 8MB

// Opcodes
export const Opcode = {
  ALU:   0x00,  // R-type — func selects operation
  ADDI:  0x01,
  LW:    0x02,
  SW:    0x03,
  BEQ:   0x04,
  BNE:   0x05,
  BLT:   0x06,
  LUI:   0x07,
  ORI:   0x08,
  ANDI:  0x09,
  XORI:  0x0A,
  SLTI:  0x0B,
  LB:    0x0C,
  SB:    0x0D,
  BGE:   0x0E,
  MULI:  0x0F,
  JMP:   0x10,
  JAL:   0x11,
  JR:    0x12,
  HALT:  0x3F,
} as const;

// ALU function codes (when opcode == ALU)
export const AluFunc = {
  ADD:  0,
  SUB:  1,
  AND:  2,
  OR:   3,
  XOR:  4,
  SHL:  5,
  SHR:  6,
  SRA:  7,
  SLT:  8,
  MUL:  9,
  DIV: 10,
  MOD: 11,
} as const;

// Instruction format types
export type InstructionFormat = 'R' | 'I' | 'J';

export interface DecodedInstruction {
  raw: number;
  opcode: number;
  format: InstructionFormat;
  // R-type fields
  rd: number;
  rs: number;
  rt: number;
  func: number;
  // I-type fields
  imm20: number;    // raw 20-bit unsigned
  simm20: number;   // sign-extended as JS signed number for display
  // J-type fields
  addr26: number;
  // Human-readable
  mnemonic: string;
  description: string;
}

// Sign-extend a value from `bits` width to 32-bit (returns JS signed number)
export function signExtend(value: number, bits: number): number {
  const shift = 32 - bits;
  return (value << shift) >> shift;
}

// Decode a 32-bit instruction word
export function decode(word: number): DecodedInstruction {
  word = word >>> 0; // unsigned 32-bit

  const opcode = (word >>> 26) & 0x3F;
  const rd     = (word >>> 23) & 0x7;
  const rs     = (word >>> 20) & 0x7;
  const rt     = (word >>> 17) & 0x7;
  const func   = word & 0x1FFFF;          // 17-bit
  const imm20  = word & 0xFFFFF;          // 20-bit unsigned
  const simm20 = signExtend(imm20, 20);   // sign-extended JS number
  const addr26 = word & 0x3FFFFFF;         // 26-bit

  let format: InstructionFormat = 'R';
  let mnemonic = '???';
  let description = '';

  switch (opcode) {
    case Opcode.ALU:
      format = 'R';
      switch (func) {
        case AluFunc.ADD: mnemonic = 'ADD'; description = `R${rd} = R${rs} + R${rt}`; break;
        case AluFunc.SUB: mnemonic = 'SUB'; description = `R${rd} = R${rs} - R${rt}`; break;
        case AluFunc.AND: mnemonic = 'AND'; description = `R${rd} = R${rs} & R${rt}`; break;
        case AluFunc.OR:  mnemonic = 'OR';  description = `R${rd} = R${rs} | R${rt}`; break;
        case AluFunc.XOR: mnemonic = 'XOR'; description = `R${rd} = R${rs} ^ R${rt}`; break;
        case AluFunc.SHL: mnemonic = 'SHL'; description = `R${rd} = R${rs} << R${rt}`; break;
        case AluFunc.SHR: mnemonic = 'SHR'; description = `R${rd} = R${rs} >>> R${rt}`; break;
        case AluFunc.SRA: mnemonic = 'SRA'; description = `R${rd} = R${rs} >> R${rt}`; break;
        case AluFunc.SLT: mnemonic = 'SLT'; description = `R${rd} = (R${rs} < R${rt}) ? 1 : 0`; break;
        case AluFunc.MUL: mnemonic = 'MUL'; description = `R${rd} = R${rs} * R${rt}`; break;
        case AluFunc.DIV: mnemonic = 'DIV'; description = `R${rd} = R${rs} / R${rt}`; break;
        case AluFunc.MOD: mnemonic = 'MOD'; description = `R${rd} = R${rs} % R${rt}`; break;
      }
      break;
    case Opcode.ADDI: format = 'I'; mnemonic = 'ADDI'; description = `R${rd} = R${rs} + ${simm20}`; break;
    case Opcode.LW:   format = 'I'; mnemonic = 'LW';   description = `R${rd} = MEM[R${rs} + ${simm20}]`; break;
    case Opcode.SW:   format = 'I'; mnemonic = 'SW';    description = `MEM[R${rs} + ${simm20}] = R${rd}`; break;
    case Opcode.BEQ:  format = 'I'; mnemonic = 'BEQ';   description = `if R${rd} == R${rs}: PC += ${simm20}`; break;
    case Opcode.BNE:  format = 'I'; mnemonic = 'BNE';   description = `if R${rd} != R${rs}: PC += ${simm20}`; break;
    case Opcode.BLT:  format = 'I'; mnemonic = 'BLT';   description = `if R${rs} < R${rd}: PC += ${simm20}`; break;
    case Opcode.LUI:  format = 'I'; mnemonic = 'LUI';   description = `R${rd} = ${imm20} << 12`; break;
    case Opcode.ORI:  format = 'I'; mnemonic = 'ORI';   description = `R${rd} = R${rs} | ${imm20}`; break;
    case Opcode.ANDI: format = 'I'; mnemonic = 'ANDI';  description = `R${rd} = R${rs} & ${imm20}`; break;
    case Opcode.XORI: format = 'I'; mnemonic = 'XORI';  description = `R${rd} = R${rs} ^ ${imm20}`; break;
    case Opcode.SLTI: format = 'I'; mnemonic = 'SLTI';  description = `R${rd} = (R${rs} < ${simm20}) ? 1 : 0`; break;
    case Opcode.LB:   format = 'I'; mnemonic = 'LB';    description = `R${rd} = BYTE[R${rs} + ${simm20}]`; break;
    case Opcode.SB:   format = 'I'; mnemonic = 'SB';    description = `BYTE[R${rs} + ${simm20}] = R${rd}`; break;
    case Opcode.BGE:  format = 'I'; mnemonic = 'BGE';   description = `if R${rs} >= R${rd}: PC += ${simm20}`; break;
    case Opcode.MULI: format = 'I'; mnemonic = 'MULI';  description = `R${rd} = R${rs} * ${simm20}`; break;
    case Opcode.JMP:  format = 'J'; mnemonic = 'JMP';   description = `PC = 0x${addr26.toString(16)}`; break;
    case Opcode.JAL:  format = 'J'; mnemonic = 'JAL';   description = `R7 = PC+1; PC = 0x${addr26.toString(16)}`; break;
    case Opcode.JR:   format = 'R'; mnemonic = 'JR';    description = `PC = R${rs}`; break;
    case Opcode.HALT: format = 'J'; mnemonic = 'HALT';  description = 'halt'; break;
  }

  return { raw: word, opcode, format, rd, rs, rt, func, imm20, simm20, addr26, mnemonic, description };
}

// Encode helpers — all return unsigned 32-bit
export function encodeR(opcode: number, rd: number, rs: number, rt: number, func: number): number {
  return (((opcode & 0x3F) << 26) | ((rd & 0x7) << 23) | ((rs & 0x7) << 20) | ((rt & 0x7) << 17) | (func & 0x1FFFF)) >>> 0;
}

export function encodeI(opcode: number, rd: number, rs: number, imm: number): number {
  return (((opcode & 0x3F) << 26) | ((rd & 0x7) << 23) | ((rs & 0x7) << 20) | (imm & 0xFFFFF)) >>> 0;
}

export function encodeJ(opcode: number, addr: number): number {
  return (((opcode & 0x3F) << 26) | (addr & 0x3FFFFFF)) >>> 0;
}
