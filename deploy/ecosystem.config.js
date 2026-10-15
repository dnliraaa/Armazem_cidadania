// Configuração do PM2 para o backend do Armazém da Cidadania (produção).
//
// Só o backend Node roda no PM2. O Supabase roda no Docker Compose (deploy/supabase) e o
// frontend é arquivo estático servido pelo Nginx (/var/www/armazemdacidadania).
//
// O backend carrega backend/.env sozinho (dotenv, a partir do "cwd" abaixo). Aqui só fixamos o
// que precisa estar sempre certo em produção: NODE_ENV, HOST (só loopback) e PORT.
//
// Se o projeto estiver clonado em outro caminho, defina RAIZ ao iniciar:
//   RAIZ=/home/deploy/armazem pm2 start deploy/ecosystem.config.js
//
// Uso:  pm2 start deploy/ecosystem.config.js
//       pm2 reload armazem-backend      (atualização sem derrubar)
//       pm2 save && pm2 startup          (sobe sozinho depois de reiniciar a VPS)

const RAIZ = process.env.RAIZ || "/opt/armazem-da-cidadania";
const LOGS = process.env.LOGS_DIR || "/var/log/armazem";

module.exports = {
  apps: [
    {
      name: "armazem-backend",
      cwd: `${RAIZ}/backend`,
      script: "dist/server.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: 3333,
      },

      // Reinício automático
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 3000,
      max_memory_restart: "300M",

      // Logs (rotacione com o pm2-logrotate: pm2 install pm2-logrotate)
      out_file: `${LOGS}/backend.out.log`,
      error_file: `${LOGS}/backend.err.log`,
      merge_logs: true,
      time: true,
    },
  ],
};
