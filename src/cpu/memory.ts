// Memory — Harvard architecture (separate instruction and data memory)
// 32-bit words, Uint32Array backing

import { IMEM_SIZE, DMEM_SIZE } from './isa';

export interface Memory {
  data: Uint32Array;
}

export function createInstructionMemory(): Memory {
  return { data: new Uint32Array(IMEM_SIZE) };
}

export function createDataMemory(): Memory {
  return { data: new Uint32Array(DMEM_SIZE) };
}

// Backward-compatible alias — creates data memory
export function createMemory(): Memory {
  return createDataMemory();
}

export function memRead(mem: Memory, addr: number): number {
  addr = addr & (mem.data.length - 1);
  return mem.data[addr] >>> 0;
}

export function memWrite(mem: Memory, addr: number, value: number): Memory {
  addr = addr & (mem.data.length - 1);
  const data = new Uint32Array(mem.data);
  data[addr] = value >>> 0;
  return { data };
}

// Byte read: extract byte from a 32-bit word
// byteAddr is a byte-level address. Word index = byteAddr >>> 2, byte offset = byteAddr & 3
// Byte 0 is MSB (big-endian within word for simplicity), but we'll use little-endian:
// byte 0 = bits 7..0, byte 1 = bits 15..8, byte 2 = bits 23..16, byte 3 = bits 31..24
export function memReadByte(mem: Memory, byteAddr: number): number {
  const wordIdx = (byteAddr >>> 2) & (mem.data.length - 1);
  const byteOff = byteAddr & 3;
  const word = mem.data[wordIdx] >>> 0;
  return (word >>> (byteOff * 8)) & 0xFF;
}

// Byte write: modify one byte within a 32-bit word
export function memWriteByte(mem: Memory, byteAddr: number, value: number): Memory {
  const wordIdx = (byteAddr >>> 2) & (mem.data.length - 1);
  const byteOff = byteAddr & 3;
  const data = new Uint32Array(mem.data);
  const mask = ~(0xFF << (byteOff * 8));
  data[wordIdx] = ((data[wordIdx] & mask) | ((value & 0xFF) << (byteOff * 8))) >>> 0;
  return { data };
}

export function loadProgram(mem: Memory, program: number[], startAddr: number = 0): Memory {
  const data = new Uint32Array(mem.data);
  for (let i = 0; i < program.length; i++) {
    data[(startAddr + i) & (mem.data.length - 1)] = program[i] >>> 0;
  }
  return { data };
}
