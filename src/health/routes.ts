import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config/env';
import { getDb } from '../db/client';
import type { ReplyRow, SendLogRow, SenderRow, UnsubscribeRow } from '../db/schema';
import { getDeadLetterQueue, getOutreachQueue } from '../queue/queues';
import { assertRedisReachable } from '../queue/client';

function todayIsoStart(): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

function parseCount(value: number | string | undefined): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function countQuery(tableName: string, where: Record<string, unknown> = {}): Promise<number> {
  try {
    const rows = await getDb()(tableName).where(where).count<{ count: number | string }[]>({ count: '*' });
    return parseCount(rows[0]?.count);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown count error';
    throw new Error(`Failed count query for ${tableName}: ${message}`);
  }
}

export function registerHealthRoutes(app: FastifyInstance): void {
  try {
    app.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const response: Record<string, unknown> = {
          status: 'ok',
          send_enabled: config.SEND_ENABLED,
          db: 'connected',
          redis: 'connected',
          active_senders: 0,
          queue_pending: 0,
        };
        try {
          await getDb().raw('select 1');
          response.active_senders = await countQuery('senders', { status: 'active' });
        } catch (error) {
          response.db = 'degraded';
          response.db_error = error instanceof Error ? error.message : 'unknown db error';
        }
        try {
          await assertRedisReachable();
          response.queue_pending = await getOutreachQueue().getWaitingCount();
        } catch (error) {
          response.redis = 'degraded';
          response.redis_error = error instanceof Error ? error.message : 'unknown redis error';
        }
        await reply.code(200).send(response);
      } catch (error) {
        await reply.code(200).send({
          status: 'ok',
          send_enabled: config.SEND_ENABLED,
          error: error instanceof Error ? error.message : 'unknown health error',
        });
      }
    });

    app.get('/metrics/basic', async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const since = todayIsoStart();
        const response: Record<string, unknown> = {
          sent_today: 0,
          ack_rate_percent: 0,
          failed_today: 0,
          interested_replies: 0,
          unsubscribes: 0,
          dead_letter_count: 0,
        };
        try {
          const sentRows = await getDb()<SenderRow>('senders').sum<{ total: number | string | null }[]>({
            total: 'sent_today',
          });
          response.sent_today = parseCount(sentRows[0]?.total ?? 0);
          const logs = await getDb()<SendLogRow>('send_logs').where('sent_at', '>=', since);
          const attempted = logs.length;
          const acked = logs.filter((log) =>
            log.final_status === 'SERVER_ACK' ||
            log.final_status === 'DELIVERY_ACK' ||
            log.final_status === 'READ',
          ).length;
          response.ack_rate_percent = attempted === 0 ? 0 : Math.round((acked / attempted) * 1000) / 10;
          response.failed_today = logs.filter((log) => log.final_status === 'ERROR' || log.final_status === 'TIMEOUT').length;
          response.interested_replies = await getDb()<ReplyRow>('replies')
            .where({ classification: 'interested' })
            .where('received_at', '>=', since)
            .count<{ count: number | string }[]>({ count: '*' })
            .then((rows) => parseCount(rows[0]?.count));
          response.unsubscribes = await getDb()<UnsubscribeRow>('unsubscribes')
            .where('created_at', '>=', since)
            .count<{ count: number | string }[]>({ count: '*' })
            .then((rows) => parseCount(rows[0]?.count));
        } catch (error) {
          response.db_error = error instanceof Error ? error.message : 'unknown db metrics error';
        }
        try {
          response.dead_letter_count = await getDeadLetterQueue().getWaitingCount();
        } catch (error) {
          response.redis_error = error instanceof Error ? error.message : 'unknown redis metrics error';
        }
        await reply.code(200).send(response);
      } catch (error) {
        await reply.code(200).send({
          error: error instanceof Error ? error.message : 'unknown metrics error',
        });
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown health route register error';
    throw new Error(`Failed to register health routes: ${message}`);
  }
}
