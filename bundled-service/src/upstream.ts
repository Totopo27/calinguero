// NOTICE: Modified for the Calinguero project in 2026.
/**
 * One upstream http(s) request, shared by fetchManifest and the loopback
 * proxy: its request options, and where a redirect leads with which
 * credentials.
 */

import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as nodeUrl from 'url';

export const MAX_REDIRECTS = 5;
export const REDIRECT_STATUSES = [301, 302, 303, 307, 308];
// As on the app's Luna path, UMS does not verify TLS certificates, so
// credentials never travel over https; they also never leave their origin.
const CREDENTIAL_HEADERS = ['authorization', 'cookie'];
// Headers allowed across origins when a manifest or segment leaves the stream's own origin.
const CROSS_ORIGIN_SAFE_HEADERS = ['accept', 'accept-language', 'origin', 'referer', 'user-agent'];

export function httpUrl(input: unknown): nodeUrl.Url | null {
  if (typeof input !== 'string' || !input || /[\0-\x20\x7f]/.test(input)) return null;
  let parsed: nodeUrl.Url;
  try {
    parsed = nodeUrl.parse(input);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return parsed.hostname ? parsed : null;
}

// 127/8, 0/8, ::1, ::, and their IPv4-mapped / IPv4-compatible forms.
export function isLoopbackAddress(address: string): boolean {
  let host = String(address || '').toLowerCase();
  if (host.charAt(0) === '[' && host.charAt(host.length - 1) === ']') host = host.slice(1, -1);
  const zoneAt = host.indexOf('%');
  const bare = zoneAt >= 0 ? host.slice(0, zoneAt) : host;
  if (net.isIPv4(bare)) {
    const first = Number(bare.split('.')[0]);
    return first === 127 || first === 0;
  }
  if (!net.isIPv6(bare)) return false;

  let hexAddr = bare;
  const hadEmbeddedIPv4 = bare.indexOf('.') >= 0;
  if (hadEmbeddedIPv4) {
    const lastColon = bare.lastIndexOf(':');
    if (lastColon < 0) return false;
    const ipv4Part = bare.slice(lastColon + 1);
    if (!net.isIPv4(ipv4Part)) return false;
    const octets = ipv4Part.split('.');
    const high = ((Number(octets[0]) << 8) | Number(octets[1])).toString(16);
    const low = ((Number(octets[2]) << 8) | Number(octets[3])).toString(16);
    hexAddr = bare.slice(0, lastColon + 1) + high + ':' + low;
  }

  const halves = hexAddr.split('::');
  if (halves.length > 2) return false;
  let rawGroups: string[];
  if (halves.length === 1) {
    rawGroups = halves[0].split(':');
  } else {
    const head = halves[0] ? halves[0].split(':') : [];
    const tail = halves[1] ? halves[1].split(':') : [];
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return false;
    const zeros: string[] = [];
    for (let i = 0; i < missing; i++) zeros.push('0');
    rawGroups = head.concat(zeros, tail);
  }
  if (rawGroups.length !== 8) return false;

  const groups: number[] = [];
  for (let i = 0; i < 8; i++) {
    const parsedGroup = parseInt(rawGroups[i] || '0', 16);
    if (isNaN(parsedGroup)) return false;
    groups.push(parsedGroup);
  }
  for (let i = 0; i < 5; i++) {
    if (groups[i] !== 0) return false;
  }
  const firstOctet = (groups[6] >> 8) & 0xff;
  if (groups[5] === 0xffff) return firstOctet === 127 || firstOctet === 0;
  if (groups[5] !== 0) return false;
  if (groups[6] === 0 && groups[7] <= 1) return true;
  if (firstOctet === 127) return true;
  return firstOctet === 0 && (groups[6] !== 0 || hadEmbeddedIPv4);
}

export function withoutCredentials(headers: Record<string, string>): Record<string, string> {
  const kept: Record<string, string> = {};
  Object.keys(headers).forEach((name) => {
    if (CREDENTIAL_HEADERS.indexOf(name) < 0) kept[name] = headers[name];
  });
  return kept;
}

export function crossOriginHeaders(headers: Record<string, string>): Record<string, string> {
  const kept: Record<string, string> = {};
  Object.keys(headers).forEach((name) => {
    if (CROSS_ORIGIN_SAFE_HEADERS.indexOf(name) >= 0) kept[name] = headers[name];
  });
  return kept;
}

/** The headers one request sends: credentials stay off https. */
export function requestHeaders(protocol: string, carried: Record<string, string>): Record<string, string> {
  const headers = protocol === 'https:' ? withoutCredentials(carried) : carried;
  const outgoing: Record<string, string> = { 'accept-encoding': 'gzip, deflate' };
  Object.keys(headers).forEach((name) => { outgoing[name] = headers[name]; });
  return outgoing;
}

// The URL's user:password goes out as Basic auth over http only, as Cookie
// and Authorization do; a redirect carries it only within its origin.
export function requestAuth(url: nodeUrl.Url, carried: string): string | undefined {
  return url.protocol === 'https:' || !carried ? undefined : carried;
}

export function origin(url: nodeUrl.Url): string {
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  return url.protocol + '//' + (url.hostname || '').toLowerCase() + ':' + port;
}

export function transport(url: nodeUrl.Url): { request(options: https.RequestOptions): http.ClientRequest } {
  return url.protocol === 'https:' ? https : http;
}

export function upstreamOptions(
  url: nodeUrl.Url,
  method: string,
  headers: Record<string, string>,
  auth: string,
  agent: http.Agent | false,
): https.RequestOptions {
  const options: https.RequestOptions = {
    method: method,
    hostname: url.hostname,
    port: url.port ? Number(url.port) : undefined,
    path: url.path || '/',
    headers: headers,
    agent: agent,
  };
  const basic = requestAuth(url, auth);
  if (basic) options.auth = basic;
  // UMS plays the stream without verifying the certificate either; no
  // credential is ever sent over https.
  if (url.protocol === 'https:') options.rejectUnauthorized = false;
  return options;
}

export function isRedirect(status: number, location: unknown): location is string {
  return REDIRECT_STATUSES.indexOf(status) >= 0 && typeof location === 'string' && !!location;
}

export interface NextHop {
  url: nodeUrl.Url;
  carried: Record<string, string>;
  auth: string;
}

export type HopFailure = 'too_many_redirects' | 'bad_url';

/** Where a redirect from `url` after `redirects` hops leads, and what it carries there. */
export function nextHop(
  url: nodeUrl.Url,
  location: string,
  redirects: number,
  carried: Record<string, string>,
  auth: string,
): NextHop | HopFailure {
  if (redirects >= MAX_REDIRECTS) return 'too_many_redirects';
  let resolved: string;
  try {
    resolved = nodeUrl.resolve(url.href || '', location);
  } catch {
    return 'bad_url';
  }
  const next = httpUrl(resolved);
  if (!next) return 'bad_url';
  const sameOrigin = origin(next) === origin(url);
  return {
    url: next,
    carried: sameOrigin ? carried : crossOriginHeaders(carried),
    auth: sameOrigin ? next.auth || auth : '',
  };
}
