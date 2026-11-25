// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../config';
import {
  detectPlatformAdapter,
  getPlatformAdapter,
  setPlatformAdapter,
} from './platform-adapter';
import { isTizen, isWebOS, isWebOS4, isWebOSBefore6 } from '../utils/platform';

describe('PlatformAdapter detection and capabilities', () => {
  const originalUa = navigator.userAgent;

  const setUserAgent = (ua: string) => {
    Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
  };

  const clearTizenGlobal = () => {
    delete (window as unknown as { tizen?: unknown }).tizen;
  };

  afterEach(() => {
    setPlatformAdapter(null);
    setUserAgent(originalUa);
    clearTizenGlobal();
  });

  it('detects webOS 4/5/6+ capabilities and native webOS keys from User-Agent', () => {
    setUserAgent('Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 Chrome/53.0.2785.34');
    const v4 = detectPlatformAdapter();
    expect(v4.kind).toBe('webos');
    expect(v4.mediaBackend).toBe('webos-native');
    expect(v4.keys.BACK).toBe(CONFIG.KEYS.BACK);
    expect(v4.capabilities).toEqual({
      nativePlayback: true,
      lunaBus: true,
      bundledService: true,
      systemReminders: true,
      tvAspectRatio: true,
      magicRemote: true,
      webos4StartBitrateQuirk: true,
      compactArtwork: true,
    });
    expect(isWebOS()).toBe(true);
    expect(isWebOSBefore6()).toBe(true);
    expect(isWebOS4()).toBe(true);
    expect(isTizen()).toBe(false);

    setUserAgent('Mozilla/5.0 (webOS; Linux/SmartTV) Chrome/68.0.3440.106');
    const v5 = detectPlatformAdapter();
    expect(v5.capabilities.webos4StartBitrateQuirk).toBe(false);
    expect(v5.capabilities.compactArtwork).toBe(true);

    setUserAgent('Mozilla/5.0 (webOS; Linux/SmartTV) Chrome/79.0.3945.79');
    expect(isWebOS()).toBe(true);
    expect(isWebOSBefore6()).toBe(false);
    expect(isWebOS4()).toBe(false);
  });

  it('detects Tizen with BACK=10009, isolated non-webOS capabilities, and safe key registration', () => {
    const registerKeyBatch = vi.fn();
    (window as unknown as { tizen?: unknown }).tizen = {
      tvinputdevice: { registerKeyBatch },
    };
    setUserAgent('Mozilla/5.0 (SMART-TV; LINUX; Tizen 7.0) Chrome/94.0.4606.31');

    const tizen = detectPlatformAdapter();
    expect(tizen.kind).toBe('tizen');
    expect(tizen.mediaBackend).toBe('tizen-avplay');
    expect(tizen.keys.BACK).toBe(10009);
    expect(tizen.capabilities).toEqual({
      nativePlayback: true,
      lunaBus: false,
      bundledService: false,
      systemReminders: false,
      tvAspectRatio: false,
      magicRemote: false,
      webos4StartBitrateQuirk: false,
      compactArtwork: false,
    });
    expect(isTizen()).toBe(true);
    expect(isWebOS()).toBe(false);

    tizen.registerKeys();
    expect(registerKeyBatch).toHaveBeenCalledTimes(1);
    expect(registerKeyBatch.mock.calls[0][0]).toEqual(
      expect.arrayContaining(['MediaPlay', 'ColorF0Red', 'ChannelUp']),
    );

    const registerKey = vi.fn(() => {
      throw new Error('unsupported key');
    });
    (window as unknown as { tizen?: unknown }).tizen = {
      tvinputdevice: { registerKey },
    };
    expect(() => detectPlatformAdapter().registerKeys()).not.toThrow();
    expect(registerKey).toHaveBeenCalled();
  });

  it('falls back to desktop MSE and honors setPlatformAdapter override/reset', () => {
    setUserAgent('Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0.0.0');
    const desktop = detectPlatformAdapter();
    expect(desktop.kind).toBe('desktop');
    expect(desktop.mediaBackend).toBe('desktop-mse');
    expect(desktop.capabilities.lunaBus).toBe(false);
    expect(() => desktop.registerKeys()).not.toThrow();

    const custom = {
      ...desktop,
      kind: 'tizen' as const,
      mediaBackend: 'tizen-avplay' as const,
      keys: { ...CONFIG.KEYS, BACK: 10009 },
    };
    setPlatformAdapter(custom);
    expect(getPlatformAdapter()).toBe(custom);
    expect(isTizen()).toBe(true);

    setPlatformAdapter(null);
    expect(getPlatformAdapter().kind).toBe('desktop');
  });
});
