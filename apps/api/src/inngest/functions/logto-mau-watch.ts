// apps/api/src/inngest/functions/logto-mau-watch.ts
//
// CTRL-02 (Pitfall #17 mitigation) / D-05: Daily Logto MAU watcher.
// Stable function ID: INNGEST_FUNCTION_IDS.LOGTO_MAU_WATCH ('logto-mau-watch-v1').
// Schedule: 04:00 UTC daily.
//
// Pitfall #17: Logto Cloud free tier auto-locks at 5K MAU. Pro pre-buy
// calendar action at W7 per Phase 1 D-14. This cron emails ops at 4K
// (75% of cap) so we have a buffer to upgrade before the lock.
//
// Algorithm:
//   1. read-logto-mau: getLogtoMau(env) — Logto Management API audience
//      (DISTINCT from BFF M2M resource indicator per T-8-13)
//   2. persist-mau-sample: INSERT mau_log (sample_date PK) — second-run
//      idempotent on same UTC date
//   3. send-mau-alert: only if mau > 4000 (75% of 5K free-tier cap)
//
// References:
//   - .planning/phases/08-auth-billing/08-CONTEXT.md D-05
//   - .planning/phases/08-auth-billing/08-RESEARCH.md §6 D-05
//   - .planning/research/PITFALLS.md §#17

import { INNGEST_FUNCTION_IDS } from '@mcpgen/contracts/inngest-functions';
import { mau_log } from '@mcpgen/contracts/db-schema';
import { inngest } from '../client.js';
import { db } from '../../db.js';
import { getLogtoMau, type LogtoAdminEnv } from '../../lib/logto-admin.js';
import { sendMauAlert, type ResendEnv } from '../../lib/email/resend-client.js';

const MAU_ALERT_THRESHOLD = 4000; // 75% of Logto Cloud free-tier 5000

interface MauWatchEnv {
  LOGTO_ENDPOINT: string;
  LOGTO_M2M_APP_ID: string;
  LOGTO_M2M_APP_SECRET: string;
  RESEND_API_KEY: string;
  OPS_EMAIL: string;
  LOGTO_BASE_URL: string;
  OPS_FROM_EMAIL?: string | undefined;
}

export const logtoMauWatch = inngest.createFunction(
  {
    id: INNGEST_FUNCTION_IDS.LOGTO_MAU_WATCH,
    triggers: [{ cron: '0 4 * * *' }],
  },
  async ({ step }) => {
    // Inngest 4.2.4 Context does not expose `env`; use process.env (matches
    // existing function pattern). See drift-watcher-check.ts for derivation.
    const e = process.env as unknown as MauWatchEnv;

    const adminEnv: LogtoAdminEnv = {
      LOGTO_ENDPOINT: e.LOGTO_ENDPOINT,
      LOGTO_M2M_APP_ID: e.LOGTO_M2M_APP_ID,
      LOGTO_M2M_APP_SECRET: e.LOGTO_M2M_APP_SECRET,
    };

    const mau = await step.run('read-logto-mau', () => getLogtoMau(adminEnv));
    const today = new Date().toISOString().split('T')[0];
    if (!today) {
      throw new Error('failed to derive today UTC date');
    }
    const alerted = mau > MAU_ALERT_THRESHOLD;

    await step.run('persist-mau-sample', async () => {
      try {
        await db.insert(mau_log).values({
          sample_date: today,
          mau_count: mau,
          alerted,
        });
      } catch (err) {
        const code = (err as { code?: string }).code;
        const message = (err as { message?: string }).message ?? '';
        if (code === '23505' || message.includes('duplicate key value')) {
          return; // already sampled today — second run is no-op
        }
        throw err;
      }
    });

    if (alerted) {
      await step.run('send-mau-alert', async () => {
        const env: ResendEnv = {
          RESEND_API_KEY: e.RESEND_API_KEY,
          OPS_EMAIL: e.OPS_EMAIL,
          LOGTO_BASE_URL: e.LOGTO_BASE_URL,
          OPS_FROM_EMAIL: e.OPS_FROM_EMAIL,
        };
        await sendMauAlert(env, mau);
      });
    }

    return { mau, alerted };
  },
);
