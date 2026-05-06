'use client';

import { PageShell } from '@/components/layout/page-shell';
import { useMemo } from 'react';
import { UserList } from '@phosphor-icons/react';
import { EmptyState } from '@/components/ui/empty-state';
import { CONTRACT_SUBTABS } from '@/lib/contract-subtabs';
import { useContractStore } from '@/lib/use-contract-store';
import { useCustomerStore } from '@/lib/use-customer-store';
import { activeContracts } from '@/lib/sample-contracts';
import { activeCustomers, type Customer } from '@/lib/sample-customers';

/**
 * 고객 — Customer master entity. 계약과 분리된 영구 master.
 *
 * 한 고객이 여러 계약 보유 가능 (재계약·다중차량). 계약 등록 시 ident/phone 매칭으로 자동 누적.
 * 계약서 본문엔 "임차인" 표기, 시스템 코드/UI 는 "고객".
 *
 * 표시:
 *   · 고객코드 (CP01CU0001)
 *   · 회사 / 이름 / 신분 / 연락처 / 이메일
 *   · 등록번호 (마스킹: 주민이면 앞 6자리, 사업자/법인은 그대로)
 *   · 보유 계약 수 (active) + 마지막 계약 만기일
 */

/** 등록번호 마스킹 — 주민(개인)은 앞 6자리만 노출, 사업자/법인은 그대로. */
function maskIdent(c: Customer): string {
  if (!c.ident) return '-';
  if (c.kind === '개인') {
    // 주민번호 앞 6자리 + 뒤 ******
    const front = c.ident.replace(/[^0-9]/g, '').slice(0, 6);
    return front ? `${front}-*******` : '-';
  }
  return c.ident;
}

export default function ContractCustomerPage() {
  const [allCustomers] = useCustomerStore();
  const [allContracts] = useContractStore();

  const customers = useMemo(() => activeCustomers(allCustomers), [allCustomers]);
  const contracts = useMemo(() => activeContracts(allContracts), [allContracts]);

  /** 고객별 계약 join — code 매칭. O(N+M) Map 으로 그룹핑. */
  const contractsByCustomer = useMemo(() => {
    const map = new Map<string, typeof contracts>();
    for (const c of contracts) {
      if (!c.customerCode) continue;
      const arr = map.get(c.customerCode);
      if (arr) arr.push(c);
      else map.set(c.customerCode, [c]);
    }
    return map;
  }, [contracts]);

  type Row = {
    customer: Customer;
    activeContractCount: number;
    lastEndDate?: string;
  };

  const rows = useMemo<Row[]>(() => {
    return customers.map((cust) => {
      const list = contractsByCustomer.get(cust.code) ?? [];
      const active = list.filter((c) => c.status === '운행중');
      const lastEndDate = list
        .map((c) => c.endDate)
        .filter((d): d is string => !!d)
        .sort()
        .pop();
      return {
        customer: cust,
        activeContractCount: active.length,
        lastEndDate,
      };
    });
  }, [customers, contractsByCustomer]);

  const total = rows.length;
  const withActive = rows.filter((r) => r.activeContractCount > 0).length;

  return (
    <PageShell
      subTabs={CONTRACT_SUBTABS}
      footerLeft={
        <>
          <span className="stat-item">전체 <strong>{total}</strong></span>
          <span className="stat-item">계약 보유 <strong>{withActive}</strong></span>
        </>
      }
      footerRight={
        <>
          <button className="btn">엑셀</button>
          <button className="btn">+ 고객 등록</button>
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          icon={UserList}
          title="등록된 고객 없음"
          description="계약 등록 시 고객 마스터에 자동 누적됩니다."
          hint={<>① 계약 등록 → 고객 자동 매칭 (ident/phone) 또는 신규 발급<br />② 같은 고객 재계약 시 같은 코드 재사용<br />③ 다중 차량 보유 고객 그룹화</>}
        />
      ) : (
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>고객코드</th>
              <th>회사</th>
              <th>이름</th>
              <th>신분</th>
              <th>연락처</th>
              <th>이메일</th>
              <th>등록번호</th>
              <th className="center">보유 계약</th>
              <th className="date">마지막 만기일</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.customer.code}>
                <td className="mono text-medium">{r.customer.code}</td>
                <td className="plate">{r.customer.companyCode}</td>
                <td className="text-medium">{r.customer.name}</td>
                <td className="dim">{r.customer.kind}</td>
                <td className="mono">{r.customer.phone || <span className="text-muted">-</span>}</td>
                <td className="mono dim">{r.customer.email || <span className="text-muted">-</span>}</td>
                <td className="mono dim">{maskIdent(r.customer)}</td>
                <td className="center">
                  {r.activeContractCount > 0
                    ? <span className="badge badge-green">{r.activeContractCount}</span>
                    : <span className="text-muted">-</span>}
                </td>
                <td className="date dim">{r.lastEndDate ?? <span className="text-muted">-</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </PageShell>
  );
}
