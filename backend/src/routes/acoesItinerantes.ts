import { Router } from "express";
import {
  atualizarAcao,
  atualizarTotemDaAcao,
  criarAcao,
  criarTotemDaAcao,
  listarAcoes,
  listarAcoesEmAndamento,
  listarTotensDaAcao,
} from "../controllers/acoesItinerantesController.js";
import { exigirAdmin, exigirAutenticacao } from "../middleware/auth.js";

const router = Router();

router.use(exigirAutenticacao);

// Seleção de ação: qualquer funcionário autenticado lista as ações em andamento hoje
// (quem pode ou não entrar no módulo é decidido por /api/modulos-disponiveis e pelo contexto).
router.get("/em-andamento", listarAcoesEmAndamento);

// Administração das ações e dos totens delas: só admin.
router.get("/", exigirAdmin, listarAcoes);
router.post("/", exigirAdmin, criarAcao);
router.put("/:id", exigirAdmin, atualizarAcao);
router.get("/:id/totens", exigirAdmin, listarTotensDaAcao);
router.post("/:id/totens", exigirAdmin, criarTotemDaAcao);
router.put("/:id/totens/:totemId", exigirAdmin, atualizarTotemDaAcao);

export default router;
