import { useState } from 'react';
import { compile, EMBERC_EXAMPLES, type CompileResult } from '@/compiler/compiler';

interface Props {
  onCompile: (assembly: string, programName: string) => void;
  generatedAsm: string | null;
}

export function EmberCEditor({ onCompile, generatedAsm }: Props) {
  const [source, setSource] = useState(EMBERC_EXAMPLES[0].source);
  const [activeExample, setActiveExample] = useState(0);
  const [compileResult, setCompileResult] = useState<CompileResult | null>(null);
  const [showAsm, setShowAsm] = useState(false);

  const handleCompile = () => {
    const result = compile(source);
    setCompileResult(result);
    if (result.success) {
      onCompile(result.assembly, EMBERC_EXAMPLES[activeExample]?.name ?? 'Custom');
    }
  };

  const loadExample = (idx: number) => {
    setSource(EMBERC_EXAMPLES[idx].source);
    setActiveExample(idx);
    setCompileResult(null);
    setShowAsm(false);
  };

  const lines = (showAsm && generatedAsm ? generatedAsm : source).split('\n');

  return (
    <div className="flex flex-col h-full">
      {/* Example selector */}
      <div className="flex gap-1 p-2 border-b border-border overflow-x-auto shrink-0"
        style={{ scrollbarWidth: 'thin' }}
      >
        {EMBERC_EXAMPLES.map((prog, i) => (
          <button
            key={i}
            onClick={() => loadExample(i)}
            className={`px-2.5 py-1 text-xs rounded whitespace-nowrap transition-colors shrink-0 ${
              i === activeExample
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            {prog.name}
          </button>
        ))}
      </div>

      {/* View toggle: EmberC / Generated ASM */}
      {generatedAsm && (
        <div className="flex border-b border-border">
          <button
            onClick={() => setShowAsm(false)}
            className={`flex-1 px-2 py-1 text-[10px] font-medium ${
              !showAsm ? 'text-amber-400 border-b border-amber-500' : 'text-muted-foreground'
            }`}
          >
            EmberC
          </button>
          <button
            onClick={() => setShowAsm(true)}
            className={`flex-1 px-2 py-1 text-[10px] font-medium ${
              showAsm ? 'text-cyan-400 border-b border-cyan-500' : 'text-muted-foreground'
            }`}
          >
            Generated ASM
          </button>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 relative overflow-hidden">
        <div className="absolute inset-0 flex overflow-auto font-mono text-sm">
          {/* Line numbers */}
          <div className="flex-shrink-0 select-none text-right pr-2 pt-2 pb-2 bg-muted/50 text-muted-foreground">
            {lines.map((_, i) => (
              <div key={i} className="px-2 leading-5">{i + 1}</div>
            ))}
          </div>
          {/* Source / ASM view */}
          <div className="flex-1 relative">
            {showAsm ? (
              <pre className="p-2 px-3 leading-5 text-cyan-300/80 whitespace-pre overflow-auto h-full">
                {generatedAsm}
              </pre>
            ) : (
              <textarea
                value={source}
                onChange={(e) => { setSource(e.target.value); setCompileResult(null); }}
                className="absolute inset-0 w-full h-full p-2 px-3 bg-transparent resize-none outline-none leading-5 text-foreground"
                spellCheck={false}
                onKeyDown={(e) => {
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    const start = e.currentTarget.selectionStart;
                    const end = e.currentTarget.selectionEnd;
                    setSource(source.slice(0, start) + '    ' + source.slice(end));
                    requestAnimationFrame(() => {
                      e.currentTarget.selectionStart = e.currentTarget.selectionEnd = start + 4;
                    });
                  }
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Compile button + status */}
      <div className="border-t border-border p-2 space-y-1">
        <button
          onClick={handleCompile}
          className="w-full px-3 py-1.5 text-sm font-medium bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
        >
          Compile & Run
        </button>

        {compileResult && !compileResult.success && (
          <div className="text-xs text-red-500 space-y-0.5">
            {compileResult.errors.map((err, i) => (
              <div key={i}>
                {err.line > 0 ? `Line ${err.line}:${err.col}: ` : ''}{err.message}
              </div>
            ))}
          </div>
        )}
        {compileResult?.success && (
          <div className="text-xs text-green-400">
            Compiled → {compileResult.assembly.split('\n').length} lines of assembly
          </div>
        )}
      </div>
    </div>
  );
}
