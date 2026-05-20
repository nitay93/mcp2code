#!/usr/bin/env node
const readline = require("node:readline");

const tools = [
  {
    name: "echo_message",
    description: "Echo a message.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string" },
        count: { type: "integer" }
      },
      required: ["message"]
    },
    outputSchema: {
      type: "object",
      properties: {
        echoed: { type: "string" }
      },
      required: ["echoed"]
    }
  },
  {
    name: "hidden_tool",
    inputSchema: { type: "object", properties: {} }
  }
];

readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const request = JSON.parse(line);
  if (!request.id) return;
  if (request.method === "initialize") {
    respond(request.id, { protocolVersion: "2024-11-05", capabilities: {}, serverInfo: { name: "fixture", version: "1" } });
  } else if (request.method === "tools/list") {
    respond(request.id, { tools });
  } else if (request.method === "tools/call") {
    respond(request.id, {
      content: [{ type: "text", text: request.params.arguments.message }],
      structuredContent: { echoed: request.params.arguments.message }
    });
  } else {
    respond(request.id, {});
  }
});

function respond(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}
