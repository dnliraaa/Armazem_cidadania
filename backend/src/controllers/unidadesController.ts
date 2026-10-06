import type { Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase.js";
import { unidadeDaInfraestrutura } from "../middleware/auth.js";

const enderecoSchema = z.string().trim().max(300, "O endereço é longo demais (máximo de 300 caracteres).");

const criarUnidadeSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da unidade."),
  endereco: enderecoSchema.nullable().optional(),
});

const atualizarUnidadeSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da unidade.").optional(),
  ativo: z.boolean().optional(),
  endereco: enderecoSchema.nullable().optional(),
});

/** GET /api/unidades */
export async function listarUnidades(req: Request, res: Response) {
  let consulta = supabaseAdmin.from("unidades").select("*").order("nome", { ascending: true });
  // Infraestrutura só enxerga a própria unidade.
  const unidadeInfra = unidadeDaInfraestrutura(req);
  if (unidadeInfra) consulta = consulta.eq("id", unidadeInfra);
  const { data, error } = await consulta;

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível listar as unidades." });
  }

  res.json(data);
}

/** POST /api/unidades */
export async function criarUnidade(req: Request, res: Response) {
  const parse = criarUnidadeSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }

  const { nome } = parse.data;

  const { data: existente } = await supabaseAdmin
    .from("unidades")
    .select("id")
    .ilike("nome", nome)
    .maybeSingle();

  if (existente) {
    return res.status(409).json({ erro: "Já existe uma unidade cadastrada com este nome." });
  }

  const { data, error } = await supabaseAdmin
    .from("unidades")
    .insert({ nome, endereco: parse.data.endereco || null, ativo: true, criado_por: req.funcionario?.id ?? null })
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível cadastrar a unidade." });
  }

  res.status(201).json(data);
}

/** PUT /api/unidades/:id */
export async function atualizarUnidade(req: Request, res: Response) {
  const { id } = req.params;
  const parse = atualizarUnidadeSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }

  const atualizacoes: Record<string, unknown> = { ...parse.data };
  // Endereço vazio = sem endereço (guarda null, não string vazia).
  if ("endereco" in atualizacoes) {
    atualizacoes.endereco = (atualizacoes.endereco as string | null)?.trim() || null;
  }

  if (typeof atualizacoes.nome === "string") {
    const { data: existente } = await supabaseAdmin
      .from("unidades")
      .select("id")
      .ilike("nome", atualizacoes.nome)
      .neq("id", id)
      .maybeSingle();

    if (existente) {
      return res.status(409).json({ erro: "Já existe outra unidade cadastrada com este nome." });
    }
  }

  const { data, error } = await supabaseAdmin
    .from("unidades")
    .update(atualizacoes)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível atualizar a unidade." });
  }

  res.json(data);
}
