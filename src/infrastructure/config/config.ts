export type IdempotencyBackend = 'memory' | 'dynamodb';
export type LedgerBackend = 'json-log' | 'dynamodb';

export interface AppConfig {
  serviceName: string;
  awsRegion: string;
  sqsQueueUrl: string;
  sqsWaitTimeSeconds: number;
  sqsVisibilityTimeout: number;
  sqsMaxNumberOfMessages: number;
  ledgerBackend: LedgerBackend;
  accountingEntriesTable: string;
  idempotencyBackend: IdempotencyBackend;
  idempotencyTable: string;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function integerInRange(
  env: NodeJS.ProcessEnv,
  name: string,
  defaultValue: number,
  min: number,
  max: number,
): number {
  const raw = env[name];
  if (!raw) {
    return defaultValue;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function oneOf<T extends string>(
  env: NodeJS.ProcessEnv,
  name: string,
  allowed: readonly T[],
  defaultValue: T,
): T {
  const raw = env[name];
  if (!raw) {
    return defaultValue;
  }
  if (!allowed.includes(raw as T)) {
    throw new Error(`${name} must be one of: ${allowed.join(', ')}`);
  }
  return raw as T;
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  return {
    serviceName: env.SERVICE_NAME || 'accounting-consumer',
    awsRegion: env.AWS_REGION || 'us-east-1',
    sqsQueueUrl: required(env, 'SQS_QUEUE_URL'),
    sqsWaitTimeSeconds: integerInRange(env, 'SQS_WAIT_TIME_SECONDS', 20, 0, 20),
    sqsVisibilityTimeout: integerInRange(env, 'SQS_VISIBILITY_TIMEOUT', 30, 0, 43_200),
    sqsMaxNumberOfMessages: integerInRange(env, 'SQS_MAX_NUMBER_OF_MESSAGES', 10, 1, 10),
    ledgerBackend: oneOf(env, 'LEDGER_BACKEND', ['json-log', 'dynamodb'] as const, 'json-log'),
    accountingEntriesTable: env.ACCOUNTING_ENTRIES_TABLE || 'finance-platform-accounting-entries',
    idempotencyBackend: oneOf(
      env,
      'IDEMPOTENCY_BACKEND',
      ['memory', 'dynamodb'] as const,
      'memory',
    ),
    idempotencyTable: env.IDEMPOTENCY_TABLE || 'finance-platform-consumer-idempotency',
  };
}
