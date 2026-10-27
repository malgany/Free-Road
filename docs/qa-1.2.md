# Free Road 1.2 — verificação de entrega

- Testes determinísticos: terrenos exclusivos e duplicatas; rotas por nível; coleta, entrega e economia; oficina, resgate, save inválido; combustível após streaming; impacto varrido com infectados; limites de atores/chuva; APIs e cache; áudio. Suites anteriores de física, água, câmera, mapa e descarte de cena mantidas.
- Navegador local: missão de combustível completa em Davis com controles reais, 28 peças recebidas; reparo gastou 12 peças; recarregar e continuar preservou 16 peças, entrega, combustível, integridade e relógio. Sem erros de console nesse percurso.
- Cenário específico de regressão: spawn junto à grama; polígonos de grama duplicados e mata parcialmente sobreposta. Travessia em terceira pessoa mostrou superfícies sólidas e classificação correta. Árvores próximas revelaram obstrução, corrigida com espaçamento e recorte visual progressivo próximo do carro.
- Desempenho observado no navegador local, percurso reproduzível de 60 segundos em Davis, câmera próxima e iluminação noturna: 60,0 fps médios, p95 16,8 ms. Medição desta máquina, não garantia para outros dispositivos. Efeitos reduzidos continuam disponíveis.
- Open-Meteo: consulta real do mapa público de exemplo respondeu céu aberto / 15 °C. Wikipédia: API respondeu `cirrussearch-too-busy-error`; UI mostrou indisponibilidade sem interromper o jogo. Caminhos de resposta válida e cache também cobertos com respostas controladas nos testes.
- Fontes externas são opcionais. GPS só é pedido pela ação explícita do jogador. Não foram usadas coordenadas pessoais na verificação.

As missões e infectados são uma primeira implementação jogável. A IA evita obstáculos próximos; não faz planejamento global. Edifícios, calçadas, vegetação e pontos de recurso substitutos são representações ilustrativas. Túneis e redes viárias empilhadas continuam fora do escopo do terreno plano.
