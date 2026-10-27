# Atualização de localização e interface

> Registro da versão anterior. Para as regras atuais de cache, câmera e expansão, consulte [a atualização de câmera e mundo](ATUALIZACAO-CAMERA-MUNDO.md).

Data: 27 de outubro de 2026. O jogo foi alterado para carregar um mapa em torno da posição do jogador e apresentar uma interface sobre o cenário, sem cabeçalho ou rodapé. O minimapa é redondo e a atribuição do OpenStreetMap permanece junto dele.

O build foi concluído e os 27 testes automatizados passaram, incluindo geolocalização com posições simuladas, recusa de permissão, falta de rede, cancelamento, limites do recorte, adaptação de área densa, relações incompletas e spawn próximo. Os testes anteriores de direção e geometria continuam disponíveis.

O fluxo completo de consulta foi exercitado pela interface no navegador usando coordenadas públicas de teste **-15.601, -56.097**, diferentes do mapa de exemplo. O recorte foi obtido da API do OpenStreetMap, o jogo selecionou uma via próxima e o carro foi dirigido. Essa coordenada é apenas um ponto público de teste; não representa uma posição do usuário obtida pelo navegador. Também foi testado o cancelamento durante a busca, com retorno ao mapa anterior.

A permissão de localização real depende do navegador e do sistema operacional do usuário. A coleta da localização real não foi executada durante a validação, para não acessar ou transmitir a posição pessoal do usuário. A alternativa manual usa o mesmo processo de aquisição e geração de mapa.

O HTML portátil foi verificado por HTTP em localhost. A política do navegador integrado impede automatizar a abertura de `file://`; portanto, a permissão de localização ao abrir o arquivo por duplo clique não foi testada nesse ambiente. Quando necessário, executar `npm start` fornece uma origem local adequada para a permissão do navegador. O mapa dinâmico requer internet; os mapas incluídos continuam disponíveis offline.
