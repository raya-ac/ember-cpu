// Adders built from gates

import { type Bit, type BitArray, type GateTrace, AND, XOR, OR, toBits, fromBits } from './gate';

export interface HalfAdderResult {
  sum: Bit;
  carry: Bit;
  trace: GateTrace;
}

export function halfAdder(a: Bit, b: Bit): HalfAdderResult {
  const sum = XOR(a, b);
  const carry = AND(a, b);
  return {
    sum, carry,
    trace: { gate: 'half-adder', inputs: { a, b }, output: sum, intermediates: { carry } },
  };
}

export interface FullAdderResult {
  sum: Bit;
  carry: Bit;
  trace: GateTrace;
}

export function fullAdder(a: Bit, b: Bit, cin: Bit): FullAdderResult {
  const xorAB = XOR(a, b);
  const sum = XOR(xorAB, cin);
  const andAB = AND(a, b);
  const andXorCin = AND(xorAB, cin);
  const carry = OR(andAB, andXorCin);
  return {
    sum, carry,
    trace: {
      gate: 'full-adder',
      inputs: { a, b, cin },
      output: sum,
      intermediates: { xorAB, andAB, andXorCin, carry },
    },
  };
}

export interface RippleCarryResult {
  sum: BitArray;
  carry: Bit;
  value: number;
  traces: GateTrace[];
}

export function rippleCarryAdder(a: number, b: number, width: number = 16): RippleCarryResult {
  const aBits = toBits(a, width);
  const bBits = toBits(b, width);
  const sumBits: BitArray = new Array(width).fill(0) as BitArray;
  const traces: GateTrace[] = [];
  let carry: Bit = 0;

  // LSB to MSB
  for (let i = width - 1; i >= 0; i--) {
    const result = fullAdder(aBits[i], bBits[i], carry);
    sumBits[i] = result.sum;
    carry = result.carry;
    traces.push(result.trace);
  }

  return { sum: sumBits, carry, value: fromBits(sumBits), traces };
}

// Subtractor: a - b = a + (~b) + 1
export function rippleCarrySubtractor(a: number, b: number, width: number = 16): RippleCarryResult {
  const invertedB = (~b) & ((1 << width) - 1);
  const aBits = toBits(a, width);
  const bBits = toBits(invertedB, width);
  const sumBits: BitArray = new Array(width).fill(0) as BitArray;
  const traces: GateTrace[] = [];
  let carry: Bit = 1; // +1 for two's complement

  for (let i = width - 1; i >= 0; i--) {
    const result = fullAdder(aBits[i], bBits[i], carry);
    sumBits[i] = result.sum;
    carry = result.carry;
    traces.push(result.trace);
  }

  return { sum: sumBits, carry, value: fromBits(sumBits), traces };
}
