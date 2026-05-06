'use client';

import { useMemo, useCallback, useRef } from 'react';
import { JpkTable, type JpkColumn, type JpkTableApi } from '@/components/shared/jpk-table';
import type { Asset } from '@/lib/sample-assets';

type Props = {
  assets: Asset[];
  selectedId?: string;
  onRowClick?: (asset: Asset) => void;
  onRowContextMenu?: (asset: Asset, x: number, y: number) => void;
  /** 필터 변경 시 호출 — 페이지에서 footer 카운트/엑셀 추출용 */
  onFilteredChange?: (rows: readonly Asset[]) => void;
  /** localStorage 영속 키 (페이지마다 다른 컬럼 폭/필터 유지) */
  storageKey?: string;
  /** 전역 검색 키워드 (topbar 검색에서 받음) */
  globalSearch?: string;
};

const numFmt = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('ko-KR') : '';

/**
 * 차량등록현황 그리드 — JpkTable 기반.
 * 컬럼 헤더 클릭 → set/range/date 필터 (엑셀식).
 * 컬럼 순서: 회사 → 차량번호 → 등록증 ① ~ ㉟ (검사 ㉚~㉟ 제외) → 메타 → 부가.
 */
export function AssetGrid({
  assets, selectedId, onRowClick, onRowContextMenu, onFilteredChange, storageKey = 'asset.grid', globalSearch,
}: Props) {
  const tableRef = useRef<JpkTableApi<Asset> | null>(null);

  const columns = useMemo<JpkColumn<Asset>[]>(() => [
    /* 식별자 */
    { headerName: '회사', field: 'companyCode', width: 80, filterable: true,
      cellRenderer: ({ value }) => <span className="plate text-medium">{(value as string) || '-'}</span> },
    { headerName: '자산코드', field: 'assetCode', width: 110, filterable: true,
      cellRenderer: ({ value }) => <span className="mono text-medium">{(value as string) || '-'}</span> },
    { headerName: '차량번호', field: 'plate', width: 110, filterable: true,
      cellRenderer: ({ value }) => <span className="plate text-medium">{(value as string) || '-'}</span> },

    /* 등록증 ① ~ ⑩ */
    { headerName: '차종', field: 'vehicleClass', width: 80, filterable: true },
    { headerName: '용도', field: 'usage', width: 80, filterable: true },
    { headerName: '차명', field: 'vehicleName', width: 160, filterable: true },
    { headerName: '형식', field: 'modelType', width: 100,
      cellRenderer: ({ value }) => <span className="mono">{(value as string) || ''}</span> },
    { headerName: '제작연월', field: 'manufactureDate', width: 100, filterType: 'date' },
    { headerName: '차대번호', field: 'vin', width: 170,
      cellRenderer: ({ value }) => <span className="mono dim">{(value as string) || ''}</span> },
    { headerName: '원동기형식', field: 'engineType', width: 100 },
    { headerName: '사용본거지', field: 'ownerLocation', width: 140, filterable: true,
      cellRenderer: ({ value }) => <span className="dim">{(value as string) || ''}</span> },
    { headerName: '성명(명칭)', field: 'ownerName', width: 140, filterable: true },
    { headerName: '생년월일/법인등록번호', field: 'ownerRegNumber', width: 140,
      cellRenderer: ({ value }) => <span className="mono dim">{(value as string) || ''}</span> },

    /* 1. 제원 ⑪ ~ ㉔ */
    { headerName: '제원관리번호', field: 'approvalNumber', width: 110,
      cellRenderer: ({ value }) => <span className="mono dim">{(value as string) || ''}</span> },
    { headerName: '길이', field: 'length', width: 80, align: 'right', filterType: 'range', valueFormatter: ({ value }) => numFmt(value) },
    { headerName: '너비', field: 'width', width: 80, align: 'right', filterType: 'range', valueFormatter: ({ value }) => numFmt(value) },
    { headerName: '높이', field: 'height', width: 80, align: 'right', filterType: 'range', valueFormatter: ({ value }) => numFmt(value) },
    { headerName: '총중량', field: 'totalWeight', width: 90, align: 'right', filterType: 'range', valueFormatter: ({ value }) => numFmt(value) },
    { headerName: '승차정원', field: 'capacity', width: 80, align: 'right', filterType: 'range', valueFormatter: ({ value }) => numFmt(value) },
    { headerName: '최대적재량', field: 'maxLoad', width: 90, align: 'right', filterType: 'range', valueFormatter: ({ value }) => numFmt(value) },
    { headerName: '배기량/구동축전지', field: 'displacement', width: 110, align: 'right', filterType: 'range', valueFormatter: ({ value }) => numFmt(value) },
    { headerName: '정격출력', field: 'ratedOutput', width: 100,
      cellRenderer: ({ value }) => <span className="mono">{(value as string) || ''}</span> },
    { headerName: '기통수', field: 'cylinders', width: 80 },
    { headerName: '연료종류', field: 'fuelType', width: 90, filterable: true },
    { headerName: '연료소비율', field: 'fuelEfficiency', width: 90, align: 'right', filterType: 'range', valueFormatter: ({ value }) => numFmt(value) },
    { headerName: '구동축전지 셀 제조사', field: 'batteryMaker', width: 130 },
    { headerName: '셀 형태', field: 'batteryShape', width: 90 },
    { headerName: '셀 주요원료', field: 'batteryMaterial', width: 110 },

    /* 2. 등록번호판 교부 ㉕ ~ ㉗ */
    { headerName: '구분', field: 'plateIssueType', width: 80 },
    { headerName: '번호판 발급일', field: 'plateIssueDate', width: 110, filterType: 'date' },
    { headerName: '발급대행자확인', field: 'plateIssueAgent', width: 120 },

    /* 3. 저당권 ㉘ ~ ㉙ */
    { headerName: '저당권', field: 'mortgageType', width: 90 },
    { headerName: '저당 날짜', field: 'mortgageDate', width: 110, filterType: 'date' },

    /* 등록증 메타 */
    { headerName: '문서확인번호', field: 'documentNo', width: 130,
      cellRenderer: ({ value }) => <span className="mono dim">{(value as string) || ''}</span> },
    { headerName: '최초등록일', field: 'firstRegistDate', width: 110, filterType: 'date' },
    { headerName: '등록증 발급일', field: 'certIssueDate', width: 110, filterType: 'date' },
    { headerName: '출고가격', field: 'acquisitionPrice', width: 110, align: 'right', filterType: 'range',
      filterStep: 1000000, filterUnit: 10000, filterUnitLabel: '만원',
      valueFormatter: ({ value }) => numFmt(value) },

    /* 부가 (선택입력) */
    { headerName: '제조사', field: 'maker', width: 100, filterable: true },
    { headerName: '모델명', field: 'modelName', width: 120, filterable: true },
    { headerName: '세부모델', field: 'detailModel', width: 120 },
    { headerName: '세부트림', field: 'detailTrim', width: 120 },
    { headerName: '선택옵션', minWidth: 140,
      valueGetter: ({ data }) => Array.isArray(data.options) ? data.options.join(', ') : (data.options ?? ''),
      cellRenderer: ({ value }) => <span>{value as string}</span> },
    { headerName: '외부색상', field: 'exteriorColor', width: 90, filterable: true },
    { headerName: '내부색상', field: 'interiorColor', width: 90, filterable: true },
    { headerName: '구동방식', field: 'driveType', width: 80, align: 'center', filterable: true },
  ], []);

  const getRowId = useCallback((a: Asset) => a.id, []);
  const handleRowClick = useCallback((a: Asset) => onRowClick?.(a), [onRowClick]);
  const handleRowContextMenu = useCallback((a: Asset, _i: number, ev: React.MouseEvent) => {
    if (!onRowContextMenu) return;
    onRowClick?.(a);
    onRowContextMenu(a, ev.clientX, ev.clientY);
  }, [onRowContextMenu, onRowClick]);

  return (
    <JpkTable<Asset>
      ref={tableRef}
      columns={columns}
      rows={assets}
      getRowId={getRowId}
      selectedKey={selectedId}
      storageKey={storageKey}
      onRowClick={handleRowClick}
      onRowContextMenu={handleRowContextMenu}
      onFilteredChange={onFilteredChange}
      globalSearch={globalSearch}
    />
  );
}
