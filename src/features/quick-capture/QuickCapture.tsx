import { useEffect, useRef } from 'react';

type Props = { open: boolean; onClose: () => void };

/** Side effects: moves focus into the dialog when opened and invokes onClose on dismissal. */
export function QuickCapture({ open, onClose }: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  /** Side effects: reads activeElement, moves focus into the dialog, and restores it on cleanup. */
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => {
      restoreFocusRef.current?.focus();
      restoreFocusRef.current = null;
    };
  }, [open]);

  /** Side effects: constrains DOM focus and invokes onClose for Escape. */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])');
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!open) return null;
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section ref={dialogRef} className="capture-dialog" role="dialog" aria-modal="true" aria-labelledby="capture-title" onKeyDown={handleKeyDown} onMouseDown={(event) => event.stopPropagation()}>
        <header><h2 id="capture-title">快捷录入</h2><button ref={closeRef} aria-label="关闭快捷录入" onClick={onClose}>×</button></header>
        <label htmlFor="capture-input">先记下此刻最重要的事</label>
        <input id="capture-input" maxLength={200} placeholder="P1 将接入统一领域命令" disabled />
        <p>当前为 P0 壳层：写入服务启用前不会临时保存或伪造数据。</p>
      </section>
    </div>
  );
}
