import { Router } from "express";
import {
  alterarSenhaFuncionario,
  ativarFuncionario,
  atualizarFuncionario,
  criarFuncionario,
  listarFuncionarios,
  removerFuncionario,
} from "../controllers/funcionariosController.js";
import { exigirAdmin, exigirAutenticacao } from "../middleware/auth.js";

const router = Router();

// Todas as rotas de funcionários exigem estar logado e ser admin
router.use(exigirAutenticacao, exigirAdmin);

router.get("/", listarFuncionarios);
router.post("/", criarFuncionario);
router.put("/:id", atualizarFuncionario);
router.put("/:id/senha", alterarSenhaFuncionario);
router.post("/:id/ativar", ativarFuncionario);
router.delete("/:id", removerFuncionario);

export default router;
