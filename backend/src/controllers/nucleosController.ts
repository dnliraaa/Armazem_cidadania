import type { Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase.js";

const criarNucleoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do núcleo."),
});

const atualizarNucleoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do núcleo.").optional(),
  ativo: z.boolean().optional(),
});

/** GET /api/nucleos */
export async function listarNucleos(_req: Request, res: Response) {
  const { data, error } = await supabaseAdmin
    .from("nucleos")
    .select("*, demandas(*)")
    .order("nome", { ascending: true });

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível listar os núcleos." });
  }

  const nucleos = (data ?? []).map((nucleo) => ({
    ...nucleo,
    demandas: [...nucleo.demandas].sort((a, b) => a.nome.localeCompare(b.nome)),
  }));

  res.json(nucleos);
}

/** POST /api/nucleos */
export async function criarNucleo(req: Request, res: Response) {
  const parse = criarNucleoSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }

  const { nome } = parse.data;

  const { data: existente } = await supabaseAdmin
    .from("nucleos")
    .select("id")
    .ilike("nome", nome)
    .maybeSingle();

  if (existente) {
    return res.status(409).json({ erro: "Já existe um núcleo cadastrado com este nome." });
  }

  const { data, error } = await supabaseAdmin
    .from("nucleos")
    .insert({ nome, ativo: true, criado_por: req.funcionario?.id ?? null })
    .select("*, demandas(*)")
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível cadastrar o núcleo." });
  }

  res.status(201).json(data);
}

/** PUT /api/nucleos/:id */
export async function atualizarNucleo(req: Request, res: Response) {
  const { id } = req.params;
  const parse = atualizarNucleoSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }

  const atualizacoes: Record<string, unknown> = { ...parse.data };

  if (typeof atualizacoes.nome === "string") {
    const { data: existente } = await supabaseAdmin
      .from("nucleos")
      .select("id")
      .ilike("nome", atualizacoes.nome)
      .neq("id", id)
      .maybeSingle();

    if (existente) {
      return res.status(409).json({ erro: "Já existe outro núcleo cadastrado com este nome." });
    }
  }

  const { data, error } = await supabaseAdmin
    .from("nucleos")
    .update(atualizacoes)
    .eq("id", id)
    .select("*, demandas(*)")
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível atualizar o núcleo." });
  }

  res.json(data);
}

/** DELETE /api/nucleos/:id */
export async function removerNucleo(req: Request, res: Response) {
  const { id } = req.params;

  // A FK demandas.nucleo_id está com ON DELETE CASCADE, então as demandas
  // do núcleo são removidas automaticamente pelo próprio banco.
  const { error } = await supabaseAdmin.from("nucleos").delete().eq("id", id);

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível remover o núcleo." });
  }

  res.json({ ok: true });
}
