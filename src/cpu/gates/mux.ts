// Multiplexers built from gates

import { type Bit, type BitArray, type GateTrace, AND, OR, NOT, toBits, fromBits } from './gate';

// 2-to-1 multiplexer: output = sel ? b : a
export function mux2(a: Bit, b: Bit, sel: Bit): { output: Bit; trace: GateTrace } {
  const notSel = NOT(sel);
  const andA = AND(a, notSel);
  const andB = AND(b, sel);
  const output = OR(andA, andB);
  return {
    output,
    trace: {
      gate: 'mux2',
      inputs: { a, b, sel },
      output,
      intermediates: { notSel, andA, andB },
    },
  };
}

// N-bit 2-to-1 multiplexer
export function mux2Wide(a: number, b: number, sel: Bit, width: number = 16): { output: number; traces: GateTrace[] } {
  const aBits = toBits(a, width);
  const bBits = toBits(b, width);
  const outBits: BitArray = [];
  const traces: GateTrace[] = [];

  for (let i = 0; i < width; i++) {
    const result = mux2(aBits[i], bBits[i], sel);
    outBits.push(result.output);
    traces.push(result.trace);
  }

  return { output: fromBits(outBits), traces };
}

// 4-to-1 multiplexer using three 2-to-1 muxes
export function mux4(inputs: [Bit, Bit, Bit, Bit], sel: [Bit, Bit]): { output: Bit; traces: GateTrace[] } {
  const traces: GateTrace[] = [];
  const m0 = mux2(inputs[0], inputs[1], sel[1]);
  traces.push(m0.trace);
  const m1 = mux2(inputs[2], inputs[3], sel[1]);
  traces.push(m1.trace);
  const m2 = mux2(m0.output, m1.output, sel[0]);
  traces.push(m2.trace);
  return { output: m2.output, traces };
}

// 8-to-1 multiplexer for ALU operation selection
export function mux8Wide(
  inputs: number[],
  sel: number,
  width: number = 16
): { output: number; traces: GateTrace[] } {
  // Binary tree of mux2s
  if (inputs.length !== 8) throw new Error('mux8 needs exactly 8 inputs');
  const traces: GateTrace[] = [];
  const selBits = toBits(sel, 3);

  // Layer 1: 4 mux2s select bit 2
  const layer1: number[] = [];
  for (let i = 0; i < 4; i++) {
    const r = mux2Wide(inputs[i * 2], inputs[i * 2 + 1], selBits[2], width);
    layer1.push(r.output);
    traces.push(...r.traces);
  }

  // Layer 2: 2 mux2s select bit 1
  const layer2: number[] = [];
  for (let i = 0; i < 2; i++) {
    const r = mux2Wide(layer1[i * 2], layer1[i * 2 + 1], selBits[1], width);
    layer2.push(r.output);
    traces.push(...r.traces);
  }

  // Layer 3: 1 mux2 select bit 0
  const r = mux2Wide(layer2[0], layer2[1], selBits[0], width);
  traces.push(...r.traces);

  return { output: r.output, traces };
}
