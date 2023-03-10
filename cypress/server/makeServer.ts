import url from "url";
import http from "http";
import { WebSocketServer } from "ws";
import type { AddressInfo } from "net";
import express from "express";
import { graphqlHTTP } from "express-graphql";
import { useServer } from "graphql-ws/lib/use/ws";
import * as esbuild from "esbuild";
import { createHandler } from "graphql-sse/lib/use/express";
import { default as Redis } from "ioredis";
import { testSchema } from "../../tests/fixtures/test-schema";
import { addContinuationsToSchema, memoryAdapter, redisAdapter } from "../..";
import type { GraphQLSchema } from "graphql";

export async function makeServer(port = 0) {
  const app = express();

  const memorySchema = addContinuationsToSchema(testSchema, {
    adapter: memoryAdapter(),
    addSubscriptionField: true,
  });

  const handler = createHandler({ schema: memorySchema });
  const graphqlWSMemory = new WebSocketServer({ noServer: true });
  app.use("/graphql/memory/sse", handler);
  app.use(
    "/graphql/memory",
    graphqlHTTP({
      schema: memorySchema,
      graphiql: true,
    })
  );

  useServer({ schema: memorySchema }, graphqlWSMemory);

  const { REDIS_URL } = process.env;

  let redisSchema: GraphQLSchema | undefined;
  let graphqlWSRedis: WebSocketServer | undefined;
  if (REDIS_URL) {
    const client = new Redis(REDIS_URL);
    const clientSubscribe = new Redis(REDIS_URL);
    redisSchema = addContinuationsToSchema(testSchema, {
      adapter: redisAdapter({
        client,
        clientSubscribe,
      }),
      addSubscriptionField: true,
    });
    const handler = createHandler({ schema: redisSchema });
    app.use("/graphql/redis/sse", handler);
    app.use("/graphql/redis", (req, res) => {
      //
    });
    graphqlWSRedis = new WebSocketServer({ noServer: true });
    useServer({ schema: redisSchema }, graphqlWSRedis);
  }

  // Note: This is recommended for development use only, do not copy this pattern
  // for production
  const pCtx = await esbuild.context({
    absWorkingDir: __dirname,
    entryPoints: ["app/index.tsx"],
    bundle: true,
    outdir: "dist/js",
  });

  const esbuildServe = await pCtx.serve({
    servedir: "dist",
  });

  app.use("*", (req, res) => {
    // Assume all HTML content is serving the index
    const path = req.headers.accept?.includes("text/html")
      ? "/"
      : req.originalUrl;
    const options: http.RequestOptions = {
      hostname: esbuildServe.host,
      port: esbuildServe.port,
      path,
      method: req.method,
      headers: req.headers,
    };

    const proxyReq = http.request(options, (proxyRes) => {
      // If esbuild returns "not found", send a custom 404 page
      if (proxyRes.statusCode === 404) {
        res.writeHead(404, { "Content-Type": "text/html" });
        res.end("<h1>404 Not Found</h1>");
        return;
      }
      res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });
    req.pipe(proxyReq, { end: true });
  });

  const server = app.listen(port, () => {
    server.on("upgrade", (req, socket, head) => {
      const pathname = url.parse(req.url ?? "").pathname;
      if (pathname === "/graphql/redis" && graphqlWSRedis) {
        const wsRedis = graphqlWSRedis;
        wsRedis.handleUpgrade(req, socket, head, (client) => {
          wsRedis.emit("connection", client, req);
        });
        return;
      }
      if (pathname === "/graphql/memory") {
        graphqlWSMemory.handleUpgrade(req, socket, head, (client) => {
          graphqlWSMemory.emit("connection", client, req);
        });
        return;
      }
      console.log(`Incorrect url: ${req.url}`);
      return socket.destroy();
    });
    console.log(
      `Server listening on PORT: ${(server.address() as AddressInfo).port}`
    );
  });

  return server;
}
