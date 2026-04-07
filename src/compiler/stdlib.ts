// EmberC Standard Library — built-in C functions for DOOM
// These are registered as include files and compiled alongside user code.
// Some are implemented as compiler built-ins, others as EmberC source.

import { registerInclude } from './preprocessor';

// Register all standard library headers
export function registerStdlib(): void {
  registerInclude('stdlib.h', STDLIB_H);
  registerInclude('string.h', STRING_H);
  registerInclude('stdio.h', STDIO_H);
  registerInclude('stdint.h', STDINT_H);
  registerInclude('stddef.h', STDDEF_H);
  registerInclude('limits.h', LIMITS_H);
  registerInclude('ctype.h', CTYPE_H);
  registerInclude('math.h', MATH_H);
  registerInclude('fcntl.h', FCNTL_H);
  registerInclude('unistd.h', UNISTD_H);
  registerInclude('sys/types.h', SYS_TYPES_H);
  registerInclude('sys/stat.h', '');
  registerInclude('errno.h', '');
  registerInclude('signal.h', '');
  registerInclude('time.h', '');
  registerInclude('assert.h', ASSERT_H);
  registerInclude('stdbool.h', STDBOOL_H);
  registerInclude('stdarg.h', STDARG_H);
  registerInclude('inttypes.h', INTTYPES_H);
  registerInclude('strings.h', STRINGS_H);
  registerInclude('dirent.h', '');
  registerInclude('config.h', CONFIG_H);

  // DOOM-specific headers we'll stub
  registerInclude('doomgeneric.h', DOOMGENERIC_H);
  registerInclude('doomkeys.h', DOOMKEYS_H);
}

const STDINT_H = `
#ifndef _STDINT_H
#define _STDINT_H
typedef int int32_t;
typedef unsigned int uint32_t;
typedef short int16_t;
typedef unsigned short uint16_t;
typedef char int8_t;
typedef unsigned char uint8_t;
typedef int intptr_t;
typedef unsigned int uintptr_t;
typedef long int64_t;
typedef unsigned long uint64_t;
typedef int size_t;
typedef int ssize_t;
typedef int ptrdiff_t;
#endif
`;

const STDDEF_H = `
#ifndef _STDDEF_H
#define _STDDEF_H
typedef int size_t;
typedef int ptrdiff_t;
#define NULL 0
#define offsetof(type, member) 0
#endif
`;

const LIMITS_H = `
#ifndef _LIMITS_H
#define _LIMITS_H
#define INT_MAX 2147483647
#define INT_MIN -2147483648
#define UINT_MAX 4294967295
#define CHAR_MAX 127
#define CHAR_MIN -128
#define SHRT_MAX 32767
#define SHRT_MIN -32768
#define LONG_MAX 2147483647
#define LONG_MIN -2147483648
#endif
`;

const CTYPE_H = `
#ifndef _CTYPE_H
#define _CTYPE_H
#endif
`;

const MATH_H = `
#ifndef _MATH_H
#define _MATH_H
#endif
`;

const FCNTL_H = `
#ifndef _FCNTL_H
#define _FCNTL_H
#define O_RDONLY 0
#define O_WRONLY 1
#define O_RDWR 2
#define O_BINARY 0
#define SEEK_SET 0
#define SEEK_CUR 1
#define SEEK_END 2
#endif
`;

const UNISTD_H = `
#ifndef _UNISTD_H
#define _UNISTD_H
#endif
`;

const SYS_TYPES_H = `
#ifndef _SYS_TYPES_H
#define _SYS_TYPES_H
typedef int off_t;
typedef int mode_t;
typedef int pid_t;
#endif
`;

const ASSERT_H = `
#ifndef _ASSERT_H
#define _ASSERT_H
#define assert(x)
#endif
`;

// Zone memory allocator — DOOM's custom heap
// Simplified: linear allocator from a large memory region
// Heap starts at word address 0x040000 (256K), grows upward to 0x0FFFFF (1M)
const STDLIB_H = `
#ifndef _STDLIB_H
#define _STDLIB_H

#define NULL 0

int __heap_ptr;
int __heap_end;

void __heap_init() {
    __heap_ptr = 0x040000;
    __heap_end = 0x0FFFFF;
}

void* malloc(int size) {
    int ptr = __heap_ptr;
    __heap_ptr = __heap_ptr + size + 1;
    return (void*)ptr;
}

void* calloc(int count, int size) {
    int total = count * size;
    void* ptr = malloc(total);
    // Zero out (simplified — word-level)
    int* p = (int*)ptr;
    for (int i = 0; i < total; i++) {
        p[i] = 0;
    }
    return ptr;
}

void free(void* ptr) {
    // No-op in linear allocator
}

void* realloc(void* ptr, int size) {
    void* newptr = malloc(size);
    return newptr;
}

int abs(int x) {
    if (x < 0) return -x;
    return x;
}

int atoi(char* s) {
    return 0;
}

void exit(int code) {
    // halt the CPU
}

#endif
`;

const STRING_H = `
#ifndef _STRING_H
#define _STRING_H

void* memcpy(void* dst, void* src, int n) {
    int* d = (int*)dst;
    int* s = (int*)src;
    for (int i = 0; i < n; i++) {
        d[i] = s[i];
    }
    return dst;
}

void* memset(void* dst, int val, int n) {
    int* d = (int*)dst;
    for (int i = 0; i < n; i++) {
        d[i] = val;
    }
    return dst;
}

int memcmp(void* a, void* b, int n) {
    int* pa = (int*)a;
    int* pb = (int*)b;
    for (int i = 0; i < n; i++) {
        if (pa[i] != pb[i]) {
            if (pa[i] < pb[i]) return -1;
            return 1;
        }
    }
    return 0;
}

int strlen(char* s) {
    int len = 0;
    while (s[len] != 0) {
        len++;
    }
    return len;
}

char* strcpy(char* dst, char* src) {
    int i = 0;
    while (src[i] != 0) {
        dst[i] = src[i];
        i++;
    }
    dst[i] = 0;
    return dst;
}

char* strncpy(char* dst, char* src, int n) {
    int i = 0;
    while (i < n && src[i] != 0) {
        dst[i] = src[i];
        i++;
    }
    while (i < n) {
        dst[i] = 0;
        i++;
    }
    return dst;
}

int strcmp(char* a, char* b) {
    int i = 0;
    while (a[i] != 0 && b[i] != 0) {
        if (a[i] != b[i]) {
            if (a[i] < b[i]) return -1;
            return 1;
        }
        i++;
    }
    if (a[i] == 0 && b[i] == 0) return 0;
    if (a[i] == 0) return -1;
    return 1;
}

int strncmp(char* a, char* b, int n) {
    for (int i = 0; i < n; i++) {
        if (a[i] != b[i]) {
            if (a[i] < b[i]) return -1;
            return 1;
        }
        if (a[i] == 0) return 0;
    }
    return 0;
}

char* strcat(char* dst, char* src) {
    int dlen = strlen(dst);
    strcpy(dst + dlen, src);
    return dst;
}

char* strdup(char* s) {
    int len = strlen(s);
    char* d = (char*)malloc(len + 1);
    strcpy(d, s);
    return d;
}

#endif
`;

const STDIO_H = `
#ifndef _STDIO_H
#define _STDIO_H

#define NULL 0
#define EOF -1

typedef int FILE;

int printf(char* fmt) {
    // Stub — just print the format string characters
    int i = 0;
    while (fmt[i] != 0) {
        putchar(fmt[i]);
        i++;
    }
    return i;
}

int sprintf(char* buf, char* fmt) {
    // Stub — copy fmt to buf
    int i = 0;
    while (fmt[i] != 0) {
        buf[i] = fmt[i];
        i++;
    }
    buf[i] = 0;
    return i;
}

int fprintf(FILE* f, char* fmt) {
    return printf(fmt);
}

int sscanf(char* buf, char* fmt) {
    return 0;
}

int snprintf(char* buf, int n, char* fmt) {
    return sprintf(buf, fmt);
}

FILE* fopen(char* path, char* mode) {
    return (FILE*)0;
}

int fclose(FILE* f) {
    return 0;
}

int fread(void* buf, int size, int count, FILE* f) {
    return 0;
}

int fwrite(void* buf, int size, int count, FILE* f) {
    return 0;
}

int fseek(FILE* f, int offset, int whence) {
    return 0;
}

int ftell(FILE* f) {
    return 0;
}

int feof(FILE* f) {
    return 1;
}

int fflush(FILE* f) {
    return 0;
}

int remove(char* path) {
    return 0;
}

int rename(char* old, char* new_name) {
    return 0;
}

void perror(char* msg) {
    printf(msg);
}

#endif
`;

// DOOM fixed-point math and platform interface
const DOOMGENERIC_H = `
#ifndef _DOOMGENERIC_H
#define _DOOMGENERIC_H

#define DOOMGENERIC_RESX 320
#define DOOMGENERIC_RESY 200

// Framebuffer — the CPU writes pixels here
// Located at byte address 0x400000 (word address 0x100000)
int* DG_ScreenBuffer;

void doomgeneric_Create(int argc, char* argv);
void doomgeneric_Tick();
void DG_Init();
void DG_DrawFrame();
void DG_SleepMs(int ms);
int DG_GetTicksMs();
int DG_GetKey(int* pressed, unsigned char* key);
void DG_SetWindowTitle(char* title);

#endif
`;

const DOOMKEYS_H = `
#ifndef _DOOMKEYS_H
#define _DOOMKEYS_H

#define KEY_RIGHTARROW 0xae
#define KEY_LEFTARROW 0xac
#define KEY_UPARROW 0xad
#define KEY_DOWNARROW 0xaf
#define KEY_ESCAPE 27
#define KEY_ENTER 13
#define KEY_TAB 9
#define KEY_BACKSPACE 127
#define KEY_PAUSE 0xff
#define KEY_EQUALS 0x3d
#define KEY_MINUS 0x2d
#define KEY_RSHIFT 0xb6
#define KEY_RCTRL 0xb5
#define KEY_RALT 0xb7
#define KEY_LALT KEY_RALT
#define KEY_FIRE 0xb3
#define KEY_USE 0xb4
#define KEY_STRAFE_L 0xa0
#define KEY_STRAFE_R 0xa1
#define KEY_F1 0xb0
#define KEY_F2 0xb1
#define KEY_F3 0xb2
#define KEY_F4 0xb3
#define KEY_F5 0xb4
#define KEY_F6 0xb5
#define KEY_F7 0xb6
#define KEY_F8 0xb7
#define KEY_F9 0xb8
#define KEY_F10 0xb9
#define KEY_F11 0xba
#define KEY_F12 0xbb

#endif
`;

const STDBOOL_H = `
#ifndef _STDBOOL_H
#define _STDBOOL_H
#define __bool_true_false_are_defined 1
#endif
`;

const STDARG_H = `
#ifndef _STDARG_H
#define _STDARG_H
typedef int va_list;
#define va_start(ap, last)
#define va_end(ap)
#define va_arg(ap, type) 0
#define va_copy(dest, src)
#endif
`;

const INTTYPES_H = `
#ifndef _INTTYPES_H
#define _INTTYPES_H
#include <stdint.h>
#define PRIi64 "d"
#define PRIu64 "u"
#define PRIx64 "x"
#endif
`;

const STRINGS_H = `
#ifndef _STRINGS_H
#define _STRINGS_H
int strcasecmp(char* s1, char* s2);
int strncasecmp(char* s1, char* s2, int n);
#endif
`;

const CONFIG_H = `
#ifndef CONFIG_H
#define CONFIG_H
#define PACKAGE_NAME "doom"
#define PACKAGE_STRING "doom 1.0"
#define PACKAGE_TARNAME "doom"
#define PROGRAM_PREFIX ""
#endif
`;
