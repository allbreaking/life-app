import { beforeEach, expect, test, vi } from 'vitest';
import { createBackup, listBackups, restoreBackup } from './backup';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

beforeEach(() => invoke.mockReset());

test('validates backup responses and restore ids', async () => {
  const backup = { id: 'life-os-1785945600000.sqlite3', createdAt: '1785945600000', sizeBytes: 4096 };
  invoke.mockResolvedValueOnce(backup).mockResolvedValueOnce([backup]).mockResolvedValueOnce(undefined);
  await expect(createBackup()).resolves.toEqual(backup);
  await expect(listBackups()).resolves.toEqual([backup]);
  await expect(restoreBackup(backup.id)).resolves.toBeUndefined();
  expect(invoke).toHaveBeenLastCalledWith('restore_backup', { id: backup.id });
  await expect(restoreBackup('../life-os.sqlite3')).rejects.toThrow();
});

test('rejects malformed native backup metadata', async () => {
  invoke.mockResolvedValue([{ id: '../escape', createdAt: 'today', sizeBytes: -1 }]);
  await expect(listBackups()).rejects.toThrow();
});
