import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { IdempotencyRepository } from '../../../application/ports/IdempotencyRepository.js';
import type { DynamoDbDocumentClientPort } from '../../../infrastructure/aws/dynamodb.js';

function isConditionalCheckFailed(error: unknown): boolean {
  return error instanceof Error && error.name === 'ConditionalCheckFailedException';
}

/**
 * Idempotência persistente (ADR-004/ADR-007).
 * Tabela: IDEMPOTENCY_TABLE (default finance-platform-consumer-idempotency).
 * PK: event_id. Escrita com conditional put (`attribute_not_exists(event_id)`):
 * sob duplicação concorrente, a segunda escrita falha a condição e é tratada
 * como "já processado" (o efeito contábil é idempotente por entry_id
 * determinístico).
 *
 * Atenção: o default do IDEMPOTENCY_TABLE é compartilhável por consumers da
 * plataforma; como a PK é o event_id global, provisione UMA TABELA POR
 * CONSUMER (ou valore IDEMPOTENCY_TABLE por serviço) para evitar dedup
 * cruzado entre bounded contexts.
 */
export class DynamoDbIdempotencyRepository implements IdempotencyRepository {
  constructor(
    private readonly client: DynamoDbDocumentClientPort,
    private readonly tableName: string,
    private readonly serviceName: string,
  ) {}

  async hasBeenProcessed(eventId: string): Promise<boolean> {
    const output = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { event_id: eventId },
      }),
    );
    return output.Item !== undefined;
  }

  async markAsProcessed(eventId: string): Promise<void> {
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            event_id: eventId,
            service_name: this.serviceName,
            processed_at: new Date().toISOString(),
          },
          ConditionExpression: 'attribute_not_exists(event_id)',
        }),
      );
    } catch (error) {
      if (isConditionalCheckFailed(error)) {
        return;
      }
      throw error;
    }
  }
}
