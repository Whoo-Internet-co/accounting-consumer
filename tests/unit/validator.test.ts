import { describe, expect, it } from 'vitest';
import { AjvTransacaoAutorizadaValidator } from '../../src/adapters/inbound/validation/AjvTransacaoAutorizadaValidator.js';
import {
  IncompatibleEventVersionError,
  InvalidEventError,
  UnsupportedEventTypeError,
} from '../../src/application/errors/EventErrors.js';
import { VALID_EVENT_ID, validEvent } from '../fixtures.js';

function createValidator(): AjvTransacaoAutorizadaValidator {
  return new AjvTransacaoAutorizadaValidator();
}

describe('AjvTransacaoAutorizadaValidator (schema oficial via package)', () => {
  it('aceita evento válido e mapeia todos os campos do contrato', async () => {
    const event = await createValidator().validate(validEvent());

    expect(event).toEqual({
      event_id: VALID_EVENT_ID,
      event_type: 'TransacaoAutorizada',
      event_version: '1.0',
      occurred_at: '2026-09-23T20:00:00Z',
      id_autorizacao: 'AUT-001',
      id_contrato: 'CTR-001',
      valor: 100,
      saldo_reservado: 900,
      correlation_id: 'CORR-001',
      trace_id: null,
    });
  });

  it('aceita trace_id null e trace_id string', async () => {
    const validator = createValidator();

    await expect(validator.validate(validEvent({ trace_id: null }))).resolves.toMatchObject({
      trace_id: null,
    });
    await expect(validator.validate(validEvent({ trace_id: 'trace-1' }))).resolves.toMatchObject({
      trace_id: 'trace-1',
    });
  });

  it('rejeita trace_id com tipo incompatível', async () => {
    await expect(createValidator().validate(validEvent({ trace_id: 42 }))).rejects.toBeInstanceOf(
      InvalidEventError,
    );
  });

  it('rejeita event_id fora do format uuid', async () => {
    await expect(createValidator().validate(validEvent({ event_id: 'event-1' }))).rejects.toThrow(
      InvalidEventError,
    );
  });

  it('rejeita occurred_at sem sufixo Z obrigatório', async () => {
    await expect(
      createValidator().validate(validEvent({ occurred_at: '2026-09-23T20:00:00-03:00' })),
    ).rejects.toBeInstanceOf(InvalidEventError);
  });

  it('rejeita valor não positivo (exclusiveMinimum 0)', async () => {
    const validator = createValidator();

    await expect(validator.validate(validEvent({ valor: 0 }))).rejects.toBeInstanceOf(
      InvalidEventError,
    );
    await expect(validator.validate(validEvent({ valor: -10 }))).rejects.toBeInstanceOf(
      InvalidEventError,
    );
  });

  it('rejeita campos obrigatórios ausentes com mensagem descritiva', async () => {
    const event = validEvent();
    delete event.saldo_reservado;

    await expect(createValidator().validate(event)).rejects.toThrow(/saldo_reservado/);
  });

  it('rejeita payloads não-objeto', async () => {
    const validator = createValidator();

    await expect(validator.validate('string')).rejects.toBeInstanceOf(InvalidEventError);
    await expect(validator.validate(null)).rejects.toBeInstanceOf(InvalidEventError);
    await expect(validator.validate([validEvent()])).rejects.toBeInstanceOf(InvalidEventError);
  });

  it('classifica event_type desconhecido como UnsupportedEventTypeError', async () => {
    await expect(
      createValidator().validate(validEvent({ event_type: 'TransacaoNegada' })),
    ).rejects.toBeInstanceOf(UnsupportedEventTypeError);
  });

  it('classifica versão fora da major 1 como IncompatibleEventVersionError', async () => {
    const validator = createValidator();

    await expect(validator.validate(validEvent({ event_version: '2.0' }))).rejects.toBeInstanceOf(
      IncompatibleEventVersionError,
    );
    await expect(validator.validate(validEvent({ event_version: '1.2.3' }))).rejects.toBeInstanceOf(
      IncompatibleEventVersionError,
    );
  });

  it('aceita versões compatíveis 1.x (evolução MINOR, ADR-008)', async () => {
    await expect(
      createValidator().validate(validEvent({ event_version: '1.9' })),
    ).resolves.toMatchObject({ event_version: '1.9' });
  });

  it('tolera campos adicionais desconhecidos (additionalProperties: true)', async () => {
    const event = await createValidator().validate(
      validEvent({ campo_novo_do_producer: 'qualquer', tipo_operacao: 'ESTORNO' }),
    );

    expect(event.tipo_operacao).toBe('ESTORNO');
    expect(event).not.toHaveProperty('campo_novo_do_producer');
  });

  it('ignora tipo_operacao não-string no mapeamento (fora do vocabulário do contrato)', async () => {
    const event = await createValidator().validate(validEvent({ tipo_operacao: 42 }));

    expect(event.tipo_operacao).toBeUndefined();
  });

  it('compila o schema uma única vez e pode ser reutilizado em chamadas concorrentes', async () => {
    const validator = createValidator();

    const results = await Promise.all([
      validator.validate(validEvent()),
      validator.validate(validEvent({ tipo_operacao: 'DEBITO' })),
    ]);

    expect(results[0]?.event_id).toBe(VALID_EVENT_ID);
    expect(results[1]?.tipo_operacao).toBe('DEBITO');
  });
});
