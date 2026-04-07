// Example programs for the Ember CPU (32-bit)
//
// Memory-mapped I/O (word addresses in data memory):
//   Write MEM[0x1FFFFF] -> print number to console
//   Write MEM[0x1FFFFE] -> print ASCII char to console
//   Read  MEM[0x1FFFFD] -> keyboard input (1=up, 2=down, 3=left, 4=right, 5=space, 0=none)
//
// I/O addresses are loaded with LUI + ORI since they're > 20 bits.
// For data memory visualization, we use low addresses (0, 1, 2...) as before.

export interface ExampleProgram {
  name: string;
  description: string;
  source: string;
  interactive?: boolean; // needs keyboard input
}

export const EXAMPLE_PROGRAMS: ExampleProgram[] = [
  {
    name: 'Count to 10',
    description: 'Simple counter with progress bar',
    source: `; Count to 10 — outputs each number
  li    R2, 10        ; limit = 10
  li    R1, 0         ; counter = 0

loop:
  addi  R1, R1, 1     ; counter++
  sw    R1, R0, 0     ; store current count
  bne   R1, R2, loop  ; if counter != limit, loop
  halt
`,
  },
  {
    name: 'Fibonacci',
    description: 'Fibonacci bar chart',
    source: `; Fibonacci sequence -> data memory

  li    R1, 0         ; F(n-2) = 0
  li    R2, 1         ; F(n-1) = 1
  li    R3, 0         ; memory pointer
  li    R5, 10        ; count

  sw    R1, R3, 0     ; store F(0)
  sw    R2, R3, 1     ; store F(1)
  addi  R3, R3, 2     ; ptr += 2
  addi  R5, R5, -2    ; count -= 2

loop:
  add   R4, R1, R2    ; F(n) = F(n-2) + F(n-1)
  sw    R4, R3, 0     ; store F(n)
  mov   R1, R2        ; shift window
  mov   R2, R4
  addi  R3, R3, 1     ; ptr++
  addi  R5, R5, -1    ; count--
  li    R6, 0
  bne   R5, R6, loop
  halt
`,
  },
  {
    name: 'Multiply',
    description: 'Hardware multiply 13 * 7',
    source: `; Multiply 13 * 7 using hardware MUL instruction

  li    R1, 13        ; multiplicand
  li    R2, 7         ; multiplier
  mul   R3, R1, R2    ; R3 = 13 * 7 = 91
  sw    R3, R0, 0     ; store result
  halt
`,
  },
  {
    name: 'Bubble Sort',
    description: 'Visual sorting algorithm',
    source: `; Bubble sort [5, 3, 8, 1, 4]

  li    R1, 5
  sw    R1, R0, 0
  li    R1, 3
  sw    R1, R0, 1
  li    R1, 8
  sw    R1, R0, 2
  li    R1, 1
  sw    R1, R0, 3
  li    R1, 4
  sw    R1, R0, 4

  li    R6, 5

outer:
  addi  R6, R6, -1
  li    R1, 0
  beq   R6, R1, done
  li    R5, 0

inner:
  lw    R1, R5, 0
  lw    R2, R5, 1
  blt   R2, R1, swap
  jmp   noswap

swap:
  sw    R2, R5, 0
  sw    R1, R5, 1

noswap:
  addi  R5, R5, 1
  bne   R5, R6, inner
  jmp   outer

done:
  halt
`,
  },
  {
    name: 'Snake',
    description: 'Animated snake on a grid',
    source: `; Snake on 4x4 grid
; MEM[0..15] = grid, 1=snake, 0=empty

  li    R5, 16        ; grid size
  li    R2, 3         ; snake length
  li    R1, 0         ; head
  li    R3, 0         ; steps
  li    R6, 0         ; tail

  li    R4, 1
  sw    R4, R0, 0
  sw    R4, R0, 1
  sw    R4, R0, 2
  li    R1, 2         ; head at 2

  li    R3, 20        ; run 20 steps

loop:
  addi  R1, R1, 1
  bne   R1, R5, nowrap
  li    R1, 0
nowrap:
  li    R4, 1
  sw    R4, R1, 0

  sub   R6, R1, R2
  li    R4, 0
  blt   R4, R6, tailok
  add   R6, R6, R5
tailok:
  li    R4, 0
  sw    R4, R6, 0

  addi  R3, R3, -1
  li    R4, 0
  bne   R3, R4, loop
  halt
`,
  },
  {
    name: 'Primes',
    description: 'Prime sieve visualization',
    source: `; Find primes < 20 using trial division
; Now uses hardware DIV and MOD!

  li    R1, 2         ; candidate
  li    R3, 0         ; output ptr
  li    R5, 20        ; limit

next_candidate:
  beq   R1, R5, done

  li    R2, 2         ; divisor
  li    R6, 1         ; is_prime

check_div:
  beq   R2, R1, prime_found

  mod   R4, R1, R2    ; R4 = candidate % divisor
  li    R6, 0
  beq   R4, R6, not_prime

  addi  R2, R2, 1
  li    R6, 1
  jmp   check_div

not_prime:
  li    R6, 0
  jmp   advance

prime_found:
  sw    R1, R3, 0
  addi  R3, R3, 1

advance:
  addi  R1, R1, 1
  jmp   next_candidate

done:
  halt
`,
  },
  {
    name: 'Draw',
    description: 'Arrow keys to draw on 8x8 grid',
    interactive: true,
    source: `; Interactive drawing pad — 8x8 grid
; Use arrow keys to move cursor
; MEM[0..63] = grid pixels
;
; I/O: LW from addr 0x1FFFFD = keyboard input
; 1=up, 2=down, 3=left, 4=right
;
; R1 = cursor X (0-7)
; R2 = cursor Y (0-7)
; R3 = input key
; R4 = temp
; R5 = grid addr = Y*8+X
; R6 = I/O addr register

  ; Build I/O address: 0x1FFFFD
  lui   R6, 0x1FFFF   ; R6 = 0x1FFFF000
  ori   R6, R6, 0xFFD ; R6 = 0x1FFFFFD

  ; Start cursor at center (3,3)
  li    R1, 3
  li    R2, 3

  ; Mark starting position
  li    R4, 3         ; shift amount
  shl   R5, R2, R4    ; R5 = Y*8
  add   R5, R5, R1    ; R5 = Y*8 + X
  li    R4, 1
  sw    R4, R5, 0     ; mark pixel

main_loop:
  ; Read keyboard
  lw    R3, R6, 0     ; R3 = key from I/O port

  ; If no key, loop
  li    R4, 0
  beq   R3, R4, main_loop

  ; Check direction
  li    R4, 1
  beq   R3, R4, go_up
  li    R4, 2
  beq   R3, R4, go_down
  li    R4, 3
  beq   R3, R4, go_left
  li    R4, 4
  beq   R3, R4, go_right
  jmp   main_loop

go_up:
  li    R4, 0
  beq   R2, R4, main_loop  ; already at top
  addi  R2, R2, -1
  jmp   draw

go_down:
  li    R4, 7
  beq   R2, R4, main_loop  ; already at bottom
  addi  R2, R2, 1
  jmp   draw

go_left:
  li    R4, 0
  beq   R1, R4, main_loop  ; already at left
  addi  R1, R1, -1
  jmp   draw

go_right:
  li    R4, 7
  beq   R1, R4, main_loop  ; already at right
  addi  R1, R1, 1
  jmp   draw

draw:
  ; compute addr = Y*8+X
  li    R4, 3
  shl   R5, R2, R4    ; R5 = Y*8
  add   R5, R5, R1    ; R5 = Y*8 + X
  li    R4, 1
  sw    R4, R5, 0     ; mark pixel

  jmp   main_loop
`,
  },
  {
    name: 'Life',
    description: 'Conway\'s Game of Life on 4x4 grid',
    source: `; Game of Life — 4x4 grid
; MEM[0..15] = current gen
; MEM[16..31] = next gen
; Runs for 8 generations
;
; Initial pattern: blinker
;   .X.
;   .X.
;   .X.

  ; Set initial state — vertical blinker at col 1
  li    R1, 1
  sw    R1, R0, 1     ; (0,1)
  sw    R1, R0, 5     ; (1,1)
  sw    R1, R0, 9     ; (2,1)

  li    R3, 8         ; generations to run

gen_loop:
  ; For each cell, count neighbors and apply rules
  li    R5, 0         ; cell index (0-15)

cell_loop:
  ; Count live neighbors of cell R5
  ; Cell coords: row = R5/4, col = R5%4
  li    R1, 0         ; neighbor count

  ; Check all 8 neighbors (simplified — skip bounds properly)
  ; Up: R5-4
  addi  R6, R5, -4
  li    R4, 0
  blt   R6, R4, skip_up
  lw    R4, R6, 0
  add   R1, R1, R4
skip_up:

  ; Down: R5+4
  addi  R6, R5, 4
  li    R4, 16
  blt   R4, R6, skip_down
  beq   R6, R4, skip_down
  lw    R4, R6, 0
  add   R1, R1, R4
skip_down:

  ; Left: R5-1 (only if col > 0)
  ; col = R5 & 3
  li    R4, 3
  and   R6, R5, R4    ; R6 = col
  li    R4, 0
  beq   R6, R4, skip_left
  addi  R6, R5, -1
  lw    R4, R6, 0
  add   R1, R1, R4
skip_left:

  ; Right: R5+1 (only if col < 3)
  li    R4, 3
  and   R6, R5, R4    ; R6 = col
  beq   R6, R4, skip_right
  addi  R6, R5, 1
  lw    R4, R6, 0
  add   R1, R1, R4
skip_right:

  ; Apply rules: current state
  lw    R2, R5, 0     ; R2 = current cell

  ; Rule: alive + 2-3 neighbors -> alive
  ;        dead + 3 neighbors -> alive
  ;        else -> dead
  li    R4, 0         ; default: dead

  ; if alive
  li    R6, 0
  beq   R2, R6, check_birth
  ; alive: survive if 2 or 3 neighbors
  li    R6, 2
  beq   R1, R6, cell_alive
  li    R6, 3
  beq   R1, R6, cell_alive
  jmp   store_cell

check_birth:
  li    R6, 3
  beq   R1, R6, cell_alive
  jmp   store_cell

cell_alive:
  li    R4, 1

store_cell:
  ; Store in next gen buffer (offset 16)
  addi  R6, R5, 16
  sw    R4, R6, 0

  ; Next cell
  addi  R5, R5, 1
  li    R4, 16
  bne   R5, R4, cell_loop

  ; Copy next gen to current gen
  li    R5, 0
copy_loop:
  addi  R6, R5, 16
  lw    R4, R6, 0     ; read next gen
  sw    R4, R5, 0     ; write to current
  li    R4, 0
  sw    R4, R6, 0     ; clear next gen
  addi  R5, R5, 1
  li    R4, 16
  bne   R5, R4, copy_loop

  ; Next generation
  addi  R3, R3, -1
  li    R4, 0
  bne   R3, R4, gen_loop

  halt
`,
  },
  {
    name: 'Pong',
    description: 'Arrow keys to move paddle',
    interactive: true,
    source: `; Pong — 8x8 grid
; MEM[0..63] = display
; 0=empty, 2=ball, 3=paddle
;
; R1 = ball X, R2 = ball Y
; R3 = dx (1=right), R4 = dy (1=down)
; R5 = paddle Y (0-6)
; R6 = temp

  ; Build I/O address: 0x1FFFFD
  lui   R7, 0x1FFFF   ; R7 = 0x1FFFF000
  ori   R7, R7, 0xFFD ; R7 = 0x1FFFFFD

  ; Init
  li    R1, 1         ; ball X
  li    R2, 3         ; ball Y
  li    R3, 1         ; dx = right
  li    R4, 1         ; dy = down
  li    R5, 3         ; paddle Y

frame:
  ; --- Clear grid (loop 0..31) ---
  li    R6, 0         ; i = 0
clear:
  sw    R0, R6, 0     ; MEM[i] = 0
  addi  R6, R6, 1
  li    R7, 31
  bne   R6, R7, clear

  ; Rebuild I/O addr (R7 was clobbered)
  lui   R7, 0x1FFFF
  ori   R7, R7, 0xFFD

  ; --- Read input ---
  lw    R6, R7, 0     ; read from I/O port

  ; Up pressed (key=1)?
  li    R7, 1
  bne   R6, R7, skip_up
  li    R7, 0
  beq   R5, R7, skip_up
  addi  R5, R5, -1
skip_up:
  ; Down pressed (key=2)?
  li    R7, 2
  bne   R6, R7, skip_dn
  li    R7, 5
  beq   R5, R7, skip_dn
  addi  R5, R5, 1
skip_dn:

  ; --- Move ball ---
  add   R1, R1, R3    ; X += dx
  add   R2, R2, R4    ; Y += dy

  ; Bounce top (Y==0 -> dy=1)
  li    R6, 0
  bne   R2, R6, no_top
  li    R4, 1
no_top:
  ; Bounce bottom (Y==5 -> dy=-1)
  li    R6, 5
  bne   R2, R6, no_bot
  addi  R4, R0, -1
no_bot:
  ; Bounce left (X==0 -> dx=1)
  li    R6, 0
  bne   R1, R6, no_left
  li    R3, 1
no_left:
  ; Hit right wall (X==6)?
  li    R6, 6
  bne   R1, R6, no_right
  ; Check paddle: ball Y in [paddleY, paddleY+2]
  blt   R2, R5, miss
  addi  R6, R5, 3
  blt   R6, R2, miss
  ; Hit! Bounce back
  addi  R3, R0, -1
  jmp   no_right
miss:
  ; Reset ball
  li    R1, 1
  li    R2, 3
  li    R3, 1
  li    R4, 1
no_right:

  ; --- Draw ball ---
  ; addr = Y*8+X. Use shift: Y<<3
  li    R6, 3
  shl   R6, R2, R6    ; R6 = Y*8
  add   R6, R6, R1    ; R6 = Y*8+X
  li    R7, 2
  sw    R7, R6, 0     ; MEM[addr] = 2 (ball)

  ; --- Draw paddle (2 cells at col 7) ---
  li    R6, 3
  shl   R6, R5, R6    ; R6 = paddleY*8
  addi  R6, R6, 7     ; R6 = paddleY*8+7
  li    R7, 3
  sw    R7, R6, 0     ; top paddle
  sw    R7, R6, 8     ; bottom paddle (+1 row)

  jmp   frame
`,
  },
  {
    name: 'Function Call',
    description: 'Subroutine demo with JAL/JR',
    source: `; Function call: double(5)

  li    R1, 5         ; argument
  jal   double        ; call, R7 = return addr
  sw    R1, R0, 0     ; store result
  halt

double:
  add   R1, R1, R1    ; R1 *= 2
  jr    R7            ; return
`,
  },
];
