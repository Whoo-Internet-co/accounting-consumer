import { describe, expect, it, vi } from 'vitest';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDbLedger } from '../../src/adapters/outbound/ledger/DynamoDbLedger.js';
import { JsonLogLedger } from '../../src/adapters/outbound/ledger/JsonLogLedger.js';
import type { Logger } from '../../src/application/ports/Logger.js';
import type { AccountingEntry } from '../../src/domain/entities/AccountingEntry.js';
import type { DynamoDbDocumentClientPort } from '../../src/infrastructure/aws/dynamodb.js';

const entry: AccountingEntry = {
  entry_id: 'entry-550e8400-e29b-41d4-a716-446655440000',
  event_id: '550e8400-e29b-41d4-a716-446655440000',
  id_contrato: 'CTR-001',
  id_autorizacao: 'AUT-001',
  tipo_operacao: null,
  valor: 100,
  direction: 'DEBIT',
  created_at: '2026-09-24T00:00:00.000Z',
};

function mockClient(send: ReturnType<typeof vi.fn>): DynamoDbDocumentClientPort {
  return { send } as unknown as DynamoDbDocumentClientPort;
}

describe('JsonLogLedger (default local/dev)', () => {
  it('emite lançamento como structured log com todos os atributos', async () => {
    const logger: Logger = { info: vi.fn(), error: vi.fn() };
    const ledger = new JsonLogLedger(logger);

    await ledger.append(entry);

    expect(logger.info).toHaveBeenCalledWith('Accounting entry appended to json-log ledger', {
      ledger_backend: 'json-log',
      entry_id: entry.entry_id,
      event_id: entry.event_id,
      id_contrato: 'CTR-001',
      id_autorizacao: 'AUT-001',
      tipo_operacao: null,
      valor: 100,
      direction: 'DEBIT',
      created_at: entry.created_at,
    });
  });
});

describe('DynamoDbLedger (client mockado)', () => {
  it('persiste item com PK entry_id e atributos do lançamento', async () => {
    const send = vi.fn().mockResolvedValue({});
    const ledger = new DynamoDbLedger(mockClient(send), 'accounting-entries');

    await ledger.append(entry);

    const command = send.mock.calls[0]?.[0] as PutCommand;
    expect(command).toBeInstanceOf(PutCommand);
    expect(command.input.TableName).toBe('accounting-entries');
    expect(command.input.Item).toEqual({
      entry_id: entry.entry_id,
      event_id: entry.event_id,
      id_contrato: 'CTR-001',
      id_autorizacao: 'AUT-001',
      tipo_operacao: null,
      valor: 100,
      direction: 'DEBIT',
      created_at: '2026-09-24T00:00:00.000Z',
    });
  });

  it('grava o mesmo PK para o mesmo event_id (escrita idempotente em redelivery)', async () => {
    const send = vi.fn().mockResolvedValue({});
    const ledger = new DynamoDbLedger(mockClient(send), 'accounting-entries');

    await ledger.append(entry);
    await ledger.append({ ...entry, created_at: '2026-09-24T01:00:00.000Z' });

    const first = (send.mock.calls[0]?.[0] as PutCommand).input.Item?.entry_id;
    const second = (send.mock.calls[1]?.[0] as PutCommand).input.Item?.entry_id;
    expect(first).toBe(second);
  });

  it('propaga erro do DynamoDB (use case não marca idempotência)', async () => {
    const send = vi.fn().mockRejectedValue(new Error('table not found'));
    const ledger = new DynamoDbLedger(mockClient(send), 'accounting-entries');

    await expect(ledger.append(entry)).rejects.toThrow('table not found');
  });
});
