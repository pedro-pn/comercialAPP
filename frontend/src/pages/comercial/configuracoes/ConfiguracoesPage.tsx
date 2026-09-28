import { useEffect, useState } from 'react';

import {
  localizarSedeComercial,
  mensagemDeErro,
  obterConfiguracaoComercial,
  salvarSedeComercial,
  type ComercialConfiguracao,
  type EnderecoLocalizado
} from '../../../api/comercial';
import { ComercialChrome } from '../components/ComercialChrome';
import { EnderecoField } from '../components/EnderecoField';
import { moduleRoutePath } from '../../../modules/registry';
import { configuracaoDaSedeMudou, placeIdDaLocalizacao } from './configuracao';

/**
 * Configurações do módulo Comercial — só gestor (T131).
 *
 * Existe por causa de um item só: o endereço da sede, que era
 * `COMERCIAL_SEDE_ENDERECO` no `.env`. Decisão do mantenedor em 12/08:
 *
 * > Endereço de sede é dado de negócio. Muda quando a empresa muda de prédio,
 * > quem sabe o endereço novo é o gestor, e trocá-lo exigia editar arquivo no
 * > servidor e reiniciar o container.
 *
 * ---------------------------------------------------------------------------
 * Dois caminhos até o mesmo lugar
 *
 * O endereço da sede é a ORIGEM de toda distância calculada, e erro de origem
 * não aparece em lugar nenhum: quem confere um cálculo olha o destino. Daí os
 * dois caminhos, e a preferência entre eles:
 *
 * 1. **Escolher da lista de sugestões** (T134) — o caminho bom. O endereço vem
 *    escrito pelo Google e traz o `placeId` junto, então não há o que conferir
 *    nem o que geocodificar depois.
 * 2. **Digitar à mão e clicar em "Localizar no mapa"** — para quando a lista não
 *    tem o lugar, ou está indisponível. Localizar consulta e **não grava**: é a
 *    chance de ver que "Rua Rosa Orsi 930" virou o centro de Itajaí antes de o
 *    número errado começar a sair nas propostas.
 *
 * O botão de localizar some quando o endereço veio da lista — ali ele
 * devolveria exatamente o que já está no campo.
 *
 * Não conseguir localizar **não impede de salvar**. Com o Maps desligado — que é
 * o padrão do ambiente — nunca localizaria, e a tela ficaria inútil justamente
 * na instalação mais comum. O endereço digitado serve de origem sozinho.
 */

type Estado = 'carregando' | 'pronto' | 'erro';

export function ConfiguracoesPage() {
  const [estado, setEstado] = useState<Estado>('carregando');
  const [config, setConfig] = useState<ComercialConfiguracao | null>(null);
  const [endereco, setEndereco] = useState('');
  /**
   * Preenchido só quando o endereço saiu da lista de sugestões. Vazio significa
   * "digitado à mão", e aí o servidor geocodifica antes de gravar.
   */
  const [placeId, setPlaceId] = useState('');
  const [local, setLocal] = useState<EnderecoLocalizado | null>(null);
  const [recado, setRecado] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;

    obterConfiguracaoComercial()
      .then((dados) => {
        if (!vivo) return;
        setConfig(dados);
        setEndereco(dados.sedeEndereco);
        setPlaceId(dados.sedePlaceId);
        setEstado('pronto');
      })
      .catch((error) => {
        if (!vivo) return;
        setErro(
          mensagemDeErro(
            error,
            'Não foi possível ler a configuração do módulo.'
          )
        );
        setEstado('erro');
      });

    return () => {
      vivo = false;
    };
  }, []);

  // Editar invalida a localização anterior: ela é de OUTRO endereço, e deixá-la
  // na tela ao lado do texto novo é o convite para salvar achando que confirmou.
  function editar(valor: string, escolhido: string) {
    setEndereco(valor);
    setPlaceId(escolhido);
    setLocal(null);
    setRecado('');
  }

  async function localizar() {
    setOcupado(true);
    setErro('');
    setRecado('');
    try {
      const encontrado = await localizarSedeComercial(endereco);
      setLocal(encontrado);
      const localizado = placeIdDaLocalizacao(encontrado);
      if (localizado) setPlaceId(localizado);
    } catch (error) {
      setErro(mensagemDeErro(error, 'Não foi possível localizar o endereço.'));
    } finally {
      setOcupado(false);
    }
  }

  async function salvar() {
    setOcupado(true);
    setErro('');
    try {
      const salvo = await salvarSedeComercial(endereco, placeId);
      setConfig(salvo);
      setEndereco(salvo.sedeEndereco);
      setPlaceId(salvo.sedePlaceId);
      setLocal(
        salvo.sedeEnderecoEncontrado
          ? {
              enderecoEncontrado: salvo.sedeEnderecoEncontrado,
              placeId: salvo.sedePlaceId,
              confianca: 'exata',
              aviso: ''
            }
          : null
      );
      setRecado(
        salvo.aviso
          ? `Endereço salvo. ${salvo.aviso}`
          : 'Endereço da sede salvo.'
      );
    } catch (error) {
      setErro(
        mensagemDeErro(error, 'Não foi possível salvar o endereço da sede.')
      );
    } finally {
      setOcupado(false);
    }
  }

  const mudou = configuracaoDaSedeMudou(config, endereco, placeId);

  return (
    <ComercialChrome
      voltarPara={moduleRoutePath('comercial', 'index')}
      eyebrow="FILTROVALI / COMERCIAL"
      titulo="Configurações"
      descricao="Ajustes do módulo que valem para todo mundo. Só gestores alcançam esta tela."
    >
      <section className="com-painel">
        <h2>Endereço da sede</h2>
        <p className="com-recado">
          É a origem de todas as distâncias calculadas nos levantamentos. Sem
          ele, a distância até a obra continua sendo digitada à mão.
        </p>

        {estado === 'carregando' && <p>Carregando…</p>}

        {estado !== 'carregando' && (
          <>
            <EnderecoField
              label="Endereço"
              value={endereco}
              onChange={editar}
              disabled={ocupado}
              hint={
                config?.atualizadoEm
                  ? `Última alteração em ${new Date(config.atualizadoEm).toLocaleString('pt-BR')}${
                      config.atualizadoPor ? ` por ${config.atualizadoPor}` : ''
                    }.`
                  : 'Ainda não configurado neste ambiente.'
              }
            />

            <div className="com-oferta-acoes">
              {/* Só faz sentido para endereço digitado à mão: o que veio da lista
                  já é o do Google, e "localizar" devolveria ele mesmo. */}
              {!placeId && (
                <button
                  type="button"
                  className="com-btn com-btn-fantasma"
                  onClick={localizar}
                  disabled={ocupado || endereco.trim().length < 8}
                >
                  Localizar no mapa
                </button>
              )}
              <button
                type="button"
                className="com-btn com-btn-primario"
                onClick={salvar}
                disabled={ocupado || !mudou || endereco.trim().length < 8}
              >
                Salvar
              </button>
            </div>

            {local && (
              <p
                className={`com-recado${local.confianca === 'exata' ? '' : ' com-recado-erro'}`}
              >
                {local.enderecoEncontrado ? (
                  <>
                    Encontrado:{' '}
                    <b className="com-quebrar">{local.enderecoEncontrado}</b>
                    {local.aviso && <> — {local.aviso}</>}
                  </>
                ) : (
                  local.aviso
                )}
              </p>
            )}

            {recado && <p className="com-recado">{recado}</p>}
            {erro && <p className="com-recado com-recado-erro">{erro}</p>}
          </>
        )}
      </section>
    </ComercialChrome>
  );
}
