'use client';

import { PageShell } from '@/components/layout/page-shell';
import { ASSET_SUBTABS, useAssetSubtabPending } from '@/lib/asset-subtabs';

export default function AssetLoanPage() {
  const subTabPending = useAssetSubtabPending();
  return (
    <PageShell
      subTabs={ASSET_SUBTABS}
      subTabPending={subTabPending}
      footerLeft={<span className="stat">전체 <strong>0</strong></span>}
      footerRight={<button className="btn btn-primary">+ 할부 등록</button>}
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>회사코드</th>
              <th>차량번호</th>
              <th>할부사</th>
              <th className="date">시작일</th>
              <th className="num">잔여회차</th>
              <th className="num">월납</th>
              <th className="num">잔여원금</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={7} className="empty-row">
                할부 데이터 없음
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
