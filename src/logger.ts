import pino from 'pino';

// Telegram API URLs embed the bot token (https://api.telegram.org/bot<id>:<secret>/...)
const BOT_TOKEN_PATTERN = /bot\d+:[A-Za-z0-9_-]{20,}/g;

export function redactSecrets<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replace(BOT_TOKEN_PATTERN, 'bot<redacted>') as T;
  }
  if (Array.isArray(value)) return value.map(redactSecrets) as T;
  // Only walk plain objects; Errors are left intact for the err serializer
  if (value === null || typeof value !== 'object') return value;
  const proto = Object.getPrototypeOf(value);
  if (proto === Object.prototype || proto === null) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, redactSecrets(v)]),
    ) as T;
  }
  return value;
}

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: { target: 'pino-pretty', options: { colorize: true } },
  serializers: {
    // Serialized errors (including nested causes) aren't plain objects, so redact their JSON form
    err: (err) =>
      err instanceof Error
        ? JSON.parse(
            redactSecrets(JSON.stringify(pino.stdSerializers.err(err))),
          )
        : redactSecrets(err),
  },
  hooks: {
    logMethod(args, method) {
      method.apply(this, args.map(redactSecrets) as typeof args);
    },
  },
});

// Route uncaught errors through pino so they get timestamps in stderr
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled rejection');
});
