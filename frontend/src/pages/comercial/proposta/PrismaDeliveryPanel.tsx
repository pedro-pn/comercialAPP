import { useEffect, useState } from "react";
import { apiClient } from "../../../api/client";
import { mensagemDeErro } from "../../../api/comercial";
type Delivery = {
  crmReleaseId?: string;
  prismaDeliveryStatus: string;
  prismaReceivedId?: string;
  prismaDeliveryError?: string;
  crmApprovalStatus: string;
};
export function PrismaDeliveryPanel({
  proposalId,
  finalized,
}: {
  proposalId: string;
  finalized: boolean;
}) {
  const [data, setData] = useState<Delivery>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = async () => {
    const r = await apiClient.get<Delivery>(
      `/comercial/propostas/${proposalId}`,
    );
    setData(r.data);
  };
  useEffect(() => {
    let live = true;
    setData(undefined);
    setError("");
    if (proposalId)
      apiClient
        .get<Delivery>(`/comercial/propostas/${proposalId}`)
        .then((r) => {
          if (live) setData(r.data);
        })
        .catch(e => { if (live) setError(mensagemDeErro(e, "Falha ao consultar o envio ao Prisma.")); });
    return () => {
      live = false;
    };
  }, [proposalId, finalized]);
  if (!data?.crmReleaseId) return error
    ? <p className="com-recado com-recado-erro" role="alert">{error}</p> : null;
  const send = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await apiClient.post<{ status: string }>(
        `/comercial/propostas/${proposalId}/enviar-prisma`,
      );
      await load();
      if (r.data.status === "DESATIVADO")
        setError("Conexão com o Prisma ainda não configurada neste ambiente.");
    } catch (e) {
      setError(mensagemDeErro(e, "Falha no envio ao Prisma."));
    } finally {
      setBusy(false);
    }
  };
  const labels: Record<string, string> = {
    PENDENTE: "Pendente",
    SUCESSO: "Recebida no Prisma",
    ERRO: "Falha no envio",
    ENVIANDO: "Enviando PDFs",
    APPROVED: "Aceita",
    REJECTED: "Recusada",
    CANCELLED: "Cancelada",
  };
  return (
    <section className="com-painel">
      <h2>Prisma · documentos e decisão comercial</h2>
      <p>
        {labels[data.prismaDeliveryStatus] || data.prismaDeliveryStatus} ·
        Revisão {labels[data.crmApprovalStatus] || data.crmApprovalStatus}
      </p>
      {data.prismaReceivedId && (
        <p>Registro de recebimento: {data.prismaReceivedId}</p>
      )}
      {data.prismaDeliveryError && <p className="com-nota">Detalhe do envio: {data.prismaDeliveryError}</p>}
      {error && <p role="alert">{error}</p>}
      <div className="com-local-actions">
      <button
        type="button"
        className="com-btn"
        disabled={busy || !finalized || (data.prismaDeliveryStatus === "SUCESSO" || data.prismaDeliveryStatus === "ENVIANDO")}
        onClick={() => void send()}
      >
        {busy ? "Enviando…" : "Enviar PDFs ao Prisma"}
      </button>
      <button
        type="button"
        className="com-btn"
        disabled={busy}
        onClick={() =>
          void load().catch((e) =>
            setError(mensagemDeErro(e, "Falha ao atualizar.")),
          )
        }
      >
        Atualizar status
      </button>
      </div>
    </section>
  );
}
