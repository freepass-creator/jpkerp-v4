'use client';

import { useState, useMemo } from 'react';
import { Plus } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { JOURNAL_KINDS, SAMPLE_JOURNAL, type JournalEntry, type JournalKind } from '@/lib/sample-journal';
import { cn } from '@/lib/cn';

/**
 * 업무일지 — 출고/반납/응대/수선 등 운영 이벤트 입력 + 일자별 리스트.
 * 입력은 화면 상단 빠른 폼 / 리스트는 시간 역순.
 */
export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>(SAMPLE_JOURNAL);
  const [kind, setKind] = useState<JournalKind>('고객응대');
  const [plate, setPlate] = useState('');
  const [memo, setMemo] = useState('');

  const counts = useMemo(() => {
    const c: Record<JournalKind, number> = {
      고객응대: 0, 차량입출고: 0, 사고접수: 0, 차량수선: 0,
      보험접수: 0, 검사실시: 0, 청구수납: 0, 계약체결: 0, 과태료: 0, 기타: 0,
    };
    for (const e of entries) c[e.kind]++;
    return c;
  }, [entries]);

  function handleAdd() {
    if (!memo.trim()) return;
    const now = new Date();
    const at = `${now.toISOString().slice(0, 10)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const next: JournalEntry = {
      id: `j-${Date.now()}`,
      no: `J-${now.getFullYear()}-${String(entries.length + 1).padStart(4, '0')}`,
      companyCode: 'CP01',
      plate: plate || undefined,
      kind,
      at,
      staff: '담당자',
      memo: memo.trim(),
    };
    setEntries([next, ...entries]);
    setMemo('');
    setPlate('');
  }

  return (
    <PageShell
      footerLeft={
        <>
          <span className="stat-item">전체 <strong>{entries.length}</strong></span>
          {JOURNAL_KINDS.filter((k) => counts[k] > 0).map((k) => (
            <span key={k} className="stat-item">{k} <strong>{counts[k]}</strong></span>
          ))}
        </>
      }
      footerRight={<button className="btn">엑셀</button>}
    >
      {/* 빠른 입력 영역 */}
      <div className="journal-quick">
        <div className="journal-chips">
          {JOURNAL_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={cn('chip', kind === k && 'active')}
              onClick={() => setKind(k)}
            >
              {k}
            </button>
          ))}
        </div>
        <div className="journal-form">
          <input
            className="input"
            placeholder="차량번호 (선택)"
            style={{ width: 140 }}
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
          />
          <input
            className="input flex-1"
            placeholder="메모 — Enter로 등록"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          />
          <button className="btn btn-primary" onClick={handleAdd} disabled={!memo.trim()}>
            <Plus size={14} weight="bold" /> 등록
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>회사코드</th>
              <th>차량번호</th>
              <th>일지번호</th>
              <th>구분</th>
              <th className="date">일시</th>
              <th>담당자</th>
              <th>고객</th>
              <th>계약번호</th>
              <th>메모</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={9} className="center dim" style={{ padding: '24px 0' }}>
                  업무일지 없음 — 위 빠른 입력으로 작성
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id}>
                  <td className="plate">{e.companyCode}</td>
                  <td className="plate">{e.plate ?? <span className="text-muted">-</span>}</td>
                  <td className="mono dim">{e.no}</td>
                  <td><span className="badge">{e.kind}</span></td>
                  <td className="date mono">{e.at}</td>
                  <td>{e.staff}</td>
                  <td>{e.customer ?? <span className="text-muted">-</span>}</td>
                  <td className="mono dim">{e.contractNo ?? <span className="text-muted">-</span>}</td>
                  <td>{e.memo}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
