import type { AccountingLedger } from '../../../application/ports/AccountingLedger.js';
import type { AccountingEntry } from '../../../domain/entities/AccountingEntry.js';
import type { DynamoDbDocumentClientPort } from '../../../infrastructure/aws/dynamodb.js';
import { PutCommand } from '@aws-sdk/lib-dynamodb';

/**
 * Ledger persistente em DynamoDB.
 * Tabela: ACCOUNTING_ENTRIES_TABLE (default finance-platform-accounting-entries).
 * PK: entry_id (determinístico a partir de event_id) → reescritas em
 * redelivery são idempotentes (mesmo item).
 */
export class DynamoDbLedger implements AccountingLedger {
  constructor(
    private readonly client: DynamoDbDocumentClientPort,
    private readonly tableName: string,
  ) {}

  async append(entry: AccountingEntry): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          entry_id: entry.entry_id,
          event_id: entry.event_id,
          id_contrato: entry.id_contrato,
          id_autorizacao: entry.id_autorizacao,
          tipo_operacao: entry.tipo_operacao,
          valor: entry.valor,
          direction: entry.direction,
          created_at: entry.created_at,
        },
      }),
    );
  }
}
