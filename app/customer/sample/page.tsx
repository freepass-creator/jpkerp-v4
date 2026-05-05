'use client';

import { CustomerView } from '@/components/customer/customer-view';
import {
  SAMPLE_CUSTOMER_CONTRACT,
  SAMPLE_CUSTOMER_ASSET,
  SAMPLE_CUSTOMER_INSURANCE,
  SAMPLE_CUSTOMER_COMPANY,
} from '@/lib/customer-sample';

/**
 * 손님 페이지 디자인 미리보기 — 샘플 데이터로 모든 카드 채워서 렌더.
 * 실데이터 매칭과 별개. 디자인 검토용.
 */
export default function CustomerSamplePage() {
  return (
    <CustomerView
      contract={SAMPLE_CUSTOMER_CONTRACT}
      asset={SAMPLE_CUSTOMER_ASSET}
      insurance={SAMPLE_CUSTOMER_INSURANCE}
      company={SAMPLE_CUSTOMER_COMPANY}
      isSample
    />
  );
}
