import type { EventProcessor } from '../../../application/ports/EventProcessor.js';
import type { Logger } from '../../../application/ports/Logger.js';
import type { MessageBodyParser } from '../../../application/ports/MessageBodyParser.js';
import type { QueueMessage, SqsClientPort } from '../../../application/ports/SqsClientPort.js';

export interface SqsConsumerConfig {
  queueUrl: string;
  waitTimeSeconds: number;
  visibilityTimeout: number;
  maxNumberOfMessages: number;
  pollErrorDelayMs?: number;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Loop de long polling (ADR-005/ADR-007):
 * - sucesso no processamento -> DeleteMessage (ACK);
 * - qualquer falha -> mensagem NÃO deletada (redelivery; DLQ via infra);
 * - AbortSignal encerra o loop sem iniciar novos polls (graceful shutdown).
 */
export class SqsConsumer {
  constructor(
    private readonly sqsClient: SqsClientPort,
    private readonly parser: MessageBodyParser,
    private readonly processor: EventProcessor,
    private readonly logger: Logger,
    private readonly config: SqsConsumerConfig,
  ) {}

  async start(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        await this.pollOnce(signal);
      } catch (error) {
        if (signal.aborted || isAbortError(error)) {
          break;
        }

        this.logger.error('SQS polling failed', {
          processing_status: 'PROCESSING_FAILED',
          error: error instanceof Error ? error.message : String(error),
        });
        await sleep(this.config.pollErrorDelayMs ?? 1000);
      }
    }
  }

  async pollOnce(signal?: AbortSignal): Promise<void> {
    const messages = await this.sqsClient.receiveMessages(
      {
        queueUrl: this.config.queueUrl,
        waitTimeSeconds: this.config.waitTimeSeconds,
        visibilityTimeout: this.config.visibilityTimeout,
        maxNumberOfMessages: this.config.maxNumberOfMessages,
      },
      signal,
    );

    for (const message of messages) {
      await this.processMessage(message);
    }
  }

  private async processMessage(message: QueueMessage): Promise<void> {
    if (!message.body || !message.receiptHandle) {
      this.logger.error('Malformed SQS message rejected', {
        message_id: message.messageId,
        processing_status: 'INVALID_EVENT',
      });
      return;
    }

    try {
      const payload = this.parser.parse(message.body);
      await this.processor.execute(payload);
      await this.sqsClient.deleteMessage(this.config.queueUrl, message.receiptHandle);
    } catch (error) {
      this.logger.error('SQS message left unacknowledged for redelivery', {
        message_id: message.messageId,
        processing_status: 'PROCESSING_FAILED',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
