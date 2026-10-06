import { Router } from "express";
import { atualizarTotem, criarTotem, listarTotens } from "../controllers/totensController.js";
import { exigirAdmin, exigirAutenticacao, exigirNivel } from "../middleware/auth.js";

const router = Router();

// Acesso amplo lista (tela de Unidades); infraestrutura lista só os totens da
// própria unidade (tela de configuração do totem — filtrado no controller).
router.use(exigirAutenticacao, exigirNivel("amplo", "infraestrutura"));

router.get("/", listarTotens);
router.post("/", exigirAdmin, criarTotem);
router.put("/:id", exigirAdmin, atualizarTotem);

export default router;
