import type { LogFields, Logger } from '../../../application/ports/Logger.js';

export class JsonConsoleLogger implements Logger {
  constructor(private readonly serviceName: string) {}

  info(message: string, fields: LogFields = {}): void {
    console.log(this.serialize('INFO', message, fields));
  }

  error(message: string, fields: LogFields = {}): void {
    console.error(this.serialize('ERROR', message, fields));
  }

  private serialize(level: string, message: string, fields: LogFields): string {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      message,
      ...fields,
    });
  }
}
