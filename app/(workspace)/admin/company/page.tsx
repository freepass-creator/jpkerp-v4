'use client';

import { useState } from 'react';
import { PencilSimple, Buildings } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { EmptyState } from '@/components/ui/empty-state';
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

  // 삭제는 개발도구(/dev) 에서 최고관리자만.
  const existingCodes = companies.map((c) => c.code);

  const ctxItems: ContextMenuItem[] = [
    { label: '수정', icon: <PencilSimple size={12} weight="bold" />, onClick: () => setEditOpen(true) },
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
            <CompanyRegisterDialog
              open={registerOpen}
              onOpenChange={setRegisterOpen}
              onCreate={handleCreate}
              existingCodes={existingCodes}
            />
          </>
        }
      >
        {companies.length === 0 ? (
          <EmptyState
            icon={Buildings}
            title="등록된 회사 없음"
            description="사업자등록증 OCR 또는 수기 입력으로 회사를 등록하세요."
            hint={<>① 우측 하단 [+ 회사등록] 클릭 → 사업자등록증 PDF/이미지 다중 업로드 → 즉시 OCR 분석<br />② 사업자번호·법인번호·대표·주소 자동 추출<br />③ 자산·계약은 회사 매칭이 선행되어야 정상 동작</>}
          />
        ) : (
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
              {companies.map((c, i) => (
                <tr key={c.code || `__${i}__`} className={cn(selected?.code === c.code && 'selected')}
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
        )}
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
