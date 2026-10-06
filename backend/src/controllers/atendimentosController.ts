import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase.js";
import { cpfValido, somenteDigitos } from "../utils/cpf.js";

const statusSchema = z.enum(["pendente_revisao", "em_atendimento", "confirmado", "rejeitado"]);

/** Data de hoje no formato YYYY-MM-DD (mesmo formato aceito pela coluna `date` do Postgres). */
function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Um funcionário de nível "nucleo" só enxerga/atende a fila do próprio
 * núcleo (mesmo padrão de `unidadeDoFuncionario` na fila da recepção).
 */
function nucleoDoFuncionario(req: Request): string | null {
  return req.funcionario?.role === "nucleo" ? req.funcionario.nucleo_id : null;
}

/** UUID que nunca existe: faz o filtro por unidade não casar com nada quando o cadastro do funcionário está incompleto. */
const UNIDADE_INEXISTENTE = "00000000-0000-0000-0000-000000000000";

/**
 * Funcionário "nucleo" atua em um núcleo DENTRO de uma unidade: só vê os
 * encaminhamentos/atendimentos da recepção da mesma unidade. Sem unidade
 * cadastrada, não vê nada (falha fechada).
 */
function unidadeDoFuncionarioNucleo(req: Request): string | null {
  return req.funcionario?.role === "nucleo" ? req.funcionario.unidade_id ?? UNIDADE_INEXISTENTE : null;
}

/**
 * Para rotas `/pendentes/:id`: um funcionário "nucleo" só pode mexer em
 * pendentes do próprio núcleo. Com `respeitarChamador`, também bloqueia
 * pendentes que estão em atendimento por outro funcionário do núcleo.
 */
function exigirPendenteDoNucleo(respeitarChamador: boolean) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.funcionario?.role !== "nucleo") return next();

    const { data: pendente, error } = await supabaseAdmin
      .from("atendimentos_pendentes")
      .select("nucleo_id, unidade_id, status, chamado_por")
      .eq("id", req.params.id)
      .maybeSingle();

    if (error) {
      console.error(error);
      return res.status(500).json({ erro: "Não foi possível consultar o atendimento pendente." });
    }
    if (
      !pendente ||
      pendente.nucleo_id !== req.funcionario.nucleo_id ||
      pendente.unidade_id !== unidadeDoFuncionarioNucleo(req)
    ) {
      return res.status(404).json({ erro: "Atendimento pendente não encontrado." });
    }
    if (respeitarChamador && pendente.status === "em_atendimento" && pendente.chamado_por !== req.funcionario.id) {
      return res.status(409).json({ erro: "Este atendimento está sendo feito por outro funcionário." });
    }
    next();
  };
}

/** Rotas `/pendentes/:id` de leitura/edição/confirmação/rejeição/liberação. */
export const exigirPendenteAcessivel = exigirPendenteDoNucleo(true);
/** Rota de chamar: só confere o núcleo (o "travamento" é feito atomicamente no update). */
export const exigirPendenteDoMeuNucleo = exigirPendenteDoNucleo(false);

/**
 * Calcula os problemas objetivos de um atendimento pendente. Não considera
 * `erro_ignorado` — só aponta o que está errado; quem decide se isso barra a
 * confirmação é quem chama esta função.
 */
function calcularErros(pendente: {
  validacoes: unknown;
  cpf_texto: string | null;
  cidadao_id: string | null;
  nome: string | null;
  demanda_principal_id: string | null;
  outras_demandas: string[] | null;
}): string[] {
  const erros: string[] = [];

  const validacoes = pendente.validacoes as { cpfValido?: boolean } | null;
  if (validacoes?.cpfValido === false) {
    erros.push("cpf_invalido");
  }
  if (pendente.cpf_texto && !pendente.cidadao_id) {
    erros.push("cidadao_nao_encontrado");
  }
  if (!pendente.nome || !pendente.nome.trim()) {
    erros.push("nome_vazio");
  }
  const temPrincipal = Boolean(pendente.demanda_principal_id);
  const temOutras = Array.isArray(pendente.outras_demandas) && pendente.outras_demandas.length > 0;
  if (!temPrincipal && !temOutras) {
    erros.push("sem_demanda");
  }

  return erros;
}

const ERRO_LABELS: Record<string, string> = {
  cpf_invalido: "CPF inválido",
  cidadao_nao_encontrado: "cidadão não cadastrado",
  nome_vazio: "nome em branco",
  sem_demanda: "nenhuma demanda selecionada",
};

function descreverErros(erros: string[]): string {
  return erros.map((codigo) => ERRO_LABELS[codigo] ?? codigo).join(", ");
}

/** Busca nomes de núcleos/demandas em lote e devolve mapas id -> nome, para enriquecer listagens sem depender de embeds do PostgREST. */
async function buscarMapasNomes(nucleoIds: string[], demandaIds: string[]) {
  const [{ data: nucleos }, { data: demandas }] = await Promise.all([
    nucleoIds.length
      ? supabaseAdmin.from("nucleos").select("id, nome").in("id", nucleoIds)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    demandaIds.length
      ? supabaseAdmin.from("demandas").select("id, nome").in("id", demandaIds)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
  ]);

  return {
    nucleoMap: new Map((nucleos ?? []).map((n) => [n.id, n.nome])),
    demandaMap: new Map((demandas ?? []).map((d) => [d.id, d.nome])),
  };
}

/**
 * GET /api/atendimentos/pendentes?status=pendente_revisao[,em_atendimento]&nucleo_id=&encaminhados=1
 *
 * `encaminhados=1` restringe aos pendentes que vieram da recepção (têm
 * `senha_id`) — é a fila do núcleo. Funcionário de nível "nucleo" sempre vê
 * só o próprio núcleo e só encaminhamentos.
 */
export async function listarPendentes(req: Request, res: Response) {
  const statusPedidos = (typeof req.query.status === "string" ? req.query.status : "pendente_revisao")
    .split(",")
    .map((s) => statusSchema.safeParse(s.trim()))
    .flatMap((p) => (p.success ? [p.data] : []));
  const statusFiltro = statusPedidos.length > 0 ? statusPedidos : ["pendente_revisao"];

  const nucleoDoUsuario = nucleoDoFuncionario(req);
  const nucleoFiltro = nucleoDoUsuario ?? (z.string().uuid().safeParse(req.query.nucleo_id).data ?? null);

  let consulta = supabaseAdmin
    .from("atendimentos_pendentes")
    .select("*")
    .in("status", statusFiltro)
    .order("created_at", { ascending: true });
  if (nucleoFiltro) consulta = consulta.eq("nucleo_id", nucleoFiltro);
  const unidadeDoUsuario = unidadeDoFuncionarioNucleo(req);
  if (unidadeDoUsuario) consulta = consulta.eq("unidade_id", unidadeDoUsuario);
  if (nucleoDoUsuario || req.query.encaminhados === "1") consulta = consulta.not("senha_id", "is", null);

  const { data: pendentes, error } = await consulta;

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível listar os atendimentos pendentes." });
  }

  const nucleoIds = [...new Set((pendentes ?? []).map((p) => p.nucleo_id))];
  const demandaIds = [
    ...new Set(
      (pendentes ?? []).flatMap((p) => [p.demanda_principal_id, ...(p.outras_demandas ?? [])].filter(Boolean))
    ),
  ];
  const { nucleoMap, demandaMap } = await buscarMapasNomes(nucleoIds, demandaIds);

  const resultado = (pendentes ?? []).map((p) => ({
    ...p,
    nucleo_nome: nucleoMap.get(p.nucleo_id) ?? null,
    demanda_principal_nome: p.demanda_principal_id ? demandaMap.get(p.demanda_principal_id) ?? null : null,
    outras_demandas_nomes: (p.outras_demandas ?? [])
      .map((demandaId: string) => demandaMap.get(demandaId))
      .filter((nome: string | undefined): nome is string => Boolean(nome)),
    erros: calcularErros(p),
  }));

  res.json(resultado);
}

const criarPendenteManualSchema = z.object({
  nucleo_id: z.string().uuid("Selecione um núcleo."),
  cpf_texto: z.string().trim().optional().or(z.literal("")),
  demanda_principal_id: z.string().uuid().optional().nullable(),
  outras_demandas: z.array(z.string().uuid()).optional().default([]),
  resolvida: z.boolean().optional().default(false),
  houve_encaminhamento: z.boolean().optional().default(false),
  data_atendimento: z.string().trim().optional().or(z.literal("")),
});

/** Busca um cidadão pelo CPF (dígitos), devolvendo { id, nome } ou null. */
async function buscarCidadaoPorCpf(cpfTexto: string) {
  const cpfDigitos = somenteDigitos(cpfTexto);
  if (!cpfDigitos) return null;
  const { data } = await supabaseAdmin.from("cidadaos").select("id, nome").eq("cpf", cpfDigitos).maybeSingle();
  return data ?? null;
}

/** POST /api/atendimentos/pendentes (cadastro manual) */
export async function criarPendenteManual(req: Request, res: Response) {
  const parse = criarPendenteManualSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }

  const { nucleo_id, demanda_principal_id, outras_demandas, resolvida, houve_encaminhamento } = parse.data;
  const cpfTexto = parse.data.cpf_texto?.trim() || null;

  let cidadaoId: string | null = null;
  let nome: string | null = null;
  // Só sinaliza a validação do dígito verificador — não bloqueia o
  // cadastro, já que o CPF pode ter sido escrito errado no papel e isso
  // será conferido/corrigido na revisão.
  let validacoes: Record<string, unknown> | null = null;

  if (cpfTexto) {
    const cidadao = await buscarCidadaoPorCpf(cpfTexto);
    if (cidadao) {
      cidadaoId = cidadao.id;
      nome = cidadao.nome;
    }
    validacoes = { cpfValido: cpfValido(cpfTexto) };
  }

  const { data, error } = await supabaseAdmin
    .from("atendimentos_pendentes")
    .insert({
      origem: "manual",
      nucleo_id,
      cpf_texto: cpfTexto,
      cidadao_id: cidadaoId,
      nome,
      demanda_principal_id: demanda_principal_id ?? null,
      outras_demandas,
      resolvida,
      houve_encaminhamento,
      validacoes,
      data_atendimento: parse.data.data_atendimento?.trim() || hoje(),
      status: "pendente_revisao",
      criado_por: req.funcionario?.id ?? null,
    })
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível cadastrar o atendimento pendente." });
  }

  res.status(201).json({ ...data, erros: calcularErros(data) });
}

const atualizarPendenteSchema = z.object({
  nome: z.string().trim().optional().nullable(),
  cpf_texto: z.string().trim().optional().nullable(),
  demanda_principal_id: z.string().uuid().optional().nullable(),
  outras_demandas: z.array(z.string().uuid()).optional(),
  resolvida: z.boolean().optional().nullable(),
  houve_encaminhamento: z.boolean().optional().nullable(),
  data_atendimento: z.string().trim().optional().nullable(),
  erro_ignorado: z.boolean().optional(),
});

/** PUT /api/atendimentos/pendentes/:id */
export async function atualizarPendente(req: Request, res: Response) {
  const { id } = req.params;
  const parse = atualizarPendenteSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }

  const atualizacoes: Record<string, unknown> = { ...parse.data };

  // Sempre que o CPF é alterado, tenta buscar o cidadão de novo e só
  // sobrescreve nome/cidadao_id quando encontra alguém — senão mantém o
  // nome que o funcionário já tiver digitado na revisão.
  if ("cpf_texto" in atualizacoes) {
    const cpfTexto = (atualizacoes.cpf_texto as string | null)?.trim() || null;
    atualizacoes.cpf_texto = cpfTexto;

    if (cpfTexto) {
      const cidadao = await buscarCidadaoPorCpf(cpfTexto);
      if (cidadao) {
        atualizacoes.cidadao_id = cidadao.id;
        atualizacoes.nome = cidadao.nome;
      } else {
        atualizacoes.cidadao_id = null;
      }

      // Recalcula o dígito verificador e mescla dentro de validacoes,
      // preservando outras chaves que já existam nesse jsonb. Não bloqueia
      // a atualização se o CPF for inválido — só sinaliza para a revisão.
      const { data: atual } = await supabaseAdmin
        .from("atendimentos_pendentes")
        .select("validacoes")
        .eq("id", id)
        .maybeSingle();
      const validacoesAtuais = (atual?.validacoes as Record<string, unknown> | null) ?? {};
      atualizacoes.validacoes = { ...validacoesAtuais, cpfValido: cpfValido(cpfTexto) };
    } else {
      atualizacoes.cidadao_id = null;
    }
  }

  const { data, error } = await supabaseAdmin
    .from("atendimentos_pendentes")
    .update(atualizacoes)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível atualizar o atendimento pendente." });
  }

  res.json({ ...data, erros: calcularErros(data) });
}

type ResultadoConfirmacao =
  | { ok: true; atendimento: unknown }
  | { ok: false; status: number; mensagem: string; erros: string[] };

/** Confirma um pendente: cria o atendimento definitivo e marca o pendente como confirmado. */
async function confirmarPendentePorId(
  id: string,
  funcionarioId: string | null,
  descricao: string | null = null
): Promise<ResultadoConfirmacao> {
  const { data: pendente, error: erroPendente } = await supabaseAdmin
    .from("atendimentos_pendentes")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (erroPendente) {
    console.error(erroPendente);
    return { ok: false, status: 500, mensagem: "Não foi possível consultar o atendimento pendente.", erros: [] };
  }
  if (!pendente) {
    return { ok: false, status: 404, mensagem: "Atendimento pendente não encontrado.", erros: [] };
  }

  const erros = calcularErros(pendente);
  if (erros.length > 0 && !pendente.erro_ignorado) {
    return {
      ok: false,
      status: 400,
      mensagem: `Não é possível confirmar: ${descreverErros(erros)}. Corrija os campos ou marque para ignorar o alerta.`,
      erros,
    };
  }

  const { data: atendimento, error: erroAtendimento } = await supabaseAdmin
    .from("atendimentos")
    .insert({
      cidadao_id: pendente.cidadao_id,
      nucleo_id: pendente.nucleo_id,
      demanda_principal_id: pendente.demanda_principal_id,
      outras_demandas: pendente.outras_demandas ?? [],
      resolvida: pendente.resolvida ?? false,
      houve_encaminhamento: pendente.houve_encaminhamento ?? false,
      origem: pendente.origem,
      atendido_por: funcionarioId,
      pendente_id: pendente.id,
      unidade_id: pendente.unidade_id ?? null,
      descricao,
      data_atendimento: pendente.data_atendimento,
    })
    .select("*")
    .single();

  if (erroAtendimento) {
    console.error(erroAtendimento);
    return { ok: false, status: 500, mensagem: "Não foi possível confirmar o atendimento.", erros: [] };
  }

  const { error: erroUpdate } = await supabaseAdmin
    .from("atendimentos_pendentes")
    .update({ status: "confirmado", revisado_por: funcionarioId, revisado_em: new Date().toISOString() })
    .eq("id", id);

  if (erroUpdate) {
    console.error(erroUpdate);
    return {
      ok: false,
      status: 500,
      mensagem: "Atendimento criado, mas não foi possível atualizar o status do pendente.",
      erros: [],
    };
  }

  return { ok: true, atendimento };
}

/** Descrição livre e opcional de como foi o atendimento. */
const descricaoSchema = z.string().trim().max(5000, "A descrição é longa demais (máximo de 5000 caracteres).");

const confirmarSchema = z.object({ descricao: descricaoSchema.optional().nullable() });

/** POST /api/atendimentos/pendentes/:id/confirmar  { descricao? } */
export async function confirmarPendente(req: Request, res: Response) {
  const { id } = req.params;
  const parse = confirmarSchema.safeParse(req.body ?? {});
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const resultado = await confirmarPendentePorId(id, req.funcionario?.id ?? null, parse.data.descricao || null);

  if (!resultado.ok) {
    return res.status(resultado.status).json({ erro: resultado.mensagem, erros: resultado.erros });
  }

  res.status(201).json(resultado.atendimento);
}

const confirmarLoteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "Selecione ao menos um atendimento."),
});

/** POST /api/atendimentos/pendentes/confirmar-lote */
export async function confirmarLote(req: Request, res: Response) {
  if (req.funcionario?.role === "nucleo") {
    return res.status(403).json({ erro: "Sem permissão para confirmar em lote." });
  }
  const parse = confirmarLoteSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }

  const confirmados: string[] = [];
  const bloqueados: { id: string; erros: string[]; mensagem: string }[] = [];

  for (const id of parse.data.ids) {
    const resultado = await confirmarPendentePorId(id, req.funcionario?.id ?? null);
    if (resultado.ok) {
      confirmados.push(id);
    } else {
      bloqueados.push({ id, erros: resultado.erros, mensagem: resultado.mensagem });
    }
  }

  res.json({ confirmados, bloqueados });
}

/** POST /api/atendimentos/pendentes/:id/rejeitar */
export async function rejeitarPendente(req: Request, res: Response) {
  const { id } = req.params;

  const { data, error } = await supabaseAdmin
    .from("atendimentos_pendentes")
    .update({
      status: "rejeitado",
      revisado_por: req.funcionario?.id ?? null,
      revisado_em: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível rejeitar o atendimento pendente." });
  }

  res.json(data);
}

const encaminharSchema = z.object({
  senha_id: z.string().uuid("Senha inválida."),
  cidadao_id: z.string().uuid("Cidadão inválido."),
  nucleo_id: z.string().uuid("Selecione o núcleo de destino."),
  prioridade: z.boolean().optional().default(false),
});

/**
 * POST /api/atendimentos/encaminhar  { senha_id, cidadao_id, nucleo_id, prioridade }
 *
 * A recepção identificou o cidadão da senha chamada e o encaminha a um
 * núcleo: cria um registro leve em `atendimentos_pendentes` (fila do núcleo)
 * e marca a senha como atendida. Demanda, resolvida etc. só são preenchidos
 * depois, pelo núcleo, ao confirmar o pendente (que aí vira `atendimentos`).
 *
 * O Supabase JS não expõe transação, então a ordem é: cria o pendente,
 * depois marca a senha (só se ainda estiver 'chamada'); se essa 2ª etapa
 * falhar, o pendente recém-criado é removido, evitando um encaminhamento
 * duplicado ou uma senha atendida sem encaminhamento.
 */
export async function encaminharAtendimento(req: Request, res: Response) {
  const parse = encaminharSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const { senha_id, cidadao_id, nucleo_id, prioridade } = parse.data;

  const { data: senha, error: erroSenha } = await supabaseAdmin
    .from("senhas")
    .select("id, status, unidade_id")
    .eq("id", senha_id)
    .maybeSingle();

  if (erroSenha) {
    console.error(erroSenha);
    return res.status(500).json({ erro: "Não foi possível consultar a senha." });
  }
  if (!senha) {
    return res.status(404).json({ erro: "Senha não encontrada." });
  }
  // Recepção só atua na fila da própria unidade (mesma regra de /api/fila).
  if (req.funcionario?.role === "recepcao" && senha.unidade_id !== req.funcionario.unidade_id) {
    return res.status(404).json({ erro: "Senha não encontrada." });
  }
  if (senha.status !== "chamada") {
    return res.status(409).json({ erro: "A senha precisa estar com status 'chamada' para iniciar o atendimento." });
  }

  const { data: nucleo } = await supabaseAdmin
    .from("nucleos")
    .select("id, ativo")
    .eq("id", nucleo_id)
    .maybeSingle();
  if (!nucleo || !nucleo.ativo) {
    return res.status(400).json({ erro: "Núcleo inválido ou inativo." });
  }

  const { data: cidadao, error: erroCidadao } = await supabaseAdmin
    .from("cidadaos")
    .select("id, nome, cpf")
    .eq("id", cidadao_id)
    .maybeSingle();

  if (erroCidadao) {
    console.error(erroCidadao);
    return res.status(500).json({ erro: "Não foi possível consultar o cidadão." });
  }
  if (!cidadao) {
    return res.status(404).json({ erro: "Cidadão não encontrado." });
  }

  // nome/cpf_texto vêm do cidadão para o pendente já passar nas validações de
  // "cidadão identificado" (calcularErros) e aparecer com nome na fila.
  const { data: pendente, error: erroPendente } = await supabaseAdmin
    .from("atendimentos_pendentes")
    .insert({
      origem: "manual",
      cidadao_id,
      nome: cidadao.nome,
      cpf_texto: cidadao.cpf,
      validacoes: cidadao.cpf ? { cpfValido: cpfValido(cidadao.cpf) } : null,
      nucleo_id,
      prioridade,
      senha_id: senha.id,
      unidade_id: senha.unidade_id,
      outras_demandas: [],
      resolvida: false,
      houve_encaminhamento: false,
      data_atendimento: hoje(),
      status: "pendente_revisao",
      criado_por: req.funcionario?.id ?? null,
    })
    .select("*")
    .single();

  if (erroPendente || !pendente) {
    console.error(erroPendente);
    return res.status(500).json({ erro: "Não foi possível criar o encaminhamento." });
  }

  // Só marca como atendida se ainda estiver 'chamada' — protege contra duplo clique.
  const { data: senhaAtualizada, error: erroUpdate } = await supabaseAdmin
    .from("senhas")
    .update({ status: "atendida", atendida_em: new Date().toISOString() })
    .eq("id", senha.id)
    .eq("status", "chamada")
    .select("id")
    .maybeSingle();

  if (erroUpdate || !senhaAtualizada) {
    if (erroUpdate) console.error(erroUpdate);
    const { error: erroDesfazer } = await supabaseAdmin.from("atendimentos_pendentes").delete().eq("id", pendente.id);
    if (erroDesfazer) console.error(erroDesfazer);
    return res.status(erroUpdate ? 500 : 409).json({
      erro: erroUpdate
        ? "Não foi possível marcar a senha como atendida."
        : "A senha já foi atualizada por outra ação. Recarregue a fila.",
    });
  }

  res.status(201).json({ ...pendente, erros: calcularErros(pendente) });
}

/**
 * GET /api/atendimentos/pendentes/proxima-sugestao?nucleo_id=
 *
 * Decide quem o núcleo deve chamar a seguir, sem chamar ainda. Mesma
 * alternância 1:1 da fila de senhas (`proximaSenhaSugerida`), trocando
 * normal/prioritária pelo boolean `prioridade`:
 *   1. Só um dos grupos esperando → sugere o mais antigo dele (ou null).
 *   2. Os dois esperando e o prioritário chegou antes do normal → prioritário.
 *   3. Senão, se já foi chamado ao menos 1 não-prioritário hoje desde o
 *      último prioritário chamado → prioritário; senão o normal.
 * Considera só encaminhamentos da recepção (com `senha_id`) ainda 'pendente_revisao'.
 */
export async function proximaSugestaoPendente(req: Request, res: Response) {
  const nucleoId = nucleoDoFuncionario(req) ?? (z.string().uuid().safeParse(req.query.nucleo_id).data ?? null);
  if (!nucleoId) {
    return res.status(400).json({ erro: "Informe o núcleo." });
  }

  // Funcionário "nucleo" só enxerga a fila da própria unidade; as contagens da
  // alternância abaixo usam o mesmo recorte.
  const unidadeId = unidadeDoFuncionarioNucleo(req);

  const maisAntigo = (prioridade: boolean) => {
    let consulta = supabaseAdmin
      .from("atendimentos_pendentes")
      .select("*")
      .eq("nucleo_id", nucleoId)
      .eq("status", "pendente_revisao")
      .eq("prioridade", prioridade)
      .not("senha_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(1);
    if (unidadeId) consulta = consulta.eq("unidade_id", unidadeId);
    return consulta;
  };

  const [{ data: prioritarioArr, error: e1 }, { data: normalArr, error: e2 }] = await Promise.all([
    maisAntigo(true),
    maisAntigo(false),
  ]);
  if (e1 || e2) {
    console.error(e1 ?? e2);
    return res.status(500).json({ erro: "Não foi possível calcular o próximo atendimento." });
  }

  const prioritario = prioritarioArr?.[0] ?? null;
  const normal = normalArr?.[0] ?? null;

  if (!prioritario) return res.json({ sugestao: normal });
  if (!normal) return res.json({ sugestao: prioritario });

  if (new Date(prioritario.created_at).getTime() < new Date(normal.created_at).getTime()) {
    return res.json({ sugestao: prioritario });
  }

  const inicioDoDia = `${hoje()}T00:00:00.000Z`;

  let consultaUltimoPrioritario = supabaseAdmin
    .from("atendimentos_pendentes")
    .select("chamado_em")
    .eq("nucleo_id", nucleoId)
    .eq("prioridade", true)
    .gte("chamado_em", inicioDoDia)
    .order("chamado_em", { ascending: false })
    .limit(1);
  if (unidadeId) consultaUltimoPrioritario = consultaUltimoPrioritario.eq("unidade_id", unidadeId);
  const { data: ultimoPrioritarioChamado, error: e3 } = await consultaUltimoPrioritario;
  if (e3) {
    console.error(e3);
    return res.status(500).json({ erro: "Não foi possível calcular o próximo atendimento." });
  }

  const desde = ultimoPrioritarioChamado?.[0]?.chamado_em ?? inicioDoDia;

  let consultaNormaisChamadas = supabaseAdmin
    .from("atendimentos_pendentes")
    .select("id", { count: "exact", head: true })
    .eq("nucleo_id", nucleoId)
    .eq("prioridade", false)
    .gt("chamado_em", desde);
  if (unidadeId) consultaNormaisChamadas = consultaNormaisChamadas.eq("unidade_id", unidadeId);
  const { count: normaisChamadasDepois, error: e4 } = await consultaNormaisChamadas;
  if (e4) {
    console.error(e4);
    return res.status(500).json({ erro: "Não foi possível calcular o próximo atendimento." });
  }

  res.json({ sugestao: (normaisChamadasDepois ?? 0) >= 1 ? prioritario : normal });
}

const chamarPendenteSchema = z.object({
  sala: z.string().trim().max(60, "A sala é longa demais (máximo de 60 caracteres).").optional().nullable(),
});

/**
 * POST /api/atendimentos/pendentes/:id/chamar  { sala? }
 *
 * Marca o pendente como 'em_atendimento' pelo funcionário logado. O update só
 * acontece se ele ainda estiver 'pendente_revisao', então dois funcionários
 * do núcleo nunca pegam o mesmo cidadão: quem chegar depois recebe 409.
 */
export async function chamarPendente(req: Request, res: Response) {
  const parse = chamarPendenteSchema.safeParse(req.body ?? {});
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }

  const { data, error } = await supabaseAdmin
    .from("atendimentos_pendentes")
    .update({
      status: "em_atendimento",
      chamado_por: req.funcionario?.id ?? null,
      chamado_em: new Date().toISOString(),
      // Sala/guichê exibido no Painel de Chamados.
      sala: parse.data.sala || null,
    })
    .eq("id", req.params.id)
    .eq("status", "pendente_revisao")
    .select("*")
    .maybeSingle();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível chamar o atendimento." });
  }
  if (!data) {
    return res.status(409).json({ erro: "Este atendimento já foi chamado por outra pessoa ou não está mais na fila." });
  }

  res.json({ ...data, erros: calcularErros(data) });
}

/** POST /api/atendimentos/pendentes/:id/liberar — devolve um pendente 'em_atendimento' para a fila. */
export async function liberarPendente(req: Request, res: Response) {
  const { data, error } = await supabaseAdmin
    .from("atendimentos_pendentes")
    .update({ status: "pendente_revisao", chamado_por: null })
    .eq("id", req.params.id)
    .eq("status", "em_atendimento")
    .select("*")
    .maybeSingle();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível devolver o atendimento à fila." });
  }
  if (!data) {
    return res.status(409).json({ erro: "Este atendimento não está em atendimento." });
  }

  res.json(data);
}

/** GET /api/atendimentos?nucleo_id=&de=&ate= */
export async function listarAtendimentos(req: Request, res: Response) {
  let query = supabaseAdmin.from("atendimentos").select("*").order("created_at", { ascending: false });

  const nucleoDoUsuario = nucleoDoFuncionario(req);
  if (nucleoDoUsuario) {
    query = query.eq("nucleo_id", nucleoDoUsuario);
  } else if (typeof req.query.nucleo_id === "string" && req.query.nucleo_id) {
    query = query.eq("nucleo_id", req.query.nucleo_id);
  }
  // Histórico do funcionário "nucleo": só o próprio núcleo E a própria unidade.
  // Admin/atendente veem tudo (e podem filtrar por ?unidade_id=).
  const unidadeDoUsuario = unidadeDoFuncionarioNucleo(req);
  if (unidadeDoUsuario) {
    query = query.eq("unidade_id", unidadeDoUsuario);
  } else if (typeof req.query.unidade_id === "string" && req.query.unidade_id) {
    query = query.eq("unidade_id", req.query.unidade_id);
  }
  if (typeof req.query.de === "string" && req.query.de) {
    query = query.gte("created_at", req.query.de);
  }
  if (typeof req.query.ate === "string" && req.query.ate) {
    query = query.lte("created_at", req.query.ate);
  }

  const { data: atendimentos, error } = await query;

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível listar os atendimentos." });
  }

  const lista = atendimentos ?? [];
  const cidadaoIds = [...new Set(lista.map((a) => a.cidadao_id).filter(Boolean))];
  const nucleoIds = [...new Set(lista.map((a) => a.nucleo_id).filter(Boolean))];
  const demandaIds = [
    ...new Set(lista.flatMap((a) => [a.demanda_principal_id, ...(a.outras_demandas ?? [])]).filter(Boolean)),
  ];
  const unidadeIds = [...new Set(lista.map((a) => a.unidade_id).filter(Boolean))];
  const pendenteIds = [...new Set(lista.map((a) => a.pendente_id).filter(Boolean))];

  const [{ data: cidadaos }, { nucleoMap, demandaMap }, { data: unidades }, { data: pendentes }] = await Promise.all([
    cidadaoIds.length
      ? supabaseAdmin.from("cidadaos").select("id, nome").in("id", cidadaoIds)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    buscarMapasNomes(nucleoIds, demandaIds),
    unidadeIds.length
      ? supabaseAdmin.from("unidades").select("id, nome").in("id", unidadeIds)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    // Dados que vieram da recepção (prioridade, senha, quem encaminhou) ficam no pendente de origem.
    pendenteIds.length
      ? supabaseAdmin.from("atendimentos_pendentes").select("id, prioridade, senha_id, criado_por").in("id", pendenteIds)
      : Promise.resolve({
          data: [] as { id: string; prioridade: boolean; senha_id: string | null; criado_por: string | null }[],
        }),
  ]);

  const cidadaoMap = new Map((cidadaos ?? []).map((c) => [c.id, c.nome]));
  const unidadeMap = new Map((unidades ?? []).map((u) => [u.id, u.nome]));
  const pendenteMap = new Map((pendentes ?? []).map((p) => [p.id, p]));

  const resultado = lista.map((a) => {
    const origem = a.pendente_id ? pendenteMap.get(a.pendente_id) : undefined;
    return {
      ...a,
      cidadao_nome: a.cidadao_id ? cidadaoMap.get(a.cidadao_id) ?? null : null,
      nucleo_nome: a.nucleo_id ? nucleoMap.get(a.nucleo_id) ?? null : null,
      unidade_nome: a.unidade_id ? unidadeMap.get(a.unidade_id) ?? null : null,
      demanda_principal_nome: a.demanda_principal_id ? demandaMap.get(a.demanda_principal_id) ?? null : null,
      outras_demandas_nomes: (a.outras_demandas ?? [])
        .map((demandaId: string) => demandaMap.get(demandaId))
        .filter((nome: string | undefined): nome is string => Boolean(nome)),
      prioridade: origem?.prioridade ?? false,
      senha_id: origem?.senha_id ?? null,
      encaminhado_por: origem?.criado_por ?? null,
    };
  });

  res.json(resultado);
}

const resolverNaRecepcaoSchema = z.object({
  senha_id: z.string().uuid("Senha inválida."),
  cidadao_id: z.string().uuid("Cidadão inválido."),
  descricao: z.string().trim().min(1, "Descreva a informação da demanda resolvida.").max(1000, "A informação é longa demais (máximo de 1000 caracteres)."),
});

/**
 * POST /api/atendimentos/resolvido-recepcao  { senha_id, cidadao_id, descricao }
 *
 * A demanda foi resolvida na própria recepção: não há encaminhamento nem
 * núcleo. Só registra o atendimento (`atendimentos_recepcao`) e marca a senha
 * como atendida; se essa 2ª etapa falhar, o registro é desfeito.
 */
export async function resolverNaRecepcao(req: Request, res: Response) {
  const parse = resolverNaRecepcaoSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const { senha_id, cidadao_id, descricao } = parse.data;

  const { data: senha, error: erroSenha } = await supabaseAdmin
    .from("senhas")
    .select("id, status, unidade_id")
    .eq("id", senha_id)
    .maybeSingle();

  if (erroSenha) {
    console.error(erroSenha);
    return res.status(500).json({ erro: "Não foi possível consultar a senha." });
  }
  // Recepção só atua na fila da própria unidade (mesma regra de /api/fila).
  if (!senha || (req.funcionario?.role === "recepcao" && senha.unidade_id !== req.funcionario.unidade_id)) {
    return res.status(404).json({ erro: "Senha não encontrada." });
  }
  if (senha.status !== "chamada") {
    return res.status(409).json({ erro: "A senha precisa estar com status 'chamada' para registrar o atendimento." });
  }

  const { data: cidadao } = await supabaseAdmin.from("cidadaos").select("id").eq("id", cidadao_id).maybeSingle();
  if (!cidadao) {
    return res.status(404).json({ erro: "Cidadão não encontrado." });
  }

  const { data: registro, error: erroRegistro } = await supabaseAdmin
    .from("atendimentos_recepcao")
    .insert({
      cidadao_id,
      senha_id: senha.id,
      unidade_id: senha.unidade_id,
      descricao,
      criado_por: req.funcionario?.id ?? null,
    })
    .select("*")
    .single();

  if (erroRegistro || !registro) {
    console.error(erroRegistro);
    return res.status(500).json({ erro: "Não foi possível registrar o atendimento." });
  }

  // Só marca como atendida se ainda estiver 'chamada' — protege contra duplo clique.
  const { data: senhaAtualizada, error: erroUpdate } = await supabaseAdmin
    .from("senhas")
    .update({ status: "atendida", atendida_em: new Date().toISOString() })
    .eq("id", senha.id)
    .eq("status", "chamada")
    .select("id")
    .maybeSingle();

  if (erroUpdate || !senhaAtualizada) {
    if (erroUpdate) console.error(erroUpdate);
    const { error: erroDesfazer } = await supabaseAdmin.from("atendimentos_recepcao").delete().eq("id", registro.id);
    if (erroDesfazer) console.error(erroDesfazer);
    return res.status(erroUpdate ? 500 : 409).json({
      erro: erroUpdate
        ? "Não foi possível marcar a senha como atendida."
        : "A senha já foi atualizada por outra ação. Recarregue a fila.",
    });
  }

  res.status(201).json(registro);
}

/** GET /api/atendimentos/resolvidos-recepcao — a recepção vê só a própria unidade; acesso amplo vê tudo. */
export async function listarResolvidosRecepcao(req: Request, res: Response) {
  let query = supabaseAdmin
    .from("atendimentos_recepcao")
    .select("*")
    .order("created_at", { ascending: false });
  if (req.funcionario?.role === "recepcao") {
    query = query.eq("unidade_id", req.funcionario.unidade_id ?? UNIDADE_INEXISTENTE);
  }

  const { data, error } = await query;
  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível listar os atendimentos da recepção." });
  }

  const lista = data ?? [];
  const cidadaoIds = [...new Set(lista.map((r) => r.cidadao_id).filter(Boolean))];
  const unidadeIds = [...new Set(lista.map((r) => r.unidade_id).filter(Boolean))];
  const [{ data: cidadaos }, { data: unidades }] = await Promise.all([
    cidadaoIds.length
      ? supabaseAdmin.from("cidadaos").select("id, nome").in("id", cidadaoIds)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    unidadeIds.length
      ? supabaseAdmin.from("unidades").select("id, nome").in("id", unidadeIds)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
  ]);
  const cidadaoMap = new Map((cidadaos ?? []).map((c) => [c.id, c.nome]));
  const unidadeMap = new Map((unidades ?? []).map((u) => [u.id, u.nome]));

  res.json(
    lista.map((r) => ({
      ...r,
      cidadao_nome: r.cidadao_id ? cidadaoMap.get(r.cidadao_id) ?? null : null,
      unidade_nome: r.unidade_id ? unidadeMap.get(r.unidade_id) ?? null : null,
    }))
  );
}

const atualizarAtendimentoSchema = z
  .object({
    demanda_principal_id: z.string().uuid().nullable().optional(),
    outras_demandas: z.array(z.string().uuid()).optional(),
    resolvida: z.boolean().optional(),
    houve_encaminhamento: z.boolean().optional(),
    descricao: descricaoSchema.nullable().optional(),
  })
  // strict: qualquer outro campo (cidadao_id, nucleo_id, unidade_id...) é rejeitado, não ignorado em silêncio.
  .strict("Só é possível editar demanda principal, outras demandas, resolvida, houve encaminhamento e descrição.");

/** PATCH /api/atendimentos/:id — edição posterior, só dos campos preenchidos pelo núcleo. */
export async function atualizarAtendimento(req: Request, res: Response) {
  const parse = atualizarAtendimentoSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }

  const { data: atendimento, error: erroBusca } = await supabaseAdmin
    .from("atendimentos")
    .select("id, nucleo_id, unidade_id, demanda_principal_id, outras_demandas")
    .eq("id", req.params.id)
    .maybeSingle();

  if (erroBusca) {
    console.error(erroBusca);
    return res.status(500).json({ erro: "Não foi possível consultar o atendimento." });
  }
  if (!atendimento) {
    return res.status(404).json({ erro: "Atendimento não encontrado." });
  }

  if (
    req.funcionario?.role === "nucleo" &&
    (atendimento.nucleo_id !== req.funcionario.nucleo_id || atendimento.unidade_id !== unidadeDoFuncionarioNucleo(req))
  ) {
    return res.status(403).json({ erro: "Você não tem permissão para editar este atendimento." });
  }

  const atualizacoes = { ...parse.data };
  // Descrição vazia = sem descrição (guarda null, não string vazia).
  if (typeof atualizacoes.descricao === "string" && !atualizacoes.descricao) {
    atualizacoes.descricao = null;
  }
  if (Object.keys(atualizacoes).length === 0) {
    return res.status(400).json({ erro: "Nenhum campo para atualizar." });
  }

  // As demandas escolhidas precisam pertencer ao núcleo do atendimento.
  const demandasEnviadas = [
    ...(atualizacoes.demanda_principal_id ? [atualizacoes.demanda_principal_id] : []),
    ...(atualizacoes.outras_demandas ?? []),
  ];
  if (demandasEnviadas.length > 0) {
    const idsUnicos = [...new Set(demandasEnviadas)];
    const { data: validas, error: erroDemandas } = await supabaseAdmin
      .from("demandas")
      .select("id")
      .eq("nucleo_id", atendimento.nucleo_id)
      .in("id", idsUnicos);
    if (erroDemandas) {
      console.error(erroDemandas);
      return res.status(500).json({ erro: "Não foi possível validar as demandas." });
    }
    if ((validas ?? []).length !== idsUnicos.length) {
      return res.status(400).json({ erro: "Há demandas que não pertencem ao núcleo deste atendimento." });
    }
  }

  const { data, error } = await supabaseAdmin
    .from("atendimentos")
    .update(atualizacoes)
    .eq("id", atendimento.id)
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível atualizar o atendimento." });
  }

  res.json(data);
}
