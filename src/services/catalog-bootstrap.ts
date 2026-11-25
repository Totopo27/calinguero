import type { ManualEpgSource, PlaylistEntry } from '../types';
import { CONFIG } from '../config';
import { FetchTextError, fetchFailureReason, fetchWithTimeout } from '../utils/fetch-helper';
import { createLogger } from '../utils/logger';
import { diagnosticStreamUrl } from '../utils/url';
import {
  normalizeXtreamBaseUrl,
  normalizeXtreamLiveOutputPreference,
  type XtreamLiveOutputPreference,
} from '../utils/xtream-url';
import { StorageService } from './storage-service';

const log = createLogger('CatalogBootstrap');

const CATALOG_FETCH_TIMEOUT_MS = 8000;
const MAX_ID_LENGTH = 128;

export interface CentralCatalogPlaylist {
  id: string;
  name: string;
  source: 'url' | 'xtream';
  url: string;
  revision?: string;
  xtream?: {
    username: string;
    password: string;
    liveOutput: XtreamLiveOutputPreference;
  };
}

export interface CentralCatalogEpgSource {
  url: string;
  playlistIds: string[];
}

export interface CentralCatalogManifest {
  version: 1;
  revision: string;
  playlists: CentralCatalogPlaylist[];
  epgSources: CentralCatalogEpgSource[];
}

export type CatalogSyncResult =
  | { status: 'disabled' }
  | {
    status: 'updated' | 'unchanged';
    revision: string;
    playlistsChanged: boolean;
    epgChanged: boolean;
  }
  | { status: 'error'; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasControlChars(value: string): boolean {
  return /[\0-\x1f\x7f]/.test(value);
}

function sanitizeShortToken(value: unknown): string {
  if (typeof value !== 'string' || hasControlChars(value)) return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_ID_LENGTH) return '';
  return trimmed;
}

function sanitizeHttpUrl(value: unknown): string {
  if (typeof value !== 'string' || hasControlChars(value)) return '';
  const trimmed = value.trim();
  if (!/^https?:\/\/[^\s]+$/i.test(trimmed)) return '';
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? trimmed : '';
  } catch {
    return '';
  }
}

function sanitizeOptionalText(value: unknown): string {
  if (typeof value !== 'string' || hasControlChars(value)) return '';
  return value.trim();
}

export function parseCentralCatalog(raw: unknown): CentralCatalogManifest | null {
  if (!isRecord(raw) || raw.version !== 1) return null;
  const revision = sanitizeShortToken(raw.revision);
  if (!revision || !Array.isArray(raw.playlists)) return null;

  const seenIds = new Set<string>();
  const playlists: CentralCatalogPlaylist[] = [];
  for (const item of raw.playlists) {
    if (!isRecord(item)) return null;
    const id = sanitizeShortToken(item.id);
    const name = sanitizeOptionalText(item.name);
    if (!id || !name || seenIds.has(id)) return null;
    seenIds.add(id);

    let itemRevision: string | undefined;
    if (item.revision !== undefined) {
      const validRevision = sanitizeShortToken(item.revision);
      if (!validRevision) return null;
      itemRevision = validRevision;
    }

    if (item.source === 'url') {
      const url = sanitizeHttpUrl(item.url);
      if (!url) return null;
      playlists.push({
        id,
        name,
        source: 'url',
        url,
        ...(itemRevision ? { revision: itemRevision } : {}),
      });
      continue;
    }

    if (item.source === 'xtream') {
      const base = sanitizeHttpUrl(item.url);
      if (!base || !isRecord(item.xtream)) return null;
      const username = typeof item.xtream.username === 'string' ? item.xtream.username.trim() : '';
      const password = typeof item.xtream.password === 'string' ? item.xtream.password : '';
      if (!username || !password || hasControlChars(username) || hasControlChars(password)) {
        return null;
      }
      playlists.push({
        id,
        name,
        source: 'xtream',
        url: normalizeXtreamBaseUrl(base),
        ...(itemRevision ? { revision: itemRevision } : {}),
        xtream: {
          username,
          password,
          liveOutput: normalizeXtreamLiveOutputPreference(item.xtream.liveOutput),
        },
      });
      continue;
    }

    return null;
  }

  const epgSources: CentralCatalogEpgSource[] = [];
  if (raw.epgSources !== undefined) {
    if (!Array.isArray(raw.epgSources)) return null;
    for (const item of raw.epgSources) {
      if (!isRecord(item)) return null;
      const url = sanitizeHttpUrl(item.url);
      if (!url) return null;
      const playlistIds: string[] = [];
      if (item.playlistIds !== undefined) {
        if (!Array.isArray(item.playlistIds)) return null;
        for (const pid of item.playlistIds) {
          const valid = sanitizeShortToken(pid);
          if (!valid) return null;
          if (!playlistIds.includes(valid)) playlistIds.push(valid);
        }
      }
      epgSources.push({ url, playlistIds });
    }
  }

  return {
    version: 1,
    revision,
    playlists,
    epgSources,
  };
}

export function resolveCatalogUrl(): string | null {
  let override = '';
  try {
    override = typeof localStorage !== 'undefined'
      ? localStorage.getItem(CONFIG.STORAGE_KEYS.CATALOG_URL) || ''
      : '';
  } catch {
    override = '';
  }
  const candidate = override.trim() || String(CONFIG.CATALOG_URL || '').trim();
  return sanitizeHttpUrl(candidate) || null;
}

function classifyFailure(error: unknown): string {
  if (error instanceof FetchTextError) return fetchFailureReason(error);
  if (error instanceof SyntaxError) return 'parse';
  if (error instanceof Error && /^HTTP \d+/.test(error.message)) {
    return `http_${error.message.split(/[\s:]/)[1]}`;
  }
  return 'network';
}

function toManagedPlaylist(
  item: CentralCatalogPlaylist,
  revision: string,
  previous?: PlaylistEntry,
): PlaylistEntry {
  const entry: PlaylistEntry = {
    id: item.id,
    name: item.name,
    url: item.url,
    source: item.source,
    ...(item.xtream ? { xtream: { ...item.xtream } } : {}),
    ...(previous?.enabled === false ? { enabled: false } : {}),
    managed: true,
    catalogRevision: item.revision ?? revision,
  };
  return entry;
}

function reconcilePlaylists(manifest: CentralCatalogManifest): boolean {
  const stored = StorageService.getPlaylists();
  const userPlaylists = stored.filter(pl => !pl.managed);
  const previousManaged = new Map<string, PlaylistEntry>();
  for (const pl of stored) {
    if (pl.managed) previousManaged.set(pl.id, pl);
  }

  const managedPlaylists = manifest.playlists.map(item =>
    toManagedPlaylist(item, manifest.revision, previousManaged.get(item.id)),
  );
  const merged = [...userPlaylists, ...managedPlaylists];
  if (JSON.stringify(stored) === JSON.stringify(merged)) return false;
  StorageService.setPlaylists(merged);
  return true;
}

function reconcileEpgSources(manifest: CentralCatalogManifest): boolean {
  const stored = StorageService.getManualEpgSources();
  const userSources = stored.filter(source => !source.managed);
  const seenUrls = new Set<string>(userSources.map(source => source.url));
  const managedSources: ManualEpgSource[] = [];

  for (const source of manifest.epgSources) {
    if (seenUrls.has(source.url)) continue;
    seenUrls.add(source.url);
    managedSources.push({
      url: source.url,
      playlistIds: source.playlistIds.slice(),
      managed: true,
    });
  }

  const merged = [...userSources, ...managedSources];
  if (JSON.stringify(stored) === JSON.stringify(merged)) return false;
  StorageService.setManualEpgSources(merged);
  return true;
}

export const CatalogBootstrapService = {
  async sync(catalogUrl = resolveCatalogUrl()): Promise<CatalogSyncResult> {
    if (!catalogUrl) return { status: 'disabled' };
    const safeUrl = diagnosticStreamUrl(catalogUrl);
    try {
      const response = await fetchWithTimeout(
        catalogUrl,
        { headers: { Accept: 'application/json' } },
        CATALOG_FETCH_TIMEOUT_MS,
      );
      const raw = await response.json();
      const manifest = parseCentralCatalog(raw);
      if (!manifest) {
        log.warn('Invalid central catalog manifest', 'event=catalog.bootstrap.invalid', `url=${safeUrl}`);
        return { status: 'error', reason: 'invalid_manifest' };
      }

      const playlistsChanged = reconcilePlaylists(manifest);
      const epgChanged = reconcileEpgSources(manifest);
      const status = playlistsChanged || epgChanged ? 'updated' : 'unchanged';
      if (status === 'updated') {
        log.info(
          'Synced central catalog manifest',
          'event=catalog.bootstrap.synced',
          `revision=${manifest.revision}`,
          `playlists=${String(manifest.playlists.length)}`,
          `epg=${String(manifest.epgSources.length)}`,
        );
      }
      return {
        status,
        revision: manifest.revision,
        playlistsChanged,
        epgChanged,
      };
    } catch (error) {
      const reason = classifyFailure(error);
      log.warn(
        'Central catalog sync failed; keeping existing entries',
        'event=catalog.bootstrap.failed',
        `reason=${reason}`,
        `url=${safeUrl}`,
      );
      return { status: 'error', reason };
    }
  },
};
