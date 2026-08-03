/**
 * Logging — AGENTS.md §12, docs/SECURITY.md.
 *
 * The redaction tests are the point of this suite: a regression here leaks
 * file contents into logs.
 */
import { createLogger, LogLevel, type LogRecord } from '@telemetry/logger';

function collect(): { sink: (record: LogRecord) => void; records: LogRecord[] } {
  const records: LogRecord[] = [];
  return { sink: (record) => records.push(record), records };
}

describe('createLogger', () => {
  it('writes records at or above the configured level', () => {
    const { sink, records } = collect();
    const logger = createLogger('test', { level: LogLevel.Warn, sinks: [sink], now: () => 1000 });

    logger.debug('debug');
    logger.info('info');
    logger.warn('warn');
    logger.error('error');

    expect(records.map((record) => record.levelName)).toEqual(['WARN', 'ERROR']);
  });

  it('uses the injected clock so records are deterministic', () => {
    const { sink, records } = collect();
    createLogger('test', { sinks: [sink], now: () => 42 }).info('hello');

    expect(records[0]?.timestamp).toBe(42);
  });

  it('tags records with a nested scope', () => {
    const { sink, records } = collect();
    createLogger('photon', { sinks: [sink] })
      .child('events')
      .info('hello');

    expect(records[0]?.scope).toBe('photon:events');
  });

  it('is inert when no sink is configured', () => {
    expect(() => createLogger('test').error('nothing should happen')).not.toThrow();
  });

  describe('redaction', () => {
    it('never writes binary payloads, only their size', () => {
      const { sink, records } = collect();
      const logger = createLogger('test', { sinks: [sink] });

      logger.info('packet', { frame: new Uint8Array([1, 2, 3, 4, 5]) });

      expect(records[0]?.context?.['frame']).toBe('[binary 5 bytes]');
      expect(JSON.stringify(records[0])).not.toContain('1,2,3');
    });

    it('redacts sensitive keys case-insensitively', () => {
      const { sink, records } = collect();
      const logger = createLogger('test', { sinks: [sink] });

      logger.info('sensitive', {
        fileContent: 'a signed contract',
        sessionKey: 'abc123',
        packetPayload: 'raw',
        userPassword: 'hunter2',
        sequence: 7,
      });

      const context = records[0]?.context ?? {};
      expect(context['fileContent']).toBe('[redacted]');
      expect(context['sessionKey']).toBe('[redacted]');
      expect(context['packetPayload']).toBe('[redacted]');
      expect(context['userPassword']).toBe('[redacted]');
      expect(context['sequence']).toBe(7);
    });

    it('redacts inside nested objects', () => {
      const { sink, records } = collect();
      createLogger('test', { sinks: [sink] }).info('nested', {
        transfer: { id: 't1', payload: 'secret' },
      });

      expect(records[0]?.context?.['transfer']).toEqual({ id: 't1', payload: '[redacted]' });
    });

    it('honours additional redact keys', () => {
      const { sink, records } = collect();
      createLogger('test', { sinks: [sink], redactKeys: ['filename'] }).info('extra', {
        filename: 'tax-return.pdf',
      });

      expect(records[0]?.context?.['filename']).toBe('[redacted]');
    });

    it('truncates long strings', () => {
      const { sink, records } = collect();
      createLogger('test', { sinks: [sink] }).info('long', { note: 'x'.repeat(500) });

      const note = records[0]?.context?.['note'];
      expect(typeof note).toBe('string');
      expect(String(note)).toContain('(500 chars)');
      expect(String(note).length).toBeLessThan(300);
    });

    it('stops descending into deeply nested structures', () => {
      const { sink, records } = collect();
      createLogger('test', { sinks: [sink] }).info('deep', {
        a: { b: { c: { d: { e: 'too deep' } } } },
      });

      expect(JSON.stringify(records[0]?.context)).toContain('[nested]');
    });
  });

  it('freezes records so a sink cannot alter what later sinks receive', () => {
    const { sink, records } = collect();
    createLogger('test', { sinks: [sink] }).info('hello');

    expect(Object.isFrozen(records[0])).toBe(true);

    (records[0] as unknown as { message: string }).message = 'changed';
    expect(records[0]?.message).toBe('hello');
  });
});
