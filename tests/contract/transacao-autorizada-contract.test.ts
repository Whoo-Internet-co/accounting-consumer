import { describe, expect, it, vi } from 'vitest';
import {
  contractPaths,
  loadTransacaoAutorizadaV1Example,
  loadTransacaoAutorizadaV1Schema,
} from '@whoo-internet-co/finance-platform-contracts';
import { AjvTransacaoAutorizadaValidator } from '../../src/adapters/inbound/validation/AjvTransacaoAutorizadaValidator.js';
import { SqsMessageBodyParser } from '../../src/adapters/inbound/sqs/SqsMessageBodyParser.js';
import { InMemoryIdempotencyRepository } from '../../src/adapters/outbound/idempotency/InMemoryIdempotencyRepository.js';
import {
  IncompatibleEventVersionError,
  InvalidEventError,
  UnsupportedEventTypeError,
} from '../../src/application/errors/EventErrors.js';
import type { AccountingLedger } from '../../src/application/ports/AccountingLedger.js';
import type { Logger } from '../../src/application/ports/Logger.js';
import { ProcessTransacaoAutorizadaUseCase } from '../../src/application/use-cases/ProcessTransacaoAutorizadaUseCase.js';
import type { AccountingEntry } from '../../src/domain/entities/AccountingEntry.js';
import invalidEventType from './invalid-examples/invalid-event-type.json';
import invalidVersion from './invalid-examples/invalid-version.json';
import missingEventId from './invalid-examples/missing-event-id.json';

/**
 * Consumer contract testing (ADR-008): o consumer é testado contra o schema e
 * o exemplo OFICIAIS carregados do package @whoo-internet-co/finance-platform-contracts.
 * Os invalid-examples oficiais (excluídos do package publicado) são mantidos
 * em ./invalid-examples (ver SOURCE.md).
 */
function createUseCase(append: ReturnType<typeof vi.fn>) {
  const ledger: AccountingLedger = { append };
  const logger: Logger = { info: vi.fn(), error: vi.fn() };
  const useCase = new ProcessTransacaoAutorizadaUseCase(
    new AjvTransacaoAutorizadaValidator(),
    new InMemoryIdempotencyRepository(),
    ledger,
    logger,
    'accounting-consumer',
  );
  return { useCase, logger };
}

describe('Contrato oficial TransacaoAutorizada v1 (GitHub Packages)', () => {
  it('carrega o schema canônico com $id e title oficiais', async () => {
    const schema = await loadTransacaoAutorizadaV1Schema();

    expect(schema.$id).toBe(
      'https://contracts.whoo-internet.co/events/transacao-autorizada/v1/schema.json',
    );
    expect(schema.title).toBe('TransacaoAutorizada');
    expect(contractPaths.events.transacaoAutorizada.v1.schema).toContain('schema.json');
  });

  it('example.json oficial PASS no validador do consumer', async () => {
    const example = await loadTransacaoAutorizadaV1Example();

    const event = await new AjvTransacaoAutorizadaValidator().validate(example);

    expect(event.event_id).toBe(example.event_id);
    expect(event.event_type).toBe('TransacaoAutorizada');
    expect(event.trace_id).toBeNull();
  });

  it('example.json oficial PASS no pipeline completo (envelope EventBridge -> lançamento)', async () => {
    const example = await loadTransacaoAutorizadaV1Example();
    const append = vi.fn().mockResolvedValue(undefined);
    const { useCase } = createUseCase(append);
    const body = JSON.stringify({
      source: 'authorization-service',
      'detail-type': 'TransacaoAutorizada',
      detail: example,
    });

    const payload = new SqsMessageBodyParser().parse(body);
    const result = await useCase.execute(payload);

    expect(result.status).toBe('PROCESSED');
    expect(append).toHaveBeenCalledTimes(1);
    const entry = append.mock.calls[0]?.[0] as AccountingEntry;
    expect(entry).toMatchObject({
      event_id: example.event_id,
      id_contrato: example.id_contrato,
      id_autorizacao: example.id_autorizacao,
      valor: example.valor,
      direction: 'DEBIT',
    });
  });

  it('invalid-examples oficiais FAIL: event_type inválido -> UnsupportedEventTypeError', async () => {
    const append = vi.fn();
    const { useCase, logger } = createUseCase(append);

    await expect(useCase.execute(invalidEventType)).rejects.toBeInstanceOf(
      UnsupportedEventTypeError,
    );
    expect(append).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'Invalid event rejected',
      expect.objectContaining({ processing_status: 'INVALID_EVENT' }),
    );
  });

  it('invalid-examples oficiais FAIL: versão incompatível -> IncompatibleEventVersionError', async () => {
    const append = vi.fn();
    const { useCase } = createUseCase(append);

    await expect(useCase.execute(invalidVersion)).rejects.toBeInstanceOf(
      IncompatibleEventVersionError,
    );
    expect(append).not.toHaveBeenCalled();
  });

  it('invalid-examples oficiais FAIL: event_id ausente -> InvalidEventError', async () => {
    const append = vi.fn();
    const { useCase } = createUseCase(append);

    await expect(useCase.execute(missingEventId)).rejects.toBeInstanceOf(InvalidEventError);
    await expect(useCase.execute(missingEventId)).rejects.toThrow(/event_id/);
    expect(append).not.toHaveBeenCalled();
  });
});
