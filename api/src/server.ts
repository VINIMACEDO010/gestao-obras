import { criarApp } from './app.js';
import { verificadorCognito, verificadorDev } from './auth.js';
import { carregarConfig } from './config.js';
import { criarPool } from './db.js';
import { servicosAws } from './servicos.js';

const cfg = carregarConfig();
const pool = criarPool(cfg);
const app = await criarApp({
  cfg,
  pool,
  verificar: cfg.AUTH_MODE === 'dev' ? verificadorDev() : verificadorCognito(cfg),
  servicos: servicosAws(cfg),
});

if (cfg.AUTH_MODE === 'dev') app.log.warn('AUTH_MODE=dev: autenticação de desenvolvimento ATIVA');

const encerrar = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', encerrar);
process.on('SIGINT', encerrar);

await app.listen({ host: '0.0.0.0', port: cfg.PORT });
