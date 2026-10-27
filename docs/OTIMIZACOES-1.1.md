# Free Road 1.1 — configuração e desempenho

Validação de 27/10/2026. Os arquivos ACEITE.md e ATUALIZACAO-* documentam versões anteriores.

## Alterações

Configurações na pausa, em cinco abas; sensibilidade com padrão de 100%, altura aérea de 105 m e restauração. C percorre as quatro câmeras; X centraliza o olhar. Ortográfica fixa com transição magnética pelo scroll. HUD de instruções removido, relógio à esquerda, nomes de rua sobre o minimapa e anúncios opcionais de bairro.

Fachadas usam iluminação Lambert com cores por vértice e não recebem sombras projetadas, eliminando a acne de auto-sombreamento vista no print. Continuam projetando sombras no chão. Tetos duplicados e contornos extras foram removidos. Objetos estáticos do carro compartilham malhas por material. Apenas um farol calcula sombra e só à noite; sombra solar atualiza a 20 Hz em uma textura de 1024².

Importação e consulta de mapas em Worker inline (compatível com o pacote portátil); montagem de cena em lotes com devolução da execução à animação. Troca atômica só em posição livre. Geometrias e materiais da janela antiga são descartados, setores de 128 m distantes são ocultados e há índice espacial para vias e terrenos. Minimap usa textura de 768², amostra posição interpolada a 30 Hz e conserva até 400 pontos de trilha.

Floresta, wood, scrub e heath recebem verde escuro. Edifícios e building:part entram nos novos recortes. Quando o OSM praticamente não possui edifícios, até 48 casas ilustrativas podem preencher ruas urbanas, sem ocupar vias, água ou vegetação mapeadas. Nomes de bairro vêm de place e addr:suburb/district; são aproximações locais, sem reverse geocoding externo.

## Evidências

- 50 testes aprovados, incluindo sensibilidade, ciclo de câmeras/ortográfica, relógio, vegetação, cenários ilustrativos, nomes estáveis, descarte da cena anterior e cancelamento de montagem.
- Build TypeScript/Vite aprovado; Jogar.html regenerado com Worker inline.
- UI: sensibilidade alterada de 100% para 180% e restaurada para 100%; menu/abas/atalhos inspecionados; fachadas verificadas visualmente sem as faixas do print.
- Percurso de 0,87 km com expansão ativa: diagnóstico observou 60 fps, 49 chamadas de desenho e 12.751 triângulos naquele quadro. A versão anterior teve 154 chamadas em outro trecho. Isso é uma observação funcional, não um benchmark controlado nem garantia em outros computadores.
- Sem consulta à localização pessoal: testes usaram Davis, a amostra pública.

Limitações: a GPU ainda depende do hardware; falhas de rede podem interromper a expansão na borda. Nomes e cobertura natural dependem do OSM. Casas de preenchimento são ilustrativas. Fachadas não recebem sombras de outros objetos; a escolha mantém a leitura sólida e reduz custo. O cache muda de versão para renovar recortes sem vegetação/nomes.
