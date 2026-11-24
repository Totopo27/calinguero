// NOTICE: Modified for the Calinguero project in 2026.
/**
 * Reminder feature — webOS service integration. Registers the dev-mode probe
 * (getDevMode) and the air-time alert (fireReminderAlert) the Activity Manager
 * callback invokes. The dev-mode check and alert payload/exec live in alert.ts.
 */

import { isDevMode, buildAlertPayload, fireAlert, type AlertCopy } from './alert';
import { isAppCaller, isServiceCaller, lunaFailure, senderShape, type CallerMsg } from '../luna-reply';
import { createLogger } from '../logger';

const log = createLogger('reminder');
const ACTIVITY_MANAGER_SERVICE = 'com.webos.service.activitymanager';

// Minimal shape of the webos-service Service object this module uses.
interface LunaService {
  register(method: string, handler: (msg: LunaMsg) => void): void;
}

export type ReminderAlertPayload = {
  copyVersion?: unknown;
  title?: string;
  channelName?: string;
  channelKey?: string;
  appId?: string;
  alertTitle?: unknown;
  alertMessage?: unknown;
  watchLabel?: unknown;
  cancelLabel?: unknown;
};

type LunaMsg = CallerMsg & {
  respond: (r: unknown) => void;
  payload?: ReminderAlertPayload;
};

export function localizedAlertCopy(payload: ReminderAlertPayload): AlertCopy | null | undefined {
  if (payload.copyVersion === undefined) return undefined;
  if (payload.copyVersion !== 1
      || typeof payload.alertTitle !== 'string' || !payload.alertTitle
      || typeof payload.alertMessage !== 'string' || !payload.alertMessage
      || typeof payload.watchLabel !== 'string' || !payload.watchLabel
      || typeof payload.cancelLabel !== 'string' || !payload.cancelLabel) {
    return null;
  }
  return {
    title: payload.alertTitle,
    message: payload.alertMessage,
    watchLabel: payload.watchLabel,
    cancelLabel: payload.cancelLabel,
  };
}

// Wire the reminder feature onto the Luna service.
export function registerReminderService(service: LunaService, appId?: string): void {
  service.register('getDevMode', (msg) => {
    if (appId && !isAppCaller(msg, appId)) {
      log.warn('getDevMode outcome=denied sender=' + senderShape(msg));
      msg.respond(lunaFailure('denied', 'Caller is not allowed'));
      return;
    }
    msg.respond({ devmode: isDevMode() });
  });

  // Invoked by the Activity Manager callback at programme air time (dev mode
  // only). Enforces the registered appId when provided so untrusted callers
  // cannot redirect "Watch now" to another application.
  service.register('fireReminderAlert', (msg) => {
    if (appId && !isAppCaller(msg, appId) && !isServiceCaller(msg, ACTIVITY_MANAGER_SERVICE)) {
      log.warn('fireReminderAlert outcome=denied sender=' + senderShape(msg));
      msg.respond(lunaFailure('denied', 'Caller is not allowed', { fired: false }));
      return;
    }
    const payload = msg.payload || {};
    const { title = '', channelName = '', channelKey = '', appId: payloadAppId = '' } = payload;
    const targetAppId = appId || payloadAppId;
    log.info('fireReminderAlert');
    const copy = localizedAlertCopy(payload);
    if (copy === null) {
      log.error('localized alert copy missing');
      msg.respond({ fired: false, result: 'Complete localized alert copy is required' });
      return;
    }
    fireAlert(buildAlertPayload(title, channelName, channelKey, targetAppId, copy), (ok, detail) => {
      if (ok) log.info('alert fired: ' + detail);
      // The exec error quotes the command line, program title included.
      else log.error('alert failed');
      msg.respond({ fired: ok, result: detail });
    });
  });
}
