import { CONFIG } from '../config';

export type PlatformKind = 'webos' | 'tizen' | 'desktop';
export type MediaBackend = 'webos-native' | 'tizen-avplay' | 'desktop-mse';

export type PlatformKeyCodes = {
  [K in keyof typeof CONFIG.KEYS]: number;
};

export interface PlatformCapabilities {
  nativePlayback: boolean;
  lunaBus: boolean;
  bundledService: boolean;
  systemReminders: boolean;
  tvAspectRatio: boolean;
  magicRemote: boolean;
  webos4StartBitrateQuirk: boolean;
  compactArtwork: boolean;
}

export interface PlatformAdapter {
  kind: PlatformKind;
  mediaBackend: MediaBackend;
  keys: PlatformKeyCodes;
  capabilities: PlatformCapabilities;
  registerKeys(): void;
}

interface TizenTvInputDevice {
  registerKey?(keyName: string): void;
  registerKeyBatch?(keys: string[]): void;
}

interface TizenHostObject {
  tvinputdevice?: TizenTvInputDevice;
}

const TIZEN_REMOTE_KEYS = [
  'MediaPlayPause',
  'MediaPlay',
  'MediaPause',
  'MediaStop',
  'MediaRewind',
  'MediaFastForward',
  'ColorF0Red',
  'ColorF1Green',
  'ColorF2Yellow',
  'ColorF3Blue',
  'ChannelUp',
  'ChannelDown',
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
];

const DEFAULT_KEYS: PlatformKeyCodes = { ...CONFIG.KEYS };
const TIZEN_KEYS: PlatformKeyCodes = { ...CONFIG.KEYS, BACK: 10009 };

let adapterOverride: PlatformAdapter | null = null;

function hostWindow(): (Window & { tizen?: TizenHostObject }) | null {
  return typeof window !== 'undefined'
    ? (window as Window & { tizen?: TizenHostObject })
    : null;
}

function userAgentString(): string {
  return typeof navigator !== 'undefined' ? navigator.userAgent : '';
}

function parseChromeMajor(ua: string): number | null {
  const match = /Chrome\/(\d+)/.exec(ua);
  if (!match) return null;
  const major = parseInt(match[1], 10);
  return Number.isFinite(major) ? major : null;
}

function registerTizenKeys(): void {
  const tvInput = hostWindow()?.tizen?.tvinputdevice;
  if (!tvInput) return;
  if (typeof tvInput.registerKeyBatch === 'function') {
    try {
      tvInput.registerKeyBatch(TIZEN_REMOTE_KEYS.slice());
      return;
    } catch {
      // Fall back to individual key registration when batch fails.
    }
  }
  if (typeof tvInput.registerKey !== 'function') return;
  for (const keyName of TIZEN_REMOTE_KEYS) {
    try {
      tvInput.registerKey(keyName);
    } catch {
      // Unsupported hardware keys must not block initialization.
    }
  }
}

export function detectPlatformAdapter(): PlatformAdapter {
  const ua = userAgentString();
  if (/webOS|Web0S/i.test(ua)) {
    const chrome = parseChromeMajor(ua);
    return {
      kind: 'webos',
      mediaBackend: 'webos-native',
      keys: DEFAULT_KEYS,
      capabilities: {
        nativePlayback: true,
        lunaBus: true,
        bundledService: true,
        systemReminders: true,
        tvAspectRatio: true,
        magicRemote: true,
        webos4StartBitrateQuirk: chrome !== null && chrome < 68,
        compactArtwork: chrome !== null && chrome < 79,
      },
      registerKeys: () => {},
    };
  }

  if (/Tizen/i.test(ua) || typeof hostWindow()?.tizen !== 'undefined') {
    return {
      kind: 'tizen',
      mediaBackend: 'tizen-avplay',
      keys: TIZEN_KEYS,
      capabilities: {
        nativePlayback: true,
        lunaBus: false,
        bundledService: false,
        systemReminders: false,
        tvAspectRatio: false,
        magicRemote: false,
        webos4StartBitrateQuirk: false,
        compactArtwork: false,
      },
      registerKeys: registerTizenKeys,
    };
  }

  return {
    kind: 'desktop',
    mediaBackend: 'desktop-mse',
    keys: DEFAULT_KEYS,
    capabilities: {
      nativePlayback: false,
      lunaBus: false,
      bundledService: false,
      systemReminders: false,
      tvAspectRatio: false,
      magicRemote: false,
      webos4StartBitrateQuirk: false,
      compactArtwork: false,
    },
    registerKeys: () => {},
  };
}

export function setPlatformAdapter(adapter: PlatformAdapter | null): void {
  adapterOverride = adapter;
}

export function getPlatformAdapter(): PlatformAdapter {
  return adapterOverride ?? detectPlatformAdapter();
}
