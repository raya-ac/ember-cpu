import { useState } from 'react';
import { useCpu } from '@/hooks/useCpu';
import { AssemblyEditor } from '@/components/AssemblyEditor';
import { RegisterPanel } from '@/components/RegisterPanel';
import { MemoryPanel } from '@/components/MemoryPanel';
import { ControlPanel } from '@/components/ControlPanel';
import { InstructionInfo } from '@/components/InstructionInfo';
import { CpuDiagram } from '@/components/CpuDiagram';
import { GateView } from '@/components/GateView';
import { OutputPanel } from '@/components/OutputPanel';
import { EmberCEditor } from '@/components/EmberCEditor';
import { EXAMPLE_PROGRAMS } from '@/cpu/programs';

export default function App() {
  const {
    cpu, assemblerResult, runState, speed,
    assemble, step, reset, run, pause, setSpeed,
  } = useCpu();

  const [zoomedBlock, setZoomedBlock] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<'inspect' | 'output'>('output');
  const [programName, setProgramName] = useState(EXAMPLE_PROGRAMS[0].name);
  const [editorMode, setEditorMode] = useState<'asm' | 'emberc'>('asm');
  const [generatedAsm, setGeneratedAsm] = useState<string | null>(null);

  const sourceMap = assemblerResult?.sourceMap ?? null;

  // When EmberC compiles, it produces assembly — feed that to the assembler
  const handleCompiledAsm = (asm: string, name: string) => {
    setGeneratedAsm(asm);
    setProgramName(name);
    assemble(asm);
  };

  return (
    <div className="h-screen flex flex-col bg-background text-foreground dark">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold tracking-tight">
            <span className="text-amber-500">Ember</span>
            <span className="text-muted-foreground font-normal ml-2 text-sm">32-bit CPU Simulator</span>
          </h1>
          {/* Mode switcher */}
          <div className="flex bg-muted rounded-md p-0.5">
            <button
              onClick={() => setEditorMode('asm')}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                editorMode === 'asm' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              Assembly
            </button>
            <button
              onClick={() => setEditorMode('emberc')}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                editorMode === 'emberc' ? 'bg-amber-500/20 text-amber-400 shadow-sm' : 'text-muted-foreground'
              }`}
            >
              EmberC
            </button>
          </div>
        </div>
        <div className="text-xs text-muted-foreground font-mono">
          ISA v2 · {assemblerResult?.program.length ?? 0} instructions loaded
        </div>
      </div>

      {/* Controls */}
      <ControlPanel
        runState={runState}
        halted={cpu.halted}
        cycle={cpu.cycle}
        speed={speed}
        onStep={step}
        onRun={run}
        onPause={pause}
        onReset={reset}
        onSpeedChange={setSpeed}
      />

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Editor (Assembly or EmberC) */}
        <div className={`border-r border-border flex flex-col ${editorMode === 'emberc' ? 'w-80' : 'w-72'}`}>
          {editorMode === 'asm' ? (
            <AssemblyEditor
              onAssemble={assemble}
              assemblerResult={assemblerResult}
              currentPc={cpu.pc}
              sourceMap={sourceMap}
              onProgramChange={setProgramName}
            />
          ) : (
            <EmberCEditor
              onCompile={handleCompiledAsm}
              generatedAsm={generatedAsm}
            />
          )}
        </div>

        {/* Center: Datapath + Gate view */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Datapath visualization */}
          <div className="flex-1 p-4 min-h-0">
            <div className="h-full border border-border rounded-lg bg-card/50 overflow-hidden p-2">
              <CpuDiagram cpu={cpu} onBlockClick={setZoomedBlock} />
            </div>
          </div>

          {/* Gate-level zoom (if active) */}
          {zoomedBlock && (
            <div className="px-4 pb-4">
              <GateView cpu={cpu} block={zoomedBlock} onClose={() => setZoomedBlock(null)} />
            </div>
          )}
        </div>

        {/* Right panel with tabs */}
        <div className="w-80 border-l border-border flex flex-col">
          {/* Tab switcher */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setRightTab('inspect')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                rightTab === 'inspect'
                  ? 'text-foreground border-b-2 border-amber-500'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Inspect
            </button>
            <button
              onClick={() => setRightTab('output')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                rightTab === 'output'
                  ? 'text-foreground border-b-2 border-amber-500'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Output
            </button>
          </div>

          {rightTab === 'inspect' ? (
            <div className="flex-1 overflow-y-auto">
              <InstructionInfo cpu={cpu} />

              <div className="border-t border-border">
                <RegisterPanel cpu={cpu} />
              </div>

              <div className="border-t border-border">
                <MemoryPanel
                  memory={cpu.imem}
                  label="Instruction Memory"
                  pc={cpu.pc}
                />
              </div>

              <div className="border-t border-border">
                <MemoryPanel
                  memory={cpu.dmem}
                  label="Data Memory"
                  highlightAddr={cpu.lastMemAddr}
                  highlightWrite={cpu.lastControl?.memWrite}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden">
              <OutputPanel cpu={cpu} programName={programName} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
