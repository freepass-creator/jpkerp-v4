/**
 * SMS 메시지 템플릿 — 직원/서버에서 호출.
 *
 * 자리표시자 치환만, 외부 의존 없음 (RTDB/Admin SDK X).
 * URL 은 NEXT_PUBLIC_APP_URL 또는 fallback 사용.
 */

import { normalizeIdent } from '../customer-match';

export type SmsTemplateKind = 'welcome' | 'overdue' | 'expire' | 'inspection' | 'insurance' | 'custom';

export type SmsTemplateContext = {
  companyName?: string;        // 회사명 (없으면 'JPK렌터카' fallback)
  customerName: string;
  plate: string;
  customerIdent: string;       // URL 에 포함
  amount?: number;             // 미납 금액 (overdue)
  cycle?: number;              // 미납 회차 (overdue)
  daysLeft?: number;           // 만기 D-N (expire)
  endDate?: string;            // 만기일 (expire)
  companyPhone?: string;       // 회사 대표번호 (expire)
};

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.jpkerp.com';

export function customerLookupUrl(plate: string, customerIdent: string): string {
  const p = encodeURIComponent(plate.replace(/\s/g, '').trim());
  const i = encodeURIComponent(normalizeIdent(customerIdent));
  return `${APP_URL}/customer/${p}?ident=${i}`;
}

/** 새 계약 환영. */
export function welcomeContent(ctx: SmsTemplateContext): string {
  const co = ctx.companyName ?? 'JPK렌터카';
  return [
    `[${co}] 계약 등록 완료`,
    ``,
    `${ctx.customerName}님 안녕하세요.`,
    `차량 ${ctx.plate} 계약이 등록됐습니다.`,
    ``,
    `내 계약 조회:`,
    customerLookupUrl(ctx.plate, ctx.customerIdent),
  ].join('\n');
}

/** 미납 알림. */
export function overdueContent(ctx: SmsTemplateContext): string {
  const co = ctx.companyName ?? 'JPK렌터카';
  const amt = ctx.amount ? `${ctx.amount.toLocaleString('ko-KR')}원` : '';
  const cyc = ctx.cycle ? `${ctx.cycle}회차 ` : '';
  return [
    `[${co}] 납부 안내`,
    ``,
    `${ctx.customerName}님 차량 ${ctx.plate}`,
    `${cyc}${amt} 미납되었습니다.`,
    `빠른 납부 부탁드립니다.`,
    ``,
    `계약 조회:`,
    customerLookupUrl(ctx.plate, ctx.customerIdent),
  ].join('\n');
}

/** 만기 D-N 알림. */
export function expireContent(ctx: SmsTemplateContext): string {
  const co = ctx.companyName ?? 'JPK렌터카';
  const days = ctx.daysLeft ?? 0;
  const dueText = ctx.endDate ? ` (${ctx.endDate})` : '';
  const phoneText = ctx.companyPhone ? `\n연장/반납 문의: ${ctx.companyPhone}` : '';
  return [
    `[${co}] 만기 안내`,
    ``,
    `${ctx.customerName}님 차량 ${ctx.plate}`,
    `만기까지 ${days}일 남았습니다${dueText}.${phoneText}`,
    ``,
    `계약 조회:`,
    customerLookupUrl(ctx.plate, ctx.customerIdent),
  ].join('\n');
}

/** 검사 만기 D-N 알림. */
export function inspectionContent(ctx: SmsTemplateContext): string {
  const co = ctx.companyName ?? 'JPK렌터카';
  const days = ctx.daysLeft ?? 0;
  const dueText = ctx.endDate ? ` (${ctx.endDate})` : '';
  const phoneText = ctx.companyPhone ? `\n검사 안내: ${ctx.companyPhone}` : '';
  return [
    `[${co}] 검사 안내`,
    ``,
    `${ctx.customerName}님 차량 ${ctx.plate}`,
    `자동차검사까지 ${days}일 남았습니다${dueText}.`,
    `미수검 시 과태료가 부과됩니다.${phoneText}`,
    ``,
    `계약 조회:`,
    customerLookupUrl(ctx.plate, ctx.customerIdent),
  ].join('\n');
}

/** 보험 만기 D-N 알림. */
export function insuranceContent(ctx: SmsTemplateContext): string {
  const co = ctx.companyName ?? 'JPK렌터카';
  const days = ctx.daysLeft ?? 0;
  const dueText = ctx.endDate ? ` (${ctx.endDate})` : '';
  const phoneText = ctx.companyPhone ? `\n보험 갱신 문의: ${ctx.companyPhone}` : '';
  return [
    `[${co}] 보험 만기 안내`,
    ``,
    `${ctx.customerName}님 차량 ${ctx.plate}`,
    `보험 만기까지 ${days}일 남았습니다${dueText}.${phoneText}`,
    ``,
    `계약 조회:`,
    customerLookupUrl(ctx.plate, ctx.customerIdent),
  ].join('\n');
}

/** 템플릿별 dispatcher. custom 은 따로 직원이 작성. */
export function renderTemplate(kind: SmsTemplateKind, ctx: SmsTemplateContext): string {
  switch (kind) {
    case 'welcome':    return welcomeContent(ctx);
    case 'overdue':    return overdueContent(ctx);
    case 'expire':     return expireContent(ctx);
    case 'inspection': return inspectionContent(ctx);
    case 'insurance':  return insuranceContent(ctx);
    case 'custom':     return '';
  }
}
