import net from 'node:net';
import type { ConnectionOptions } from 'bullmq';
import { config } from '../config/env';

export type RedisConnectionRole = 'client' | 'worker';

export function buildRedisConnection(role: RedisConnectionRole = 'client'): ConnectionOptions {
  const url = new URL(config.REDIS_URL);
  const dbNumber = url.pathname.length > 1 ? Number.parseInt(url.pathname.slice(1), 10) : 0;
  const connection: ConnectionOptions = {
    host: url.hostname,
    port: url.port.length > 0 ? Number.parseInt(url.port, 10) : 6379,
    username: decodeURIComponent(url.username || ''),
    password: decodeURIComponent(url.password || ''),
    db: Number.isFinite(dbNumber) ? dbNumber : 0,
    connectTimeout: 5000,
    enableOfflineQueue: false,
    maxRetriesPerRequest: role === 'worker' ? null : 1,
    retryStrategy: role === 'worker' ? (attempts: number) => Math.min(attempts * 1000, 10000) : () => null,
  };
  if (url.protocol === 'rediss:') {
    connection.tls = {};
  }
  if (connection.username === '') {
    delete connection.username;
  }
  if (connection.password === '') {
    delete connection.password;
  }
  return connection;
}

export function assertRedisReachable(timeoutMs = 2000): Promise<void> {
  return new Promise<void>((resolvePromise, rejectPromise) => {
    const url = new URL(config.REDIS_URL);
    const socket = net.createConnection({
      host: url.hostname,
      port: url.port.length > 0 ? Number.parseInt(url.port, 10) : 6379,
    });
    const finish = (error?: Error): void => {
      socket.removeAllListeners();
      socket.destroy();
      if (error !== undefined) {
        rejectPromise(error);
        return;
      }
      resolvePromise();
    };
    socket.setTimeout(timeoutMs, () => {
      finish(new Error(`Redis unavailable at ${url.hostname}:${url.port || '6379'} (timeout)`));
    });
    socket.once('connect', () => {
      finish();
    });
    socket.once('error', () => {
      finish(new Error(`Redis unavailable at ${url.hostname}:${url.port || '6379'}`));
    });
  });
}
