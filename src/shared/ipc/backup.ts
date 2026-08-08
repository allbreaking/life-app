import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';

export const backupIdSchema = z.string().regex(/^life-os-\d{10,20}\.sqlite3$/);
export const backupInfoSchema = z.object({
  id: backupIdSchema,
  createdAt: z.string().regex(/^\d{10,20}$/),
  sizeBytes: z.number().int().nonnegative().max(512 * 1024 * 1024),
}).strict();

export type BackupInfo = z.infer<typeof backupInfoSchema>;

/** Side effects: invokes Tauri IPC, which creates one app-managed SQLite snapshot. */
export async function createBackup(): Promise<BackupInfo> {
  return backupInfoSchema.parse(await invoke('create_backup'));
}

/** Side effects: invokes Tauri IPC, which reads app-managed backup directory metadata. */
export async function listBackups(): Promise<BackupInfo[]> {
  return z.array(backupInfoSchema).parse(await invoke('list_backups'));
}

/** Side effects: invokes Tauri IPC, which validates a snapshot and may replace live SQLite contents. */
export async function restoreBackup(id: string): Promise<void> {
  await invoke('restore_backup', { id: backupIdSchema.parse(id) });
}
