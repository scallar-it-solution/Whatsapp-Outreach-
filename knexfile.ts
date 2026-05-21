import type { Knex } from 'knex';
import { createKnexConfig } from './src/db/client';

const knexConfig: Knex.Config = createKnexConfig();

export default knexConfig;
