import { generateContractSchedule, type Contract } from './sample-contracts';
import { todayStr } from './date-utils';

/**
 * 계약 등록 시 events 생성 — /dev 일괄 import 의 미수 처리용.
 *
 * /contract 단건 등록 (ContractRegisterDialog) 은 미수 입력칸 X — 항상 자동생성
 * (시작일·만기일·월대여료 → generateContractSchedule, 모든 회차 '예정').
 * 운영 도중 회차 완료 처리는 schedule 페이지에서 토글 또는 자금일보 매칭.
 *
 * /dev 일괄 import 만 "미수회차" 컬럼 사용 — 마이그레이션 진입성 확보.
 *
 * 미수회차 입력 정책 (overdueCyclesRaw):
 *   "5"              → 5회차부터 미수 (1~4 완료, 5 이상 미수) — 가장 흔한 케이스
 *   "3,4,5"          → 명시 회차만 미수 (드문 비연속 케이스)
 *   ""               → 자동: 도래분 모두 완료, 미도래 예정
 *   "0" 또는 "없음"  → 미수 없음 (모든 회차 완료)
 *
 * 출고/반납 events: 도래했으면 자동 완료 (운영 진입 가정).
 */

export type OverduePolicy =
  | { kind: 'auto' }                            // 도래 = 완료, 미도래 = 예정
  | { kind: 'all-paid' }                        // 모두 완료
  | { kind: 'from'; startCycle: number }        // N 회차부터 미수 (가장 일반)
  | { kind: 'list'; cycles: number[] };         // 명시된 회차만 미수 (비연속)

export function parseOverduePolicy(raw: string | undefined): OverduePolicy {
  const t = (raw ?? '').trim();
  if (!t) return { kind: 'auto' };
  if (t === '0' || t === '없음' || t.toLowerCase() === 'none') return { kind: 'all-paid' };
  const tokens = t.split(',').map((s) => s.trim()).filter(Boolean);
  const cycles = tokens
    .map((s) => Number(s.replace(/회차?$/, '')))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (cycles.length === 0) return { kind: 'auto' };
  // 단일 숫자 → "이 회차부터 미수" (그 앞 자동 완료)
  if (cycles.length === 1) return { kind: 'from', startCycle: cycles[0] };
  return { kind: 'list', cycles };
}

/**
 * 시작일/만기일/월대여료 + 미수회차 정책으로 events 배열 생성.
 *
 * 단순 신규 계약 (overdueCyclesRaw 비어있고 시작일도 미래) 이면 결과적으로
 * 모든 회차가 '예정' — generateContractSchedule 와 동일.
 */
export function buildEventsWithOverdue(
  startDate: string,
  endDate: string,
  monthlyAmount: number,
  overdueCyclesRaw: string | undefined,
  opts: { autopayDay?: number; engineOilService?: boolean } = {},
): Contract['events'] {
  const events = generateContractSchedule(startDate, endDate, monthlyAmount, opts);
  if (events.length === 0) return [];
  const today = todayStr();
  const policy = parseOverduePolicy(overdueCyclesRaw);

  return events.map((e) => {
    if (e.type !== '수납') {
      // 출고/반납 — 도래했으면 자동 완료
      if (e.dueDate <= today) return { ...e, status: '완료' as const, doneDate: e.dueDate };
      return e;
    }
    const cyc = e.cycle ?? 0;
    const due = e.dueDate;
    // 마이그레이션 — 정확한 입금일 모르니 일단 "제날짜에 수납"한 것으로 doneDate=dueDate.
    // 운영 도중 실제 입금일 알게 되면 schedule 페이지의 inline date input 으로 보충 입력.
    if (policy.kind === 'all-paid') return { ...e, status: '완료' as const, doneDate: due };
    if (policy.kind === 'from') {
      if (cyc < policy.startCycle) return { ...e, status: '완료' as const, doneDate: due };
      if (due < today) return { ...e, status: '지연' as const };
      return e;
    }
    if (policy.kind === 'list') {
      if (policy.cycles.includes(cyc)) {
        if (due < today) return { ...e, status: '지연' as const };
        return e;
      }
      if (due <= today) return { ...e, status: '완료' as const, doneDate: due };
      return e;
    }
    // auto — 도래분 모두 제날짜 수납 처리
    if (due <= today) return { ...e, status: '완료' as const, doneDate: due };
    return e;
  });
}
