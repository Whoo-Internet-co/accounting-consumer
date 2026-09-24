import { createAccountingEntry } from '../../domain/entities/AccountingEntry.js';
import type { AuthorizedTransactionEvent } from '../../domain/entities/AuthorizedTransactionEvent.js';
import { InvalidEventError } from '../errors/EventErrors.js';
import type { AccountingLedger } from '../ports/AccountingLedger.js';
import type { EventProcessor, EventProcessorResult } from '../ports/EventProcessor.js';
import type { EventValidator } from '../ports/EventValidator.js';
import type { IdempotencyRepository } from '../ports/IdempotencyRepository.js';
import type { Logger } from '../ports/Logger.js';

interface EventMetadata {
  event_id?: unknown;
  event_type?: unknown;
  event_version?: unknown;
  correlation_id?: unknown;
  trace_id?: unknown;
  id_autorizacao?: unknown;
}

function extractMetadata(input: unknown): EventMetadata {
  if (typeof input !== 'object' || input === null) {
    return {};
  }

  const value = input as Record<string, unknown>;
  return {
    event_id: value.event_id,
    event_type: value.event_type,
    event_version: value.event_version,
    correlation_id: value.correlation_id,
    trace_id: value.trace_id,
    id_autorizacao: value.id_autorizacao,
  };
}

/**
 * Use case ProcessTransacaoAutorizada (ADR-007):
 *
 *   validate contract -> dedup event_id -> lançamento contábil (ledger)
 *   -> mark processed -> (caller) delete message
 *
 * Falha em qualquer etapa: NÃO marca como processado e NÃO deleta a mensagem
 * (o caller SqsConsumer só deleta após sucesso) -> redelivery SQS -> DLQ via
 * infraestrutura após maxReceiveCount.
 */
export class ProcessTransacaoAutorizadaUseCase implements EventProcessor {
  constructor(
    private readonly validator: EventValidator,
    private readonly idempotencyRepository: IdempotencyRepository,
    private readonly ledger: AccountingLedger,
    private readonly logger: Logger,
    private readonly serviceName: string,
  ) {}

  async execute(input: unknown): Promise<EventProcessorResult> {
    const tentativeMetadata = extractMetadata(input);

    try {
      const event = await this.validator.validate(input);

      const logContext = this.toLogContext(event);
      this.logger.info('Event received', {
        ...logContext,
        processing_status: 'RECEIVED',
      });

      if (await this.idempotencyRepository.hasBeenProcessed(event.event_id)) {
        this.logger.info('Duplicate event ignored', {
          ...logContext,
          processing_status: 'DUPLICATE_EVENT',
        });
        return { status: 'DUPLICATE_EVENT' };
      }

      const entry = createAccountingEntry(event);
      await this.ledger.append(entry);

      this.logger.info('Accounting entry recorded', {
        ...logContext,
        entry_id: entry.entry_id,
        direction: entry.direction,
        valor: entry.valor,
        processing_status: 'PROCESSED',
      });

      await this.idempotencyRepository.markAsProcessed(event.event_id);

      return { status: 'PROCESSED', entry };
    } catch (error) {
      if (error instanceof InvalidEventError) {
        this.logger.error('Invalid event rejected', {
          service: this.serviceName,
          ...tentativeMetadata,
          processing_status: 'INVALID_EVENT',
          error: error.message,
        });
      } else {
        this.logger.error('Event processing failed', {
          service: this.serviceName,
          ...tentativeMetadata,
          processing_status: 'PROCESSING_FAILED',
          error: error instanceof Error ? error.message : String(error),
        });
      }

      throw error;
    }
  }

  private toLogContext(event: AuthorizedTransactionEvent): Record<string, unknown> {
    return {
      service: this.serviceName,
      event_id: event.event_id,
      event_type: event.event_type,
      event_version: event.event_version,
      correlation_id: event.correlation_id,
      trace_id: event.trace_id,
      id_autorizacao: event.id_autorizacao,
      id_contrato: event.id_contrato,
    };
  }
}
