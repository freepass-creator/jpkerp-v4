'use client';

import { useEffect, useMemo, useState } from 'react';
import { CircleNotch, PaperPlaneTilt } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { renderTemplate, type SmsTemplateKind, type SmsTemplateContext } from '@/lib/sms/templates';
import { smsByteLength as byteLength } from '@/lib/sms/byte-length';
import { getFirebaseAuth } from '@/lib/firebase/client';
import type { Contract } from '@/lib/sample-contracts';
import type { Company } from '@/lib/sample-companies';

/**
 * SMS 발송 다이얼로그 — 계약 행에서 호출.
 *
 *  · 4종 템플릿 (환영/미납/만기/자유) 선택
 *  · 자리표시자 자동 채움 (회사·이름·차번·식별번호 등)
 *  · 미리보기 영역에 실제 발송 본문 표시
 *  · 발송 → /api/sms/send (Authorization: Bearer <Firebase ID token>)
 */
export function SmsSendDialog({
  open, onOpenChange, contract, company,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: Contract | null;
  company: Company | null;
}) {
  const [kind, setKind] = useState<SmsTemplateKind>('welcome');
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // 컨텍스트 — 자리표시자 채움
  const ctx = useMemo<SmsTemplateContext | null>(() => {
    if (!contract) return null;
    return {
      companyName: company?.name,
      customerName: contract.customerName,
      plate: contract.plate,
      customerIdent: contract.customerIdent,
      // overdue/expire 시 사용자가 입력 (간단한 inline editor 는 v1 생략 — 회차/금액/만기 는 자동 추출 가능)
      cycle: undefined,
      amount: undefined,
      daysLeft: undefined,
      endDate: contract.endDate,
      companyPhone: company?.phone,
    };
  }, [contract, company]);

  const preview = useMemo(() => {
    if (!ctx) return '';
    if (kind === 'custom') return custom;
    return renderTemplate(kind, ctx);
  }, [kind, ctx, custom]);

  // 다이얼로그 열릴 때 초기화
  useEffect(() => {
    if (open) {
      setKind('welcome');
      setCustom('');
      setError(null);
      setInfo(null);
    }
  }, [open]);

  async function handleSend() {
    if (!contract) return;
    if (!preview.trim()) {
      setError('본문이 비어있습니다');
      return;
    }
    if (!contract.customerPhone) {
      setError('수신번호 (계약의 customerPhone) 가 비어있습니다');
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) {
        setError('로그인 상태 확인 — 다시 로그인 후 재시도');
        setBusy(false);
        return;
      }
      const token = await user.getIdToken();
      const body = kind === 'custom'
        ? { to: contract.customerPhone, content: preview }
        : { to: contract.customerPhone, kind, context: ctx };
      const res = await fetch('/api/sms/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.detail ?? json?.error ?? `${res.status}`);
        setBusy(false);
        return;
      }
      setInfo(`발송 완료 (${json.msgType ?? 'SMS'} · 성공 ${json.successCount ?? 1})`);
      setBusy(false);
      // 1.5초 후 자동 닫기
      setTimeout(() => onOpenChange(false), 1500);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (!contract) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="문자 발송" size="md">
        <div className="form-stack" style={{ gap: 14 }}>
          <div>
            <div className="text-sub text-xs">수신자</div>
            <div className="text-medium">
              {contract.customerName} · <span className="mono">{contract.customerPhone || '(번호 없음)'}</span>
            </div>
            <div className="text-weak text-xs mt-1">{contract.plate} · {contract.contractNo}</div>
          </div>

          <div>
            <div className="label">템플릿</div>
            <div className="chip-group" style={{ marginTop: 4 }}>
              {(['welcome', 'overdue', 'expire', 'custom'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`chip ${kind === k ? 'active' : ''}`}
                  onClick={() => setKind(k)}
                >
                  {k === 'welcome' ? '환영' : k === 'overdue' ? '미납' : k === 'expire' ? '만기' : '자유작성'}
                </button>
              ))}
            </div>
          </div>

          {kind === 'custom' ? (
            <div>
              <div className="label">본문</div>
              <textarea
                className="input w-full"
                rows={6}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="자유 메시지 — 90 byte 초과 시 LMS 자동 전환"
                style={{ fontFamily: 'inherit' }}
              />
            </div>
          ) : (
            <div>
              <div className="label">미리보기</div>
              <pre
                className="text-xs"
                style={{
                  background: 'var(--bg-stripe)', border: '1px solid var(--border)',
                  padding: 10, borderRadius: 4, margin: 0,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                  maxHeight: 240, overflow: 'auto',
                  fontFamily: 'inherit',
                }}
              >
                {preview || '(빈 본문)'}
              </pre>
              <div className="text-weak text-xs mt-1">
                {byteLength(preview)} byte · {byteLength(preview) > 90 ? 'LMS' : 'SMS'}
              </div>
            </div>
          )}

          {error && <p className="text-red text-xs">{error}</p>}
          {info && <p className="text-xs" style={{ color: 'var(--alert-green-text, #137333)' }}>{info}</p>}
        </div>

        <DialogFooter>
          <DialogClose asChild><button className="btn">취소</button></DialogClose>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSend}
            disabled={busy || !preview.trim() || !contract.customerPhone}
          >
            {busy ? <><CircleNotch size={12} className="auth-spin mr-1" /> 발송 중...</> : <><PaperPlaneTilt size={12} weight="bold" /> 발송</>}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

