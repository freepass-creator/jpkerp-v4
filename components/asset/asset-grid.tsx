'use client';

import { cn } from '@/lib/cn';
import type { Asset } from '@/lib/sample-assets';

type Props = {
  assets: Asset[];
  selectedId?: string;
  onRowClick?: (asset: Asset) => void;
};

/**
 * 차량등록현황 그리드.
 * 컬럼 = 자동차등록증 표기 항목만 (① ~ ㉟ + 헤더). 부가/운영 정보는 제외.
 * 라벨은 등록증 표기 그대로 (자동차등록번호 / 차명 / 성명(명칭) 등).
 * 가로 스크롤 OK.
 */
export function AssetGrid({ assets, selectedId, onRowClick }: Props) {
  return (
    <table className="table">
      <thead>
        <tr>
          {/* ── 헤더 영역 ── */}
          <th>문서확인번호</th>
          <th className="date">최초등록일</th>

          {/* ── 본문 (등록증 ① ~ ⑩) ── */}
          <th>자동차등록번호</th>
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

          {/* ── 1. 제원 (등록증 ⑪ ~ ㉔) ── */}
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

          {/* ── 2. 등록번호판 교부 (등록증 ㉕ ~ ㉗) ── */}
          <th>구분</th>
          <th className="date">번호판 발급일</th>
          <th>발급대행자확인</th>

          {/* ── 3. 저당권등록사실 (등록증 ㉘ ~ ㉙) ── */}
          <th>구분(설정/말소)</th>
          <th className="date">날짜</th>

          {/* ── 4. 검사 유효기간 (등록증 ㉚ ~ ㉟) ── */}
          <th className="date">연월일부터</th>
          <th className="date">연월일까지</th>
          <th>검사 시행장소</th>
          <th className="num">주행거리</th>
          <th>검사 책임자 확인</th>
          <th>검사 구분</th>

          {/* ── 기타 ── */}
          <th>등록증 발급일</th>
          <th className="num">자동차 출고(취득)가격</th>
        </tr>
      </thead>
      <tbody>
        {assets.map((a) => (
          <tr
            key={a.id}
            className={cn(selectedId === a.id && 'selected')}
            onClick={() => onRowClick?.(a)}
          >
            {/* 헤더 */}
            <td className="mono dim">{val(a.documentNo)}</td>
            <td className="date">{val(a.firstRegistDate)}</td>

            {/* 본문 ① ~ ⑩ */}
            <td className="plate text-medium">{a.plate}</td>
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

            {/* 제원 ⑪ ~ ㉔ */}
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

            {/* 등록번호판 교부 ㉕ ~ ㉗ */}
            <td>{val(a.plateIssueType)}</td>
            <td className="date">{val(a.plateIssueDate)}</td>
            <td>{val(a.plateIssueAgent)}</td>

            {/* 저당권 ㉘ ~ ㉙ */}
            <td>{val(a.mortgageType)}</td>
            <td className="date">{val(a.mortgageDate)}</td>

            {/* 검사 ㉚ ~ ㉟ */}
            <td className="date">{val(a.inspectionFrom)}</td>
            <td className="date">{val(a.inspectionTo)}</td>
            <td>{val(a.inspectionPlace)}</td>
            <td className="num">{numFmt(a.mileage)}</td>
            <td>{val(a.inspectionAuthority)}</td>
            <td className="dim">{val(a.inspectionType)}</td>

            {/* 기타 */}
            <td className="date">{val(a.certIssueDate)}</td>
            <td className="num">{numFmt(a.acquisitionPrice)}</td>
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
