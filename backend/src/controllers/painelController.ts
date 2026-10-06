import type { Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase.js";
import { unidadeDaInfraestrutura } from "../middleware/auth.js";

const LIMITE_HISTORICO = 8;

type OrigemChamada = "senha" | "nucleo";

interface Chamada {
  id: string;
  origem: OrigemChamada;
  /** Código da senha (origem 'senha') ou nome do cidadão (origem 'nucleo'). */
  titulo: string;
  /** Nome do núcleo — só quando origem = 'nucleo'. */
  nucleo: string | null;
  /** Guichê (senha) ou sala (núcleo). */
  local: string | null;
  chamada_em: string;
  /** Senha chamada novamente (2ª tentativa em diante). */
  rechamada: boolean;
}

/** Data de hoje no formato YYYY-MM-DD (mesmo critério usado na fila de senhas). */
function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Código exibido da senha: "N012" (normal) ou "P003" (prioritária). */
function codigoSenha(tipo: string, numero: number): string {
  return `${tipo === "normal" ? "N" : "P"}${String(numero).padStart(3, "0")}`;
}

/**
 * GET /api/painel?unidade_id=
 *
 * Resultado unificado para o Painel de Chamados: mistura as senhas chamadas
 * pela recepção com os cidadãos chamados pelos núcleos, por ordem de chamada.
 *   - chamada_atual: a mais recente entre a senha ainda 'chamada' e o pendente
 *     ainda 'em_atendimento' (ou null se nenhuma estiver em andamento);
 *   - historico: as últimas chamadas de hoje das duas origens, da mais
 *     recente para a mais antiga, sem repetir a chamada atual.
 */
export async function obterPainel(req: Request, res: Response) {
  const parse = z.string().uuid("Unidade inválida.").safeParse(req.query.unidade_id);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Informe a unidade." });
  }
  const unidadeId = parse.data;
  // Infraestrutura só consulta o painel da própria unidade.
  const unidadeInfra = unidadeDaInfraestrutura(req);
  if (unidadeInfra && unidadeInfra !== unidadeId) {
    return res.status(403).json({ erro: "Você só pode acessar o painel da sua unidade." });
  }
  const dataHoje = hoje();
  const inicioDoDia = `${dataHoje}T00:00:00.000Z`;

  const [{ data: senhas, error: erroSenhas }, { data: pendentes, error: erroPendentes }] = await Promise.all([
    supabaseAdmin
      .from("senhas")
      .select("id, tipo, numero, status, guiche, tentativas, chamada_em")
      .eq("data", dataHoje)
      .eq("unidade_id", unidadeId)
      .in("status", ["chamada", "atendida", "perdida"])
      .not("chamada_em", "is", null)
      .order("chamada_em", { ascending: false })
      .limit(LIMITE_HISTORICO + 1),
    supabaseAdmin
      .from("atendimentos_pendentes")
      .select("id, nome, cidadao_id, nucleo_id, sala, status, chamado_em")
      .eq("unidade_id", unidadeId)
      .in("status", ["em_atendimento", "confirmado"])
      .gte("chamado_em", inicioDoDia)
      .order("chamado_em", { ascending: false })
      .limit(LIMITE_HISTORICO + 1),
  ]);

  if (erroSenhas || erroPendentes) {
    console.error(erroSenhas ?? erroPendentes);
    return res.status(500).json({ erro: "Não foi possível carregar o painel." });
  }

  const cidadaoIds = [...new Set((pendentes ?? []).map((p) => p.cidadao_id).filter(Boolean))];
  const nucleoIds = [...new Set((pendentes ?? []).map((p) => p.nucleo_id).filter(Boolean))];

  const [{ data: cidadaos }, { data: nucleos }] = await Promise.all([
    cidadaoIds.length
      ? supabaseAdmin.from("cidadaos").select("id, nome").in("id", cidadaoIds)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    nucleoIds.length
      ? supabaseAdmin.from("nucleos").select("id, nome").in("id", nucleoIds)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
  ]);
  const cidadaoMap = new Map((cidadaos ?? []).map((c) => [c.id, c.nome]));
  const nucleoMap = new Map((nucleos ?? []).map((n) => [n.id, n.nome]));

  // Em andamento = ainda não finalizada (senha 'chamada' / pendente 'em_atendimento').
  const todas: { chamada: Chamada; emAndamento: boolean }[] = [
    ...(senhas ?? []).map((s) => ({
      emAndamento: s.status === "chamada",
      chamada: {
        id: `senha:${s.id}`,
        origem: "senha" as const,
        titulo: codigoSenha(s.tipo, s.numero),
        nucleo: null,
        local: s.guiche ?? null,
        chamada_em: s.chamada_em as string,
        rechamada: (s.tentativas ?? 0) >= 2,
      },
    })),
    ...(pendentes ?? []).map((p) => ({
      emAndamento: p.status === "em_atendimento",
      chamada: {
        id: `nucleo:${p.id}`,
        origem: "nucleo" as const,
        titulo: (p.cidadao_id ? cidadaoMap.get(p.cidadao_id) : null) ?? p.nome ?? "Cidadão",
        nucleo: p.nucleo_id ? nucleoMap.get(p.nucleo_id) ?? null : null,
        local: p.sala ?? null,
        chamada_em: p.chamado_em as string,
        rechamada: false,
      },
    })),
  ].sort((a, b) => new Date(b.chamada.chamada_em).getTime() - new Date(a.chamada.chamada_em).getTime());

  const atual = todas.find((c) => c.emAndamento)?.chamada ?? null;
  const historico = todas
    .map((c) => c.chamada)
    .filter((c) => c.id !== atual?.id)
    .slice(0, LIMITE_HISTORICO);

  res.json({ chamada_atual: atual, historico });
}
