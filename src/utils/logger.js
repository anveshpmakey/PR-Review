const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

function threshold() {
  return LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;
}

function log(level, stream, args) {
  if (LEVELS[level] < threshold()) return;
  stream(new Date().toISOString(), level.toUpperCase(), ...args);
}

export const logger = {
  debug: (...args) => log('debug', console.log, args),
  info: (...args) => log('info', console.log, args),
  warn: (...args) => log('warn', console.warn, args),
  error: (...args) => log('error', console.error, args)
};
