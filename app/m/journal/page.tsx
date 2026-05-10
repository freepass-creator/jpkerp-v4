'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, CircleNotch, MagnifyingGlass } from '@phosphor-icons/react';
import { useAuth } from '@/lib/use-auth';
import { useAssetStore } from '@/lib/use-asset-store';
import { useJournalStore } from '@/lib/use-journal-store';
import {
  JOURNAL_KINDS, KIND_LABEL, KIND_HINT,
  type JournalEntry, type JournalKind,
} from '@/lib/sample-journal';
import { useAuditStamp } from '@/lib/audit-fields';
import { genId } from '@/lib/ids';

/**
 * 모바일 업무일지 입력 — PC /journal 의 모바일 단순화 버전.
 * 카테고리 grid → 차량번호 + 처리현황 + 메모 → 등록.
 * 시동제어는 PC 에서만 (관리 테이블이라 모바일 input 적합 X).
 */

const STATUSES = ['진행중', '처리완료', '보류', '처리불가'] as const;

export default function MobileJournalPage() {
  const router = useRouter();
  const { user } = useAuth();
  const audit = useAuditStamp();
  const [allAssets] = useAssetStore();
  const [entries, setEntries] = useJournalStore();

  const [kind, setKind] = useState<JournalKind>('contact');
  const [plate, setPlate] = useState('');
  const [status, setStatus] = useState<typeof STATUSES[number]>('진행중');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const assets = useMemo(() => allAssets.filter((a) => !a.deletedAt), [allAssets]);
  const matchedAsset = useMemo(
    () => assets.find((a) => a.plate === plate.trim()) ?? null,
    [assets, plate],
  );

  // 시동제어는 모바일에서 단순 input 안 됨 — 카테고리 노출에서 제외
  const visibleKinds = useMemo(() => JOURNAL_KINDS.filter((k) => k !== 'ignition'), []);

  const ready = !!plate.trim() && !!memo.trim() && !busy;

  async function submit() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const now = new Date();
      const at = `${now.toISOString().slice(0, 10)} ${String(now.getHours()).padStart(2, '0')}:${String(Math.floor(now.getMinutes() / 10) * 10).padStart(2, '0')}`;
      const entry: JournalEntry = {
        id: genId('j'),
        no: `J-${now.getFullYear()}-${String(entries.length + 1).padStart(4, '0')}`,
        companyCode: matchedAsset?.companyCode ?? 'CP01',
        kind,
        at,
        staff: user?.displayName ?? user?.email?.split('@')[0] ?? '담당자',
        data: { plate: plate.trim(), memo: memo.trim(), status },
        ...audit.create(),
      };
      setEntries([entry, ...entries]);
      setInfo(`${KIND_LABEL[kind]} 등록 완료`);
      setMemo('');
      setStatus('진행중');
      setTimeout(() => setInfo(null), 1800);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="m-topbar">
        <div className="m-topbar-title">입력</div>
        <button
          type="button"
          className="m-topbar-back"
          onClick={() => router.push('/m/search')}
          title="조회"
        >
          <MagnifyingGlass size={16} weight="bold" />
        </button>
      </header>

      <main className="m-main">
        {/* 1. 카테고리 */}
        <div>
          <div style={{ fontSize: 13, color: 'var(--m-text-sub)', fontWeight: 600, marginBottom: 8 }}>
            1. 카테고리
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            {visibleKinds.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                style={{
                  padding: '10px 8px',
                  border: kind === k ? '1.5px solid var(--m-brand)' : '1px solid var(--m-border)',
                  background: kind === k ? 'var(--m-brand-soft)' : 'var(--m-card)',
                  color: kind === k ? 'var(--m-brand)' : 'var(--m-text)',
                  borderRadius: 8,
                  fontFamily: 'inherit',
                  fontSize: 13,
                  fontWeight: kind === k ? 700 : 500,
                  cursor: 'pointer',
                }}
                title={KIND_HINT[k]}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>

        {/* 2. 차량번호 */}
        <div>
          <div style={{ fontSize: 13, color: 'var(--m-text-sub)', fontWeight: 600, marginBottom: 8 }}>
            2. 차량번호
          </div>
          <input
            type="text"
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            placeholder="12가1234"
            list="m-journal-plates"
            style={{
              width: '100%', padding: '12px 14px',
              fontSize: 16, fontFamily: 'monospace',
              border: '1.5px solid var(--m-border)', borderRadius: 8,
              background: 'var(--m-card)', color: 'var(--m-text)',
            }}
          />
          <datalist id="m-journal-plates">
            {assets.map((a) => <option key={a.id} value={a.plate} />)}
          </datalist>
          {matchedAsset && (
            <div style={{ marginTop: 6, fontSize: 13, color: 'var(--m-text-sub)' }}>
              {matchedAsset.vehicleName ?? '-'} · {matchedAsset.companyCode}
            </div>
          )}
        </div>

        {/* 3. 처리 현황 */}
        <div>
          <div style={{ fontSize: 13, color: 'var(--m-text-sub)', fontWeight: 600, marginBottom: 8 }}>
            3. 처리 현황 <span style={{ fontWeight: 400, color: 'var(--m-text-weak)' }}>· 처리완료 외엔 미결</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                style={{
                  padding: '10px 4px',
                  border: status === s ? '1.5px solid var(--m-brand)' : '1px solid var(--m-border)',
                  background: status === s ? 'var(--m-brand-soft)' : 'var(--m-card)',
                  color: status === s ? 'var(--m-brand)' : 'var(--m-text)',
                  borderRadius: 8,
                  fontFamily: 'inherit',
                  fontSize: 13,
                  fontWeight: status === s ? 700 : 500,
                  cursor: 'pointer',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* 4. 메모 */}
        <div>
          <div style={{ fontSize: 13, color: 'var(--m-text-sub)', fontWeight: 600, marginBottom: 8 }}>
            4. 메모
          </div>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder={`${KIND_LABEL[kind]} 내용 입력`}
            rows={4}
            style={{
              width: '100%', padding: '12px 14px',
              fontSize: 14, fontFamily: 'inherit',
              border: '1.5px solid var(--m-border)', borderRadius: 8,
              background: 'var(--m-card)', color: 'var(--m-text)',
              resize: 'vertical',
            }}
          />
        </div>

        {error && (
          <div className="m-card" style={{ background: 'var(--m-danger-bg)', color: 'var(--m-danger)', padding: '10px 14px', fontSize: 14 }}>
            {error}
          </div>
        )}
        {info && (
          <div className="m-card" style={{ background: 'var(--m-success-bg)', color: 'var(--m-success)', padding: '10px 14px', fontSize: 14 }}>
            <CheckCircle size={14} weight="bold" style={{ display: 'inline', marginRight: 6 }} />
            {info}
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!ready}
          style={{
            marginTop: 4,
            padding: '16px 20px',
            fontSize: 16, fontWeight: 700, fontFamily: 'inherit',
            background: ready ? 'var(--m-brand)' : 'var(--m-text-weak)',
            color: '#fff', border: 0, borderRadius: 8,
            cursor: ready ? 'pointer' : 'not-allowed',
          }}
        >
          {busy ? <><CircleNotch size={14} className="auth-spin" /> 등록 중...</> : `${KIND_LABEL[kind]} 등록`}
        </button>

        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--m-text-weak)', textAlign: 'center' }}>
          상세 카테고리별 입력은 PC 의 /journal 에서 가능
        </div>
      </main>
    </>
  );
}
