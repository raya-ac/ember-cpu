# Ember

A 32-bit CPU I built from scratch. Custom ISA, assembler, C compiler, JIT. Runs in the browser with full datapath visualization down to the gate level. It runs DOOM.

## DOOM

The full game, 60fps. All nine shareware levels, every enemy, every texture. Every frame goes through the Ember CPU's memory-mapped framebuffer.

How it works: DOOM is compiled to WebAssembly via Emscripten (doomgeneric port, 8-bit indexed color). Runs in an isolated iframe. Each frame, the pixel buffer gets posted to the parent and written into Ember CPU data memory. A display controller program written in Ember assembly copies those pixels to the framebuffer, and the canvas reads them back out through the PLAYPAL palette. The CPU is in the loop for every pixel.

WASD to move, arrows to turn, Space to fire, E to open doors, Shift to run, Escape for menu.

`/doom.html` has a standalone SDL build if you just want to play without the CPU in the middle.

## The CPU

32-bit Harvard architecture. 8 registers, 20 opcodes, hardware multiply/divide. 32-bit instructions, 20-bit signed immediates. 8MB data memory, 64K instruction memory. No pipeline, no cache, no MMU.

The JIT compiles Ember machine code to JavaScript at runtime, basic block at a time. ~32 million instructions per second in the browser.

There's also a simulator with an interactive SVG datapath diagram and a gate-level zoom that shows the actual flip-flops and multiplexers. Slow, but you can watch every signal.

## EmberC

C compiler targeting Ember assembly. Recursive descent parser, register allocated output, most of C89. Structs, unions, enums, typedefs, pointers, arrays, function pointers, switch/case, goto, sizeof, ternary, preprocessor. R1-R4 args, R5-R6 callee saved, R7 stack pointer.

I had to bolt on a bunch of stuff to get DOOM's headers to parse: forward declarations, anonymous enums, struct typed globals, function pointer typedefs, variadic stubs, comma separated struct fields, unsized arrays, line continuations, nested macro expansion, `#if` with `||`/`&&`/`!`.

## Running it

```bash
npm install
npm run dev
```

- `#/doom` -- DOOM on the Ember CPU
- `#/` -- CPU simulator
- `#/tetris` -- Tetris on Ember CPU
- `/doom.html` -- standalone DOOM (SDL/WASM)

## Architecture

```
src/
  cpu/              # CPU core
    isa.ts          # Opcodes, encoding
    alu.ts          # ALU
    fastcpu.ts      # Fast engine (32M IPS, MMIO)
    jit.ts          # JIT compiler
    assembler.ts    # Assembler
    cpu.ts          # Educational CPU (traceable)

  compiler/         # EmberC
    lexer.ts
    parser.ts       # Recursive descent
    codegen.ts      # AST -> assembly
    preprocessor.ts
    stdlib.ts

  games/
    DoomReal.tsx    # DOOM on CPU (WASM bridge)
    wad.ts          # WAD parser
    doom-renderer.ts
    Tetris.tsx

  components/       # Simulator UI
    CpuDiagram.tsx  # Datapath SVG
    GateView.tsx    # Gate zoom

public/
  doom-frame.html   # WASM DOOM iframe
  doom-ember.*      # Compiled DOOM
  doom.html         # Standalone DOOM
  DOOM1.WAD
```

## ISA

Three instruction formats, all 32 bits:

| Type | Format | What |
|------|--------|------|
| R | `[6 op][3 rd][3 rs][3 rt][17 func]` | ALU register ops |
| I | `[6 op][3 rd][3 rs][20 imm]` | Immediates, loads, stores, branches |
| J | `[6 op][26 addr]` | Jumps |

12 ALU ops: ADD, SUB, AND, OR, XOR, SLT, SLL, SRL, SRA, MUL, DIV, MOD.

## Stack

Vite, React 19, TypeScript, Tailwind v4, shadcn/ui
