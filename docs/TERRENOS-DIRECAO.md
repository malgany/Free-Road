# Terrenos e direção — 27/10/2026

Grama, mata e terra usavam o mesmo plano em y=0,012. Agora o neutro termina em zero, grama em 0,012 m, mata em 0,024 m, terra em 0,036 m e água em 0,04 m. Ruas e marcações mantêm suas alturas. A posição vertical/física do carro não muda.

Aceleração reduzida de 11 para 5,5 m/s². Tetos de velocidade: asfalto 199; neutro/terra 99,5; grama 79,6; mata 59,7 km/h. A transição desacelera a 12,1 m/s² até o novo limite, evitando corte instantâneo. Ré mantém seu limite inferior de 32,4 km/h, com luz vermelha conforme preferência do jogo.

Mata produz faixa de 2,05 m; grama conserva pneus separados. Nome da rua centralizado no minimapa em três tamanhos de tela. Guia WASD, C, scroll e Esc com teclas em relevo aparece por 2 s na primeira partida; não captura cliques e usa uma única preferência no localStorage.

Cache IndexedDB: até 32 regiões, 32 MiB estimados pelo JSON UTF-8, 30 dias; até quatro recortes em memória. Entradas maiores que o orçamento não persistem. Poda na abertura e em cada gravação, inclusive para caches da versão anterior. Overhead interno do navegador não está incluído na estimativa. Limpeza manual permanece em Configurações → Mapa.

Validação: 55 testes, incluindo dobro do tempo de aceleração, tetos/transições por terreno, hierarquia dos planos, largura do rastro e descarte por tamanho/idade/quantidade. Build TypeScript/Vite aprovado. Conferência via HTTP com fixture temporária na pasta dist: mata sobre grama, partida na grama, passagem para mata e ré; sem erros no console. A fixture foi removida pelo build final e não integra a distribuição. Evidências: controles-iniciais.png e terrenos-ensaio.png.
