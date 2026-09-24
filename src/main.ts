import { SqsConsumer } from './adapters/inbound/sqs/SqsConsumer.js';
import { SqsMessageBodyParser } from './adapters/inbound/sqs/SqsMessageBodyParser.js';
import { AjvTransacaoAutorizadaValidator } from './adapters/inbound/validation/AjvTransacaoAutorizadaValidator.js';
import { DynamoDbIdempotencyRepository } from './adapters/outbound/idempotency/DynamoDbIdempotencyRepository.js';
import { InMemoryIdempotencyRepository } from './adapters/outbound/idempotency/InMemoryIdempotencyRepository.js';
import { DynamoDbLedger } from './adapters/outbound/ledger/DynamoDbLedger.js';
import { JsonLogLedger } from './adapters/outbound/ledger/JsonLogLedger.js';
import { JsonConsoleLogger } from './adapters/outbound/logging/JsonConsoleLogger.js';
import type { AccountingLedger } from './application/ports/AccountingLedger.js';
import type { IdempotencyRepository } from './application/ports/IdempotencyRepository.js';
import { ProcessTransacaoAutorizadaUseCase } from './application/use-cases/ProcessTransacaoAutorizadaUseCase.js';
import { AwsSqsClientAdapter } from './infrastructure/aws/AwsSqsClientAdapter.js';
import {
  createDynamoDbDocumentClient,
  type DynamoDbDocumentClientPort,
} from './infrastructure/aws/dynamodb.js';
import { loadConfig } from './infrastructure/config/config.js';

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const logger = new JsonConsoleLogger(config.serviceName);
  const validator = new AjvTransacaoAutorizadaValidator();

  const needsDynamoDb =
    config.ledgerBackend === 'dynamodb' || config.idempotencyBackend === 'dynamodb';
  const dynamoClient: DynamoDbDocumentClientPort | undefined = needsDynamoDb
    ? createDynamoDbDocumentClient(config.awsRegion)
    : undefined;

  const idempotencyRepository: IdempotencyRepository =
    config.idempotencyBackend === 'dynamodb' && dynamoClient
      ? new DynamoDbIdempotencyRepository(dynamoClient, config.idempotencyTable, config.serviceName)
      : new InMemoryIdempotencyRepository();

  const ledger: AccountingLedger =
    config.ledgerBackend === 'dynamodb' && dynamoClient
      ? new DynamoDbLedger(dynamoClient, config.accountingEntriesTable)
      : new JsonLogLedger(logger);

  const processor = new ProcessTransacaoAutorizadaUseCase(
    validator,
    idempotencyRepository,
    ledger,
    logger,
    config.serviceName,
  );
  const sqsClient = new AwsSqsClientAdapter({ region: config.awsRegion });
  const consumer = new SqsConsumer(sqsClient, new SqsMessageBodyParser(), processor, logger, {
    queueUrl: config.sqsQueueUrl,
    waitTimeSeconds: config.sqsWaitTimeSeconds,
    visibilityTimeout: config.sqsVisibilityTimeout,
    maxNumberOfMessages: config.sqsMaxNumberOfMessages,
  });

  const abortController = new AbortController();
  let shutdownRequested = false;

  const shutdown = (signal: string): void => {
    if (shutdownRequested) {
      return;
    }
    shutdownRequested = true;
    logger.info('Graceful shutdown requested', { signal });
    abortController.abort();
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));

  logger.info('Accounting consumer started', {
    queue_url_configured: true,
    ledger_backend: config.ledgerBackend,
    idempotency_backend: config.idempotencyBackend,
  });

  await consumer.start(abortController.signal);
  logger.info('Accounting consumer stopped');
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      service: 'accounting-consumer',
      message: 'Fatal startup error',
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
