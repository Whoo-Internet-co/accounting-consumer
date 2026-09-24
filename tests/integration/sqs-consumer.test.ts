import { describe, expect, it, vi } from 'vitest';
import { SqsConsumer } from '../../src/adapters/inbound/sqs/SqsConsumer.js';
import { SqsMessageBodyParser } from '../../src/adapters/inbound/sqs/SqsMessageBodyParser.js';
import { AjvTransacaoAutorizadaValidator } from '../../src/adapters/inbound/validation/AjvTransacaoAutorizadaValidator.js';
import { InMemoryIdempotencyRepository } from '../../src/adapters/outbound/idempotency/InMemoryIdempotencyRepository.js';
import type { AccountingLedger } from '../../src/application/ports/AccountingLedger.js';
import type { Logger } from '../../src/application/ports/Logger.js';
import type {
  QueueMessage,
  ReceiveMessagesInput,
  SqsClientPort,
} from '../../src/application/ports/SqsClientPort.js';
import { ProcessTransacaoAutorizadaUseCase } from '../../src/application/use-cases/ProcessTransacaoAutorizadaUseCase.js';
import type { AccountingEntry } from '../../src/domain/entities/AccountingEntry.js';
import { eventBridgeEnvelope, validEvent } from '../fixtures.js';

class FakeSqsClient implements SqsClientPort {
  readonly deleted: Array<{ queueUrl: string; receiptHandle: string }> = [];

  constructor(private readonly messages: QueueMessage[]) {}

  async receiveMessages(
    _input: ReceiveMessagesInput,
    _signal?: AbortSignal,
  ): Promise<QueueMessage[]> {
    return this.messages;
  }

  async deleteMessage(queueUrl: string, receiptHandle: string): Promise<void> {
    this.deleted.push({ queueUrl, receiptHandle });
  }
}

function createConsumer(messages: QueueMessage[], append?: ReturnType<typeof vi.fn>) {
  const sqs = new FakeSqsClient(messages);
  const logger: Logger = { info: vi.fn(), error: vi.fn() };
  const appendFn = append ?? vi.fn().mockResolvedValue(undefined);
  const ledger: AccountingLedger = { append: appendFn };
  const idempotency = new InMemoryIdempotencyRepository();
  const processor = new ProcessTransacaoAutorizadaUseCase(
    new AjvTransacaoAutorizadaValidator(),
    idempotency,
    ledger,
    logger,
    'accounting-consumer',
  );

  const consumer = new SqsConsumer(sqs, new SqsMessageBodyParser(), processor, logger, {
    queueUrl: 'accounting-queue',
    waitTimeSeconds: 20,
    visibilityTimeout: 30,
    maxNumberOfMessages: 10,
    pollErrorDelayMs: 0,
  });

  return { sqs, logger, consumer, append: appendFn, idempotency };
}

function message(receiptHandle: string, body: unknown): QueueMessage {
  return { messageId: `msg-${receiptHandle}`, receiptHandle, body: JSON.stringify(body) };
}

describe('SqsConsumer integration without AWS', () => {
  it('processa envelope EventBridge e faz ACK/delete após lançamento', async () => {
    const f = createConsumer([message('r1', eventBridgeEnvelope(validEvent()))]);

    await f.consumer.pollOnce();

    expect(f.append).toHaveBeenCalledTimes(1);
    expect(f.sqs.deleted).toEqual([{ queueUrl: 'accounting-queue', receiptHandle: 'r1' }]);
  });

  it('processa payload flat e faz ACK/delete', async () => {
    const f = createConsumer([message('r1', validEvent())]);

    await f.consumer.pollOnce();

    expect(f.sqs.deleted).toEqual([{ queueUrl: 'accounting-queue', receiptHandle: 'r1' }]);
  });

  it('mesmo evento duplicado no mesmo batch: 1 lançamento e ACK em ambos', async () => {
    const f = createConsumer([
      message('r1', validEvent()),
      message('r2', eventBridgeEnvelope(validEvent())),
    ]);

    await f.consumer.pollOnce();

    expect(f.append).toHaveBeenCalledTimes(1);
    expect(f.sqs.deleted).toHaveLength(2);
  });

  it('NÃO faz ACK/delete em falha de validação (redelivery -> DLQ via infra)', async () => {
    const f = createConsumer([message('r1', validEvent({ event_version: '2.0' }))]);

    await f.consumer.pollOnce();

    expect(f.sqs.deleted).toEqual([]);
    expect(f.append).not.toHaveBeenCalled();
    expect(f.logger.error).toHaveBeenCalled();
  });

  it('NÃO faz ACK/delete para JSON inválido ou mensagem SQS malformada', async () => {
    const f = createConsumer([
      { messageId: 'm1', receiptHandle: 'r1', body: '{' },
      { messageId: 'm2', body: JSON.stringify(validEvent()) },
    ]);

    await f.consumer.pollOnce();

    expect(f.sqs.deleted).toEqual([]);
    expect(f.append).not.toHaveBeenCalled();
    expect(f.logger.error).toHaveBeenCalledWith(
      'Malformed SQS message rejected',
      expect.objectContaining({ message_id: 'm2', processing_status: 'INVALID_EVENT' }),
    );
  });

  it('falha no ledger NÃO marca idempotência; redelivery posterior reprocessa com sucesso', async () => {
    const append = vi
      .fn()
      .mockRejectedValueOnce(new Error('dynamodb unavailable'))
      .mockResolvedValue(undefined);
    const f = createConsumer([message('r1', validEvent())], append);

    await f.consumer.pollOnce();
    expect(f.sqs.deleted).toEqual([]);
    await expect(f.idempotency.hasBeenProcessed(validEvent().event_id as string)).resolves.toBe(
      false,
    );

    // SQS reentrega a mesma mensagem (visibility timeout expirou)
    await f.consumer.pollOnce();

    expect(append).toHaveBeenCalledTimes(2);
    expect(f.sqs.deleted).toEqual([{ queueUrl: 'accounting-queue', receiptHandle: 'r1' }]);
    await expect(f.idempotency.hasBeenProcessed(validEvent().event_id as string)).resolves.toBe(
      true,
    );
  });

  it('lançamento persistido contém atributos completos do entry', async () => {
    const f = createConsumer([
      message('r1', validEvent({ tipo_operacao: 'ESTORNO', trace_id: 'trace-5' })),
    ]);

    await f.consumer.pollOnce();

    const entry = f.append.mock.calls[0]?.[0] as AccountingEntry;
    expect(entry).toMatchObject({
      event_id: validEvent().event_id,
      tipo_operacao: 'ESTORNO',
      direction: 'CREDIT',
      valor: 100,
    });
    expect(Number.isNaN(Date.parse(entry.created_at))).toBe(false);
  });
});

describe('SqsConsumer lifecycle', () => {
  it('encerra sem poll quando AbortSignal já está abortado', async () => {
    const f = createConsumer([]);
    const controller = new AbortController();
    controller.abort();

    await expect(f.consumer.start(controller.signal)).resolves.toBeUndefined();
    expect(f.sqs.deleted).toEqual([]);
  });

  it('tolera erro transitório de polling e encerra após sinal', async () => {
    const controller = new AbortController();
    const logger: Logger = {
      info: vi.fn(),
      error: vi.fn(() => controller.abort()),
    };
    const failingSqs: SqsClientPort = {
      receiveMessages: vi.fn().mockRejectedValue(new Error('temporary SQS failure')),
      deleteMessage: vi.fn().mockResolvedValue(undefined),
    };
    const consumer = new SqsConsumer(
      failingSqs,
      new SqsMessageBodyParser(),
      { execute: vi.fn() },
      logger,
      {
        queueUrl: 'accounting-queue',
        waitTimeSeconds: 20,
        visibilityTimeout: 30,
        maxNumberOfMessages: 10,
        pollErrorDelayMs: 0,
      },
    );

    await consumer.start(controller.signal);

    expect(logger.error).toHaveBeenCalledWith(
      'SQS polling failed',
      expect.objectContaining({ processing_status: 'PROCESSING_FAILED' }),
    );
  });

  it('encerra silenciosamente quando o long polling é abortado', async () => {
    const logger: Logger = { info: vi.fn(), error: vi.fn() };
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    const sqs: SqsClientPort = {
      receiveMessages: vi.fn().mockRejectedValue(abortError),
      deleteMessage: vi.fn().mockResolvedValue(undefined),
    };
    const consumer = new SqsConsumer(
      sqs,
      new SqsMessageBodyParser(),
      { execute: vi.fn() },
      logger,
      {
        queueUrl: 'accounting-queue',
        waitTimeSeconds: 20,
        visibilityTimeout: 30,
        maxNumberOfMessages: 10,
        pollErrorDelayMs: 0,
      },
    );

    await consumer.start(new AbortController().signal);

    expect(logger.error).not.toHaveBeenCalled();
  });

  it('encerra sem logar quando o sinal é abortado durante a própria falha de polling', async () => {
    const logger: Logger = { info: vi.fn(), error: vi.fn() };
    const controller = new AbortController();
    const sqs: SqsClientPort = {
      receiveMessages: vi.fn().mockImplementation(async () => {
        controller.abort();
        throw new Error('late failure');
      }),
      deleteMessage: vi.fn().mockResolvedValue(undefined),
    };
    const consumer = new SqsConsumer(
      sqs,
      new SqsMessageBodyParser(),
      { execute: vi.fn() },
      logger,
      {
        queueUrl: 'accounting-queue',
        waitTimeSeconds: 20,
        visibilityTimeout: 30,
        maxNumberOfMessages: 10,
        pollErrorDelayMs: 0,
      },
    );

    await consumer.start(controller.signal);

    expect(logger.error).not.toHaveBeenCalled();
  });

  it('falha não-Error no processamento deixa mensagem sem ACK e loga string', async () => {
    const logger: Logger = { info: vi.fn(), error: vi.fn() };
    const sqs = new FakeSqsClient([message('r1', validEvent())]);
    const consumer = new SqsConsumer(
      sqs,
      new SqsMessageBodyParser(),
      { execute: vi.fn().mockRejectedValue('raw failure') },
      logger,
      {
        queueUrl: 'accounting-queue',
        waitTimeSeconds: 20,
        visibilityTimeout: 30,
        maxNumberOfMessages: 10,
        pollErrorDelayMs: 0,
      },
    );

    await consumer.pollOnce();

    expect(sqs.deleted).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith(
      'SQS message left unacknowledged for redelivery',
      expect.objectContaining({ message_id: 'msg-r1', error: 'raw failure' }),
    );
  });
});
