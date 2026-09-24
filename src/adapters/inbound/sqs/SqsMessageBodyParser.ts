import { InvalidMessageBodyError } from '../../../application/errors/EventErrors.js';
import type { MessageBodyParser } from '../../../application/ports/MessageBodyParser.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Aceita dois formatos de mensagem SQS (ADR-005):
 * - payload flat do evento;
 * - envelope EventBridge (`detail` contém o payload de negócio).
 */
export class SqsMessageBodyParser implements MessageBodyParser {
  parse(body: string): unknown {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new InvalidMessageBodyError('SQS message body is not valid JSON');
    }

    if (isRecord(parsed) && 'detail' in parsed) {
      const detail = parsed.detail;
      if (!isRecord(detail)) {
        throw new InvalidMessageBodyError('EventBridge detail must be a JSON object');
      }
      return detail;
    }

    return parsed;
  }
}
