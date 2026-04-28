'use client';

import { PageShell } from '@/components/layout/page-shell';
import { ADMIN_SUBTABS } from '@/lib/admin-subtabs';

export default function AdminCompanyPage() {
  return (
    <PageShell
      subTabs={ADMIN_SUBTABS}
      footerLeft={<span className="stat-item">회사 정보 관리</span>}
      footerRight={<button className="btn btn-primary">+ 회사 추가</button>}
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
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="plate text-medium">CP01</td>
              <td>스위치플랜(주)</td>
              <td>김대표</td>
              <td className="mono">110-11-12345</td>
              <td className="mono">110111-8596368</td>
              <td>경기도 연천군 전곡읍 은천로 97</td>
              <td>서비스</td>
              <td>차량렌탈</td>
              <td className="mono">02-1234-5678</td>
            </tr>
            <tr>
              <td className="plate text-medium">CP02</td>
              <td>JPK렌터카(주)</td>
              <td>이대표</td>
              <td className="mono">220-22-23456</td>
              <td className="mono">220222-1234567</td>
              <td>경기도 김포시</td>
              <td>서비스</td>
              <td>장기렌터카</td>
              <td className="mono">031-9876-5432</td>
            </tr>
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
