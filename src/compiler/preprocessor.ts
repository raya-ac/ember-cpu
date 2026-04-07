// EmberC Preprocessor — handles #define, #ifdef/#ifndef/#else/#endif, #include
// Runs as a text-to-text pass before the lexer.

export interface PreprocessorError {
  line: number;
  message: string;
}

export interface PreprocessorResult {
  source: string;
  errors: PreprocessorError[];
}

// Built-in includes — maps filename to source text
const BUILTIN_INCLUDES: Record<string, string> = {};

// Register a built-in include file (used for stdlib headers)
export function registerInclude(name: string, source: string): void {
  BUILTIN_INCLUDES[name] = source;
}

export function preprocess(
  source: string,
  externalIncludes?: Record<string, string>,
): PreprocessorResult {
  const errors: PreprocessorError[] = [];
  const defines = new Map<string, string>();
  const includes = { ...BUILTIN_INCLUDES, ...externalIncludes };

  // Stack for #ifdef/#ifndef nesting
  // Each entry: { active: is this branch active?, seenTrue: has any branch been true? }
  const condStack: { active: boolean; seenTrue: boolean; parentActive: boolean }[] = [];

  function isActive(): boolean {
    if (condStack.length === 0) return true;
    return condStack[condStack.length - 1].active;
  }

  function processSource(src: string, depth: number): string {
    if (depth > 10) {
      errors.push({ line: 0, message: 'include depth exceeded (max 10)' });
      return '';
    }

    const rawLines = src.split('\n');
    // Join lines ending with backslash (line continuation)
    const lines: string[] = [];
    for (let i = 0; i < rawLines.length; i++) {
      let line = rawLines[i];
      while (line.trimEnd().endsWith('\\') && i + 1 < rawLines.length) {
        line = line.trimEnd().slice(0, -1) + ' ' + rawLines[++i].trim();
        lines.push(''); // blank line to preserve line numbers
      }
      lines.push(line);
    }
    const output: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Preprocessor directive
      if (trimmed.startsWith('#')) {
        const directive = trimmed.slice(1).trim();

        // #define NAME [VALUE]
        if (directive.startsWith('define ')) {
          if (isActive()) {
            const rest = directive.slice(7).trim();
            const spaceIdx = rest.indexOf(' ');
            if (spaceIdx === -1) {
              defines.set(rest, '1');
            } else {
              const name = rest.slice(0, spaceIdx);
              const value = rest.slice(spaceIdx + 1).trim();
              defines.set(name, value);
            }
          }
          output.push(''); // blank line to preserve line numbers
          continue;
        }

        // #undef NAME
        if (directive.startsWith('undef ')) {
          if (isActive()) {
            const name = directive.slice(6).trim();
            defines.delete(name);
          }
          output.push('');
          continue;
        }

        // #ifdef NAME
        if (directive.startsWith('ifdef ')) {
          const name = directive.slice(6).trim();
          const parentActive = isActive();
          const defined = defines.has(name);
          condStack.push({
            active: parentActive && defined,
            seenTrue: defined,
            parentActive,
          });
          output.push('');
          continue;
        }

        // #ifndef NAME
        if (directive.startsWith('ifndef ')) {
          const name = directive.slice(7).trim();
          const parentActive = isActive();
          const notDefined = !defines.has(name);
          condStack.push({
            active: parentActive && notDefined,
            seenTrue: notDefined,
            parentActive,
          });
          output.push('');
          continue;
        }

        // #if EXPR
        if (directive.startsWith('if ')) {
          const expr = directive.slice(3).trim();
          const parentActive = isActive();
          const result = evalIfExpr(expr, defines);

          condStack.push({
            active: parentActive && result,
            seenTrue: result,
            parentActive,
          });
          output.push('');
          continue;
        }

        // #elif
        if (directive.startsWith('elif ')) {
          if (condStack.length === 0) {
            errors.push({ line: i + 1, message: '#elif without #if' });
          } else {
            const top = condStack[condStack.length - 1];
            if (top.seenTrue) {
              top.active = false;
            } else {
              const expr = directive.slice(5).trim();
              const result = evalIfExpr(expr, defines);
              top.active = top.parentActive && result;
              if (result) top.seenTrue = true;
            }
          }
          output.push('');
          continue;
        }

        // #else
        if (directive === 'else' || directive.startsWith('else ') || directive.startsWith('else/') || directive.startsWith('else\t')) {
          if (condStack.length === 0) {
            errors.push({ line: i + 1, message: '#else without #if' });
          } else {
            const top = condStack[condStack.length - 1];
            top.active = top.parentActive && !top.seenTrue;
            top.seenTrue = true;
          }
          output.push('');
          continue;
        }

        // #endif
        if (directive === 'endif' || directive.startsWith('endif ') || directive.startsWith('endif/') || directive.startsWith('endif\t')) {
          if (condStack.length === 0) {
            errors.push({ line: i + 1, message: '#endif without #if' });
          } else {
            condStack.pop();
          }
          output.push('');
          continue;
        }

        // #include "file" or #include <file>
        if (directive.startsWith('include ')) {
          if (isActive()) {
            const rest = directive.slice(8).trim();
            let filename = '';
            if ((rest.startsWith('"') && rest.endsWith('"')) ||
                (rest.startsWith('<') && rest.endsWith('>'))) {
              filename = rest.slice(1, -1);
            } else {
              filename = rest;
            }

            const content = includes[filename];
            if (content !== undefined) {
              const included = processSource(content, depth + 1);
              output.push(included);
            } else {
              // Silently skip missing includes — DOOM has system headers we don't need
              output.push('');
            }
          } else {
            output.push('');
          }
          continue;
        }

        // #pragma — ignore
        if (directive.startsWith('pragma ')) {
          output.push('');
          continue;
        }

        // Unknown directive — pass through as blank
        output.push('');
        continue;
      }

      // Regular line
      if (isActive()) {
        output.push(expandMacros(line, defines));
      } else {
        output.push(''); // preserve line numbers
      }
    }

    return output.join('\n');
  }

  const result = processSource(source, 0);

  if (condStack.length > 0) {
    errors.push({ line: 0, message: `unterminated #if/#ifdef (${condStack.length} unclosed)` });
  }

  return { source: result, errors };
}

// Expand macros in a line — simple token-level replacement
// Evaluate a #if expression — handles defined(), ||, &&, !, numeric values
function evalIfExpr(expr: string, defines: Map<string, string>): boolean {
  // First expand macros (but not 'defined' calls)
  let e = expr.trim();

  // Replace defined(X) and defined X with 0 or 1
  e = e.replace(/defined\s*\(\s*(\w+)\s*\)/g, (_, name) => defines.has(name) ? '1' : '0');
  e = e.replace(/defined\s+(\w+)/g, (_, name) => defines.has(name) ? '1' : '0');

  // Expand remaining macros
  e = expandMacros(e, defines);

  // Simple recursive evaluator
  return evalBool(e.trim());

  function evalBool(s: string): boolean {
    s = s.trim();

    // Handle || (lowest precedence)
    let depth = 0;
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i] === ')') depth++;
      else if (s[i] === '(') depth--;
      else if (depth === 0 && s[i] === '|' && i > 0 && s[i-1] === '|') {
        return evalBool(s.slice(0, i-1)) || evalBool(s.slice(i+1));
      }
    }

    // Handle &&
    depth = 0;
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i] === ')') depth++;
      else if (s[i] === '(') depth--;
      else if (depth === 0 && s[i] === '&' && i > 0 && s[i-1] === '&') {
        return evalBool(s.slice(0, i-1)) && evalBool(s.slice(i+1));
      }
    }

    // Handle !
    if (s.startsWith('!')) {
      return !evalBool(s.slice(1));
    }

    // Handle parentheses
    if (s.startsWith('(') && s.endsWith(')')) {
      return evalBool(s.slice(1, -1));
    }

    // Handle comparison operators: ==, !=, >, <, >=, <=
    const cmpMatch = s.match(/^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
    if (cmpMatch) {
      const l = parseInt(cmpMatch[1].trim(), 10);
      const r = parseInt(cmpMatch[3].trim(), 10);
      if (!isNaN(l) && !isNaN(r)) {
        switch (cmpMatch[2]) {
          case '==': return l === r;
          case '!=': return l !== r;
          case '>': return l > r;
          case '<': return l < r;
          case '>=': return l >= r;
          case '<=': return l <= r;
        }
      }
    }

    // Numeric value
    const num = parseInt(s, 10);
    if (!isNaN(num)) return num !== 0;

    // Unknown identifier — treat as 0 (undefined)
    return false;
  }
}

function expandMacros(line: string, defines: Map<string, string>): string {
  if (defines.size === 0) return line;

  // Build regex from all define names, longest first to avoid partial matches
  const names = [...defines.keys()].sort((a, b) => b.length - a.length);
  if (names.length === 0) return line;

  // Iteratively expand until stable (handles nested macros like FRACUNIT → (1<<FRACBITS) → (1<<16))
  let result = line;
  for (let pass = 0; pass < 10; pass++) {
    let changed = false;
    for (const name of names) {
      const regex = new RegExp(`\\b${escapeRegex(name)}\\b`, 'g');
      const value = defines.get(name)!;
      const next = result.replace(regex, value);
      if (next !== result) { changed = true; result = next; }
    }
    if (!changed) break;
  }

  return result;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
