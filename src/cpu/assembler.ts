// Assembler — text assembly -> binary machine code (32-bit)

import { Opcode, AluFunc, encodeR, encodeI, encodeJ, signExtend } from './isa';

export interface AssemblerError {
  line: number;
  message: string;
}

export interface AssemblerResult {
  success: boolean;
  program: number[];
  errors: AssemblerError[];
  labels: Map<string, number>;
  sourceMap: Map<number, number>; // address -> source line
}

const REGISTER_MAP: Record<string, number> = {
  r0: 0, r1: 1, r2: 2, r3: 3, r4: 4, r5: 5, r6: 6, r7: 7,
  zero: 0, sp: 7, ra: 7,
};

function parseReg(s: string): number | null {
  const n = REGISTER_MAP[s.toLowerCase()];
  return n !== undefined ? n : null;
}

function parseImm(s: string, labels: Map<string, number>, currentAddr: number, isBranch: boolean): number | null {
  // Check for label reference
  if (labels.has(s)) {
    const target = labels.get(s)!;
    if (isBranch) {
      return target - (currentAddr + 1); // relative offset
    }
    return target;
  }
  // Numeric literal
  let val: number;
  if (s.startsWith('0x') || s.startsWith('0X')) {
    val = parseInt(s, 16);
  } else if (s.startsWith('0b') || s.startsWith('0B')) {
    val = parseInt(s.slice(2), 2);
  } else {
    val = parseInt(s, 10);
  }
  return isNaN(val) ? null : val;
}

type MnemonicDef = {
  type: 'R' | 'I' | 'J' | 'special';
  opcode: number;
  func?: number;
  args: string; // format: "rd,rs,rt" | "rd,rs,imm" | "addr" | etc
};

const MNEMONICS: Record<string, MnemonicDef> = {
  // R-type ALU
  add:  { type: 'R', opcode: Opcode.ALU, func: AluFunc.ADD, args: 'rd,rs,rt' },
  sub:  { type: 'R', opcode: Opcode.ALU, func: AluFunc.SUB, args: 'rd,rs,rt' },
  and:  { type: 'R', opcode: Opcode.ALU, func: AluFunc.AND, args: 'rd,rs,rt' },
  or:   { type: 'R', opcode: Opcode.ALU, func: AluFunc.OR,  args: 'rd,rs,rt' },
  xor:  { type: 'R', opcode: Opcode.ALU, func: AluFunc.XOR, args: 'rd,rs,rt' },
  shl:  { type: 'R', opcode: Opcode.ALU, func: AluFunc.SHL, args: 'rd,rs,rt' },
  shr:  { type: 'R', opcode: Opcode.ALU, func: AluFunc.SHR, args: 'rd,rs,rt' },
  sra:  { type: 'R', opcode: Opcode.ALU, func: AluFunc.SRA, args: 'rd,rs,rt' },
  slt:  { type: 'R', opcode: Opcode.ALU, func: AluFunc.SLT, args: 'rd,rs,rt' },
  mul:  { type: 'R', opcode: Opcode.ALU, func: AluFunc.MUL, args: 'rd,rs,rt' },
  div:  { type: 'R', opcode: Opcode.ALU, func: AluFunc.DIV, args: 'rd,rs,rt' },
  mod:  { type: 'R', opcode: Opcode.ALU, func: AluFunc.MOD, args: 'rd,rs,rt' },
  // I-type
  addi: { type: 'I', opcode: Opcode.ADDI, args: 'rd,rs,imm' },
  lw:   { type: 'I', opcode: Opcode.LW,   args: 'rd,rs,imm' },
  sw:   { type: 'I', opcode: Opcode.SW,    args: 'rd,rs,imm' },
  beq:  { type: 'I', opcode: Opcode.BEQ,   args: 'rd,rs,imm' },
  bne:  { type: 'I', opcode: Opcode.BNE,   args: 'rd,rs,imm' },
  blt:  { type: 'I', opcode: Opcode.BLT,   args: 'rd,rs,imm' },
  bge:  { type: 'I', opcode: Opcode.BGE,   args: 'rd,rs,imm' },
  lui:  { type: 'I', opcode: Opcode.LUI,   args: 'rd,imm' },
  ori:  { type: 'I', opcode: Opcode.ORI,   args: 'rd,rs,imm' },
  andi: { type: 'I', opcode: Opcode.ANDI,  args: 'rd,rs,imm' },
  xori: { type: 'I', opcode: Opcode.XORI,  args: 'rd,rs,imm' },
  slti: { type: 'I', opcode: Opcode.SLTI,  args: 'rd,rs,imm' },
  lb:   { type: 'I', opcode: Opcode.LB,    args: 'rd,rs,imm' },
  sb:   { type: 'I', opcode: Opcode.SB,    args: 'rd,rs,imm' },
  muli: { type: 'I', opcode: Opcode.MULI,  args: 'rd,rs,imm' },
  // J-type
  jmp:  { type: 'J', opcode: Opcode.JMP,   args: 'addr' },
  jal:  { type: 'J', opcode: Opcode.JAL,   args: 'addr' },
  // Special
  jr:   { type: 'special', opcode: Opcode.JR, args: 'rs' },
  halt: { type: 'special', opcode: Opcode.HALT, args: '' },
  // Pseudo-instructions
  nop:  { type: 'special', opcode: -1, args: '' },       // ADD R0, R0, R0
  mov:  { type: 'special', opcode: -2, args: 'rd,rs' },  // ADD Rd, Rs, R0
  li:   { type: 'special', opcode: -3, args: 'rd,imm' }, // ADDI Rd, R0, imm (20-bit signed)
};

export function assemble(source: string): AssemblerResult {
  const lines = source.split('\n');
  const errors: AssemblerError[] = [];
  const labels = new Map<string, number>();
  const sourceMap = new Map<number, number>();
  const instructions: { line: number; mnemonic: string; args: string[] }[] = [];

  // Pass 1: collect labels, strip comments
  let addr = 0;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    // Strip comments
    const commentIdx = line.indexOf(';');
    if (commentIdx !== -1) line = line.slice(0, commentIdx).trim();
    const hashIdx = line.indexOf('#');
    if (hashIdx !== -1) line = line.slice(0, hashIdx).trim();

    if (!line) continue;

    // Check for .data directive
    if (line.startsWith('.data')) {
      const parts = line.split(/\s+/).slice(1);
      for (const p of parts) {
        const val = parseInt(p, 0);
        if (!isNaN(val)) {
          instructions.push({ line: i, mnemonic: '.word', args: [p] });
          addr++;
        }
      }
      continue;
    }

    // Check for label
    if (line.includes(':')) {
      const [labelPart, rest] = line.split(':', 2);
      const label = labelPart.trim();
      if (labels.has(label)) {
        errors.push({ line: i + 1, message: `duplicate label: ${label}` });
      }
      labels.set(label, addr);
      line = (rest || '').trim();
      if (!line) continue;
    }

    // Parse mnemonic and arguments
    const parts = line.split(/[\s,]+/).filter(Boolean);
    if (parts.length === 0) continue;

    const mnemonic = parts[0].toLowerCase();
    const args = parts.slice(1);

    if (!MNEMONICS[mnemonic] && mnemonic !== '.word') {
      errors.push({ line: i + 1, message: `unknown instruction: ${mnemonic}` });
      continue;
    }

    instructions.push({ line: i, mnemonic, args });
    addr++;
  }

  if (errors.length > 0) {
    return { success: false, program: [], errors, labels, sourceMap };
  }

  // Pass 2: encode
  const program: number[] = [];
  addr = 0;

  for (const inst of instructions) {
    sourceMap.set(addr, inst.line);
    const { mnemonic, args } = inst;
    const lineNum = inst.line + 1;

    if (mnemonic === '.word') {
      const val = parseInt(args[0], 0);
      program.push(val >>> 0);
      addr++;
      continue;
    }

    const def = MNEMONICS[mnemonic];
    if (!def) {
      errors.push({ line: lineNum, message: `unknown instruction: ${mnemonic}` });
      addr++;
      continue;
    }

    try {
      let encoded: number;

      // Handle pseudo-instructions
      if (def.opcode === -1) {
        // NOP -> ADD R0, R0, R0
        encoded = encodeR(Opcode.ALU, 0, 0, 0, AluFunc.ADD);
      } else if (def.opcode === -2) {
        // MOV Rd, Rs -> ADD Rd, Rs, R0
        const rd = parseReg(args[0]);
        const rs = parseReg(args[1]);
        if (rd === null || rs === null) throw new Error('invalid register');
        encoded = encodeR(Opcode.ALU, rd, rs, 0, AluFunc.ADD);
      } else if (def.opcode === -3) {
        // LI Rd, imm -> ADDI Rd, R0, imm (20-bit signed immediate)
        const rd = parseReg(args[0]);
        const imm = parseImm(args[1], labels, addr, false);
        if (rd === null) throw new Error('invalid register');
        if (imm === null) throw new Error('invalid immediate');
        encoded = encodeI(Opcode.ADDI, rd, 0, imm);
      } else if (def.type === 'R') {
        const rd = parseReg(args[0]);
        const rs = parseReg(args[1]);
        const rt = parseReg(args[2]);
        if (rd === null || rs === null || rt === null) throw new Error('invalid register');
        encoded = encodeR(def.opcode, rd, rs, rt, def.func ?? 0);
      } else if (def.type === 'I') {
        if (def.args === 'rd,imm') {
          // LUI: only rd and imm
          const rd = parseReg(args[0]);
          const imm = parseImm(args[1], labels, addr, false);
          if (rd === null) throw new Error('invalid register');
          if (imm === null) throw new Error('invalid immediate');
          encoded = encodeI(def.opcode, rd, 0, imm);
        } else {
          const isBranch = def.opcode === Opcode.BEQ || def.opcode === Opcode.BNE ||
                           def.opcode === Opcode.BLT || def.opcode === Opcode.BGE;
          const rd = parseReg(args[0]);
          const rs = parseReg(args[1]);
          const imm = parseImm(args[2], labels, addr, isBranch);
          if (rd === null || rs === null) throw new Error('invalid register');
          if (imm === null) throw new Error(`invalid immediate or unknown label: ${args[2]}`);
          encoded = encodeI(def.opcode, rd, rs, imm);
        }
      } else if (def.type === 'J') {
        const imm = parseImm(args[0], labels, addr, false);
        if (imm === null) throw new Error(`invalid address or unknown label: ${args[0]}`);
        encoded = encodeJ(def.opcode, imm);
      } else if (mnemonic === 'jr') {
        const rs = parseReg(args[0]);
        if (rs === null) throw new Error('invalid register');
        // Encode as R-type with only rs used
        encoded = encodeR(Opcode.JR, 0, rs, 0, 0);
      } else if (mnemonic === 'halt') {
        encoded = encodeJ(Opcode.HALT, 0);
      } else {
        throw new Error('unhandled instruction type');
      }

      program.push(encoded);
    } catch (e) {
      errors.push({ line: lineNum, message: (e as Error).message });
      program.push(0);
    }

    addr++;
  }

  return { success: errors.length === 0, program, errors, labels, sourceMap };
}

// Disassemble a single 32-bit word
export function disassemble(word: number): string {
  word = word >>> 0;
  const opcode = (word >>> 26) & 0x3F;
  const rd     = (word >>> 23) & 0x7;
  const rs     = (word >>> 20) & 0x7;
  const rt     = (word >>> 17) & 0x7;
  const func   = word & 0x1FFFF;
  const imm20  = word & 0xFFFFF;
  const simm20 = signExtend(imm20, 20);
  const addr26 = word & 0x3FFFFFF;

  switch (opcode) {
    case Opcode.ALU: {
      const names: Record<number, string> = {
        [AluFunc.ADD]: 'ADD', [AluFunc.SUB]: 'SUB', [AluFunc.AND]: 'AND',
        [AluFunc.OR]: 'OR',   [AluFunc.XOR]: 'XOR', [AluFunc.SHL]: 'SHL',
        [AluFunc.SHR]: 'SHR', [AluFunc.SRA]: 'SRA', [AluFunc.SLT]: 'SLT',
        [AluFunc.MUL]: 'MUL', [AluFunc.DIV]: 'DIV', [AluFunc.MOD]: 'MOD',
      };
      const name = names[func] ?? `ALU.${func}`;
      return `${name} R${rd}, R${rs}, R${rt}`;
    }
    case Opcode.ADDI: return `ADDI R${rd}, R${rs}, ${simm20}`;
    case Opcode.LW:   return `LW R${rd}, R${rs}, ${simm20}`;
    case Opcode.SW:   return `SW R${rd}, R${rs}, ${simm20}`;
    case Opcode.BEQ:  return `BEQ R${rd}, R${rs}, ${simm20}`;
    case Opcode.BNE:  return `BNE R${rd}, R${rs}, ${simm20}`;
    case Opcode.BLT:  return `BLT R${rd}, R${rs}, ${simm20}`;
    case Opcode.BGE:  return `BGE R${rd}, R${rs}, ${simm20}`;
    case Opcode.LUI:  return `LUI R${rd}, ${imm20}`;
    case Opcode.ORI:  return `ORI R${rd}, R${rs}, ${imm20}`;
    case Opcode.ANDI: return `ANDI R${rd}, R${rs}, ${imm20}`;
    case Opcode.XORI: return `XORI R${rd}, R${rs}, ${imm20}`;
    case Opcode.SLTI: return `SLTI R${rd}, R${rs}, ${simm20}`;
    case Opcode.LB:   return `LB R${rd}, R${rs}, ${simm20}`;
    case Opcode.SB:   return `SB R${rd}, R${rs}, ${simm20}`;
    case Opcode.MULI: return `MULI R${rd}, R${rs}, ${simm20}`;
    case Opcode.JMP:  return `JMP 0x${addr26.toString(16)}`;
    case Opcode.JAL:  return `JAL 0x${addr26.toString(16)}`;
    case Opcode.JR:   return `JR R${rs}`;
    case Opcode.HALT: return 'HALT';
    default: return `.word 0x${word.toString(16).padStart(8, '0')}`;
  }
}
