import { describe, expect, it } from 'vitest';
import { buildEntryId, createAccountingEntry } from '../../src/domain/entities/AccountingEntry.js';
import type { AuthorizedTransactionEvent } from '../../src/domain/entities/AuthorizedTransactionEvent.js';
import {
  deriveEntryDirection,
  isEntryDirection,
  UnsupportedOperationTypeError,
} from '../../src/domain/value-objects/EntryDirection.js';
import { validEvent } from '../fixtures.js';

function toEvent(overrides: Record<string, unknown> = {}): AuthorizedTransactionEvent {
  return validEvent(overrides) as unknown as AuthorizedTransactionEvent;
}

describe('deriveEntryDirection (tipo_operacao + valor)', () => {
  it.each([
    ['DEBITO', 'DEBIT'],
    ['RESERVA', 'DEBIT'],
    ['CREDITO', 'CREDIT'],
    ['ESTORNO', 'CREDIT'],
  ])('tipo_operacao %s deriva direction %s', (tipoOperacao, expected) => {
    expect(deriveEntryDirection(tipoOperacao, 100)).toBe(expected);
  });

  it('normaliza caixa e espaços ao redor do tipo_operacao', () => {
    expect(deriveEntryDirection(' estorno ', 50)).toBe('CREDIT');
    expect(deriveEntryDirection('debito', 50)).toBe('DEBIT');
  });

  it('tipo_operacao ausente/nulo/vazio com valor positivo deriva DEBIT', () => {
    expect(deriveEntryDirection(undefined, 100)).toBe('DEBIT');
    expect(deriveEntryDirection(null, 100)).toBe('DEBIT');
    expect(deriveEntryDirection('', 100)).toBe('DEBIT');
    expect(deriveEntryDirection('   ', 100)).toBe('DEBIT');
  });

  it('tipo_operacao ausente com valor negativo deriva CREDIT (defensivo; schema v1 exige valor > 0)', () => {
    expect(deriveEntryDirection(undefined, -100)).toBe('CREDIT');
  });

  it('tipo_operacao desconhecido lança UnsupportedOperationTypeError', () => {
    expect(() => deriveEntryDirection('PIX', 100)).toThrow(UnsupportedOperationTypeError);
    expect(() => deriveEntryDirection('pix', 100)).toThrow(
      'Unsupported tipo_operacao for accounting entry: pix',
    );
  });

  it('isEntryDirection reconhece apenas DEBIT/CREDIT', () => {
    expect(isEntryDirection('DEBIT')).toBe(true);
    expect(isEntryDirection('CREDIT')).toBe(true);
    expect(isEntryDirection('CREDITO')).toBe(false);
  });
});

describe('createAccountingEntry', () => {
  it('gera entry_id determinístico a partir do event_id', () => {
    const event = toEvent();

    expect(buildEntryId(event.event_id)).toBe(`entry-${event.event_id}`);
    expect(createAccountingEntry(event).entry_id).toBe(`entry-${event.event_id}`);
    expect(createAccountingEntry(event).entry_id).toBe(createAccountingEntry(event).entry_id);
  });

  it('copia campos do evento e normaliza tipo_operacao ausente para null', () => {
    const entry = createAccountingEntry(toEvent(), () => new Date('2026-09-24T00:00:00.000Z'));

    expect(entry).toEqual({
      entry_id: 'entry-550e8400-e29b-41d4-a716-446655440000',
      event_id: '550e8400-e29b-41d4-a716-446655440000',
      id_contrato: 'CTR-001',
      id_autorizacao: 'AUT-001',
      tipo_operacao: null,
      valor: 100,
      direction: 'DEBIT',
      created_at: '2026-09-24T00:00:00.000Z',
    });
  });

  it('preserva tipo_operacao informado e deriva direction correspondente', () => {
    const entry = createAccountingEntry(toEvent({ tipo_operacao: 'CREDITO' }));

    expect(entry.tipo_operacao).toBe('CREDITO');
    expect(entry.direction).toBe('CREDIT');
  });

  it('created_at usa relógio real (ISO-8601) quando não injetado', () => {
    const entry = createAccountingEntry(toEvent());

    expect(Number.isNaN(Date.parse(entry.created_at))).toBe(false);
    expect(entry.created_at).toBe(new Date(entry.created_at).toISOString());
  });
});
