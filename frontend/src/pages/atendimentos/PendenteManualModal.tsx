import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { somenteDigitos } from "../../utils/formatters";
import type { Cidadao, Nucleo } from "../../types";
import { PendenteFormCampos } from "./PendenteFormCampos";

interface Props {
  nucleos: Nucleo[];
  onFechar: () => void;
  onSalvo: () => void;
}

export function PendenteManualModal({ nucleos, onFechar, onSalvo }: Props) {
  const [nucleoId, setNucleoId] = useState(nucleos[0]?.id ?? "");
  const [dataAtendimento, setDataAtendimento] = useState(() => new Date().toISOString().slice(0, 10));
  const [cpfTexto, setCpfTexto] = useState("");
  const [mensagemCpf, setMensagemCpf] = useState<string | null>(null);
  const [buscandoCpf, setBuscandoCpf] = useState(false);
  const [demandaPrincipalId, setDemandaPrincipalId] = useState("");
  const [outrasDemandas, setOutrasDemandas] = useState<string[]>([]);
  const [resolvida, setResolvida] = useState(false);
  const [houveEncaminhamento, setHouveEncaminhamento] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const nucleoAtual = nucleos.find((n) => n.id === nucleoId);
  const demandasDoNucleo = nucleoAtual?.demandas.filter((d) => d.ativo) ?? [];

  function handleNucleoChange(id: string) {
    setNucleoId(id);
    setDemandaPrincipalId("");
    setOutrasDemandas([]);
  }

  function handleToggleOutraDemanda(id: string) {
    setOutrasDemandas((atual) => (atual.includes(id) ? atual.filter((d) => d !== id) : [...atual, id]));
  }

  async function handleCpfBlur() {
    const digitos = somenteDigitos(cpfTexto);
    if (digitos.length < 11) {
      setMensagemCpf(null);
      return;
    }
    setBuscandoCpf(true);
    try {
      const resultados = await api.get<Cidadao[]>(`/cidadaos?busca=${digitos}`);
      const encontrado = resultados.find((c) => c.cpf === digitos);
      setMensagemCpf(
        encontrado ? `Cidadão encontrado: ${encontrado.nome}` : "Cidadão não encontrado — nome será pedido na revisão."
      );
    } catch {
      setMensagemCpf(null);
    } finally {
      setBuscandoCpf(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!nucleoId) {
      setErro("Selecione um núcleo.");
      return;
    }
    setEnviando(true);
    try {
      await api.post("/atendimentos/pendentes", {
        nucleo_id: nucleoId,
        cpf_texto: cpfTexto || undefined,
        demanda_principal_id: demandaPrincipalId || null,
        outras_demandas: outrasDemandas,
        resolvida,
        houve_encaminhamento: houveEncaminhamento,
        data_atendimento: dataAtendimento,
      });
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível cadastrar o atendimento.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Cadastrar atendimento manualmente</h2>

        {erro && <div className="alerta-erro">{erro}</div>}

        <form onSubmit={handleSubmit}>
          <div className="campo">
            <label htmlFor="nucleo">Núcleo</label>
            <select id="nucleo" required value={nucleoId} onChange={(e) => handleNucleoChange(e.target.value)}>
              <option value="" disabled>
                Selecione…
              </option>
              {nucleos.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="campo">
            <label htmlFor="dataAtendimento">Data do atendimento</label>
            <input
              id="dataAtendimento"
              type="date"
              required
              value={dataAtendimento}
              onChange={(e) => setDataAtendimento(e.target.value)}
            />
          </div>

          <PendenteFormCampos
            cpfTexto={cpfTexto}
            onCpfTextoChange={setCpfTexto}
            onCpfBlur={handleCpfBlur}
            mensagemCpf={buscandoCpf ? "Buscando…" : mensagemCpf}
            demandas={demandasDoNucleo}
            demandaPrincipalId={demandaPrincipalId}
            onDemandaPrincipalChange={setDemandaPrincipalId}
            outrasDemandas={outrasDemandas}
            onToggleOutraDemanda={handleToggleOutraDemanda}
            resolvida={resolvida}
            onResolvidaChange={setResolvida}
            houveEncaminhamento={houveEncaminhamento}
            onHouveEncaminhamentoChange={setHouveEncaminhamento}
          />

          <div className="modal-acoes">
            <button type="button" className="btn btn-secundario" onClick={onFechar}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primario" disabled={enviando}>
              {enviando ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
