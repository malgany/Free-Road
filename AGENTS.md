# Free Road — instruções para alterações

## Feedback sonoro obrigatório
Toda alteração de comportamento, interação, UI ou mecânica deve incluir a revisão do feedback sonoro correspondente. Reutilize e expanda um evento existente quando ele já representar a ação; se a ação for nova ou específica, adicione um som equivalente como comportamento padrão. Não duplique sons apenas porque uma ação tem botão e atalho. Em correções internas/documentação, preserve e valide o contrato sonoro da função afetada, sem inventar sons sem evento perceptível.

- Centralize áudio em src/audio.ts e regras determinísticas em src/audio-model.ts; use Tone.js e o mixer existente.
- Respeite desbloqueio por gesto do usuário, volume, mudo, pausa, aba oculta e falhas de Web Audio. Falha de som nunca impede jogar.
- Sons contínuos usam nós reutilizados e transições suaves. Eventos repetidos têm limites de frequência; impactos precisam de intensidade física, não só contato.
- Novos efeitos devem coexistir com sons visuais equivalentes, sem depender exclusivamente da audição para comunicar informação importante.
- Atualize documentação e cobertura dos eventos. Valide os comportamentos afetados, execute npm test e npm run build e confira no navegador quando a alteração for visual ou sonora.
- Preserve a versão portátil Jogar.html e avisos de licença das dependências. Evite arquivos de áudio externos necessários para jogar offline.
