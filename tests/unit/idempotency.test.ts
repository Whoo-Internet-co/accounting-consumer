import { describe, expect, it, vi } from 'vitest';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDbIdempotencyRepository } from '../../src/adapters/outbound/idempotency/DynamoDbIdempotencyRepository.js';
import { InMemoryIdempotencyRepository } from '../../src/adapters/outbound/idempotency/InMemoryIdempotencyRepository.js';
import type { DynamoDbDocumentClientPort } from '../../src/infrastructure/aws/dynamodb.js';

function mockClient(send: ReturnType<typeof vi.fn>): DynamoDbDocumentClientPort {
  return { send } as unknown as DynamoDbDocumentClientPort;
}

function conditionalCheckFailed(): Error {
  const error = new Error('The conditional request failed');
  error.name = 'ConditionalCheckFailedException';
  return error;
}

describe('InMemoryIdempotencyRepository', () => {
  it('marca e reconhece event_id processado', async () => {
    const repository = new InMemoryIdempotencyRepository();

    await expect(repository.hasBeenProcessed('event-1')).resolves.toBe(false);
    await repository.markAsProcessed('event-1');
    await expect(repository.hasBeenProcessed('event-1')).resolves.toBe(true);
    await expect(repository.hasBeenProcessed('event-2')).resolves.toBe(false);
  });

  it('markAsProcessed é idempotente', async () => {
    const repository = new InMemoryIdempotencyRepository();

    await repository.markAsProcessed('event-1');
    await expect(repository.markAsProcessed('event-1')).resolves.toBeUndefined();
    await expect(repository.hasBeenProcessed('event-1')).resolves.toBe(true);
  });
});

describe('DynamoDbIdempotencyRepository (client mockado)', () => {
  const repository = (send: ReturnType<typeof vi.fn>) =>
    new DynamoDbIdempotencyRepository(mockClient(send), 'idempotency-table', 'accounting-consumer');

  it('hasBeenProcessed consulta por PK event_id e retorna true quando existe Item', async () => {
    const send = vi.fn().mockResolvedValue({ Item: { event_id: 'event-1' } });

    await expect(repository(send).hasBeenProcessed('event-1')).resolves.toBe(true);

    const command = send.mock.calls[0]?.[0] as GetCommand;
    expect(command).toBeInstanceOf(GetCommand);
    expect(command.input).toEqual({
      TableName: 'idempotency-table',
      Key: { event_id: 'event-1' },
    });
  });

  it('hasBeenProcessed retorna false quando não há Item', async () => {
    const send = vi.fn().mockResolvedValue({});

    await expect(repository(send).hasBeenProcessed('event-x')).resolves.toBe(false);
  });

  it('hasBeenProcessed propaga erro do DynamoDB', async () => {
    const send = vi.fn().mockRejectedValue(new Error('dynamodb unavailable'));

    await expect(repository(send).hasBeenProcessed('event-1')).rejects.toThrow(
      'dynamodb unavailable',
    );
  });

  it('markAsProcessed faz conditional put com attribute_not_exists(event_id)', async () => {
    const send = vi.fn().mockResolvedValue({});

    await repository(send).markAsProcessed('event-1');

    const command = send.mock.calls[0]?.[0] as PutCommand;
    expect(command).toBeInstanceOf(PutCommand);
    expect(command.input.TableName).toBe('idempotency-table');
    expect(command.input.ConditionExpression).toBe('attribute_not_exists(event_id)');
    expect(command.input.Item).toMatchObject({
      event_id: 'event-1',
      service_name: 'accounting-consumer',
    });
    expect(typeof command.input.Item?.processed_at).toBe('string');
  });

  it('markAsProcessed trata ConditionalCheckFailedException como já processado', async () => {
    const send = vi.fn().mockRejectedValue(conditionalCheckFailed());

    await expect(repository(send).markAsProcessed('event-1')).resolves.toBeUndefined();
  });

  it('markAsProcessed propaga demais erros', async () => {
    const send = vi.fn().mockRejectedValue(new Error('throughput exceeded'));

    await expect(repository(send).markAsProcessed('event-1')).rejects.toThrow(
      'throughput exceeded',
    );
  });
});
