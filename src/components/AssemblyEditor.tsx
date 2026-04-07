import { useState, useEffect } from 'react';
import type { AssemblerResult } from '@/cpu/assembler';
import type { ExampleProgram } from '@/cpu/programs';
import { EXAMPLE_PROGRAMS } from '@/cpu/programs';

interface Props {
  onAssemble: (source: string) => AssemblerResult;
  assemblerResult: AssemblerResult | null;
  currentPc: number;
  sourceMap: Map<number, number> | null;
  onProgramChange?: (name: string) => void;
}

export function AssemblyEditor({ onAssemble, assemblerResult, currentPc, sourceMap, onProgramChange }: Props) {
  const [source, setSource] = useState(EXAMPLE_PROGRAMS[0].source);
  const [activeExample, setActiveExample] = useState(0);

  // Assemble on first load
  useEffect(() => {
    onAssemble(source);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAssemble = () => {
    onAssemble(source);
  };

  const loadExample = (prog: ExampleProgram, idx: number) => {
    setSource(prog.source);
    setActiveExample(idx);
    onAssemble(prog.source);
    onProgramChange?.(prog.name);
  };

  // Find the source line corresponding to current PC
  const activeLine = sourceMap?.get(currentPc) ?? -1;

  const lines = source.split('\n');

  return (
    <div className="flex flex-col h-full">
      {/* Example selector — scrollable */}
      <div className="flex gap-1 p-2 border-b border-border overflow-x-auto shrink-0 scrollbar-thin"
        style={{ scrollbarWidth: 'thin' }}
      >
        {EXAMPLE_PROGRAMS.map((prog, i) => (
          <button
            key={i}
            onClick={() => loadExample(prog, i)}
            className={`px-2.5 py-1 text-xs rounded whitespace-nowrap transition-colors shrink-0 ${
              i === activeExample
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            {prog.name}
          </button>
        ))}
      </div>

      {/* Editor with line numbers */}
      <div className="flex-1 relative overflow-hidden">
        <div className="absolute inset-0 flex overflow-auto font-mono text-sm">
          {/* Line numbers + highlight */}
          <div className="flex-shrink-0 select-none text-right pr-2 pt-2 pb-2 bg-muted/50 text-muted-foreground">
            {lines.map((_, i) => (
              <div
                key={i}
                className={`px-2 leading-5 ${
                  i === activeLine ? 'bg-amber-500/20 text-amber-500 font-bold' : ''
                }`}
              >
                {i + 1}
              </div>
            ))}
          </div>
          {/* Source text */}
          <div className="flex-1 relative">
            {/* Highlight layer */}
            <div className="absolute inset-0 pt-2 pb-2 pointer-events-none">
              {lines.map((_, i) => (
                <div
                  key={i}
                  className={`leading-5 px-3 ${i === activeLine ? 'bg-amber-500/10' : ''}`}
                >
                  &nbsp;
                </div>
              ))}
            </div>
            <textarea
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="absolute inset-0 w-full h-full p-2 px-3 bg-transparent resize-none outline-none leading-5 text-foreground"
              spellCheck={false}
              onKeyDown={(e) => {
                if (e.key === 'Tab') {
                  e.preventDefault();
                  const start = e.currentTarget.selectionStart;
                  const end = e.currentTarget.selectionEnd;
                  setSource(source.slice(0, start) + '  ' + source.slice(end));
                  requestAnimationFrame(() => {
                    e.currentTarget.selectionStart = e.currentTarget.selectionEnd = start + 2;
                  });
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* Assemble button + errors */}
      <div className="border-t border-border p-2">
        <button
          onClick={handleAssemble}
          className="w-full px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
        >
          Assemble
        </button>
        {assemblerResult && !assemblerResult.success && (
          <div className="mt-2 text-xs text-red-500 space-y-1">
            {assemblerResult.errors.map((err, i) => (
              <div key={i}>Line {err.line}: {err.message}</div>
            ))}
          </div>
        )}
        {assemblerResult?.success && (
          <div className="mt-1 text-xs text-muted-foreground">
            {assemblerResult.program.length} instructions assembled
          </div>
        )}
      </div>
    </div>
  );
}
