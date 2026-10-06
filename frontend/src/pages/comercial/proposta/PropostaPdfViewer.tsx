import { useEffect, useRef, useState } from 'react';
import { baixarPreviaEmPdf } from '../../../api/comercial';
import type { TipoDeDocumento } from './DocumentoPrevia';

type Estado = { status: 'carregando' } | { status: 'erro' } | { status: 'pronto'; url: string };

/** Exibe o PDF produzido pelo modelo Word com a mesma paginação da emissão. */
export function PropostaPdfViewer({ tipo, dados, nome, onFechar }: {
  tipo: TipoDeDocumento;
  dados: Record<string, unknown>;
  nome: string;
  onFechar: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [estado, setEstado] = useState<Estado>({ status: 'carregando' });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let ativo = true;
    let url = '';
    setEstado({ status: 'carregando' });
    baixarPreviaEmPdf(tipo, dados, controller.signal)
      .then(blob => {
        if (!ativo) return;
        url = URL.createObjectURL(blob);
        setEstado({ status: 'pronto', url });
      })
      .catch(() => {
        if (ativo) setEstado({ status: 'erro' });
      });
    return () => {
      ativo = false;
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [tipo, dados, tentativa]);

  return (
    <dialog ref={dialog} className="com-pdf-visualizador" aria-labelledby="com-pdf-titulo"
      onCancel={onFechar}>
      <div className="com-pdf-conteudo">
        <header className="com-pdf-cabecalho">
          <div>
            <h2 id="com-pdf-titulo">Prévia da proposta {tipo === 'technical' ? 'técnica' : 'comercial'}</h2>
            <p>{nome}</p>
          </div>
          <div className="com-pdf-acoes">
            {estado.status === 'pronto' && <a className="com-btn" href={estado.url} download={nome}>Baixar PDF</a>}
            <button type="button" className="com-btn com-btn-fantasma" onClick={onFechar}>Fechar prévia</button>
          </div>
        </header>
        {estado.status === 'carregando' && <div className="com-pdf-mensagem" role="status">
          Gerando o documento para visualização…
        </div>}
        {estado.status === 'erro' && <div className="com-pdf-mensagem" role="alert">
          <p>Não foi possível gerar a prévia do documento.</p>
          <button type="button" className="com-btn" onClick={() => setTentativa(value => value + 1)}>Tentar novamente</button>
        </div>}
        {estado.status === 'pronto' && <iframe className="com-pdf-documento"
          src={`${estado.url}#view=FitH`} title="Documento da proposta em PDF" />}
      </div>
    </dialog>
  );
}
