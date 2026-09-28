import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 4300);
const host = process.env.HOST ?? '127.0.0.1';

createApp().listen(port, host, () => {
  process.stdout.write('Comercial API listening on ' + host + ':' + port + '\n');
});
