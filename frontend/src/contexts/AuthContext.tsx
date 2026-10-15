import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { supabase } from "../lib/supabase";
import type { Funcionario } from "../types";

interface AuthContextValue {
  session: Session | null;
  funcionario: Funcionario | null;
  carregando: boolean;
  erroFuncionario: boolean;
  recarregarFuncionario: () => Promise<void>;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [funcionario, setFuncionario] = useState<Funcionario | null>(null);
  const [carregando, setCarregando] = useState(true);

  const [buscandoFuncionario, setBuscandoFuncionario] = useState(false);

  async function carregarFuncionario() {
    setBuscandoFuncionario(true);
    try {
      const dados = await api.get<Funcionario>("/me");
      setFuncionario(dados);
    } catch {
      setFuncionario(null);
    } finally {
      setBuscandoFuncionario(false);
    }
  }

  // Há sessão, mas o cadastro do funcionário não veio (API fora do ar, token vencido...).
  const erroFuncionario = !carregando && !buscandoFuncionario && Boolean(session) && !funcionario;

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        setSession(data.session);
        if (data.session) {
          await carregarFuncionario();
        }
      })
      .catch(() => {
        setSession(null);
        setFuncionario(null);
      })
      .finally(() => setCarregando(false));

    // Não chamar o Supabase (nem a API, que lê a sessão) de dentro deste callback: o supabase-js
    // segura um lock durante ele e a chamada ficaria esperando para sempre (carregamento infinito).
    // Por isso o trabalho é adiado com setTimeout.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, novaSession) => {
      setSession(novaSession);
      if (novaSession) setBuscandoFuncionario(true);
      setTimeout(() => {
        if (novaSession) {
          void carregarFuncionario();
        } else {
          setFuncionario(null);
        }
      }, 0);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function entrar(email: string, senha: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) {
      throw new Error(
        error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : error.message
      );
    }
  }

  async function sair() {
    // scope local: sair aqui não derruba a mesma conta aberta em outros aparelhos.
    await supabase.auth.signOut({ scope: "local" });
  }

  return (
    <AuthContext.Provider
      value={{ session, funcionario, carregando, erroFuncionario, recarregarFuncionario: carregarFuncionario, entrar, sair }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de um AuthProvider.");
  return ctx;
}
