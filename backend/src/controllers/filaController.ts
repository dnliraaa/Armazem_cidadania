import type { Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase.js";
import { unidadeDaInfraestrutura } from "../middleware/auth.js";

/** Data de hoje no formato YYYY-MM-DD (mesmo formato aceito pela coluna `date` do Postgres). */
function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Um funcionário de nível "recepcao" só enxerga/atende a fila da própria
 * unidade. Admin (e qualquer outro nível futuro) continua vendo tudo.
 */
function unidadeDoFuncionario(req: Request): string | null {
  return req.funcionario?.role === "recepcao" ? req.funcionario.unidade_id : null;
}

const uuidSchema = z.string().uuid();

/**
 * GET /api/fila aceita um `?unidade_id=` opcional (usado pelo Painel de
 * Chamados, que escolhe a unidade explicitamente e não depende do nível de
 * quem estiver logado no aparelho). Quando presente, tem prioridade sobre o
 * filtro automático por nível/unidade do funcionário.
 */
function unidadeSolicitada(req: Request): string | null {
  const parse = uuidSchema.safeParse(req.query.unidade_id);
  return parse.success ? parse.data : unidadeDoFuncionario(req);
}

// A cada senha prioritária chamada, o objetivo é ter chamado 1 normal — ver
// `proximaSenhaSugerida` abaixo.
const PROPORCAO_NORMAIS_POR_PRIORITARIA = 1;

const retirarSenhaSchema = z.object({
  tipo: z.enum(["normal", "prioritaria"]),
  totem_id: z.string().uuid("Totem inválido."),
});

/**
 * POST /api/fila/retirar
 *
 * Gera o próximo número da senha de forma atômica via a função SQL
 * `proxima_senha_numero` (precisa existir no banco — ver o SQL fornecido
 * separadamente para rodar no Supabase):
 *
 *   create or replace function proxima_senha_numero(p_tipo text)
 *   returns int
 *   language plpgsql
 *   as $$
 *   declare
 *     v_numero int;
 *   begin
 *     insert into senha_contadores (data, tipo, ultimo_numero)
 *     values (current_date, p_tipo, 1)
 *     on conflict (data, tipo)
 *     do update set ultimo_numero = senha_contadores.ultimo_numero + 1
 *     returning ultimo_numero into v_numero;
 *
 *     return v_numero;
 *   end;
 *   $$;
 *
 * O UPSERT dentro da função garante que duas retiradas simultâneas nunca
 * recebem o mesmo número, mesmo com vários totens ao mesmo tempo.
 *
 * O totem é sempre vinculado a uma unidade fixa (ver tabela `totens`) — não
 * depende de quem estiver logado no aparelho — e é isso que decide a
 * `unidade_id` gravada na senha.
 */
export async function retirarSenha(req: Request, res: Response) {
  const parse = retirarSenhaSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }

  const { tipo, totem_id } = parse.data;

  const { data: totem, error: erroTotem } = await supabaseAdmin
    .from("totens")
    .select("id, unidade_id, ativo")
    .eq("id", totem_id)
    .maybeSingle();

  if (erroTotem) {
    console.error(erroTotem);
    return res.status(500).json({ erro: "Não foi possível validar o totem." });
  }
  if (!totem || !totem.ativo) {
    return res.status(400).json({ erro: "Totem não configurado ou inativo. Configure o totem novamente." });
  }
  // Infraestrutura só opera totens da própria unidade.
  const unidadeInfra = unidadeDaInfraestrutura(req);
  if (unidadeInfra && totem.unidade_id !== unidadeInfra) {
    return res.status(403).json({ erro: "Este totem não pertence à sua unidade." });
  }

  const { data: numero, error: erroNumero } = await supabaseAdmin.rpc("proxima_senha_numero", { p_tipo: tipo });

  if (erroNumero || typeof numero !== "number") {
    console.error(erroNumero);
    return res.status(500).json({ erro: "Não foi possível gerar a senha." });
  }

  const { data, error } = await supabaseAdmin
    .from("senhas")
    .insert({ data: hoje(), tipo, numero, status: "aguardando", unidade_id: totem.unidade_id })
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível registrar a senha." });
  }

  res.status(201).json(data);
}

/** GET /api/fila?unidade_id= — senhas do dia: aguardando (por tipo) e as últimas chamadas. */
export async function listarFila(req: Request, res: Response) {
  const dataHoje = hoje();
  const unidadeId = unidadeSolicitada(req);

  let consultaAguardando = supabaseAdmin
    .from("senhas")
    .select("*")
    .eq("data", dataHoje)
    .eq("status", "aguardando")
    .order("criada_em", { ascending: true });
  let consultaChamadas = supabaseAdmin
    .from("senhas")
    .select("*")
    .eq("data", dataHoje)
    .eq("status", "chamada")
    .order("chamada_em", { ascending: false })
    .limit(5);

  // Histórico do dia: tudo que já saiu de 'aguardando', da mais recente para a mais antiga.
  let consultaHistorico = supabaseAdmin
    .from("senhas")
    .select("*")
    .eq("data", dataHoje)
    .in("status", ["chamada", "atendida", "perdida"])
    .order("chamada_em", { ascending: false, nullsFirst: false });

  if (unidadeId) {
    consultaAguardando = consultaAguardando.eq("unidade_id", unidadeId);
    consultaChamadas = consultaChamadas.eq("unidade_id", unidadeId);
    consultaHistorico = consultaHistorico.eq("unidade_id", unidadeId);
  }

  const [
    { data: aguardando, error: erroAguardando },
    { data: chamadas, error: erroChamadas },
    { data: historico, error: erroHistorico },
  ] = await Promise.all([consultaAguardando, consultaChamadas, consultaHistorico]);

  if (erroAguardando || erroChamadas || erroHistorico) {
    console.error(erroAguardando ?? erroChamadas ?? erroHistorico);
    return res.status(500).json({ erro: "Não foi possível carregar a fila." });
  }

  const aguardandoNormal = (aguardando ?? []).filter((s) => s.tipo === "normal");
  const aguardandoPrioritaria = (aguardando ?? []).filter((s) => s.tipo === "prioritaria");

  res.json({
    aguardando: {
      normal: aguardandoNormal,
      prioritaria: aguardandoPrioritaria,
      totalNormal: aguardandoNormal.length,
      totalPrioritaria: aguardandoPrioritaria.length,
    },
    chamadas: chamadas ?? [],
    historico: historico ?? [],
  });
}

/**
 * GET /api/fila/proxima-sugestao
 *
 * Decide qual senha chamar a seguir, sem chamá-la ainda. Regra:
 *
 *   0. Se houver alguma senha em `aguardando_recall` já `recall_liberado`
 *      (não compareceu na 1ª tentativa e pelo menos uma outra senha já foi
 *      chamada desde então), sugere ela direto — prioridade máxima, fura a
 *      alternância normal/prioritária. É a 2ª e última tentativa dela.
 *   1. Se só houver um dos tipos esperando, sugere esse (ou null se não
 *      houver ninguém esperando).
 *   2. Se houver as duas esperando, e a prioritária já for mais antiga que a
 *      normal (ou seja, ela já venceria pela ordem pura de chegada), sugere
 *      a prioritária direto — independente de qualquer contagem.
 *   3. Senão, alterna 1 para 1: conta quantas normais já foram chamadas hoje
 *      desde a última prioritária chamada (ou desde o início do dia, se
 *      nenhuma prioritária foi chamada ainda hoje). Se já foi chamada ao
 *      menos 1 normal nesse intervalo, sugere a prioritária; senão, a normal.
 */
export async function proximaSenhaSugerida(req: Request, res: Response) {
  const dataHoje = hoje();
  const unidadeId = unidadeDoFuncionario(req);

  // Uma senha aguardando rechamada mas ainda não liberada (ver bloco de
  // recall abaixo) não pode ser escolhida pela alternância normal — só pode
  // voltar a aparecer via a sugestão de recall, depois de liberada. Sem esse
  // filtro, ela reapareceria aqui por ser a mais antiga da fila do seu tipo.
  const NAO_TRAVADA_EM_RECALL = "aguardando_recall.eq.false,recall_liberado.eq.true";

  let consultaPrioritaria = supabaseAdmin
    .from("senhas")
    .select("*")
    .eq("data", dataHoje)
    .eq("status", "aguardando")
    .eq("tipo", "prioritaria")
    .or(NAO_TRAVADA_EM_RECALL)
    .order("criada_em", { ascending: true })
    .limit(1);
  let consultaNormal = supabaseAdmin
    .from("senhas")
    .select("*")
    .eq("data", dataHoje)
    .eq("status", "aguardando")
    .eq("tipo", "normal")
    .or(NAO_TRAVADA_EM_RECALL)
    .order("criada_em", { ascending: true })
    .limit(1);

  if (unidadeId) {
    consultaPrioritaria = consultaPrioritaria.eq("unidade_id", unidadeId);
    consultaNormal = consultaNormal.eq("unidade_id", unidadeId);
  }

  const [{ data: prioritariaArr, error: e1 }, { data: normalArr, error: e2 }] = await Promise.all([
    consultaPrioritaria,
    consultaNormal,
  ]);

  if (e1 || e2) {
    console.error(e1 ?? e2);
    return res.status(500).json({ erro: "Não foi possível calcular a próxima senha." });
  }

  // Prioridade máxima: uma senha que não compareceu na 1ª tentativa e já
  // passou por pelo menos uma outra chamada no meio (2ª e última chance),
  // furando a fila da alternância normal/prioritária.
  let consultaRecall = supabaseAdmin
    .from("senhas")
    .select("*")
    .eq("data", dataHoje)
    .eq("status", "aguardando")
    .eq("aguardando_recall", true)
    .eq("recall_liberado", true)
    .order("criada_em", { ascending: true })
    .limit(1);
  if (unidadeId) {
    consultaRecall = consultaRecall.eq("unidade_id", unidadeId);
  }

  const { data: recallArr, error: eRecall } = await consultaRecall;
  if (eRecall) {
    console.error(eRecall);
    return res.status(500).json({ erro: "Não foi possível calcular a próxima senha." });
  }
  if (recallArr && recallArr.length > 0) {
    return res.json({ sugestao: recallArr[0] });
  }

  const prioridadeEspera = prioritariaArr?.[0] ?? null;
  const normalEspera = normalArr?.[0] ?? null;

  // Proteção contra travamento: se só sobraram senhas presas em recall (ainda
  // não liberadas) e não há nenhuma outra para servir de "chamada no meio",
  // essa liberação nunca aconteceria sozinha — sugere a mais antiga mesmo assim.
  if (!prioridadeEspera && !normalEspera) {
    let consultaPresas = supabaseAdmin
      .from("senhas")
      .select("*")
      .eq("data", dataHoje)
      .eq("status", "aguardando")
      .eq("aguardando_recall", true)
      .order("criada_em", { ascending: true })
      .limit(1);
    if (unidadeId) {
      consultaPresas = consultaPresas.eq("unidade_id", unidadeId);
    }
    const { data: presasArr, error: ePresas } = await consultaPresas;
    if (ePresas) {
      console.error(ePresas);
      return res.status(500).json({ erro: "Não foi possível calcular a próxima senha." });
    }
    return res.json({ sugestao: presasArr?.[0] ?? null });
  }

  if (!prioridadeEspera) {
    return res.json({ sugestao: normalEspera });
  }
  if (!normalEspera) {
    return res.json({ sugestao: prioridadeEspera });
  }

  // A prioritária já venceria por pura ordem de chegada — chama ela direto,
  // mesmo que a alternância "deveria" ser de uma normal agora.
  if (new Date(prioridadeEspera.criada_em).getTime() < new Date(normalEspera.criada_em).getTime()) {
    return res.json({ sugestao: prioridadeEspera });
  }

  // Há as duas esperando: conta quantas normais já foram chamadas hoje
  // desde a última prioritária chamada (ou desde o início do dia, se nenhuma
  // prioritária foi chamada ainda hoje).
  let consultaUltimaPrioritaria = supabaseAdmin
    .from("senhas")
    .select("chamada_em")
    .eq("data", dataHoje)
    .eq("tipo", "prioritaria")
    .not("chamada_em", "is", null)
    .order("chamada_em", { ascending: false })
    .limit(1);
  if (unidadeId) {
    consultaUltimaPrioritaria = consultaUltimaPrioritaria.eq("unidade_id", unidadeId);
  }

  const { data: ultimaPrioritariaChamada, error: e3 } = await consultaUltimaPrioritaria;

  if (e3) {
    console.error(e3);
    return res.status(500).json({ erro: "Não foi possível calcular a próxima senha." });
  }

  const desde = ultimaPrioritariaChamada?.[0]?.chamada_em ?? null;

  let consultaNormaisChamadas = supabaseAdmin
    .from("senhas")
    .select("id", { count: "exact", head: true })
    .eq("data", dataHoje)
    .eq("tipo", "normal")
    .not("chamada_em", "is", null);

  if (unidadeId) {
    consultaNormaisChamadas = consultaNormaisChamadas.eq("unidade_id", unidadeId);
  }
  if (desde) {
    consultaNormaisChamadas = consultaNormaisChamadas.gt("chamada_em", desde);
  }

  const { count: normaisChamadasDepois, error: e4 } = await consultaNormaisChamadas;

  if (e4) {
    console.error(e4);
    return res.status(500).json({ erro: "Não foi possível calcular a próxima senha." });
  }

  const sugestao =
    (normaisChamadasDepois ?? 0) >= PROPORCAO_NORMAIS_POR_PRIORITARIA ? prioridadeEspera : normalEspera;

  res.json({ sugestao });
}

const chamarSenhaSchema = z.object({
  guiche: z.string().trim().optional(),
});

/**
 * POST /api/fila/:id/chamar — chama (ou rechama) uma senha.
 *
 * Além de marcar a senha como chamada, tem dois efeitos colaterais ligados
 * ao fluxo de "2ª chance" (ver `marcarPerdida`):
 *   - Se a própria senha estava em `aguardando_recall` (ou seja, esta é a
 *     2ª tentativa dela), zera `aguardando_recall`/`recall_liberado`.
 *   - Libera (`recall_liberado = true`) qualquer OUTRA senha da mesma
 *     unidade que estava esperando rechamada — passou pelo menos uma
 *     chamada no meio, então já pode ser sugerida de novo.
 */
export async function chamarSenha(req: Request, res: Response) {
  const { id } = req.params;
  const parse = chamarSenhaSchema.safeParse(req.body ?? {});
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }

  const unidadeId = unidadeDoFuncionario(req);
  let consultaAtual = supabaseAdmin.from("senhas").select("*").eq("id", id);
  if (unidadeId) {
    consultaAtual = consultaAtual.eq("unidade_id", unidadeId);
  }
  const { data: atual, error: erroAtual } = await consultaAtual.maybeSingle();

  if (erroAtual) {
    console.error(erroAtual);
    return res.status(500).json({ erro: "Não foi possível chamar a senha." });
  }
  if (!atual) {
    return res.status(404).json({ erro: "Senha não encontrada." });
  }

  const atualizacoes: Record<string, unknown> = {
    status: "chamada",
    chamada_em: new Date().toISOString(),
    chamada_por: req.funcionario?.id ?? null,
    tentativas: (atual.tentativas ?? 0) + 1,
    aguardando_recall: false,
    recall_liberado: false,
  };
  if (parse.data.guiche !== undefined) {
    atualizacoes.guiche = parse.data.guiche || null;
  }

  const { data, error } = await supabaseAdmin
    .from("senhas")
    .update(atualizacoes)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível chamar a senha." });
  }
  if (!data) {
    return res.status(404).json({ erro: "Senha não encontrada." });
  }

  let liberaRecall = supabaseAdmin
    .from("senhas")
    .update({ recall_liberado: true })
    .eq("data", data.data)
    .eq("status", "aguardando")
    .eq("aguardando_recall", true)
    .eq("recall_liberado", false)
    .neq("id", id);
  liberaRecall = data.unidade_id ? liberaRecall.eq("unidade_id", data.unidade_id) : liberaRecall.is("unidade_id", null);

  const { error: erroLibera } = await liberaRecall;
  if (erroLibera) {
    // Não falha a chamada em si por causa disso — só loga. Na pior das
    // hipóteses, a rechamada de outra senha fica liberada um pouco depois.
    console.error(erroLibera);
  }

  res.json(data);
}

/**
 * POST /api/fila/:id/rechamar-manual — última chance manual para uma senha descartada.
 *
 * Só vale para senha 'perdida' com exatamente 2 tentativas (já esgotou o
 * ciclo automático e ainda não usou a rechamada manual) e enquanto não houver
 * outra senha 'chamada' em aberto na unidade. A 3ª tentativa sai do ciclo de
 * recall: se não comparecer de novo, `marcarPerdida` a descarta de vez
 * (tentativas = 3, então não volta a ser elegível aqui).
 */
export async function rechamarManual(req: Request, res: Response) {
  const { id } = req.params;
  const parse = chamarSenhaSchema.safeParse(req.body ?? {});
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }

  const unidadeId = unidadeDoFuncionario(req);
  let consultaAtual = supabaseAdmin.from("senhas").select("*").eq("id", id);
  if (unidadeId) {
    consultaAtual = consultaAtual.eq("unidade_id", unidadeId);
  }
  const { data: atual, error: erroAtual } = await consultaAtual.maybeSingle();

  if (erroAtual) {
    console.error(erroAtual);
    return res.status(500).json({ erro: "Não foi possível rechamar a senha." });
  }
  if (!atual) {
    return res.status(404).json({ erro: "Senha não encontrada." });
  }
  if (atual.status !== "perdida" || atual.tentativas !== 2) {
    return res.status(409).json({ erro: "Só é possível rechamar manualmente uma senha descartada que ainda não usou a rechamada manual." });
  }

  let consultaEmAberto = supabaseAdmin
    .from("senhas")
    .select("id", { count: "exact", head: true })
    .eq("data", atual.data)
    .eq("status", "chamada");
  consultaEmAberto = atual.unidade_id
    ? consultaEmAberto.eq("unidade_id", atual.unidade_id)
    : consultaEmAberto.is("unidade_id", null);
  const { count: emAberto, error: erroEmAberto } = await consultaEmAberto;

  if (erroEmAberto) {
    console.error(erroEmAberto);
    return res.status(500).json({ erro: "Não foi possível rechamar a senha." });
  }
  if ((emAberto ?? 0) > 0) {
    return res.status(409).json({ erro: "Finalize a senha que está sendo chamada antes de rechamar outra." });
  }

  const atualizacoes: Record<string, unknown> = {
    status: "chamada",
    chamada_em: new Date().toISOString(),
    chamada_por: req.funcionario?.id ?? null,
    tentativas: atual.tentativas + 1,
    aguardando_recall: false,
    recall_liberado: false,
  };
  if (parse.data.guiche !== undefined) {
    atualizacoes.guiche = parse.data.guiche || null;
  }

  // Condição repetida no update para não rechamar duas vezes em cliques simultâneos.
  const { data, error } = await supabaseAdmin
    .from("senhas")
    .update(atualizacoes)
    .eq("id", id)
    .eq("status", "perdida")
    .eq("tentativas", 2)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível rechamar a senha." });
  }
  if (!data) {
    return res.status(409).json({ erro: "Esta senha já foi rechamada. Recarregue a fila." });
  }

  res.json(data);
}

/** POST /api/fila/:id/atendida */
export async function marcarAtendida(req: Request, res: Response) {
  const { id } = req.params;

  const unidadeId = unidadeDoFuncionario(req);
  let query = supabaseAdmin
    .from("senhas")
    .update({ status: "atendida", atendida_em: new Date().toISOString() })
    .eq("id", id);
  if (unidadeId) {
    query = query.eq("unidade_id", unidadeId);
  }
  const { data, error } = await query.select("*").maybeSingle();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível marcar a senha como atendida." });
  }
  if (!data) {
    return res.status(404).json({ erro: "Senha não encontrada." });
  }

  res.json(data);
}

/**
 * POST /api/fila/:id/perdida — pessoa não compareceu quando chamada.
 *
 * Dá uma segunda chance antes de descartar: na 1ª vez, a senha volta pra
 * fila marcada para rechamada (`aguardando_recall`), e só vira sugestão de
 * novo depois que pelo menos outra senha for chamada no meio (ver
 * `chamarSenha` e `proximaSenhaSugerida`). Só na 2ª vez ela é descartada de
 * verdade (`status = 'perdida'`).
 */
export async function marcarPerdida(req: Request, res: Response) {
  const { id } = req.params;

  const unidadeId = unidadeDoFuncionario(req);
  let consultaAtual = supabaseAdmin.from("senhas").select("*").eq("id", id);
  if (unidadeId) {
    consultaAtual = consultaAtual.eq("unidade_id", unidadeId);
  }
  const { data: atual, error: erroAtual } = await consultaAtual.maybeSingle();

  if (erroAtual) {
    console.error(erroAtual);
    return res.status(500).json({ erro: "Não foi possível marcar a senha como não compareceu." });
  }
  if (!atual) {
    return res.status(404).json({ erro: "Senha não encontrada." });
  }

  const primeiraVez = (atual.tentativas ?? 0) < 2;

  // A liberação do recall normalmente vem como efeito colateral de chamar
  // OUTRA senha (ver `chamarSenha`). Se não há nenhuma outra esperando (fora
  // as que também estão travadas em recall), essa "chamada no meio" nunca vai
  // acontecer — então já libera agora para a senha não ficar presa.
  let recallLiberado = false;
  if (primeiraVez) {
    let consultaOutras = supabaseAdmin
      .from("senhas")
      .select("id", { count: "exact", head: true })
      .eq("data", atual.data)
      .eq("status", "aguardando")
      .neq("id", id)
      .or("aguardando_recall.eq.false,recall_liberado.eq.true");
    consultaOutras = atual.unidade_id
      ? consultaOutras.eq("unidade_id", atual.unidade_id)
      : consultaOutras.is("unidade_id", null);

    const { count: outrasAguardando, error: erroOutras } = await consultaOutras;
    if (erroOutras) {
      console.error(erroOutras);
      return res.status(500).json({ erro: "Não foi possível marcar a senha como não compareceu." });
    }
    recallLiberado = (outrasAguardando ?? 0) === 0;
  }

  const atualizacoes: Record<string, unknown> = primeiraVez
    ? { status: "aguardando", aguardando_recall: true, recall_liberado: recallLiberado }
    : { status: "perdida", aguardando_recall: false, recall_liberado: false };

  const { data, error } = await supabaseAdmin
    .from("senhas")
    .update(atualizacoes)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível marcar a senha como não compareceu." });
  }
  if (!data) {
    return res.status(404).json({ erro: "Senha não encontrada." });
  }

  res.json(data);
}
