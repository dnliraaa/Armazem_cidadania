import { Router } from "express";
import { atualizarUnidade, criarUnidade, listarUnidades } from "../controllers/unidadesController.js";
import { exigirAdmin, exigirAutenticacao, exigirNivel } from "../middleware/auth.js";

const router = Router();

// Acesso amplo lista (Unidades, cadastro de funcionário); infraestrutura vê só
// a própria unidade (nome exibido no painel — filtrado no controller).
router.use(exigirAutenticacao, exigirNivel("amplo", "infraestrutura"));

router.get("/", listarUnidades);
router.post("/", exigirAdmin, criarUnidade);
router.put("/:id", exigirAdmin, atualizarUnidade);

export default router;
