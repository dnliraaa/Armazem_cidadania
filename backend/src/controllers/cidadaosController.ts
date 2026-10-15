import type { Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase.js";
import { cpfValido, somenteDigitos } from "../utils/cpf.js";

const cpfOpcional = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .refine((valor) => !valor || cpfValido(valor), "CPF inválido.");

const maiusculo = (texto: string) => texto.toLocaleUpperCase("pt-BR");

const criarCidadaoSchema = z.object({
  // Os nomes (completo, social e da mãe) são sempre gravados em maiúsculo, independente de como foram digitados.
  nome: z.string().trim().min(3, "Informe o nome completo.").transform(maiusculo),
  // Opcional: se preenchido, é o nome chamado no painel. Vazio vira null.
  nome_social: z
    .string()
    .trim()
    .max(150, "O nome social é longo demais.")
    .optional()
    .nullable()
    .transform((valor) => (valor ? maiusculo(valor) : null)),
  cpf: cpfOpcional,
  data_nascimento: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Data de nascimento inválida."),
  nome_mae: z.string().trim().min(3, "Informe o nome da mãe.").transform(maiusculo),
  // Guardado só com dígitos (DDD + número: 10 ou 11 dígitos), como o CPF.
  telefone: z
    .string()
    .trim()
    .transform(somenteDigitos)
    .refine((digitos) => /^[1-9][1-9]\d{8,9}$/.test(digitos), "Informe um telefone válido com DDD."),
});

const atualizarCidadaoSchema = criarCidadaoSchema.partial();

/**
 * Escapa um valor para uso dentro do filtro `.or()` do PostgREST/Supabase,
 * que usa vírgula, ponto e parênteses como separadores de sintaxe. Sem isso,
 * uma busca por texto contendo esses caracteres (ex: "Silva, Jr") quebra o
 * parser do filtro e retorna erro 500.
 */
function escaparValorFiltroOr(valor: string): string {
  return `"${valor.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * GET /api/cidadaos?busca=texto
 *       /api/cidadaos?cpf=12345678900               (busca exata por CPF)
 *       /api/cidadaos?nome=...&data_nascimento=AAAA-MM-DD (nome parcial + data exata)
 */
export async function listarCidadaos(req: Request, res: Response) {
  const busca = typeof req.query.busca === "string" ? req.query.busca.trim() : "";
  const cpfParam = typeof req.query.cpf === "string" ? somenteDigitos(req.query.cpf) : "";
  const nomeParam = typeof req.query.nome === "string" ? req.query.nome.trim() : "";
  const nascimentoParam = typeof req.query.data_nascimento === "string" ? req.query.data_nascimento.trim() : "";

  let query = supabaseAdmin
    .from("cidadaos")
    .select("*")
    .order("nome", { ascending: true });

  if (typeof req.query.cpf === "string") {
    if (!cpfParam) return res.json([]);
    query = query.eq("cpf", cpfParam);
  } else if (nomeParam || nascimentoParam) {
    if (nomeParam) {
      // Casa com o nome completo OU com o nome social. Os curingas do LIKE são escapados
      // (o nome digitado é tratado literalmente) e o valor é protegido para o `.or()`.
      const padrao = escaparValorFiltroOr(`%${nomeParam.replace(/[\\%_]/g, "\\$&")}%`);
      query = query.or(`nome.ilike.${padrao},nome_social.ilike.${padrao}`);
    }
    if (nascimentoParam) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nascimentoParam)) {
        return res.status(400).json({ erro: "Data de nascimento inválida." });
      }
      query = query.eq("data_nascimento", nascimentoParam);
    }
  } else if (busca) {
    const buscaCpf = somenteDigitos(busca);
    if (buscaCpf.length >= 3) {
      const nomeFiltro = escaparValorFiltroOr(`%${busca}%`);
      query = query.or(`nome.ilike.${nomeFiltro},nome_social.ilike.${nomeFiltro},cpf.ilike.%${buscaCpf}%`);
    } else {
      const nomeFiltro = escaparValorFiltroOr(`%${busca}%`);
      query = query.or(`nome.ilike.${nomeFiltro},nome_social.ilike.${nomeFiltro}`);
    }
  }

  const { data, error } = await query;

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível listar os cidadãos." });
  }

  res.json(data);
}

/** GET /api/cidadaos/:id */
export async function obterCidadao(req: Request, res: Response) {
  const { id } = req.params;
  const { data, error } = await supabaseAdmin.from("cidadaos").select("*").eq("id", id).maybeSingle();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível buscar o cidadão." });
  }
  if (!data) {
    return res.status(404).json({ erro: "Cidadão não encontrado." });
  }

  res.json(data);
}

/** POST /api/cidadaos */
export async function criarCidadao(req: Request, res: Response) {
  const parse = criarCidadaoSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }

  const cpf = parse.data.cpf ? somenteDigitos(parse.data.cpf) : null;

  if (cpf) {
    const { data: existente } = await supabaseAdmin
      .from("cidadaos")
      .select("id")
      .eq("cpf", cpf)
      .maybeSingle();

    if (existente) {
      return res.status(409).json({ erro: "Já existe um cidadão cadastrado com este CPF." });
    }
  }

  const { data, error } = await supabaseAdmin
    .from("cidadaos")
    .insert({
      nome: parse.data.nome,
      nome_social: parse.data.nome_social,
      cpf,
      data_nascimento: parse.data.data_nascimento,
      nome_mae: parse.data.nome_mae,
      telefone: parse.data.telefone,
      criado_por: req.funcionario?.id ?? null,
    })
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível cadastrar o cidadão." });
  }

  res.status(201).json(data);
}

/** PUT /api/cidadaos/:id */
export async function atualizarCidadao(req: Request, res: Response) {
  const { id } = req.params;
  const parse = atualizarCidadaoSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }

  const atualizacoes: Record<string, unknown> = { ...parse.data };

  if (typeof atualizacoes.cpf === "string") {
    const cpf = atualizacoes.cpf ? somenteDigitos(atualizacoes.cpf) : null;
    atualizacoes.cpf = cpf;

    if (cpf) {
      const { data: existente } = await supabaseAdmin
        .from("cidadaos")
        .select("id")
        .eq("cpf", cpf)
        .neq("id", id)
        .maybeSingle();

      if (existente) {
        return res.status(409).json({ erro: "Já existe outro cidadão cadastrado com este CPF." });
      }
    }
  }

  const { data, error } = await supabaseAdmin
    .from("cidadaos")
    .update(atualizacoes)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível atualizar o cidadão." });
  }

  res.json(data);
}

/** DELETE /api/cidadaos/:id */
export async function removerCidadao(req: Request, res: Response) {
  const { id } = req.params;
  const { error } = await supabaseAdmin.from("cidadaos").delete().eq("id", id);

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível remover o cidadão." });
  }

  res.json({ ok: true });
}
