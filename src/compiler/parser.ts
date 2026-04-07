// EmberC Parser — recursive descent, produces AST

import { TokenKind, type Token } from './lexer';
import type { Expr, Stmt, Decl, Program, Type, SourceLoc } from './ast';

export class ParseError extends Error {
  constructor(message: string, public loc: SourceLoc) {
    super(`${loc.line}:${loc.col}: ${message}`);
  }
}

export function parse(tokens: Token[]): Program {
  let pos = 0;

  function peek(): Token { return tokens[pos] ?? tokens[tokens.length - 1]; }
  function advance(): Token { return tokens[pos++]; }
  function loc(): SourceLoc { return { line: peek().line, col: peek().col }; }

  function expect(kind: TokenKind, what?: string): Token {
    const t = peek();
    if (t.kind !== kind) {
      throw new ParseError(`expected ${what ?? TokenKind[kind]}, got '${t.value}'`, loc());
    }
    return advance();
  }

  function match(kind: TokenKind): boolean {
    if (peek().kind === kind) { advance(); return true; }
    return false;
  }

  function check(kind: TokenKind): boolean { return peek().kind === kind; }

  // Track typedef names so they can be recognized as types
  const typedefNames = new Set<string>();

  // === Type parsing ===
  function parseType(): Type {
    let base: Type;
    const t = peek();

    // Handle qualifiers: const, volatile, static, extern, register, signed — skip them
    while (t.kind === TokenKind.KW_const || peek().kind === TokenKind.KW_const ||
           peek().kind === TokenKind.KW_volatile || peek().kind === TokenKind.KW_static ||
           peek().kind === TokenKind.KW_extern || peek().kind === TokenKind.KW_register ||
           peek().kind === TokenKind.KW_signed) {
      advance();
    }

    // Handle unsigned
    if (peek().kind === TokenKind.KW_unsigned) {
      advance();
      // unsigned alone = unsigned int
      if (peek().kind === TokenKind.KW_int) { advance(); base = { kind: 'unsigned', base: 'int' }; }
      else if (peek().kind === TokenKind.KW_char) { advance(); base = { kind: 'unsigned', base: 'char' }; }
      else if (peek().kind === TokenKind.KW_short) { advance(); if (peek().kind === TokenKind.KW_int) advance(); base = { kind: 'unsigned', base: 'short' }; }
      else if (peek().kind === TokenKind.KW_long) { advance(); if (peek().kind === TokenKind.KW_int) advance(); base = { kind: 'unsigned', base: 'long' }; }
      else { base = { kind: 'unsigned', base: 'int' }; } // bare "unsigned"
    }
    else if (peek().kind === TokenKind.KW_int) { advance(); base = { kind: 'int' }; }
    else if (peek().kind === TokenKind.KW_char) { advance(); base = { kind: 'char' }; }
    else if (peek().kind === TokenKind.KW_bool) { advance(); base = { kind: 'bool' }; }
    else if (peek().kind === TokenKind.KW_void) { advance(); base = { kind: 'void' }; }
    else if (peek().kind === TokenKind.KW_short) { advance(); if (peek().kind === TokenKind.KW_int) advance(); base = { kind: 'short' }; }
    else if (peek().kind === TokenKind.KW_long) { advance(); if (peek().kind === TokenKind.KW_int) advance(); base = { kind: 'long' }; }
    else if (peek().kind === TokenKind.KW_struct) {
      advance();
      const name = expect(TokenKind.Ident, 'struct name').value;
      base = { kind: 'struct', name };
    }
    else if (peek().kind === TokenKind.KW_union) {
      advance();
      const name = expect(TokenKind.Ident, 'union name').value;
      base = { kind: 'union', name };
    }
    else if (peek().kind === TokenKind.KW_enum) {
      advance();
      const name = expect(TokenKind.Ident, 'enum name').value;
      base = { kind: 'enum', name };
    }
    else if (peek().kind === TokenKind.Ident && typedefNames.has(peek().value)) {
      const name = advance().value;
      base = { kind: 'named', name };
    }
    else throw new ParseError(`expected type, got '${peek().value}'`, loc());

    // Pointer modifiers
    while (check(TokenKind.Star)) {
      advance();
      // Skip const/volatile after *
      while (peek().kind === TokenKind.KW_const || peek().kind === TokenKind.KW_volatile) advance();
      base = { kind: 'pointer', base };
    }

    return base;
  }

  // === Expression parsing (precedence climbing) ===
  function parseExpr(): Expr { return parseAssignment(); }

  // Comma expression: expr, expr, expr (lowest precedence, used in for-loop updates)
  function parseCommaExpr(): Expr {
    let left = parseExpr();
    while (check(TokenKind.Comma)) {
      const l = loc(); advance();
      left = { kind: 'comma', left, right: parseExpr(), loc: l };
    }
    return left;
  }

  function parseAssignment(): Expr {
    const left = parseTernary();

    if (check(TokenKind.Assign)) {
      const l = loc(); advance();
      const right = parseAssignment();
      return { kind: 'assign', target: left, value: right, loc: l };
    }
    if (check(TokenKind.PlusAssign) || check(TokenKind.MinusAssign) ||
        check(TokenKind.StarAssign) || check(TokenKind.SlashAssign) ||
        check(TokenKind.PercentAssign) || check(TokenKind.AmpAssign) ||
        check(TokenKind.PipeAssign) || check(TokenKind.CaretAssign) ||
        check(TokenKind.ShiftLeftAssign) || check(TokenKind.ShiftRightAssign)) {
      const l = loc();
      const opToken = advance().value;
      const op = opToken.slice(0, -1); // remove '=' to get operator
      const right = parseAssignment();
      return { kind: 'compound_assign', op, target: left, value: right, loc: l };
    }

    return left;
  }

  function parseTernary(): Expr {
    let expr = parseOr();

    if (check(TokenKind.Question)) {
      const l = loc(); advance();
      const then = parseExpr();
      expect(TokenKind.Colon, ':');
      const else_ = parseTernary();
      expr = { kind: 'ternary', cond: expr, then, else_, loc: l };
    }

    return expr;
  }

  function parseOr(): Expr {
    let left = parseAnd();
    while (check(TokenKind.PipePipe)) {
      const l = loc(); advance();
      left = { kind: 'binary', op: '||', left, right: parseAnd(), loc: l };
    }
    return left;
  }

  function parseAnd(): Expr {
    let left = parseBitOr();
    while (check(TokenKind.AmpAmp)) {
      const l = loc(); advance();
      left = { kind: 'binary', op: '&&', left, right: parseBitOr(), loc: l };
    }
    return left;
  }

  function parseBitOr(): Expr {
    let left = parseBitXor();
    while (check(TokenKind.Pipe)) {
      const l = loc(); advance();
      left = { kind: 'binary', op: '|', left, right: parseBitXor(), loc: l };
    }
    return left;
  }

  function parseBitXor(): Expr {
    let left = parseBitAnd();
    while (check(TokenKind.Caret)) {
      const l = loc(); advance();
      left = { kind: 'binary', op: '^', left, right: parseBitAnd(), loc: l };
    }
    return left;
  }

  function parseBitAnd(): Expr {
    let left = parseEquality();
    while (check(TokenKind.Amp)) {
      const l = loc(); advance();
      left = { kind: 'binary', op: '&', left, right: parseEquality(), loc: l };
    }
    return left;
  }

  function parseEquality(): Expr {
    let left = parseComparison();
    while (check(TokenKind.Eq) || check(TokenKind.NotEq)) {
      const l = loc();
      const op = advance().value;
      left = { kind: 'binary', op, left, right: parseComparison(), loc: l };
    }
    return left;
  }

  function parseComparison(): Expr {
    let left = parseShift();
    while (check(TokenKind.Lt) || check(TokenKind.Gt) || check(TokenKind.LtEq) || check(TokenKind.GtEq)) {
      const l = loc();
      const op = advance().value;
      left = { kind: 'binary', op, left, right: parseShift(), loc: l };
    }
    return left;
  }

  function parseShift(): Expr {
    let left = parseAdditive();
    while (check(TokenKind.ShiftLeft) || check(TokenKind.ShiftRight)) {
      const l = loc();
      const op = advance().value;
      left = { kind: 'binary', op, left, right: parseAdditive(), loc: l };
    }
    return left;
  }

  function parseAdditive(): Expr {
    let left = parseMultiplicative();
    while (check(TokenKind.Plus) || check(TokenKind.Minus)) {
      const l = loc();
      const op = advance().value;
      left = { kind: 'binary', op, left, right: parseMultiplicative(), loc: l };
    }
    return left;
  }

  function parseMultiplicative(): Expr {
    let left = parseUnary();
    while (check(TokenKind.Star) || check(TokenKind.Slash) || check(TokenKind.Percent)) {
      const l = loc();
      const op = advance().value;
      left = { kind: 'binary', op, left, right: parseUnary(), loc: l };
    }
    return left;
  }

  function parseUnary(): Expr {
    const l = loc();

    // Prefix operators
    if (check(TokenKind.Minus)) {
      advance();
      return { kind: 'unary', op: '-', operand: parseUnary(), prefix: true, loc: l };
    }
    if (check(TokenKind.Bang)) {
      advance();
      return { kind: 'unary', op: '!', operand: parseUnary(), prefix: true, loc: l };
    }
    if (check(TokenKind.Tilde)) {
      advance();
      return { kind: 'unary', op: '~', operand: parseUnary(), prefix: true, loc: l };
    }
    if (check(TokenKind.Amp)) {
      advance();
      return { kind: 'addr', operand: parseUnary(), loc: l };
    }
    if (check(TokenKind.Star)) {
      advance();
      return { kind: 'deref', operand: parseUnary(), loc: l };
    }
    if (check(TokenKind.PlusPlus)) {
      advance();
      return { kind: 'unary', op: '++', operand: parseUnary(), prefix: true, loc: l };
    }
    if (check(TokenKind.MinusMinus)) {
      advance();
      return { kind: 'unary', op: '--', operand: parseUnary(), prefix: true, loc: l };
    }

    return parsePostfix();
  }

  function parsePostfix(): Expr {
    let expr = parsePrimary();

    while (true) {
      const l = loc();

      // Array index: expr[index]
      if (check(TokenKind.LBracket)) {
        advance();
        const index = parseExpr();
        expect(TokenKind.RBracket, ']');
        expr = { kind: 'index', array: expr, index, loc: l };
        continue;
      }

      // Member access: expr.field
      if (check(TokenKind.Dot)) {
        advance();
        const field = expect(TokenKind.Ident, 'field name').value;
        expr = { kind: 'member', object: expr, field, loc: l };
        continue;
      }

      // Function call on expression: expr(args) — for function pointers
      if (check(TokenKind.LParen) && expr.kind !== 'call') {
        // Only if expr is NOT already a direct call from parsePrimary
        // This handles: funcPtr(args), obj.method(args), (*fptr)(args)
        if (expr.kind === 'ident') {
          // Could be a regular function call — check if it's a known variable
          // For now, treat all ident() as direct calls (handled in parsePrimary)
          // This branch handles non-ident expressions like deref, member, index
        } else {
          advance();
          const args: Expr[] = [];
          if (!check(TokenKind.RParen)) {
            args.push(parseExpr());
            while (match(TokenKind.Comma)) args.push(parseExpr());
          }
          expect(TokenKind.RParen, ')');
          expr = { kind: 'call_indirect', callee: expr, args, loc: l };
          continue;
        }
      }

      // Arrow: expr->field
      if (check(TokenKind.Arrow)) {
        advance();
        const field = expect(TokenKind.Ident, 'field name').value;
        expr = { kind: 'member', object: { kind: 'deref', operand: expr, loc: l }, field, loc: l };
        continue;
      }

      // Postfix ++ / --
      if (check(TokenKind.PlusPlus)) {
        advance();
        expr = { kind: 'unary', op: '++', operand: expr, prefix: false, loc: l };
        continue;
      }
      if (check(TokenKind.MinusMinus)) {
        advance();
        expr = { kind: 'unary', op: '--', operand: expr, prefix: false, loc: l };
        continue;
      }

      break;
    }

    return expr;
  }

  function parsePrimary(): Expr {
    const l = loc();
    const t = peek();

    // Number literal
    if (t.kind === TokenKind.Number) {
      advance();
      let val: number;
      if (t.value.startsWith('0x') || t.value.startsWith('0X')) val = parseInt(t.value, 16);
      else if (t.value.startsWith('0b') || t.value.startsWith('0B')) val = parseInt(t.value.slice(2), 2);
      else val = parseInt(t.value, 10);
      return { kind: 'number', value: val, loc: l };
    }

    // Bool literal
    if (t.kind === TokenKind.KW_true) { advance(); return { kind: 'bool', value: true, loc: l }; }
    if (t.kind === TokenKind.KW_false) { advance(); return { kind: 'bool', value: false, loc: l }; }

    // Null literal
    if (t.kind === TokenKind.KW_null) { advance(); return { kind: 'null', loc: l }; }

    // String literal
    if (t.kind === TokenKind.String) { advance(); return { kind: 'string', value: t.value, loc: l }; }

    // Char literal
    if (t.kind === TokenKind.Char) { advance(); return { kind: 'char', value: t.value, loc: l }; }

    // sizeof
    if (t.kind === TokenKind.KW_sizeof) {
      advance();
      expect(TokenKind.LParen, '(');
      // Try to parse as type first, fall back to expression
      if (isTypeStart(peek())) {
        const type = parseType();
        expect(TokenKind.RParen, ')');
        return { kind: 'sizeof_type', type, loc: l };
      } else {
        const operand = parseExpr();
        expect(TokenKind.RParen, ')');
        return { kind: 'sizeof_expr', operand, loc: l };
      }
    }

    // Identifier or function call
    if (t.kind === TokenKind.Ident) {
      const name = advance().value;

      // Function call
      if (check(TokenKind.LParen)) {
        advance();
        const args: Expr[] = [];
        if (!check(TokenKind.RParen)) {
          args.push(parseExpr());
          while (match(TokenKind.Comma)) args.push(parseExpr());
        }
        expect(TokenKind.RParen, ')');
        return { kind: 'call', callee: name, args, loc: l };
      }

      return { kind: 'ident', name, loc: l };
    }

    // Parenthesized expression or type cast
    if (t.kind === TokenKind.LParen) {
      // Look ahead to see if this is a cast: (type)expr
      const saved = pos;
      advance();
      if (isTypeStart(peek())) {
        try {
          const castType = parseType();
          if (check(TokenKind.RParen)) {
            advance();
            const operand = parseUnary();
            return { kind: 'cast', type: castType, operand, loc: l };
          }
        } catch {
          // Not a cast — restore and parse as expression
        }
        pos = saved;
        advance();
      }
      const expr = parseExpr();
      expect(TokenKind.RParen, ')');
      return expr;
    }

    throw new ParseError(`unexpected token '${t.value}'`, l);
  }

  // === Statement parsing ===
  function parseStmt(): Stmt {
    const l = loc();

    // Block
    if (check(TokenKind.LBrace)) return parseBlock();

    // If
    if (check(TokenKind.KW_if)) {
      advance();
      expect(TokenKind.LParen, '(');
      const cond = parseExpr();
      expect(TokenKind.RParen, ')');
      const then = parseStmt();
      const else_ = match(TokenKind.KW_else) ? parseStmt() : null;
      return { kind: 'if', cond, then, else_, loc: l };
    }

    // While
    if (check(TokenKind.KW_while)) {
      advance();
      expect(TokenKind.LParen, '(');
      const cond = parseExpr();
      expect(TokenKind.RParen, ')');
      const body = parseStmt();
      return { kind: 'while', cond, body, loc: l };
    }

    // For
    if (check(TokenKind.KW_for)) {
      advance();
      expect(TokenKind.LParen, '(');

      // Init
      let init: Stmt | null = null;
      if (!check(TokenKind.Semi)) {
        if (isTypeKeyword(peek())) {
          init = parseVarDeclStmt();
        } else {
          init = { kind: 'expr', expr: parseCommaExpr(), loc: l };
          expect(TokenKind.Semi, ';');
        }
      } else {
        advance(); // skip ;
      }

      // Condition
      const cond = check(TokenKind.Semi) ? null : parseExpr();
      expect(TokenKind.Semi, ';');

      // Update (supports comma operator: i++, j--)
      const update = check(TokenKind.RParen) ? null : parseCommaExpr();
      expect(TokenKind.RParen, ')');

      const body = parseStmt();
      return { kind: 'for', init, cond, update, body, loc: l };
    }

    // Return
    if (check(TokenKind.KW_return)) {
      advance();
      const value = check(TokenKind.Semi) ? null : parseExpr();
      expect(TokenKind.Semi, ';');
      return { kind: 'return', value, loc: l };
    }

    // Switch
    if (check(TokenKind.KW_switch)) {
      advance();
      expect(TokenKind.LParen, '(');
      const expr = parseExpr();
      expect(TokenKind.RParen, ')');
      const body = parseSwitchBody();
      return { kind: 'switch', expr, body, loc: l };
    }

    // Case
    if (check(TokenKind.KW_case)) {
      advance();
      const value = parseExpr();
      expect(TokenKind.Colon, ':');
      const body = parseCaseBody();
      return { kind: 'case', value, body, loc: l };
    }

    // Default
    if (check(TokenKind.KW_default)) {
      advance();
      expect(TokenKind.Colon, ':');
      const body = parseCaseBody();
      return { kind: 'default', body, loc: l };
    }

    // Do-while
    if (check(TokenKind.KW_do)) {
      advance();
      const body = parseStmt();
      expect(TokenKind.KW_while, 'while');
      expect(TokenKind.LParen, '(');
      const cond = parseExpr();
      expect(TokenKind.RParen, ')');
      expect(TokenKind.Semi, ';');
      return { kind: 'do_while', body, cond, loc: l };
    }

    // Goto
    if (check(TokenKind.KW_goto)) {
      advance();
      const label = expect(TokenKind.Ident, 'label name').value;
      expect(TokenKind.Semi, ';');
      return { kind: 'goto', label, loc: l };
    }

    // Break / Continue
    if (check(TokenKind.KW_break)) { advance(); expect(TokenKind.Semi, ';'); return { kind: 'break', loc: l }; }
    if (check(TokenKind.KW_continue)) { advance(); expect(TokenKind.Semi, ';'); return { kind: 'continue', loc: l }; }

    // Label: name: stmt (check if ident followed by colon)
    if (peek().kind === TokenKind.Ident && pos + 1 < tokens.length && tokens[pos + 1]?.kind === TokenKind.Colon) {
      const name = advance().value;
      advance(); // skip colon
      const body = parseStmt();
      return { kind: 'label', name, body, loc: l };
    }

    // Variable declaration
    if (isTypeStart(peek())) {
      return parseVarDeclStmt();
    }

    // Expression statement
    const expr = parseExpr();
    expect(TokenKind.Semi, ';');
    return { kind: 'expr', expr, loc: l };
  }

  function parseBlock(): Stmt {
    const l = loc();
    expect(TokenKind.LBrace, '{');
    const stmts: Stmt[] = [];
    while (!check(TokenKind.RBrace) && !check(TokenKind.EOF)) {
      stmts.push(parseStmt());
    }
    expect(TokenKind.RBrace, '}');
    return { kind: 'block', stmts, loc: l };
  }

  function parseVarDeclStmt(): Stmt {
    const l = loc();
    const type = parseType();
    const name = expect(TokenKind.Ident, 'variable name').value;

    // Array declaration: int x[10]
    if (check(TokenKind.LBracket)) {
      advance();
      const sizeExpr = parseExpr();
      expect(TokenKind.RBracket, ']');
      // For local arrays, treat as var decl with array type
      const size = sizeExpr.kind === 'number' ? sizeExpr.value : 0;
      expect(TokenKind.Semi, ';');
      return { kind: 'var_decl', type: { kind: 'array', base: type, size }, name, init: null, loc: l };
    }

    const init = match(TokenKind.Assign) ? parseExpr() : null;
    expect(TokenKind.Semi, ';');
    return { kind: 'var_decl', type, name, init, loc: l };
  }

  function isTypeKeyword(t: Token): boolean {
    return isTypeStart(t);
  }

  function isTypeStart(t: Token): boolean {
    return t.kind === TokenKind.KW_int || t.kind === TokenKind.KW_char ||
           t.kind === TokenKind.KW_bool || t.kind === TokenKind.KW_void ||
           t.kind === TokenKind.KW_struct || t.kind === TokenKind.KW_union ||
           t.kind === TokenKind.KW_enum || t.kind === TokenKind.KW_short ||
           t.kind === TokenKind.KW_long || t.kind === TokenKind.KW_unsigned ||
           t.kind === TokenKind.KW_signed || t.kind === TokenKind.KW_const ||
           t.kind === TokenKind.KW_volatile || t.kind === TokenKind.KW_static ||
           t.kind === TokenKind.KW_extern || t.kind === TokenKind.KW_register ||
           (t.kind === TokenKind.Ident && typedefNames.has(t.value));
  }

  function parseStructFields(): { type: Type; name: string }[] {
    expect(TokenKind.LBrace, '{');
    const fields: { type: Type; name: string }[] = [];
    while (!check(TokenKind.RBrace) && !check(TokenKind.EOF)) {
      const fType = parseType();
      // Parse first field name
      const fName = expect(TokenKind.Ident, 'field name').value;
      // Handle array fields: char name[8];
      if (check(TokenKind.LBracket)) {
        advance();
        let size: number | null = null;
        if (!check(TokenKind.RBracket)) {
          const sizeExpr = parseExpr();
          size = sizeExpr.kind === 'number' ? sizeExpr.value : 0;
        }
        expect(TokenKind.RBracket, ']');
        fields.push({ type: { kind: 'array', base: fType, size: size ?? 0 }, name: fName });
      } else {
        fields.push({ type: fType, name: fName });
      }
      // Handle comma-separated fields: int a, b, c;
      while (match(TokenKind.Comma)) {
        // Pointer modifiers for subsequent names
        let extraType = fType;
        while (check(TokenKind.Star)) {
          advance();
          extraType = { kind: 'pointer', base: extraType };
        }
        const extraName = expect(TokenKind.Ident, 'field name').value;
        if (check(TokenKind.LBracket)) {
          advance();
          let size: number | null = null;
          if (!check(TokenKind.RBracket)) {
            const sizeExpr = parseExpr();
            size = sizeExpr.kind === 'number' ? sizeExpr.value : 0;
          }
          expect(TokenKind.RBracket, ']');
          fields.push({ type: { kind: 'array', base: extraType, size: size ?? 0 }, name: extraName });
        } else {
          fields.push({ type: extraType, name: extraName });
        }
      }
      expect(TokenKind.Semi, ';');
    }
    expect(TokenKind.RBrace, '}');
    return fields;
  }

  function parseEnumValues(): { name: string; value: number }[] {
    expect(TokenKind.LBrace, '{');
    const values: { name: string; value: number }[] = [];
    let nextVal = 0;
    while (!check(TokenKind.RBrace) && !check(TokenKind.EOF)) {
      const name = expect(TokenKind.Ident, 'enum value name').value;
      if (match(TokenKind.Assign)) {
        const expr = parseExpr();
        if (expr.kind === 'number') nextVal = expr.value;
        else if (expr.kind === 'unary' && expr.op === '-' && expr.operand.kind === 'number') nextVal = -expr.operand.value;
      }
      values.push({ name, value: nextVal });
      nextVal++;
      if (!match(TokenKind.Comma)) break;
    }
    expect(TokenKind.RBrace, '}');
    return values;
  }

  function parseSwitchBody(): Stmt {
    // Parse the { ... } block of a switch, which contains case/default labels
    return parseBlock();
  }

  function parseCaseBody(): Stmt {
    // Parse statements after case/default label until next case/default/}
    const l = loc();
    const stmts: Stmt[] = [];
    while (!check(TokenKind.KW_case) && !check(TokenKind.KW_default) &&
           !check(TokenKind.RBrace) && !check(TokenKind.EOF)) {
      stmts.push(parseStmt());
    }
    if (stmts.length === 0) return { kind: 'block', stmts: [], loc: l };
    if (stmts.length === 1) return stmts[0];
    return { kind: 'block', stmts, loc: l };
  }

  // === Top-level declaration parsing ===
  function parseDecl(): Decl | Decl[] {
    const l = loc();

    // Skip storage class specifiers at top level
    while (check(TokenKind.KW_static) || check(TokenKind.KW_extern) || check(TokenKind.KW_register)) {
      advance();
    }

    // Typedef
    if (check(TokenKind.KW_typedef)) {
      advance();
      // typedef struct name { ... } alias;
      // typedef int alias;
      // typedef enum { ... } alias;
      if (check(TokenKind.KW_struct)) {
        advance();
        const structName = check(TokenKind.Ident) ? advance().value : '';
        if (check(TokenKind.LBrace)) {
          const fields = parseStructFields();
          const alias = expect(TokenKind.Ident, 'typedef name').value;
          expect(TokenKind.Semi, ';');
          typedefNames.add(alias);
          const actualName = structName || alias;
          const decls: Decl[] = [
            { kind: 'struct_decl', name: actualName, fields, loc: l },
            { kind: 'typedef', type: { kind: 'struct', name: actualName }, name: alias, loc: l },
          ];
          return decls;
        }
        // typedef struct name alias;
        const alias = expect(TokenKind.Ident, 'typedef name').value;
        expect(TokenKind.Semi, ';');
        typedefNames.add(alias);
        return { kind: 'typedef', type: { kind: 'struct', name: structName }, name: alias, loc: l };
      }
      if (check(TokenKind.KW_union)) {
        advance();
        const unionName = check(TokenKind.Ident) ? advance().value : '';
        if (check(TokenKind.LBrace)) {
          const fields = parseStructFields();
          const alias = expect(TokenKind.Ident, 'typedef name').value;
          expect(TokenKind.Semi, ';');
          typedefNames.add(alias);
          const actualName = unionName || alias;
          const decls: Decl[] = [
            { kind: 'union_decl', name: actualName, fields, loc: l },
            { kind: 'typedef', type: { kind: 'union', name: actualName }, name: alias, loc: l },
          ];
          return decls;
        }
        const alias = expect(TokenKind.Ident, 'typedef name').value;
        expect(TokenKind.Semi, ';');
        typedefNames.add(alias);
        return { kind: 'typedef', type: { kind: 'union', name: unionName }, name: alias, loc: l };
      }
      if (check(TokenKind.KW_enum)) {
        advance();
        const enumName = check(TokenKind.Ident) ? advance().value : '';
        if (check(TokenKind.LBrace)) {
          const values = parseEnumValues();
          const alias = expect(TokenKind.Ident, 'typedef name').value;
          expect(TokenKind.Semi, ';');
          typedefNames.add(alias);
          const actualName = enumName || alias;
          const decls: Decl[] = [
            { kind: 'enum_decl', name: actualName, values, loc: l },
            { kind: 'typedef', type: { kind: 'enum', name: actualName }, name: alias, loc: l },
          ];
          return decls;
        }
        const alias = expect(TokenKind.Ident, 'typedef name').value;
        expect(TokenKind.Semi, ';');
        typedefNames.add(alias);
        return { kind: 'typedef', type: { kind: 'enum', name: enumName }, name: alias, loc: l };
      }
      // typedef function pointer: typedef void (*name)(params);
      // or typedef primitive alias; (e.g., typedef int fixed_t;)
      const baseType = parseType();
      // Check for function pointer syntax: typedef retType (*name)(params);
      if (check(TokenKind.LParen) && pos + 1 < tokens.length && tokens[pos + 1]?.kind === TokenKind.Star) {
        advance(); // skip (
        advance(); // skip *
        const alias = expect(TokenKind.Ident, 'typedef name').value;
        expect(TokenKind.RParen, ')');
        // Parse param types
        expect(TokenKind.LParen, '(');
        while (!check(TokenKind.RParen) && !check(TokenKind.EOF)) {
          if (check(TokenKind.Comma)) advance();
          else { parseType(); if (check(TokenKind.Ident)) advance(); }
        }
        expect(TokenKind.RParen, ')');
        expect(TokenKind.Semi, ';');
        typedefNames.add(alias);
        // Treat function pointer typedef as pointer-to-void for now
        return { kind: 'typedef', type: { kind: 'pointer', base: baseType }, name: alias, loc: l };
      }
      const alias = expect(TokenKind.Ident, 'typedef name').value;
      // Handle array typedef: typedef int arr_t[10];
      if (check(TokenKind.LBracket)) {
        advance();
        const sizeExpr = parseExpr();
        expect(TokenKind.RBracket, ']');
        const size = sizeExpr.kind === 'number' ? sizeExpr.value : 0;
        expect(TokenKind.Semi, ';');
        typedefNames.add(alias);
        return { kind: 'typedef', type: { kind: 'array', base: baseType, size }, name: alias, loc: l };
      }
      expect(TokenKind.Semi, ';');
      typedefNames.add(alias);
      return { kind: 'typedef', type: baseType, name: alias, loc: l };
    }

    // Enum declaration (named or anonymous)
    if (check(TokenKind.KW_enum)) {
      advance();
      // Anonymous enum: enum { A, B, C };
      if (check(TokenKind.LBrace)) {
        const values = parseEnumValues();
        // Could be followed by variable name or ;
        if (check(TokenKind.Semi)) {
          advance();
          return { kind: 'enum_decl', name: '__anon_enum_' + l.line, values, loc: l };
        }
        // enum { ... } varname;
        const varName = expect(TokenKind.Ident, 'variable name').value;
        expect(TokenKind.Semi, ';');
        const enumName = '__anon_enum_' + l.line;
        return [
          { kind: 'enum_decl' as const, name: enumName, values, loc: l },
          { kind: 'var_decl' as const, type: { kind: 'enum' as const, name: enumName }, name: varName, init: null, loc: l },
        ];
      }
      const name = expect(TokenKind.Ident, 'enum name').value;
      // enum name { ... }; — declaration
      if (check(TokenKind.LBrace)) {
        const values = parseEnumValues();
        // Could be followed by variable name or ;
        if (check(TokenKind.Semi)) {
          advance();
          return { kind: 'enum_decl', name, values, loc: l };
        }
        // enum name { ... } varname;
        const varName = expect(TokenKind.Ident, 'variable name').value;
        expect(TokenKind.Semi, ';');
        return [
          { kind: 'enum_decl' as const, name, values, loc: l },
          { kind: 'var_decl' as const, type: { kind: 'enum' as const, name }, name: varName, init: null, loc: l },
        ];
      }
      // enum name varname; — using existing enum as type
      // Fall through to type+name parsing below
      pos -= 2; // back up past 'enum' and name
    }

    // Struct declaration (or struct-typed variable/function)
    if (check(TokenKind.KW_struct)) {
      const saved = pos;
      advance();
      if (check(TokenKind.Ident)) {
        const name = advance().value;
        // struct name { ... } — definition
        if (check(TokenKind.LBrace)) {
          const fields = parseStructFields();
          // Could be: struct name { ... }; or struct name { ... } var;
          if (check(TokenKind.Semi)) {
            advance();
            return { kind: 'struct_decl', name, fields, loc: l };
          }
          // struct name { ... } var; — definition + variable
          const varName = expect(TokenKind.Ident, 'variable name').value;
          let arrSize: number | null = null;
          if (check(TokenKind.LBracket)) {
            advance();
            const sizeExpr = parseExpr();
            expect(TokenKind.RBracket, ']');
            arrSize = sizeExpr.kind === 'number' ? sizeExpr.value : 0;
          }
          expect(TokenKind.Semi, ';');
          const decls: Decl[] = [{ kind: 'struct_decl', name, fields, loc: l }];
          const varType: Type = arrSize !== null ? { kind: 'array', base: { kind: 'struct', name }, size: arrSize } : { kind: 'struct', name };
          decls.push({ kind: arrSize !== null ? 'array_decl' : 'var_decl', type: arrSize !== null ? { kind: 'struct', name } : varType, name: varName, ...(arrSize !== null ? { size: arrSize, init: null } : { init: null }), loc: l } as Decl);
          return decls;
        }
        // struct name; — forward declaration
        if (check(TokenKind.Semi)) {
          advance();
          return { kind: 'struct_decl', name, fields: [], loc: l };
        }
        // struct name var — struct used as type, fall through to type+name parsing
        pos = saved;
      } else if (check(TokenKind.LBrace)) {
        // Anonymous struct: struct { ... } var;
        const fields = parseStructFields();
        const anonName = '__anon_struct_' + l.line;
        if (check(TokenKind.Semi)) {
          advance();
          return { kind: 'struct_decl', name: anonName, fields, loc: l };
        }
        const varName = expect(TokenKind.Ident, 'variable name').value;
        expect(TokenKind.Semi, ';');
        return [
          { kind: 'struct_decl' as const, name: anonName, fields, loc: l },
          { kind: 'var_decl' as const, type: { kind: 'struct' as const, name: anonName }, name: varName, init: null, loc: l },
        ];
      } else {
        pos = saved;
      }
    }

    // Union declaration (or union-typed variable/function)
    if (check(TokenKind.KW_union)) {
      const saved = pos;
      advance();
      if (check(TokenKind.Ident)) {
        const name = advance().value;
        if (check(TokenKind.LBrace)) {
          const fields = parseStructFields();
          if (check(TokenKind.Semi)) {
            advance();
            return { kind: 'union_decl', name, fields, loc: l };
          }
          const varName = expect(TokenKind.Ident, 'variable name').value;
          expect(TokenKind.Semi, ';');
          return [
            { kind: 'union_decl' as const, name, fields, loc: l },
            { kind: 'var_decl' as const, type: { kind: 'union' as const, name }, name: varName, init: null, loc: l },
          ];
        }
        if (check(TokenKind.Semi)) {
          advance();
          return { kind: 'union_decl', name, fields: [], loc: l };
        }
        // union name var — fall through
        pos = saved;
      } else {
        pos = saved;
      }
    }

    // Type + name
    const type = parseType();
    const name = expect(TokenKind.Ident, 'name').value;

    // Function declaration: type name(params) { body } or forward: type name(params);
    if (check(TokenKind.LParen)) {
      advance();
      const params: { type: Type; name: string }[] = [];
      if (!check(TokenKind.RParen)) {
        // Handle (void) as no params
        if (peek().kind === TokenKind.KW_void && pos + 1 < tokens.length && tokens[pos + 1]?.kind === TokenKind.RParen) {
          advance(); // skip void
        } else {
          const pType = parseType();
          // Handle unnamed params in forward declarations: void foo(int, char*);
          let pName = '';
          if (check(TokenKind.Ident)) {
            pName = advance().value;
          } else if (check(TokenKind.Comma) || check(TokenKind.RParen)) {
            pName = '_p' + params.length;
          }
          // Handle param array notation: int arr[]
          if (check(TokenKind.LBracket)) {
            advance();
            if (!check(TokenKind.RBracket)) parseExpr(); // skip size expr
            expect(TokenKind.RBracket, ']');
          }
          params.push({ type: pType, name: pName });
          while (match(TokenKind.Comma)) {
            // Handle ... (varargs) — skip to end
            if (check(TokenKind.Ellipsis)) {
              advance(); // skip ...
              break;
            }
            const pt = parseType();
            let pn = '';
            if (check(TokenKind.Ident)) {
              pn = advance().value;
            } else if (check(TokenKind.Comma) || check(TokenKind.RParen)) {
              pn = '_p' + params.length;
            }
            if (check(TokenKind.LBracket)) {
              advance();
              if (!check(TokenKind.RBracket)) parseExpr();
              expect(TokenKind.RBracket, ']');
            }
            params.push({ type: pt, name: pn });
          }
        }
      }
      expect(TokenKind.RParen, ')');

      // Forward declaration: type name(params);
      if (check(TokenKind.Semi)) {
        advance();
        return { kind: 'forward_func_decl', returnType: type, name, params, loc: l };
      }

      const body = parseBlock();
      return { kind: 'func_decl', returnType: type, name, params, body, loc: l };
    }

    // Array declaration: type name[size]; or type name[];
    if (check(TokenKind.LBracket)) {
      advance();
      let size = 0;
      if (!check(TokenKind.RBracket)) {
        const sizeExpr = parseExpr();
        size = sizeExpr.kind === 'number' ? sizeExpr.value : 0;
      }
      expect(TokenKind.RBracket, ']');

      // Optional initializer: = { 1, 2, 3 }
      let init: Expr[] | null = null;
      if (match(TokenKind.Assign)) {
        expect(TokenKind.LBrace, '{');
        init = [];
        if (!check(TokenKind.RBrace)) {
          init.push(parseExpr());
          while (match(TokenKind.Comma)) init.push(parseExpr());
        }
        expect(TokenKind.RBrace, '}');
      }
      expect(TokenKind.Semi, ';');
      return { kind: 'array_decl', type, name, size, init, loc: l };
    }

    // Global variable: type name [= expr] [, name2 [= expr2]]... ;
    const init = match(TokenKind.Assign) ? parseExpr() : null;
    const results: Decl[] = [{ kind: 'var_decl', type, name, init, loc: l }];

    // Handle comma-separated declarations: int a, b, c;
    while (match(TokenKind.Comma)) {
      const extraName = expect(TokenKind.Ident, 'variable name').value;
      const extraInit = match(TokenKind.Assign) ? parseExpr() : null;
      results.push({ kind: 'var_decl', type, name: extraName, init: extraInit, loc: l });
    }

    expect(TokenKind.Semi, ';');
    return results;
  }

  // === Program ===
  const decls: Decl[] = [];
  while (!check(TokenKind.EOF)) {
    const result = parseDecl();
    if (Array.isArray(result)) {
      decls.push(...result);
    } else {
      decls.push(result);
    }
  }

  return { decls };
}
