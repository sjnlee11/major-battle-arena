import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { demoExpired, EXPIRED_MESSAGE } from "@/lib/server/demo";

// 데모 배포(DEMO_MODE=true)에서 DEMO_EXPIRES_AT 이 지나면 사이트 전체를 410 으로 닫는다.
// DEMO_MODE 가 꺼져 있으면(일반 실행) 아무 영향이 없다.
export function proxy(request: NextRequest) {
  if (!demoExpired()) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: EXPIRED_MESSAGE }, { status: 410 });
  }
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>체험 종료</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0b14;color:#e5e7eb;font-family:system-ui,sans-serif;text-align:center">
<div><div style="font-size:48px">⚔️</div><h1 style="font-size:22px;margin:12px 0 6px">체험 기간이 종료되었습니다</h1><p style="color:#9ca3af;margin:0">AI 전공 배틀 아레나 데모 · 관심 가져 주셔서 감사합니다.</p></div></body></html>`;
  return new NextResponse(html, { status: 410, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export const config = {
  matcher: "/((?!_next/static|_next/image).*)",
};
