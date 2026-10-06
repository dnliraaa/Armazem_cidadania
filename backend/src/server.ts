import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import atendimentosRouter from "./routes/atendimentos.js";
import cidadaosRouter from "./routes/cidadaos.js";
import demandasRouter from "./routes/demandas.js";
import filaRouter from "./routes/fila.js";
import funcionariosRouter from "./routes/funcionarios.js";
import meRouter from "./routes/me.js";
import nucleosRouter from "./routes/nucleos.js";
import painelRouter from "./routes/painel.js";
import totensRouter from "./routes/totens.js";
import unidadesRouter from "./routes/unidades.js";

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(
  cors({
    origin: env.frontendUrl.split(",").map((s) => s.trim()),
    credentials: true,
  })
);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, servico: "Armazém da Cidadania API" });
});

app.use("/api/me", meRouter);
app.use("/api/funcionarios", funcionariosRouter);
app.use("/api/cidadaos", cidadaosRouter);
app.use("/api/nucleos", nucleosRouter);
app.use("/api/demandas", demandasRouter);
app.use("/api/atendimentos", atendimentosRouter);
app.use("/api/fila", filaRouter);
app.use("/api/painel", painelRouter);
app.use("/api/unidades", unidadesRouter);
app.use("/api/totens", totensRouter);

// Tratamento de rota não encontrada
app.use((_req, res) => {
  res.status(404).json({ erro: "Rota não encontrada." });
});

app.listen(env.port, () => {
  console.log(`API do Armazém da Cidadania rodando em http://localhost:${env.port}`);
});
