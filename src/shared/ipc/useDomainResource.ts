import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { z } from 'zod';
import { hasTauriRuntime, loadDomainResource, replaceDomainResource, type DomainResource } from './domainResource';

/** Side effects: in Tauri, loads normalized domain rows after mount and transactionally writes subsequent changes through typed IPC. */
export function useDomainResource<T>(resource: DomainResource, schema: z.ZodType<T>, initialValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(initialValue);
  const hydrated = useRef(false);
  const schemaRef = useRef(schema);

  useEffect(() => {
    if (!hasTauriRuntime()) return;
    let active = true;
    loadDomainResource(resource, schemaRef.current)
      .then((stored) => { if (active && stored !== null) setValue(stored); })
      .catch((error) => console.error(`Failed to load ${resource}`, error))
      .finally(() => { if (active) hydrated.current = true; });
    return () => { active = false; };
  }, [resource]);

  useEffect(() => {
    if (!hasTauriRuntime() || !hydrated.current) return;
    void replaceDomainResource(resource, value, schemaRef.current)
      .catch((error) => console.error(`Failed to save ${resource}`, error));
  }, [resource, value]);

  return [value, setValue];
}
