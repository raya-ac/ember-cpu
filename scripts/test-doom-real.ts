// Test: Try compiling actual DOOM-like code patterns through EmberC
import { compile } from './src/compiler/compiler';

const tests: [string, string][] = [
  ['DOOM fixed-point', `
typedef int fixed_t;
#define FRACBITS 16
#define FRACUNIT (1<<FRACBITS)

fixed_t FixedMul(fixed_t a, fixed_t b) {
    // Simplified: real version needs 64-bit intermediate
    return (a >> 8) * (b >> 8);
}

fixed_t FixedDiv(fixed_t a, fixed_t b) {
    if (b == 0) return 0;
    return (a / b) << FRACBITS;
}

void main() {
    fixed_t x = FRACUNIT * 3;
    fixed_t y = FRACUNIT * 2;
    fixed_t z = FixedMul(x, y);
}
`],

  ['DOOM map structure', `
typedef int fixed_t;
typedef int angle_t;
typedef unsigned char byte;
typedef int boolean;
#define true 1
#define false 0

struct vertex {
    fixed_t x;
    fixed_t y;
};

struct line {
    struct vertex* v1;
    struct vertex* v2;
    int flags;
    int special;
    int tag;
};

struct vertex verts[100];
struct line lines[100];
int numvertexes;
int numlines;

void P_LoadVertexes() {
    numvertexes = 0;
}

void main() {
    P_LoadVertexes();
    verts[0].x = 100;
    verts[0].y = 200;
}
`],

  ['DOOM rendering core', `
typedef int fixed_t;
typedef int angle_t;
typedef unsigned char byte;
#define SCREENWIDTH 320
#define SCREENHEIGHT 200
#define FRACBITS 16

int viewwidth;
int viewheight;
fixed_t viewx;
fixed_t viewy;
angle_t viewangle;

byte screen[64000];
int ylookup[200];
int columnofs[320];

void R_Init() {
    viewwidth = SCREENWIDTH;
    viewheight = SCREENHEIGHT;
    for (int i = 0; i < SCREENHEIGHT; i++) {
        ylookup[i] = i * SCREENWIDTH;
    }
    for (int i = 0; i < SCREENWIDTH; i++) {
        columnofs[i] = i;
    }
}

void R_DrawColumn(int x, int y1, int y2, byte color) {
    for (int y = y1; y <= y2; y++) {
        screen[ylookup[y] + columnofs[x]] = color;
    }
}

void main() {
    R_Init();
    R_DrawColumn(160, 50, 150, 7);
}
`],

  ['DOOM action pointers', `
typedef void (*actionf_t)();
typedef int boolean;
typedef int fixed_t;
#define true 1
#define false 0

struct state {
    int sprite;
    int frame;
    int tics;
    actionf_t action;
    int nextstate;
};

void A_Chase() { }
void A_Look() { }

struct state states[4];

void P_InitStates() {
    states[0].sprite = 0;
    states[0].tics = 10;
    states[1].sprite = 1;
    states[1].tics = 5;
}

void main() {
    P_InitStates();
}
`],

  ['DOOM tables', `
#define FINEANGLES 8192
#define FINEMASK (FINEANGLES - 1)
#define ANGLETOFINESHIFT 19

typedef int fixed_t;
typedef unsigned int angle_t;

fixed_t finesine[FINEANGLES];
fixed_t finecosine[FINEANGLES];

fixed_t finetangent[4096];

void R_InitTables() {
    for (int i = 0; i < FINEANGLES; i++) {
        finesine[i] = 0;
        finecosine[i] = 0;
    }
}

void main() {
    R_InitTables();
}
`],

  ['DOOM ticcmd', `
typedef unsigned char byte;
typedef int boolean;
#define true 1
#define false 0

struct ticcmd {
    char forwardmove;
    char sidemove;
    short angleturn;
    byte chatchar;
    byte buttons;
};

struct ticcmd netcmds[4];

void G_BuildTiccmd(struct ticcmd* cmd) {
    cmd->forwardmove = 0;
    cmd->sidemove = 0;
    cmd->angleturn = 0;
    cmd->buttons = 0;
}

void main() {
    struct ticcmd cmd;
    G_BuildTiccmd(&cmd);
}
`],

  ['DOOM zone memory', `
typedef unsigned char byte;

#define ZONEID 0x1d4a11

struct memblock {
    int size;
    void* user;
    int tag;
    int id;
    struct memblock* next;
    struct memblock* prev;
};

struct memzone {
    int size;
    struct memblock blocklist;
    struct memblock* rover;
};

struct memzone* mainzone;

void* Z_Malloc(int size, int tag, void* user) {
    // Simplified — just bump allocator
    return (void*)0;
}

void Z_Free(void* ptr) {
    // noop stub
}

void main() {
    void* block = Z_Malloc(1024, 1, (void*)0);
}
`],

  ['DOOM WAD structure', `
typedef unsigned char byte;
typedef int boolean;
#define true 1
#define false 0
#define NULL 0

struct wadinfo {
    char identification[4];
    int numlumps;
    int infotableofs;
};

struct filelump {
    int filepos;
    int size;
    char name[8];
};

struct lumpinfo {
    char name[8];
    int position;
    int size;
};

struct lumpinfo* lumpinfo;
int numlumps;

void W_Init() {
    numlumps = 0;
    lumpinfo = (struct lumpinfo*)0;
}

void main() {
    W_Init();
}
`],

  ['DOOM player state', `
typedef int fixed_t;
typedef int angle_t;
typedef int boolean;
#define true 1
#define false 0
#define MAXPLAYERS 4
#define NUMWEAPONS 9
#define NUMAMMO 4

struct player {
    int health;
    int armorpoints;
    int armortype;
    int ammo[4];
    int maxammo[4];
    int readyweapon;
    int pendingweapon;
    boolean weaponowned[9];
    fixed_t viewz;
    fixed_t viewheight;
    int damagecount;
    int bonuscount;
    int extralight;
    int fixedcolormap;
    int colormap;
};

struct player players[4];
int consoleplayer;
int displayplayer;

void P_SetupPlayer(int playernum) {
    players[playernum].health = 100;
    players[playernum].armorpoints = 0;
    players[playernum].armortype = 0;
    for (int i = 0; i < NUMAMMO; i++) {
        players[playernum].ammo[i] = 0;
        players[playernum].maxammo[i] = 200;
    }
}

void main() {
    consoleplayer = 0;
    displayplayer = 0;
    P_SetupPlayer(0);
}
`],

  ['DOOM mobj thinker pattern', `
typedef int fixed_t;
typedef int angle_t;
typedef int boolean;
typedef void (*actionf_t)();
#define true 1
#define false 0

struct thinker {
    struct thinker* prev;
    struct thinker* next;
    actionf_t function;
};

struct mobj {
    struct thinker thinker;
    fixed_t x;
    fixed_t y;
    fixed_t z;
    struct mobj* snext;
    struct mobj* sprev;
    angle_t angle;
    int sprite;
    int frame;
    int flags;
    int health;
    int type;
};

struct mobj* mobjhead;

void P_AddThinker(struct thinker* thinker) {
    // stub
}

void P_SpawnMobj(fixed_t x, fixed_t y, fixed_t z, int type) {
    // stub
}

void main() {
    P_SpawnMobj(100, 200, 0, 1);
}
`],
];

let passed = 0;
let failed = 0;

for (const [name, source] of tests) {
  try {
    const result = compile(source);
    if (result.success) {
      passed++;
      console.log(`  ✓ ${name}`);
    } else {
      failed++;
      console.log(`  ✗ ${name}: ${result.errors[0].message} (line ${result.errors[0].line})`);
    }
  } catch (e: any) {
    failed++;
    console.log(`  ✗ ${name}: CRASH: ${e.message}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed out of ${tests.length} tests`);
