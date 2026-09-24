import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/infrastructure/config/config.js';

const minimalEnv = { SQS_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/123/accounting-queue' };

describe('loadConfig', () => {
  it('aplica defaults documentados', () => {
    const config = loadConfig(minimalEnv);

    expect(config).toEqual({
      serviceName: 'accounting-consumer',
      awsRegion: 'us-east-1',
      sqsQueueUrl: minimalEnv.SQS_QUEUE_URL,
      sqsWaitTimeSeconds: 20,
      sqsVisibilityTimeout: 30,
      sqsMaxNumberOfMessages: 10,
      ledgerBackend: 'json-log',
      accountingEntriesTable: 'finance-platform-accounting-entries',
      idempotencyBackend: 'memory',
      idempotencyTable: 'finance-platform-consumer-idempotency',
    });
  });

  it('exige SQS_QUEUE_URL', () => {
    expect(() => loadConfig({})).toThrow('Missing required environment variable: SQS_QUEUE_URL');
  });

  it('respeita overrides válidos', () => {
    const config = loadConfig({
      ...minimalEnv,
      SERVICE_NAME: 'accounting-consumer-dev',
      AWS_REGION: 'sa-east-1',
      SQS_WAIT_TIME_SECONDS: '5',
      SQS_VISIBILITY_TIMEOUT: '60',
      SQS_MAX_NUMBER_OF_MESSAGES: '1',
      LEDGER_BACKEND: 'dynamodb',
      ACCOUNTING_ENTRIES_TABLE: 'custom-entries',
      IDEMPOTENCY_BACKEND: 'dynamodb',
      IDEMPOTENCY_TABLE: 'custom-idempotency',
    });

    expect(config.serviceName).toBe('accounting-consumer-dev');
    expect(config.awsRegion).toBe('sa-east-1');
    expect(config.sqsWaitTimeSeconds).toBe(5);
    expect(config.sqsVisibilityTimeout).toBe(60);
    expect(config.sqsMaxNumberOfMessages).toBe(1);
    expect(config.ledgerBackend).toBe('dynamodb');
    expect(config.accountingEntriesTable).toBe('custom-entries');
    expect(config.idempotencyBackend).toBe('dynamodb');
    expect(config.idempotencyTable).toBe('custom-idempotency');
  });

  it('rejeita inteiros fora do intervalo ou não numéricos', () => {
    expect(() => loadConfig({ ...minimalEnv, SQS_WAIT_TIME_SECONDS: '21' })).toThrow(
      'SQS_WAIT_TIME_SECONDS must be an integer between 0 and 20',
    );
    expect(() => loadConfig({ ...minimalEnv, SQS_VISIBILITY_TIMEOUT: '-1' })).toThrow(
      'SQS_VISIBILITY_TIMEOUT must be an integer between 0 and 43200',
    );
    expect(() => loadConfig({ ...minimalEnv, SQS_MAX_NUMBER_OF_MESSAGES: '11' })).toThrow(
      'SQS_MAX_NUMBER_OF_MESSAGES must be an integer between 1 and 10',
    );
    expect(() => loadConfig({ ...minimalEnv, SQS_WAIT_TIME_SECONDS: 'abc' })).toThrow(
      'SQS_WAIT_TIME_SECONDS must be an integer between 0 and 20',
    );
  });

  it('aceita limites válidos dos intervalos', () => {
    const config = loadConfig({
      ...minimalEnv,
      SQS_WAIT_TIME_SECONDS: '0',
      SQS_VISIBILITY_TIMEOUT: '43200',
      SQS_MAX_NUMBER_OF_MESSAGES: '10',
    });

    expect(config.sqsWaitTimeSeconds).toBe(0);
    expect(config.sqsVisibilityTimeout).toBe(43_200);
    expect(config.sqsMaxNumberOfMessages).toBe(10);
  });

  it('rejeita backends desconhecidos', () => {
    expect(() => loadConfig({ ...minimalEnv, IDEMPOTENCY_BACKEND: 'redis' })).toThrow(
      'IDEMPOTENCY_BACKEND must be one of: memory, dynamodb',
    );
    expect(() => loadConfig({ ...minimalEnv, LEDGER_BACKEND: 'console' })).toThrow(
      'LEDGER_BACKEND must be one of: json-log, dynamodb',
    );
  });

  it('string vazia cai no default (SERVICE_NAME, backends, tabelas)', () => {
    const config = loadConfig({
      ...minimalEnv,
      SERVICE_NAME: '',
      AWS_REGION: '',
      LEDGER_BACKEND: '',
      IDEMPOTENCY_BACKEND: '',
      ACCOUNTING_ENTRIES_TABLE: '',
      IDEMPOTENCY_TABLE: '',
    });

    expect(config.serviceName).toBe('accounting-consumer');
    expect(config.awsRegion).toBe('us-east-1');
    expect(config.ledgerBackend).toBe('json-log');
    expect(config.idempotencyBackend).toBe('memory');
    expect(config.accountingEntriesTable).toBe('finance-platform-accounting-entries');
    expect(config.idempotencyTable).toBe('finance-platform-consumer-idempotency');
  });
});
