import type { Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase.js";

const criarDemandaSchema = z.object({
  nucleo_id: z.string().uuid("Núcleo inválido."),
  nome: z.string().trim().min(2, "Informe o nome da demanda."),
});

const atualizarDemandaSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da demanda.").optional(),
  ativo: z.boolean().optional(),
});

/** POST /api/demandas */
export async function criarDemanda(req: Request, res: Response) {
  const parse = criarDemandaSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }

  const { nucleo_id, nome } = parse.data;

  const { data: existente } = await supabaseAdmin
    .from("demandas")
    .select("id")
    .eq("nucleo_id", nucleo_id)
    .ilike("nome", nome)
    .maybeSingle();

  if (existente) {
    return res.status(409).json({ erro: "Já existe uma demanda com este nome neste núcleo." });
  }

  const { data, error } = await supabaseAdmin
    .from("demandas")
    .insert({ nucleo_id, nome, ativo: true, criado_por: req.funcionario?.id ?? null })
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível cadastrar a demanda." });
  }

  res.status(201).json(data);
}

/** PUT /api/demandas/:id */
export async function atualizarDemanda(req: Request, res: Response) {
  const { id } = req.params;
  const parse = atualizarDemandaSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }

  const atualizacoes: Record<string, unknown> = { ...parse.data };

  if (typeof atualizacoes.nome === "string") {
    const { data: atual, error: erroAtual } = await supabaseAdmin
      .from("demandas")
      .select("nucleo_id")
      .eq("id", id)
      .maybeSingle();

    if (erroAtual) {
      console.error(erroAtual);
      return res.status(500).json({ erro: "Não foi possível atualizar a demanda." });
    }
    if (!atual) {
      return res.status(404).json({ erro: "Demanda não encontrada." });
    }

    const { data: existente } = await supabaseAdmin
      .from("demandas")
      .select("id")
      .eq("nucleo_id", atual.nucleo_id)
      .ilike("nome", atualizacoes.nome)
      .neq("id", id)
      .maybeSingle();

    if (existente) {
      return res.status(409).json({ erro: "Já existe outra demanda com este nome neste núcleo." });
    }
  }

  const { data, error } = await supabaseAdmin
    .from("demandas")
    .update(atualizacoes)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível atualizar a demanda." });
  }

  res.json(data);
}

/** DELETE /api/demandas/:id */
export async function removerDemanda(req: Request, res: Response) {
  const { id } = req.params;
  const { error } = await supabaseAdmin.from("demandas").delete().eq("id", id);

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível remover a demanda." });
  }

  res.json({ ok: true });
}
