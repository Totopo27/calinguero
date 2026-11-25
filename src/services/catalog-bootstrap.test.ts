// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManualEpgSource, PlaylistEntry } from '../types';
import { CONFIG } from '../config';

const { storageMock, fetchWithTimeoutMock } = vi.hoisted(() => ({
  storageMock: {
    playlists: [] as PlaylistEntry[],
    manualEpgSources: [] as ManualEpgSource[],
    getPlaylists: vi.fn((): PlaylistEntry[] => storageMock.playlists.map(p => ({
      ...p,
      ...(p.xtream ? { xtream: { ...p.xtream } } : {}),
    }))),
    setPlaylists: vi.fn((next: PlaylistEntry[]) => {
      storageMock.playlists = next.map(p => ({
        ...p,
        ...(p.xtream ? { xtream: { ...p.xtream } } : {}),
      }));
      return true;
    }),
    getManualEpgSources: vi.fn((): ManualEpgSource[] => storageMock.manualEpgSources.map(s => ({
      ...s,
      playlistIds: s.playlistIds.slice(),
    }))),
    setManualEpgSources: vi.fn((next: ManualEpgSource[]) => {
      storageMock.manualEpgSources = next.map(s => ({
        ...s,
        playlistIds: s.playlistIds.slice(),
      }));
      return true;
    }),
  },
  fetchWithTimeoutMock: vi.fn(),
}));

vi.mock('./storage-service', () => ({ StorageService: storageMock }));
vi.mock('../utils/fetch-helper', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/fetch-helper')>()),
  fetchWithTimeout: fetchWithTimeoutMock,
}));

import {
  CatalogBootstrapService,
  parseCentralCatalog,
  resolveCatalogUrl,
} from './catalog-bootstrap';

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('parseCentralCatalog', () => {
  it('parses a valid v1 manifest with playlists and EPG sources', () => {
    const parsed = parseCentralCatalog({
      version: 1,
      revision: 'rev-1',
      playlists: [
        { id: 'c-live', name: 'Central Live', source: 'url', url: 'https://host/live.m3u' },
        {
          id: 'c-vod',
          name: 'Central VOD',
          source: 'xtream',
          url: 'http://host:8080/',
          xtream: { username: 'u1', password: 'p1', liveOutput: 'm3u8' },
        },
      ],
      epgSources: [
        { url: 'http://host/epg.xml', playlistIds: ['c-live'] },
      ],
    });

    expect(parsed).toEqual({
      version: 1,
      revision: 'rev-1',
      playlists: [
        { id: 'c-live', name: 'Central Live', source: 'url', url: 'https://host/live.m3u' },
        {
          id: 'c-vod',
          name: 'Central VOD',
          source: 'xtream',
          url: 'http://host:8080',
          xtream: { username: 'u1', password: 'p1', liveOutput: 'm3u8' },
        },
      ],
      epgSources: [
        { url: 'http://host/epg.xml', playlistIds: ['c-live'] },
      ],
    });
  });

  it('rejects unsupported versions, bad revisions, duplicates, unsafe URLs, and invalid Xtream fields', () => {
    const base = {
      version: 1,
      revision: 'rev-1',
      playlists: [{ id: 'c1', name: 'Live', source: 'url', url: 'http://host/a.m3u' }],
    };

    expect(parseCentralCatalog({ ...base, version: 2 })).toBeNull();
    expect(parseCentralCatalog({ ...base, revision: '' })).toBeNull();
    expect(parseCentralCatalog({ ...base, revision: 'a\x00b' })).toBeNull();
    expect(parseCentralCatalog({ ...base, revision: 'r'.repeat(129) })).toBeNull();
    expect(parseCentralCatalog({
      ...base,
      playlists: [{ id: 'c1', name: 'Bad', source: 'url', url: 'file:///etc/passwd' }],
    })).toBeNull();
    expect(parseCentralCatalog({
      ...base,
      playlists: [{ id: 'c1', name: 'Bad', source: 'url', url: 'http://host/a\nm3u' }],
    })).toBeNull();
    expect(parseCentralCatalog({
      ...base,
      playlists: [
        { id: 'dup', name: 'One', source: 'url', url: 'http://host/a.m3u' },
        { id: 'dup', name: 'Two', source: 'url', url: 'http://host/b.m3u' },
      ],
    })).toBeNull();
    expect(parseCentralCatalog({
      ...base,
      playlists: [{ id: 'x1', name: 'Xtream', source: 'xtream', url: 'http://host/x' }],
    })).toBeNull();
    expect(parseCentralCatalog({
      ...base,
      epgSources: [{ url: 'javascript:alert(1)' }],
    })).toBeNull();
  });
});

describe('resolveCatalogUrl', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when empty or non-http(s), and accepts valid localStorage override', () => {
    expect(resolveCatalogUrl()).toBeNull();

    localStorage.setItem(CONFIG.STORAGE_KEYS.CATALOG_URL, 'file:///tmp/catalog.json');
    expect(resolveCatalogUrl()).toBeNull();

    localStorage.setItem(CONFIG.STORAGE_KEYS.CATALOG_URL, '  https://host/catalog.json  ');
    expect(resolveCatalogUrl()).toBe('https://host/catalog.json');
  });
});

describe('CatalogBootstrapService.sync', () => {
  beforeEach(() => {
    localStorage.clear();
    storageMock.playlists = [];
    storageMock.manualEpgSources = [];
    storageMock.getPlaylists.mockClear();
    storageMock.setPlaylists.mockClear();
    storageMock.getManualEpgSources.mockClear();
    storageMock.setManualEpgSources.mockClear();
    fetchWithTimeoutMock.mockReset();
  });

  it('returns disabled without network calls when no catalog URL is configured', async () => {
    await expect(CatalogBootstrapService.sync()).resolves.toEqual({ status: 'disabled' });
    expect(fetchWithTimeoutMock).not.toHaveBeenCalled();
    expect(storageMock.setPlaylists).not.toHaveBeenCalled();
    expect(storageMock.setManualEpgSources).not.toHaveBeenCalled();
  });

  it('provisions managed sources on startup while preserving existing user sources and deduping user EPG URLs', async () => {
    localStorage.setItem(CONFIG.STORAGE_KEYS.CATALOG_URL, 'https://host/catalog.json');
    storageMock.playlists = [
      { id: 'u-manual', name: 'User List', url: 'http://host/user.m3u', source: 'url' },
    ];
    storageMock.manualEpgSources = [
      { url: 'http://host/user-epg.xml', playlistIds: ['u-manual'] },
    ];

    fetchWithTimeoutMock.mockResolvedValueOnce(jsonResponse({
      version: 1,
      revision: 'rev-1',
      playlists: [
        { id: 'm-live', name: 'Central Live', source: 'url', url: 'https://host/central.m3u' },
        {
          id: 'm-vod',
          name: 'Central VOD',
          source: 'xtream',
          url: 'http://host/portal',
          xtream: { username: 'u1', password: 'p1', liveOutput: 'ts' },
        },
      ],
      epgSources: [
        { url: 'http://host/user-epg.xml', playlistIds: [] },
        { url: 'http://host/central-epg.xml', playlistIds: ['m-live'] },
      ],
    }));

    await expect(CatalogBootstrapService.sync()).resolves.toEqual({
      status: 'updated',
      revision: 'rev-1',
      playlistsChanged: true,
      epgChanged: true,
    });

    expect(storageMock.playlists).toEqual([
      { id: 'u-manual', name: 'User List', url: 'http://host/user.m3u', source: 'url' },
      {
        id: 'm-live',
        name: 'Central Live',
        source: 'url',
        url: 'https://host/central.m3u',
        managed: true,
        catalogRevision: 'rev-1',
      },
      {
        id: 'm-vod',
        name: 'Central VOD',
        source: 'xtream',
        url: 'http://host/portal',
        xtream: { username: 'u1', password: 'p1', liveOutput: 'ts' },
        managed: true,
        catalogRevision: 'rev-1',
      },
    ]);
    expect(storageMock.manualEpgSources).toEqual([
      { url: 'http://host/user-epg.xml', playlistIds: ['u-manual'] },
      { url: 'http://host/central-epg.xml', playlistIds: ['m-live'], managed: true },
    ]);
  });

  it('skips redundant storage writes when manifest matches and preserves user disabled toggle on updates', async () => {
    localStorage.setItem(CONFIG.STORAGE_KEYS.CATALOG_URL, 'https://host/catalog.json');
    const manifestV1 = {
      version: 1,
      revision: 'rev-1',
      playlists: [
        { id: 'm1', name: 'Central One', source: 'url', url: 'https://host/1.m3u' },
        { id: 'm2', name: 'Central Two', source: 'url', url: 'https://host/2.m3u' },
      ],
      epgSources: [{ url: 'https://host/epg.xml' }],
    };

    fetchWithTimeoutMock.mockResolvedValueOnce(jsonResponse(manifestV1));
    await CatalogBootstrapService.sync();
    storageMock.setPlaylists.mockClear();
    storageMock.setManualEpgSources.mockClear();

    fetchWithTimeoutMock.mockResolvedValueOnce(jsonResponse(manifestV1));
    await expect(CatalogBootstrapService.sync()).resolves.toEqual({
      status: 'unchanged',
      revision: 'rev-1',
      playlistsChanged: false,
      epgChanged: false,
    });
    expect(storageMock.setPlaylists).not.toHaveBeenCalled();
    expect(storageMock.setManualEpgSources).not.toHaveBeenCalled();

    // Simulate user disabling managed source m1 locally; rev-2 retires m2 and adds m3.
    storageMock.playlists = storageMock.playlists.map(p => (
      p.id === 'm1' ? { ...p, enabled: false } : p
    ));
    fetchWithTimeoutMock.mockResolvedValueOnce(jsonResponse({
      version: 1,
      revision: 'rev-2',
      playlists: [
        { id: 'm1', name: 'Central One', source: 'url', url: 'https://host/1b.m3u' },
        { id: 'm3', name: 'Central Three', source: 'url', url: 'https://host/3.m3u' },
      ],
      epgSources: [{ url: 'https://host/epg-2.xml', playlistIds: ['m1'] }],
    }));

    await CatalogBootstrapService.sync();
    expect(storageMock.playlists).toEqual([
      {
        id: 'm1',
        name: 'Central One',
        source: 'url',
        url: 'https://host/1b.m3u',
        enabled: false,
        managed: true,
        catalogRevision: 'rev-2',
      },
      {
        id: 'm3',
        name: 'Central Three',
        source: 'url',
        url: 'https://host/3.m3u',
        managed: true,
        catalogRevision: 'rev-2',
      },
    ]);
    expect(storageMock.manualEpgSources).toEqual([
      { url: 'https://host/epg-2.xml', playlistIds: ['m1'], managed: true },
    ]);
  });

  it('keeps cached managed entries intact on fetch failure and redacts credentials from logs', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      localStorage.setItem(
        CONFIG.STORAGE_KEYS.CATALOG_URL,
        'https://u1:secretpass@host/catalog.json?token=secret123',
      );
      storageMock.playlists = [{
        id: 'm1',
        name: 'Central One',
        source: 'url',
        url: 'https://host/1.m3u',
        managed: true,
        catalogRevision: 'rev-1',
      }];
      storageMock.manualEpgSources = [
        { url: 'https://host/epg.xml', playlistIds: ['m1'], managed: true },
      ];

      fetchWithTimeoutMock.mockRejectedValueOnce(new Error('network down'));
      const res = await CatalogBootstrapService.sync();
      expect(res).toEqual({ status: 'error', reason: 'network' });
      expect(storageMock.setPlaylists).not.toHaveBeenCalled();
      expect(storageMock.setManualEpgSources).not.toHaveBeenCalled();

      const logged = warnSpy.mock.calls.map(args => args.join(' ')).join('\n');
      expect(logged).not.toContain('secretpass');
      expect(logged).not.toContain('secret123');
    } finally {
      warnSpy.mockRestore();
    }
  });
});
