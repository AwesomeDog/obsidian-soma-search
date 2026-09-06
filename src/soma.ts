import { FileSystemAdapter, Notice, requestUrl, type Vault } from "obsidian";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";

export type SearchMode = "hybrid" | "lexical" | "vector";
export type SomaSettings = { executable: string; mode: SearchMode; limit: number };
export type Hit = { virtualPath: string; title?: string; snippet?: string; body?: string; line?: number };

type SomaResponse = {
  success?: boolean;
  durationMs?: number;
  data?: { results?: Hit[] };
  error?: { message?: string; remediation?: string };
};

export class Soma {
  private command: string | undefined;
  private server: ChildProcess | undefined;
  private port: number | undefined;
  private starting: Promise<void> | undefined;
  private unloaded = false;

  constructor(private vault: Vault, private settings: SomaSettings) {
    this.settings.limit = limit(this.settings.limit);
  }

  async isInitialized(): Promise<boolean> {
    return readFile(path.join(this.vaultPath(), ".soma", "local.yml"), "utf8")
      .then((config) => !/^projects:\s*\[\]\s*$/m.test(config), () => false);
  }

  async initialize(): Promise<void> {
    if (!await this.isInitialized()) {
      await this.run(["init", "--no-color"]);
      await this.run(["project", "add", "--exclude=.obsidian/**", "--no-color", "."]);
    }
    if (!await this.isInitialized()) throw new Error("Soma did not add the current vault as a project.");
    await this.start();
  }

  async search(query: string): Promise<{ hits: Hit[]; elapsed: number }> {
    await this.start();
    if (!this.port) throw new Error("The local Soma server is not ready.");
    const started = Date.now();
    let response;
    try {
      response = await requestUrl({
        url: `http://127.0.0.1:${this.port}/api/run`,
        method: "POST",
        contentType: "application/json",
        body: JSON.stringify({
          command: `search.${this.settings.mode}`,
          args: [query],
          options: { format: "json", limit: limit(this.settings.limit), "line-number": true },
          global: { "no-color": true }
        }),
        throw: false
      });
    } catch (error) {
      throw new Error(`Could not connect to the local Soma server. ${message(error)}`);
    }
    const payload = response.json as SomaResponse;
    if (payload.success !== true) {
      const detail = [payload.error?.message, payload.error?.remediation].filter(Boolean).join(" ");
      throw new Error(detail || `Soma search failed (HTTP ${response.status}).`);
    }
    const hits = payload.data?.results;
    if (!Array.isArray(hits)) throw new Error("The local Soma server returned an unrecognized search response.");
    const elapsed = Number.isFinite(payload.durationMs)
      ? Math.max(0, Math.round(payload.durationMs!))
      : Date.now() - started;
    return { hits, elapsed };
  }

  async start(): Promise<void> {
    if (this.server?.exitCode === null && this.port) return;
    if (!this.starting) {
      this.starting = this.startServer().finally(() => { this.starting = undefined; });
    }
    await this.starting;
  }

  stop(): void {
    this.unloaded = true;
    this.port = undefined;
    const child = this.server;
    this.server = undefined;
    if (child?.exitCode === null) child.kill();
  }

  resetCommand(): void {
    this.command = undefined;
  }

  private vaultPath(): string {
    const adapter = this.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) throw new Error("Soma Search requires a local filesystem vault.");
    return adapter.getBasePath();
  }

  private async startServer(): Promise<void> {
    await this.run(["--version"]);
    const port = await availablePort();
    if (this.unloaded) return;
    const child = spawn(this.command!, ["server", `--port=${port}`, "--auto-sync", "--no-color"], {
      cwd: this.vaultPath(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"]
    });
    this.server = child;
    let failure: Error | undefined;
    let output = "";
    for (const stream of [child.stdout, child.stderr]) {
      stream?.on("data", (chunk: Buffer | string) => { output = `${output}${chunk}`.slice(-4000); });
    }
    child.on("error", (error) => { failure = error; });
    child.on("exit", (code, signal) => {
      failure ??= new Error(`The local Soma server exited (${signal ?? code ?? "unknown"}).`);
      if (this.server !== child) return;
      const wasReady = this.port === port;
      this.server = undefined;
      this.port = undefined;
      if (wasReady && !this.unloaded) new Notice(failure.message);
    });
    try {
      await waitForServer(port, () => failure);
      if (failure || child.exitCode !== null) throw failure ?? new Error("The local Soma server exited immediately after startup.");
      if (this.unloaded) return void child.kill();
      this.port = port;
    } catch (error) {
      if (this.server === child) this.server = undefined;
      child.kill();
      throw new Error(output.trim() || message(error));
    }
  }

  private async run(args: string[]): Promise<string> {
    const configured = this.settings.executable.trim();
    const local = path.join(os.homedir(), ".local", "bin");
    const commands = this.command ? [this.command] : [
      configured,
      "soma",
      "/opt/homebrew/bin/soma",
      "/usr/local/bin/soma",
      path.join(local, "soma"),
      path.join(local, "soma.exe")
    ].filter(Boolean);
    for (const command of commands) {
      try {
        const stdout = await runSoma(command, args, this.vaultPath());
        this.command = command;
        return stdout;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    throw new Error("Could not find the Soma command. Make sure Soma is installed, or set the full executable path in the plugin settings.");
  }
}

function runSoma(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => execFile(command, args, {
    cwd, encoding: "utf8", maxBuffer: 10 * 1024 * 1024, windowsHide: true
  }, (error, stdout, stderr) => {
    if (!error) return resolve(stdout);
    const failure: NodeJS.ErrnoException = error instanceof Error ? error : new Error(String(error));
    if (failure.code === "ENOENT") return reject(failure);
    reject(new Error(stderr.trim() || stdout.trim() || failure.message));
  }));
}

function availablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer().once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        return server.close(() => reject(new Error("Could not obtain an available local port.")));
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForServer(port: number, failure: () => Error | undefined): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const error = failure();
    if (error) throw error;
    try {
      const response = await requestUrl({ url: `http://127.0.0.1:${port}/health`, throw: false });
      if (response.status === 200) return;
    } catch {
      // The server has not bound the port yet.
    }
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  throw failure() ?? new Error("Timed out waiting for the local Soma server to become ready.");
}

function limit(value: number): number { return Math.min(Math.max(Math.round(value / 5) * 5, 5), 100); }
export function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
