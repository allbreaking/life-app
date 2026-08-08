import { useEffect, useState } from 'react';
import { Dashboard } from '../features/dashboard/Dashboard';
import { Finance } from '../features/finance/Finance';
import { Items } from '../features/items/Items';
import { Learning } from '../features/learning/Learning';
import { Network } from '../features/network/Network';
import { Compass } from '../features/compass/Compass';
import { QuickCapture } from '../features/quick-capture/QuickCapture';
import { Schedule } from '../features/schedule/Schedule';
import { Work } from '../features/work/Work';
import { Trade } from '../features/trade/Trade';
import { DataProtection } from '../features/data-protection/DataProtection';
import { modules } from './navigation';
import { useActiveModule } from './useActiveModule';
import { subscribeDesktopActions } from './desktopEvents';

/** Side effects: persists active navigation and subscribes to Option+Space. */
export function App() {
  const [activeModule, setActiveModule] = useActiveModule();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [dataProtectionOpen, setDataProtectionOpen] = useState(false);
  const current = modules.find((module) => module.id === activeModule)!;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && event.code === 'Space') {
        event.preventDefault();
        setCaptureOpen((open) => !open);
      }
      if (event.code === 'Escape') setCaptureOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: () => void = () => undefined;
    void subscribeDesktopActions((action) => {
      if (action === 'open-quick-capture') setCaptureOpen(true);
      if (action === 'show-dashboard') {
        setCaptureOpen(false);
        setActiveModule('dashboard');
      }
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    });
    return () => {
      disposed = true;
      unlisten();
    };
  }, [setActiveModule]);

  return (
    <div className="desktop-shell">
      <a className="skip-link" href="#main-content">跳到主内容</a>
      <header className="system-bar">
        <div><span>{new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(new Date())}</span><time>{new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())}</time></div>
        <div><button onClick={() => setDataProtectionOpen(true)}>数据保护</button><button onClick={() => setCaptureOpen(true)}>⚡ 快捷录入</button><button>□ 14:00 项目周例会 <i /></button></div>
      </header>
      <div className="app-shell">
        <aside className="sidebar" aria-label="主导航">
          <div className="brand">Life<span>-OS</span></div>
          <nav>
            {modules.map((module) => (
              <button className={module.id === activeModule ? 'nav-item active' : 'nav-item'} key={module.id} onClick={() => setActiveModule(module.id)} aria-current={module.id === activeModule ? 'page' : undefined}>
                <span className="nav-icon" aria-hidden="true">{module.symbol}</span>{module.label}
              </button>
            ))}
          </nav>
          <div className="sidebar-foot">唤醒命令面板<br /><kbd>⌥</kbd> + <kbd>Space</kbd></div>
        </aside>
        <main className="content" id="main-content" tabIndex={-1} data-view-id={`view-${activeModule}`}>
          <header className="page-header">
            <div><h1>{current.label}</h1><p>{current.subtitle}</p></div>
            <button className="command-button" onClick={() => setCaptureOpen(true)}>⚡ 快捷录入 <kbd>⌥Space</kbd></button>
          </header>
          {activeModule === 'dashboard' ? <Dashboard /> : activeModule === 'compass' ? <Compass /> : activeModule === 'work' ? <Work /> : activeModule === 'schedule' ? <Schedule /> : activeModule === 'finance' ? <Finance /> : activeModule === 'items' ? <Items /> : activeModule === 'network' ? <Network /> : activeModule === 'trade' ? <Trade /> : activeModule === 'learning' ? <Learning /> : (
            <section className="card module-placeholder"><span aria-hidden="true">{current.symbol}</span><h2>{current.label}</h2><p>该模块将在后续迁移中按冻结原型逐项实现。</p></section>
          )}
        </main>
      </div>
      <QuickCapture open={captureOpen} onClose={() => setCaptureOpen(false)} />
      <DataProtection open={dataProtectionOpen} onClose={() => setDataProtectionOpen(false)} />
    </div>
  );
}
