// Register file — 8x32-bit, R0 hardwired to zero

import { NUM_REGISTERS } from './isa';

export interface RegisterFile {
  values: number[];
}

export function createRegisters(): RegisterFile {
  return { values: new Array(NUM_REGISTERS).fill(0) };
}

export function readReg(rf: RegisterFile, index: number): number {
  if (index === 0) return 0; // R0 always zero
  return rf.values[index & 0x7] >>> 0;
}

export function writeReg(rf: RegisterFile, index: number, value: number): RegisterFile {
  if (index === 0) return rf; // Can't write R0
  const values = [...rf.values];
  values[index & 0x7] = value >>> 0;
  return { values };
}
