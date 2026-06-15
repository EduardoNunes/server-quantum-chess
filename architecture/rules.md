# 🌌 Documentação Técnica de Regras: Xadrez Quântico

Esta documentação especifica os contratos matemáticos, lógicos e geométricos que regem o motor autoritativo do **Xadrez Quântico**. O motor opera sob o padrão de **Servidor Autoritativo**, onde as intenções de lances do cliente são validadas individualmente no backend.

---

## 👑 1. O Turno 0 (Fase de Consagração do Rei Master)

O ciclo de vida de qualquer partida inicia-se obrigatoriamente no **Turno 0**, uma fase quântica de preparação.

* **Estado Inicial:** Toda nova partida define os ponteiros de coordenadas `whiteMasterKing` e `blackMasterKing` como `null`.
* **Bloqueio de Peças Comuns:** Nenhuma peça regular pode realizar movimentos no hiperespaço durante este turno.
* **Ação Única Válida:** Cada jogador deve submeter um evento de rede único clicando sobre um de seus Reis presentes no multiverso.
* **Persistência e Gatilho:** O jogo só libera os lances tradicionais quando ambos os lados possuírem seus respectivos Reis Masters consagrados.

---

## 📐 2. Espaço Vetorial e Economia de Turnos (Modalidades de Partida)

As partidas são processadas em uma matriz quadridimensional discreta baseada nos eixos $(X, Y, Z)$:
* **Eixo $X$:** Colunas do tabuleiro ($0$ a $7$).
* **Eixo $Y$:** Fileiras do tabuleiro ($0$ a $7$).
* **Eixo $Z$:** Índice da Dimensão/Tabuleiro ativo ($0$ a $7$, mapeado logicamente no jogo como Dimensão $1$ até Dimensão $N$).

No ato de criação do jogo (via painel de parâmetros do menu inicial), o criador define a estrutura do espaço-tempo escolhendo a quantidade de tabuleiros simultâneos, suportando estritamente **de 2 a 8 dimensões** em paralelo.

### ⚡ Economia de Energia e Modos de Turno
A quantidade de pontos de energia (jogadas autorizadas) que um jogador pode gastar em seu turno, bem como a ordem geográfica de execução dos lances, é determinada pela **Modalidade de Partida** selecionada:

1. **Modalidade Clássica (1 Jogada por Turno):** Cada rodada concede ao jogador ativo rigorosamente **1 única ação**. Deslocamentos locais ou saltos interdimensionais encerram o turno imediatamente em qualquer tabuleiro, transferindo o ponteiro para o adversário.
2. **Modalidade Dinâmica (Quantidade de Jogadas por Reis Vivos + Fluxo Sequencial):** A energia do jogador é recalculada no início de cada turno baseado no seu saldo de monarcas sobreviventes, operando sob uma **Janela de Resolução Temporal Obrigatória**:
   * *Cálculo de Ações:* O jogador ganha exatamente **1 ponto de ação para cada Rei (seja Master ou Secundário) de sua cor que estiver atualmente vivo e ativo** no multiverso. Ele reterá no mínimo 1 ação por turno enquanto seu Rei Master estiver vivo.
   * *O Fluxo Obrigatório ($1 \rightarrow D$):* Os movimentos **não podem** ser feitos em qualquer ordem livre. O jogador é obrigado a desferir as suas jogadas seguindo a ordem estrita das fendas, partindo da **Dimensão 1 em direção à Dimensão D**. 
   * *O Salto de Tabuleiro Morto/Vazio:* O jogador executa a sua jogada na Dimensão corrente. Caso uma dimensão na fila sequencial **não possua um Rei da cor do jogador ativo** (seja porque o Rei mudou de dimensão ou foi capturado), a janela de oportunidade daquele tabuleiro expira imediatamente. A jogada é **automaticamente passada para a dimensão seguinte** que contiver um Rei vivo da sua cor.
   * *Transição de Turno:* O consumo de cada lance local ou salto dimensional deduz **1 ação** do contador global. O turno é encerrado e transferido para o oponente assim que o contador dinâmico de ações remanescentes atingir zero ou após a onda sequencial ultrapassar a última dimensão ativa configurada.

---

## ♟️ 3. Regras de Movimentação e Filtros de Colisão

O movimento exige a validação do vetor de deslocamento calculado por: 

$$\Delta x = |x_{\text{destino}} - x_{\text{origem}}|$$
$$\Delta y = y_{\text{destino}} - y_{\text{origem}}$$
$$\Delta z = z_{\text{destino}} - z_{\text{origem}}$$

### ⚔️ O Peão Quântico (`PawnValidator`)
O peão atua como um vetor assimétrico, possuindo mecânicas exclusivas de transição e promoção nas fendas interdimensionais.

* **Movimento Clássico ($2D \ / \ \Delta z = 0$):**
  * Avança estritamente para frente em linhas verticais. É permitido o avanço duplo inicial se as casas estiverem desimpedidas.
  * A captura ocorre na diagonal curta tradicional contra alvos inimigos.
  * **En Passant Tradicional:** A regra clássica de *en passant* é mantida para lances no mesmo plano.
  * **Promoção Tradicional:** Ao alcançar a última fileira de sua respectiva dimensão no plano $2D$, o peão pode ser promovido normalmente. **Esta promoção tradicional não gera paradoxos na dimensão atual** (é permitido acumular Rainhas, Torres, Bispos e Cavalos oriundos de promoção sem aniquilar peças aliadas).
* **Movimento Multidimensional ($\Delta z \neq 0$):**
  * **Avanço Quântico Direcional:** O Peão só pode trafegar no eixo Z seguindo o sentido de ascensão de sua cor (Brancos $\Delta z = +1$, Pretos $\Delta z = -1$).
  * **Passo Frontal Dimensional:** O peão **não** realiza salto vertical estático para a casa exata de cima ($\Delta x = 0, \Delta y = 0$). Ele deve obrigatoriamente saltar para a **casa diretamente à frente na dimensão superior** ($\Delta x = 0$, $\Delta y = \pm 1$ dependendo da cor, $\Delta z = \pm 1$).
  * **Captura Quântica Frontal:** O abate no hiperespaço ocorre nas **diagonais à frente na dimensão superior** ($|\Delta x| = 1, \Delta y = \pm 1, \Delta z = \pm 1$).
  * **En Passant Dimensional:** Um ataque tático de fenda. Consiste na captura de um peão da dimensão superior que fizer o movimento de duas casas clássicas e, nesse trajeto, passar pela "casa quântica" atacada por um peão inimigo na dimensão inferior.
  * **Promoção Quântica para Rei:** Se o peão alcançar a última fileira do tabuleiro efetuando um salto para a dimensão superior, ele se transforma automaticamente em um **Rei Secundário**. Este é o único movimento de uma peça não-Rei autorizado a saltar para dentro de uma dimensão inativa, reativando-a **(desde que a dimensão de destino ainda possua ao menos uma peça aliada, evitando a morte definitiva do tabuleiro)**.

### 🧱 A Torre Quântica (`RookValidator`)
* **Geometria Retilínea:** Move-se em linhas retas puras pelo hiperespaço ($\Delta x > 0, \Delta y = 0, \Delta z = 0$ ou equivalentes). Pode cruzar várias dimensões em um único lance, mas não pula peças.

### 💎 O Bispo Quântico (`BishopValidator`)
* **Geometria de Diagonais:** Exige proporção diagonal e hiperdiagonal exata entre os eixos alterados. Pode cruzar várias dimensões em um único lance, mas não pula peças.

### 🐎 O Cavalo Quântico (`KnightValidator`)
* **A Regra do "L" Quadridimensional:** Faz o movimento de hiper-L. Move 2 blocos em um eixo e 1 bloco em outro, mantendo o terceiro estático. É a **única peça imune a colisões**, ignorando obstáculos.

### 👑 A Rainha Quântica (`QueenValidator`)
* **Composição de Poder:** Soma as direções livres da Torre e do Bispo, respeitando as colisões no trajeto.

### 👑 O Rei (Master e Secundário) (`KingValidator`)
O núcleo vital da estratégia interdimensional baseia-se em como os Reis operam:

* **Regra Universal de Movimento:** O rei master não tem movimento diferente do rei secundário. Todos os reis se movem na mesma geometria da Rainha, mas estritamente limitados a **1 casa de distância por vez** em qualquer eixo.
* **A Restrição do Xeque Quântico:** Qualquer rei em Xeque não pode saltar dimensão até que saia do xeque.
* **O Roque Tradicional:** Funciona nos moldes clássicos entre um Rei e uma Torre da mesma dimensão que não tenham se movido, não está em xeque e não tem casa central ameaçada.
* **O Roque Temporal (Inovação Quântica):** O rei pode fazer hook temporal com outro rei, mas somente se ambos não tiverem sido movidos previamente, e se ambos não estiverem em posição de xeque.
* **Salto de Reativação:** O Rei (e o Peão Quântico em promoção final) são as **únicas** peças capazes de realizar um salto com destino a uma dimensão inativa, "acordando-a". 
* **Exceção de Morte Definitiva:** Um Rei **NÃO** pode saltar para uma dimensão inativa que **não possua mais nenhuma peça aliada**. Se um tabuleiro foi totalmente varrido do seu exército, o Rei não pode resgatá-lo sozinho.

---

## ⚠️ 4. Ameaças: As Leis do Xeque

* **Rei Master em Xeque:** Rei master em xeque obriga o jogador a tirar-lo do xeque não podendo fazer outra jogada e essa jogada não pode ser salto dimensional. Rei master não pode se colocar em xeque.
* **Rei Secundário em Xeque:** Rei secundário em xeque não tem obrigação de sair do xeque pois pode ser capturado e pode se colocar em xeque se for da vontade do jogador.

---

## 💥 5. Colapso Dimensional e Condições de Vitória

* **Inatividade Dimensional Unilateral (Ausência do Rei):** Se o rei for tomado ou sair da dimensão dele deixando a dimensão sem rei, essa dimensão fica inativa para esse jogador não podendo mover as peças, passar peças de outra dimensão por ela e nem pular para ela.
  * *Restauração:* Essa dimensão permanecerá morta para aquele jogador **até que ele consiga transportar outro Rei** (ou promover um Peão Quântico a Rei) para dentro dela, o que anula a penalidade e reativa todas as peças aliadas que estavam congeladas.
  * *Morte Definitiva da Dimensão:* A restauração só é possível se ainda existir **pelo menos uma peça aliada** "congelada" naquela dimensão. Se não restar absolutamente nenhuma peça da cor do jogador no tabuleiro afetado, a dimensão é considerada totalmente aniquilada para esse jogador até o final da partida, e o Rei perde a permissão de saltar para lá.
* **Fim de Jogo (A Queda do Master):** O jogo termina se o rei master tomar mate. A queda de um rei secundário apenas inativa a dimensão, mas a queda do Rei Master decreta o colapso absoluto do universo e a vitória do adversário.

---

## 🌪️ 6. Anomalias de Paradoxo (Colapso por Sobrecarga Dimensional)

A malha do multiverso possui limites estritos de massa para duplicatas do mesmo exército. Quando uma peça salta para uma dimensão que já atingiu o limite de habitantes daquela classe, o tecido da realidade força um **Colapso por Paradoxo**, aniquilando imediatamente uma das peças.

1. **Paradoxo de Reis:** O limite é de **1 Rei por dimensão**. Se um rei saltar para uma dimensão onde já existe outro rei aliado, o rei que *já estava lá* sofre colapso por paradoxo real e é eliminado.
   * *Exceção Soberana:* Se o rei residente na dimensão de destino for o **Rei Master**, o poder dele subjuga a anomalia. Neste caso único, o **rei secundário que saltou** é quem sofre o colapso e é destruído.
2. **Paradoxo de Rainhas:** O limite é de **1 Rainha por dimensão**. Se uma rainha saltar para uma dimensão que já possui uma ou mais rainhas aliadas, a rainha residente que estiver fisicamente **mais próxima** da nova rainha é colapsada por paradoxo de rainhas sendo aniquilada.
3. **Paradoxo de Torres:** O limite é de **2 Torres por dimensão**. Se uma torre saltar para uma dimensão que já conta com 2 ou mais torres aliadas, a torre residente que estiver fisicamente **mais próxima** da nova torre é colapsada por paradoxo de torres.
4. **Paradoxo de Cavalos:** O limite é de **2 Cavalos por dimensão**. Ao saltar para uma dimensão com 2 ou mais cavalos aliados, o cavalo residente que estiver fisicamente **mais próximo** do novo cavalo é colapsado por paradoxo de cavalo.
5. **Paradoxo de Bispos:** O limite é de **1 Bispo por cor de casa por dimensão**. Se um bispo saltar para uma dimensão onde já existe um ou mais bispos aliados controlando a **mesma cor de casa** (clara ou escura), o bispo residente daquela cor mais próximo fisicamente do novo bispo é colapsado por paradoxo de bispos.
6. **Paradoxo de Peões:** O limite é de **8 Peões por dimensão**. Se um peão realizar um salto direcional multidimensional para um tabuleiro onde já existam 8 peões aliados, o peão residente que estiver **mais próximo** do novo peão sofre o colapso por paradoxo de peões. Promoção tradicional de peão não gera paradoxo podendo adicionar qualquer peça aliada sem colapsar aliadas naquela dimensão.
7. **Paradoxo da Promoção a Rei:** O salto de um peão que se promove a Rei na dimensão superior não ativa o Paradoxo de Peões. Contudo, ao materializar-se como Rei Secundário, se já houver um Rei residente na dimensão, o rei pré-existente será **colapsado por paradoxo de promoção a rei** (salvo se for o Rei Master, conforme a Exceção Soberana da Regra 1).

---

## 🤝 7. Condições de Empate Quântico (Draw)

O motor autoritativo declarará o encerramento prematuro da partida em estado de empate sempre que o multiverso atingir um impasse matemático ou um loop lógico intransponível.

## 🤝 7. Condições de Empate Quântico (Draw)

O motor autoritativo declarará o encerramento prematuro da partida em estado de empate sempre que o multiverso atingir um impasse matemático verificado ativamente pela engine.

### 7.1. Empates por Insuficiência Material
Ocorre quando o inventário de peças ativas de um ou de ambos os jogadores é incapaz de forçar um xeque-mate. 

* **O Vazio Absoluto / A Marcha dos Zumbis:** Ocorre quando todas as peças restantes e efetivamente ativas de ambos os jogadores no multiverso são estritamente **Reis** (independentemente de quantos sejam ou se são Masters/Secundários). Como o Paradoxo de Reis impede o agrupamento de monarcas na mesma dimensão, e a velocidade de perseguição é igual para todos (1 casa), decreta-se o empate imediato.
  * *Implementação:* Verificado no backend quando todo o array global resulta em `p.type === 'KING'`.
* **A Caçada Inútil:** Ocorre quando um lado possui apenas o Rei (Master) isolado, e o adversário possui apenas o **Rei + 1 Cavalo** ou **1 Bispo**. Trata-se de uma vantagem material de exatas 2 peças contra 1 que é matematicamente incapaz de forçar um xeque-mate no plano 2D.

### 7.2. Empates por Bloqueio e Anomalias Estruturais
Cenários gerados por limitações físicas e eventos destrutivos da malha 4D.

* **Prisão Dimensional Intransponível (Fratura do Multiverso):** Se um jogador possui material suficiente para dar xeque-mate (ex: Rainhas e Torres ativas), mas essas peças estão ilhadas em uma dimensão bloqueada por "Muros Quânticos" (dimensões com *Morte Definitiva*, onde aquele exército não possui mais nenhuma peça para usá-las como ponte interdimensional), essa frota inteira é ignorada pela engine. Se o material restante com acesso *efetivo* ao Rei Master inimigo se enquadrar nas regras de Insuficiência Material (7.1), decreta-se o empate por bloqueio físico irreversível.
  * *Implementação:* Rastreado ativamente pela função `getEffectiveMatingMaterial`, que cessa a contabilização de peças ao esbarrar em uma barreira dimensional morta.
* **Aniquilação Mútua por Paradoxo (Indireto):** Se um ou mais jogadores executam saltos dimensionais que acionam paradoxos na malha (excedendo os limites da Seção 6), e o evento de *COLLAPSE* (remoção da peça do grid) desintegra o material necessário para um mate viável, o motor recalcula a matriz final limpa. Se restarem apenas materiais insuficientes em campo livre, o jogo empata imediatamente após o processamento do paradoxo.

### 7.3. Empates Universais de Sistema
Garantias lógicas codificadas para barrar partidas infinitas.

* **Rei Afogado Quântico (Stalemate):** No turno do jogador ativo, o seu Rei Master **não se encontra em estado de xeque**, mas o utilizador não dispõe de nenhum movimento legal possível com nenhuma peça.
* **Paradoxo de Zeno (Tríplice Repetição):** Se a configuração exata do multiverso (posição 4D, dimensões, roques) se repetir de forma idêntica por 3 vezes.
* **Exaustão de Energia:** Se forem executadas 50 jogadas consecutivas por ambos os lados sem que nenhum peão mude de casa/dimensão e sem que ocorra nenhuma captura/eliminação paradoxal.