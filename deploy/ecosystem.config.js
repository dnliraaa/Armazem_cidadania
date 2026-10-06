// Configuração do PM2 para o Armazém da Cidadania em produção.
//
// O Supabase self-hosted NÃO é gerenciado por aqui — ele roda via Docker
// Compose (ver deploy/DEPLOY.md, passo 6), separado do PM2. O frontend
// também não entra aqui: ele é buildado como arquivos estáticos
// (frontend/dist) e servido diretamente pelo Nginx, sem processo Node.
//
// Se o projeto estiver clonado em um caminho diferente de
// /opt/armazem-da-cidadania, ajuste os campos "cwd" abaixo.
//
// Uso: pm2 start deploy/ecosystem.config.js

const RAIZ = "/opt/armazem-da-cidadania";

module.exports = {
  apps: [
    {
      name: "armazem-backend",
      cwd: `${RAIZ}/backend`,
      script: "dist/server.js",
      interpreter: "node",
      // O backend já carrega backend/.env sozinho via `import "dotenv/config"`
      // (src/config/env.ts) — não é preciso passar variáveis de ambiente aqui,
      // desde que o processo rode com este "cwd".
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: "300M",
      time: true,
    },
  ],
};
