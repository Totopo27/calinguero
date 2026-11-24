// NOTICE: Modified for the Calinguero project in 2026.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createKeepAlive, type ActivityManagerLike } from './keep-alive';
import { registerLanService } from './lan/service';

vi.mock('./lan/server', () => ({
  startServer: () => Promise.resolve({ server: { close: (cb: (e?: Error) => void) => cb() }, port: 1234 }),
}));

// Shaped like webos-service's ActivityManager: create answers asynchronously
// with the activity object, and complete releases only that object.
function fakeManager(): ActivityManagerLike & { live: Set<number> } {
  const live = new Set<number>();
  let next = 1;
  return {
    live,
    create(name, callback) {
      const activity: { activity: { name: string }; activityId?: number } = { activity: { name } };
      setTimeout(() => {
        activity.activityId = next++;
        live.add(activity.activityId);
        callback(activity);
      }, 1);
    },
    complete(activity, callback) {
      const a = activity as { activityId?: number; completed?: boolean };
      if (!a || typeof a !== 'object' || a.completed || a.activityId === undefined) return;
      a.completed = true;
      live.delete(a.activityId);
      setTimeout(callback, 1);
    },
  };
}

const log = { info: () => undefined, warn: () => undefined, error: () => undefined };
// Fake timers: a real 5ms wait lost the race to the 1ms create on a loaded CI runner.
const tick = () => vi.advanceTimersByTimeAsync(5);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('createKeepAlive', () => {
  it('completes each activity it created across hold/release cycles', async () => {
    const manager = fakeManager();
    const keepAlive = createKeepAlive(() => manager, 'test', log);
    for (let i = 0; i < 3; i++) {
      keepAlive.hold();
      await tick();
      expect(manager.live.size).toBe(1);
      keepAlive.release();
      await tick();
    }
    expect(manager.live.size).toBe(0);
  });

  it('completes an activity released before its create answered', async () => {
    const manager = fakeManager();
    const keepAlive = createKeepAlive(() => manager, 'test', log);
    keepAlive.hold();
    keepAlive.release();
    await tick();
    expect(manager.live.size).toBe(0);
    keepAlive.hold();
    keepAlive.hold();
    await tick();
    expect(manager.live.size).toBe(1);
  });
});

describe('LAN service keepAlive', () => {
  it('completes the created activity on stop', async () => {
    const manager = fakeManager();
    const handlers: Record<string, (msg: { respond: (r: unknown) => void }) => void> = {};
    registerLanService({ register: (method, handler) => { handlers[method] = handler; }, activityManager: manager },
      'data');
    await tick();
    expect(manager.live.size).toBe(1);
    handlers.stop({ respond: () => undefined });
    await tick();
    expect(manager.live.size).toBe(0);
  });

  it('denies foreign callers on LAN Luna methods when appId is configured and allows the app', async () => {
    const manager = fakeManager();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lan-svc-auth-'));
    fs.writeFileSync(path.join(dir, 'sample.m3u'), '#EXTM3U\n#EXTINF:-1,Ch\nhttp://host/a\n');
    fs.writeFileSync(path.join(dir, 'sample.json'), '{"id":"sample","name":"Sample","count":1,"createdAt":1}');
    const handlers: Record<string, (msg: {
      sender?: string;
      isSubscription?: boolean;
      respond: (r: unknown) => void;
    }) => void> = {};
    try {
      (registerLanService as (s: unknown, d: string, appId?: string) => void)(
        { register: (method: string, handler: typeof handlers[string]) => { handlers[method] = handler; }, activityManager: manager },
        dir,
        'com.example.app',
      );
      await tick();

      const denied = { returnValue: false, errorCode: 'denied', errorText: 'Caller is not allowed' };
      const call = (method: string, sender: string, isSubscription?: boolean) => {
        let reply: unknown;
        handlers[method]({ sender, isSubscription, respond: (r) => { reply = r; } });
        return reply;
      };

      expect(call('start', 'com.example.other')).toEqual(denied);
      expect(call('heartbeat', 'com.example.other')).toEqual(denied);
      expect(call('serviceEvents', 'com.example.other', true)).toEqual(denied);
      expect(call('stop', 'com.example.other')).toEqual(denied);
      expect(manager.live.size).toBe(1);
      expect(call('resetData', 'com.example.other')).toEqual(denied);
      expect(fs.existsSync(path.join(dir, 'sample.m3u'))).toBe(true);

      expect(call('heartbeat', 'com.example.app 1234')).toEqual({ running: true, port: 1234 });
      expect(call('serviceEvents', 'com.example.app', true)).toEqual({ subscribed: true });
      expect(call('resetData', 'com.example.app')).toEqual({ returnValue: true, reset: true, removed: 1 });
      expect(fs.existsSync(path.join(dir, 'sample.m3u'))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
