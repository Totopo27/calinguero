// @vitest-environment jsdom
// NOTICE: Modified for the Calinguero project in 2026.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  flatMapPolyfill,
  fromEntriesPolyfill,
  objectEntriesPolyfill,
  objectValuesPolyfill,
  padStartPolyfill,
  scrollIntoViewFallback,
  selectPluralCategory,
} from './polyfills';
import { localeOptions } from './i18n';

function rect(top: number, bottom: number, left = 0, right = 100): DOMRect {
  return {
    top,
    bottom,
    left,
    right,
    width: right - left,
    height: bottom - top,
    x: left,
    y: top,
    toJSON() {},
  } as DOMRect;
}

describe('flatMapPolyfill', () => {
  it('maps and flattens one level', () => {
    const out = flatMapPolyfill.call([1, 2, 3], (x) => [x, (x as number) * 2]);
    expect(out).toEqual([1, 2, 2, 4, 3, 6]);
  });

  it('keeps non-array return values as single elements', () => {
    const out = flatMapPolyfill.call([1, 2], (x) => x);
    expect(out).toEqual([1, 2]);
  });

  it('flattens only one level (nested arrays are preserved)', () => {
    const out = flatMapPolyfill.call([1], () => [[9]]);
    expect(out).toEqual([[9]]);
  });

  it('skips holes in a sparse mapped array (matches native FlattenIntoArray)', () => {
    const sparse: number[] = [];
    sparse[0] = 5;
    sparse[2] = 9; // index 1 is a hole
    const out = flatMapPolyfill.call([1], () => sparse);
    expect(out).toEqual([5, 9]);
  });

  it('passes index and array to the callback', () => {
    const seen: number[] = [];
    flatMapPolyfill.call(['a', 'b'], (_v, i) => {
      seen.push(i as number);
      return [];
    });
    expect(seen).toEqual([0, 1]);
  });

  it('honours thisArg', () => {
    const ctx = { mult: 10 };
    const out = flatMapPolyfill.call(
      [1, 2],
      function (this: typeof ctx, x) {
        return [(x as number) * this.mult];
      },
      ctx,
    );
    expect(out).toEqual([10, 20]);
  });
});

describe('fromEntriesPolyfill', () => {
  it('builds an object from an array of key/value pairs', () => {
    const out = fromEntriesPolyfill([
      ['a', 1],
      ['b', 2],
    ]);
    expect(out).toEqual({ a: 1, b: 2 });
  });

  it('accepts any iterable of pairs (e.g. a Map)', () => {
    const out = fromEntriesPolyfill(
      new Map<string, number>([
        ['x', 9],
        ['y', 8],
      ]),
    );
    expect(out).toEqual({ x: 9, y: 8 });
  });

  it('lets a later duplicate key win', () => {
    const out = fromEntriesPolyfill([
      ['k', 1],
      ['k', 2],
    ]);
    expect(out).toEqual({ k: 2 });
  });
});

describe('padStartPolyfill', () => {
  it('pads strings without truncating existing content', () => {
    expect(padStartPolyfill.call('7', 3, '0')).toBe('007');
    expect(padStartPolyfill.call('long', 2, '0')).toBe('long');
  });
});

describe('objectValuesPolyfill / objectEntriesPolyfill', () => {
  it('return enumerable own values and entries, skipping inherited ones', () => {
    const value = Object.create({ inherited: 0 }) as Record<string, number>;
    value.alpha = 1;
    value.bravo = 2;
    expect(objectValuesPolyfill(value)).toEqual([1, 2]);
    expect(objectEntriesPolyfill(value)).toEqual([['alpha', 1], ['bravo', 2]]);
  });
});

describe('Intl.PluralRules polyfill', () => {
  it('selects cardinal forms used by every app locale', () => {
    expect(selectPluralCategory('en', 1)).toBe('one');
    expect(selectPluralCategory('de', 2)).toBe('other');
    expect(selectPluralCategory('fr', 0)).toBe('one');
    expect(selectPluralCategory('pt', 0)).toBe('one');
    expect(selectPluralCategory('ru', 1)).toBe('one');
    expect(selectPluralCategory('ru', 2)).toBe('few');
    expect(selectPluralCategory('ru', 5)).toBe('many');
    expect(selectPluralCategory('uk', 22)).toBe('few');
    expect(selectPluralCategory('zh', 1)).toBe('other');
    expect(selectPluralCategory('pl', 1)).toBe('one');
    expect(selectPluralCategory('pl', 2)).toBe('few');
    expect(selectPluralCategory('pl', 5)).toBe('many');
    expect(selectPluralCategory('pl', 12)).toBe('many');
    expect(selectPluralCategory('pl', 21)).toBe('many');
    expect(selectPluralCategory('pl', 22)).toBe('few');
    expect(selectPluralCategory('tr', 1)).toBe('one');
    expect(selectPluralCategory('tr', 2)).toBe('other');
    expect(selectPluralCategory('tr', 0)).toBe('other');
  });

  it('matches the native rules for every app locale', () => {
    for (const { value: locale } of localeOptions()) {
      const native = new Intl.PluralRules(locale);
      const language = locale.toLowerCase().split('-')[0];
      for (let count = 0; count <= 1000; count++) {
        expect(`${locale} ${count}: ${selectPluralCategory(language, count)}`)
          .toBe(`${locale} ${count}: ${native.select(count)}`);
      }
    }
  });

  it('installs only when the native implementation is unavailable', async () => {
    const legacyIntl = Object.create(Intl) as typeof Intl;
    Object.defineProperty(legacyIntl, 'PluralRules', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    vi.stubGlobal('Intl', legacyIntl);
    vi.resetModules();
    try {
      await import('./polyfills');
      expect(new Intl.PluralRules('ru').select(22)).toBe('few');
      expect(new Intl.PluralRules('zh-CN').select(1)).toBe('other');
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });
});

describe('scrollIntoView options polyfill', () => {
  const originalScrollIntoView = Object.getOwnPropertyDescriptor(
    Element.prototype,
    'scrollIntoView',
  );
  const style = document.documentElement.style;
  const originalScrollBehavior = Object.getOwnPropertyDescriptor(style, 'scrollBehavior');

  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    if (originalScrollIntoView) {
      Object.defineProperty(Element.prototype, 'scrollIntoView', originalScrollIntoView);
    } else {
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    }
    if (originalScrollBehavior) {
      Object.defineProperty(style, 'scrollBehavior', originalScrollBehavior);
    } else {
      Reflect.deleteProperty(style, 'scrollBehavior');
    }
    vi.resetModules();
  });

  it('does not move a nearest-aligned item that is already visible', () => {
    const scroller = document.createElement('div');
    const item = document.createElement('button');
    scroller.appendChild(item);
    document.body.appendChild(scroller);
    scroller.style.overflowY = 'auto';
    Object.defineProperties(scroller, {
      clientHeight: { value: 200 },
      scrollHeight: { value: 800 },
    });
    scroller.scrollTop = 100;
    scroller.getBoundingClientRect = vi.fn(() => rect(0, 200));
    item.getBoundingClientRect = vi.fn(() => rect(40, 80));

    scrollIntoViewFallback(item, { block: 'nearest', inline: 'nearest' });

    expect(scroller.scrollTop).toBe(100);
  });

  it('moves only enough to reveal an item below the viewport', () => {
    const scroller = document.createElement('div');
    const item = document.createElement('button');
    scroller.appendChild(item);
    document.body.appendChild(scroller);
    scroller.style.overflowY = 'auto';
    Object.defineProperties(scroller, {
      clientHeight: { value: 200 },
      scrollHeight: { value: 800 },
    });
    scroller.scrollTop = 100;
    scroller.getBoundingClientRect = vi.fn(() => rect(0, 200));
    item.getBoundingClientRect = vi.fn(() => rect(240, 280));

    scrollIntoViewFallback(item, { block: 'nearest', inline: 'nearest' });

    expect(scroller.scrollTop).toBe(180);
  });

  it('supports start alignment for settings category navigation', () => {
    const scroller = document.createElement('div');
    const item = document.createElement('section');
    scroller.appendChild(item);
    document.body.appendChild(scroller);
    scroller.style.overflowY = 'auto';
    Object.defineProperties(scroller, {
      clientHeight: { value: 200 },
      scrollHeight: { value: 800 },
    });
    scroller.scrollTop = 50;
    scroller.getBoundingClientRect = vi.fn(() => rect(20, 220));
    item.getBoundingClientRect = vi.fn(() => rect(140, 180));

    scrollIntoViewFallback(item, { block: 'start', inline: 'nearest' });

    expect(scroller.scrollTop).toBe(170);
  });

  it('uses the fallback for options but preserves legacy boolean calls', async () => {
    const nativeScrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      value: nativeScrollIntoView,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(style, 'scrollBehavior', {
      value: undefined,
      configurable: true,
    });
    await import('./polyfills');

    const scroller = document.createElement('div');
    const item = document.createElement('button');
    scroller.appendChild(item);
    document.body.appendChild(scroller);
    scroller.style.overflowY = 'auto';
    Object.defineProperties(scroller, {
      clientHeight: { value: 200 },
      scrollHeight: { value: 800 },
    });
    scroller.scrollTop = 100;
    scroller.getBoundingClientRect = vi.fn(() => rect(0, 200));
    item.getBoundingClientRect = vi.fn(() => rect(240, 280));

    item.scrollIntoView({ block: 'nearest' });
    expect(scroller.scrollTop).toBe(180);
    expect(nativeScrollIntoView).not.toHaveBeenCalled();

    item.scrollIntoView(false);
    expect(nativeScrollIntoView).toHaveBeenCalledWith(false);
  });

  it('leaves the native method untouched when options are supported', async () => {
    const nativeScrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      value: nativeScrollIntoView,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(style, 'scrollBehavior', {
      value: '',
      configurable: true,
    });

    await import('./polyfills');

    expect(Element.prototype.scrollIntoView).toBe(nativeScrollIntoView);
  });
});

// The consolidated src/polyfills.ts installs its own AbortController (with a
// fetch-cancellation wrapper) only when the platform has none at all. An
// import ordering bug once let a weaker, wrapper-less AbortController shim
// install first and win — this guards the guarded-install + fetch-wrapping
// behavior directly, independent of import order.
describe('installAbortController (fetch cancellation polyfill)', () => {
  // Production only runs this module in a browser/worker scope, where `self`
  // always exists; stub it here too so the install path can run under Node.
  function stubMissingAbortController(): void {
    vi.stubGlobal('self', globalThis);
    vi.stubGlobal('AbortController', undefined);
  }

  // The un-stubbed module is already cached (from the static imports above),
  // so each test needs its own fresh module instance to observe the stubs.
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('installs a working AbortController when the platform has none', async () => {
    stubMissingAbortController();
    await import('./polyfills');
    expect(typeof globalThis.AbortController).toBe('function');
    const controller = new AbortController();
    expect(controller.signal.aborted).toBe(false);
    controller.abort();
    expect(controller.signal.aborted).toBe(true);
  });

  it('rejects an in-flight fetch with an AbortError once the signal aborts', async () => {
    stubMissingAbortController();
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    await import('./polyfills');

    const controller = new AbortController();
    const pending = fetch('http://host/a', { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects immediately when fetch is called with an already-aborted signal', async () => {
    stubMissingAbortController();
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    await import('./polyfills');

    const controller = new AbortController();
    controller.abort();
    await expect(fetch('http://host/a', { signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
  });

  it('resolves normally when the signal never aborts', async () => {
    stubMissingAbortController();
    const response = { ok: true } as Response;
    vi.stubGlobal('fetch', vi.fn(async () => response));
    await import('./polyfills');

    const controller = new AbortController();
    await expect(fetch('http://host/a', { signal: controller.signal })).resolves.toBe(response);
  });

  it('leaves the native AbortController untouched when the platform already has one', async () => {
    const native = globalThis.AbortController;
    await import('./polyfills');
    expect(globalThis.AbortController).toBe(native);
  });

  it('aborts response.text() when signaled after headers arrive', async () => {
    stubMissingAbortController();
    const cancel = vi.fn(async () => {});
    const response = {
      ok: true,
      status: 200,
      text: () => new Promise<string>(() => {}),
      body: { getReader: () => ({ read: vi.fn(), cancel }), cancel },
    } as unknown as Response;
    vi.stubGlobal('fetch', vi.fn(async () => response));
    await import('./polyfills');

    const controller = new AbortController();
    const res = await fetch('http://host/a', { signal: controller.signal });
    const textPromise = res.text();
    controller.abort();

    await expect(Promise.race([textPromise, Promise.resolve().then(() => 'still-pending')]))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(cancel).toHaveBeenCalled();
  });

  it('rejects an in-flight stream reader.read() on abort instead of resolving done: true', async () => {
    stubMissingAbortController();
    let finishPendingRead!: (result: ReadableStreamReadResult<Uint8Array>) => void;
    const cancel = vi.fn(async () => {
      finishPendingRead?.({ value: undefined, done: true });
    });
    const read = vi.fn()
      .mockResolvedValueOnce({ value: new Uint8Array([65]), done: false })
      .mockImplementationOnce(() => new Promise<ReadableStreamReadResult<Uint8Array>>((resolve) => {
        finishPendingRead = resolve;
      }));
    const response = {
      ok: true,
      status: 200,
      body: { getReader: () => ({ read, cancel, releaseLock: vi.fn(), closed: Promise.resolve() }), cancel },
    } as unknown as Response;
    vi.stubGlobal('fetch', vi.fn(async () => response));
    await import('./polyfills');

    const controller = new AbortController();
    const res = await fetch('http://host/a', { signal: controller.signal });
    const reader = res.body!.getReader();
    await expect(reader.read()).resolves.toEqual({ value: new Uint8Array([65]), done: false });

    const pendingRead = reader.read();
    controller.abort();

    await expect(Promise.race([pendingRead, Promise.resolve().then(() => 'still-pending')]))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(cancel).toHaveBeenCalled();
  });

  it('delegates reader cancel and releaseLock without WebIDL illegal invocation on real Response', async () => {
    stubMissingAbortController();
    const real = new Response('hello');
    vi.stubGlobal('fetch', vi.fn(async () => real));
    await import('./polyfills');

    const controller = new AbortController();
    const res = await fetch('http://host/a', { signal: controller.signal });
    const reader = res.body!.getReader();
    expect(res.body!.locked).toBe(true);
    await expect(reader.cancel()).resolves.toBeUndefined();
    reader.releaseLock();
  });

  it('removes the abort listener when response.text() throws synchronously', async () => {
    stubMissingAbortController();
    const cancel = vi.fn(async () => {});
    const response = {
      ok: true,
      status: 200,
      text: () => { throw new Error('sync boom'); },
      body: { getReader: () => ({ read: vi.fn(), cancel }), cancel },
    } as unknown as Response;
    vi.stubGlobal('fetch', vi.fn(async () => response));
    await import('./polyfills');

    const controller = new AbortController();
    const res = await fetch('http://host/a', { signal: controller.signal });
    await expect(res.text()).rejects.toThrow('sync boom');

    controller.abort();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('aborts fetchLimitedText mid-body under the polyfill on timeout or caller abort', async () => {
    stubMissingAbortController();
    vi.useFakeTimers();
    try {
      const stalledStreamResponse = () => {
        const cancel = vi.fn(async () => {});
        const read = vi.fn()
          .mockResolvedValueOnce({ value: new TextEncoder().encode('#EXTM3U\n'), done: false })
          .mockImplementationOnce(() => new Promise<ReadableStreamReadResult<Uint8Array>>(() => {}));
        return {
          ok: true,
          status: 200,
          body: { getReader: () => ({ read, cancel, releaseLock: vi.fn(), closed: Promise.resolve() }), cancel },
        } as unknown as Response;
      };
      vi.stubGlobal('fetch', vi.fn(async () => stalledStreamResponse()));
      await import('./polyfills');
      const { fetchLimitedText } = await import('./utils/fetch-helper');

      const caller = new AbortController();
      const aborted = fetchLimitedText('http://host/a', 1024, 5000, caller.signal)
        .then(() => 'resolved', (e: unknown) => e);
      await vi.advanceTimersByTimeAsync(0);
      caller.abort();
      await vi.advanceTimersByTimeAsync(0);
      await expect(Promise.race([aborted, Promise.resolve('still-pending')]))
        .resolves.toMatchObject({ code: 'aborted' });

      const timedOut = fetchLimitedText('http://host/a', 1024, 5000)
        .then(() => 'resolved', (e: unknown) => e);
      await vi.advanceTimersByTimeAsync(5000);
      await expect(Promise.race([timedOut, Promise.resolve('still-pending')]))
        .resolves.toMatchObject({ code: 'timeout' });
    } finally {
      vi.useRealTimers();
    }
  });
});
