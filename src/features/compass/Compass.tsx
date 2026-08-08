import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { useDomainResource } from '../../shared/ipc/useDomainResource';

type PrincipleKind = 'being' | 'doing';

const initialPrinciples: Record<PrincipleKind, string[]> = import.meta.env.PROD ? { being: [], doing: [] } : {
  being: ['学习：结构化沉淀优于囤积闪念', '社交：真诚记录，不做关系量化', '爱好：主动挑选体验，拒绝被动刷手机'],
  doing: ['工作：今日焦点不超过 3 件', '投资：先观察列表，后纪律建仓', '财务：不因为便宜而囤货'],
};
const principlesSchema = z.object({ being: z.array(z.string().max(231)), doing: z.array(z.string().max(231)) }).strict();

/** Side effects: persists principle changes through typed IPC to SQLite; form visibility remains local. */
export function Compass() {
  const [principles, setPrinciples] = useDomainResource('compass.principles', principlesSchema, initialPrinciples);
  const [openForm, setOpenForm] = useState<PrincipleKind | null>(null);

  const addPrinciple = (event: FormEvent<HTMLFormElement>, kind: PrincipleKind) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const domain = String(data.get('domain') ?? '').trim();
    const content = String(data.get('content') ?? '').trim();
    if (!domain || !content || domain.length > 30 || content.length > 200) return;
    setPrinciples((current) => ({ ...current, [kind]: [...current[kind], `${domain}：${content}`] }));
    event.currentTarget.reset();
    setOpenForm(null);
  };

  return (
    <div className="compass-view">
      <div className="grid grid-2 compass-principles">
        <PrincipleColumn kind="being" title="Being" subtitle="社交 · 物品 · 学习 · 爱好" items={principles.being} open={openForm === 'being'} onToggle={() => setOpenForm(openForm === 'being' ? null : 'being')} onSubmit={addPrinciple} />
        <PrincipleColumn kind="doing" title="Doing" subtitle="工作 · 财务 · 投资 · 日程" items={principles.doing} open={openForm === 'doing'} onToggle={() => setOpenForm(openForm === 'doing' ? null : 'doing')} onSubmit={addPrinciple} />
      </div>
      {!import.meta.env.PROD && <section className="card">
        <h2><span>Life Changelog 个人演进日志</span><button className="add-button" aria-label="新增演进日志" disabled>＋</button></h2>
        <p className="small draft-note">正式写入将在领域服务接入后开放。</p>
        <div className="timeline">
          <TimelineItem meta="v2026.07 · 战略转向 · #工作">日程模块重新定位为“唯一排期权”，其余模块只生产任务</TimelineItem>
          <TimelineItem meta="v2026.06 · 交租教训 · #投资">追高未设止损导致回撤，固化“先观察列表后建仓”硬性纪律</TimelineItem>
          <TimelineItem meta="v2026.05 · 认知重塑 · #社交">意识到断联倒计时会让关系变得功利，改为仅记录重要日期</TimelineItem>
        </div>
      </section>}
    </div>
  );
}

type PrincipleColumnProps = { kind: PrincipleKind; title: string; subtitle: string; items: string[]; open: boolean; onToggle: () => void; onSubmit: (event: FormEvent<HTMLFormElement>, kind: PrincipleKind) => void };

/** Side effects: invokes callbacks supplied by Compass; no direct external writes. */
function PrincipleColumn({ kind, title, subtitle, items, open, onToggle, onSubmit }: PrincipleColumnProps) {
  return (
    <section className={`principle-column ${kind}`}>
      <h2><span>{title}</span><button className="add-button" aria-label={`新增 ${title} 原则`} onClick={onToggle}>＋</button></h2>
      <p className="small">{subtitle}</p>
      {open && <form className="inline-form" onSubmit={(event) => onSubmit(event, kind)}><input name="domain" maxLength={30} required placeholder="领域，如 学习/工作" /><input name="content" maxLength={200} required placeholder="原则内容" /><button type="submit">添加</button></form>}
      <div className="principle-list">{items.map((item) => <div className="principle-chip" key={item}>{item}</div>)}</div>
    </section>
  );
}

/** Side effects: none. */
function TimelineItem({ meta, children }: { meta: string; children: React.ReactNode }) {
  return <div className="timeline-item"><div className="timeline-meta">{meta}</div><div className="timeline-title">{children}</div></div>;
}
