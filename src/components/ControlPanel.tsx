import type { RunState } from '@/hooks/useCpu';

interface Props {
  runState: RunState;
  halted: boolean;
  cycle: number;
  speed: number;
  onStep: () => void;
  onRun: () => void;
  onPause: () => void;
  onReset: () => void;
  onSpeedChange: (speed: number) => void;
}

export function ControlPanel({
  runState, halted, cycle, speed,
  onStep, onRun, onPause, onReset, onSpeedChange,
}: Props) {
  return (
    <div className="flex items-center gap-2 p-3 border-b border-border bg-card">
      <button
        onClick={onStep}
        disabled={halted || runState === 'running'}
        className="px-3 py-1.5 text-sm font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
      >
        Step
      </button>

      {runState === 'running' ? (
        <button
          onClick={onPause}
          className="px-3 py-1.5 text-sm font-medium rounded bg-amber-600 text-white hover:bg-amber-700 transition-colors"
        >
          Pause
        </button>
      ) : (
        <button
          onClick={onRun}
          disabled={halted}
          className="px-3 py-1.5 text-sm font-medium rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 transition-colors"
        >
          Run
        </button>
      )}

      <button
        onClick={onReset}
        className="px-3 py-1.5 text-sm font-medium rounded bg-muted text-muted-foreground hover:bg-accent transition-colors"
      >
        Reset
      </button>

      <div className="flex-1" />

      {/* Speed control */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Speed</span>
        <input
          type="range"
          min={1}
          max={10}
          value={speed}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
          className="w-20 accent-primary"
        />
      </div>

      {/* Status */}
      <div className="flex items-center gap-3 text-xs font-mono">
        <span className="text-muted-foreground">Cycle: {cycle}</span>
        {halted && (
          <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 font-semibold">
            HALTED
          </span>
        )}
        {runState === 'running' && (
          <span className="px-2 py-0.5 rounded bg-green-500/20 text-green-400">
            RUNNING
          </span>
        )}
      </div>
    </div>
  );
}
