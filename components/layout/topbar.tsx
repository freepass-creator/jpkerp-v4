'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { MagnifyingGlass, CaretRight, User, Bell } from '@phosphor-icons/react';
import { MENU } from '@/lib/menu';
import { ASSET_SUBTABS } from '@/lib/asset-subtabs';
import { ADMIN_SUBTABS } from '@/lib/admin-subtabs';
import { CONTRACT_SUBTABS } from '@/lib/contract-subtabs';
import { FINANCE_SUBTABS } from '@/lib/finance-subtabs';

const ALL_SUBTABS = [...ASSET_SUBTABS, ...ADMIN_SUBTABS, ...CONTRACT_SUBTABS, ...FINANCE_SUBTABS];

/** 현재 경로에서 [메인메뉴, sub-tab, ...] breadcrumb 추출 */
function findBreadcrumb(pathname: string): string[] {
  for (const section of MENU) {
    for (const item of section.items) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
        const sub = ALL_SUBTABS
          .filter((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))
          .sort((a, b) => b.href.length - a.href.length)[0];
        const parts = [item.label];
        if (sub) parts.push(sub.label);
        const base = sub ? sub.href : item.href;
        const remainder = pathname.slice(base.length).replace(/^\/+/, '');
        if (remainder) {
          remainder.split('/').filter(Boolean).forEach((seg) => {
            parts.push(decodeURIComponent(seg));
          });
        }
        return parts;
      }
    }
  }
  return [];
}

/** 현재 경로에서 페이지별 검색 placeholder */
function searchPlaceholder(pathname: string): string {
  if (pathname.startsWith('/asset/insurance'))   return '보험사 / 증권번호 / 차량 검색';
  if (pathname.startsWith('/asset/loan'))        return '할부사 / 약정번호 / 차량 검색';
  if (pathname.startsWith('/asset/inspection'))  return '차량번호 / 검사구분 검색';
  if (pathname.startsWith('/asset/repair'))      return '수선번호 / 정비소 / 증상 검색';
  if (pathname.startsWith('/asset/gps'))         return '단말번호 / 차량번호 검색';
  if (pathname.startsWith('/asset/disposal'))    return '차량번호 / 매수자 검색';
  if (pathname.startsWith('/asset'))             return '차량번호 / 차명 / 차대번호 검색';

  if (pathname.startsWith('/contract/idle'))     return '차량번호 / 차명 검색';
  if (pathname.startsWith('/contract/customer')) return '임차인명 / 식별번호 / 차량 검색';
  if (pathname.startsWith('/contract/schedule')) return '계약번호 / 차량 / 고객 검색';
  if (pathname.startsWith('/contract/overdue'))  return '계약번호 / 차량 / 고객 검색';
  if (pathname.startsWith('/contract/return'))   return '계약번호 / 차량 / 고객 검색';
  if (pathname.startsWith('/contract/expire'))   return '계약번호 / 차량 / 고객 검색';
  if (pathname.startsWith('/contract'))          return '계약번호 / 차량 / 고객 검색';

  if (pathname.startsWith('/finance/autopay'))   return '거래처 / 등록번호 검색';
  if (pathname.startsWith('/finance/card'))      return '가맹점 / 승인번호 검색';
  if (pathname.startsWith('/finance/daily'))     return '날짜 / 계좌 검색';
  if (pathname.startsWith('/finance/receipt'))   return '계약 / 고객명 검색';
  if (pathname.startsWith('/finance/expense'))   return '거래처 / 적요 검색';
  if (pathname.startsWith('/finance/taxbill'))   return '거래처 / 승인번호 검색';
  if (pathname.startsWith('/finance'))           return '계좌 / 적요 / 상대계좌 검색';

  if (pathname.startsWith('/journal'))           return '일지번호 / 메모 / 차량 검색';
  if (pathname.startsWith('/pending'))           return '미결 항목 검색';
  if (pathname.startsWith('/admin/company'))     return '회사명 / 사업자번호 검색';
  if (pathname.startsWith('/admin/staff'))       return '사번 / 성명 / 부서 검색';
  if (pathname.startsWith('/admin/attendance'))  return '사번 / 성명 / 날짜 검색';
  if (pathname.startsWith('/admin/leave'))       return '사번 / 성명 / 휴가종류 검색';
  if (pathname.startsWith('/admin'))             return '회사 / 직원 검색';
  if (pathname.startsWith('/settings'))          return '설정 검색';

  return '검색';
}

export function Topbar() {
  const pathname = usePathname();
  const crumbs = findBreadcrumb(pathname);
  const placeholder = searchPlaceholder(pathname);
  const [keyword, setKeyword] = useState('');

  return (
    <header className="topbar">
      {/* 좌측 — 페이지별 검색 (통합검색은 추후 단축키로) */}
      <div className="relative" style={{ width: 320 }}>
        <MagnifyingGlass
          size={13}
          className="text-weak"
          style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
        />
        <input
          className="input w-full"
          style={{ paddingLeft: 28 }}
          placeholder={placeholder}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      {/* 가운데 — Breadcrumb (절대 가운데) */}
      <div className="topbar-breadcrumb">
        {crumbs.length > 0 ? (
          crumbs.map((c, i) => (
            <span key={i} className="topbar-crumb">
              {i > 0 && <CaretRight size={11} className="text-weak mx-1.5" />}
              <span className={i === crumbs.length - 1 ? 'text-medium text-main' : 'text-sub'}>{c}</span>
            </span>
          ))
        ) : (
          <span className="text-weak">대시보드</span>
        )}
      </div>

      {/* 우측 — 알림 + 로그인 */}
      <div className="ml-auto flex items-center gap-2">
        <button className="btn-ghost btn btn-icon" title="알림">
          <Bell size={14} />
        </button>
        <div className="topbar-user">
          <div className="topbar-user-avatar">
            <User size={12} weight="bold" />
          </div>
          <div className="leading-tight">
            <div className="text-medium">담당자</div>
            <div className="text-weak">staff@jpk.local</div>
          </div>
        </div>
      </div>
    </header>
  );
}
