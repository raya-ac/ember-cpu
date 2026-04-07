// EmberC AST — Abstract Syntax Tree node definitions

export interface SourceLoc {
  line: number;
  col: number;
}

// Types
export type Type =
  | { kind: 'int' }
  | { kind: 'char' }
  | { kind: 'bool' }
  | { kind: 'void' }
  | { kind: 'short' }
  | { kind: 'long' }
  | { kind: 'unsigned'; base: 'int' | 'char' | 'short' | 'long' }
  | { kind: 'pointer'; base: Type }
  | { kind: 'array'; base: Type; size: number | null } // null = unsized
  | { kind: 'struct'; name: string }
  | { kind: 'union'; name: string }
  | { kind: 'enum'; name: string }
  | { kind: 'named'; name: string }; // typedef'd name

export function typeToString(t: Type): string {
  switch (t.kind) {
    case 'int': case 'char': case 'bool': case 'void': case 'short': case 'long': return t.kind;
    case 'unsigned': return `unsigned ${t.base}`;
    case 'pointer': return typeToString(t.base) + '*';
    case 'array': return typeToString(t.base) + `[${t.size ?? ''}]`;
    case 'struct': return `struct ${t.name}`;
    case 'union': return `union ${t.name}`;
    case 'enum': return `enum ${t.name}`;
    case 'named': return t.name;
  }
}

// Struct/union field layout info
export interface FieldLayout {
  name: string;
  type: Type;
  offset: number; // word offset from struct base
}

export interface StructLayout {
  fields: FieldLayout[];
  totalSize: number; // total words
}

// Global struct layout registry — populated during codegen
export const structLayouts = new Map<string, StructLayout>();

export function typeSize(t: Type, structs?: Map<string, StructLayout>): number {
  switch (t.kind) {
    case 'int': case 'char': case 'bool': case 'pointer':
    case 'short': case 'long': case 'unsigned': case 'enum': case 'named':
      return 1; // everything is 1 word on Ember (32-bit)
    case 'void': return 0;
    case 'array': return (t.size ?? 0) * typeSize(t.base, structs);
    case 'struct': case 'union': {
      const layout = (structs ?? structLayouts).get(t.name);
      return layout ? layout.totalSize : 0;
    }
  }
}

// Expressions
export type Expr =
  | { kind: 'number'; value: number; loc: SourceLoc }
  | { kind: 'bool'; value: boolean; loc: SourceLoc }
  | { kind: 'string'; value: string; loc: SourceLoc }
  | { kind: 'char'; value: string; loc: SourceLoc }
  | { kind: 'ident'; name: string; loc: SourceLoc }
  | { kind: 'null'; loc: SourceLoc }
  | { kind: 'binary'; op: string; left: Expr; right: Expr; loc: SourceLoc }
  | { kind: 'unary'; op: string; operand: Expr; prefix: boolean; loc: SourceLoc }
  | { kind: 'assign'; target: Expr; value: Expr; loc: SourceLoc }
  | { kind: 'compound_assign'; op: string; target: Expr; value: Expr; loc: SourceLoc }
  | { kind: 'call'; callee: string; args: Expr[]; loc: SourceLoc }
  | { kind: 'call_indirect'; callee: Expr; args: Expr[]; loc: SourceLoc }
  | { kind: 'index'; array: Expr; index: Expr; loc: SourceLoc }
  | { kind: 'member'; object: Expr; field: string; loc: SourceLoc }
  | { kind: 'deref'; operand: Expr; loc: SourceLoc }
  | { kind: 'addr'; operand: Expr; loc: SourceLoc }
  | { kind: 'cast'; type: Type; operand: Expr; loc: SourceLoc }
  | { kind: 'sizeof_type'; type: Type; loc: SourceLoc }
  | { kind: 'sizeof_expr'; operand: Expr; loc: SourceLoc }
  | { kind: 'ternary'; cond: Expr; then: Expr; else_: Expr; loc: SourceLoc }
  | { kind: 'comma'; left: Expr; right: Expr; loc: SourceLoc };

// Statements
export type Stmt =
  | { kind: 'expr'; expr: Expr; loc: SourceLoc }
  | { kind: 'var_decl'; type: Type; name: string; init: Expr | null; loc: SourceLoc }
  | { kind: 'if'; cond: Expr; then: Stmt; else_: Stmt | null; loc: SourceLoc }
  | { kind: 'while'; cond: Expr; body: Stmt; loc: SourceLoc }
  | { kind: 'for'; init: Stmt | null; cond: Expr | null; update: Expr | null; body: Stmt; loc: SourceLoc }
  | { kind: 'return'; value: Expr | null; loc: SourceLoc }
  | { kind: 'break'; loc: SourceLoc }
  | { kind: 'continue'; loc: SourceLoc }
  | { kind: 'block'; stmts: Stmt[]; loc: SourceLoc }
  | { kind: 'switch'; expr: Expr; body: Stmt; loc: SourceLoc }
  | { kind: 'case'; value: Expr; body: Stmt; loc: SourceLoc }
  | { kind: 'default'; body: Stmt; loc: SourceLoc }
  | { kind: 'do_while'; body: Stmt; cond: Expr; loc: SourceLoc }
  | { kind: 'goto'; label: string; loc: SourceLoc }
  | { kind: 'label'; name: string; body: Stmt; loc: SourceLoc };

// Top-level declarations
export type Decl =
  | { kind: 'func_decl'; returnType: Type; name: string; params: { type: Type; name: string }[]; body: Stmt; loc: SourceLoc }
  | { kind: 'forward_func_decl'; returnType: Type; name: string; params: { type: Type; name: string }[]; loc: SourceLoc }
  | { kind: 'var_decl'; type: Type; name: string; init: Expr | null; loc: SourceLoc }
  | { kind: 'array_decl'; type: Type; name: string; size: number; init: Expr[] | null; loc: SourceLoc }
  | { kind: 'struct_decl'; name: string; fields: { type: Type; name: string }[]; loc: SourceLoc }
  | { kind: 'union_decl'; name: string; fields: { type: Type; name: string }[]; loc: SourceLoc }
  | { kind: 'enum_decl'; name: string; values: { name: string; value: number }[]; loc: SourceLoc }
  | { kind: 'typedef'; type: Type; name: string; loc: SourceLoc };

export interface Program {
  decls: Decl[];
}
