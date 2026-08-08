import { useEffect, useState } from 'react';
import { isModuleId, type ModuleId } from './navigation';

const storageKey = 'life-os.active-module';

/** Side effects: reads and writes the active module in window.localStorage. */
export function useActiveModule() {
  const [activeModule, setActiveModuleState] = useState<ModuleId>(() => {
    const stored = window.localStorage.getItem(storageKey);
    return isModuleId(stored) ? stored : 'dashboard';
  });

  useEffect(() => {
    window.localStorage.setItem(storageKey, activeModule);
  }, [activeModule]);

  return [activeModule, setActiveModuleState] as const;
}
