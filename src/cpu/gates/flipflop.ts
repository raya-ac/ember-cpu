// Flip-flops and register built from gates

import { type Bit, type BitArray, type GateTrace, NAND, AND, toBits, fromBits } from './gate';

// SR Latch from NAND gates
export function srLatch(s: Bit, r: Bit, prevQ: Bit): { q: Bit; qBar: Bit; trace: GateTrace } {
  // Cross-coupled NAND gates
  // In real hardware this is feedback. We simulate steady state.
  let q: Bit;
  if (s === 0 && r === 0) {
    q = prevQ; // hold
  } else if (s === 0 && r === 1) {
    q = 0; // reset
  } else if (s === 1 && r === 0) {
    q = 1; // set
  } else {
    q = prevQ; // invalid — treat as hold
  }
  const qBar = NAND(q, 1 as Bit); // simplified
  return {
    q, qBar,
    trace: { gate: 'sr-latch', inputs: { s, r, prevQ }, output: q },
  };
}

// D Flip-Flop (edge-triggered, simplified)
export function dFlipFlop(
  d: Bit,
  clk: Bit,
  enable: Bit,
  prevQ: Bit
): { q: Bit; trace: GateTrace } {
  // On rising edge (clk=1) with enable: capture D
  const gatedClk = AND(clk, enable);
  const q: Bit = gatedClk ? d : prevQ;
  return {
    q,
    trace: {
      gate: 'd-flipflop',
      inputs: { d, clk, enable, prevQ },
      output: q,
      intermediates: { gatedClk },
    },
  };
}

// N-bit register from D flip-flops
export function registerFromFlipFlops(
  data: number,
  clk: Bit,
  writeEnable: Bit,
  prevValue: number,
  width: number = 16
): { value: number; traces: GateTrace[] } {
  const dataBits = toBits(data, width);
  const prevBits = toBits(prevValue, width);
  const outBits: BitArray = [];
  const traces: GateTrace[] = [];

  for (let i = 0; i < width; i++) {
    const result = dFlipFlop(dataBits[i], clk, writeEnable, prevBits[i]);
    outBits.push(result.q);
    traces.push(result.trace);
  }

  return { value: fromBits(outBits), traces };
}
