'use client';

import { PageShell } from '@/components/layout/page-shell';
import { ASSET_SUBTABS, ASSET_SUBTAB_PENDING } from '@/lib/asset-subtabs';

export default function AssetGpsPage() {
  return (
    <PageShell
      subTabs={ASSET_SUBTABS}
      subTabPending={ASSET_SUBTAB_PENDING}
      footerLeft={<span className="stat">전체 <strong>0</strong></span>}
      footerRight={<button className="btn btn-primary">+ 단말 등록</button>}
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>회사코드</th>
              <th>차량번호</th>
              <th>단말 모델</th>
              <th className="date">장착일</th>
              <th className="center">시동제어</th>
              <th className="date">마지막 통신</th>
              <th>마지막 위치</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={7} className="center dim" style={{ padding: '24px 0' }}>
                GPS 단말 등록된 차량 없음
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
