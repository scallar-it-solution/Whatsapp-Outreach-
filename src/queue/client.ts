import type { ConnectionOptions } from 'bullmq';
import { config } from '../config/env';

export function buildRedisConnection(): ConnectionOptions {
  const url = new URL(config.REDIS_URL);
  const dbNumber = url.pathname.length > 1 ? Number.parseInt(url.pathname.slice(1), 10) : 0;
  const connection: ConnectionOptions = {
    host: url.hostname,
    port: url.port.length > 0 ? Number.parseInt(url.port, 10) : 6379,
    username: decodeURIComponent(url.username || ''),
    password: decodeURIComponent(url.password || ''),
    db: Number.isFinite(dbNumber) ? dbNumber : 0,
    maxRetriesPerRequest: null,
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
