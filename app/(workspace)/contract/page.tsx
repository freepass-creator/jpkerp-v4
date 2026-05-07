'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { PencilSimple, Copy, Trash, PaperPlaneTilt } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { CONTRACT_SUBTABS } from '@/lib/contract-subtabs';
import { useAssetStore } from '@/lib/use-asset-store';
import { useContractStore } from '@/lib/use-contract-store';
import { useCompanyStore } from '@/lib/use-company-store';
import { useCustomerStore } from '@/lib/use-customer-store';
import { findCustomerMatch, type Customer } from '@/lib/sample-customers';
import { SmsSendDialog } from '@/components/sms/sms-send-dialog';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { activeContracts, type Contract, type CustomerKind, generateContractSchedule } from '@/lib/sample-contracts';
import { activeAssets } from '@/lib/sample-assets';
import { EntityFormDialog, type FieldDef, type FieldSection, type EntityDialogMode } from '@/components/ui/entity-form-dialog';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { JpkTable, type JpkColumn, type JpkTableApi } from '@/components/shared/jpk-table';
import { EmptyState } from '@/components/ui/empty-state';
import { FileText } from '@phosphor-icons/react';
import { useTopbarSearch } from '@/lib/use-topbar-search';
import { nextDateScopedCode, nextCompanyScopedCode } from '@/lib/code-gen';
import { ContractRegisterDialog } from '@/components/contract/contract-register-dialog';
import { useAuditStamp } from '@/lib/audit-fields';
import { genId } from '@/lib/ids';
import { cn } from '@/lib/cn';

/** 수정·복사용 폼 — 섹션 단위. 등록은 ContractRegisterDialog 사용. */
const CONTRACT_REQUIRED_FIELDS: FieldDef[] = [
  { key: 'companyCode',    label: '회사코드',  required: true, readOnly: true },
  { key: 'contractNo',     label: '계약번호',  readOnly: true },
  { key: 'plate',          label: '차량번호',  required: true },
  { key: 'customerName',   label: '고객명',    required: true },
  { key: 'customerKind',   label: '신분',      type: 'select', options: ['개인', '사업자', '법인'], required: true },
  { key: 'customerIdent',  label: '고객등록번호', required: true },
  { key: 'customerPhone',  label: '연락처',    required: true },
  { key: 'startDate',      label: '시작일',    type: 'date', required: true },
  { key: 'endDate',        label: '만기일',    type: 'date', required: true },
  { key: 'monthlyAmount',  label: '월 청구액', type: 'number' },
  { key: 'deposit',        label: '보증금',    type: 'number' },
];

const BOOLEAN_TRISTATE_OPTIONS = ['가입', '미가입'];

const CONTRACT_OPTIONAL_SECTIONS: FieldSection[] = [
  {
    title: '임차인 추가 정보',
    fields: [
      { key: 'customerLicenseNo', label: '운전면허번호', placeholder: '00-00-000000-00' },
      { key: 'customerEmail',     label: '이메일',       placeholder: 'name@example.com' },
      { key: 'customerAddress',   label: '실거주지',     colSpan: 2 },
      { key: 'emergencyPhone',    label: '비상연락처',   placeholder: '010-0000-0000' },
      { key: 'emergencyRelation', label: '비상연락처 관계', placeholder: '부/모/배우자/자녀' },
    ],
  },
  {
    title: '운전 조건',
    fields: [
      { key: 'driverScope',              label: '운전자 범위',  type: 'select', options: ['누구나운전', '가족한정', '임직원한정', '1인지정'] },
      { key: 'driverAgeLimit',           label: '연령 제한',    placeholder: '예: 만 26세 이상' },
      { key: 'mileageLimitKm',           label: '연간 주행거리 한도 (km)', type: 'number', placeholder: '0=무제한' },
      { key: 'excessMileageFeeKr',       label: '초과 km당 (국산, 원)', type: 'number' },
      { key: 'excessMileageFeeForeign',  label: '초과 km당 (수입, 원)', type: 'number' },
    ],
  },
  {
    title: '인도 · 반납',
    fields: [
      { key: 'deliveryAddress', label: '인도 장소', colSpan: 2 },
      { key: 'returnAddress',   label: '반납 장소', colSpan: 2 },
    ],
  },
  {
    title: '결제',
    fields: [
      { key: 'paymentMethod', label: '결제 방법', placeholder: '자동이체 / 계좌이체 / 카드' },
      { key: 'paymentDay',    label: '결제일 (1-31)', type: 'number' },
      { key: 'paymentBank',    label: '입금 은행' },
      { key: 'paymentAccount', label: '입금 계좌번호' },
      { key: 'paymentHolder',  label: '입금 예금주', colSpan: 2 },
    ],
  },
  {
    title: '자동이체 (CMS)',
    fields: [
      { key: 'autoDebitBank',    label: '출금 은행' },
      { key: 'autoDebitAccount', label: '출금 계좌번호' },
      { key: 'autoDebitHolder',  label: '예금주', colSpan: 2 },
    ],
  },
  {
    title: '정비 · 서비스',
    fields: [
      { key: 'maintenanceProduct', label: '정비상품', placeholder: '정비제외 / 엔진오일 연1회 등', colSpan: 2 },
      { key: 'engineOilService',   label: '엔진오일 서비스', type: 'select', options: BOOLEAN_TRISTATE_OPTIONS },
      { key: 'inspectionService',  label: '검사대행',         type: 'select', options: BOOLEAN_TRISTATE_OPTIONS },
    ],
  },
  {
    title: '보험',
    fields: [
      { key: 'insurer',          label: '보험사', placeholder: '예: DB손해보험', colSpan: 2 },
      { key: 'deductibleMin',    label: '자차 면책금 최소 (만원)', type: 'number' },
      { key: 'deductibleMax',    label: '자차 면책금 최대 (만원)', type: 'number' },
      { key: 'deductibleRate',   label: '자차 면책 비율 (0.2 = 20%)', type: 'number' },
      { key: 'initialMileageKm', label: '인수 시점 주행거리 (km)', type: 'number' },
    ],
  },
  {
    title: '승계 (양도/양수)',
    fields: [
      { key: 'predecessorName',  label: '양도인 이름' },
      { key: 'predecessorPhone', label: '양도인 연락처' },
      { key: 'succeededAt',      label: '승계일자', type: 'date' },
    ],
  },
  {
    title: '인수 옵션',
    fields: [
      { key: 'purchaseOptionAmount', label: '만기 인수가격', placeholder: '만기협의 / 숫자', colSpan: 2 },
    ],
  },
  {
    title: '특약사항',
    fields: [
      { key: 'specialTerms', label: '특약사항 (개행 보존)', type: 'textarea', colSpan: 2 },
    ],
  },
];

const CONTRACT_EDIT_SECTIONS: FieldSection[] = [
  { title: '필수 정보', fields: CONTRACT_REQUIRED_FIELDS },
  ...CONTRACT_OPTIONAL_SECTIONS,
];

const CONTRACT_DUPLICATE_SECTIONS: FieldSection[] = [
  {
    title: '필수 정보',
    fields: CONTRACT_REQUIRED_FIELDS.map((f) =>
      f.key === 'companyCode' ? { ...f, readOnly: false } :
      f.key === 'contractNo' ? { ...f, readOnly: false, placeholder: '비워두면 자동 (C2605060001)' } : f,
    ),
  },
  ...CONTRACT_OPTIONAL_SECTIONS,
];

export default function ContractListPage() {
  const [allContracts, setContracts] = useContractStore();
  const [allAssets, setAssets] = useAssetStore();
  const [customers, setCustomers] = useCustomerStore();
  // active 만 — 소프트 삭제는 목록·집계에서 제외 (코드는 영구 보존)
  const contracts = useMemo(() => activeContracts(allContracts), [allContracts]);
  const assets = useMemo(() => activeAssets(allAssets), [allAssets]);
  const { search } = useTopbarSearch();
  const [selected, setSelected] = useState<Contract | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editMode, setEditMode] = useState<EntityDialogMode>('view');
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState({ open: false, x: 0, y: 0 });
  const audit = useAuditStamp();
  const [companies] = useCompanyStore();
  const selectedCompany = useMemo(
    () => (selected ? companies.find((c) => c.code === selected.companyCode) ?? null : null),
    [companies, selected],
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

  /** ContractDraft (필수 10필드) → Contract 완성 + 수납 스케줄 자동 생성 */
  function fromDraft(draft: Omit<Contract, 'id' | 'contractNo' | 'status' | 'events'>): Contract {
    return {
      id: genId('c'),
      contractNo: nextDateScopedCode('C', contracts.map((c) => c.contractNo), { date: draft.startDate || undefined }),
      ...draft,
      status: '운행중',
      events: generateContractSchedule(draft.startDate, draft.endDate, draft.monthlyAmount, {
        autopayDay: draft.paymentDay,
        engineOilService: draft.engineOilService,
      }),
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
      monthlyAmount,
      deposit: Number(d.deposit) || 0,
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
      events: generateContractSchedule(startDate, endDate, monthlyAmount, {
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
    if (!confirm(`${selected.contractNo} 계약을 삭제할까요? (계약번호는 영구 보존 — 재발급 안 됨)`)) return;
    setContracts((prev) => prev.map((c) => c.id === selected.id ? { ...c, ...audit.delete() } : c));
    audit.log({ action: 'delete', entityType: 'contract', entityId: selected.id, label: selected.contractNo, before: selected });
    setSelected(null);
  }

  const boolToOpt = (b: boolean | undefined): string => b === true ? '가입' : b === false ? '미가입' : '';
  const numToOpt = (n: number | undefined): string => (typeof n === 'number' && Number.isFinite(n)) ? String(n) : '';
  const editInitial: Record<string, string> = selected ? {
    companyCode: selected.companyCode,
    contractNo: selected.contractNo,
    plate: selected.plate,
    customerName: selected.customerName,
    customerKind: selected.customerKind,
    customerIdent: selected.customerIdent,
    customerPhone: selected.customerPhone,
    customerLicenseNo: selected.customerLicenseNo ?? '',
    customerEmail:     selected.customerEmail ?? '',
    customerAddress:   selected.customerAddress ?? '',
    emergencyPhone:    selected.emergencyPhone ?? '',
    emergencyRelation: selected.emergencyRelation ?? '',
    startDate: selected.startDate,
    endDate: selected.endDate,
    monthlyAmount: String(selected.monthlyAmount),
    deposit: String(selected.deposit ?? 0),
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
            <ContractRegisterDialog onCreate={handleCreate} />
          </>
        }
      >
        {visibleContracts.length === 0 ? (
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
        submitLabel="저장" onSubmit={handleUpdate} />
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
}: {
  contracts: Contract[];
  selectedId?: string;
  onRowClick: (c: Contract) => void;
  onRowDoubleClick?: (c: Contract) => void;
  onRowContextMenu: (c: Contract, x: number, y: number) => void;
  globalSearch?: string;
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
    />
  );
}
