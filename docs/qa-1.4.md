# Verificação 1.4 — navegação e exploração a pé

- Setas direcionais substituem as bolinhas do minimapa. Uma seta 3D orienta a rota acima do cenário; texto reduzido ao recurso/distância. Cartões de missão usam nome, local e recompensa curta.
- O marcador flutuante foi removido. A zona de chegada é um disco translúcido de 13,5 m com contorno colorido, respeitando a faixa de interação de 14 m. A revisão visual levou a aumentar o contraste e corrigir a ordem de desenho do contorno.
- F sai somente com o carro parado e procura uma posição lateral livre. E prioriza coleta próxima e entrada no carro. WASD, mouse, pulo, agachamento, munição, cadência, recarga e tiros contra infectados foram integrados.
- A física a pé usa círculo de colisão, subdivisão de movimento e deslizamento por eixo; não aplica a caixa de colisão do carro ao jogador. Caminhar não consome combustível, não atropela infectados e não salva a posição do jogador sobre a posição do carro.
- Raios de tiro são limitados pela geometria do cenário e pelo carro. São escolhidos os infectados visíveis mais próximos; a mira vertical distingue cabeça/corpo. A quantidade de armas, munição e identificadores de coleta é limitada.
- Inventário é validado e salvo no slot IndexedDB existente. No ensaio de navegador, uma carabina foi recolhida com E, disparou de 30 para 29, e continuou com 29/60 após voltar ao início, recarregar a página e continuar a expedição.
- No navegador: sair, andar, recarregar (pistola 11/48 → 12/47), agachar, voltar ao carro, escolher combustível e dirigir até a área de coleta. A interação E permaneceu disponível no destino.
- A captura do mouse no navegador embutido retornou “root document ... not valid for pointer lock”. A alternativa de tiro com cursor livre e rotação segurando o botão direito foi incluída. O disparo foi verificado com essa alternativa; a rotação e seus limites também têm teste automatizado. Pointer Lock depende de gesto e suporte do navegador.
- 90 testes passaram, incluindo nove testes de movimento a pé, saída segura, gravidade, agachamento, arma, raios de tiro, coleta e inventário. TypeScript e build de produção passaram; HTML portátil preservado. Não houve benchmark novo de FPS nesta revisão, portanto a medição da versão 1.3 não representa garantia para o novo modo.

Limites: armas e mãos são modelos procedurais estilizados; casas não têm interiores; não há animações de corpo completo do jogador, multiplayer nem controles FPS completos por toque. Retomar uma partida coloca o jogador no carro salvo, com inventário preservado.

Revisão final: coleta de combustível a pé completou e mudou o objetivo para voltar ao abrigo. Contorno da zona e arma conferidos em docs/chegada-1.4.png e docs/fps-1.4.png; console sem erros. A checagem de espaços aponta apenas código incorporado de Tone.js no HTML portátil gerado.
