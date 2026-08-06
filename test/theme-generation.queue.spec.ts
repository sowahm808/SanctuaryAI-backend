import { ConfigService } from "@nestjs/config";
import { createServer, Server, Socket } from "node:net";
import { AddressInfo } from "node:net";
import { ThemeGenerationProcessor } from "../src/modules/themes/theme-generation.processor";
import { THEME_GENERATION_QUEUE, ThemeGenerationQueue } from "../src/modules/themes/theme-generation.queue";

describe("ThemeGenerationQueue", () => {
  let server: Server;
  const sockets = new Set<Socket>();

  afterEach(async () => {
    for (const socket of sockets) socket.destroy();
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("authenticates with the username and password from an ACL Redis URL", async () => {
    const commands: string[] = [];
    server = createServer((socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      socket.on("data", (data: Buffer) => {
        commands.push(data.toString("utf8"));
        socket.write(commands.length === 1 ? "+OK\r\n" : ":1\r\n");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const config = new ConfigService({ REDIS_URL: `redis://queue-user:p%40ss@127.0.0.1:${port}` });
    const queue = new ThemeGenerationQueue(config, {} as ThemeGenerationProcessor);

    await queue.publish({ jobId: "job-1", correlationId: "correlation-1", organizationId: "org-1", themeId: "theme-1", sourceRevision: "rev-1" });

    expect(commands[0]).toBe("*3\r\n$4\r\nAUTH\r\n$10\r\nqueue-user\r\n$4\r\np@ss\r\n");
    expect(commands[1]).toContain(`\r\nRPUSH\r\n$${Buffer.byteLength(THEME_GENERATION_QUEUE)}\r\n${THEME_GENERATION_QUEUE}\r\n`);
  });
});
