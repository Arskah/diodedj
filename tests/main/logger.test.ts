import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import electronLog from "electron-log/main";
import { init } from "../../src/main/logger";

const logDir = mkdtempSync(join(tmpdir(), "diodedj-logger-"));
electronLog.transports.file.resolvePathFn = () => join(logDir, "test.log");

const infoSpy = vi.spyOn(electronLog, "info");
const errorSpy = vi.spyOn(electronLog, "error");

const baseUncaught = process.listeners("uncaughtException").slice();
const baseRejection = process.listeners("unhandledRejection").slice();

afterAll(() => rmSync(logDir, { recursive: true, force: true }));

beforeEach(() => {
  delete process.env.DIODEDJ_LOG_LEVEL;
});

afterEach(() => {
  vi.clearAllMocks();
  for (const l of process.listeners("uncaughtException"))
    if (!baseUncaught.includes(l)) process.off("uncaughtException", l);
  for (const l of process.listeners("unhandledRejection"))
    if (!baseRejection.includes(l)) process.off("unhandledRejection", l);
});

describe("init", () => {
  it("resolves level from env, configures transports, logs startup info", () => {
    process.env.DIODEDJ_LOG_LEVEL = "DEBUG";
    init("4.2.0");

    expect(electronLog.transports.file.level).toBe("debug");
    expect(electronLog.transports.console.level).toBe("debug");
    expect(electronLog.transports.file.maxSize).toBe(12 * 1024 * 1024);
    expect(electronLog.transports.file.format).toContain("[{level}]");
    expect(electronLog.transports.file.format).toContain("{processType}");
    expect(electronLog.transports.console.format).toContain("[{level}]");

    expect(infoSpy).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("app start version=4.2.0"),
    );
    expect(infoSpy).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(`logger: writing to ${logDir}`),
    );
  });

  describe("error handlers", () => {
    beforeEach(() => init("1.0.0"));

    it("forwards uncaughtException to logger.error", () => {
      const handler = process
        .listeners("uncaughtException")
        .find((l) => !baseUncaught.includes(l)) as (...a: unknown[]) => void;
      const err = new Error("boom");
      handler(err);
      expect(errorSpy).toHaveBeenCalledWith("uncaughtException", err);
    });

    it("forwards unhandledRejection to logger.error", () => {
      const handler = process
        .listeners("unhandledRejection")
        .find((l) => !baseRejection.includes(l)) as (...a: unknown[]) => void;
      handler("nope");
      expect(errorSpy).toHaveBeenCalledWith("unhandledRejection", "nope");
    });
  });
});
