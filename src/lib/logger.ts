import pino from 'pino';

export const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
});

export const getChildLogger = (clientRef: string) => {
  return logger.child({ client_ref: clientRef });
};
