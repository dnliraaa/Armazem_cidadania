import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import logoAzul from "../assets/logo.png";
import { useAuth } from "../contexts/AuthContext";

export function Login() {
  const { session, entrar } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (session) {
    return <Navigate to="/modulos" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await entrar(email, senha);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
      }}
    >
      <div className="cartao" style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <img src={logoAzul} alt="Armazém da Cidadania" style={{ height: 120, maxWidth: "100%", width: "auto", marginBottom: "0.5rem" }} />
          <h1 style={{ fontSize: "1.3rem", margin: "0.5rem 0 0.15rem" }}>Armazém da Cidadania</h1>
          <p style={{ color: "var(--cor-texto-suave)", fontSize: "0.9rem", margin: 0 }}>
            Acesso restrito a funcionários
          </p>
        </div>

        {erro && <div className="alerta-erro">{erro}</div>}

        <form onSubmit={handleSubmit}>
          <div className="campo">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@armazemdacidadania.org"
            />
          </div>

          <div className="campo">
            <label htmlFor="senha">Senha</label>
            <input
              id="senha"
              type="password"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button type="submit" className="btn btn-primario" style={{ width: "100%" }} disabled={enviando}>
            {enviando ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
