import type { Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase.js";
import { unidadeDaInfraestrutura } from "../middleware/auth.js";

const criarTotemSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do totem."),
  unidade_id: z.string().uuid("Selecione uma unidade."),
});

const atualizarTotemSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do totem.").optional(),
  unidade_id: z.string().uuid("Selecione uma unidade.").optional(),
  ativo: z.boolean().optional(),
});

/** GET /api/totens — inclui o nome da unidade de cada totem. */
export async function listarTotens(req: Request, res: Response) {
  let consulta = supabaseAdmin.from("totens").select("*, unidades(nome)").order("nome", { ascending: true });
  // Infraestrutura só enxerga os totens da própria unidade.
  const unidadeInfra = unidadeDaInfraestrutura(req);
  if (unidadeInfra) consulta = consulta.eq("unidade_id", unidadeInfra);
  const { data, error } = await consulta;

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível listar os totens." });
  }

  const totens = (data ?? []).map(({ unidades, ...totem }) => ({
    ...totem,
    unidade_nome: (unidades as { nome: string } | null)?.nome ?? null,
  }));

  res.json(totens);
}

/** POST /api/totens */
export async function criarTotem(req: Request, res: Response) {
  const parse = criarTotemSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }

  const { data, error } = await supabaseAdmin
    .from("totens")
    .insert({ ...parse.data, ativo: true })
    .select("*, unidades(nome)")
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível cadastrar o totem." });
  }

  const { unidades, ...totem } = data;
  res.status(201).json({ ...totem, unidade_nome: (unidades as { nome: string } | null)?.nome ?? null });
}

/** PUT /api/totens/:id */
export async function atualizarTotem(req: Request, res: Response) {
  const { id } = req.params;
  const parse = atualizarTotemSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }

  const { data, error } = await supabaseAdmin
    .from("totens")
    .update(parse.data)
    .eq("id", id)
    .select("*, unidades(nome)")
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível atualizar o totem." });
  }

  const { unidades, ...totem } = data;
  res.json({ ...totem, unidade_nome: (unidades as { nome: string } | null)?.nome ?? null });
}
