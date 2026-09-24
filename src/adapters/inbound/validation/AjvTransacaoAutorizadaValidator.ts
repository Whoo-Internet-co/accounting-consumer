import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import type { ValidateFunction } from 'ajv';
import { loadTransacaoAutorizadaV1Schema } from '@whoo-internet-co/finance-platform-contracts';
import {
  IncompatibleEventVersionError,
  InvalidEventError,
  UnsupportedEventTypeError,
} from '../../../application/errors/EventErrors.js';
import type { EventValidator } from '../../../application/ports/EventValidator.js';
import type { AuthorizedTransactionEvent } from '../../../domain/entities/AuthorizedTransactionEvent.js';

const EVENT_VERSION_PATTERN = /^1\.\d+$/;

// Interop NodeNext/CJS: ajv-formats define `module.exports = fn; exports.default = fn`.
const addFormats = addFormatsModule.default;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeErrors(errors: ValidateFunction['errors']): string {
  if (!errors || errors.length === 0) {
    return 'Event payload failed official contract validation';
  }
  return errors
    .map((error) =>
      `${error.instancePath === '' ? '/' : error.instancePath} ${error.message ?? ''}`.trim(),
    )
    .join('; ');
}

/**
 * Valida payloads contra o schema JSON oficial TransacaoAutorizada v1
 * (ADR-008: consumer contract testing contra a source of truth).
 *
 * O schema canônico é carregado do package
 * `@whoo-internet-co/finance-platform-contracts` e compilado uma única vez
 * (Ajv 2020-12 + ajv-formats para `uuid`/`date-time`).
 */
export class AjvTransacaoAutorizadaValidator implements EventValidator {
  private compiled?: Promise<ValidateFunction>;

  async validate(input: unknown): Promise<AuthorizedTransactionEvent> {
    if (isRecord(input)) {
      this.assertSupportedContract(input);
    }

    const validateFn = await this.getValidateFunction();
    if (!validateFn(input)) {
      throw new InvalidEventError(describeErrors(validateFn.errors));
    }

    return this.toEvent(input);
  }

  private assertSupportedContract(input: Record<string, unknown>): void {
    const eventType = input.event_type;
    if (typeof eventType === 'string' && eventType !== 'TransacaoAutorizada') {
      throw new UnsupportedEventTypeError(eventType);
    }

    const eventVersion = input.event_version;
    if (typeof eventVersion === 'string' && !EVENT_VERSION_PATTERN.test(eventVersion)) {
      throw new IncompatibleEventVersionError(eventVersion);
    }
  }

  private getValidateFunction(): Promise<ValidateFunction> {
    this.compiled ??= this.compileOfficialSchema();
    return this.compiled;
  }

  private async compileOfficialSchema(): Promise<ValidateFunction> {
    const schema = await loadTransacaoAutorizadaV1Schema();
    const ajv = new Ajv2020({ allErrors: true });
    addFormats(ajv);
    return ajv.compile(schema);
  }

  private toEvent(input: unknown): AuthorizedTransactionEvent {
    const value = input as Record<string, unknown>;
    const traceId = value.trace_id;
    const tipoOperacao = value.tipo_operacao;

    return {
      event_id: value.event_id as string,
      event_type: 'TransacaoAutorizada',
      event_version: value.event_version as string,
      occurred_at: value.occurred_at as string,
      id_autorizacao: value.id_autorizacao as string,
      id_contrato: value.id_contrato as string,
      valor: value.valor as number,
      saldo_reservado: value.saldo_reservado as number,
      correlation_id: value.correlation_id as string,
      trace_id: typeof traceId === 'string' ? traceId : null,
      ...(typeof tipoOperacao === 'string' ? { tipo_operacao: tipoOperacao } : {}),
    };
  }
}
