import { resolve } from 'node:path';
import view from '@fastify/view';
import ejs from 'ejs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config/env';
import { getDb } from '../db/client';
import type { CampaignRow, LeadRow, ReplyRow, SendLogRow, SenderRow } from '../db/schema';
import { getDeadLetterQueue, getQueueCounts } from '../queue/queues';

function queryValue(request: FastifyRequest, key: string): string | null {
  const query = request.query;
  if (typeof query !== 'object' || query === null || Array.isArray(query)) {
    return null;
  }
  const value = (query as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const header = request.headers['x-admin-token'];
    const tokenFromHeader = Array.isArray(header) ? header[0] : header;
    const token = tokenFromHeader ?? queryValue(request, 'token');
    if (token !== config.ADMIN_TOKEN) {
      await reply.code(401).send({ error: 'unauthorized' });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown dashboard auth error';
    throw new Error(`Dashboard authentication failed: ${message}`);
  }
}

function parseCount(value: number | string | null | undefined): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function renderDashboard(
  reply: FastifyReply,
  page: string,
  title: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await reply.view('layout.ejs', {
      title,
      page,
      token: config.ADMIN_TOKEN,
      ...data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown dashboard render error';
    throw new Error(`Failed to render dashboard: ${message}`);
  }
}

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  try {
    await app.register(view, {
      engine: { ejs },
      root: resolve(process.cwd(), 'src', 'dashboard', 'views'),
    });

    app.get('/', { preHandler: requireAdmin }, async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const queueCounts = await getQueueCounts().catch((error: unknown) => ({
          waiting: 0,
          active: 0,
          delayed: 0,
          failed: 0,
          completed: 0,
          deadLetter: 0,
          error: error instanceof Error ? error.message : 'unknown queue error',
        }));
        const senders = await getDb()<SenderRow>('senders').where({ status: 'active' });
        const sentRows = await getDb()<SenderRow>('senders').sum<{ total: number | string | null }[]>({
          total: 'sent_today',
        });
        const logs = await getDb()<SendLogRow>('send_logs').where('sent_at', '>=', new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString());
        const acked = logs.filter((log) =>
          log.final_status === 'SERVER_ACK' ||
          log.final_status === 'DELIVERY_ACK' ||
          log.final_status === 'READ',
        ).length;
        await renderDashboard(reply, 'index', 'Overview', {
          queueCounts,
          sentToday: parseCount(sentRows[0]?.total),
          ackRate: logs.length === 0 ? 0 : Math.round((acked / logs.length) * 1000) / 10,
          activeSenders: senders.length,
        });
      } catch (error) {
        await reply.code(500).send({ error: error instanceof Error ? error.message : 'dashboard error' });
      }
    });

    app.get('/senders', { preHandler: requireAdmin }, async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const senders = await getDb()<SenderRow>('senders').orderBy('instance_name', 'asc');
        await renderDashboard(reply, 'senders', 'Senders', { senders });
      } catch (error) {
        await reply.code(500).send({ error: error instanceof Error ? error.message : 'senders error' });
      }
    });

    app.get('/campaigns', { preHandler: requireAdmin }, async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const campaigns = await getDb()<CampaignRow>('campaigns').orderBy('created_at', 'desc');
        await renderDashboard(reply, 'campaigns', 'Campaigns', { campaigns });
      } catch (error) {
        await reply.code(500).send({ error: error instanceof Error ? error.message : 'campaigns error' });
      }
    });

    app.get('/queue', { preHandler: requireAdmin }, async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const queueCounts = await getQueueCounts();
        await renderDashboard(reply, 'queue', 'Queue', { queueCounts });
      } catch (error) {
        await renderDashboard(reply, 'queue', 'Queue', {
          queueCounts: null,
          queueError: error instanceof Error ? error.message : 'queue error',
        });
      }
    });

    app.get('/leads', { preHandler: requireAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        let query = getDb()<LeadRow>('leads').orderBy('created_at', 'desc').limit(200);
        const status = queryValue(request, 'status');
        const campaign = queryValue(request, 'campaign');
        const country = queryValue(request, 'country');
        if (status !== null) {
          query = query.where({ status });
        }
        if (campaign !== null) {
          query = query.where({ campaign_id: campaign });
        }
        if (country !== null) {
          query = query.where({ country });
        }
        const leads = await query;
        await renderDashboard(reply, 'leads', 'Leads', { leads, filters: { status, campaign, country } });
      } catch (error) {
        await reply.code(500).send({ error: error instanceof Error ? error.message : 'leads error' });
      }
    });

    app.get('/replies', { preHandler: requireAdmin }, async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const replies = await getDb()<ReplyRow>('replies').orderBy('received_at', 'desc').limit(200);
        await renderDashboard(reply, 'replies', 'Replies', { replies });
      } catch (error) {
        await reply.code(500).send({ error: error instanceof Error ? error.message : 'replies error' });
      }
    });

    app.get('/deadletter', { preHandler: requireAdmin }, async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const jobs = await getDeadLetterQueue().getJobs(['waiting', 'delayed', 'failed'], 0, 100, false);
        const deadLetters = jobs.map((job) => ({
          id: job.id,
          reason: job.data.reason,
          failedAt: job.data.failedAt,
          leadId: job.data.original.leadId,
          campaignId: job.data.original.campaignId,
        }));
        await renderDashboard(reply, 'deadletter', 'Dead Letters', { deadLetters });
      } catch (error) {
        await renderDashboard(reply, 'deadletter', 'Dead Letters', {
          deadLetters: [],
          queueError: error instanceof Error ? error.message : 'dead-letter error',
        });
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown dashboard register error';
    throw new Error(`Failed to register dashboard routes: ${message}`);
  }
}
