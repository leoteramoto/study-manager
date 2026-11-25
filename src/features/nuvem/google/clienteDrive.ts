// Cliente da API REST do Google Drive v3, com `fetch` (RN46, RN47, RN51).
// Toda resposta é dado não confiável e passa pelos esquemas do domínio.
//
// Erros: falha de rede → `offline`; 401 → `semAutorizacao` (e o token é
// esquecido); qualquer outro problema → `falha`. As mensagens dos erros só
// dizem a operação e o status HTTP: nunca o token, o cabeçalho Authorization,
// a URL da sessão de upload ou o conteúdo do backup.
import { tamanhoBackupAceito } from '@/domain/backup'
import {
  APP_PROPERTIES_PASTA,
  type ArquivoDrive,
  type BackupNuvem,
  CHAVE_MARCA,
  consultaBackups,
  consultaPasta,
  interpretarArquivoDrive,
  interpretarBackupsDaPasta,
  interpretarEmail,
  interpretarIdArquivo,
  interpretarListaArquivos,
  MARCA_PASTA,
  MIME_BACKUP,
  MIME_PASTA,
  NOME_PASTA_NUVEM,
  tamanhoNuvemAceito,
  urlSessaoUploadValida,
} from '@/domain/backupNuvem'
import { type DadosGravacao, ErroArquivoGrande, ErroNuvem } from '../destino'

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'

/** Campos pedidos em cada arquivo (o mínimo para os esquemas do domínio). */
const CAMPOS_ARQUIVO = 'id,name,mimeType,modifiedTime,size,trashed,appProperties'

/** Limite de páginas de `files.list` (100 itens cada), contra laço infinito. */
export const MAXIMO_PAGINAS = 20

export interface DependenciasClienteDrive {
  fetch: typeof fetch
  /** Token válido desta aba, ou `null`. */
  token: () => string | null
  /** Chamado num 401: o token foi recusado e deve ser esquecido. */
  aoRecusarToken: () => void
}

type Operacao =
  'email' | 'pasta' | 'lista' | 'sessao-upload' | 'upload' | 'lixeira' | 'metadados' | 'download'

export class ClienteDrive {
  private readonly dependencias: DependenciasClienteDrive

  constructor(dependencias: DependenciasClienteDrive) {
    this.dependencias = dependencias
  }

  async obterEmail(): Promise<string | null> {
    const resposta = await this.json('email', `${API}/about?fields=user(emailAddress)`)
    return interpretarEmail(resposta)
  }

  /** A pasta informada, se ainda for a pasta do app; senão acha pela marca ou cria. */
  async garantirPasta(pastaId: string | null): Promise<string> {
    return (await this.acharPasta(pastaId)) ?? this.criarPasta()
  }

  /** A pasta do app (a informada, se ainda for dela, ou pela marca); `null` se não existir. */
  async acharPasta(pastaId: string | null): Promise<string | null> {
    if (pastaId !== null) {
      const atual = await this.metadadosOuNulo(pastaId)
      if (
        atual &&
        atual.trashed !== true &&
        atual.mimeType === MIME_PASTA &&
        atual.appProperties?.[CHAVE_MARCA] === MARCA_PASTA
      ) {
        return atual.id
      }
    }
    const parametros = new URLSearchParams({
      q: consultaPasta(),
      fields: `files(${CAMPOS_ARQUIVO})`,
      pageSize: '10',
      spaces: 'drive',
      orderBy: 'createdTime',
    })
    const pagina = interpretarListaArquivos(await this.json('pasta', `${API}/files?${parametros}`))
    if (!pagina) throw new ErroNuvem('falha', 'pasta: resposta inválida')
    return pagina.arquivos.find((arquivo) => arquivo.mimeType === MIME_PASTA)?.id ?? null
  }

  private async criarPasta(): Promise<string> {
    const criada = interpretarArquivoDrive(
      await this.json('pasta', `${API}/files?fields=${CAMPOS_ARQUIVO}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({
          name: NOME_PASTA_NUVEM,
          mimeType: MIME_PASTA,
          appProperties: APP_PROPERTIES_PASTA,
        }),
      }),
    )
    if (!criada) throw new ErroNuvem('falha', 'pasta: resposta inválida')
    return criada.id
  }

  /** Backups do app na pasta, de todas as páginas, do mais recente para o mais antigo. */
  async listarBackups(pastaId: string): Promise<BackupNuvem[]> {
    const arquivos: ArquivoDrive[] = []
    let pagina: string | null = null
    for (let numero = 0; numero < MAXIMO_PAGINAS; numero++) {
      const parametros = new URLSearchParams({
        q: consultaBackups(pastaId),
        fields: `nextPageToken,files(${CAMPOS_ARQUIVO})`,
        pageSize: '100',
        spaces: 'drive',
      })
      if (pagina) parametros.set('pageToken', pagina)
      const resultado = interpretarListaArquivos(
        await this.json('lista', `${API}/files?${parametros}`),
      )
      if (!resultado) throw new ErroNuvem('falha', 'lista: resposta inválida')
      arquivos.push(...resultado.arquivos)
      pagina = resultado.proximaPagina
      if (pagina === null) return interpretarBackupsDaPasta(arquivos)
    }
    throw new ErroNuvem('falha', 'lista: páginas demais')
  }

  /**
   * Upload resumable (aceita arquivos acima de 5 MB): abre a sessão com os
   * metadados e envia o conteúdo para o endereço do cabeçalho `Location`.
   */
  async gravarBackup(dados: DadosGravacao): Promise<void> {
    const criar = dados.idExistente === null
    const metadados = criar
      ? {
          name: dados.nome,
          mimeType: MIME_BACKUP,
          parents: [dados.pastaId],
          appProperties: dados.appProperties,
        }
      : { name: dados.nome, appProperties: dados.appProperties }
    // fields=id: a resposta final só precisa do id (ver `interpretarIdArquivo`).
    const endereco = criar
      ? `${UPLOAD}?uploadType=resumable&fields=id`
      : `${UPLOAD}/${encodeURIComponent(dados.idExistente ?? '')}?uploadType=resumable&fields=id`

    const sessao = await this.requisitar('sessao-upload', endereco, {
      method: criar ? 'POST' : 'PATCH',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': MIME_BACKUP,
      },
      body: JSON.stringify(metadados),
    })
    const local = sessao.headers.get('Location')
    if (!urlSessaoUploadValida(local)) {
      throw new ErroNuvem('falha', 'sessao-upload: endereço de upload inválido')
    }

    const enviado = interpretarIdArquivo(
      await this.lerJson(
        'upload',
        await this.requisitar('upload', local, {
          method: 'PUT',
          headers: { 'Content-Type': MIME_BACKUP },
          body: dados.conteudo,
        }),
      ),
    )
    if (!enviado) throw new ErroNuvem('falha', 'upload: resposta inválida')
  }

  /** Lixeira (`trashed: true`), nunca exclusão definitiva (RN46). */
  async moverParaLixeira(id: string): Promise<void> {
    await this.json('lixeira', `${API}/files/${encodeURIComponent(id)}?fields=id`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ trashed: true }),
    })
  }

  /** Confere o tamanho nos metadados antes de baixar e o tamanho real depois (RN47). */
  async baixarBackup(id: string): Promise<string> {
    const metadados = interpretarArquivoDrive(
      await this.json(
        'metadados',
        `${API}/files/${encodeURIComponent(id)}?fields=${CAMPOS_ARQUIVO}`,
      ),
    )
    if (!metadados) throw new ErroNuvem('falha', 'metadados: resposta inválida')
    if (!tamanhoNuvemAceito(metadados)) {
      throw new ErroArquivoGrande('metadados: arquivo grande demais ou sem tamanho')
    }
    const resposta = await this.requisitar(
      'download',
      `${API}/files/${encodeURIComponent(id)}?alt=media`,
    )
    const conteudo = await resposta.blob()
    if (!tamanhoBackupAceito(conteudo.size)) {
      throw new ErroArquivoGrande('download: arquivo grande demais')
    }
    return conteudo.text()
  }

  /** Metadados de um arquivo; `null` se ele não existir mais (404). */
  private async metadadosOuNulo(id: string): Promise<ArquivoDrive | null> {
    try {
      return interpretarArquivoDrive(
        await this.json('pasta', `${API}/files/${encodeURIComponent(id)}?fields=${CAMPOS_ARQUIVO}`),
      )
    } catch (erro) {
      if (erro instanceof ErroNuvem && erro.status === 404) return null
      throw erro
    }
  }

  private async json(operacao: Operacao, url: string, init: RequestInit = {}): Promise<unknown> {
    return this.lerJson(operacao, await this.requisitar(operacao, url, init))
  }

  private async lerJson(operacao: Operacao, resposta: Response): Promise<unknown> {
    try {
      return (await resposta.json()) as unknown
    } catch {
      throw new ErroNuvem('falha', `${operacao}: resposta inválida`)
    }
  }

  private async requisitar(
    operacao: Operacao,
    url: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const token = this.dependencias.token()
    if (token === null) throw new ErroNuvem('semAutorizacao', `${operacao}: sem token`)
    const cabecalhos = new Headers(init.headers)
    cabecalhos.set('Authorization', `Bearer ${token}`)

    let resposta: Response
    try {
      resposta = await this.dependencias.fetch(url, {
        ...init,
        headers: cabecalhos,
        // Nada de cookies nem cache para as chamadas autenticadas.
        credentials: 'omit',
        cache: 'no-store',
      })
    } catch {
      throw new ErroNuvem('offline', `${operacao}: falha de rede`)
    }
    if (resposta.status === 401) {
      this.dependencias.aoRecusarToken()
      throw new ErroNuvem('semAutorizacao', `${operacao}: HTTP 401`, 401)
    }
    if (!resposta.ok) {
      throw new ErroNuvem('falha', `${operacao}: HTTP ${resposta.status}`, resposta.status)
    }
    return resposta
  }
}
