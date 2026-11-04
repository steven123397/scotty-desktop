import http from "node:http";

const status = Number(process.env.FAKE_STATUS ?? "200");
const port = Number(process.env.PORT ?? "0");
const host = process.env.HOSTNAME ?? "127.0.0.1";

const server = http.createServer((request, response) => {
  response.writeHead(request.url === "/" ? status : 404, { "content-type": "text/plain" });
  response.end("ok");
});

server.listen(port, host, () => {
  console.log(`fake-server listening on http://${host}:${server.address().port}/`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}