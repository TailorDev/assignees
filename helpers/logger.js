/* eslint no-console: 0 */

const prependMessage = (pre, fn) => (...args) => {
  const message = args.shift();

  fn(`${pre} ${message}`, ...args);
};

// basic logger
const logger = {
  info: (...args) => prependMessage('[info]', console.log)(...args),
  error: (...args) => prependMessage('[error]', console.log)(...args),
};

const nullLogger = {
  info: () => {},
  error: () => {},
};

exports.withRequestId = (logger, requestId) => {
  if (!requestId) {
    return logger;
  }

  return {
    info: (message) => logger.info(`request_id=${requestId} ${message}`),
    error: (message) => logger.error(`request_id=${requestId} ${message}`),
  };
};

exports.new = (env) => {
  if (env === 'test') {
    return nullLogger;
  }

  return logger;
};
