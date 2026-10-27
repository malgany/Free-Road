# Atualização de câmera, carro e exploração — 27/10/2026

Implementada no projeto local e no arquivo portátil `Jogar.html`.

## Jogabilidade

- A câmera inicia no maior afastamento. Scroll aproxima a vista aérea, inclina para olhar a estrada a aproximadamente 5 m atrás do carro e depois entra na cabine. Ao passar pela terceira pessoa, há uma retenção de pelo menos 500 ms e movimento adicional do scroll; um evento grande não pula essa parada. O caminho inverso funciona ao afastar.
- Cabine geométrica com painel, instrumentos, bancos, portas, colunas, teto, janelas e volante ligado ao esterçamento. Mouse olha para os lados e para cima/baixo; C ou duplo clique centraliza. Clicar tenta capturar o cursor, com Esc para liberar e pausar. Se a captura não for permitida, a posição do cursor dentro da janela controla o olhar. Os espelhos são decorativos.
- Minimap circular acompanha a posição do carro e mantém a frente para cima. O terreno gira ao redor do marcador; N acompanha o norte real. A largura visível é de até 220 unidades, ou um terço do recorte em mapas menores: pelo menos 3× de aproximação em relação ao mapa inteiro.
- Ícones próprios em SVG para pausa, continuar e engrenagem.
- Limite de 199 km/h para frente; limite de ré preservado. S/seta para baixo acende as luzes brancas, inclusive durante a frenagem que antecede a ré. Luzes vermelhas indicam a frenagem.
- Pneus deixam marcas contínuas na grama, terra e chão sem classificação OSM. No asfalto, as marcas exigem frenagem ou curva fechada. São até 2.048 segmentos, com vida máxima de 90 s e reciclagem quando o reservatório enche. Poeira na terra e no chão neutro, limitada a 48 partículas.
- Ciclo ativo durante o passeio: 600 s de dia, 90 s de entardecer, 300 s de noite, 90 s de amanhecer. Pausar congela o ciclo. Direção solar, sombras, céu e luz ambiente mudam com o tempo; os dois faróis iluminam a pista progressivamente ao escurecer. Ajustes permite escolher uma fase sem aguardar todo o ciclo.

## Mapas e cache

O jogo consulta novas áreas ao se aproximar da borda. A distância de antecipação aumenta com a velocidade. Cada consulta passa primeiro pelo cache; coordenadas de consulta são quantizadas em 0,001 grau. O GPS só é lido na ação inicial solicitada pelo jogador. As buscas seguintes usam a posição do carro virtual.

O cache IndexedDB conserva mapas derivados com validade de 30 dias, limitado a 64 regiões. Há oito regiões em memória. Armazenamento bloqueado ou cota excedida degrada para cache da sessão. O botão em Ajustes permite limpar os mapas salvos. O armazenamento contém a origem geográfica dos mapas; não há gravação contínua de GPS. O cache varia por navegador/origem/porta e o funcionamento em `file://` depende do navegador.

A geometria é reprojetada para a origem fixa da sessão. A janela ativa de terreno muda, mas estado, velocidade, rumo, distância, câmera e rastros do carro são preservados. O novo recorte só é instalado se a posição atual estiver livre. Trocar de cenário ou iniciar outra busca cancela o carregamento anterior. A pista sintética não se expande.

Internet e latência continuam relevantes: sem um trecho válido em cache e sem resposta da rede, a borda atual permanece sólida. Erros são exibidos e há nova tentativa em 30 s. A preparação das malhas ainda usa a thread principal e pode causar uma pausa curta em máquinas lentas. Esta versão mantém uma janela local, não o planeta inteiro em memória.

## Validação

- **40 testes automatizados aprovados**: física, colisões a 199 km/h, zoom nos dois sentidos, retenção magnética, olhar, ciclo solar e faróis, rastros em três superfícies, cache entre instâncias, expiração, corrupção, cancelamento, armazenamento indisponível, antecipação e reprojeção.
- **Build TypeScript + Vite aprovado** e HTML portátil regenerado. A advertência do Vite sobre o pacote único maior que 500 kB é esperada para a distribuição offline com Three.js.
- Teste visual do próprio `Jogar.html` servido em localhost: câmera aérea, scroll até terceira pessoa/cabine, janela direita pelo mouse, faróis noturnos, ré, HUD e ícones.
- Percurso de aproximadamente **0,93 km** na amostra pública de Davis atravessou múltiplos recortes sem teleporte. O diagnóstico mostrou 60 fps no trecho observado depois das trocas, sem caracterizar um benchmark completo. Rastros foram observados fora do asfalto. Nenhuma localização pessoal foi solicitada para estes testes.
- Uma nova aba recuperou a região pública **38.547, -121.741** do cache e exibiu a confirmação de recuperação local, verificando persistência real no navegador.
- O percurso revelou um fragmento de edifício de 0,017 m² na borda (`way/392698321`). O importador agora elimina fragmentos abaixo da tolerância geométrica após recortar, mantendo os edifícios originais. Há um teste de regressão específico.
- A captura de cursor foi recusada pelo navegador de teste; o modo alternativo por movimento do cursor foi verificado visualmente. A captura propriamente dita depende do suporte/permissão do navegador e não foi confirmada nesse ambiente.
- A duração integral de 18 minutos do ciclo não foi aguardada no navegador: as durações e transições foram testadas automaticamente, e a noite foi inspecionada via seletor de horário.

Imagens: `cabine-dia.png`, `cabine-lateral.png`, `cabine-noite.png` e `expansao-rastros.png`. Os relatórios anteriores de 60 s em `ACEITE.md` documentam a versão inicial, não esta atualização.

Referências de implementação: [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), [Pointer Lock](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API) e [SpotLight do Three.js](https://threejs.org/docs/pages/SpotLight.html).
