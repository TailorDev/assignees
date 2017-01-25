const childProcess = require('child_process');

module.exports = () => {
  if (process.env.NODE_ENV === 'production') {
    const version = (() => {
      let v;

      try {
        v = process.env.SOURCE_VERSION || process.env.SHA || childProcess.execSync('git rev-parse HEAD').toString();
      } catch (e) {
        // occurs with Heroku deploy button for instance
        v = Date.now().toString();
      }

      return v;
    })();

    return (url) => {
      return `${url}?v=${version}`;
    };
  }

  return (url) => url;
};
