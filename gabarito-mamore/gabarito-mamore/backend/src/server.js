'use strict';
const { loadEnv, config } = require('./env');
loadEnv();
const cfg = config({ trustProxy: process.env.TRUST_PROXY === '1' });
const { createApp } = require('./app');
const app = createApp(cfg);
app.server.listen(cfg.port, () => console.log(`Gabarito rodando em ${cfg.baseUrl} (porta ${cfg.port})`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => app.close().then(() => process.exit(0)));
