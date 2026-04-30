'use client';

import { PageShell } from '@/components/layout/page-shell';
import { CONTRACT_SUBTABS } from '@/lib/contract-subtabs';
import { useAssetStore } from '@/lib/use-asset-store';
import { useContractStore } from '@/lib/use-contract-store';
import { cn } from '@/lib/cn';

/**
 * 휴차현황 — 자산은 있으나 활성 계약이 없는 차량.
 * 계약현황 + 휴차현황 = 총 자산대수
 */
export default function ContractIdlePage() {
  const [assets] = useAssetStore();
  const [contracts] = useContractStore();

  // 활성 계약이 있는 차량번호 set
  const activeContractPlates = new Set(
    contracts.filter((c) => c.status === '운행중').map((c) => c.plate),
  );

  // 매각 / 등록예정 제외, 활성 계약 없는 자산 = 휴차
  const idle = assets.filter(
    (a) => a.status !== '매각' && a.status !== '등록예정' && !activeContractPlates.has(a.plate),
  );

  // 마지막 계약 lookup
  const lastContractByPlate = new Map<string, string>();
  for (const c of contracts) {
    const prev = lastContractByPlate.get(c.plate);
    if (!prev || c.endDate > prev) lastContractByPlate.set(c.plate, c.endDate);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function idleDays(plate: string, registDate: string): number {
    const lastEnd = lastContractByPlate.get(plate);
    const baseDate = lastEnd ? new Date(lastEnd) : new Date(registDate);
    if (isNaN(baseDate.getTime())) return 0;
    return Math.max(0, Math.floor((today.getTime() - baseDate.getTime()) / 86400000));
  }

  const totalAssets = assets.filter((a) => a.status !== '매각' && a.status !== '등록예정').length;
  const inContract = activeContractPlates.size;

  return (
    <PageShell
      subTabs={CONTRACT_SUBTABS}
     
      footerLeft={
        <>
          <span className="stat-item">전체 자산 <strong>{totalAssets}</strong></span>
          <span className="stat-item">계약중 <strong>{inContract}</strong></span>
          <span className="stat-divider" />
          <span className="stat-item alert">휴차 <strong>{idle.length}</strong></span>
        </>
      }
      footerRight={
        <>
          <button className="btn">엑셀</button>
          <button className="btn btn-primary">+ 계약 매칭</button>
        </>
      }
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>회사코드</th>
              <th>차량번호</th>
              <th>차명</th>
              <th>차종</th>
              <th>제조사</th>
              <th>모델명</th>
              <th>외부색상</th>
              <th className="date">최초등록일</th>
              <th className="date">마지막 계약 만기</th>
              <th className="num">휴차 일수</th>
              <th className="center">상태</th>
            </tr>
          </thead>
          <tbody>
            {idle.length === 0 ? (
              <tr>
                <td colSpan={11} className="empty-row">
                  휴차 차량 없음 — 모든 자산이 계약 운행 중
                </td>
              </tr>
            ) : (
              idle.map((a) => {
                const lastEnd = lastContractByPlate.get(a.plate);
                const days = idleDays(a.plate, a.firstRegistDate);
                const ddCls = days >= 30 ? 'overdue' : days >= 7 ? 'due-soon' : '';
                return (
                  <tr key={a.id}>
                    <td className="plate">{a.companyCode}</td>
                    <td className="plate text-medium">{a.plate}</td>
                    <td>{a.vehicleName}</td>
                    <td className="dim">{a.vehicleClass}</td>
                    <td>{a.maker ?? <span className="text-muted">-</span>}</td>
                    <td>{a.modelName ?? <span className="text-muted">-</span>}</td>
                    <td>{a.exteriorColor ?? <span className="text-muted">-</span>}</td>
                    <td className="date">{a.firstRegistDate}</td>
                    <td className="date">{lastEnd ?? <span className="text-muted">-</span>}</td>
                    <td className={cn('num', ddCls)}>{days.toLocaleString('ko-KR')}일</td>
                    <td className="center">
                      <span className={cn('badge', a.status === '정비' ? 'badge-orange' : 'badge')}>
                        {a.status}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
