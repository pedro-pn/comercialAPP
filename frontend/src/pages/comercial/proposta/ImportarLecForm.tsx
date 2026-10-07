import { useRef, useState } from 'react';
import { importarRevisaoDoLec, mensagemDeErro, obterPreviaImportacaoLegada, prepararArquivoLegado,
  type ArquivoLegado, type ArquivosLegados, type LevantamentoSalvo, type PreviaImportacaoLegada } from '../../../api/comercial';

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function ImportarLecForm({ onImportado, onOcupado }: {
  onImportado: (estimate: LevantamentoSalvo) => void;
  onOcupado: (busy: boolean) => void;
}) {
  const [files, setFiles] = useState<Partial<ArquivosLegados>>({});
  const [preview, setPreview] = useState<PreviaImportacaoLegada | null>(null);
  const [revision, setRevision] = useState('');
  const [model, setModel] = useState<'padrao' | 'hidrojateamento'>('padrao');
  const [resolutions, setResolutions] = useState<Record<string, 'lec' | 'pdf'>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const reading = useRef(false);
  function occupied(value: boolean) { reading.current = value; setBusy(value); onOcupado(value); }

  async function chooseFile(kind: 'lec' | 'pdf', file?: File) {
    if (reading.current) return;
    occupied(true); setMessage(''); setPreview(null); setConfirmed(false); setResolutions({});
    const next: Partial<ArquivosLegados> = { ...files, [kind]: undefined };
    setFiles(next);
    try {
      if (file) {
        if (kind === 'lec' ? !/\.(xlsm|xlsx)$/i.test(file.name) : !/\.pdf$/i.test(file.name)) {
          throw new Error(kind === 'lec' ? 'Selecione um LEC em .xlsm ou .xlsx.' : 'Selecione a proposta em PDF.');
        }
        const encoded: ArquivoLegado = await prepararArquivoLegado(file);
        next[kind] = encoded;
      }
      setFiles(next);
      if (!next.lec) return;
      const result = await obterPreviaImportacaoLegada(next as ArquivosLegados);
      setPreview(result); setRevision(String(result.suggestedRevisionNumber));
      setResolutions(Object.fromEntries(result.conflicts.map(conflict => [conflict.field, 'pdf'])));
    } catch (error) {
      setMessage(mensagemDeErro(error, 'Não foi possível analisar os arquivos.'));
    } finally { occupied(false); }
  }

  async function importFiles() {
    if (!files.lec || !preview || !confirmed || reading.current) return;
    occupied(true); setMessage('');
    try {
      const result = await importarRevisaoDoLec(files as ArquivosLegados, {
        proposalCode: preview.proposalCode, revisionNumber: Number(revision), modelo: model, resolutions
      });
      onImportado(result.estimate);
    } catch (error) {
      setMessage(mensagemDeErro(error, 'Não foi possível importar a revisão.'));
    } finally { occupied(false); }
  }
  const validRevision = preview && Number.isInteger(Number(revision)) && Number(revision) > preview.sourceRevisionNumber
    && Number(revision) <= 2_147_483_646;

  return (
    <section className="com-lec-importacao" aria-labelledby="lec-importacao-titulo">
      <h2 id="lec-importacao-titulo">Importar proposta do LEC</h2>
      <p>Carregue a planilha e, se disponível, o PDF da mesma revisão para complementar o escopo,
        as responsabilidades e as condições comerciais. Primeiro você revisará os custos, depois a proposta.</p>
      <fieldset disabled={busy} className="com-lec-arquivos">
        <div className="field-group">
          <label htmlFor="lec-planilha">Planilha LEC (.xlsm ou .xlsx) *</label>
          <input id="lec-planilha" type="file" accept=".xlsm,.xlsx" onChange={event => void chooseFile('lec', event.target.files?.[0])} />
        </div>
        <div className="field-group">
          <label htmlFor="lec-pdf">Proposta original em PDF (opcional)</label>
          <input id="lec-pdf" type="file" accept=".pdf" onChange={event => void chooseFile('pdf', event.target.files?.[0])} />
          {files.pdf && <button type="button" className="com-btn com-btn-fantasma"
            onClick={() => { const input = document.getElementById('lec-pdf') as HTMLInputElement; input.value = ''; void chooseFile('pdf'); }}>
            Remover PDF
          </button>}
        </div>
      </fieldset>
      <p className="com-ajuda-campo">Até 10 MB por arquivo. O PDF deve conter texto selecionável.</p>
      {busy && <p role="status">Lendo arquivos e preparando a revisão...</p>}
      {preview && <>
        <div className="com-lec-resumo" role="status">
          <strong>Proposta {preview.proposalCode} · revisão de origem {preview.sourceRevisionNumber}</strong>
          <span>{preview.clientName} · {preview.site}</span>
          <span>{preview.laborAssignments} alocações de equipe · {preview.materials + preview.products + preview.filters} insumos · {preview.logistics} itens de logística · {preview.scopeItems} serviços no escopo</span>
          <span>Preço original: {money(preview.sourceSalePrice)} · Custo no LEC: {money(preview.sourceTotalCost)} · Custo no app: {money(preview.importedTotalCost)}</span>
        </div>
        <div className="com-form-grid">
          <div className="field-group">
            <label htmlFor="lec-revisao">Revisão a criar *</label>
            <input id="lec-revisao" type="number" min={preview.sourceRevisionNumber + 1} max="2147483646"
              step="1" value={revision} disabled={busy} onChange={event => setRevision(event.target.value)} />
          </div>
          <div className="field-group">
            <label htmlFor="lec-modelo">Modelo da proposta</label>
            <select id="lec-modelo" value={model} disabled={busy} onChange={event => setModel(event.target.value as typeof model)}>
              <option value="padrao">Padrão</option>
              <option value="hidrojateamento">Hidrojateamento</option>
            </select>
          </div>
        </div>
        {!preview.pdfFileName && <p className="com-recado">Para recuperar os textos e o escopo da proposta emitida,
          inclua o PDF acima. Sem ele, os campos ausentes deverão ser preenchidos no app.</p>}
        {preview.conflicts.length > 0 && <section className="com-lec-diferencas">
          <h3>Diferenças entre LEC e PDF</h3>
          <p>Escolha qual conteúdo usar em cada campo. O PDF está selecionado por representar a proposta emitida.</p>
          {preview.conflicts.map(conflict => <fieldset key={conflict.field} disabled={busy}>
            <legend>{conflict.label}</legend>
            {(['pdf', 'lec'] as const).map(source => <label key={source} className="com-lec-escolha">
              <input type="radio" name={`lec-conflict-${conflict.field}`} checked={resolutions[conflict.field] === source}
                onChange={() => { setResolutions(current => ({ ...current, [conflict.field]: source })); setConfirmed(false); }} />
              <span><strong>{source === 'pdf' ? 'Usar PDF' : 'Usar LEC'}</strong>
                <span className="com-lec-texto">{source === 'pdf' ? conflict.pdfValue : conflict.lecValue}</span></span>
            </label>)}
          </fieldset>)}
        </section>}
        <details className="com-lec-avisos">
          <summary>Conferências necessárias ({preview.warnings.length})</summary>
          <ul>{preview.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
        </details>
        <p>O preço será mantido como valor global. Você poderá alterá-lo ou escolher o preço calculado em Resumo e QQP.</p>
        <label className="com-legado-confirmacao">
          <input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />
          Conferi a proposta de origem, a revisão a criar e as diferenças entre os arquivos.
        </label>
        <button type="button" className="com-btn" disabled={busy || !confirmed || !validRevision} onClick={() => void importFiles()}>
          {busy ? 'Importando...' : 'Importar e revisar levantamento de custos'}
        </button>
      </>}
      {message && <p className="com-recado" role="alert">{message}</p>}
    </section>
  );
}
