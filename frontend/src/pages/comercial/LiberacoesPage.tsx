import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { mensagemDeErro } from '../../api/comercial';
import { apiClient } from "../../api/client";
import { ComercialChrome } from "./components/ComercialChrome";
type Release = {
  id: string;
  opportunityId: string;
  version: number;
  snapshot: {
    legalName: string;
    site: string;
    description: string;
    contactName: string;
  };
};
export function LiberacoesPage() {
  const [items, setItems] = useState<Release[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  useEffect(() => {
    let live = true;
    apiClient
      .get<{ items: Release[] }>("/comercial/liberacoes")
      .then((r) => {
        if (live) setItems(r.data.items);
      })
      .catch((e) => {
        if (live) setError(mensagemDeErro(e, "Não foi possível consultar as liberações."));
      })
      .finally(() => { if (live) setLoading(false); });
    return () => {
      live = false;
    };
  }, []);
  return (
    <ComercialChrome
      eyebrow="Prisma CRM"
      titulo="Negócios liberados pelo Prisma"
      voltarPara="/"
      descricao="Escolha um negócio liberado para iniciar a proposta com os dados do Prisma."
    >
      <section className="com-painel com-api-token-list">
        {error && <p role="alert">{error}</p>}
        {loading && <p role="status">Carregando negócios liberados…</p>}
        {!loading && !items.length && !error && <p>Nenhum negócio liberado.</p>}
        {items.map((r) => (
          <article
            key={r.id}
            className="com-api-token"
          >
            <div><h2>{r.snapshot.legalName}</h2>
            <p>
              {r.snapshot.description} · {r.snapshot.site}
            </p>
            <p>
              {r.snapshot.contactName} · Oportunidade {r.opportunityId} ·
              liberação v{r.version}
            </p>
            </div>
            <button
              className="com-btn com-btn-primario"
              onClick={() =>
                navigate(
                  "/propostas?liberacao=" +
                    encodeURIComponent(r.id) +
                    "&modo=new",
                )
              }
            >
              Criar proposta neste negócio
            </button>
          </article>
        ))}
      </section>
    </ComercialChrome>
  );
}
