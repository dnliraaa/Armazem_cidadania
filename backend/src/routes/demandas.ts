import { Router } from "express";
import { atualizarDemanda, criarDemanda, removerDemanda } from "../controllers/demandasController.js";
import { exigirAutenticacao, exigirNivel } from "../middleware/auth.js";

const router = Router();

// Gerenciar demandas é do acesso amplo (admin/atendente).
router.use(exigirAutenticacao, exigirNivel("amplo"));

router.post("/", criarDemanda);
router.put("/:id", atualizarDemanda);
router.delete("/:id", removerDemanda);

export default router;
