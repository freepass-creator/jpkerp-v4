'use client';

import { PageShell } from '@/components/layout/page-shell';
import { ASSET_SUBTABS } from '@/lib/asset-subtabs';
import { SAMPLE_ASSETS } from '@/lib/sample-assets';

export default function AssetInsurancePage() {
  return (
    <PageShell
      subTabs={ASSET_SUBTABS}
      footerLeft={<span className="stat">전체 <strong>{SAMPLE_ASSETS.length}</strong></span>}
      footerRight={<button className="btn btn-primary">+ 보험 등록</button>}
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>차량번호</th>
              <th>보험사</th>
              <th className="date">가입일</th>
              <th className="date">만기일</th>
              <th className="num">보험료</th>
              <th>담보</th>
            </tr>
          </thead>
          <tbody>
            {SAMPLE_ASSETS.map((a) => (
              <tr key={a.id}>
                <td className="plate">{a.plate}</td>
                <td className="dim">미가입</td>
                <td className="date dim">-</td>
                <td className="date dim">-</td>
                <td className="num dim">-</td>
                <td className="dim">-</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
