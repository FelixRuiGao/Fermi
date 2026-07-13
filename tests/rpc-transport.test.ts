import { PassThrough } from "node:stream";

import { expect, it } from "bun:test";

import {
  createRpcServer,
  invalidParams,
  RPC_ERROR,
} from "../src/server/rpc-transport.js";

it("serializes typed handler validation failures as JSON-RPC INVALID_PARAMS", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const server = createRpcServer(input, output);
  server.on("test.invalid", () => {
    throw invalidParams("bad input");
  });

  const framePromise = new Promise<Record<string, any>>((resolve) => {
    let buffered = "";
    output.setEncoding("utf8");
    output.on("data", (chunk: string) => {
      buffered += chunk;
      const newline = buffered.indexOf("\n");
      if (newline >= 0) resolve(JSON.parse(buffered.slice(0, newline)));
    });
  });

  input.write(JSON.stringify({ id: 7, method: "test.invalid", params: {} }) + "\n");
  const frame = await framePromise;
  expect(frame).toEqual({
    id: 7,
    error: { code: RPC_ERROR.INVALID_PARAMS, message: "bad input" },
  });
  server.close();
});
