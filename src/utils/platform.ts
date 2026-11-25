// NOTICE: Modified for the Calinguero project in 2026.
import { getPlatformAdapter } from '../platform/platform-adapter';

export { getPlatformAdapter };

export function isWebOS(): boolean {
  return getPlatformAdapter().kind === 'webos';
}

export function isTizen(): boolean {
  return getPlatformAdapter().kind === 'tizen';
}

// webOS 4 and 5 (Chromium 53 and 68) run on the weakest SoCs.
export function isWebOSBefore6(): boolean {
  const platform = getPlatformAdapter();
  return platform.kind === 'webos' && platform.capabilities.compactArtwork;
}

// webOS 4 is the only target on Chromium 53. Its media pipeline starts an
// adaptive stream on the first variant at or above the start bitrate, where
// later versions take the highest one at or below it.
export function isWebOS4(): boolean {
  const platform = getPlatformAdapter();
  return platform.kind === 'webos' && platform.capabilities.webos4StartBitrateQuirk;
}
