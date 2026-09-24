import type { AccountingEntry } from '../../domain/entities/AccountingEntry.js';

/**
 * Porta do ledger contábil (ADR-007: efeito de negócio idempotente).
 * Implementações: JsonLogLedger (local/dev) e DynamoDbLedger (produção).
 */
export interface AccountingLedger {
  append(entry: AccountingEntry): Promise<void>;
}
