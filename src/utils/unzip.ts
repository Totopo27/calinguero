// NOTICE: Modified for the Calinguero project in 2026.
import { createLogger } from './logger';

const log = createLogger('Unzip');
const SUB_EXT = /\.(srt|vtt|ass|ssa)$/i;
const STREAM_SLICE_BYTES = 2048;
export const MAX_SUBTITLE_ARCHIVE_BYTES = 10 * 1024 * 1024;
export const MAX_SUBTITLE_ENTRY_BYTES = 5 * 1024 * 1024;

/** Extract the first subtitle file's UTF-8 text from a zip byte array. fflate is
 *  loaded lazily so a TV that never fetches a SubDL zip never bundles it in.
 *  Returns null when the archive has no subtitle entry or can't be read. */
export async function firstSubtitleFromZip(bytes: Uint8Array): Promise<{ name: string; text: string } | null> {
  const file = await firstSubtitleBytesFromZip(bytes);
  if (!file) return null;
  const { strFromU8 } = await import('fflate');
  return { name: file.name, text: strFromU8(file.bytes) };
}

/** Like firstSubtitleFromZip but returns the raw bytes, so the caller can pick
 *  the text encoding (e.g. GB18030 for Chinese subs). Null when none/failure. */
export async function firstSubtitleBytesFromZip(bytes: Uint8Array): Promise<{ name: string; bytes: Uint8Array } | null> {
  if (bytes.byteLength > MAX_SUBTITLE_ARCHIVE_BYTES) {
    log.warn('subtitle archive exceeds size limit:', bytes.byteLength);
    return null;
  }
  try {
    const { Unzip, UnzipInflate, UnzipPassThrough } = await import('fflate');
    let pickedName: string | null = null;
    let totalBytes = 0;
    let completed = false;
    const chunks: Uint8Array[] = [];

    const uz = new Unzip((file) => {
      if (pickedName !== null || !SUB_EXT.test(file.name)) return;
      if (file.originalSize !== undefined && file.originalSize > MAX_SUBTITLE_ENTRY_BYTES) {
        throw new Error('Subtitle entry exceeds size limit');
      }
      pickedName = file.name;
      file.ondata = (err, chunk, final) => {
        if (err) throw err;
        totalBytes += chunk.byteLength;
        if (totalBytes > MAX_SUBTITLE_ENTRY_BYTES) {
          file.terminate();
          throw new Error('Subtitle entry exceeds size limit');
        }
        chunks.push(chunk);
        if (final) completed = true;
      };
      file.start();
    });
    uz.register(UnzipPassThrough);
    uz.register(UnzipInflate);

    for (let offset = 0; offset < bytes.byteLength; offset += STREAM_SLICE_BYTES) {
      const end = Math.min(bytes.byteLength, offset + STREAM_SLICE_BYTES);
      uz.push(bytes.subarray(offset, end), end === bytes.byteLength);
      if (completed) break;
    }

    if (pickedName === null || !completed) return null;
    const out = new Uint8Array(totalBytes);
    let pos = 0;
    for (const chunk of chunks) {
      out.set(chunk, pos);
      pos += chunk.byteLength;
    }
    return { name: pickedName, bytes: out };
  } catch (e) {
    log.warn('unzip (bytes) failed:', e);
    return null;
  }
}
