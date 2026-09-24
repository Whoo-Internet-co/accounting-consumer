import { describe, expect, it } from 'vitest';
import { SqsMessageBodyParser } from '../../src/adapters/inbound/sqs/SqsMessageBodyParser.js';
import { InvalidMessageBodyError } from '../../src/application/errors/EventErrors.js';
import { eventBridgeEnvelope, validEvent } from '../fixtures.js';

describe('SqsMessageBodyParser', () => {
  const parser = new SqsMessageBodyParser();

  it('retorna payload flat como está', () => {
    const event = validEvent();

    expect(parser.parse(JSON.stringify(event))).toEqual(event);
  });

  it('desembrulha envelope EventBridge retornando detail', () => {
    const event = validEvent();
    const body = JSON.stringify(eventBridgeEnvelope(event));

    expect(parser.parse(body)).toEqual(event);
  });

  it('rejeita envelope com detail não-objeto', () => {
    for (const detail of ['texto', 42, null, [1, 2]]) {
      expect(() =>
        parser.parse(JSON.stringify({ source: 'authorization-service', detail })),
      ).toThrow(InvalidMessageBodyError);
    }
  });

  it('rejeita body que não é JSON válido', () => {
    expect(() => parser.parse('{')).toThrow(InvalidMessageBodyError);
    expect(() => parser.parse('')).toThrow(InvalidMessageBodyError);
  });

  it('retorna JSON não-objeto sem chave detail como está', () => {
    expect(parser.parse(JSON.stringify([1, 2, 3]))).toEqual([1, 2, 3]);
    expect(parser.parse(JSON.stringify({ foo: 'bar' }))).toEqual({ foo: 'bar' });
  });
});
