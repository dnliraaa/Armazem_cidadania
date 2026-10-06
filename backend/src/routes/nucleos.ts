import { Router } from "express";
import { atualizarNucleo, criarNucleo, listarNucleos, removerNucleo } from "../controllers/nucleosController.js";
import { exigirAutenticacao, exigirNivel } from "../middleware/auth.js";

const router = Router();

router.use(exigirAutenticacao);

// Todo nível precisa LER os núcleos (recepção escolhe o destino; núcleo usa as
// demandas do seu núcleo). Só o acesso amplo cria/edita/remove.
router.get("/", listarNucleos);
router.post("/", exigirNivel("amplo"), criarNucleo);
router.put("/:id", exigirNivel("amplo"), atualizarNucleo);
router.delete("/:id", exigirNivel("amplo"), removerNucleo);

export default router;
