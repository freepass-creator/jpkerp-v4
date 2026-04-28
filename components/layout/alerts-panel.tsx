'use client';

import { CaretRight } from '@phosphor-icons/react';

export type Alert = {
  id: string;
  severity: 'red' | 'orange' | 'green' | 'blue';
  title: string;
  detail?: string;
  count?: number;
};

const DOT_COLOR: Record<Alert['severity'], string> = {
  red:    'var(--alert-red-text)',
  orange: 'var(--alert-orange-text)',
  green:  'var(--alert-green-text)',
  blue:   'var(--alert-blue-text)',
};

type Props = {
  title?: string;
  alerts: Alert[];
  onClick?: (alert: Alert) => void;
};

export function AlertsPanel({ title = '미결', alerts, onClick }: Props) {
  const total = alerts.reduce((s, a) => s + (a.count ?? 0), 0);

  return (
    <>
      <div className="alerts-panel-head">
        <span className="text-medium">{title}</span>
        <span className="text-weak">· {alerts.length}항목</span>
      </div>
      <div className="alerts-panel-body">
        {alerts.length === 0 ? (
          <div className="text-center text-weak py-8">미결 없음</div>
        ) : (
          alerts.map((a) => (
            <div key={a.id} className="alert-item" onClick={() => onClick?.(a)}>
              <span className="alert-item-dot" style={{ background: DOT_COLOR[a.severity] }} />
              <div className="alert-item-text">
                <div>{a.title}</div>
                {a.detail && <div>{a.detail}</div>}
              </div>
              {a.count !== undefined && a.count > 0 && (
                <span className="alert-item-count">{a.count}</span>
              )}
              <CaretRight size={11} className="text-weak" />
            </div>
          ))
        )}
      </div>
      <div className="alerts-panel-foot">
        합계 <strong className="text-main ml-1">{total}</strong>건
      </div>
    </>
  );
}
