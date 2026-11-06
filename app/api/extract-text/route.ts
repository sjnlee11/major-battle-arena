import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { allow, clientIp } from "@/lib/server/rateLimit";

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_CHARS = 200_000;

export async function POST(req: Request) {
  if (!allow(`extract:${clientIp(req)}`, 20)) {
    return Response.json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." }, { status: 429 });
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    return Response.json({ error: "multipart/form-data 형식으로 file 필드를 보내 주세요." }, { status: 400 });
  }
  if (!(file instanceof File)) return Response.json({ error: "file 필드가 없습니다." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "파일은 20MB 이하여야 합니다." }, { status: 413 });

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  let text = "";
  let pages: number | undefined;

  try {
    if (ext === "pdf") {
      const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
      const res = await extractText(pdf, { mergePages: true });
      text = res.text;
      pages = res.totalPages;
    } else if (ext === "txt") {
      text = new TextDecoder("utf-8").decode(await file.arrayBuffer());
    } else if (ext === "docx") {
      // Word 문서: 본문 텍스트만 추출 (표/이미지/서식은 제외)
      const res = await mammoth.extractRawText({ buffer: Buffer.from(await file.arrayBuffer()) });
      text = res.value;
    } else {
      return Response.json({ error: "PDF, TXT, DOCX 파일만 지원합니다." }, { status: 415 });
    }
  } catch {
    return Response.json({ error: "파일을 읽지 못했습니다. 손상되었거나 암호가 걸린 파일일 수 있습니다." }, { status: 422 });
  }

  text = text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) {
    return Response.json(
      { error: "추출된 텍스트가 없습니다. 이미지로 스캔된 PDF나 그림만 있는 문서는 지원하지 않습니다. 텍스트를 직접 붙여넣어 주세요." },
      { status: 422 }
    );
  }

  const truncated = text.length > MAX_CHARS;
  if (truncated) text = text.slice(0, MAX_CHARS);
  return Response.json({ text, pages, chars: text.length, truncated });
}
