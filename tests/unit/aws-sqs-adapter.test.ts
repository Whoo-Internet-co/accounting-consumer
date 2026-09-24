import { describe, expect, it, vi } from 'vitest';
import { DeleteMessageCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs';
import type { SQSClient } from '@aws-sdk/client-sqs';
import { AwsSqsClientAdapter } from '../../src/infrastructure/aws/AwsSqsClientAdapter.js';
import { createDynamoDbDocumentClient } from '../../src/infrastructure/aws/dynamodb.js';
import type { ReceiveMessagesInput } from '../../src/application/ports/SqsClientPort.js';

const input: ReceiveMessagesInput = {
  queueUrl: 'https://sqs.us-east-1.amazonaws.com/123/accounting-queue',
  waitTimeSeconds: 20,
  visibilityTimeout: 30,
  maxNumberOfMessages: 10,
};

function adapterWith(send: ReturnType<typeof vi.fn>): AwsSqsClientAdapter {
  return new AwsSqsClientAdapter({ region: 'us-east-1' }, { send } as unknown as Pick<
    SQSClient,
    'send'
  >);
}

describe('AwsSqsClientAdapter', () => {
  it('mapeia mensagens recebidas para QueueMessage', async () => {
    const send = vi.fn().mockResolvedValue({
      Messages: [
        { MessageId: 'm1', ReceiptHandle: 'r1', Body: '{"a":1}' },
        {},
        { MessageId: 'm2' },
      ],
    });

    const messages = await adapterWith(send).receiveMessages(input);

    expect(messages).toEqual([
      { messageId: 'm1', receiptHandle: 'r1', body: '{"a":1}' },
      {},
      { messageId: 'm2' },
    ]);
    const command = send.mock.calls[0]?.[0] as ReceiveMessageCommand;
    expect(command).toBeInstanceOf(ReceiveMessageCommand);
    expect(command.input).toEqual({
      QueueUrl: input.queueUrl,
      WaitTimeSeconds: 20,
      VisibilityTimeout: 30,
      MaxNumberOfMessages: 10,
    });
  });

  it('retorna lista vazia quando a fila não tem mensagens', async () => {
    const send = vi.fn().mockResolvedValue({});

    await expect(adapterWith(send).receiveMessages(input)).resolves.toEqual([]);
  });

  it('propaga AbortSignal apenas quando fornecido', async () => {
    const send = vi.fn().mockResolvedValue({});
    const adapter = adapterWith(send);
    const controller = new AbortController();

    await adapter.receiveMessages(input, controller.signal);
    await adapter.receiveMessages(input);

    expect(send.mock.calls[0]?.[1]).toEqual({ abortSignal: controller.signal });
    expect(send.mock.calls[1]?.[1]).toEqual({});
  });

  it('deleta mensagem com QueueUrl e ReceiptHandle', async () => {
    const send = vi.fn().mockResolvedValue({});

    await adapterWith(send).deleteMessage(input.queueUrl, 'receipt-1');

    const command = send.mock.calls[0]?.[0] as DeleteMessageCommand;
    expect(command).toBeInstanceOf(DeleteMessageCommand);
    expect(command.input).toEqual({ QueueUrl: input.queueUrl, ReceiptHandle: 'receipt-1' });
  });

  it('cria SQSClient próprio quando nenhum client é injetado', () => {
    const adapter = new AwsSqsClientAdapter({ region: 'us-east-1' });

    expect(adapter).toBeInstanceOf(AwsSqsClientAdapter);
  });
});

describe('createDynamoDbDocumentClient', () => {
  it('retorna document client utilizável (sem I/O na construção)', () => {
    const client = createDynamoDbDocumentClient('us-east-1');

    expect(typeof client.send).toBe('function');
  });
});
