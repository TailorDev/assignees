const info = (message) => {
  console.log(`[info] ${message}`);
};

const error = (message) => {
  console.log(`[error] ${message}`);
};

let logger;
if (process.env.NODE_ENV === 'test') {
  logger = {
    info: () => {},
    error: () => {},
  };
} else {
  logger = {
    info,
    error,
  };
}

module.exports = logger;
