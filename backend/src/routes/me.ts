import { Router } from "express";
import { supabaseAdmin } from "../config/supabase.js";
import { exigirAutenticacao } from "../middleware/auth.js";

const router = Router();

/** GET /api/me - retorna os dados do funcionário logado (+ nome da unidade/núcleo, se houver) */
router.get("/", exigirAutenticacao, async (req, res) => {
  const funcionario = req.funcionario!;

  const [{ data: unidade }, { data: nucleo }] = await Promise.all([
    funcionario.unidade_id
      ? supabaseAdmin.from("unidades").select("nome").eq("id", funcionario.unidade_id).maybeSingle()
      : Promise.resolve({ data: null }),
    funcionario.nucleo_id
      ? supabaseAdmin.from("nucleos").select("nome").eq("id", funcionario.nucleo_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  res.json({ ...funcionario, unidade_nome: unidade?.nome ?? null, nucleo_nome: nucleo?.nome ?? null });
});

export default router;
