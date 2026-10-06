import { Router } from "express";
import {
  chamarSenha,
  listarFila,
  marcarAtendida,
  marcarPerdida,
  proximaSenhaSugerida,
  rechamarManual,
  retirarSenha,
} from "../controllers/filaController.js";
import { exigirAutenticacao, exigirNivel } from "../middleware/auth.js";

const router = Router();

router.use(exigirAutenticacao);

// Retirar senha é exclusivo do totem, operado pela infraestrutura (e só nos
// totens da própria unidade — conferido no controller).
router.post("/retirar", exigirNivel("infraestrutura"), retirarSenha);

// O restante da fila de senhas é da recepção (e do acesso amplo).
const recepcaoOuAmplo = exigirNivel("amplo", "recepcao");
router.get("/", recepcaoOuAmplo, listarFila);
router.get("/proxima-sugestao", recepcaoOuAmplo, proximaSenhaSugerida);
router.post("/:id/chamar", recepcaoOuAmplo, chamarSenha);
router.post("/:id/rechamar-manual", recepcaoOuAmplo, rechamarManual);
router.post("/:id/atendida", recepcaoOuAmplo, marcarAtendida);
router.post("/:id/perdida", recepcaoOuAmplo, marcarPerdida);

export default router;
