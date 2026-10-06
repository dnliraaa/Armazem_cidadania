import { Router } from "express";
import {
  atualizarPendente,
  chamarPendente,
  confirmarLote,
  atualizarAtendimento,
  confirmarPendente,
  criarPendenteManual,
  encaminharAtendimento,
  exigirPendenteAcessivel,
  exigirPendenteDoMeuNucleo,
  liberarPendente,
  listarAtendimentos,
  listarPendentes,
  listarResolvidosRecepcao,
  proximaSugestaoPendente,
  rejeitarPendente,
  resolverNaRecepcao,
} from "../controllers/atendimentosController.js";
import { exigirAutenticacao, exigirNivel } from "../middleware/auth.js";

const router = Router();

// Níveis por rota:
//  - encaminhar: recepção (e acesso amplo);
//  - fila/pendentes, listagem e edição de atendimentos: núcleo (e acesso amplo).
//    O nível núcleo fica restrito ao próprio núcleo + unidade nas rotas
//    `/pendentes/:id` (ver `exigirPendenteAcessivel`) e nas listagens;
//  - cadastro manual de pendente e confirmação em lote: só acesso amplo.
router.use(exigirAutenticacao);

const nucleoOuAmplo = exigirNivel("amplo", "nucleo");

router.get("/pendentes", nucleoOuAmplo, listarPendentes);
router.get("/pendentes/proxima-sugestao", nucleoOuAmplo, proximaSugestaoPendente);
router.post("/pendentes", exigirNivel("amplo"), criarPendenteManual);
router.post("/pendentes/confirmar-lote", exigirNivel("amplo"), confirmarLote);
router.put("/pendentes/:id", nucleoOuAmplo, exigirPendenteAcessivel, atualizarPendente);
router.post("/pendentes/:id/chamar", nucleoOuAmplo, exigirPendenteDoMeuNucleo, chamarPendente);
router.post("/pendentes/:id/liberar", nucleoOuAmplo, exigirPendenteAcessivel, liberarPendente);
router.post("/pendentes/:id/confirmar", nucleoOuAmplo, exigirPendenteAcessivel, confirmarPendente);
router.post("/pendentes/:id/rejeitar", nucleoOuAmplo, exigirPendenteAcessivel, rejeitarPendente);
router.post("/encaminhar", exigirNivel("amplo", "recepcao"), encaminharAtendimento);
router.post("/resolvido-recepcao", exigirNivel("amplo", "recepcao"), resolverNaRecepcao);
router.get("/resolvidos-recepcao", exigirNivel("amplo", "recepcao"), listarResolvidosRecepcao);
router.get("/", nucleoOuAmplo, listarAtendimentos);
router.patch("/:id", nucleoOuAmplo, atualizarAtendimento);

export default router;
