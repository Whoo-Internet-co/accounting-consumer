export interface QueueMessage {
  messageId?: string;
  receiptHandle?: string;
  body?: string;
}

export interface ReceiveMessagesInput {
  queueUrl: string;
  waitTimeSeconds: number;
  visibilityTimeout: number;
  maxNumberOfMessages: number;
}

export interface SqsClientPort {
  receiveMessages(input: ReceiveMessagesInput, signal?: AbortSignal): Promise<QueueMessage[]>;
  deleteMessage(queueUrl: string, receiptHandle: string): Promise<void>;
}
