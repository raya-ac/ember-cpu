// Test script: feed DOOM source files through EmberC and catalog errors
import { readFileSync, readdirSync } from 'fs';
import { compile } from './src/compiler/compiler';

// Build a simplified version of a DOOM file with our stdlib shims
const DOOM_SHIM = `
// Type shims for DOOM
typedef int fixed_t;
typedef int boolean;
typedef unsigned char byte;
typedef unsigned int uint32_t;
typedef int int32_t;
typedef unsigned char uint8_t;
typedef char int8_t;
typedef unsigned short uint16_t;
typedef short int16_t;
#define FRACBITS 16
#define FRACUNIT (1<<FRACBITS)
#define NULL 0
#define true 1
#define false 0
#define PACKEDATTR
#define INT_MIN (-2147483647-1)
#define INT_MAX 2147483647
`;

// Try compiling a small DOOM-like test to find gaps
const tests: [string, string][] = [
  ['basic typedefs', `
typedef int fixed_t;
typedef unsigned char byte;
fixed_t x;
byte b;
void main() { x = 42; b = 7; }
`],
  ['extern declarations', `
extern int foo;
extern void bar(int x);
int foo;
void bar(int x) { foo = x; }
void main() { bar(10); }
`],
  ['function pointers', `
typedef void (*callback_t)(int);
void doThing(int x) { }
void main() {
    callback_t cb = doThing;
    cb(42);
}
`],
  ['struct with pointer members', `
struct node {
    int value;
    struct node* next;
};
struct node a;
void main() {
    a.value = 1;
    a.next = 0;
}
`],
  ['array of structs', `
struct item {
    int type;
    int count;
};
struct item items[4];
void main() {
    items[0].type = 1;
    items[0].count = 10;
}
`],
  ['void pointer cast', `
void* p;
int* ip;
void main() {
    ip = (int*)p;
}
`],
  ['string literals', `
char* msg;
void main() {
    msg = "hello doom";
}
`],
  ['pointer arithmetic', `
int arr[10];
int* p;
void main() {
    p = arr;
    *(p + 3) = 42;
    p++;
}
`],
  ['static variables', `
static int counter;
void increment() {
    static int local_count;
    local_count++;
    counter = local_count;
}
void main() { increment(); increment(); }
`],
  ['char arrays', `
char name[16];
void main() {
    name[0] = 'D';
    name[1] = 'O';
    name[2] = 'O';
    name[3] = 'M';
    name[4] = 0;
}
`],
  ['compound assignment', `
int x;
void main() {
    x = 10;
    x += 5;
    x -= 2;
    x *= 3;
    x /= 2;
    x %= 7;
    x &= 0xFF;
    x |= 0x100;
    x ^= 0x55;
    x <<= 2;
    x >>= 1;
}
`],
  ['ternary in expression', `
int abs_val(int x) {
    return x < 0 ? -x : x;
}
void main() {
    int a = abs_val(-5);
}
`],
  ['multi-dim array access', `
int map[24*24];
void main() {
    int x = 5;
    int y = 10;
    map[y * 24 + x] = 1;
}
`],
  ['enum with values', `
enum { AM_NOAMMO, AM_CLIP, AM_SHELL, AM_MISL, AM_CELL, NUMAMMO };
int ammo[6];
void main() {
    ammo[AM_CLIP] = 50;
}
`],
  ['forward declarations', `
void bar(int x);
void foo() { bar(1); }
void bar(int x) { }
void main() { foo(); }
`],
  ['nested struct access', `
struct vec { int x; int y; };
struct player { struct vec pos; int health; };
struct player p;
void main() {
    p.pos.x = 100;
    p.pos.y = 200;
    p.health = 100;
}
`],
  ['global struct init', `
struct weapon { int ammo; int state; };
struct weapon weapons[3];
void main() {
    weapons[0].ammo = 0;
    weapons[0].state = 1;
    weapons[1].ammo = 2;
    weapons[1].state = 3;
}
`],
  ['pointer to struct member', `
struct thing { int x; int y; int type; };
void setPos(struct thing* t, int x, int y) {
    t->x = x;
    t->y = y;
}
struct thing obj;
void main() {
    setPos(&obj, 10, 20);
}
`],
  ['bitfield operations', `
int flags;
void main() {
    flags = 0;
    flags |= (1 << 3);
    flags &= ~(1 << 1);
    int has_flag = (flags >> 3) & 1;
}
`],
  ['switch with fallthrough', `
int result;
void classify(int x) {
    switch (x) {
        case 0: result = 0; break;
        case 1:
        case 2: result = 1; break;
        default: result = -1; break;
    }
}
void main() { classify(1); }
`],
  ['do-while loop', `
int count;
void main() {
    count = 0;
    do {
        count++;
    } while (count < 10);
}
`],
  ['comma operator', `
int a, b;
void main() {
    for (a = 0, b = 10; a < b; a++, b--) {
    }
}
`],
  ['sizeof', `
int x;
struct foo { int a; int b; char c; };
void main() {
    x = sizeof(int);
    x = sizeof(struct foo);
}
`],
  ['goto', `
int found;
void search(int target) {
    for (int i = 0; i < 100; i++) {
        if (i == target) {
            found = i;
            goto done;
        }
    }
    found = -1;
done:
    return;
}
void main() { search(42); }
`],
  ['double pointer (char**)', `
char* strings[4];
char** argv;
void main() {
    argv = strings;
}
`],
  ['unsigned comparisons', `
unsigned int a;
unsigned int b;
int result;
void main() {
    a = 0xFFFFFFFF;
    b = 1;
    result = (a > b) ? 1 : 0;
}
`],
];

let passed = 0;
let failed = 0;
const failures: string[] = [];

for (const [name, source] of tests) {
  const result = compile(source);
  if (result.success) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    const firstErr = result.errors[0];
    const msg = `  ✗ ${name}: ${firstErr.message} (line ${firstErr.line})`;
    console.log(msg);
    failures.push(msg);
  }
}

console.log(`\n${passed} passed, ${failed} failed out of ${tests.length} tests`);
if (failures.length > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(f));
}
