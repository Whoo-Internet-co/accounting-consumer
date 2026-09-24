import { describe, expect, it, vi } from 'vitest';
import { AjvTransacaoAutorizadaValidator } from '../../src/adapters/inbound/validation/AjvTransacaoAutorizadaValidator.js';
import { InMemoryIdempotencyRepository } from '../../src/adapters/outbound/idempotency/InMemoryIdempotencyRepository.js';
import { InvalidEventError } from '../../src/application/errors/EventErrors.js';
import type { AccountingLedger } from '../../src/application/ports/AccountingLedger.js';
import type { IdempotencyRepository } from '../../src/application/ports/IdempotencyRepository.js';
import type { Logger } from '../../src/application/ports/Logger.js';
import { ProcessTransacaoAutorizadaUseCase } from '../../src/application/use-cases/ProcessTransacaoAutorizadaUseCase.js';
import { UnsupportedOperationTypeError } from '../../src/domain/value-objects/EntryDirection.js';
import { VALID_EVENT_ID, validEvent } from '../fixtures.js';

interface FixtureOptions {
  idempotency?: IdempotencyRepository;
  ledgerError?: Error;
  markError?: Error;
}

function fixture(options: FixtureOptions = {}) {
  const append = options.ledgerError
    ? vi.fn().mockRejectedValue(options.ledgerError)
    : vi.fn().mockResolvedValue(undefined);
  const ledger: AccountingLedger = { append };

  const hasBeenProcessed = vi.fn().mockResolvedValue(false);
  const markAsProcessed = options.markError
    ? vi.fn().mockRejectedValue(options.markError)
    : vi.fn().mockResolvedValue(undefined);
  const idempotency: IdempotencyRepository = options.idempotency ?? {
    hasBeenProcessed,
    markAsProcessed,
  };

  const logger: Logger = { info: vi.fn(), error: vi.fn() };
  const useCase = new ProcessTransacaoAutorizadaUseCase(
    new AjvTransacaoAutorizadaValidator(),
    idempotency,
    ledger,
    logger,
    'accounting-consumer',
  );

  return { useCase, append, hasBeenProcessed, markAsProcessed, logger };
}

describe('ProcessTransacaoAutorizadaUseCase', () => {
  it('processa evento válido: lança no ledger e marca idempotência', async () => {
    const f = fixture();

    const result = await f.useCase.execute(validEvent());

    expect(result.status).toBe('PROCESSED');
    expect(result.entry).toMatchObject({
      entry_id: `entry-${VALID_EVENT_ID}`,
      event_id: VALID_EVENT_ID,
      id_contrato: 'CTR-001',
      id_autorizacao: 'AUT-001',
      tipo_operacao: null,
      valor: 100,
      direction: 'DEBIT',
    });
    expect(f.append).toHaveBeenCalledTimes(1);
    expect(f.append).toHaveBeenCalledWith(result.entry);
    expect(f.markAsProcessed).toHaveBeenCalledWith(VALID_EVENT_ID);
  });

  it('mesmo event_id entregue 2x gera exatamente 1 lançamento (dedup ADR-007)', async () => {
    const f = fixture({ idempotency: new InMemoryIdempotencyRepository() });

    const first = await f.useCase.execute(validEvent());
    const second = await f.useCase.execute(validEvent());

    expect(first.status).toBe('PROCESSED');
    expect(second).toEqual({ status: 'DUPLICATE_EVENT' });
    expect(f.append).toHaveBeenCalledTimes(1);
  });

  it('evento duplicado não toca o ledger nem marca idempotência novamente', async () => {
    const f = fixture();
    f.hasBeenProcessed.mockResolvedValue(true);

    await expect(f.useCase.execute(validEvent())).resolves.toEqual({
      status: 'DUPLICATE_EVENT',
    });

    expect(f.append).not.toHaveBeenCalled();
    expect(f.markAsProcessed).not.toHaveBeenCalled();
    expect(f.logger.info).toHaveBeenCalledWith(
      'Duplicate event ignored',
      expect.objectContaining({
        processing_status: 'DUPLICATE_EVENT',
        event_id: VALID_EVENT_ID,
      }),
    );
  });

  it('falha no ledger NÃO marca como processado e propaga erro (não ACK)', async () => {
    const f = fixture({ ledgerError: new Error('ledger dependency failed') });

    await expect(f.useCase.execute(validEvent())).rejects.toThrow('ledger dependency failed');
    expect(f.markAsProcessed).not.toHaveBeenCalled();
    expect(f.logger.error).toHaveBeenCalledWith(
      'Event processing failed',
      expect.objectContaining({ processing_status: 'PROCESSING_FAILED' }),
    );
  });

  it('erro não-Error do ledger é logado como string e propagado', async () => {
    const f = fixture();
    f.append.mockRejectedValueOnce('raw string failure');

    await expect(f.useCase.execute(validEvent())).rejects.toBe('raw string failure');
    expect(f.markAsProcessed).not.toHaveBeenCalled();
    expect(f.logger.error).toHaveBeenCalledWith(
      'Event processing failed',
      expect.objectContaining({
        processing_status: 'PROCESSING_FAILED',
        error: 'raw string failure',
      }),
    );
  });

  it('falha ao marcar idempotência propaga erro (mensagem não será deletada)', async () => {
    const f = fixture({ markError: new Error('idempotency store down') });

    await expect(f.useCase.execute(validEvent())).rejects.toThrow('idempotency store down');
    expect(f.append).toHaveBeenCalledTimes(1);
  });

  it('evento inválido é rejeitado sem efeito contábil', async () => {
    const f = fixture();
    const event = validEvent();
    delete event.id_contrato;

    await expect(f.useCase.execute(event)).rejects.toBeInstanceOf(InvalidEventError);
    expect(f.append).not.toHaveBeenCalled();
    expect(f.markAsProcessed).not.toHaveBeenCalled();
    expect(f.logger.error).toHaveBeenCalledWith(
      'Invalid event rejected',
      expect.objectContaining({ processing_status: 'INVALID_EVENT' }),
    );
  });

  it('payload não-objeto é rejeitado e logado sem metadata', async () => {
    const f = fixture();

    await expect(f.useCase.execute('not-an-object')).rejects.toBeInstanceOf(InvalidEventError);
    expect(f.logger.error).toHaveBeenCalledWith(
      'Invalid event rejected',
      expect.objectContaining({
        service: 'accounting-consumer',
        processing_status: 'INVALID_EVENT',
      }),
    );
    expect(f.append).not.toHaveBeenCalled();
  });

  it('tipo_operacao desconhecido falha sem lançamento e sem marcação (vai para redelivery/DLQ)', async () => {
    const f = fixture();

    await expect(f.useCase.execute(validEvent({ tipo_operacao: 'PIX' }))).rejects.toBeInstanceOf(
      UnsupportedOperationTypeError,
    );
    expect(f.append).not.toHaveBeenCalled();
    expect(f.markAsProcessed).not.toHaveBeenCalled();
    expect(f.logger.error).toHaveBeenCalledWith(
      'Event processing failed',
      expect.objectContaining({ processing_status: 'PROCESSING_FAILED' }),
    );
  });

  it('deriva direction por tipo_operacao: ESTORNO vira CREDIT', async () => {
    const f = fixture();

    const result = await f.useCase.execute(validEvent({ tipo_operacao: 'ESTORNO' }));

    expect(result.entry?.direction).toBe('CREDIT');
    expect(f.append).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'CREDIT', tipo_operacao: 'ESTORNO' }),
    );
  });

  it('loga RECEIVED com correlation_id/trace_id e PROCESSED com entry_id', async () => {
    const f = fixture();

    await f.useCase.execute(validEvent({ trace_id: 'trace-9' }));

    expect(f.logger.info).toHaveBeenCalledWith(
      'Event received',
      expect.objectContaining({
        processing_status: 'RECEIVED',
        correlation_id: 'CORR-001',
        trace_id: 'trace-9',
        id_autorizacao: 'AUT-001',
        id_contrato: 'CTR-001',
      }),
    );
    expect(f.logger.info).toHaveBeenCalledWith(
      'Accounting entry recorded',
      expect.objectContaining({
        processing_status: 'PROCESSED',
        entry_id: `entry-${VALID_EVENT_ID}`,
        direction: 'DEBIT',
        valor: 100,
      }),
    );
  });
});
