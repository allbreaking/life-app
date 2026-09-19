import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type DesktopAction = 'open-quick-capture' | 'show-dashboard';

/** Side effects: subscribes to a Tauri app event when running in the desktop shell. */
export async function subscribeDesktopActions(
  onAction: (action: DesktopAction) => void,
): Promise<UnlistenFn> {
  if (!('__TAURI_INTERNALS__' in window)) return () => undefined;
  return listen<DesktopAction>('desktop-action', (event) => onAction(event.payload));
}
