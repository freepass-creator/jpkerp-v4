'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { PencilSimple, Copy, Trash, PaperPlaneTilt, User, Car, ClipboardText, Truck, CreditCard, Wrench, ShieldCheck, NotePencil, Paperclip, FileText, IdentificationCard, UploadSimple } from '@phosphor-icons/react';
import { fileToDataUrl } from '@/lib/image-compress';
import type { Asset } from '@/lib/sample-assets';
import type { InsurancePolicy } from '@/lib/sample-insurance';
import { PageShell } from '@/components/layout/page-shell';
import { CONTRACT_SUBTABS } from '@/lib/contract-subtabs';
import { useAssetStore } from '@/lib/use-asset-store';
import { useContractStore } from '@/lib/use-contract-store';
import { useCompanyStore } from '@/lib/use-company-store';
import { useCustomerStore } from '@/lib/use-customer-store';
import { useInsuranceStore } from '@/lib/use-insurance-store';
import { findCustomerMatch, type Customer } from '@/lib/sample-customers';
import { SmsSendDialog } from '@/components/sms/sms-send-dialog';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { activeContracts, type Contract, type CustomerKind } from '@/lib/sample-contracts';
import { buildEventsWithOverdue, buildEventsWithOutstanding } from '@/lib/contract-events';
import { activeAssets } from '@/lib/sample-assets';
import { EntityFormDialog, type FieldSection, type EntityDialogMode } from '@/components/ui/entity-form-dialog';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { JpkTable, type JpkColumn, type JpkTableApi } from '@/components/shared/jpk-table';
import { EmptyState } from '@/components/ui/empty-state';
import { useTopbarSearch } from '@/lib/use-topbar-search';
import { nextDateScopedCode, nextCompanyScopedCode } from '@/lib/code-gen';
import { ContractRegisterDialog } from '@/components/contract/contract-register-dialog';
import { useAuditStamp } from '@/lib/audit-fields';
import { useConfirmWithEmail } from '@/lib/confirm-with-email';
import { genId } from '@/lib/ids';
import { cn } from '@/lib/cn';

/** 수정·복사용 폼 — 섹션 단위. 등록은 ContractRegisterDialog 사용.
 *  순서: 사람(인적사항) → 차량 → 조건/기간 → 운영(인도반납/결제/정비/보험) → 기타 약정.
 */
const BOOLEAN_TRISTATE_OPTIONS = ['가입', '미가입'];

const CONTRACT_BASE_SECTIONS: FieldSection[] = [
  {
    title: '계약자 인적사항',
    icon: User,
    fields: [
      { key: 'customerName',      label: '고객명',         required: true },
      { key: 'customerKind',      label: '신분',           type: 'select', options: ['개인', '사업자', '법인'], required: true },
      { key: 'customerIdent',     label: '고객등록번호',   required: true },
      { key: 'customerPhone',     label: '연락처',         required: true, placeholder: '010-0000-0000' },
      { key: 'customerLicenseNo', label: '운전면허번호',   placeholder: '00-00-000000-00' },
      { key: 'customerEmail',     label: '이메일',         placeholder: 'name@example.com' },
      { key: 'customerAddress',   label: '실거주지',       colSpan: 3 },
      { key: 'emergencyPhone',    label: '비상연락처',     placeholder: '010-0000-0000' },
      { key: 'emergencyRelation', label: '비상연락처 관계', placeholder: '부/모/배우자/자녀' },
    ],
  },
  {
    title: '계약 차량 정보',
    icon: Car,
    fields: [
      { key: 'companyCode', label: '회사코드',  required: true, readOnly: true },
      { key: 'contractNo',  label: '계약번호',  readOnly: true },
      { key: 'plate',       label: '차량번호',  required: true },
      // ↓ 매칭 자산에서 derived (readOnly) — 손님페이지·등록증과 동기
      { key: 'assetVehicleClass', label: '차종 (자산)',   readOnly: true },
      { key: 'assetVehicleName',  label: '차명 (자산)',   readOnly: true },
      { key: 'assetModelName',    label: '모델명 (자산)', readOnly: true },
      { key: 'assetManufactureDate', label: '제작연월 (자산)', readOnly: true },
      { key: 'assetExteriorColor', label: '외부색상 (자산)', readOnly: true },
      { key: 'assetVin',          label: '차대번호 (자산)', readOnly: true, colSpan: 2 },
    ],
  },
  {
    title: '계약 조건 · 기간',
    icon: ClipboardText,
    fields: [
      { key: 'contractDate',             label: '계약일',                  type: 'date' },
      { key: 'startDate',                label: '시작일',                  type: 'date', required: true },
      { key: 'endDate',                  label: '만기일',                  type: 'date', required: true },
      { key: 'monthlyAmount',            label: '월 청구액 (원)',          type: 'number' },
      { key: 'deposit',                  label: '보증금 (원)',             type: 'number' },
      { key: 'advancePayment',           label: '선수금 (원)',             type: 'number' },
      { key: 'purchaseOptionAmount',     label: '만기 인수가격',           placeholder: '만기협의 / 숫자' },
      { key: 'initialMileageKm',         label: '인수 시점 주행거리 (km)', type: 'number' },
      { key: 'driverScope',              label: '운전자 범위',             type: 'select', options: ['누구나운전', '가족한정', '임직원한정', '1인지정'] },
      { key: 'driverAgeLimit',           label: '연령 제한',               placeholder: '예: 만 26세 이상' },
      { key: 'mileageLimitKm',           label: '연간 주행 한도 (km)',     type: 'number', placeholder: '0=무제한' },
      { key: 'excessMileageFeeKr',       label: '초과 km당 (국산, 원)',    type: 'number' },
      { key: 'excessMileageFeeForeign',  label: '초과 km당 (수입, 원)',    type: 'number' },
    ],
  },
  {
    title: '결제 · 자동이체',
    icon: CreditCard,
    fields: [
      { key: 'paymentMethod',    label: '결제 방법',          placeholder: '자동이체 / 계좌이체 / 카드' },
      { key: 'paymentDay',       label: '결제일 (1-31)',      type: 'number' },
      { key: 'paymentBank',      label: '입금 은행' },
      { key: 'paymentAccount',   label: '입금 계좌번호' },
      { key: 'paymentHolder',    label: '입금 예금주' },
      { key: 'autoDebitBank',    label: '출금 은행 (CMS)' },
      { key: 'autoDebitAccount', label: '출금 계좌번호 (CMS)' },
      { key: 'autoDebitHolder',  label: '출금 예금주 (CMS)' },
    ],
  },
  {
    title: '정비 · 서비스',
    icon: Wrench,
    fields: [
      { key: 'maintenanceProduct', label: '정비상품',         placeholder: '정비제외 / 엔진오일 연1회 등', colSpan: 3 },
      { key: 'engineOilService',   label: '엔진오일 서비스',  type: 'select', options: BOOLEAN_TRISTATE_OPTIONS },
      { key: 'inspectionService',  label: '검사대행',         type: 'select', options: BOOLEAN_TRISTATE_OPTIONS },
    ],
  },
  {
    title: '보험',
    icon: ShieldCheck,
    fields: [
      { key: 'insurer',        label: '보험사',                       placeholder: '예: DB손해보험' },
      { key: 'deductibleMin',  label: '자차 면책금 최소 (만원)',      type: 'number' },
      { key: 'deductibleMax',  label: '자차 면책금 최대 (만원)',      type: 'number' },
      { key: 'deductibleRate', label: '자차 면책 비율 (0.2 = 20%)',   type: 'number' },
    ],
  },
  {
    title: '인도 · 반납',
    icon: Truck,
    fields: [
      { key: 'deliveryAddress', label: '인도 장소' },
      { key: 'returnAddress',   label: '반납 장소' },
    ],
  },
  {
    title: '기타 약정 (승계 · 특약)',
    icon: NotePencil,
    fields: [
      { key: 'predecessorName',      label: '양도인 이름' },
      { key: 'predecessorPhone',     label: '양도인 연락처' },
      { key: 'succeededAt',          label: '승계일자',         type: 'date' },
      { key: 'specialTerms',         label: '특약사항 (개행 보존)', type: 'textarea', colSpan: 3 },
    ],
  },
  // 추가 운전자(additionalDrivers)는 배열 — 별도 UI 필요 (미구현). 추후 별도 섹션 또는 별도 다이얼로그.
];

const CONTRACT_EDIT_SECTIONS: FieldSection[] = CONTRACT_BASE_SECTIONS;

const CONTRACT_DUPLICATE_SECTIONS: FieldSection[] = CONTRACT_BASE_SECTIONS.map((section) => {
  if (section.title !== '계약 차량 정보') return section;
  return {
    ...section,
    fields: section.fields.map((f) =>
      f.key === 'companyCode' ? { ...f, readOnly: false } :
      f.key === 'contractNo'  ? { ...f, readOnly: false, placeholder: '비워두면 자동 (C2605060001)' } : f,
    ),
  };
});

export default function ContractListPage() {
  const [allContracts, setContracts, contractsReady] = useContractStore();
  const [allAssets, setAssets] = useAssetStore();
  const [customers, setCustomers] = useCustomerStore();
  // active 만 — 소프트 삭제는 목록·집계에서 제외 (코드는 영구 보존)
  const contracts = useMemo(() => activeContracts(allContracts), [allContracts]);
  const assets = useMemo(() => activeAssets(allAssets), [allAssets]);
  const { search } = useTopbarSearch();
  const [selected, setSelected] = useState<Contract | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const confirmWithEmail = useConfirmWithEmail();
  const [editOpen, setEditOpen] = useState(false);
  const [editMode, setEditMode] = useState<EntityDialogMode>('view');
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState({ open: false, x: 0, y: 0 });
  const audit = useAuditStamp();
  const [companies] = useCompanyStore();
  const [insurances] = useInsuranceStore();
  const selectedCompany = useMemo(
    () => (selected ? companies.find((c) => c.code === selected.companyCode) ?? null : null),
    [companies, selected],
  );
  const matchedInsurance = useMemo(
    () => (selected
      ? insurances.find((p) => !p.deletedAt && p.carNumber === selected.plate && (!p.companyCode || p.companyCode === selected.companyCode)) ?? null
      : null),
    [insurances, selected],
  );

  const totals = useMemo(() => {
    const totalAssets = assets.filter((a) => a.status !== '매각' && a.status !== '등록예정').length;
    const active = contracts.filter((c) => c.status === '운행중').length;
    return { totalAssets, active, idle: totalAssets - active };
  }, [contracts, assets]);

  /** 계약현황은 종료(만기/해지) 제외 — 종료 계약은 /contract/ended 에서 관리. */
  const visibleContracts = useMemo(
    () => contracts.filter((c) => c.status !== '만기' && c.status !== '해지'),
    [contracts],
  );

  /**
   * ContractDraft → Contract 완성 + 수납 스케줄 자동 생성.
   *
   * 우선순위:
   *   1) outstandingAmount (현재 미수금) → buildEventsWithOutstanding
   *      가장 최근 도래 회차부터 거꾸로 차감 — 부분납입 회차에 자동 note 부여
   *   2) overdueCycles (legacy 자유표기 "5-" / "3,5") → buildEventsWithOverdue
   *   3) 둘 다 없으면 도래 회차 모두 완료 (auto)
   */
  function fromDraft(draft: Omit<Contract, 'id' | 'contractNo' | 'status' | 'events'> & { outstandingAmount?: number; overdueCycles?: string }): Contract {
    const { outstandingAmount, overdueCycles, ...rest } = draft;
    const opts = { autopayDay: rest.paymentDay, engineOilService: rest.engineOilService };
    const events = outstandingAmount != null && outstandingAmount > 0
      ? buildEventsWithOutstanding(rest.startDate, rest.endDate, rest.monthlyAmount, outstandingAmount, opts)
      : buildEventsWithOverdue(rest.startDate, rest.endDate, rest.monthlyAmount, overdueCycles, opts);
    return {
      id: genId('c'),
      contractNo: nextDateScopedCode('C', contracts.map((c) => c.contractNo), { date: rest.startDate || undefined }),
      ...rest,
      status: '운행중',
      events,
    };
  }

  /**
   * 계약 등록/수정 시 고객 매칭 — 기존 고객이면 코드 재사용 + 정보 갱신, 없으면 신규 발급.
   * 반환: 사용할 customerCode. customer master mutation 은 내부에서 처리 (audit 포함).
   */
  function resolveCustomerCode(args: {
    companyCode: string;
    name: string;
    kind: CustomerKind;
    ident: string;
    phone: string;
    licenseNo?: string;
    email?: string;
  }): string {
    const matched = findCustomerMatch(customers, args.companyCode, args.ident, args.phone);
    if (matched) {
      // 정보 변동 있으면 master 갱신 — 마지막 계약 시점 정보로.
      const changed =
        matched.name !== args.name ||
        matched.kind !== args.kind ||
        (matched.ident ?? '') !== args.ident ||
        matched.phone !== args.phone ||
        (matched.licenseNo ?? '') !== (args.licenseNo ?? '') ||
        (matched.email ?? '') !== (args.email ?? '');
      if (changed) {
        const updated: Customer = {
          ...matched,
          name: args.name,
          kind: args.kind,
          ident: args.ident || matched.ident,
          phone: args.phone || matched.phone,
          licenseNo: args.licenseNo ?? matched.licenseNo,
          email: args.email ?? matched.email,
          ...audit.update(),
        };
        setCustomers((prev) => prev.map((c) => (c.code === matched.code ? updated : c)));
        audit.log({ action: 'update', entityType: 'customer', entityId: updated.code, label: updated.name, before: matched, after: updated });
      }
      return matched.code;
    }
    const code = nextCompanyScopedCode('CU', args.companyCode, customers.map((c) => c.code), { pad: 4 });
    const created: Customer = {
      code,
      companyCode: args.companyCode,
      name: args.name,
      kind: args.kind,
      ident: args.ident || undefined,
      phone: args.phone,
      licenseNo: args.licenseNo,
      email: args.email,
      ...audit.create(),
    };
    setCustomers((prev) => [...prev, created]);
    audit.log({ action: 'create', entityType: 'customer', entityId: created.code, label: created.name, after: created });
    return code;
  }

  /** 수정/복사 폼 record → Contract — 등록은 ContractRegisterDialog 가 처리. */
  function fromFormRecord(d: Record<string, string>): Contract {
    const startDate = d.startDate || new Date().toISOString().slice(0, 10);
    const contractNo = d.contractNo?.trim() || nextDateScopedCode('C', contracts.map((c) => c.contractNo), { date: startDate });
    const endDate = d.endDate || '';
    const monthlyAmount = Number(d.monthlyAmount) || 0;
    const mileageRaw = Number(d.mileageLimitKm);
    const paymentDayRaw = Number(d.paymentDay);
    const numOpt = (s: string | undefined): number | undefined => {
      if (!s || !s.trim()) return undefined;
      const n = Number(s);
      return Number.isFinite(n) ? n : undefined;
    };
    const boolOpt = (s: string | undefined): boolean | undefined =>
      s === '가입' || s === 'true' ? true
      : s === '미가입' || s === 'false' ? false
      : undefined;
    const paymentDay = Number.isFinite(paymentDayRaw) && paymentDayRaw >= 1 && paymentDayRaw <= 31
      ? paymentDayRaw
      : undefined;
    const engineOilService = boolOpt(d.engineOilService);
    return {
      id: genId('c'),
      companyCode: d.companyCode || '',
      contractNo,
      plate: d.plate || '',
      customerName: d.customerName || '',
      customerKind: (d.customerKind as CustomerKind) || '개인',
      customerIdent: d.customerIdent || '',
      customerPhone: d.customerPhone || '',
      customerLicenseNo: d.customerLicenseNo?.trim() || undefined,
      customerEmail:     d.customerEmail?.trim() || undefined,
      customerAddress:   d.customerAddress?.trim() || undefined,
      emergencyPhone:    d.emergencyPhone?.trim() || undefined,
      emergencyRelation: d.emergencyRelation?.trim() || undefined,
      startDate,
      endDate,
      contractDate: d.contractDate?.trim() || undefined,
      monthlyAmount,
      deposit: Number(d.deposit) || 0,
      advancePayment: numOpt(d.advancePayment),
      status: '운행중',
      driverScope:    d.driverScope?.trim() || undefined,
      driverAgeLimit: d.driverAgeLimit?.trim() || undefined,
      mileageLimitKm: Number.isFinite(mileageRaw) && mileageRaw > 0 ? mileageRaw : undefined,
      excessMileageFeeKr:      numOpt(d.excessMileageFeeKr),
      excessMileageFeeForeign: numOpt(d.excessMileageFeeForeign),
      initialMileageKm:        numOpt(d.initialMileageKm),
      deliveryAddress: d.deliveryAddress?.trim() || undefined,
      returnAddress:   d.returnAddress?.trim() || undefined,
      paymentMethod:   d.paymentMethod?.trim() || undefined,
      paymentDay,
      paymentBank:     d.paymentBank?.trim() || undefined,
      paymentAccount:  d.paymentAccount?.trim() || undefined,
      paymentHolder:   d.paymentHolder?.trim() || undefined,
      autoDebitBank:    d.autoDebitBank?.trim() || undefined,
      autoDebitAccount: d.autoDebitAccount?.trim() || undefined,
      autoDebitHolder:  d.autoDebitHolder?.trim() || undefined,
      maintenanceProduct: d.maintenanceProduct?.trim() || undefined,
      engineOilService,
      inspectionService: boolOpt(d.inspectionService),
      insurer:        d.insurer?.trim() || undefined,
      deductibleMin:  numOpt(d.deductibleMin),
      deductibleMax:  numOpt(d.deductibleMax),
      deductibleRate: numOpt(d.deductibleRate),
      predecessorName:  d.predecessorName?.trim() || undefined,
      predecessorPhone: d.predecessorPhone?.trim() || undefined,
      succeededAt:      d.succeededAt?.trim() || undefined,
      purchaseOptionAmount: d.purchaseOptionAmount?.trim() || undefined,
      specialTerms:    d.specialTerms?.trim() || undefined,
      events: buildEventsWithOverdue(startDate, endDate, monthlyAmount, undefined, {
        autopayDay: paymentDay,
        engineOilService,
      }),
    };
  }

  function handleCreate(draft: Omit<Contract, 'id' | 'contractNo' | 'status' | 'events'>) {
    const customerCode = resolveCustomerCode({
      companyCode: draft.companyCode,
      name: draft.customerName,
      kind: draft.customerKind,
      ident: draft.customerIdent,
      phone: draft.customerPhone,
      licenseNo: draft.customerLicenseNo,
      email: draft.customerEmail,
    });
    const contract: Contract = { ...fromDraft({ ...draft, customerCode }), ...audit.create() };
    setContracts((prev) => [contract, ...prev]);
    audit.log({ action: 'create', entityType: 'contract', entityId: contract.id, label: contract.contractNo, after: contract });
    // cascade: 자산 상태 전환 — '등록예정' → '대기' (출고 대기). 이미 운행중/정비/매각이면 손대지 않음.
    setAssets((prev) => prev.map((a) =>
      a.plate === contract.plate && a.companyCode === contract.companyCode && a.status === '등록예정'
        ? { ...a, status: '대기' as const, ...audit.update() }
        : a,
    ));
    // 환영 SMS — fire-and-forget (실패해도 등록 흐름엔 영향 X)
    void sendWelcomeSms(contract.id);
  }

  function handleUpdate(d: Record<string, string>) {
    if (!selected) return;
    const base = fromFormRecord(d);
    // 기존 customerCode 유지 (이미 발급됐으면 변경 X). 없으면 매칭/신규 발급.
    // 정보 갱신은 master 에 반영 (resolveCustomerCode 내부에서 처리).
    const customerCode = selected.customerCode ?? resolveCustomerCode({
      companyCode: base.companyCode,
      name: base.customerName,
      kind: base.customerKind,
      ident: base.customerIdent,
      phone: base.customerPhone,
      licenseNo: base.customerLicenseNo,
      email: base.customerEmail,
    });
    // 이미 customerCode 가 있을 때도 master 정보 변경분 반영 (이름/연락처/이메일/면허 변경 등).
    if (selected.customerCode) {
      const existing = customers.find((c) => c.code === selected.customerCode);
      if (existing) {
        const changed =
          existing.name !== base.customerName ||
          existing.kind !== base.customerKind ||
          (existing.ident ?? '') !== base.customerIdent ||
          existing.phone !== base.customerPhone ||
          (existing.licenseNo ?? '') !== (base.customerLicenseNo ?? '') ||
          (existing.email ?? '') !== (base.customerEmail ?? '');
        if (changed) {
          const updatedCust: Customer = {
            ...existing,
            name: base.customerName,
            kind: base.customerKind,
            ident: base.customerIdent || existing.ident,
            phone: base.customerPhone || existing.phone,
            licenseNo: base.customerLicenseNo ?? existing.licenseNo,
            email: base.customerEmail ?? existing.email,
            ...audit.update(),
          };
          setCustomers((prev) => prev.map((c) => (c.code === existing.code ? updatedCust : c)));
          audit.log({ action: 'update', entityType: 'customer', entityId: updatedCust.code, label: updatedCust.name, before: existing, after: updatedCust });
        }
      }
    }
    const updated: Contract = { ...selected, ...base, id: selected.id, contractNo: selected.contractNo, customerCode, events: selected.events, ...audit.update() };
    setContracts((prev) => prev.map((c) => (c.id === selected.id ? updated : c)));
    setSelected(updated);
    audit.log({ action: 'update', entityType: 'contract', entityId: updated.id, label: updated.contractNo, before: selected, after: updated });
    setEditOpen(false);
  }

  function handleDuplicate(d: Record<string, string>) {
    // 재계약 — 원본의 customerCode 유지 (같은 고객의 새 계약).
    const base = fromFormRecord(d);
    const customerCode = selected?.customerCode
      ?? resolveCustomerCode({
        companyCode: base.companyCode,
        name: base.customerName,
        kind: base.customerKind,
        ident: base.customerIdent,
        phone: base.customerPhone,
        licenseNo: base.customerLicenseNo,
        email: base.customerEmail,
      });
    const dup: Contract = { ...base, customerCode, ...audit.create() };
    setContracts((prev) => [dup, ...prev]);
    audit.log({ action: 'create', entityType: 'contract', entityId: dup.id, label: dup.contractNo, after: dup });
    setDuplicateOpen(false);
  }

  /** 새 계약 환영 SMS — fire-and-forget. 인증 토큰 자동 첨부, 서버에서 중복 방지. */
  async function sendWelcomeSms(contractId: string) {
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      // RTDB write 가 반영될 때까지 살짝 대기 (eventually consistent)
      await new Promise((r) => setTimeout(r, 800));
      const res = await fetch('/api/sms/welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ contractId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        console.warn('[welcome-sms] failed', json);
      }
    } catch (e) {
      console.warn('[welcome-sms] error', e);
    }
  }

  function handleDelete() {
    if (!selected) return;
    if (!confirmWithEmail(
      '계약 삭제',
      `${selected.contractNo} · ${selected.customerName} · ${selected.plate}\n(계약번호는 영구 보존 — 재발급 안 됨)`,
    )) return;
    setContracts((prev) => prev.map((c) => c.id === selected.id ? { ...c, ...audit.delete() } : c));
    audit.log({ action: 'delete', entityType: 'contract', entityId: selected.id, label: selected.contractNo, before: selected });
    setSelected(null);
  }

  /** 선택 행 일괄 소프트삭제 — 본인 이메일 입력 확인. */
  function handleDeleteSelected() {
    if (selectedIds.size === 0) {
      alert('선택된 행이 없습니다. 좌측 체크박스로 선택하세요.');
      return;
    }
    const rows = contracts.filter((c) => selectedIds.has(c.id));
    const summary = rows.slice(0, 5).map((c) => `· ${c.contractNo} ${c.plate} ${c.customerName}`).join('\n')
      + (rows.length > 5 ? `\n... 외 ${rows.length - 5}건` : '');
    if (!confirmWithEmail(`계약 선택 ${selectedIds.size}건 삭제`, summary)) return;
    const stamp = audit.delete();
    setContracts((prev) => prev.map((c) => selectedIds.has(c.id) ? { ...c, ...stamp } : c));
    audit.log({
      action: 'delete', entityType: 'contract', entityId: 'batch',
      label: `계약 일괄 삭제 ${selectedIds.size}건`,
      after: { count: selectedIds.size, contractNos: rows.map((r) => r.contractNo) },
    });
    setSelectedIds(new Set());
    setSelected(null);
    alert(`${rows.length}건 삭제 완료.`);
  }

  const boolToOpt = (b: boolean | undefined): string => b === true ? '가입' : b === false ? '미가입' : '';
  const numToOpt = (n: number | undefined): string => (typeof n === 'number' && Number.isFinite(n)) ? String(n) : '';
  // 매칭 자산 (계약 차량 정보 derived 표시 + 첨부 등록증 미리보기용)
  const matchedAsset = useMemo(
    () => (selected ? assets.find((a) => a.plate === selected.plate && a.companyCode === selected.companyCode) ?? null : null),
    [assets, selected],
  );
  const editInitial: Record<string, string> = selected ? {
    companyCode: selected.companyCode,
    contractNo: selected.contractNo,
    plate: selected.plate,
    // 자산 derived (readOnly 표시) — 손님페이지·등록증과 동기화
    assetVehicleClass:    matchedAsset?.vehicleClass ?? '',
    assetVehicleName:     matchedAsset?.vehicleName ?? '',
    assetModelName:       matchedAsset?.modelName ?? matchedAsset?.detailModel ?? '',
    assetManufactureDate: matchedAsset?.manufactureDate ?? '',
    assetExteriorColor:   matchedAsset?.exteriorColor ?? '',
    assetVin:             matchedAsset?.vin ?? '',
    customerName: selected.customerName,
    customerKind: selected.customerKind,
    customerIdent: selected.customerIdent,
    customerPhone: selected.customerPhone,
    customerLicenseNo: selected.customerLicenseNo ?? '',
    customerEmail:     selected.customerEmail ?? '',
    customerAddress:   selected.customerAddress ?? '',
    emergencyPhone:    selected.emergencyPhone ?? '',
    emergencyRelation: selected.emergencyRelation ?? '',
    contractDate:  selected.contractDate ?? '',
    startDate: selected.startDate,
    endDate: selected.endDate,
    monthlyAmount: String(selected.monthlyAmount),
    deposit: String(selected.deposit ?? 0),
    advancePayment: numToOpt(selected.advancePayment),
    driverScope:    selected.driverScope ?? '',
    driverAgeLimit: selected.driverAgeLimit ?? '',
    mileageLimitKm: selected.mileageLimitKm ? String(selected.mileageLimitKm) : '',
    excessMileageFeeKr:      numToOpt(selected.excessMileageFeeKr),
    excessMileageFeeForeign: numToOpt(selected.excessMileageFeeForeign),
    initialMileageKm:        numToOpt(selected.initialMileageKm),
    deliveryAddress: selected.deliveryAddress ?? '',
    returnAddress:   selected.returnAddress ?? '',
    paymentMethod:   selected.paymentMethod ?? '',
    paymentDay:      selected.paymentDay ? String(selected.paymentDay) : '',
    paymentBank:     selected.paymentBank ?? '',
    paymentAccount:  selected.paymentAccount ?? '',
    paymentHolder:   selected.paymentHolder ?? '',
    autoDebitBank:    selected.autoDebitBank ?? '',
    autoDebitAccount: selected.autoDebitAccount ?? '',
    autoDebitHolder:  selected.autoDebitHolder ?? '',
    maintenanceProduct: selected.maintenanceProduct ?? '',
    engineOilService:   boolToOpt(selected.engineOilService),
    inspectionService:  boolToOpt(selected.inspectionService),
    insurer:        selected.insurer ?? '',
    deductibleMin:  numToOpt(selected.deductibleMin),
    deductibleMax:  numToOpt(selected.deductibleMax),
    deductibleRate: numToOpt(selected.deductibleRate),
    predecessorName:  selected.predecessorName ?? '',
    predecessorPhone: selected.predecessorPhone ?? '',
    succeededAt:      selected.succeededAt ?? '',
    purchaseOptionAmount: selected.purchaseOptionAmount ?? '',
    specialTerms:    selected.specialTerms ?? '',
  } : {};

  // 복사용 — 식별 필드 비움 (계약번호·차량·고객·연락처)
  const dupInitial: Record<string, string> = selected ? {
    ...editInitial,
    contractNo: '',
    customerName: '',
    customerIdent: '',
    customerPhone: '',
    plate: '',
  } : {};

  function openEdit(mode: EntityDialogMode) {
    if (!selected) return;
    setEditMode(mode);
    setEditOpen(true);
  }

  /** 계약서 PDF/이미지 첨부 — 즉시 저장 (저장 버튼 누르지 않아도 반영) */
  async function handleContractFileUpload(file: File) {
    if (!selected) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      const updated: Contract = { ...selected, fileDataUrl: dataUrl, fileName: file.name, ...audit.update() };
      setContracts((prev) => prev.map((c) => (c.id === selected.id ? updated : c)));
      setSelected(updated);
      audit.log({ action: 'update', entityType: 'contract', entityId: selected.id, label: `${selected.contractNo} 계약서 첨부 — ${file.name}` });
    } catch (e) {
      alert(`첨부 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function buildCtxItems(): ContextMenuItem[] {
    return [
      { label: '수정',     icon: <PencilSimple size={12} weight="bold" />, onClick: () => openEdit('edit') },
      { label: '복사',     icon: <Copy size={12} weight="bold" />,         onClick: () => setDuplicateOpen(true) },
      { label: '문자 발송', icon: <PaperPlaneTilt size={12} weight="bold" />, onClick: () => setSmsOpen(true) },
      { label: '삭제',     icon: <Trash size={12} weight="bold" />,        onClick: handleDelete, danger: true },
    ];
  }

  return (
    <>
      <PageShell
        subTabs={CONTRACT_SUBTABS}
       
        footerLeft={
          <>
            <span className="stat-item">전체 자산 <strong>{totals.totalAssets}</strong></span>
            <span className="stat-item">계약중 <strong>{totals.active}</strong></span>
            <span className="stat-item">휴차 <strong>{totals.idle}</strong></span>
            <span className="stat-divider" />
            <span className="stat-item">전체 계약 <strong>{contracts.length}</strong></span>
            {selected && (
              <>
                <span className="stat-divider" />
                <span className="stat-item">선택 <strong className="mono">{selected.contractNo}</strong></span>
              </>
            )}
          </>
        }
        footerRight={
          <>
            <button className="btn">엑셀</button>
            <button className="btn" disabled={!selected} onClick={() => openEdit('edit')}>
              <PencilSimple size={14} weight="bold" /> 수정
            </button>
            <button className="btn" disabled={!selected} onClick={() => setDuplicateOpen(true)}>
              <Copy size={14} weight="bold" /> 복사
            </button>
            <button className="btn" disabled={!selected} onClick={handleDelete}>
              <Trash size={14} weight="bold" /> 삭제
            </button>
            <button
              className="btn"
              disabled={selectedIds.size === 0}
              onClick={handleDeleteSelected}
              title="체크박스로 선택한 계약 일괄 삭제 (본인 이메일 확인 후)"
              style={{ color: selectedIds.size > 0 ? 'var(--alert-red, #dc2626)' : undefined }}
            >
              <Trash size={14} weight="bold" /> 선택 {selectedIds.size}건 삭제
            </button>
            <ContractRegisterDialog onCreate={handleCreate} />
          </>
        }
      >
        {!contractsReady ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-weak)', fontSize: 12 }}>
            데이터 로딩 중...
          </div>
        ) : visibleContracts.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="등록된 계약 없음"
            description="OCR / 시트 / 단건 3가지 모드로 계약을 등록할 수 있습니다."
            hint={<>① 우측 하단 [+ 계약등록] → 계약서 PDF 다중 OCR / 구글시트 다건 / 개별 입력 중 선택<br />② 차량번호 → 등록 자산과 자동 매칭, 임차인 → 이전 계약자 자동 채움<br />③ 등록 시 출고·매월 수납·반납 events 자동 생성 → 계약스케줄에서 처리</>}
          />
        ) : (
          <ContractGrid
            contracts={visibleContracts}
            selectedId={selected?.id}
            onRowClick={setSelected}
            onRowDoubleClick={(c) => { setSelected(c); setEditMode('view'); setEditOpen(true); }}
            onRowContextMenu={(c, x, y) => { setSelected(c); setCtxMenu({ open: true, x, y }); }}
            globalSearch={search}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
          />
        )}
      </PageShell>

      <ContextMenu open={ctxMenu.open} x={ctxMenu.x} y={ctxMenu.y}
        onClose={() => setCtxMenu({ open: false, x: 0, y: 0 })}
        items={selected ? buildCtxItems() : []} />

      <EntityFormDialog open={editOpen} onOpenChange={setEditOpen}
        title={editMode === 'view' ? `계약 상세 — ${selected?.contractNo ?? ''}` : `계약 수정 — ${selected?.contractNo ?? ''}`}
        mode={editMode}
        sections={CONTRACT_EDIT_SECTIONS} initial={editInitial}
        submitLabel="저장" onSubmit={handleUpdate}
        extraContent={selected ? (
          <ContractDocsPanel
            contract={selected}
            asset={matchedAsset}
            insurance={matchedInsurance}
            onContractFileUpload={handleContractFileUpload}
          />
        ) : undefined}
      />
      <EntityFormDialog open={duplicateOpen} onOpenChange={setDuplicateOpen}
        title="계약 복사 (스펙 복제)" mode="duplicate"
        sections={CONTRACT_DUPLICATE_SECTIONS} initial={dupInitial}
        onSubmit={handleDuplicate} />
      <SmsSendDialog open={smsOpen} onOpenChange={setSmsOpen}
        contract={selected} company={selectedCompany} />
    </>
  );
}

/**
 * 계약 상세 첨부 문서 패널 — 손님페이지(/customer/[plate]) 와 동일 데이터 노출.
 *  · 계약서 — Contract.fileDataUrl (업로드 가능)
 *  · 등록증 — 매칭 Asset.fileDataUrl (read-only)
 *  · 보험증권 — 매칭 InsurancePolicy.fileDataUrl (read-only)
 */
function ContractDocsPanel({
  contract, asset, insurance, onContractFileUpload,
}: {
  contract: Contract;
  asset: Asset | null;
  insurance: InsurancePolicy | null;
  onContractFileUpload: (file: File) => void | Promise<void>;
}) {
  return (
    <div className="form-section">
      <div className="form-section-title">
        <Paperclip size={13} weight="bold" />
        <span>첨부 문서 (손님페이지 동기)</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
        <DocCard
          icon={<FileText size={14} weight="bold" />}
          title="계약서"
          fileUrl={contract.fileDataUrl}
          fileName={contract.fileName}
          subtitle={contract.fileName ? undefined : '미첨부'}
          onUpload={onContractFileUpload}
        />
        <DocCard
          icon={<IdentificationCard size={14} weight="bold" />}
          title="등록증"
          fileUrl={asset?.fileDataUrl}
          fileName={asset?.fileName}
          subtitle={asset ? (asset.fileDataUrl ? '자산 등록 시 첨부됨' : '미첨부 — 자산에서 등록') : '매칭 자산 없음'}
        />
        <DocCard
          icon={<ShieldCheck size={14} weight="bold" />}
          title="보험증권"
          fileUrl={insurance?.fileDataUrl}
          fileName={insurance?.fileName}
          subtitle={
            insurance
              ? `${insurance.insurer ?? ''} ${insurance.policyNo ?? ''}`.trim() || (insurance.fileDataUrl ? '첨부됨' : '미첨부')
              : '매칭 보험 없음'
          }
        />
      </div>
    </div>
  );
}

function DocCard({
  icon, title, fileUrl, fileName, subtitle, onUpload,
}: {
  icon: React.ReactNode;
  title: string;
  fileUrl?: string;
  fileName?: string;
  subtitle?: string;
  onUpload?: (file: File) => void | Promise<void>;
}) {
  const isImage = fileUrl?.startsWith('data:image/');
  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 4,
      padding: 10,
      background: 'var(--bg-card)',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      minHeight: 200,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-medium)' }}>
        {icon}<span>{title}</span>
      </div>
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: fileUrl ? '#fff' : 'var(--bg-disabled, #f5f5f5)',
        border: fileUrl ? '1px solid var(--border)' : '1px dashed var(--border)',
        borderRadius: 4,
        minHeight: 120,
        overflow: 'hidden',
      }}>
        {fileUrl && isImage ? (
          <img src={fileUrl} alt={title} style={{ maxWidth: '100%', maxHeight: 120, objectFit: 'scale-down' }} />
        ) : fileUrl ? (
          <span className="text-weak text-xs" style={{ padding: 12 }}>PDF — 다운로드해서 보기</span>
        ) : (
          <span className="text-weak text-xs" style={{ padding: 12 }}>없음</span>
        )}
      </div>
      <div className="text-weak text-xs" style={{ minHeight: 16 }}>{subtitle ?? fileName ?? ''}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {fileUrl && (
          <a className="btn btn-sm" href={fileUrl} download={fileName ?? `${title}.bin`}>
            다운로드
          </a>
        )}
        {onUpload && (
          <label className="btn btn-sm" style={{ cursor: 'pointer' }}>
            <UploadSimple size={12} weight="bold" />
            <span>{fileUrl ? '교체' : '첨부'}</span>
            <input
              type="file"
              accept="image/*,application/pdf"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUpload(f);
                e.target.value = '';
              }}
            />
          </label>
        )}
      </div>
    </div>
  );
}

/**
 * 계약 행에 채워진 확장 정보 인디케이터 — 한글 1글자씩 6개 영역.
 * 운(운전조건) / 추(추가운전자) / 인(인도반납) / 결(결제) / 특(특약) / 파(계약서파일)
 * tooltip 으로 채워진 항목 라벨 노출.
 */
function ExtendedInfoCell({ contract }: { contract: Contract }) {
  const items = [
    { key: '운', has: !!(contract.driverScope || contract.driverAgeLimit || contract.mileageLimitKm), label: '운전조건' },
    { key: '추', has: (contract.additionalDrivers?.length ?? 0) > 0, label: '추가운전자' },
    { key: '인', has: !!(contract.deliveryAddress || contract.returnAddress), label: '인도/반납' },
    { key: '결', has: !!(contract.paymentMethod || contract.paymentDay), label: '결제' },
    { key: '특', has: !!contract.specialTerms, label: '특약' },
    { key: '파', has: !!contract.fileDataUrl, label: '계약서' },
  ];
  const filled = items.filter((i) => i.has).length;
  const tooltip = items.map((i) => `${i.label}${i.has ? ' ✓' : ' ·'}`).join(' / ');
  return (
    <span title={tooltip} style={{ display: 'inline-flex', gap: 2, fontSize: 11 }}>
      {items.map((i) => (
        <span
          key={i.key}
          style={{
            opacity: i.has ? 1 : 0.25,
            color: i.has ? 'var(--brand)' : 'var(--text-weak)',
            fontWeight: i.has ? 600 : 400,
          }}
        >
          {i.key}
        </span>
      ))}
      {filled === 0 && <span className="text-weak ml-1" style={{ fontSize: 10 }}>(기본)</span>}
    </span>
  );
}

/** 계약현황 그리드 — JpkTable 기반. 컬럼 헤더 set/range/date 필터. */
function ContractGrid({
  contracts, selectedId, onRowClick, onRowDoubleClick, onRowContextMenu, globalSearch,
  selectedIds, onSelectionChange,
}: {
  contracts: Contract[];
  selectedId?: string;
  onRowClick: (c: Contract) => void;
  onRowDoubleClick?: (c: Contract) => void;
  onRowContextMenu: (c: Contract, x: number, y: number) => void;
  globalSearch?: string;
  selectedIds?: ReadonlySet<string>;
  onSelectionChange?: (ids: Set<string>) => void;
}) {
  const tableRef = useRef<JpkTableApi<Contract> | null>(null);

  const columns = useMemo<JpkColumn<Contract>[]>(() => {
    const dimText = (v: unknown) => <span className="dim">{(v as string) || '-'}</span>;
    const monoDim = (v: unknown) => <span className="mono dim">{(v as string) || '-'}</span>;
    const truncateDim = (v: unknown) => <span className="dim truncate">{(v as string) || '-'}</span>;
    const numFmt = ({ value }: { value: unknown }) =>
      value && Number.isFinite(value) ? (value as number).toLocaleString('ko-KR') : '-';
    const boolBadge = (v: unknown) =>
      v === true ? <span className="dim">가입</span>
      : v === false ? <span className="dim">미가입</span>
      : <span className="text-muted">-</span>;

    return [
      /* ── 식별 ── */
      { headerName: '회사', field: 'companyCode', width: 80, filterable: true,
        cellRenderer: ({ value }) => <span className="plate">{value as string}</span> },
      { headerName: '차량번호', field: 'plate', width: 110, filterable: true,
        cellRenderer: ({ value }) => <span className="plate">{value as string}</span> },
      { headerName: '계약번호', field: 'contractNo', width: 130, filterable: true,
        cellRenderer: ({ value }) => <span className="mono text-medium">{value as string}</span> },
      { headerName: '상태', field: 'status', width: 80, filterable: true,
        cellRenderer: ({ value }) => (
          <span className={cn('badge', value === '운행중' ? 'badge-green' : value === '만기' ? 'badge-orange' : '')}>
            {value as string}
          </span>
        ) },

      /* ── 임차인 기본 ── */
      { headerName: '고객코드', field: 'customerCode', width: 110, filterable: true,
        cellRenderer: ({ value }) => <span className="mono text-medium">{(value as string) || '-'}</span> },
      { headerName: '고객명', field: 'customerName', width: 130, filterable: true },
      { headerName: '신분', field: 'customerKind', width: 80, filterable: true,
        cellRenderer: ({ value }) => dimText(value) },
      { headerName: '고객등록번호', field: 'customerIdent', width: 130,
        cellRenderer: ({ value }) => monoDim(value) },
      { headerName: '연락처', field: 'customerPhone', width: 130,
        cellRenderer: ({ value }) => monoDim(value) },

      /* ── 임차인 상세 ── */
      { headerName: '면허번호', field: 'customerLicenseNo', width: 130,
        cellRenderer: ({ value }) => monoDim(value) },
      { headerName: '이메일', field: 'customerEmail', width: 180,
        cellRenderer: ({ value }) => dimText(value) },
      { headerName: '실거주지', field: 'customerAddress', width: 220,
        cellRenderer: ({ value }) => truncateDim(value) },
      { headerName: '비상연락처', field: 'emergencyPhone', width: 120,
        cellRenderer: ({ value }) => monoDim(value) },
      { headerName: '비상관계', field: 'emergencyRelation', width: 80,
        cellRenderer: ({ value }) => dimText(value) },

      /* ── 기간/금액 ── */
      { headerName: '시작일', field: 'startDate', width: 110, filterType: 'date' },
      { headerName: '만기일', field: 'endDate', width: 110, filterType: 'date' },
      { headerName: '월 청구액', field: 'monthlyAmount', width: 110, align: 'right', filterType: 'range',
        filterStep: 100000, filterUnit: 10000, filterUnitLabel: '만원',
        valueFormatter: ({ value }) => (value as number)?.toLocaleString('ko-KR') ?? '0' },
      { headerName: '보증금', field: 'deposit', width: 110, align: 'right', filterType: 'range',
        filterStep: 1000000, filterUnit: 10000, filterUnitLabel: '만원',
        valueFormatter: ({ value }) => value ? (value as number).toLocaleString('ko-KR') : '-' },

      /* ── 운전 조건 ── */
      { headerName: '운전자 범위', field: 'driverScope', width: 110, filterable: true,
        cellRenderer: ({ value }) => dimText(value) },
      { headerName: '연령 제한', field: 'driverAgeLimit', width: 110,
        cellRenderer: ({ value }) => dimText(value) },
      { headerName: '주행한도(km)', field: 'mileageLimitKm', width: 110, align: 'right',
        valueFormatter: numFmt },
      { headerName: '초과km 국산', field: 'excessMileageFeeKr', width: 100, align: 'right',
        valueFormatter: numFmt },
      { headerName: '초과km 수입', field: 'excessMileageFeeForeign', width: 100, align: 'right',
        valueFormatter: numFmt },
      { headerName: '인수 km', field: 'initialMileageKm', width: 100, align: 'right',
        valueFormatter: numFmt },

      /* ── 인도/반납 ── */
      { headerName: '인도장소', field: 'deliveryAddress', width: 220,
        cellRenderer: ({ value }) => truncateDim(value) },
      { headerName: '반납장소', field: 'returnAddress', width: 220,
        cellRenderer: ({ value }) => truncateDim(value) },

      /* ── 결제 ── */
      { headerName: '결제방법', field: 'paymentMethod', width: 100, filterable: true,
        cellRenderer: ({ value }) => dimText(value) },
      { headerName: '결제일', field: 'paymentDay', width: 70, align: 'right',
        valueFormatter: ({ value }) => value ? `${value}일` : '-' },
      { headerName: '입금은행', field: 'paymentBank', width: 100,
        cellRenderer: ({ value }) => dimText(value) },
      { headerName: '입금계좌', field: 'paymentAccount', width: 150,
        cellRenderer: ({ value }) => monoDim(value) },
      { headerName: '입금예금주', field: 'paymentHolder', width: 110,
        cellRenderer: ({ value }) => dimText(value) },

      /* ── 자동이체(CMS) ── */
      { headerName: '출금은행', field: 'autoDebitBank', width: 100,
        cellRenderer: ({ value }) => dimText(value) },
      { headerName: '출금계좌', field: 'autoDebitAccount', width: 150,
        cellRenderer: ({ value }) => monoDim(value) },
      { headerName: '출금예금주', field: 'autoDebitHolder', width: 110,
        cellRenderer: ({ value }) => dimText(value) },

      /* ── 정비/서비스 ── */
      { headerName: '정비상품', field: 'maintenanceProduct', width: 150,
        cellRenderer: ({ value }) => truncateDim(value) },
      { headerName: '엔진오일', field: 'engineOilService', width: 80, filterable: true,
        cellRenderer: ({ value }) => boolBadge(value) },
      { headerName: '검사대행', field: 'inspectionService', width: 80, filterable: true,
        cellRenderer: ({ value }) => boolBadge(value) },

      /* ── 보험 ── */
      { headerName: '보험사', field: 'insurer', width: 130, filterable: true,
        cellRenderer: ({ value }) => dimText(value) },
      { headerName: '면책 최소(만원)', field: 'deductibleMin', width: 110, align: 'right',
        valueFormatter: numFmt },
      { headerName: '면책 최대(만원)', field: 'deductibleMax', width: 110, align: 'right',
        valueFormatter: numFmt },
      { headerName: '면책 비율', field: 'deductibleRate', width: 80, align: 'right',
        valueFormatter: ({ value }) => value ? `${(((value as number) * 100)).toFixed(0)}%` : '-' },

      /* ── 승계 ── */
      { headerName: '양도인', field: 'predecessorName', width: 100,
        cellRenderer: ({ value }) => dimText(value) },
      { headerName: '양도인 연락처', field: 'predecessorPhone', width: 130,
        cellRenderer: ({ value }) => monoDim(value) },
      { headerName: '승계일자', field: 'succeededAt', width: 110, filterType: 'date' },

      /* ── 인수옵션 / 특약 ── */
      { headerName: '만기 인수가격', field: 'purchaseOptionAmount', width: 130,
        cellRenderer: ({ value }) => dimText(value) },
      { headerName: '특약사항', field: 'specialTerms', width: 220,
        cellRenderer: ({ value }) => truncateDim(value) },

      /* ── 기타 인디케이터 ── */
      { headerName: '추가', field: 'extras', width: 90, sortable: false,
        cellRenderer: ({ data }) => <ExtendedInfoCell contract={data} /> },
    ];
  }, []);

  const getRowId = useCallback((c: Contract) => c.id, []);
  const handleRowContextMenu = useCallback((c: Contract, _i: number, ev: React.MouseEvent) => {
    onRowClick(c);
    onRowContextMenu(c, ev.clientX, ev.clientY);
  }, [onRowClick, onRowContextMenu]);

  return (
    <JpkTable<Contract>
      ref={tableRef}
      columns={columns}
      rows={contracts}
      getRowId={getRowId}
      selectedKey={selectedId}
      storageKey="contract.list"
      onRowClick={onRowClick}
      onRowDoubleClick={onRowDoubleClick ? (c) => onRowDoubleClick(c) : undefined}
      onRowContextMenu={handleRowContextMenu}
      globalSearch={globalSearch}
      selectable
      selectedIds={selectedIds}
      onSelectionChange={onSelectionChange}
    />
  );
}
