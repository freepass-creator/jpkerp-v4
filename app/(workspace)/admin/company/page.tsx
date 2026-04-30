'use client';

import { useState } from 'react';
import { PencilSimple, Trash } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { ADMIN_SUBTABS } from '@/lib/admin-subtabs';
import { type Company } from '@/lib/sample-companies';
import { useCompanyStore } from '@/lib/use-company-store';
import dynamic from 'next/dynamic';
const CompanyRegisterDialog = dynamic(
  () => import('@/components/admin/company-register-dialog').then((m) => m.CompanyRegisterDialog),
  { ssr: false },
);
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { cn } from '@/lib/cn';

export default function AdminCompanyPage() {
  const [companies, setCompanies] = useCompanyStore();
  const [selected, setSelected] = useState<Company | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState({ open: false, x: 0, y: 0 });

  const handleCreate = (c: Company) => {
    if (companies.some((x) => x.code === c.code)) {
      alert(`회사코드 ${c.code} 이미 존재합니다.`);
      return;
    }
    setCompanies((prev) => [...prev, c]);
  };

  const handleUpdate = (c: Company) => {
    if (!selected) return;
    setCompanies((prev) => prev.map((x) => x.code === selected.code ? c : x));
    setSelected(c);
  };

  const handleDelete = () => {
    if (!selected) return;
    if (!confirm(`${selected.name} (${selected.code}) 삭제할까요?`)) return;
    setCompanies((prev) => prev.filter((x) => x.code !== selected.code));
    setSelected(null);
  };

  const existingCodes = companies.map((c) => c.code);

  const ctxItems: ContextMenuItem[] = [
    { label: '수정', icon: <PencilSimple size={12} weight="bold" />, onClick: () => setEditOpen(true) },
    { label: '삭제', icon: <Trash size={12} weight="bold" />, onClick: handleDelete, danger: true },
  ];

  return (
    <>
      <PageShell
        subTabs={ADMIN_SUBTABS}
        footerLeft={<span className="stat-item">회사 <strong>{companies.length}</strong></span>}
        footerRight={
          <>
            <button className="btn" disabled={!selected} onClick={() => setEditOpen(true)}>
              <PencilSimple size={14} weight="bold" /> 수정
            </button>
            <button className="btn" disabled={!selected} onClick={handleDelete}>
              <Trash size={14} weight="bold" /> 삭제
            </button>
            <CompanyRegisterDialog
              open={registerOpen}
              onOpenChange={setRegisterOpen}
              onCreate={handleCreate}
              existingCodes={existingCodes}
            />
          </>
        }
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>회사코드</th>
                <th>회사명</th>
                <th>대표자</th>
                <th>사업자등록번호</th>
                <th>법인등록번호</th>
                <th>본점주소</th>
                <th>업태</th>
                <th>업종</th>
                <th>대표전화</th>
                <th className="num">계좌</th>
                <th className="num">카드</th>
              </tr>
            </thead>
            <tbody>
              {companies.length === 0 ? (
                <tr><td colSpan={11} className="center dim" style={{ padding: '32px 0' }}>등록된 회사가 없습니다. 우측 하단 [+ 회사 등록]으로 사업자등록증 OCR 진행하세요.</td></tr>
              ) : companies.map((c) => (
                <tr key={c.code} className={cn(selected?.code === c.code && 'selected')}
                    onClick={() => setSelected(c)}
                    onContextMenu={(ev) => { ev.preventDefault(); setSelected(c); setCtxMenu({ open: true, x: ev.clientX, y: ev.clientY }); }}>
                  <td className="plate text-medium">{c.code}</td>
                  <td>{c.name}</td>
                  <td>{c.ceo || <span className="text-muted">-</span>}</td>
                  <td className="mono">{c.bizNo}</td>
                  <td className="mono dim">{c.corpNo ?? <span className="text-muted">-</span>}</td>
                  <td className="dim">{c.hqAddress || <span className="text-muted">-</span>}</td>
                  <td className="dim">{c.bizType || <span className="text-muted">-</span>}</td>
                  <td className="dim">{c.bizCategory || <span className="text-muted">-</span>}</td>
                  <td className="mono dim">{c.phone || <span className="text-muted">-</span>}</td>
                  <td className="num">{c.accounts?.length ?? 0}</td>
                  <td className="num">{c.cards?.length ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageShell>
      <ContextMenu open={ctxMenu.open} x={ctxMenu.x} y={ctxMenu.y}
        onClose={() => setCtxMenu({ open: false, x: 0, y: 0 })}
        items={selected ? ctxItems : []} />
      <CompanyRegisterDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={selected ?? undefined}
        onUpdate={handleUpdate}
        existingCodes={existingCodes}
        showTrigger={false}
      />
    </>
  );
}
