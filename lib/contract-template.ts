import * as XLSX from 'xlsx';
import type { Asset } from './sample-assets';

/**
 * 계약 입력용 엑셀 템플릿 생성.
 * - 자산 정보가 미리 채워진 시트 1개
 * - 사용자는 [고객/계약조건/현재미수] 채워서 다시 업로드 → 시스템이 계약+과거수납이력 자동 생성
 * - 미수 역산 정책: 회차별 미수 비워두면 A안(최근부터 밀림) 자동, 채워져 있으면 C안(직접 지정)
 */
export function downloadContractTemplate(asset: Asset) {
  const wb = XLSX.utils.book_new();

  // [1] 계약 기본
  const basic = [
    ['항목', '값', '비고'],
    ['계약번호', '', '비워두면 자동생성'],
    ['회사코드', asset.companyCode, '(자동)'],
    ['자산 차량번호', asset.plate, '(자동)'],
    ['자산 차종', asset.vehicleClass, '(자동)'],
    ['자산 차명', asset.vehicleName, '(자동)'],
    ['자산 차대번호', asset.vin, '(자동)'],
    ['고객명', '', '직접 입력'],
    ['고객 연락처', '', ''],
    ['고객 신분', '', '개인 / 사업자'],
    ['고객 식별번호', '', '주민/사업자등록번호'],
    ['계약시작일', '', 'YYYY-MM-DD'],
    ['계약기간(개월)', '', '예: 36'],
    ['월 청구액', '', '원'],
    ['보증금', '', '원'],
    ['특약', '', ''],
  ];
  const basicSheet = XLSX.utils.aoa_to_sheet(basic);
  basicSheet['!cols'] = [{ wch: 18 }, { wch: 30 }, { wch: 26 }];
  XLSX.utils.book_append_sheet(wb, basicSheet, '계약기본');

  // [2] 현재 미수 (한 칸이면 A안 자동 역산)
  const due = [
    ['항목', '값', '비고'],
    ['현재 미수금액', '', '한 칸만 채우면 시스템이 회차별 자동 분배 (최근부터 밀림 정책)'],
  ];
  const dueSheet = XLSX.utils.aoa_to_sheet(due);
  dueSheet['!cols'] = [{ wch: 18 }, { wch: 18 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, dueSheet, '현재미수');

  // [3] 수납이력 (선택입력 — C안 오버라이드)
  const history = [
    ['회차', '청구일', '청구액', '수납일', '수납액', '상태'],
    [1, '', '', '', '', ''],
    [2, '', '', '', '', ''],
    [3, '', '', '', '', ''],
  ];
  const historySheet = XLSX.utils.aoa_to_sheet(history);
  historySheet['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, historySheet, '수납이력_선택입력');

  XLSX.writeFile(wb, `계약입력_${asset.plate}.xlsx`);
}
