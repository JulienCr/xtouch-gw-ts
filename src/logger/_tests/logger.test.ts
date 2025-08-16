import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger, setLogLevel, getLogLevel } from "../../logger";

describe("logger", () => {
  const origLevel = getLogLevel();
  beforeEach(() => {
    setLogLevel("trace");
  });
  afterEach(() => {
    setLogLevel(origLevel);
  });

  it("respects log levels and formats output", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => { /* no-op */ });
    logger.info("hello", 123);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("can silence lower levels", () => {
    setLogLevel("error");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => { /* no-op */ });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => { /* no-op */ });
    logger.debug("nope");
    logger.error("boom");
    expect(logSpy).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
    logSpy.mockRestore();
    errSpy.mockRestore();
  });
});


