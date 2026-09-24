import type { AccountingLedger } from '../../../application/ports/AccountingLedger.js';
import type { Logger } from '../../../application/ports/Logger.js';
import type { AccountingEntry } from '../../../domain/entities/AccountingEntry.js';

/**
 * Ledger padrão para local/dev: emite o lançamento como structured log JSON.
 * Não é um ledger contábil completo — demonstra o protocolo e o efeito
 * observável idempotente (ADR-007).
 */
export class JsonLogLedger implements AccountingLedger {
  constructor(private readonly logger: Logger) {}

  async append(entry: AccountingEntry): Promise<void> {
    this.logger.info('Accounting entry appended to json-log ledger', {
      ledger_backend: 'json-log',
      entry_id: entry.entry_id,
      event_id: entry.event_id,
      id_contrato: entry.id_contrato,
      id_autorizacao: entry.id_autorizacao,
      tipo_operacao: entry.tipo_operacao,
      valor: entry.valor,
      direction: entry.direction,
      created_at: entry.created_at,
    });
  }
}
