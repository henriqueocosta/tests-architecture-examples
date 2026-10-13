// Structured logs: one JSON object per line. LOG_LEVEL=silent turns them off (tests).
export type Logger = {
  info(msg: string, fields?: object): void;
  warn(msg: string, fields?: object): void;
  error(msg: string, fields?: object): void;
  child(fields: object): Logger;
};

export function createLogger(base: object = {}): Logger {
  const silent = process.env.LOG_LEVEL === "silent";
  const write = (level: string, msg: string, fields: object = {}) => {
    if (silent) return;
    console.log(JSON.stringify({ time: new Date().toISOString(), level, msg, ...base, ...fields }));
  };
  return {
    info: (msg, fields) => write("info", msg, fields),
    warn: (msg, fields) => write("warn", msg, fields),
    error: (msg, fields) => write("error", msg, fields),
    child: (fields) => createLogger({ ...base, ...fields }),
  };
}
