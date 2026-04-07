// EmberC Compiler — top-level pipeline: source → assembly

import { tokenize, TokenKind } from './lexer';
import { parse, ParseError } from './parser';
import { codegen } from './codegen';
import { preprocess } from './preprocessor';
import { registerStdlib } from './stdlib';

// Register stdlib headers on module load
registerStdlib();

export interface CompileError {
  line: number;
  col: number;
  message: string;
}

export interface CompileResult {
  success: boolean;
  assembly: string;
  errors: CompileError[];
}

export function compile(source: string): CompileResult {
  const errors: CompileError[] = [];

  try {
    // Preprocess
    const ppResult = preprocess(source);
    for (const e of ppResult.errors) {
      errors.push({ line: e.line, col: 0, message: e.message });
    }
    if (errors.length > 0) return { success: false, assembly: '', errors };

    // Lex
    const tokens = tokenize(ppResult.source);

    // Check for lexer errors
    for (const t of tokens) {
      if (t.kind === TokenKind.Error) {
        errors.push({ line: t.line, col: t.col, message: `unexpected character: '${t.value}'` });
      }
    }
    if (errors.length > 0) return { success: false, assembly: '', errors };

    // Parse
    const ast = parse(tokens);

    // Generate code
    const assembly = codegen(ast);

    return { success: true, assembly, errors: [] };

  } catch (e) {
    if (e instanceof ParseError) {
      errors.push({ line: e.loc.line, col: e.loc.col, message: e.message });
    } else {
      errors.push({ line: 0, col: 0, message: String(e) });
    }
    return { success: false, assembly: '', errors };
  }
}

// Example EmberC programs
export const EMBERC_EXAMPLES: { name: string; source: string }[] = [
  {
    name: 'Count to 10',
    source: `int count;

void main() {
    for (int i = 1; i <= 10; i++) {
        count = i;
    }
}
`,
  },
  {
    name: 'Fibonacci',
    source: `int fib[10];

void main() {
    fib[0] = 0;
    fib[1] = 1;
    for (int i = 2; i < 10; i++) {
        fib[i] = fib[i - 1] + fib[i - 2];
    }
}
`,
  },
  {
    name: 'Pong',
    source: `int grid[64];
int ballX, ballY, dx, dy, paddleY;

void clear() {
    for (int i = 0; i < 32; i++) {
        grid[i] = 0;
    }
}

void draw() {
    clear();
    grid[ballY * 8 + ballX] = 2;
    grid[paddleY * 8 + 7] = 3;
    grid[(paddleY + 1) * 8 + 7] = 3;
}

void main() {
    ballX = 1;
    ballY = 3;
    dx = 1;
    dy = 1;
    paddleY = 3;

    while (1) {
        int key = input();
        if (key == 1 && paddleY > 0) paddleY--;
        if (key == 2 && paddleY < 5) paddleY++;

        ballX = ballX + dx;
        ballY = ballY + dy;

        if (ballY <= 0) dy = 1;
        if (ballY >= 5) dy = -1;
        if (ballX <= 0) dx = 1;
        if (ballX >= 6) {
            if (ballY >= paddleY && ballY <= paddleY + 2) {
                dx = -1;
            } else {
                ballX = 1;
                ballY = 3;
                dx = 1;
                dy = 1;
            }
        }
        draw();
    }
}
`,
  },
  {
    name: 'Draw Pad',
    source: `int grid[64];
int cursorX, cursorY;

void main() {
    cursorX = 3;
    cursorY = 3;
    grid[cursorY * 8 + cursorX] = 1;

    while (1) {
        int key = input();
        if (key == 1 && cursorY > 0) cursorY--;
        if (key == 2 && cursorY < 7) cursorY++;
        if (key == 3 && cursorX > 0) cursorX--;
        if (key == 4 && cursorX < 7) cursorX++;
        if (key != 0) {
            grid[cursorY * 8 + cursorX] = 1;
        }
    }
}
`,
  },
  {
    name: 'Primes',
    source: `int primes[10];
int count;

bool isPrime(int n) {
    for (int d = 2; d < n; d++) {
        if (n % d == 0) return false;
    }
    return true;
}

void main() {
    count = 0;
    for (int n = 2; n < 20; n++) {
        if (isPrime(n)) {
            primes[count] = n;
            count++;
        }
    }
}
`,
  },
  {
    name: 'Tetris',
    source: `// Tetris on 8x10 grid (cols x rows)
// MEM[0..79] = board, MEM[80..83] = current piece cells
// Piece values: 0=empty, 1=placed, 2=active piece

int board[80];
int pieceX, pieceY;
int pieceType;
int score;
int gameOver;

// Piece shapes: each is 4 cells as (row*8+col) offsets
// I-piece horizontal: (0,0)(0,1)(0,2)(0,3)
// O-piece: (0,0)(0,1)(1,0)(1,1)
// T-piece: (0,0)(0,1)(0,2)(1,1)
// L-piece: (0,0)(1,0)(2,0)(2,1)

int pieces[16]; // 4 pieces x 4 offsets

void initPieces() {
    // I-piece
    pieces[0] = 0; pieces[1] = 1; pieces[2] = 2; pieces[3] = 3;
    // O-piece
    pieces[4] = 0; pieces[5] = 1; pieces[6] = 8; pieces[7] = 9;
    // T-piece
    pieces[8] = 0; pieces[9] = 1; pieces[10] = 2; pieces[11] = 9;
    // L-piece
    pieces[12] = 0; pieces[13] = 8; pieces[14] = 16; pieces[15] = 17;
}

void clearActive() {
    for (int i = 0; i < 80; i++) {
        if (board[i] == 2) board[i] = 0;
    }
}

void drawPiece() {
    int base = pieceType * 4;
    for (int i = 0; i < 4; i++) {
        int offset = pieces[base + i];
        int row = offset >> 3;
        int col = offset & 7;
        int addr = (pieceY + row) * 8 + (pieceX + col);
        if (addr >= 0 && addr < 80) {
            board[addr] = 2;
        }
    }
}

bool canPlace(int nx, int ny) {
    int base = pieceType * 4;
    for (int i = 0; i < 4; i++) {
        int offset = pieces[base + i];
        int row = offset >> 3;
        int col = offset & 7;
        int r = ny + row;
        int c = nx + col;
        if (c < 0 || c >= 8 || r >= 10) return false;
        int addr = r * 8 + c;
        if (addr >= 0 && addr < 80) {
            if (board[addr] == 1) return false;
        }
    }
    return true;
}

void lockPiece() {
    for (int i = 0; i < 80; i++) {
        if (board[i] == 2) board[i] = 1;
    }
}

void checkRows() {
    for (int row = 9; row >= 0; row--) {
        int full = 1;
        for (int col = 0; col < 8; col++) {
            if (board[row * 8 + col] == 0) full = 0;
        }
        if (full == 1) {
            score++;
            // Shift everything down
            for (int r = row; r > 0; r--) {
                for (int c = 0; c < 8; c++) {
                    board[r * 8 + c] = board[(r - 1) * 8 + c];
                }
            }
            // Clear top row
            for (int c = 0; c < 8; c++) {
                board[c] = 0;
            }
        }
    }
}

void spawnPiece() {
    pieceX = 3;
    pieceY = 0;
    pieceType = score & 3; // cycle through pieces
    if (!canPlace(pieceX, pieceY)) {
        gameOver = 1;
    }
}

void main() {
    initPieces();
    score = 0;
    gameOver = 0;
    spawnPiece();

    while (gameOver == 0) {
        clearActive();
        drawPiece();

        int key = input();

        // Left
        if (key == 3) {
            if (canPlace(pieceX - 1, pieceY)) pieceX--;
        }
        // Right
        if (key == 4) {
            if (canPlace(pieceX + 1, pieceY)) pieceX++;
        }
        // Down (fast drop)
        if (key == 2) {
            if (canPlace(pieceX, pieceY + 1)) {
                pieceY++;
            }
        }

        // Gravity: try to move down
        if (canPlace(pieceX, pieceY + 1)) {
            pieceY++;
        } else {
            // Lock and spawn new
            clearActive();
            drawPiece();
            lockPiece();
            checkRows();
            spawnPiece();
        }

        clearActive();
        drawPiece();
    }
}
`,
  },
];
