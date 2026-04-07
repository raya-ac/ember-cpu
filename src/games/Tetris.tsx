// Standalone Tetris with hold piece, next preview, visual effects

import { useState, useEffect, useCallback, useRef } from 'react';

const COLS = 10;
const ROWS = 20;
const EMPTY = 0;

const PIECES = [
  [[[0,0],[0,1],[0,2],[0,3]], [[0,0],[1,0],[2,0],[3,0]]],                                              // I
  [[[0,0],[0,1],[1,0],[1,1]]],                                                                          // O
  [[[0,0],[0,1],[0,2],[1,1]], [[0,0],[1,0],[2,0],[1,1]], [[1,0],[1,1],[1,2],[0,1]], [[0,0],[1,0],[2,0],[1,-1]]], // T
  [[[0,1],[0,2],[1,0],[1,1]], [[0,0],[1,0],[1,1],[2,1]]],                                               // S
  [[[0,0],[0,1],[1,1],[1,2]], [[0,1],[1,0],[1,1],[2,0]]],                                               // Z
  [[[0,0],[1,0],[2,0],[2,1]], [[0,0],[0,1],[0,2],[1,0]], [[0,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[1,2],[0,2]]], // L
  [[[0,1],[1,1],[2,1],[2,0]], [[0,0],[1,0],[1,1],[1,2]], [[0,0],[0,1],[1,0],[2,0]], [[0,0],[0,1],[0,2],[1,2]]], // J
];

const PIECE_NAMES = ['I', 'O', 'T', 'S', 'Z', 'L', 'J'];

const COLORS: Record<number, string> = {
  0: '',
  1: 'from-cyan-300 to-cyan-500',
  2: 'from-yellow-300 to-yellow-500',
  3: 'from-purple-400 to-purple-600',
  4: 'from-green-400 to-green-600',
  5: 'from-red-400 to-red-600',
  6: 'from-orange-400 to-orange-600',
  7: 'from-blue-400 to-blue-600',
};

const GLOW: Record<number, string> = {
  1: 'shadow-[0_0_8px_rgba(34,211,238,0.5)]',
  2: 'shadow-[0_0_8px_rgba(250,204,21,0.5)]',
  3: 'shadow-[0_0_8px_rgba(168,85,247,0.5)]',
  4: 'shadow-[0_0_8px_rgba(34,197,94,0.5)]',
  5: 'shadow-[0_0_8px_rgba(239,68,68,0.5)]',
  6: 'shadow-[0_0_8px_rgba(249,115,22,0.5)]',
  7: 'shadow-[0_0_8px_rgba(59,130,246,0.5)]',
};

interface GameState {
  board: number[][];
  piece: { type: number; rotation: number; row: number; col: number } | null;
  nextPiece: number;
  holdPiece: number | null;
  canHold: boolean;
  score: number;
  lines: number;
  level: number;
  gameOver: boolean;
  combo: number;
  lastClear: number; // 0-4 lines cleared on last lock
  flashRows: number[]; // rows currently flashing from clear
  shakeIntensity: number;
}

function createBoard(): number[][] {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(EMPTY));
}

function getRotation(type: number, rot: number): number[][] {
  return PIECES[type][rot % PIECES[type].length];
}

function canPlace(board: number[][], type: number, rot: number, row: number, col: number): boolean {
  for (const [dr, dc] of getRotation(type, rot)) {
    const r = row + dr, c = col + dc;
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    if (board[r][c] !== EMPTY) return false;
  }
  return true;
}

function placePiece(board: number[][], type: number, rot: number, row: number, col: number): number[][] {
  const b = board.map(r => [...r]);
  for (const [dr, dc] of getRotation(type, rot)) {
    const r = row + dr, c = col + dc;
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) b[r][c] = type + 1;
  }
  return b;
}

function clearLines(board: number[][]): { board: number[][]; cleared: number; rows: number[] } {
  const rows: number[] = [];
  const kept = board.filter((row, i) => {
    if (row.every(c => c !== EMPTY)) { rows.push(i); return false; }
    return true;
  });
  const cleared = ROWS - kept.length;
  while (kept.length < ROWS) kept.unshift(new Array(COLS).fill(EMPTY));
  return { board: kept, cleared, rows };
}

function randomPiece(): number { return Math.floor(Math.random() * PIECES.length); }

const SPAWN_COL = Math.floor(COLS / 2) - 1;

// === EmberC source for display ===
const EMBERC_SOURCE = `int board[200];
int pieceX, pieceY, pieceType;
int nextPiece, holdPiece;
int score, lines, level;

bool canPlace(int type, int rot,
              int row, int col) {
    for (int i = 0; i < 4; i++) {
        int r = row + cellRow(type, rot, i);
        int c = col + cellCol(type, rot, i);
        if (r < 0 || r >= 20) return false;
        if (c < 0 || c >= 10) return false;
        if (board[r * 10 + c] != 0) return false;
    }
    return true;
}

void lockPiece() { ... }
void checkRows() { ... }
void holdSwap() { ... }

void main() {
    score = 0; level = 1;
    spawnPiece();
    while (!gameOver) {
        int key = input();
        if (key == 3) moveLeft();
        if (key == 4) moveRight();
        if (key == 1) rotate();
        if (key == 2) softDrop();
        if (key == 5) hardDrop();
        if (key == 6) holdSwap();
        gravity();
        drawBoard();
    }
}`;

export function TetrisGame() {
  const [game, setGame] = useState<GameState>(() => ({
    board: createBoard(),
    piece: { type: randomPiece(), rotation: 0, row: 0, col: SPAWN_COL },
    nextPiece: randomPiece(),
    holdPiece: null,
    canHold: true,
    score: 0, lines: 0, level: 1,
    gameOver: false,
    combo: 0,
    lastClear: 0,
    flashRows: [],
    shakeIntensity: 0,
  }));
  const [showSource, setShowSource] = useState(false);
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; text: string; color: string }[]>([]);
  const particleId = useRef(0);

  // Spawn particle
  const spawnParticle = useCallback((text: string, color: string) => {
    const id = particleId.current++;
    setParticles(prev => [...prev, { id, x: 50 + Math.random() * 140, y: 200 + Math.random() * 100, text, color }]);
    setTimeout(() => setParticles(prev => prev.filter(p => p.id !== id)), 1500);
  }, []);

  const spawnNew = useCallback((board: number[][], cleared: number, prevCombo: number): Partial<GameState> => {
    const newType = game.nextPiece;
    const next = randomPiece();
    const isOver = !canPlace(board, newType, 0, 0, SPAWN_COL);
    const lineScore = [0, 100, 300, 500, 800][cleared] ?? 0;
    const comboBonus = cleared > 0 ? prevCombo * 50 : 0;
    const newCombo = cleared > 0 ? prevCombo + 1 : 0;

    if (cleared > 0) {
      const names = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS!'];
      spawnParticle(`${names[cleared]}`, cleared === 4 ? 'text-amber-400' : 'text-cyan-400');
      if (newCombo > 1) spawnParticle(`${newCombo}x COMBO`, 'text-purple-400');
    }

    return {
      board,
      piece: isOver ? null : { type: newType, rotation: 0, row: 0, col: SPAWN_COL },
      nextPiece: next,
      canHold: true,
      score: game.score + lineScore + comboBonus,
      lines: game.lines + cleared,
      level: Math.floor((game.lines + cleared) / 10) + 1,
      gameOver: isOver,
      combo: newCombo,
      lastClear: cleared,
      shakeIntensity: cleared >= 3 ? 6 : cleared >= 2 ? 3 : 0,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.nextPiece, game.score, game.lines, game.combo, spawnParticle]);

  const handleInput = useCallback((action: string) => {
    setGame(prev => {
      if (prev.gameOver || !prev.piece) return prev;
      const { type, rotation, row, col } = prev.piece;

      switch (action) {
        case 'left':
          return canPlace(prev.board, type, rotation, row, col - 1)
            ? { ...prev, piece: { ...prev.piece, col: col - 1 } } : prev;
        case 'right':
          return canPlace(prev.board, type, rotation, row, col + 1)
            ? { ...prev, piece: { ...prev.piece, col: col + 1 } } : prev;
        case 'rotate': {
          const nr = (rotation + 1) % PIECES[type].length;
          if (canPlace(prev.board, type, nr, row, col)) return { ...prev, piece: { ...prev.piece, rotation: nr } };
          if (canPlace(prev.board, type, nr, row, col - 1)) return { ...prev, piece: { ...prev.piece, rotation: nr, col: col - 1 } };
          if (canPlace(prev.board, type, nr, row, col + 1)) return { ...prev, piece: { ...prev.piece, rotation: nr, col: col + 1 } };
          return prev;
        }
        case 'softdrop':
          return canPlace(prev.board, type, rotation, row + 1, col)
            ? { ...prev, piece: { ...prev.piece, row: row + 1 }, score: prev.score + 1 } : prev;
        case 'harddrop': {
          let r = row;
          while (canPlace(prev.board, type, rotation, r + 1, col)) r++;
          const placed = placePiece(prev.board, type, rotation, r, col);
          const { board: cleared, cleared: n, rows } = clearLines(placed);
          return { ...prev, ...spawnNew(cleared, n, prev.combo), score: prev.score + (r - row) * 2 + ([0,100,300,500,800][n] ?? 0), flashRows: rows };
        }
        case 'hold': {
          if (!prev.canHold) return prev;
          const held = prev.holdPiece;
          const newType = held !== null ? held : prev.nextPiece;
          const nextPiece = held !== null ? prev.nextPiece : randomPiece();
          if (!canPlace(prev.board, newType, 0, 0, SPAWN_COL)) return prev;
          return {
            ...prev,
            piece: { type: newType, rotation: 0, row: 0, col: SPAWN_COL },
            holdPiece: type,
            nextPiece: held !== null ? prev.nextPiece : nextPiece,
            canHold: false,
          };
        }
      }
      return prev;
    });
  }, [spawnNew]);

  // Keyboard
  useEffect(() => {
    const map: Record<string, string> = {
      ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'rotate',
      ArrowDown: 'softdrop', ' ': 'harddrop', c: 'hold', Shift: 'hold',
      a: 'left', d: 'right', w: 'rotate', s: 'softdrop',
    };
    const handler = (e: KeyboardEvent) => {
      const action = map[e.key];
      if (action) { e.preventDefault(); handleInput(action); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleInput]);

  // Gravity
  useEffect(() => {
    if (game.gameOver) return;
    const speed = Math.max(80, 800 - (game.level - 1) * 70);
    const interval = setInterval(() => {
      setGame(prev => {
        if (prev.gameOver || !prev.piece) return prev;
        const { type, rotation, row, col } = prev.piece;
        if (canPlace(prev.board, type, rotation, row + 1, col)) {
          return { ...prev, piece: { ...prev.piece, row: row + 1 } };
        }
        const placed = placePiece(prev.board, type, rotation, row, col);
        const { board: cleared, cleared: n, rows } = clearLines(placed);
        return { ...prev, ...spawnNew(cleared, n, prev.combo), flashRows: rows };
      });
    }, speed);
    return () => clearInterval(interval);
  }, [game.gameOver, game.level, spawnNew]);

  // Decay shake
  useEffect(() => {
    if (game.shakeIntensity > 0) {
      const t = setTimeout(() => setGame(prev => ({ ...prev, shakeIntensity: 0 })), 300);
      return () => clearTimeout(t);
    }
  }, [game.shakeIntensity]);

  // Build display board
  const displayBoard = game.board.map(r => [...r]);
  if (game.piece) {
    const { type, rotation, row, col } = game.piece;
    // Ghost
    let ghostRow = row;
    while (canPlace(game.board, type, rotation, ghostRow + 1, col)) ghostRow++;
    if (ghostRow !== row) {
      for (const [dr, dc] of getRotation(type, rotation)) {
        const r = ghostRow + dr, c = col + dc;
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS && displayBoard[r][c] === EMPTY)
          displayBoard[r][c] = -(type + 1); // negative = ghost
      }
    }
    for (const [dr, dc] of getRotation(type, rotation)) {
      const r = row + dr, c = col + dc;
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) displayBoard[r][c] = type + 1;
    }
  }

  const restart = () => {
    const t = randomPiece();
    setGame({
      board: createBoard(),
      piece: { type: t, rotation: 0, row: 0, col: SPAWN_COL },
      nextPiece: randomPiece(),
      holdPiece: null, canHold: true,
      score: 0, lines: 0, level: 1,
      gameOver: false, combo: 0, lastClear: 0, flashRows: [], shakeIntensity: 0,
    });
  };

  const shakeStyle = game.shakeIntensity > 0
    ? { transform: `translate(${(Math.random() - 0.5) * game.shakeIntensity}px, ${(Math.random() - 0.5) * game.shakeIntensity}px)` }
    : {};

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center gap-6 p-4 select-none">
      {/* Source panel */}
      {showSource && (
        <div className="w-56 h-[540px] bg-zinc-900/50 border border-zinc-800 rounded-lg overflow-hidden flex flex-col shrink-0">
          <div className="px-3 py-2 border-b border-zinc-800 text-amber-400 text-[10px] font-mono font-bold">tetris.ec</div>
          <pre className="flex-1 overflow-auto p-2 text-[9px] font-mono text-zinc-600 leading-relaxed">{EMBERC_SOURCE}</pre>
        </div>
      )}

      {/* Left sidebar: hold */}
      <div className="flex flex-col gap-4 w-20">
        <SideBox label="HOLD" pieceType={game.holdPiece} dimmed={!game.canHold} />
        <div />
      </div>

      {/* Center: board */}
      <div className="flex flex-col items-center gap-3">
        <h1 className="text-3xl font-black tracking-tight text-cyan-400">TETRIS</h1>

        <div className="flex items-center gap-6">
          <Stat label="Score" value={game.score} color="text-amber-400" />
          <Stat label="Lines" value={game.lines} color="text-cyan-400" />
          <Stat label="Level" value={game.level} color="text-green-400" />
        </div>

        <div className="relative" style={shakeStyle}>
          <div
            className="grid gap-[1px] p-[2px] bg-zinc-800/40 rounded-md border border-zinc-800"
            style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, width: '240px' }}
          >
            {displayBoard.flat().map((cell, i) => {
              const abs = Math.abs(cell);
              const isGhost = cell < 0;
              const isFlash = game.flashRows.includes(Math.floor(i / COLS));
              return (
                <div
                  key={i}
                  className={`aspect-square rounded-[2px] transition-all duration-75 ${
                    isFlash
                      ? 'bg-white animate-pulse'
                      : isGhost
                        ? `bg-gradient-to-b ${COLORS[abs]} opacity-20 border border-white/10`
                        : abs > 0
                          ? `bg-gradient-to-b ${COLORS[abs]} ${GLOW[abs] ?? ''} shadow-[inset_0_-1px_2px_rgba(0,0,0,0.3)]`
                          : 'bg-zinc-900/50'
                  }`}
                />
              );
            })}
          </div>

          {/* Particles */}
          {particles.map(p => (
            <div
              key={p.id}
              className={`absolute font-black text-sm pointer-events-none ${p.color} animate-bounce`}
              style={{ left: p.x, top: p.y, animation: 'floatUp 1.5s ease-out forwards' }}
            >
              {p.text}
            </div>
          ))}

          {game.gameOver && (
            <div className="absolute inset-0 bg-black/80 rounded-md flex flex-col items-center justify-center gap-3 backdrop-blur-sm">
              <div className="text-red-400 text-2xl font-black tracking-wider">GAME OVER</div>
              <div className="text-zinc-400 text-sm font-mono">Score: {game.score}</div>
              <button onClick={restart}
                className="px-5 py-2 bg-cyan-500 text-zinc-950 rounded-md font-bold text-sm hover:bg-cyan-400 transition-colors">
                Play Again
              </button>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex gap-1">
            <Btn label="←" onClick={() => handleInput('left')} />
            <Btn label="↻" onClick={() => handleInput('rotate')} />
            <Btn label="↓" onClick={() => handleInput('softdrop')} />
            <Btn label="→" onClick={() => handleInput('right')} />
            <Btn label="⇄" onClick={() => handleInput('hold')} />
          </div>
          <div className="flex gap-1">
            <Btn label="SPACE — drop" wide onClick={() => handleInput('harddrop')} />
            <Btn label="C — hold" onClick={() => handleInput('hold')} />
          </div>
        </div>

        <div className="text-center space-y-1">
          <button onClick={() => setShowSource(!showSource)}
            className="text-zinc-600 text-[10px] font-mono hover:text-zinc-400 transition-colors">
            {showSource ? 'hide source' : 'show EmberC source'}
          </button>
          <div className="flex items-center gap-2 text-[10px] justify-center">
            <span className="text-zinc-700 uppercase tracking-widest">Powered by</span>
            <span className="text-amber-500 font-bold">EmberC</span>
            <span className="text-zinc-700">→</span>
            <span className="text-amber-500 font-bold">Ember</span>
            <span className="text-zinc-600">CPU</span>
          </div>
          <a href="#/" className="text-zinc-700 text-[10px] hover:text-zinc-500 transition-colors block">← simulator</a>
        </div>
      </div>

      {/* Right sidebar: next */}
      <div className="flex flex-col gap-4 w-20">
        <SideBox label="NEXT" pieceType={game.nextPiece} />
      </div>
    </div>
  );
}

function SideBox({ label, pieceType, dimmed }: { label: string; pieceType: number | null; dimmed?: boolean }) {
  const cells = pieceType !== null ? getRotation(pieceType, 0) : [];
  // Normalize to fit in 4x4 preview
  const grid = Array.from({ length: 16 }, () => 0);
  for (const [r, c] of cells) {
    const idx = (r + 1) * 4 + (c + 1);
    if (idx >= 0 && idx < 16) grid[idx] = pieceType! + 1;
  }

  return (
    <div className={`border border-zinc-800 rounded-lg p-2 bg-zinc-900/30 ${dimmed ? 'opacity-40' : ''}`}>
      <div className="text-[9px] text-zinc-600 uppercase tracking-widest text-center mb-1.5">{label}</div>
      {pieceType !== null ? (
        <div className="grid grid-cols-4 gap-[1px] w-16 mx-auto">
          {grid.map((cell, i) => (
            <div key={i} className={`aspect-square rounded-[1px] ${
              cell > 0 ? `bg-gradient-to-b ${COLORS[cell]}` : 'bg-transparent'
            }`} />
          ))}
        </div>
      ) : (
        <div className="w-16 h-16 mx-auto flex items-center justify-center text-zinc-800 text-xs">—</div>
      )}
      {pieceType !== null && (
        <div className="text-[9px] text-zinc-600 text-center mt-1 font-mono">{PIECE_NAMES[pieceType]}</div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className="text-zinc-600 text-[9px] uppercase tracking-widest">{label}</div>
      <div className={`text-lg font-black font-mono tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function Btn({ label, onClick, wide }: { label: string; onClick: () => void; wide?: boolean }) {
  return (
    <button onClick={onClick}
      className={`${wide ? 'px-5' : 'px-2.5'} py-1.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-400 text-[10px] font-mono
        hover:bg-zinc-700 hover:text-zinc-200 active:bg-zinc-600 transition-colors`}>
      {label}
    </button>
  );
}
