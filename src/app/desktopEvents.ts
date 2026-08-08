import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type DesktopAction = 'open-quick-capture' | 'show-dashboard';

/** Side effects: subscribes to a Tauri app event when running in the desktop shell. */
export async function subscribeDesktopActions(
  onAction: (action: DesktopAction) => void,
): Promise<UnlistenFn> {
  if (!('__TAURI_INTERNALS__' in window)) return () => undefined;
  return listen<DesktopAction>('desktop-action', (event) => onAction(event.payload));
}

/** Side effects: subscribes to validated menu-bar task completion events in Tauri. */
export async function subscribeMenuTodoCompletion(onComplete: (taskId: string) => void): Promise<UnlistenFn> {
  if (!('__TAURI_INTERNALS__' in window)) return () => undefined;
  return listen<string>('menu-todo-complete', (event) => {
    if (/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(event.payload)) onComplete(event.payload);
  });
}
