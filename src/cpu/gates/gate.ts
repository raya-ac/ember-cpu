// Primitive logic gates — the bottom of the stack

export type Bit = 0 | 1;
export type BitArray = Bit[];

export function toBits(value: number, width: number): BitArray {
  const bits: BitArray = [];
  for (let i = width - 1; i >= 0; i--) {
    bits.push(((value >> i) & 1) as Bit);
  }
  return bits;
}

export function fromBits(bits: BitArray): number {
  let val = 0;
  for (const b of bits) {
    val = (val << 1) | b;
  }
  return val;
}

// Primitive gates
export function NOT(a: Bit): Bit { return (a ? 0 : 1) as Bit; }
export function AND(a: Bit, b: Bit): Bit { return (a & b) as Bit; }
export function OR(a: Bit, b: Bit): Bit { return (a | b) as Bit; }
export function NAND(a: Bit, b: Bit): Bit { return NOT(AND(a, b)); }
export function NOR(a: Bit, b: Bit): Bit { return NOT(OR(a, b)); }
export function XOR(a: Bit, b: Bit): Bit { return ((a ^ b) & 1) as Bit; }
export function XNOR(a: Bit, b: Bit): Bit { return NOT(XOR(a, b)); }

// Gate with trace — returns intermediate signals for visualization
export interface GateTrace {
  gate: string;
  inputs: Record<string, Bit | BitArray>;
  output: Bit | BitArray;
  intermediates?: Record<string, Bit | BitArray>;
}
