# Validação do protótipo

Data: 26 de outubro de 2026. Este relatório e os vídeos documentam a versão inicial; a atualização de localização e interface em 27 de outubro tem evidências separadas em `ATUALIZACAO-LOCALIZACAO.md`.

## Ambiente

- Windows 10 Pro 10.0.19045.
- Intel Core i7-7700, 4 núcleos e 8 processadores lógicos.
- Adaptadores disponíveis: NVIDIA GeForce GTX 1070 (driver 32.0.15.6094) e Intel HD Graphics 630 (27.20.100.8280). O relatório não identifica qual adaptador foi selecionado pelo navegador.
- Navegador integrado do Codex, identificação Chromium/Chrome 156.0.0.0, WebGL 2.
- Node.js 24.21.0; Three.js 0.185.1; Vite 6.4.5.

## Evidências

| Critério | Resultado e evidência |
| --- | --- |
| Build de produção | `npm run build` concluído: TypeScript, Vite e HTML portátil. Advertência de chunk grande esperada para Three.js incorporado. |
| Testes automatizados | 19 testes aprovados. Direção, ré, comandos opostos, ausência de giro parado, pausa/foco, câmera angular, projeção, anéis, alturas, colisão e determinismo. |
| Independência de fps | Entrada de 10 s a 30, 60 e 120 fps; posição e distância iguais dentro de 0,000001 unidade. Limite proposto de 5% atendido. |
| Colisão em alta velocidade | Prédio, pedra, margem e borda atingidos a 30 unidades/s; nenhum estado final penetra os obstáculos. Ré libera o carro após contato oblíquo. |
| Água e ponte | Travessia da ponte testada em amostras de 1 m. Água bloqueia fora do tabuleiro; ilha representada por vazio permanece livre. Cenário sintético. |
| Conectividade | Grafo conserva nós e separa chaves por nível. Corredores unidos; nenhum cruzamento geométrico cria um nó novo. Componentes de origem são registrados, sem ligações inventadas. |
| Folga no mapa real | `map:audit` amostra o eixo de cada via a cada 2 m, com orientação do segmento; zero bloqueios nas vias incluídas, fora da margem de segurança da borda. Ver `clearance-report.json`. |
| Regeneração | Duas preparações do mesmo bruto são idênticas; coleta e SHA-256 constam da procedência. 89 vias, 433 áreas, 22 pedras sintéticas. |
| Navegador | Aceleração, frenagem até a ré, reset, pausa por Esc, ortográfica/perspectiva e efeitos reduzidos exercitados pela interface. |
| Tela pequena | Interface inspecionada em viewport nominal 390 × 844; controles e ajustes acessíveis. Isso é inspeção responsiva desktop, não homologação em aparelho móvel físico. |
| Falha de dados | Um caminho de teste sem o JSON exibiu “O arquivo maps/davis.json está ausente ou não contém um mapa JSON.”, com tentativa novamente e alternativa de pista. Schema inválido e spawn bloqueado também são testes automatizados. |
| Rede | Monitoramento CDP durante a rota de 60 s do HTML incorporado registrou zero requisições após o carregamento. Não existe consulta de mapa no loop. |
| Console | Nenhum erro de execução observado no percurso de aceitação ou na rota do build de produção. A advertência inicial de PCFSoftShadowMap foi corrigida para PCFShadowMap. |
| Efeitos | Quantidades limitadas; classificação de terra/asfalto/água/neutro testada. Geometria de terra coincide com a superfície que emite poeira. |

## Desempenho

`performance-browser.json` contém a medição de 60 segundos em Davis com a entrada fixa `fixed-input-v1`. O diagnóstico e suas malhas estavam ligados, com efeitos e sombras habilitados. O framebuffer foi conferido diretamente nos atributos do canvas em **1920 × 1080**. O tamanho CSS é menor devido ao fator de escala do Windows/navegador, registrado no JSON; não se deve confundir pixels CSS com pixels renderizados.

A execução de referência ficou em aproximadamente **60 fps**, com **p95 de 16,9 ms**, abaixo da meta de 20 ms. Isso demonstra o orçamento visual neste computador e navegador, não garante desempenho em celulares ou GPUs diferentes. O teste envolve quatro ciclos curtos de aceleração, curva, frenagem, ré, contato e reset; não mede um passeio longo por todas as ruas ou streaming, que não existe neste protótipo.

`acceptance-browser.json` registra a sequência sintética de 60 segundos. Os contatos esperados foram observados: limite, prédio, pedra e água. `aceitacao.webm` contém aproximadamente 55 segundos do ensaio, incluindo aceleração após o reset intermediário, ré, curva, ponte, contatos e reset final. O vídeo grava apenas o canvas e inclui linhas do diagnóstico. O formato MediaRecorder WebM pode não informar uma duração total ao player, mas a reprodução foi aberta e inspecionada no navegador.

## Ressalvas da entrega

O recorte real deliberadamente exclui acessos internos de estacionamento, garagem e drive-through; alguns atravessam coberturas de edifícios e não representam a rede pública pretendida para esta amostra. A regra é reproduzível e os elementos originais permanecem no bruto. Quatro pequenos contatos de pavimentação com edifícios foram removidos da pavimentação sem alterar a implantação dos prédios ou os eixos viários. A auditoria de passagem foi executada depois desse ajuste.

A topologia vertical é limitada: ponte simples sobre água é suportada, mas túneis e cruzamentos entre ruas em alturas diferentes são rejeitados. A amostra real e a pista de teste não dependem de ruas sobrepostas. Não há terreno altimétrico real.

O HTML portátil foi testado por HTTP local com mapas incorporados. A política do navegador integrado bloqueou a navegação `file://`, portanto a abertura por duplo clique no navegador externo **não foi verificada automaticamente**. O artefato não contém importações externas, fontes remotas ou dependências de servidor para executar a partida. Se o navegador local restringir módulos em arquivos, o projeto também pode ser iniciado com `npm start`.

A gravação e os relatórios foram obtidos por controles visíveis da própria aplicação. Os testes não substituem avaliação subjetiva do usuário sobre sensação de velocidade, enquadramento e estilo visual; esses parâmetros estão reunidos em `src/config.ts`.
