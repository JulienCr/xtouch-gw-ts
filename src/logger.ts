import chalk from "chalk";

export type LogLevel = "error" | "warn" | "info" | "debug" | "trace";

const levelRank: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

let currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info";

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

function shouldLog(level: LogLevel): boolean {
  return levelRank[level] <= levelRank[currentLevel];
}

function format(level: LogLevel, message: unknown, ...args: unknown[]): string {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${level.toUpperCase()}]`;
  const text = [message, ...args].map(String).join(" ");
  switch (level) {
    case "error":
      return chalk.red.bold(`${base} ${text}`);
    case "warn":
      return chalk.yellow(`${base} ${text}`);
    case "info":
      return chalk.cyan(`${base} ${text}`);
    case "debug":
      return chalk.gray(`${base} ${text}`);
    case "trace":
      return chalk.magenta(`${base} ${text}`);
  }
}

export const logger = {
  error: (message: unknown, ...args: unknown[]): void => {
    if (shouldLog("error")) console.error(format("error", message, ...args));
  },
  warn: (message: unknown, ...args: unknown[]): void => {
    if (shouldLog("warn")) console.warn(format("warn", message, ...args));
  },
  info: (message: unknown, ...args: unknown[]): void => {
    if (shouldLog("info")) console.log(format("info", message, ...args));
  },
  debug: (message: unknown, ...args: unknown[]): void => {
    if (shouldLog("debug")) console.log(format("debug", message, ...args));
  },
  trace: (message: unknown, ...args: unknown[]): void => {
    if (shouldLog("trace")) console.log(format("trace", message, ...args));
  },
}; 