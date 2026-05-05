'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, UploadSimple } from '@phosphor-icons/react';

export default function MobileUploadStub() {
  const router = useRouter();
  const params = useSearchParams();
  const plate = params?.get('plate') ?? '';

  return (
    <>
      <header className="m-topbar">
        <button type="button" className="m-topbar-back" onClick={() => router.push('/m')}>
          <ArrowLeft size={16} weight="bold" /> 홈
        </button>
        <div className="m-topbar-title">업로드</div>
        <span style={{ width: 40 }} />
      </header>

      <main className="m-main">
        <div className="m-empty">
          <UploadSimple size={36} className="m-empty-icon" />
          <div>업로드 기능 준비 중</div>
          <div className="text-weak text-xs mt-1">
            출고 / 반납 / 상품화 / 기타 사진·파일 첨부
            {plate && <><br />선택된 차량: <strong>{plate}</strong></>}
          </div>
        </div>
      </main>
    </>
  );
}
