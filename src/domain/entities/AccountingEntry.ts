import { deriveEntryDirection, type EntryDirection } from '../value-objects/EntryDirection.js';
import type { AuthorizedTransactionEvent } from './AuthorizedTransactionEvent.js';

/**
 * Lançamento contábil mínimo gerado a partir de um evento TransacaoAutorizada.
 *
 * entry_id é DETERMINÍSTICO (derivado de event_id): reprocessamentos após
 * redelivery produzem a mesma chave primária no ledger, tornando a escrita
 * idempotente também na camada de persistência (defesa em profundidade além
 * do IdempotencyRepository, ADR-007).
 */
export interface AccountingEntry {
  entry_id: string;
  event_id: string;
  id_contrato: string;
  id_autorizacao: string;
  tipo_operacao: string | null;
  valor: number;
  direction: EntryDirection;
  created_at: string;
}

export function buildEntryId(eventId: string): string {
  return `entry-${eventId}`;
}

export function createAccountingEntry(
  event: AuthorizedTransactionEvent,
  now: () => Date = () => new Date(),
): AccountingEntry {
  return {
    entry_id: buildEntryId(event.event_id),
    event_id: event.event_id,
    id_contrato: event.id_contrato,
    id_autorizacao: event.id_autorizacao,
    tipo_operacao: event.tipo_operacao ?? null,
    valor: event.valor,
    direction: deriveEntryDirection(event.tipo_operacao, event.valor),
    created_at: now().toISOString(),
  };
}
