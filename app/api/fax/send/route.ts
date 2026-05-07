import { NextResponse } from 'next/server';
import { sendFax } from '@/lib/fax/aligo';

/**
 * POST /api/fax/send — multipart/form-data
 *
 *   sender   : 발신 팩스번호 (미지정 시 ALIGO_FAX_SENDER env)
 *   receiver : 받는 팩스번호 (필수)
 *   title    : 표지 제목 (선택)
 *   memo     : 표지 본문 (선택)
 *   file_1, file_2, ... : 첨부 파일 (PDF/이미지). 최소 1개
 */
export async function POST(req: Request) {
  try {
    const fd = await req.formData();
    const sender = (fd.get('sender') as string | null) ?? undefined;
    const receiver = (fd.get('receiver') as string | null) ?? '';
    const title = (fd.get('title') as string | null) ?? undefined;
    const memo = (fd.get('memo') as string | null) ?? undefined;

    const files: File[] = [];
    for (let i = 1; i <= 20; i++) {
      const f = fd.get(`file_${i}`);
      if (f instanceof File && f.size > 0) files.push(f);
    }
    if (files.length === 0) {
      return NextResponse.json({ ok: false, error: '첨부 파일 없음' }, { status: 400 });
    }
    if (!receiver.trim()) {
      return NextResponse.json({ ok: false, error: '받는 팩스번호 누락' }, { status: 400 });
    }

    const result = await sendFax({
      sender: sender?.trim() || undefined,
      receiver: receiver.trim(),
      title: title?.trim() || undefined,
      memo: memo?.trim() || undefined,
      files,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
