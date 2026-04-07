import { useState, useCallback, useRef, useEffect } from 'react';
import { createCpu, loadProgramIntoCpu, resetCpu, step, type CpuState } from '@/cpu/cpu';
import { assemble, type AssemblerResult } from '@/cpu/assembler';

export type RunState = 'stopped' | 'running' | 'paused';

// Key mapping: arrow keys + space → memory-mapped values
const KEY_MAP: Record<string, number> = {
  ArrowUp: 1, ArrowDown: 2, ArrowLeft: 3, ArrowRight: 4,
  ' ': 5, w: 1, s: 2, a: 3, d: 4,
};

export function useCpu() {
  const [cpu, setCpu] = useState<CpuState>(createCpu());
  const [assemblerResult, setAssemblerResult] = useState<AssemblerResult | null>(null);
  const [runState, setRunState] = useState<RunState>('stopped');
  const [speed, setSpeed] = useState(5);
  const intervalRef = useRef<number | null>(null);

  const doAssemble = useCallback((source: string) => {
    const result = assemble(source);
    setAssemblerResult(result);
    if (result.success) {
      const newCpu = loadProgramIntoCpu(createCpu(), result.program);
      setCpu(newCpu);
      setRunState('stopped');
    }
    return result;
  }, []);

  const doStep = useCallback(() => {
    setCpu(prev => {
      if (prev.halted) return prev;
      return step(prev);
    });
  }, []);

  const doReset = useCallback(() => {
    setCpu(prev => resetCpu(prev));
    setRunState('stopped');
  }, []);

  const doRun = useCallback(() => {
    setRunState('running');
  }, []);

  const doPause = useCallback(() => {
    setRunState('paused');
  }, []);

  // Keyboard input — inject into CPU state
  const sendKey = useCallback((key: number) => {
    setCpu(prev => ({ ...prev, inputKey: key }));
  }, []);

  // Listen for keyboard events
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mapped = KEY_MAP[e.key];
      if (mapped) {
        e.preventDefault();
        sendKey(mapped);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sendKey]);

  // Run loop — multiple steps per frame at high speed
  useEffect(() => {
    if (runState === 'running') {
      const stepsPerTick = speed <= 5 ? 1 : speed <= 8 ? 3 : 8;
      const ms = speed <= 5 ? Math.max(20, 500 / speed) : 16; // 60fps at high speed

      intervalRef.current = window.setInterval(() => {
        setCpu(prev => {
          let state = prev;
          for (let i = 0; i < stepsPerTick; i++) {
            if (state.halted) {
              setRunState('stopped');
              return state;
            }
            state = step(state);
          }
          return state;
        });
      }, ms);
    }
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [runState, speed]);

  return {
    cpu,
    assemblerResult,
    runState,
    speed,
    setSpeed,
    assemble: doAssemble,
    step: doStep,
    reset: doReset,
    run: doRun,
    pause: doPause,
    sendKey,
  };
}
