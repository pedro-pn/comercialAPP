import { Field } from '../../components/Field';
import type {
  AnexoDaProposta,
  FunilNectar,
  VinculoCrmDaProposta
} from '../../../../api/comercial';
import { ETAPAS } from '../etapas';
import type {
  EscolhaDeCard,
  EscolhaDeDownload,
  PendenciaDaFinalizacao
} from '../finalizacao';

type AnyRecord = Record<string, unknown>;

const DOWNLOADS: Array<{ value: EscolhaDeDownload; label: string }> = [
  { value: 'both', label: 'Técnica + comercial' },
  { value: 'commercial', label: 'Somente comercial' },
  { value: 'technical', label: 'Somente técnica' }
];

export function RevisaoStep({
  form,
  codigo,
  vinculoCrm,
  funis,
  funisCarregando,
  funisMensagem,
  funilId,
  onFunil,
  escolhaCard,
  onEscolhaCard,
  escolha,
  onEscolha,
  pastaOneDrive,
  onPastaOneDrive,
  anexos,
  onAnexos,
  anexosEnviados,
  removendoAnexoId,
  onRemoverAnexo,
  erroFinalizacao,
  campoComErro,
  bloqueada
}: {
  form: AnyRecord;
  codigo: string;
  vinculoCrm: VinculoCrmDaProposta | null;
  funis: FunilNectar[];
  funisCarregando: boolean;
  funisMensagem: string;
  funilId: string;
  onFunil: (id: string) => void;
  escolhaCard: EscolhaDeCard;
  onEscolhaCard: (valor: EscolhaDeCard) => void;
  escolha: EscolhaDeDownload;
  onEscolha: (valor: EscolhaDeDownload) => void;
  pastaOneDrive: string;
  onPastaOneDrive: (valor: string) => void;
  anexos: File[];
  onAnexos: (arquivos: File[]) => void;
  anexosEnviados: AnexoDaProposta[];
  removendoAnexoId: string;
  onRemoverAnexo: (id: string) => void;
  erroFinalizacao: string;
  campoComErro?: PendenciaDaFinalizacao['campo'];
  bloqueada: boolean;
}) {
  const cliente = String(form.client || '').trim() || 'CLIENTE';
  const companyId = String(form.companyId || '').trim();
  const contactId = String(form.contactId || '').trim();
  const cardEfetivo: EscolhaDeCard = vinculoCrm ? 'existing' : escolhaCard;
  const integracaoDisponivel = Boolean(funis.length || vinculoCrm?.pipelineId);

  return (
    <section className="com-painel">
      <div className="com-secao-titulo">
        <div>
          <h2>Revisão e integração</h2>
          <p>
            Confira os dois documentos e, quando disponível, defina o destino no
            Nectar.
          </p>
        </div>
      </div>

      <section
        className="com-funil"
        aria-label="Funil do Nectar"
        aria-invalid={campoComErro === 'pipeline' || undefined}
        tabIndex={campoComErro === 'pipeline' ? -1 : undefined}
      >
        <div className="com-funil-titulo">
          <div>
            <strong>Funil do Nectar *</strong>
            <span>Escolha um dos funis autorizados para o card.</span>
          </div>
        </div>
        {funisCarregando ? (
          <p className="com-nota">Consultando os funis autorizados...</p>
        ) : funis.length ? (
          <div className="com-funil-opcoes">
            {funis.map((funil) => (
              <button
                type="button"
                key={funil.id}
                className={funilId === funil.id ? 'is-ativa' : undefined}
                disabled={bloqueada || Boolean(vinculoCrm)}
                onClick={() => onFunil(funil.id)}
              >
                <strong>{funil.nome}</strong>
                <span>Primeira etapa: {funil.primeiraEtapa}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="com-recado">
            {funisMensagem || 'Os funis autorizados não estão disponíveis.'} Os
            documentos e o envio ao SharePoint continuarão normalmente; o Nectar
            poderá ser tentado novamente pelo histórico.
          </p>
        )}
      </section>

      <div
        className="com-nota-regra"
        aria-invalid={campoComErro === 'card' || undefined}
        tabIndex={campoComErro === 'card' ? -1 : undefined}
      >
        <strong>
          {vinculoCrm ? 'Card existente do Nectar' : 'Destino no Nectar *'}
        </strong>
        {!integracaoDisponivel ? (
          <p>
            O destino no Nectar será definido em uma nova tentativa, quando ele
            voltar.
          </p>
        ) : vinculoCrm ? (
          <p>
            O card <b>{vinculoCrm.opportunityId}</b> será reutilizado no funil{' '}
            <b>{vinculoCrm.pipelineName || vinculoCrm.pipelineId}</b>. A revisão
            não abrirá uma segunda oportunidade.
          </p>
        ) : (
          <>
            <p>
              Escolha se o conjunto será anexado a um card existente ou a um
              novo card.
            </p>
            <div className="com-card-opcoes">
              <button
                type="button"
                disabled
                title="Disponível quando a proposta ou revisão já possui vínculo salvo"
              >
                <b>Usar card existente</b>
                <span>
                  Carregue uma proposta vinculada para reutilizar o card com
                  segurança.
                </span>
              </button>
              <button
                type="button"
                className={cardEfetivo === 'create' ? 'is-ativa' : undefined}
                disabled={bloqueada}
                onClick={() => onEscolhaCard('create')}
              >
                <b>Criar card novo</b>
                <span>Cria na primeira etapa real do funil selecionado.</span>
              </button>
            </div>
          </>
        )}
      </div>

      <div
        className={
          !integracaoDisponivel || (companyId && contactId)
            ? 'com-nota-regra'
            : 'com-nota-regra com-nota-alerta'
        }
      >
        <strong>Empresa e contato do Nectar</strong>
        <p>
          {!integracaoDisponivel
            ? 'Não são obrigatórios enquanto o Nectar estiver indisponível.'
            : companyId && contactId
              ? 'Empresa e contato estão vinculados à proposta.'
              : 'Volte à etapa Cliente e selecione a empresa e o contato no Nectar antes de finalizar.'}
        </p>
      </div>

      <div className="com-checklist">
        {ETAPAS.slice(0, -1).map((etapa) => (
          <div key={etapa.value}>
            <b aria-hidden="true">✓</b>
            <span>{etapa.label}</span>
          </div>
        ))}
      </div>

      <div className="com-form-grid">
        <article className="com-dado com-dado-destaque">
          <span>Documento comercial</span>
          <strong className="com-quebrar">
            Proposta Comercial - {codigo} - {cliente}.pdf
          </strong>
          <small>Valores, pagamento, impostos, know-how e aceite.</small>
        </article>
        <article className="com-dado com-dado-destaque">
          <span>Documento técnico</span>
          <strong className="com-quebrar">
            Proposta Técnica - {codigo} - {cliente}.pdf
          </strong>
          <small>Método, etapas, inspeção, liberação e relatórios.</small>
        </article>
      </div>

      <fieldset className="com-escolha-download">
        <legend>
          <strong>O que deseja baixar?</strong>
          <span>
            As duas propostas sempre serão geradas e salvas no banco, mesmo
            quando você baixar apenas uma.
          </span>
        </legend>
        <div className="com-escolha-opcoes">
          {DOWNLOADS.map((item) => (
            <label
              key={item.value}
              className={escolha === item.value ? 'is-ativa' : undefined}
            >
              <input
                type="radio"
                name="com-download"
                value={item.value}
                checked={escolha === item.value}
                disabled={bloqueada}
                onChange={() => onEscolha(item.value)}
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field
        label="Pasta existente no OneDrive (opcional)"
        value={pastaOneDrive}
        hint="Havendo valor, os arquivos são gravados dentro dela em vez de uma pasta nova."
        disabled={bloqueada}
        onChange={onPastaOneDrive}
      />

      <div className="field-group">
        <label htmlFor="com-anexos">
          Arquivos adicionais do cliente (opcional)
        </label>
        <input
          id="com-anexos"
          type="file"
          multiple
          disabled={bloqueada}
          onChange={(evento) => onAnexos(Array.from(evento.target.files || []))}
        />
        <small className="field-hint">
          Os anexos serão salvos na mesma pasta dos dois PDFs.
        </small>
        {(anexosEnviados.length > 0 || anexos.length > 0) && (
          <ul className="com-lista-anexos">
            {anexosEnviados.map((anexo) => (
              <li key={anexo.id}>
                <span>{anexo.originalName}</span>
                <button
                  type="button"
                  className="com-btn com-btn-fantasma"
                  disabled={bloqueada || removendoAnexoId === anexo.id}
                  onClick={() => onRemoverAnexo(anexo.id)}
                >
                  {removendoAnexoId === anexo.id ? 'Removendo...' : 'Remover'}
                </button>
              </li>
            ))}
            {anexos.map((arquivo, i) => (
              <li key={`${arquivo.name}-${arquivo.size}-${i}`}>
                <span>{arquivo.name}</span>
                <small>Aguardando envio</small>
              </li>
            ))}
          </ul>
        )}
      </div>

      {erroFinalizacao && (
        <p className="com-recado com-recado-erro" role="alert">
          {erroFinalizacao}
        </p>
      )}
    </section>
  );
}
