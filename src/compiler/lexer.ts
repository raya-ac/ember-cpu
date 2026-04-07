// EmberC Lexer — tokenizes source into a stream

export const enum TokenKind {
  // Literals
  Number,       // 42, 0xFF, 0b1010
  String,       // "hello"
  Char,         // 'a'

  // Identifiers & keywords
  Ident,
  KW_int, KW_char, KW_bool, KW_void, KW_struct,
  KW_if, KW_else, KW_while, KW_for, KW_return, KW_break, KW_continue,
  KW_true, KW_false, KW_null,
  // C89 keywords for DOOM
  KW_switch, KW_case, KW_default, KW_do,
  KW_typedef, KW_enum, KW_union, KW_goto, KW_sizeof,
  KW_unsigned, KW_signed, KW_short, KW_long,
  KW_static, KW_extern, KW_const, KW_volatile, KW_register,
  // Ellipsis for varargs
  Ellipsis,   // ...
  // Colon for case labels and ternary
  Colon,      // :
  // Ternary
  Question,   // ?
  // Additional assignment operators
  PercentAssign, AmpAssign, PipeAssign, CaretAssign,  // %= &= |= ^=
  ShiftLeftAssign, ShiftRightAssign,                   // <<= >>=

  // Operators
  Plus, Minus, Star, Slash, Percent,        // + - * / %
  Amp, Pipe, Caret, Tilde,                  // & | ^ ~
  ShiftLeft, ShiftRight,                    // << >>
  AmpAmp, PipePipe, Bang,                   // && || !
  Eq, NotEq, Lt, Gt, LtEq, GtEq,          // == != < > <= >=
  Assign,                                    // =
  PlusAssign, MinusAssign, StarAssign, SlashAssign, // += -= *= /=
  PlusPlus, MinusMinus,                      // ++ --
  Arrow,                                     // ->
  Dot,                                       // .

  // Delimiters
  LParen, RParen,       // ( )
  LBrace, RBrace,       // { }
  LBracket, RBracket,   // [ ]
  Semi, Comma,           // ; ,

  // Special
  EOF,
  Error,
}

export interface Token {
  kind: TokenKind;
  value: string;
  line: number;
  col: number;
}

const KEYWORDS: Record<string, TokenKind> = {
  int: TokenKind.KW_int,
  char: TokenKind.KW_char,
  bool: TokenKind.KW_bool,
  void: TokenKind.KW_void,
  struct: TokenKind.KW_struct,
  if: TokenKind.KW_if,
  else: TokenKind.KW_else,
  while: TokenKind.KW_while,
  for: TokenKind.KW_for,
  return: TokenKind.KW_return,
  break: TokenKind.KW_break,
  continue: TokenKind.KW_continue,
  true: TokenKind.KW_true,
  false: TokenKind.KW_false,
  null: TokenKind.KW_null,
  // C89 keywords for DOOM
  switch: TokenKind.KW_switch,
  case: TokenKind.KW_case,
  default: TokenKind.KW_default,
  do: TokenKind.KW_do,
  typedef: TokenKind.KW_typedef,
  enum: TokenKind.KW_enum,
  union: TokenKind.KW_union,
  goto: TokenKind.KW_goto,
  sizeof: TokenKind.KW_sizeof,
  unsigned: TokenKind.KW_unsigned,
  signed: TokenKind.KW_signed,
  short: TokenKind.KW_short,
  long: TokenKind.KW_long,
  static: TokenKind.KW_static,
  extern: TokenKind.KW_extern,
  const: TokenKind.KW_const,
  volatile: TokenKind.KW_volatile,
  register: TokenKind.KW_register,
};

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  let line = 1;
  let col = 1;

  function peek(): string { return pos < source.length ? source[pos] : '\0'; }
  function peek2(): string { return pos + 1 < source.length ? source[pos + 1] : '\0'; }
  function advance(): string {
    const ch = source[pos++];
    if (ch === '\n') { line++; col = 1; } else { col++; }
    return ch;
  }
  function emit(kind: TokenKind, value: string, startLine: number, startCol: number) {
    tokens.push({ kind, value, line: startLine, col: startCol });
  }

  while (pos < source.length) {
    const startLine = line;
    const startCol = col;
    const ch = peek();

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      advance();
      continue;
    }

    // Line comments
    if (ch === '/' && peek2() === '/') {
      while (pos < source.length && peek() !== '\n') advance();
      continue;
    }

    // Block comments
    if (ch === '/' && peek2() === '*') {
      advance(); advance(); // skip /*
      while (pos < source.length) {
        if (peek() === '*' && peek2() === '/') { advance(); advance(); break; }
        advance();
      }
      continue;
    }

    // Numbers
    if (ch >= '0' && ch <= '9') {
      let num = '';
      if (ch === '0' && (peek2() === 'x' || peek2() === 'X')) {
        num += advance(); num += advance(); // 0x
        while (pos < source.length && /[0-9a-fA-F]/.test(peek())) num += advance();
      } else if (ch === '0' && (peek2() === 'b' || peek2() === 'B')) {
        num += advance(); num += advance(); // 0b
        while (pos < source.length && (peek() === '0' || peek() === '1')) num += advance();
      } else {
        while (pos < source.length && peek() >= '0' && peek() <= '9') num += advance();
      }
      emit(TokenKind.Number, num, startLine, startCol);
      continue;
    }

    // Identifiers & keywords
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      let id = '';
      while (pos < source.length && /[a-zA-Z0-9_]/.test(peek())) id += advance();
      const kw = KEYWORDS[id];
      emit(kw !== undefined ? kw : TokenKind.Ident, id, startLine, startCol);
      continue;
    }

    // Strings
    if (ch === '"') {
      advance(); // skip opening quote
      let str = '';
      while (pos < source.length && peek() !== '"') {
        if (peek() === '\\') { advance(); str += advance(); }
        else str += advance();
      }
      if (peek() === '"') advance(); // skip closing quote
      emit(TokenKind.String, str, startLine, startCol);
      continue;
    }

    // Char literals
    if (ch === '\'') {
      advance();
      let c = '';
      if (peek() === '\\') { advance(); c = advance(); }
      else c = advance();
      if (peek() === '\'') advance();
      emit(TokenKind.Char, c, startLine, startCol);
      continue;
    }

    // Two-char operators
    advance(); // consume first char
    const ch2 = peek();

    switch (ch) {
      case '+':
        if (ch2 === '+') { advance(); emit(TokenKind.PlusPlus, '++', startLine, startCol); }
        else if (ch2 === '=') { advance(); emit(TokenKind.PlusAssign, '+=', startLine, startCol); }
        else emit(TokenKind.Plus, '+', startLine, startCol);
        break;
      case '-':
        if (ch2 === '-') { advance(); emit(TokenKind.MinusMinus, '--', startLine, startCol); }
        else if (ch2 === '=') { advance(); emit(TokenKind.MinusAssign, '-=', startLine, startCol); }
        else if (ch2 === '>') { advance(); emit(TokenKind.Arrow, '->', startLine, startCol); }
        else emit(TokenKind.Minus, '-', startLine, startCol);
        break;
      case '*':
        if (ch2 === '=') { advance(); emit(TokenKind.StarAssign, '*=', startLine, startCol); }
        else emit(TokenKind.Star, '*', startLine, startCol);
        break;
      case '/':
        if (ch2 === '=') { advance(); emit(TokenKind.SlashAssign, '/=', startLine, startCol); }
        else emit(TokenKind.Slash, '/', startLine, startCol);
        break;
      case '%':
        if (ch2 === '=') { advance(); emit(TokenKind.PercentAssign, '%=', startLine, startCol); }
        else emit(TokenKind.Percent, '%', startLine, startCol);
        break;
      case '&':
        if (ch2 === '&') { advance(); emit(TokenKind.AmpAmp, '&&', startLine, startCol); }
        else if (ch2 === '=') { advance(); emit(TokenKind.AmpAssign, '&=', startLine, startCol); }
        else emit(TokenKind.Amp, '&', startLine, startCol);
        break;
      case '|':
        if (ch2 === '|') { advance(); emit(TokenKind.PipePipe, '||', startLine, startCol); }
        else if (ch2 === '=') { advance(); emit(TokenKind.PipeAssign, '|=', startLine, startCol); }
        else emit(TokenKind.Pipe, '|', startLine, startCol);
        break;
      case '^':
        if (ch2 === '=') { advance(); emit(TokenKind.CaretAssign, '^=', startLine, startCol); }
        else emit(TokenKind.Caret, '^', startLine, startCol);
        break;
      case '?': emit(TokenKind.Question, '?', startLine, startCol); break;
      case ':': emit(TokenKind.Colon, ':', startLine, startCol); break;
      case '~': emit(TokenKind.Tilde, '~', startLine, startCol); break;
      case '!':
        if (ch2 === '=') { advance(); emit(TokenKind.NotEq, '!=', startLine, startCol); }
        else emit(TokenKind.Bang, '!', startLine, startCol);
        break;
      case '=':
        if (ch2 === '=') { advance(); emit(TokenKind.Eq, '==', startLine, startCol); }
        else emit(TokenKind.Assign, '=', startLine, startCol);
        break;
      case '<':
        if (ch2 === '=') { advance(); emit(TokenKind.LtEq, '<=', startLine, startCol); }
        else if (ch2 === '<') {
          advance();
          if (peek() === '=') { advance(); emit(TokenKind.ShiftLeftAssign, '<<=', startLine, startCol); }
          else emit(TokenKind.ShiftLeft, '<<', startLine, startCol);
        }
        else emit(TokenKind.Lt, '<', startLine, startCol);
        break;
      case '>':
        if (ch2 === '=') { advance(); emit(TokenKind.GtEq, '>=', startLine, startCol); }
        else if (ch2 === '>') {
          advance();
          if (peek() === '=') { advance(); emit(TokenKind.ShiftRightAssign, '>>=', startLine, startCol); }
          else emit(TokenKind.ShiftRight, '>>', startLine, startCol);
        }
        else emit(TokenKind.Gt, '>', startLine, startCol);
        break;
      case '(': emit(TokenKind.LParen, '(', startLine, startCol); break;
      case ')': emit(TokenKind.RParen, ')', startLine, startCol); break;
      case '{': emit(TokenKind.LBrace, '{', startLine, startCol); break;
      case '}': emit(TokenKind.RBrace, '}', startLine, startCol); break;
      case '[': emit(TokenKind.LBracket, '[', startLine, startCol); break;
      case ']': emit(TokenKind.RBracket, ']', startLine, startCol); break;
      case ';': emit(TokenKind.Semi, ';', startLine, startCol); break;
      case ',': emit(TokenKind.Comma, ',', startLine, startCol); break;
      case '.':
        if (peek() === '.' && (pos + 1 < source.length && source[pos + 1] === '.')) {
          advance(); advance(); emit(TokenKind.Ellipsis, '...', startLine, startCol);
        } else {
          emit(TokenKind.Dot, '.', startLine, startCol);
        }
        break;
      default:
        emit(TokenKind.Error, ch, startLine, startCol);
    }
  }

  emit(TokenKind.EOF, '', line, col);
  return tokens;
}
