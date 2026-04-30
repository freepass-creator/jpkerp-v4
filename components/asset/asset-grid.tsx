'use client';

import { cn } from '@/lib/cn';
import type { Asset } from '@/lib/sample-assets';

const COMPANY_COL_WIDTH = 56;
const PLATE_COL_WIDTH = 96;

type Props = {
  assets: Asset[];
  selectedId?: string;
  onRowClick?: (asset: Asset) => void;
  onRowContextMenu?: (asset: Asset, x: number, y: number) => void;
};

/**
 * 차량등록현황 그리드.
 * 컬럼 순서:
 *   순번 / 회사코드 / 등록증 ① ~ ㉟ (검사 ㉚~㉟ 제외) / 등록증 메타 / 부가(선택입력)
 * 그룹 경계 굵은 세로선 없음 (사용자 요청).
 */
export function AssetGrid({ assets, selectedId, onRowClick, onRowContextMenu }: Props) {
  return (
    <table className="table">
      <thead>
        <tr>
          {/* 식별자 — sticky 좌측 anchor */}
          <th className="sticky-col" style={{ left: 0, minWidth: COMPANY_COL_WIDTH }}>회사코드</th>
          <th className="sticky-col-2" style={{ left: COMPANY_COL_WIDTH, minWidth: PLATE_COL_WIDTH }}>차량번호</th>
          <th>차종</th>
          <th>용도</th>
          <th>차명</th>
          <th>형식</th>
          <th className="date">제작연월</th>
          <th>차대번호</th>
          <th>원동기형식</th>
          <th>사용본거지</th>
          <th>성명(명칭)</th>
          <th>생년월일(법인등록번호)</th>

          {/* 1. 제원 ⑪ ~ ㉔ */}
          <th>제원관리번호</th>
          <th className="num">길이</th>
          <th className="num">너비</th>
          <th className="num">높이</th>
          <th className="num">총중량</th>
          <th className="num">승차정원</th>
          <th className="num">최대적재량</th>
          <th className="num">배기량/구동축전지 용량</th>
          <th>정격출력</th>
          <th>기통수</th>
          <th>연료종류</th>
          <th className="num">연료소비율</th>
          <th>구동축전지 셀 제조사</th>
          <th>구동축전지 셀 형태</th>
          <th>구동축전지 셀 주요원료</th>

          {/* 2. 등록번호판 교부 ㉕ ~ ㉗ */}
          <th>구분</th>
          <th className="date">번호판 발급일</th>
          <th>발급대행자확인</th>

          {/* 3. 저당권 ㉘ ~ ㉙ */}
          <th>구분(설정/말소)</th>
          <th className="date">날짜</th>

          {/* 등록증 메타 */}
          <th>문서확인번호</th>
          <th className="date">최초등록일</th>
          <th className="date">등록증 발급일</th>
          <th className="num">자동차 출고(취득)가격</th>

          {/* 부가 (선택입력) */}
          <th>제조사</th>
          <th>모델명</th>
          <th>세부모델</th>
          <th>세부트림</th>
          <th>선택옵션</th>
          <th>외부색상</th>
          <th>내부색상</th>
          <th className="center">구동방식</th>
        </tr>
      </thead>
      <tbody>
        {assets.map((a) => (
          <tr
            key={a.id}
            className={cn(selectedId === a.id && 'selected')}
            onClick={() => onRowClick?.(a)}
            onContextMenu={(e) => {
              if (!onRowContextMenu) return;
              e.preventDefault();
              onRowClick?.(a); // 우클릭 시 행 선택도 같이
              onRowContextMenu(a, e.clientX, e.clientY);
            }}
          >
            {/* 식별자 — sticky 좌측 anchor */}
            <td
              className="plate text-medium sticky-col"
              style={{ left: 0, minWidth: COMPANY_COL_WIDTH }}
            >
              {a.companyCode}
            </td>
            <td
              className="plate text-medium sticky-col-2"
              style={{ left: COMPANY_COL_WIDTH, minWidth: PLATE_COL_WIDTH }}
            >
              {a.plate}
            </td>
            <td className="dim">{a.vehicleClass}</td>
            <td className="dim">{a.usage}</td>
            <td>{a.vehicleName}</td>
            <td className="mono">{val(a.modelType)}</td>
            <td className="date">{val(a.manufactureDate)}</td>
            <td className="mono dim">{a.vin}</td>
            <td className="mono">{val(a.engineType)}</td>
            <td className="dim">{val(a.ownerLocation)}</td>
            <td>{a.ownerName}</td>
            <td className="mono dim">{val(a.ownerRegNumber)}</td>

            {/* 1. 제원 ⑪ ~ ㉔ */}
            <td className="mono dim">{val(a.approvalNumber)}</td>
            <td className="num">{numFmt(a.length)}</td>
            <td className="num">{numFmt(a.width)}</td>
            <td className="num">{numFmt(a.height)}</td>
            <td className="num">{numFmt(a.totalWeight)}</td>
            <td className="num">{numFmt(a.capacity)}</td>
            <td className="num">{numFmt(a.maxLoad)}</td>
            <td className="num">{numFmt(a.displacement)}</td>
            <td className="mono">{val(a.ratedOutput)}</td>
            <td>{val(a.cylinders)}</td>
            <td>{val(a.fuelType)}</td>
            <td className="num">{numFmt(a.fuelEfficiency)}</td>
            <td>{val(a.batteryMaker)}</td>
            <td>{val(a.batteryShape)}</td>
            <td>{val(a.batteryMaterial)}</td>

            {/* 2. 등록번호판 교부 ㉕ ~ ㉗ */}
            <td>{val(a.plateIssueType)}</td>
            <td className="date">{val(a.plateIssueDate)}</td>
            <td>{val(a.plateIssueAgent)}</td>

            {/* 3. 저당권 ㉘ ~ ㉙ */}
            <td>{val(a.mortgageType)}</td>
            <td className="date">{val(a.mortgageDate)}</td>

            {/* 등록증 메타 */}
            <td className="mono dim">{val(a.documentNo)}</td>
            <td className="date">{val(a.firstRegistDate)}</td>
            <td className="date">{val(a.certIssueDate)}</td>
            <td className="num">{numFmt(a.acquisitionPrice)}</td>

            {/* 부가 (선택입력) */}
            <td>{val(a.maker)}</td>
            <td>{val(a.modelName)}</td>
            <td>{val(a.detailModel)}</td>
            <td>{val(a.detailTrim)}</td>
            <td>{val(Array.isArray(a.options) ? a.options.join(', ') : a.options)}</td>
            <td>{val(a.exteriorColor)}</td>
            <td>{val(a.interiorColor)}</td>
            <td className="center">{val(a.driveType)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function val(s?: string): React.ReactNode {
  return s ? s : '';
}

function numFmt(n?: number): React.ReactNode {
  if (n === undefined || n === null) return '';
  return n.toLocaleString('ko-KR');
}
