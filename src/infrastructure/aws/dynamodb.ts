import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/** Superfície mínima usada pelos adapters (facilita client mockado em testes). */
export type DynamoDbDocumentClientPort = Pick<DynamoDBDocumentClient, 'send'>;

export function createDynamoDbDocumentClient(region: string): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
}
