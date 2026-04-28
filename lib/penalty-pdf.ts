/**
 * 과태료 PDF 생성. jspdf는 ~700KB라 lazy import.
 *
 * 각 고지서마다 3페이지 묶음:
 *   1. 변경공문 (과태료 변경부과 요청서)
 *   2. 고지서 원본 (업로드된 이미지)
 *   3. 임대차계약 사실확인서
 *
 * 도장(인) 영역은 빨간색 원형 도장 모양으로 회사명을 그림.
 */
import type { PenaltyParsed } from './parsers/penalty';
import type { jsPDF } from 'jspdf';
import type { Company } from './sample-companies';

export interface PenaltyWorkItem extends PenaltyParsed {
  id: string;
  fileName: string;
  fileDataUrl: string;
  fileSize?: number;
  pageNumber?: number;
  _company?: Company | null;       // 도장에 사용 — 매칭된 계약의 회사
  _asset?: {
    manufacturer?: string;
    car_model?: string;
    detail_model?: string;
    partner_code?: string;
  } | null;
  _contract?: {
    contractor_name?: string;
    contractor_phone?: string;
    contractor_kind?: string;
    contractor_ident?: string;
    contractor_address?: string;
    start_date?: string;
    end_date?: string;
    product_type?: string;
    partner_code?: string;
  } | null;
  _saving?: boolean;
  _ocrStatus?: 'pending' | 'done' | 'failed';
  _ocrError?: string;
}

const PAGE_W = 210; // A4 mm
const PAGE_H = 297;
const M = 20;

function today() {
  const d = new Date();
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function shortDate(s?: string) {
  if (!s) return '';
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일` : s;
}

/**
 * 빨간 원형 도장.
 * 외곽 이중원 + 회사명을 가운데 (글자 수에 따라 자동 줄바꿈).
 */
function drawStamp(doc: jsPDF, cx: number, cy: number, name: string) {
  const r = 14; // 외곽 반지름 mm
  doc.setDrawColor(220, 30, 30);
  doc.setLineWidth(0.8);
  doc.circle(cx, cy, r, 'S');
  doc.setLineWidth(0.4);
  doc.circle(cx, cy, r - 1.6, 'S');

  doc.setTextColor(220, 30, 30);
  // 글자 수에 따라 한 줄/두 줄 분기
  const clean = name.replace(/\s+/g, '');
  if (clean.length <= 5) {
    doc.setFontSize(13);
    doc.text(clean, cx, cy + 1.5, { align: 'center' });
  } else {
    const half = Math.ceil(clean.length / 2);
    const line1 = clean.slice(0, half);
    const line2 = clean.slice(half);
    doc.setFontSize(10);
    doc.text(line1, cx, cy - 1, { align: 'center' });
    doc.text(line2, cx, cy + 4, { align: 'center' });
  }
  // 색 복원
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
}

function appendPenaltySection(doc: jsPDF, item: PenaltyWorkItem, isFirstSection: boolean): void {
  const company = item._company;
  const companyName = company?.name ?? '(주)회사명';

  // ── 1페이지: 변경공문 ──
  if (!isFirstSection) doc.addPage();
  let y = M + 10;

  doc.setFontSize(16);
  doc.text('과태료(범칙금) 변경부과 요청서', PAGE_W / 2, y, { align: 'center' });
  y += 14;

  doc.setFontSize(10);
  doc.text(`수신: ${item.issuer || '관할 경찰서장'}`, M, y);
  y += 7;
  doc.text(`발신: ${companyName}`, M, y);
  y += 7;
  doc.text('제목: 과태료(범칙금) 변경부과 요청', M, y);
  y += 12;

  doc.setFontSize(10);
  const bodyLines = [
    '1. 귀 기관의 무궁한 발전을 기원합니다.',
    '',
    '2. 아래 차량에 대한 과태료(범칙금)의 납부자 변경부과를 요청합니다.',
    '   위반 차량의 소유자(관리자)는 당사이나, 위반 당시 해당 차량은',
    '   임대차계약에 의하여 임차인이 사용 중이었으므로, 실제 운전자인',
    '   임차인에게 변경부과하여 주시기 바랍니다.',
    '',
    '                        - 아 래 -',
    '',
    `   가. 차량번호: ${item.car_number || '—'}`,
    `   나. 위반일시: ${item.date || '—'}`,
    `   다. 위반장소: ${item.location || '—'}`,
    `   라. 위반내용: ${item.description || '—'}`,
    `   마. 과태료(범칙금): ${item.amount ? `${item.amount.toLocaleString()}원` : '—'}`,
    `   바. 고지서번호: ${item.notice_no || '—'}`,
    '',
    '   사. 임차인 정보',
    `      - 성명: ${item._contract?.contractor_name || '—'}`,
    `      - 연락처: ${item._contract?.contractor_phone || '—'}`,
    `      - 계약기간: ${shortDate(item._contract?.start_date)} ~ ${shortDate(item._contract?.end_date)}`,
    '',
    '3. 붙임: 1) 과태료 고지서 사본 1부',
    '         2) 임대차계약 사실확인서 1부  끝.',
    '',
    '',
    `                                          ${today()}`,
    '',
    `                              ${companyName}`,
  ];

  for (const line of bodyLines) {
    if (y > PAGE_H - M - 10) {
      doc.addPage();
      y = M;
    }
    doc.text(line, M, y);
    y += 5.5;
  }

  // 도장 — 발신자 줄 오른쪽
  drawStamp(doc, PAGE_W - M - 18, y - 4, companyName);

  // ── 2페이지: 고지서 원본 ──
  if (item.fileDataUrl) {
    doc.addPage();
    try {
      const imgW = PAGE_W - M * 2;
      const imgH = PAGE_H - M * 2;
      doc.addImage(item.fileDataUrl, 'JPEG', M, M, imgW, imgH);
    } catch {
      doc.setFontSize(10);
      doc.text('(고지서 이미지 삽입 실패)', PAGE_W / 2, PAGE_H / 2, { align: 'center' });
    }
  }

  // ── 3페이지: 임대차계약 사실확인서 ──
  doc.addPage();
  y = M + 10;

  doc.setFontSize(16);
  doc.text('임대차계약 사실확인서', PAGE_W / 2, y, { align: 'center' });
  y += 16;

  doc.setFontSize(10);
  const contract = item._contract;
  const asset = item._asset;

  const kvRows: [string, string][] = [
    ['임대인 (회사)', companyName],
    ['임차인 (고객)', contract?.contractor_name || '—'],
    ['임차인 신분', contract?.contractor_kind || '—'],
    ['임차인 식별번호', contract?.contractor_ident || '—'],
    ['임차인 연락처', contract?.contractor_phone || '—'],
    ['임차인 주소', contract?.contractor_address || '—'],
    ['차량번호', item.car_number || '—'],
    [
      '차종',
      [asset?.manufacturer, asset?.detail_model ?? asset?.car_model].filter(Boolean).join(' ') || '—',
    ],
    ['회사코드', company?.code || contract?.partner_code || asset?.partner_code || '—'],
    ['계약기간', `${shortDate(contract?.start_date)} ~ ${shortDate(contract?.end_date)}`],
    ['계약유형', contract?.product_type || '장기렌트'],
  ];

  for (const [k, v] of kvRows) {
    doc.text(k, M, y);
    doc.text(String(v), M + 45, y);
    y += 7;
  }

  y += 8;
  const confirmLines = [
    '위 임대인은 위 차량을 임차인에게 임대차계약에 의하여 대여하였으며,',
    `위반 당시(${item.date || '—'}) 해당 차량은 임차인이 점유·사용 중이었음을`,
    '확인합니다.',
    '',
    '본 확인서는 관할 기관의 과태료(범칙금) 변경부과 요청을 위하여',
    '작성되었습니다.',
    '',
    '',
    '',
    `                                          ${today()}`,
    '',
    `                  확인자: ${companyName}`,
  ];

  for (const line of confirmLines) {
    if (y > PAGE_H - M - 10) {
      doc.addPage();
      y = M;
    }
    doc.text(line, M, y);
    y += 5.5;
  }

  drawStamp(doc, PAGE_W - M - 18, y - 4, companyName);
}

/**
 * 모든 고지서를 단일 PDF로 합쳐서 다운로드.
 */
export async function downloadPenaltyMergedPdf(
  items: PenaltyWorkItem[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  if (items.length === 0) return;
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const total = items.length;

  for (let i = 0; i < total; i++) {
    appendPenaltySection(doc, items[i], i === 0);
    onProgress?.(i + 1, total);
  }

  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const today = new Date().toISOString().slice(0, 10);
  a.download = `과태료_변경부과_${today}_${total}건.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
