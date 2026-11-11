/**
 * Structural validation of uploads beyond "the first bytes look right". This is NOT antivirus: no malware engine is
 * integrated (stated limitation). It rejects malformed or polyglot-looking files and PDFs with active content, and
 * everything is stored encrypted and served as an attachment with a sandbox CSP.
 */
import { AppError } from "./errors";

const bad = (m: string) => new AppError("VALIDATION", m);

export function validatePng(b: Buffer) {
  if (b.length < 8 + 25 + 12) throw bad("The PNG file is incomplete.");
  let off = 8;
  let first = true;
  let sawIend = false;
  while (off + 12 <= b.length) {
    const len = b.readUInt32BE(off);
    const type = b.toString("latin1", off + 4, off + 8);
    if (len > b.length || off + 12 + len > b.length) throw bad("The PNG file is corrupted.");
    if (first && type !== "IHDR") throw bad("The PNG file is corrupted.");
    first = false;
    off += 12 + len;
    if (type === "IEND") {
      sawIend = true;
      break;
    }
  }
  if (!sawIend) throw bad("The PNG file is incomplete.");
  if (off !== b.length) throw bad("The PNG file has unexpected data after its end.");
}

export function validateJpeg(b: Buffer) {
  if (b.length < 4 || b[b.length - 2] !== 0xff || b[b.length - 1] !== 0xd9)
    throw bad("The JPEG file is incomplete.");
}

const PDF_ACTIVE = [
  /\/JavaScript\b/,
  /\/JS\b/,
  /\/Launch\b/,
  /\/EmbeddedFile\b/,
  /\/OpenAction\b/,
  /\/AA\b/,
  /\/RichMedia\b/,
  /\/XFA\b/,
];
export function validatePdf(b: Buffer) {
  const s = b.toString("latin1");
  if (!/%%EOF\s*$/.test(s.slice(-1024))) throw bad("The PDF file is incomplete.");
  if (PDF_ACTIVE.some((re) => re.test(s)))
    throw bad(
      "PDFs with scripts, launch actions or embedded files are not accepted. Please export a plain PDF.",
    );
}

export function validateText(b: Buffer) {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(b);
  } catch {
    throw bad("Text files must be UTF-8.");
  }
}
