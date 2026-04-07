// EmberC Code Generator — AST → Ember assembly text
//
// Register allocation:
//   R0 = zero (hardwired)
//   R1 = return value / first arg / expression temp
//   R2-R4 = args / expression temps (caller-saved)
//   R5-R6 = callee-saved
//   R7 = stack pointer

import type { Expr, Stmt, Decl, Program, Type } from './ast';
import { typeSize, structLayouts, type StructLayout } from './ast';

interface Symbol {
  name: string;
  type: Type;
  location: 'global' | 'local' | 'param';
  offset: number; // global: absolute address, local: offset from SP, param: offset from SP
}

interface FuncInfo {
  name: string;
  params: { type: Type; name: string }[];
  localSize: number;
  isLeaf: boolean; // doesn't call other functions
}

export function codegen(program: Program): string {
  const lines: string[] = [];
  let labelCounter = 0;
  const globals = new Map<string, Symbol>();
  let globalOffset = 0; // next free global address
  const constPool = new Map<number, number>(); // value → address
  let constPoolAddr = 200; // constant pool starts at addr 200
  const breakLabels: string[] = [];
  const continueLabels: string[] = [];

  function emit(line: string) { lines.push(line); }
  function label(name: string) { emit(`${name}:`); }
  function newLabel(prefix: string): string { return `_${prefix}_${labelCounter++}`; }
  function comment(text: string) { emit(`  ; ${text}`); }

  // Register names for expression evaluation
  // We use a simple stack-based approach: expressions push results to a "register stack"
  let regStack = 1; // next available register (R1-R4)
  function allocReg(): number {
    if (regStack > 4) {
      // Spill to stack
      emit(`  addi  R7, R7, -1`);
      emit(`  sw    R4, R7, 0`);
      return 4;
    }
    return regStack++;
  }
  function freeReg() { if (regStack > 1) regStack--; }
  function resetRegs() { regStack = 1; }

  // Load a constant into a register — 20-bit signed immediate covers most values
  function loadConst(reg: number, value: number) {
    value = value & 0xFFFFFFFF;
    const signed = (value & 0x80000000) ? value - 0x100000000 : value;

    if (signed >= -524288 && signed <= 524287) {
      // Fits in 20-bit signed immediate
      emit(`  addi  R${reg}, R0, ${signed}`);
    } else {
      // Need LUI + ORI for larger values
      const upper = (value >>> 12) & 0xFFFFF;
      const lower = value & 0xFFF;
      emit(`  lui   R${reg}, ${upper}`);
      if (lower > 0) emit(`  ori   R${reg}, R${reg}, ${lower}`);
    }
  }

  // Stack operations
  function pushReg(reg: number) {
    emit(`  addi  R7, R7, -1`);
    emit(`  sw    R${reg}, R7, 0`);
  }
  function popReg(reg: number) {
    emit(`  lw    R${reg}, R7, 0`);
    emit(`  addi  R7, R7, 1`);
  }

  // Enum constant values — treated as compile-time constants
  const enumConstants = new Map<string, number>();

  // Typedef map — maps alias to underlying type
  const typedefs = new Map<string, Type>();

  // Goto labels within the current function
  const gotoLabels = new Map<string, string>();

  // Resolve typedef'd type names
  function resolveType(t: Type): Type {
    if (t.kind === 'named') {
      const resolved = typedefs.get(t.name);
      if (resolved) return resolveType(resolved);
      return { kind: 'int' }; // fallback
    }
    return t;
  }

  // === Pass 1: Collect globals, enums, typedefs, struct layouts ===
  for (const decl of program.decls) {
    if (decl.kind === 'var_decl') {
      const size = typeSize(resolveType(decl.type), structLayouts);
      globals.set(decl.name, { name: decl.name, type: decl.type, location: 'global', offset: globalOffset });
      globalOffset += Math.max(1, size);
    } else if (decl.kind === 'array_decl') {
      globals.set(decl.name, { name: decl.name, type: { kind: 'array', base: decl.type, size: decl.size }, location: 'global', offset: globalOffset });
      const elemSize = typeSize(resolveType(decl.type), structLayouts);
      globalOffset += decl.size * Math.max(1, elemSize);
    } else if (decl.kind === 'enum_decl') {
      for (const v of decl.values) {
        enumConstants.set(v.name, v.value);
      }
    } else if (decl.kind === 'typedef') {
      typedefs.set(decl.name, decl.type);
    } else if (decl.kind === 'struct_decl' && decl.fields.length > 0) {
      const fields = [];
      let offset = 0;
      for (const f of decl.fields) {
        const size = typeSize(resolveType(f.type), structLayouts);
        fields.push({ name: f.name, type: f.type, offset });
        offset += Math.max(1, size);
      }
      structLayouts.set(decl.name, { fields, totalSize: offset });
    } else if (decl.kind === 'union_decl' && decl.fields.length > 0) {
      const fields = [];
      let maxSize = 0;
      for (const f of decl.fields) {
        const size = typeSize(resolveType(f.type), structLayouts);
        fields.push({ name: f.name, type: f.type, offset: 0 }); // all at offset 0
        maxSize = Math.max(maxSize, Math.max(1, size));
      }
      structLayouts.set(decl.name, { fields, totalSize: maxSize });
    }
  }

  // === Emit startup code ===
  emit('; === EmberC compiled output ===');
  emit('');

  // Initialize stack pointer
  comment('Initialize stack pointer');
  loadConst(7, 0x1FFFFC); // SP = top of data memory, below I/O addresses
  emit('');

  // Initialize globals
  for (const decl of program.decls) {
    if (decl.kind === 'var_decl' && decl.init) {
      const sym = globals.get(decl.name)!;
      comment(`global ${decl.name} = ...`);
      emitExpr(decl.init, 1, new Map());
      storeGlobal(1, sym.offset);
      resetRegs();
    } else if (decl.kind === 'array_decl' && decl.init) {
      const sym = globals.get(decl.name)!;
      comment(`global ${decl.name}[] init`);
      for (let i = 0; i < decl.init.length; i++) {
        emitExpr(decl.init[i], 1, new Map());
        loadConst(2, sym.offset + i);
        emit(`  sw    R1, R2, 0`);
        resetRegs();
      }
    }
  }

  // Jump to main
  emit('');
  emit('  jmp   _main');
  emit('');

  // === Emit functions ===
  for (const decl of program.decls) {
    if (decl.kind === 'func_decl') {
      emitFunction(decl);
    }
  }

  return lines.join('\n');

  // === Helper: load/store globals ===
  function loadGlobal(destReg: number, addr: number) {
    if (addr >= -32 && addr <= 31) {
      emit(`  lw    R${destReg}, R0, ${addr}`);
    } else {
      loadConst(destReg, addr);
      emit(`  lw    R${destReg}, R${destReg}, 0`);
    }
  }
  function storeGlobal(srcReg: number, addr: number) {
    if (addr >= 0 && addr <= 31) {
      emit(`  sw    R${srcReg}, R0, ${addr}`);
    } else {
      // Need a temp register. Use R6 as scratch (callee-saved, but we're in init)
      const tmp = srcReg === 6 ? 5 : 6;
      loadConst(tmp, addr);
      emit(`  sw    R${srcReg}, R${tmp}, 0`);
    }
  }

  // === Emit function ===
  function emitFunction(decl: Extract<Decl, { kind: 'func_decl' }>) {
    const locals = new Map<string, Symbol>();
    let localOffset = 0;

    // Check if this function calls others (non-leaf)
    const isLeaf = !bodyCallsFunction(decl.body);

    emit('');
    label(`_${decl.name}`);

    // Prologue: save return address (if non-leaf)
    if (!isLeaf) {
      pushReg(7); // save RA (R7 has return addr from JAL)
      // Wait — JAL puts return addr in R7, but R7 is also our SP.
      // We need a different convention. Let's use R6 to save RA temporarily.
      // Actually, let's reconsider: JAL sets R7 = PC+1. But R7 is SP.
      // Solution: Caller pushes return address before calling.
      // Actually, simplest: the calling convention stores RA on stack explicitly.
    }

    // Set up params in locals
    for (let i = 0; i < decl.params.length; i++) {
      const p = decl.params[i];
      locals.set(p.name, { name: p.name, type: p.type, location: 'param', offset: i + 1 }); // R1-R4
    }

    // Count local variables
    countLocals(decl.body, locals, localOffset);
    localOffset = locals.size - decl.params.length;

    // Allocate space for locals on stack
    if (localOffset > 0) {
      comment(`allocate ${localOffset} locals`);
      loadConst(1, -localOffset);
      emit(`  add   R7, R7, R1`);
    }

    // Emit body
    emitStmt(decl.body, locals, `_${decl.name}_ret`);

    // Return label
    label(`_${decl.name}_ret`);

    // Epilogue: deallocate locals + return
    if (localOffset > 0) {
      loadConst(1, localOffset);
      emit(`  add   R7, R7, R1`);
    }
    if (decl.name === 'main') {
      emit('  halt');
    } else {
      // For now, simple return: JR to saved address
      // The caller pushed RA before JAL
      popReg(6); // pop return address into R6
      emit('  jr    R6');
    }
    emit('');
  }

  function countLocals(stmt: Stmt, locals: Map<string, Symbol>, offset: number): number {
    if (stmt.kind === 'var_decl' && !locals.has(stmt.name)) {
      locals.set(stmt.name, { name: stmt.name, type: stmt.type, location: 'local', offset });
      return offset + 1;
    }
    if (stmt.kind === 'block') {
      let off = offset;
      for (const s of stmt.stmts) off = countLocals(s, locals, off);
      return off;
    }
    if (stmt.kind === 'if') {
      let off = countLocals(stmt.then, locals, offset);
      if (stmt.else_) off = countLocals(stmt.else_, locals, off);
      return off;
    }
    if (stmt.kind === 'while' || stmt.kind === 'for') {
      if (stmt.kind === 'for' && stmt.init) offset = countLocals(stmt.init, locals, offset);
      return countLocals(stmt.body, locals, offset);
    }
    if (stmt.kind === 'switch') return countLocals(stmt.body, locals, offset);
    if (stmt.kind === 'case') return countLocals(stmt.body, locals, offset);
    if (stmt.kind === 'default') return countLocals(stmt.body, locals, offset);
    if (stmt.kind === 'do_while') return countLocals(stmt.body, locals, offset);
    if (stmt.kind === 'label') return countLocals(stmt.body, locals, offset);
    return offset;
  }

  function bodyCallsFunction(stmt: Stmt): boolean {
    if (stmt.kind === 'expr' && exprCallsFunction(stmt.expr)) return true;
    if (stmt.kind === 'var_decl' && stmt.init && exprCallsFunction(stmt.init)) return true;
    if (stmt.kind === 'block') return stmt.stmts.some(bodyCallsFunction);
    if (stmt.kind === 'if') return bodyCallsFunction(stmt.then) || (stmt.else_ ? bodyCallsFunction(stmt.else_) : false);
    if (stmt.kind === 'while') return bodyCallsFunction(stmt.body);
    if (stmt.kind === 'for') return bodyCallsFunction(stmt.body);
    if (stmt.kind === 'return' && stmt.value && exprCallsFunction(stmt.value)) return true;
    if (stmt.kind === 'switch') return exprCallsFunction(stmt.expr) || bodyCallsFunction(stmt.body);
    if (stmt.kind === 'case') return exprCallsFunction(stmt.value) || bodyCallsFunction(stmt.body);
    if (stmt.kind === 'default') return bodyCallsFunction(stmt.body);
    if (stmt.kind === 'do_while') return bodyCallsFunction(stmt.body) || exprCallsFunction(stmt.cond);
    if (stmt.kind === 'label') return bodyCallsFunction(stmt.body);
    return false;
  }

  function exprCallsFunction(expr: Expr): boolean {
    if (expr.kind === 'call' || expr.kind === 'call_indirect') return true;
    if (expr.kind === 'binary') return exprCallsFunction(expr.left) || exprCallsFunction(expr.right);
    if (expr.kind === 'unary') return exprCallsFunction(expr.operand);
    if (expr.kind === 'assign') return exprCallsFunction(expr.value);
    if (expr.kind === 'index') return exprCallsFunction(expr.array) || exprCallsFunction(expr.index);
    if (expr.kind === 'ternary') return exprCallsFunction(expr.then) || exprCallsFunction(expr.else_);
    if (expr.kind === 'comma') return exprCallsFunction(expr.left) || exprCallsFunction(expr.right);
    if (expr.kind === 'compound_assign') return exprCallsFunction(expr.value);
    return false;
  }

  // === Emit expression → result in destReg ===
  function emitExpr(expr: Expr, destReg: number, locals: Map<string, Symbol>) {
    switch (expr.kind) {
      case 'number':
        loadConst(destReg, expr.value);
        break;

      case 'bool':
        loadConst(destReg, expr.value ? 1 : 0);
        break;

      case 'char':
        loadConst(destReg, expr.value.charCodeAt(0));
        break;

      case 'null':
        emit(`  addi  R${destReg}, R0, 0`);
        break;

      case 'ident': {
        // Check enum constants first
        const enumVal = enumConstants.get(expr.name);
        if (enumVal !== undefined) {
          loadConst(destReg, enumVal);
          break;
        }
        const sym = locals.get(expr.name) ?? globals.get(expr.name);
        if (!sym) {
          // Might be a function name — load its address
          const isFunc = program.decls.some(d =>
            (d.kind === 'func_decl' || d.kind === 'forward_func_decl') && d.name === expr.name);
          if (isFunc) {
            comment(`function address: ${expr.name}`);
            emit(`  li    R${destReg}, _${expr.name}`);
            break;
          }
          throw new Error(`undefined variable: ${expr.name}`);
        }
        if (sym.location === 'global') {
          loadGlobal(destReg, sym.offset);
        } else if (sym.location === 'local') {
          emit(`  lw    R${destReg}, R7, ${sym.offset}`);
        } else if (sym.location === 'param') {
          emit(`  lw    R${destReg}, R7, ${sym.offset}`);
        }
        break;
      }

      case 'binary': {
        emitExpr(expr.left, destReg, locals);
        const rightReg = destReg === 1 ? 2 : destReg === 2 ? 3 : 4;
        // Save left result if right might clobber it
        if (rightReg === destReg) {
          pushReg(destReg);
          emitExpr(expr.right, rightReg, locals);
          popReg(destReg);
        } else {
          emitExpr(expr.right, rightReg, locals);
        }

        switch (expr.op) {
          case '+': emit(`  add   R${destReg}, R${destReg}, R${rightReg}`); break;
          case '-': emit(`  sub   R${destReg}, R${destReg}, R${rightReg}`); break;
          case '&': emit(`  and   R${destReg}, R${destReg}, R${rightReg}`); break;
          case '|': emit(`  or    R${destReg}, R${destReg}, R${rightReg}`); break;
          case '^': emit(`  xor   R${destReg}, R${destReg}, R${rightReg}`); break;
          case '<<': emit(`  shl   R${destReg}, R${destReg}, R${rightReg}`); break;
          case '>>': emit(`  shr   R${destReg}, R${destReg}, R${rightReg}`); break;
          case '<': emit(`  slt   R${destReg}, R${destReg}, R${rightReg}`); break;
          case '>': emit(`  slt   R${destReg}, R${rightReg}, R${destReg}`); break;
          case '==': {
            emit(`  sub   R${destReg}, R${destReg}, R${rightReg}`);
            // R == 0 → set 1, else 0. Use: SLT + trick
            const lbl = newLabel('eq');
            emit(`  li    R${rightReg}, 0`);
            emit(`  beq   R${destReg}, R${rightReg}, ${lbl}_t`);
            emit(`  li    R${destReg}, 0`);
            emit(`  jmp   ${lbl}_e`);
            label(`${lbl}_t`);
            emit(`  li    R${destReg}, 1`);
            label(`${lbl}_e`);
            break;
          }
          case '!=': {
            emit(`  sub   R${destReg}, R${destReg}, R${rightReg}`);
            const lbl = newLabel('ne');
            emit(`  li    R${rightReg}, 0`);
            emit(`  bne   R${destReg}, R${rightReg}, ${lbl}_t`);
            emit(`  li    R${destReg}, 0`);
            emit(`  jmp   ${lbl}_e`);
            label(`${lbl}_t`);
            emit(`  li    R${destReg}, 1`);
            label(`${lbl}_e`);
            break;
          }
          case '<=': {
            // a <= b  ⟺  !(b < a)
            emit(`  slt   R${destReg}, R${rightReg}, R${destReg}`);
            // Negate: xor with 1
            emit(`  li    R${rightReg}, 1`);
            emit(`  xor   R${destReg}, R${destReg}, R${rightReg}`);
            break;
          }
          case '>=': {
            // a >= b  ⟺  !(a < b)
            emit(`  slt   R${destReg}, R${destReg}, R${rightReg}`);
            emit(`  li    R${rightReg}, 1`);
            emit(`  xor   R${destReg}, R${destReg}, R${rightReg}`);
            break;
          }
          case '*': emit(`  mul   R${destReg}, R${destReg}, R${rightReg}`); break;
          case '/': emit(`  div   R${destReg}, R${destReg}, R${rightReg}`); break;
          case '%': emit(`  mod   R${destReg}, R${destReg}, R${rightReg}`); break;
          case '&&': {
            const lbl = newLabel('and');
            emit(`  li    R${rightReg}, 0`);
            emit(`  beq   R${destReg}, R${rightReg}, ${lbl}_f`);
            emitExpr(expr.right, destReg, locals);
            emit(`  li    R${rightReg}, 0`);
            emit(`  bne   R${destReg}, R${rightReg}, ${lbl}_t`);
            label(`${lbl}_f`);
            emit(`  li    R${destReg}, 0`);
            emit(`  jmp   ${lbl}_e`);
            label(`${lbl}_t`);
            emit(`  li    R${destReg}, 1`);
            label(`${lbl}_e`);
            break;
          }
          case '||': {
            const lbl = newLabel('or');
            emit(`  li    R${rightReg}, 0`);
            emit(`  bne   R${destReg}, R${rightReg}, ${lbl}_t`);
            emitExpr(expr.right, destReg, locals);
            emit(`  li    R${rightReg}, 0`);
            emit(`  bne   R${destReg}, R${rightReg}, ${lbl}_t`);
            emit(`  li    R${destReg}, 0`);
            emit(`  jmp   ${lbl}_e`);
            label(`${lbl}_t`);
            emit(`  li    R${destReg}, 1`);
            label(`${lbl}_e`);
            break;
          }
          default:
            comment(`TODO: operator ${expr.op}`);
        }
        break;
      }

      case 'unary':
        emitExpr(expr.operand, destReg, locals);
        if (expr.op === '-') {
          emit(`  sub   R${destReg}, R0, R${destReg}`); // negate
        } else if (expr.op === '!') {
          const lbl = newLabel('not');
          const tmp = destReg === 1 ? 2 : 1;
          emit(`  li    R${tmp}, 0`);
          emit(`  beq   R${destReg}, R${tmp}, ${lbl}_t`);
          emit(`  li    R${destReg}, 0`);
          emit(`  jmp   ${lbl}_e`);
          label(`${lbl}_t`);
          emit(`  li    R${destReg}, 1`);
          label(`${lbl}_e`);
        } else if (expr.op === '~') {
          // Bitwise NOT: XOR with 0xFFFFFFFF
          loadConst(destReg === 1 ? 2 : 1, 0xFFFFFFFF);
          emit(`  xor   R${destReg}, R${destReg}, R${destReg === 1 ? 2 : 1}`);
        } else if (expr.op === '++') {
          emit(`  addi  R${destReg}, R${destReg}, 1`);
          // Store back
          emitStore(expr.operand, destReg, locals);
        } else if (expr.op === '--') {
          emit(`  addi  R${destReg}, R${destReg}, -1`);
          emitStore(expr.operand, destReg, locals);
        }
        break;

      case 'assign':
        emitExpr(expr.value, destReg, locals);
        emitStore(expr.target, destReg, locals);
        break;

      case 'compound_assign': {
        // target op= value  →  target = target op value
        const synthesized: Expr = {
          kind: 'assign',
          target: expr.target,
          value: { kind: 'binary', op: expr.op, left: expr.target, right: expr.value, loc: expr.loc },
          loc: expr.loc,
        };
        emitExpr(synthesized, destReg, locals);
        break;
      }

      case 'call': {
        // Built-in functions
        if (expr.callee === 'print') {
          emitExpr(expr.args[0], 1, locals);
          // Write to I/O port 0x1FFFFF
          loadConst(2, 0x1FFFFF);
          emit('  sw    R1, R2, 0');
          if (destReg !== 1) emit(`  mov   R${destReg}, R1`);
          break;
        }
        if (expr.callee === 'putchar') {
          emitExpr(expr.args[0], 1, locals);
          loadConst(2, 0x1FFFFE);
          emit('  sw    R1, R2, 0');
          break;
        }
        if (expr.callee === 'input') {
          loadConst(destReg, 0x1FFFFD);
          emit(`  lw    R${destReg}, R${destReg}, 0`);
          break;
        }

        // Regular function call
        // Push args to R1-R4 (first 4 args)
        for (let i = 0; i < Math.min(expr.args.length, 4); i++) {
          emitExpr(expr.args[i], i + 1, locals);
        }

        // Save caller-saved registers and return address
        pushReg(7); // save SP as RA placeholder
        // Store current PC+2 as return address
        // Actually we use JAL which saves PC+1 to R7, but R7 is SP...
        // Workaround: save SP to temp, JAL, restore SP
        emit(`  mov   R6, R7`); // save SP
        emit(`  jal   _${expr.callee}`);
        emit(`  mov   R7, R6`); // restore SP
        popReg(6); // clean up RA placeholder

        if (destReg !== 1) emit(`  mov   R${destReg}, R1`);
        break;
      }

      case 'index': {
        // array[index] → load MEM[base + index]
        const arrSym = expr.array.kind === 'ident' ? (locals.get(expr.array.name) ?? globals.get(expr.array.name)) : null;

        if (arrSym && arrSym.location === 'global') {
          // Compute base + index
          emitExpr(expr.index, destReg, locals);
          loadConst(destReg === 1 ? 2 : 1, arrSym.offset);
          emit(`  add   R${destReg}, R${destReg}, R${destReg === 1 ? 2 : 1}`);
          emit(`  lw    R${destReg}, R${destReg}, 0`);
        } else {
          // Generic: evaluate array expr to get base pointer, then add index
          emitExpr(expr.array, destReg, locals);
          const idxReg = destReg === 1 ? 2 : 1;
          pushReg(destReg);
          emitExpr(expr.index, idxReg, locals);
          popReg(destReg);
          emit(`  add   R${destReg}, R${destReg}, R${idxReg}`);
          emit(`  lw    R${destReg}, R${destReg}, 0`);
        }
        break;
      }

      case 'string': {
        // Store string bytes in data memory, return pointer
        const strAddr = globalOffset;
        for (let i = 0; i < expr.value.length; i++) {
          globalOffset++; // each char takes a word for simplicity
        }
        globalOffset++; // null terminator
        loadConst(destReg, strAddr);
        break;
      }

      case 'cast':
        // All types are 32-bit words — casts are no-ops
        emitExpr(expr.operand, destReg, locals);
        break;

      case 'sizeof_type': {
        const size = typeSize(resolveType(expr.type), structLayouts);
        loadConst(destReg, Math.max(1, size));
        break;
      }

      case 'sizeof_expr':
        // sizeof(expr) — just use 1 (everything is a word)
        loadConst(destReg, 1);
        break;

      case 'ternary': {
        const lblElse = newLabel('tern_f');
        const lblEnd = newLabel('tern_e');
        emitExpr(expr.cond, destReg, locals);
        emit(`  li    R${destReg === 1 ? 2 : 1}, 0`);
        emit(`  beq   R${destReg}, R${destReg === 1 ? 2 : 1}, ${lblElse}`);
        emitExpr(expr.then, destReg, locals);
        emit(`  jmp   ${lblEnd}`);
        label(lblElse);
        emitExpr(expr.else_, destReg, locals);
        label(lblEnd);
        break;
      }

      case 'addr': {
        // &var — get address of variable, or &func — get function label address
        if (expr.operand.kind === 'ident') {
          const sym = locals.get(expr.operand.name) ?? globals.get(expr.operand.name);
          if (sym) {
            if (sym.location === 'global') {
              loadConst(destReg, sym.offset);
            } else {
              emit(`  addi  R${destReg}, R7, ${sym.offset}`);
            }
          } else {
            // Might be a function name — load its label address
            // In Ember, function labels get resolved by the assembler
            comment(`addr of function ${expr.operand.name}`);
            emit(`  li    R${destReg}, _${expr.operand.name}`);
          }
        } else if (expr.operand.kind === 'index') {
          // &array[i] — compute address without loading
          const arrSym = expr.operand.array.kind === 'ident' ?
            (locals.get(expr.operand.array.name) ?? globals.get(expr.operand.array.name)) : null;
          if (arrSym && arrSym.location === 'global') {
            emitExpr(expr.operand.index, destReg, locals);
            loadConst(destReg === 1 ? 2 : 1, arrSym.offset);
            emit(`  add   R${destReg}, R${destReg}, R${destReg === 1 ? 2 : 1}`);
          }
        }
        break;
      }

      case 'call_indirect': {
        // Indirect function call through a pointer
        // Evaluate callee expression to get function address
        emitExpr(expr.callee, 5, locals); // use R5 for function address
        // Push args to R1-R4
        for (let i = 0; i < Math.min(expr.args.length, 4); i++) {
          emitExpr(expr.args[i], i + 1, locals);
        }
        // Save SP, call through register
        pushReg(7);
        emit(`  mov   R6, R7`); // save SP
        // JAL can't do indirect — use manual: store return addr, then JR
        // We need to compute return address. Use a label trick.
        const retLabel = newLabel('icall_ret');
        emit(`  li    R7, ${retLabel}`); // R7 = return address (will be on stack)
        pushReg(7); // push return addr
        emit(`  mov   R7, R6`); // restore SP (before the push)
        emit(`  jr    R5`); // jump to function
        label(retLabel);
        emit(`  mov   R7, R6`); // restore SP
        popReg(6); // clean up
        if (destReg !== 1) emit(`  mov   R${destReg}, R1`);
        break;
      }

      case 'deref':
        // *ptr — load from pointer
        emitExpr(expr.operand, destReg, locals);
        emit(`  lw    R${destReg}, R${destReg}, 0`);
        break;

      case 'member': {
        // obj.field — need struct layout to compute field offset
        emitExpr(expr.object, destReg, locals);
        // For now, look up field offset if we know the struct type
        // This is a simplified version — full implementation would track types through expressions
        comment(`member access .${expr.field}`);
        // Try to find field offset from any matching struct
        let found = false;
        for (const [, layout] of structLayouts) {
          const field = layout.fields.find(f => f.name === expr.field);
          if (field) {
            if (field.offset !== 0) {
              emit(`  addi  R${destReg}, R${destReg}, ${field.offset}`);
            }
            emit(`  lw    R${destReg}, R${destReg}, 0`);
            found = true;
            break;
          }
        }
        if (!found) {
          emit(`  lw    R${destReg}, R${destReg}, 0`);
        }
        break;
      }

      case 'comma':
        emitExpr(expr.left, destReg, locals);
        emitExpr(expr.right, destReg, locals);
        break;

      default:
        comment(`TODO: expr kind ${(expr as Expr).kind}`);
        loadConst(destReg, 0);
    }
  }

  // Store a value from srcReg into the location described by target expr
  function emitStore(target: Expr, srcReg: number, locals: Map<string, Symbol>) {
    if (target.kind === 'ident') {
      const sym = locals.get(target.name) ?? globals.get(target.name);
      if (!sym) throw new Error(`undefined variable: ${target.name}`);
      if (sym.location === 'global') {
        storeGlobal(srcReg, sym.offset);
      } else {
        emit(`  sw    R${srcReg}, R7, ${sym.offset}`);
      }
    } else if (target.kind === 'index') {
      // array[index] = value
      const arrSym = target.array.kind === 'ident' ? (locals.get(target.array.name) ?? globals.get(target.array.name)) : null;
      const addrReg = srcReg === 3 ? 4 : 3;
      const idxReg = srcReg === 2 ? 4 : 2;

      if (arrSym && arrSym.location === 'global') {
        pushReg(srcReg);
        emitExpr(target.index, idxReg, locals);
        loadConst(addrReg, arrSym.offset);
        emit(`  add   R${addrReg}, R${addrReg}, R${idxReg}`);
        popReg(srcReg);
        emit(`  sw    R${srcReg}, R${addrReg}, 0`);
      } else {
        pushReg(srcReg);
        emitExpr(target.array, addrReg, locals);
        emitExpr(target.index, idxReg, locals);
        emit(`  add   R${addrReg}, R${addrReg}, R${idxReg}`);
        popReg(srcReg);
        emit(`  sw    R${srcReg}, R${addrReg}, 0`);
      }
    } else if (target.kind === 'deref') {
      // *ptr = value
      const ptrReg = srcReg === 2 ? 3 : 2;
      pushReg(srcReg);
      emitExpr(target.operand, ptrReg, locals);
      popReg(srcReg);
      emit(`  sw    R${srcReg}, R${ptrReg}, 0`);
    }
  }

  // === Emit statement ===
  function emitStmt(stmt: Stmt, locals: Map<string, Symbol>, returnLabel: string) {
    switch (stmt.kind) {
      case 'expr':
        emitExpr(stmt.expr, 1, locals);
        resetRegs();
        break;

      case 'var_decl':
        if (stmt.init) {
          emitExpr(stmt.init, 1, locals);
          const sym = locals.get(stmt.name);
          if (sym) {
            emit(`  sw    R1, R7, ${sym.offset}`);
          }
          resetRegs();
        }
        break;

      case 'block':
        for (const s of stmt.stmts) emitStmt(s, locals, returnLabel);
        break;

      case 'if': {
        const lblElse = newLabel('else');
        const lblEnd = newLabel('endif');

        emitExpr(stmt.cond, 1, locals);
        emit(`  li    R2, 0`);
        emit(`  beq   R1, R2, ${stmt.else_ ? lblElse : lblEnd}`);
        resetRegs();

        emitStmt(stmt.then, locals, returnLabel);

        if (stmt.else_) {
          emit(`  jmp   ${lblEnd}`);
          label(lblElse);
          emitStmt(stmt.else_, locals, returnLabel);
        }
        label(lblEnd);
        break;
      }

      case 'while': {
        const lblTop = newLabel('while');
        const lblEnd = newLabel('wend');
        breakLabels.push(lblEnd);
        continueLabels.push(lblTop);

        label(lblTop);
        emitExpr(stmt.cond, 1, locals);
        emit(`  li    R2, 0`);
        emit(`  beq   R1, R2, ${lblEnd}`);
        resetRegs();

        emitStmt(stmt.body, locals, returnLabel);
        emit(`  jmp   ${lblTop}`);
        label(lblEnd);

        breakLabels.pop();
        continueLabels.pop();
        break;
      }

      case 'for': {
        const lblTop = newLabel('for');
        const lblEnd = newLabel('forend');
        const lblCont = newLabel('forcont');
        breakLabels.push(lblEnd);
        continueLabels.push(lblCont);

        // Init
        if (stmt.init) emitStmt(stmt.init, locals, returnLabel);

        label(lblTop);

        // Condition
        if (stmt.cond) {
          emitExpr(stmt.cond, 1, locals);
          emit(`  li    R2, 0`);
          emit(`  beq   R1, R2, ${lblEnd}`);
          resetRegs();
        }

        // Body
        emitStmt(stmt.body, locals, returnLabel);

        // Continue point
        label(lblCont);

        // Update
        if (stmt.update) {
          emitExpr(stmt.update, 1, locals);
          resetRegs();
        }

        emit(`  jmp   ${lblTop}`);
        label(lblEnd);

        breakLabels.pop();
        continueLabels.pop();
        break;
      }

      case 'return':
        if (stmt.value) emitExpr(stmt.value, 1, locals);
        emit(`  jmp   ${returnLabel}`);
        resetRegs();
        break;

      case 'break':
        if (breakLabels.length > 0) emit(`  jmp   ${breakLabels[breakLabels.length - 1]}`);
        break;

      case 'continue':
        if (continueLabels.length > 0) emit(`  jmp   ${continueLabels[continueLabels.length - 1]}`);
        break;

      case 'switch': {
        const lblEnd = newLabel('swend');
        breakLabels.push(lblEnd);

        // Evaluate switch expression
        emitExpr(stmt.expr, 1, locals);
        pushReg(1); // save switch value on stack

        // Emit the body (which contains case/default statements)
        emitStmt(stmt.body, locals, returnLabel);

        label(lblEnd);
        popReg(1); // clean up switch value
        breakLabels.pop();
        break;
      }

      case 'case': {
        const lblSkip = newLabel('case_skip');
        // Load switch value from stack (peek, don't pop)
        emit(`  lw    R1, R7, 0`);
        emitExpr(stmt.value, 2, locals);
        emit(`  bne   R1, R2, ${lblSkip}`);
        resetRegs();
        emitStmt(stmt.body, locals, returnLabel);
        label(lblSkip);
        break;
      }

      case 'default':
        emitStmt(stmt.body, locals, returnLabel);
        break;

      case 'do_while': {
        const lblTop = newLabel('do');
        const lblEnd = newLabel('doend');
        const lblCont = newLabel('docont');
        breakLabels.push(lblEnd);
        continueLabels.push(lblCont);

        label(lblTop);
        emitStmt(stmt.body, locals, returnLabel);
        label(lblCont);
        emitExpr(stmt.cond, 1, locals);
        emit(`  li    R2, 0`);
        emit(`  bne   R1, R2, ${lblTop}`);
        label(lblEnd);

        breakLabels.pop();
        continueLabels.pop();
        break;
      }

      case 'goto': {
        const lbl = gotoLabels.get(stmt.label) ?? `_goto_${stmt.label}`;
        if (!gotoLabels.has(stmt.label)) gotoLabels.set(stmt.label, lbl);
        emit(`  jmp   ${lbl}`);
        break;
      }

      case 'label': {
        const lbl = gotoLabels.get(stmt.name) ?? `_goto_${stmt.name}`;
        if (!gotoLabels.has(stmt.name)) gotoLabels.set(stmt.name, lbl);
        label(lbl);
        emitStmt(stmt.body, locals, returnLabel);
        break;
      }
    }
  }

}
