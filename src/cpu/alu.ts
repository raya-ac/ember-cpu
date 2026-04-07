// ALU — 12 operations on 32-bit values

import { AluFunc } from './isa';

export interface AluResult {
  result: number;
  zero: boolean;
  negative: boolean;
  carry: boolean;
  overflow: boolean;
}

export function aluExecute(op: number, a: number, b: number): AluResult {
  // Ensure unsigned 32-bit inputs
  a = a >>> 0;
  b = b >>> 0;

  let result: number;
  let carry = false;

  switch (op) {
    case AluFunc.ADD: {
      const full = a + b;
      result = full >>> 0;
      carry = full > 0xFFFFFFFF;
      break;
    }
    case AluFunc.SUB: {
      const full = a - b;
      result = full >>> 0;
      carry = a < b; // borrow
      break;
    }
    case AluFunc.AND:
      result = (a & b) >>> 0;
      break;
    case AluFunc.OR:
      result = (a | b) >>> 0;
      break;
    case AluFunc.XOR:
      result = (a ^ b) >>> 0;
      break;
    case AluFunc.SHL:
      result = (a << (b & 0x1F)) >>> 0;
      break;
    case AluFunc.SHR:
      result = (a >>> (b & 0x1F)) >>> 0;
      break;
    case AluFunc.SRA: {
      // Arithmetic right shift — sign-extending
      result = (a >> (b & 0x1F)) >>> 0;
      break;
    }
    case AluFunc.SLT: {
      // Signed comparison
      const sa = a | 0;
      const sb = b | 0;
      result = sa < sb ? 1 : 0;
      break;
    }
    case AluFunc.MUL: {
      result = Math.imul(a | 0, b | 0) >>> 0;
      break;
    }
    case AluFunc.DIV: {
      // Signed division
      const sa = a | 0;
      const sb = b | 0;
      result = sb !== 0 ? ((sa / sb) | 0) >>> 0 : 0;
      break;
    }
    case AluFunc.MOD: {
      // Signed modulo
      const sa = a | 0;
      const sb = b | 0;
      result = sb !== 0 ? ((sa % sb) | 0) >>> 0 : 0;
      break;
    }
    default:
      result = 0;
  }

  result = result >>> 0;
  const zero = result === 0;
  const negative = (result & 0x80000000) !== 0;
  // Overflow: sign of inputs same but sign of result different (ADD/SUB only)
  const overflow = (op === AluFunc.ADD || op === AluFunc.SUB) &&
    ((a ^ result) & (op === AluFunc.ADD ? (b ^ result) : (~b ^ result)) & 0x80000000) !== 0;

  return { result, zero, negative, carry, overflow };
}
