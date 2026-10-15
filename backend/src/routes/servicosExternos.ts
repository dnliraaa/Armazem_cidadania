import { Router } from "express";
import {
  atualizarServicoExterno,
  criarServicoExterno,
  listarServicosExternos,
} from "../controllers/servicosExternosController.js";
import { exigirAutenticacao, exigirNivel } from "../middleware/auth.js";

const router = Router();

router.use(exigirAutenticacao);

// Núcleo lê os serviços do próprio núcleo (ficha de atendimento); só o acesso
// amplo (admin) cadastra e edita, como as demandas.
router.get("/", exigirNivel("amplo", "nucleo"), listarServicosExternos);
router.post("/", exigirNivel("amplo"), criarServicoExterno);
router.put("/:id", exigirNivel("amplo"), atualizarServicoExterno);

export default router;
