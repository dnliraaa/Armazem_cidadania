import { supabase } from "./supabase";

const API_URL = import.meta.env.VITE_API_URL;

export class ApiError extends Error {
  status: number;
  /** Código de erro de negócio vindo do backend (ex.: "ACAO_ENCERRADA"). */
  codigo?: string;
  constructor(message: string, status: number, codigo?: string) {
    super(message);
    this.status = status;
    this.codigo = codigo;
  }
}

// --- Contexto de módulo ----------------------------------------------------
// Toda requisição envia X-Modulo (e X-Acao-Id no Itinerante) para o backend
// escopar os dados operacionais. O ModuloProvider mantém isto atualizado.

let contextoModulo: { modulo: "armazem" | "itinerante"; acaoId: string | null } = {
  modulo: "armazem",
  acaoId: null,
};

export function definirContextoApi(modulo: "armazem" | "itinerante", acaoId: string | null) {
  contextoModulo = { modulo, acaoId };
}

let aoAcaoEncerrada: (() => void) | null = null;

/** Registra o que fazer quando o backend avisa que a ação itinerante em uso foi encerrada. */
export function definirAoAcaoEncerrada(fn: (() => void) | null) {
  aoAcaoEncerrada = fn;
}

async function obterAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const resposta = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Modulo": contextoModulo.modulo,
      ...(contextoModulo.modulo === "itinerante" && contextoModulo.acaoId
        ? { "X-Acao-Id": contextoModulo.acaoId }
        : {}),
      ...(await obterAuthHeader()),
      ...(options.headers ?? {}),
    },
  });

  const corpo = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    const mensagem = corpo?.erro ?? `Erro ${resposta.status} ao comunicar com o servidor.`;
    if (corpo?.codigo === "ACAO_ENCERRADA") {
      aoAcaoEncerrada?.();
    }
    throw new ApiError(mensagem, resposta.status, corpo?.codigo);
  }

  return corpo as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
