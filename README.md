# Ember

A 32-bit CPU I designed from scratch, with its own ISA, assembler, C compiler, and JIT. Runs in the browser as a React app with datapath visualization down to individual logic gates. The goal is running real DOOM on it, using actual WAD data from id Software's original game.

## What's in here

The CPU is a 32-bit Harvard architecture. 8 registers, 20 opcodes, hardware multiply/divide, byte-addressable memory. 32-bit instructions with 20-bit signed immediates, so most constants load in one instruction. 8MB data memory, 64K instruction memory. No pipeline, no cache, no MMU. Intentionally simple.

The assembler turns Ember assembly into machine code. Labels, comments, pseudo-instructions. Straightforward.

EmberC is a C compiler I wrote that targets Ember assembly. Recursive descent parser, produces register-allocated code. Handles most of C89 at this point: structs, unions, enums, typedefs, pointers, arrays, function pointers, switch/case, do-while, goto, sizeof, ternary, a preprocessor with includes and conditionals. Calling convention is R1-R4 for args, R5-R6 callee-saved, R7 as stack pointer. It's not optimizing but it compiles real code.

The JIT translates Ember machine code into JavaScript at runtime. Basic-block level: finds straight-line instruction sequences between branches, compiles them to `new Function()` calls, caches them. With the mutable fast CPU engine this gets about 32 million instructions per second in the browser. Enough for 60fps rendering.

The simulator has an interactive SVG datapath diagram where you can watch data move through the ALU, register file, and memory. There's a gate-level zoom that shows flip-flops, adders, and multiplexers. This is the slow educational path. The fast CPU engine is separate, for running actual programs.

## DOOM

Working toward running DOOM on this CPU. Current state:

The WAD parser reads DOOM1.WAD (shareware) and pulls out level geometry (BSP trees, vertices, linedefs, sectors), the PLAYPAL color palette, COLORMAP light tables, and thing placements. E1M1 parses to 467 vertices, 475 linedefs, 85 sectors, 236 BSP nodes.

There's a DDA raycaster already running on the Ember CPU at 60fps through the JIT. Renders to a 320x200 memory-mapped framebuffer with 8-bit indexed color and 256-entry palette. Framebuffer sits in data memory at word 0x100000, palette at 0x110000, frame-complete signal at 0x110400.

The BSP renderer reads actual DOOM level data and renders walls with the same front-to-back traversal the original game uses. Handles one-sided and two-sided linedefs, ceiling/floor height differences, column clipping, distance projection, sector light levels through the COLORMAP.

I extended EmberC specifically to handle DOOM's C patterns: forward function declarations, extern variables, anonymous enums, struct-typed globals, function pointer typedefs, variadic stubs, comma-separated struct fields, unsized arrays, a preprocessor that handles line continuations, nested macro expansion, and `#if` expressions with `||`/`&&`/`!`.

## Architecture

```
src/
  cpu/              # The CPU
    isa.ts          # Instruction set: opcodes, encoding, decode
    alu.ts          # Arithmetic logic unit
    registers.ts    # Register file (8 x 32-bit)
    memory.ts       # Harvard memory (imem + dmem)
    control.ts      # Control unit
    cpu.ts          # Educational CPU (immutable, traceable)
    fastcpu.ts      # Fast CPU (mutable, 32M IPS, MMIO)
    jit.ts          # Basic-block JIT compiler
    assembler.ts    # Assembler (text -> binary)
    programs.ts     # Example programs

  compiler/         # EmberC
    lexer.ts        # Tokenizer
    parser.ts       # Recursive descent -> AST
    ast.ts          # AST node types
    codegen.ts      # AST -> Ember assembly
    compiler.ts     # Pipeline
    preprocessor.ts # #define, #include, #if
    stdlib.ts       # Stdlib headers + DOOM stubs

  games/            # Standalone games
    DoomReal.tsx    # DOOM with real WAD data
    Doom.tsx        # DDA raycaster (pure JS reference)
    Tetris.tsx      # Tetris on Ember CPU
    wad.ts          # WAD file parser
    doom-renderer.ts # BSP software renderer

  components/       # Simulator UI
    CpuDiagram.tsx  # SVG datapath
    GateView.tsx    # Gate-level zoom
    ...
```

## Running it

```bash
npm install
npm run dev
```

Routes:
- `#/` -- CPU simulator with datapath visualization
- `#/doom` -- DOOM (BSP renderer, real WAD data)
- `#/doom-old` -- DDA raycaster running on Ember CPU
- `#/tetris` -- Tetris on Ember CPU

## ISA

Fixed 32-bit instruction format, three encoding types:

| Type | Format | Usage |
|------|--------|-------|
| R-type | `[6 op][3 rd][3 rs][3 rt][17 func]` | Register-register ALU |
| I-type | `[6 op][3 rd][3 rs][20 imm]` | Immediates, loads, stores, branches |
| J-type | `[6 op][26 addr]` | Jumps |

20-bit signed immediates, so most constants are one instruction. 12 ALU ops: ADD, SUB, AND, OR, XOR, SLT, SLL, SRL, SRA, MUL, DIV, MOD. Memory-mapped I/O for keyboard, text output, framebuffer, palette, timer.

## What's left

Moving the BSP renderer from TypeScript into EmberC so it runs on the CPU itself. After that: sprites, game logic, doors, shooting. Sound is probably just going to be a stub since there's no audio hardware. Eventually want to compile enough of the original DOOM C source through EmberC to run game logic natively on Ember.

## Stack

Vite, React 19, TypeScript, Tailwind v4, shadcn/ui
