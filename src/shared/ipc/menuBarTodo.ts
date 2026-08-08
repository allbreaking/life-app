import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';
import { hasTauriRuntime } from './domainResource';

export const menuBarTodoSchema = z.object({ id: z.string().min(1).max(100), time: z.string().regex(/^\d{2}:\d{2}$/), title: z.string().min(1).max(200) }).strict();
export type MenuBarTodo = z.infer<typeof menuBarTodoSchema>;

/** Side effects: in Tauri, updates the macOS menu bar's transient next-todo presentation. */
export async function syncMenuBarTodo(todo: MenuBarTodo | null): Promise<void> {
  if (!hasTauriRuntime()) return;
  await invoke('sync_menu_bar_todo', { todo: todo === null ? null : menuBarTodoSchema.parse(todo) });
}
