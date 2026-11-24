// NOTICE: Modified for the Calinguero project in 2026.
import { describe, it, expect, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import {
  MAX_SUBTITLE_ARCHIVE_BYTES,
  MAX_SUBTITLE_ENTRY_BYTES,
  firstSubtitleFromZip,
  firstSubtitleBytesFromZip,
} from './unzip';

describe('firstSubtitleFromZip', () => {
  it('returns the first subtitle entry decoded as text', async () => {
    const zip = zipSync({
      'readme.txt': strToU8('ignore me'),
      'movie.srt': strToU8('1\n00:00:01,000 --> 00:00:02,000\nhello\n'),
    });
    const out = await firstSubtitleFromZip(zip);
    expect(out?.name).toBe('movie.srt');
    expect(out?.text).toContain('hello');
  });

  it('returns null when the zip has no subtitle file', async () => {
    expect(await firstSubtitleFromZip(zipSync({ 'a.txt': strToU8('x') }))).toBeNull();
  });

  it('returns null on invalid zip bytes', async () => {
    expect(await firstSubtitleFromZip(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe('firstSubtitleBytesFromZip', () => {
  it('returns the first subtitle entry as raw bytes', async () => {
    const zip = zipSync({ 'note.txt': strToU8('x'), 'movie.srt': strToU8('hi') });
    const out = await firstSubtitleBytesFromZip(zip);
    expect(out?.name).toBe('movie.srt');
    expect(Array.from(out!.bytes)).toEqual(Array.from(strToU8('hi')));
  });

  it('returns null when there is no subtitle entry', async () => {
    expect(await firstSubtitleBytesFromZip(zipSync({ 'a.txt': strToU8('x') }))).toBeNull();
  });

  it('rejects an archive exceeding MAX_SUBTITLE_ARCHIVE_BYTES without extracting', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const oversized = new Uint8Array(MAX_SUBTITLE_ARCHIVE_BYTES + 1);
    expect(await firstSubtitleBytesFromZip(oversized)).toBeNull();
    expect(await firstSubtitleFromZip(oversized)).toBeNull();
    warn.mockRestore();
  });

  it('rejects a subtitle entry exceeding MAX_SUBTITLE_ENTRY_BYTES (zip bomb protection)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const payload = new Uint8Array(MAX_SUBTITLE_ENTRY_BYTES + 64 * 1024);
    const bomb = zipSync({ 'bomb.srt': payload }, { level: 9 });
    expect(bomb.byteLength).toBeLessThan(MAX_SUBTITLE_ARCHIVE_BYTES);

    expect(await firstSubtitleBytesFromZip(bomb)).toBeNull();
    expect(await firstSubtitleFromZip(bomb)).toBeNull();
    warn.mockRestore();
  });
});
