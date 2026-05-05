import { redirect } from 'next/navigation';

/**
 * 모바일 첫화면 = 업로드 (사용자 요청). 다른 메뉴는 /m/upload 페이지 안에서 접근.
 */
export default function MobileIndex() {
  redirect('/m/upload');
}
