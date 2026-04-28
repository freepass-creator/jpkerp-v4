'use client';

import { PageShell } from '@/components/layout/page-shell';
import { CONTRACT_SUBTABS, CONTRACT_SUBTAB_PENDING } from '@/lib/contract-subtabs';
import { SAMPLE_CONTRACTS } from '@/lib/sample-contracts';
import { cn } from '@/lib/cn';

/**
 * 임차인정보 — 활성/종료 임차인 목록.
 * 계약 종료 후 일정 기간(개인 5년 / 사업자 10년) 경과 시 자동 폐기.
 * 폐기 D-day 색상 코딩.
 */

type LesseeKind = '개인' | '사업자';
type LesseeStatus = '유지중' | '만기도래' | '종료';

type Lessee = {
  id: string;
  companyCode: string;
  code: string;             // 임차인 코드 (LS-NNNN)
  name: string;
  kind: LesseeKind;
  phone: string;
  identNumber: string;
  currentPlate?: string;
  contractNo?: string;
  status: LesseeStatus;
  contractEndDate?: string;  // 마지막 계약 종료일
};

// 개인 5년 / 사업자 10년 보존 정책
const RETENTION_YEARS: Record<LesseeKind, number> = { 개인: 5, 사업자: 10 };

// 활성 계약 → 임차인 자동 lookup
const ACTIVE_LESSEES: Lessee[] = SAMPLE_CONTRACTS
  .filter((c) => c.status === '운행중')
  .map((c, i) => ({
    id: `ls-${c.id}`,
    companyCode: c.companyCode,
    code: `LS-${String(i + 1).padStart(4, '0')}`,
    name: c.customerName,
    kind: c.customerKind ?? '개인',
    phone: c.customerPhone ?? '',
    identNumber: c.customerKind === '사업자' ? '110-22-12345' : '880101-1******',
    currentPlate: c.plate,
    contractNo: c.contractNo,
    status: '유지중' as LesseeStatus,
    contractEndDate: c.endDate,
  }));

// 종료된 임차인 sample (폐기 도래 표시용)
const ARCHIVED_LESSEES: Lessee[] = [
  {
    id: 'ls-old-1',
    companyCode: 'CP01',
    code: 'LS-9001',
    name: '이순신',
    kind: '개인',
    phone: '010-7777-8888',
    identNumber: '780101-1******',
    status: '종료',
    contractEndDate: '2021-05-12',  // 5년 거의 도래 — 폐기 임박
  },
  {
    id: 'ls-old-2',
    companyCode: 'CP02',
    code: 'LS-9002',
    name: '동방주식회사',
    kind: '사업자',
    phone: '02-555-1234',
    identNumber: '215-81-67890',
    status: '종료',
    contractEndDate: '2018-03-20',
  },
];

export default function ContractCustomerPage() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lessees = [...ACTIVE_LESSEES, ...ARCHIVED_LESSEES];

  function retentionEndDate(l: Lessee): Date | null {
    if (!l.contractEndDate) return null;
    const end = new Date(l.contractEndDate);
    if (isNaN(end.getTime())) return null;
    end.setFullYear(end.getFullYear() + RETENTION_YEARS[l.kind]);
    return end;
  }

  function disposeDday(l: Lessee): number | null {
    const re = retentionEndDate(l);
    if (!re) return null;
    return Math.floor((re.getTime() - today.getTime()) / 86400000);
  }

  const total = lessees.length;
  const active = lessees.filter((l) => l.status === '유지중').length;
  const expiring = lessees.filter((l) => {
    const d = disposeDday(l);
    return d !== null && d <= 90 && d >= 0;
  }).length;
  const overdue = lessees.filter((l) => {
    const d = disposeDday(l);
    return d !== null && d < 0;
  }).length;

  return (
    <PageShell
      subTabs={CONTRACT_SUBTABS}
      subTabPending={CONTRACT_SUBTAB_PENDING}
      footerLeft={
        <>
          <span className="stat-item">전체 <strong>{total}</strong></span>
          <span className="stat-item">유지중 <strong>{active}</strong></span>
          {expiring > 0 && <span className="stat-item alert">폐기 임박 <strong>{expiring}</strong></span>}
          {overdue > 0 && <span className="stat-item alert">폐기 경과 <strong>{overdue}</strong></span>}
        </>
      }
      footerRight={
        <>
          <button className="btn">엑셀</button>
          <button className="btn">+ 임차인 등록</button>
        </>
      }
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>회사코드</th>
              <th>차량번호</th>
              <th>임차인코드</th>
              <th>성명/명칭</th>
              <th>신분</th>
              <th>연락처</th>
              <th>식별번호</th>
              <th>계약번호</th>
              <th className="center">상태</th>
              <th className="date">계약 종료일</th>
              <th className="date">폐기 예정일</th>
              <th className="center">폐기 D-day</th>
            </tr>
          </thead>
          <tbody>
            {lessees.map((l) => {
              const re = retentionEndDate(l);
              const dday = disposeDday(l);
              const ddCls = dday === null ? '' : dday < 0 ? 'overdue' : dday < 30 ? 'overdue' : dday < 90 ? 'due-soon' : '';
              return (
                <tr key={l.id}>
                  <td className="plate">{l.companyCode}</td>
                  <td className="plate">{l.currentPlate ?? <span className="text-muted">-</span>}</td>
                  <td className="mono dim">{l.code}</td>
                  <td className="text-medium">{l.name}</td>
                  <td className="dim">{l.kind}</td>
                  <td className="mono">{l.phone}</td>
                  <td className="mono dim">{l.identNumber}</td>
                  <td className="mono dim">{l.contractNo ?? <span className="text-muted">-</span>}</td>
                  <td className="center">
                    <span className={cn('badge', l.status === '유지중' ? 'badge-green' : l.status === '만기도래' ? 'badge-orange' : 'badge')}>
                      {l.status}
                    </span>
                  </td>
                  <td className="date">{l.contractEndDate ?? <span className="text-muted">-</span>}</td>
                  <td className="date dim">{re ? re.toISOString().slice(0, 10) : <span className="text-muted">-</span>}</td>
                  <td className={cn('center', ddCls)}>
                    {dday === null ? <span className="text-muted">-</span> : dday < 0 ? `폐기 ${-dday}일 경과` : `D-${dday}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
