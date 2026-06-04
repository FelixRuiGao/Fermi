import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { EventEmitter } from "events";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

export class FermiProcess extends EventEmitter {
  private child: ChildProcessWithoutNullStreams;
  private pending = new Map<number, PendingRequest>();
  private nextId = 1;
  private buffer = "";
  private closed = false;

  constructor(binaryPath: string, workDir: string) {
    super();

    this.child = spawn(binaryPath, ["--server", "--work-dir", workDir], {
      cwd: workDir,
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => this.onStdout(chunk));

    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk: string) => {
      this.emit("stderr", chunk);
    });

    this.child.on("exit", (code, signal) => {
      this.closed = true;
      for (const p of this.pending.values()) {
        p.reject(new Error(`fermi server exited (code=${code}, signal=${signal})`));
      }
      this.pending.clear();
      this.emit("exit", code, signal);
    });
  }

  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (this.closed) throw new Error("fermi process is closed");

    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      this.write({ id, method, params });
    });
  }

  kill(): void {
    if (!this.closed) {
      this.closed = true;
      this.child.kill();
    }
  }

  get isAlive(): boolean {
    return !this.closed;
  }

  private write(frame: unknown): void {
    if (this.closed) return;
    try {
      this.child.stdin.write(JSON.stringify(frame) + "\n");
    } catch {}
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;
    let nl = this.buffer.indexOf("\n");
    while (nl >= 0) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (line.length > 0) this.handleLine(line);
      nl = this.buffer.indexOf("\n");
    }
  }

  private handleLine(line: string): void {
    let frame: any;
    try {
      frame = JSON.parse(line);
    } catch {
      return;
    }

    // Response to a request
    if (typeof frame.id === "number" && this.pending.has(frame.id)) {
      const p = this.pending.get(frame.id)!;
      this.pending.delete(frame.id);
      if (frame.error) {
        p.reject(new Error(frame.error.message ?? JSON.stringify(frame.error)));
      } else {
        p.resolve(frame.result);
      }
      return;
    }

    // Server-initiated event
    if (typeof frame.method === "string" && frame.id === undefined) {
      this.emit("server-event", frame.method, frame.params);
    }
  }
}
