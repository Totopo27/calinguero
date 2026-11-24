// NOTICE: Modified for the Calinguero project in 2026.
import { describe, expect, it, vi } from 'vitest';
import * as alertModule from './alert';
import { localizedAlertCopy, registerReminderService } from './service';

describe('localizedAlertCopy', () => {
  it('keeps callbacks without a copy version on the legacy English path', () => {
    expect(localizedAlertCopy({ title: 'Alpha' })).toBeUndefined();
  });

  it('accepts complete versioned copy', () => {
    expect(localizedAlertCopy({
      copyVersion: 1,
      alertTitle: 'Title l1',
      alertMessage: 'Message l1',
      watchLabel: 'Watch l1',
      cancelLabel: 'Cancel l1',
    })).toEqual({
      title: 'Title l1',
      message: 'Message l1',
      watchLabel: 'Watch l1',
      cancelLabel: 'Cancel l1',
    });
  });

  it('rejects incomplete or unknown versioned copy', () => {
    expect(localizedAlertCopy({ copyVersion: 1, alertTitle: 'Title l1' })).toBeNull();
    expect(localizedAlertCopy({ copyVersion: 2 })).toBeNull();
  });
});

describe('registerReminderService caller and appId enforcement', () => {
  it('restricts getDevMode to the app and allows only the app or activitymanager on fireReminderAlert', () => {
    vi.spyOn(alertModule, 'isDevMode').mockReturnValue(true);
    const fireSpy = vi.spyOn(alertModule, 'fireAlert').mockImplementation((_payload, cb) => {
      cb(true, 'ok');
    });

    const handlers: Record<string, (msg: {
      sender?: string;
      ls2Message?: { applicationID?: () => string; senderServiceName?: () => string };
      payload?: Record<string, unknown>;
      respond: (r: unknown) => void;
    }) => void> = {};

    (registerReminderService as (s: unknown, appId?: string) => void)(
      { register: (m: string, h: typeof handlers[string]) => { handlers[m] = h; } },
      'com.example.app',
    );

    const call = (method: string, msg: Partial<Parameters<typeof handlers[string]>[0]>) => {
      let reply: unknown;
      handlers[method]({ ...msg, respond: (r) => { reply = r; } });
      return reply;
    };

    try {
      expect(call('getDevMode', { sender: 'com.example.other' })).toEqual({
        returnValue: false,
        errorCode: 'denied',
        errorText: 'Caller is not allowed',
      });
      expect(call('getDevMode', { sender: 'com.example.app 1234' })).toEqual({ devmode: true });

      expect(call('fireReminderAlert', {
        sender: 'com.example.other',
        payload: { title: 'T', channelName: 'C', channelKey: 'k1', appId: 'com.evil.app' },
      })).toEqual({
        returnValue: false,
        fired: false,
        errorCode: 'denied',
        errorText: 'Caller is not allowed',
      });
      expect(fireSpy).not.toHaveBeenCalled();

      expect(call('fireReminderAlert', {
        ls2Message: {
          applicationID: () => '',
          senderServiceName: () => 'com.webos.service.activitymanager',
        },
        payload: { title: 'T', channelName: 'C', channelKey: 'k1', appId: 'com.evil.app' },
      })).toEqual({ fired: true, result: 'ok' });
      expect(fireSpy).toHaveBeenCalledTimes(1);
      expect(fireSpy.mock.calls[0][0].sourceId).toBe('com.example.app');
      expect(fireSpy.mock.calls[0][0].buttons[0].params).toEqual({
        id: 'com.example.app',
        params: { reminderChannelKey: 'k1' },
      });

      expect(call('fireReminderAlert', {
        sender: 'com.example.app',
        payload: { title: 'T', channelName: 'C', channelKey: 'k2', appId: 'com.evil.app' },
      })).toEqual({ fired: true, result: 'ok' });
      expect(fireSpy).toHaveBeenCalledTimes(2);
      expect(fireSpy.mock.calls[1][0].sourceId).toBe('com.example.app');
    } finally {
      vi.restoreAllMocks();
    }
  });
});
