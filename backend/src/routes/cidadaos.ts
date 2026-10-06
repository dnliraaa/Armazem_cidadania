import { Router } from "express";
import {
  atualizarCidadao,
  criarCidadao,
  listarCidadaos,
  obterCidadao,
  removerCidadao,
} from "../controllers/cidadaosController.js";
import { exigirAutenticacao, exigirNivel } from "../middleware/auth.js";

const router = Router();

router.use(exigirAutenticacao);

// A recepção só precisa buscar e cadastrar cidadãos (fluxo "Iniciar atendimento");
// o restante é do acesso amplo. Nível núcleo não acessa cidadãos.
router.get("/", exigirNivel("amplo", "recepcao"), listarCidadaos);
router.post("/", exigirNivel("amplo", "recepcao"), criarCidadao);
router.get("/:id", exigirNivel("amplo"), obterCidadao);
router.put("/:id", exigirNivel("amplo"), atualizarCidadao);
router.delete("/:id", exigirNivel("amplo"), removerCidadao);

export default router;
