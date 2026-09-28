export async function withServer(server, run) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  try {
    return await run('http://127.0.0.1:' + address.port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
