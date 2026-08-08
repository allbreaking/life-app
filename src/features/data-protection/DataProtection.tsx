import { useEffect, useRef, useState } from 'react';
import { createBackup, listBackups, restoreBackup, type BackupInfo } from '../../shared/ipc/backup';

type Props = { open: boolean; onClose: () => void };

function isTauriRuntime() {
  return '__TAURI_INTERNALS__' in window;
}

function formatBackup(backup: BackupInfo) {
  const date = new Date(Number(backup.createdAt));
  const size = Math.max(1, Math.ceil(backup.sizeBytes / 1024));
  return `${date.toLocaleString('zh-CN')} · ${size} KiB`;
}

/** Side effects: lists/creates/restores app-managed SQLite snapshots through typed IPC;
 * a successful restore reloads the page so every module reads the restored database. */
export function DataProtection({ open, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const desktop = isTauriRuntime();

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    if (!desktop) {
      setStatus('备份与恢复仅在 Life-OS 桌面版中可用。');
      return;
    }
    setBusy(true);
    void listBackups().then(setBackups).then(() => setStatus(''))
      .catch(() => setStatus('无法读取备份列表，请稍后重试。'))
      .finally(() => setBusy(false));
  }, [desktop, open]);

  if (!open) return null;

  const handleCreate = async () => {
    setBusy(true);
    setStatus('正在创建一致性快照…');
    try {
      const backup = await createBackup();
      setBackups((current) => [backup, ...current.filter((item) => item.id !== backup.id)]);
      setStatus('备份已创建。');
    } catch {
      setStatus('备份创建失败，当前数据未受影响。');
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (backup: BackupInfo) => {
    if (!window.confirm('恢复会用该快照替换当前数据。继续吗？')) return;
    setBusy(true);
    setStatus('正在校验并恢复…');
    try {
      await restoreBackup(backup.id);
      setStatus('恢复成功，正在重新加载…');
      window.location.reload();
    } catch {
      setStatus('恢复失败，系统已保留恢复前的数据。');
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="capture-dialog data-protection-dialog" role="dialog" aria-modal="true" aria-labelledby="data-protection-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><h2 id="data-protection-title">数据保护</h2><button ref={closeRef} aria-label="关闭数据保护" onClick={onClose}>×</button></header>
        <p>快照保存在 Life-OS 应用数据目录，恢复前会校验完整性并创建回滚点。</p>
        {desktop && <button className="command-button" disabled={busy} onClick={() => void handleCreate()}>创建备份</button>}
        <div className="backup-list" aria-label="本地备份">
          {backups.length === 0 && desktop && !busy ? <span className="small">还没有本地备份</span> : backups.map((backup) => (
            <div className="backup-row" key={backup.id}><span>{formatBackup(backup)}</span><button disabled={busy} onClick={() => void handleRestore(backup)}>恢复</button></div>
          ))}
        </div>
        {status && <p role="status">{status}</p>}
      </section>
    </div>
  );
}
