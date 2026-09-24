import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
  type SQSClientConfig,
} from '@aws-sdk/client-sqs';
import type {
  QueueMessage,
  ReceiveMessagesInput,
  SqsClientPort,
} from '../../application/ports/SqsClientPort.js';

type SqsSdkClient = Pick<SQSClient, 'send'>;

export class AwsSqsClientAdapter implements SqsClientPort {
  private readonly client: SqsSdkClient;

  constructor(config: SQSClientConfig, client?: SqsSdkClient) {
    this.client = client ?? new SQSClient(config);
  }

  async receiveMessages(
    input: ReceiveMessagesInput,
    signal?: AbortSignal,
  ): Promise<QueueMessage[]> {
    const command = new ReceiveMessageCommand({
      QueueUrl: input.queueUrl,
      WaitTimeSeconds: input.waitTimeSeconds,
      VisibilityTimeout: input.visibilityTimeout,
      MaxNumberOfMessages: input.maxNumberOfMessages,
    });

    const output = await this.client.send(command, {
      ...(signal ? { abortSignal: signal } : {}),
    });

    return (output.Messages ?? []).map((message) => ({
      ...(message.MessageId ? { messageId: message.MessageId } : {}),
      ...(message.ReceiptHandle ? { receiptHandle: message.ReceiptHandle } : {}),
      ...(message.Body ? { body: message.Body } : {}),
    }));
  }

  async deleteMessage(queueUrl: string, receiptHandle: string): Promise<void> {
    await this.client.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );
  }
}
