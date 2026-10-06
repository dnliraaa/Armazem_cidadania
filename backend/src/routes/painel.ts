import { Router } from "express";
import { obterPainel } from "../controllers/painelController.js";
import { exigirAutenticacao, exigirNivel } from "../middleware/auth.js";

const router = Router();

// O painel é exclusivo da infraestrutura (só da própria unidade — conferido no controller).
router.use(exigirAutenticacao, exigirNivel("infraestrutura"));

router.get("/", obterPainel);

export default router;
