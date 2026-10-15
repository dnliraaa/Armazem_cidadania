import { Router } from "express";
import { supabaseAdmin } from "../config/supabase.js";
import { exigirAutenticacao } from "../middleware/auth.js";
import { hojeSaoPaulo } from "../utils/acoes.js";

const router = Router();

/**
 * GET /api/modulos-disponiveis — o que o funcionário logado pode acessar agora.
 *
 *   - armazem: tem acesso ao Armazém da Cidadania (admin sempre tem).
 *   - itinerante.acesso: tem acesso ao módulo (admin sempre tem).
 *   - itinerante.acoes: ações em andamento hoje (America/Sao_Paulo).
 *   - itinerante.disponivel: pode entrar agora. Não-admin só entra se houver ação em
 *     andamento; o admin sempre entra (mesmo sem ação em andamento, para administrar ações).
 */
router.get("/", exigirAutenticacao, async (req, res) => {
  const funcionario = req.funcionario!;
  const admin = funcionario.role === "admin";

  const acessoItinerante = admin || funcionario.acesso_itinerante;
  let acoes: unknown[] = [];

  if (acessoItinerante) {
    const hoje = hojeSaoPaulo();
    const { data, error } = await supabaseAdmin
      .from("acoes_itinerantes")
      .select("id, nome, descricao, local, data_inicio, data_fim")
      .eq("ativo", true)
      .lte("data_inicio", hoje)
      .gte("data_fim", hoje)
      .order("nome", { ascending: true });

    if (error) {
      console.error(error);
      return res.status(500).json({ erro: "Não foi possível consultar as ações em andamento." });
    }
    acoes = data ?? [];
  }

  res.json({
    armazem: admin || funcionario.acesso_armazem,
    itinerante: {
      acesso: acessoItinerante,
      disponivel: acessoItinerante && (admin || acoes.length > 0),
      acoes,
    },
  });
});

export default router;
