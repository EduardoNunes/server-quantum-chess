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

## 📐 2. Espaço Vetorial e Economia de Turnos

As partidas são processadas em uma matriz quadridimensional discreta:
* **Eixo $X$:** Colunas do tabuleiro ($0$ a $7$).
* **Eixo $Y$:** Fileiras do tabuleiro ($0$ a $7$).
* **Eixo $Z$:** Índice da Dimensão/Tabuleiro ativo ($0$ a $7$, suportando de 1 a 8 dimensões).

### Economia de Ações
* Cada rodada concede ao jogador um teto de pontos de energia (configuração padrão: **2 ações por rodada**).
* Deslocamentos locais ou saltos interdimensionais puros gastam rigorosamente **1 ação**. O turno é transferido quando o contador atinge zero.

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
  * **Promoção Quântica para Rei:** Se o peão alcançar a última fileira do tabuleiro efetuando um salto para a dimensão superior, ele se transforma automaticamente em um **Rei Secundário**. Este é o único movimento de uma peça não-Rei autorizado a saltar para dentro de uma dimensão inativa, reativando-a.

### 🧱 A Torre Quântica (`RookValidator`)
* **Geometria Retilínea:** Move-se em linhas retas puras pelo hiperespaço ($\Delta x > 0, \Delta y = 0, \Delta z = 0$ ou equivalentes). Pode cruzar várias dimensões em um único lance, mas não pula peças.

### 💎 O Bispo Quântico (`BishopValidator`)
* **Geometria de Diagonais:** Exige proporção diagonal e hiperdiagonal exata entre os eixos alterados. Pode cruzar várias dimensões em um único lance, mas não pula peças.

### 🐎 O Cavalo Quântico (`KnightValidator`)
* **A Regra do "L" Quadridimensional:** Faz o movimento de hiper-L. Move 2 blocos em um eixo e 1 bloco em outro, mantendo o terceiro estático. É a **única peça imune a colisões**, ignorando obstáculos.

### 👑 A Rainha Quântica (`QueenValidator`)
* **Composição de Poder:** Soma as direções livres da Torre e do Bispo, respeitando as colisões no trajeto.

### 👑 O Rei (Master e Secundário) (`KingValidator`)
* **Regra Universal de Movimento:** O rei master não tem movimento diferente do rei secundário. Todos os reis se movem na mesma geometria da Rainha, mas estritamente limitados a **1 casa de distância por vez** em qualquer eixo.
* **A Restrição do Xeque Quântico:** Qualquer rei em Xeque não pode saltar dimensão até que saia do xeque.
* **O Roque Tradicional:** Funciona nos moldes clássicos entre um Rei e uma Torre da mesma dimensão que não tenham se movido, não está em xeque e não tem casa central ameaçada.
* **O Roque Temporal (Inovação Quântica):** O rei pode fazer hook temporal com outro rei, mas somente se ambos não tiverem sido movidos previamente, e se ambos não estiverem em posição de xeque.
* **Salto de Reativação:** O Rei (e o Peão Quântico em promoção final) são as **únicas** peças capazes de realizar um salto com destino a uma dimensão inativa, "acordando-a".

---

## ⚠️ 4. Ameaças: As Leis do Xeque

* **Rei Master em Xeque:** Rei master em xeque obriga o jogador a tirar-lo do xeque não podendo fazer outra jogada e essa jogada não pode ser salto dimensional. Rei master não pode se colocar em xeque.
* **Rei Secundário em Xeque:** Rei secundário em xeque não tem obrigação de sair do xeque pois pode ser capturado e pode se colocar em xeque se for da vontade do jogador.

---

## 💥 5. Colapso Dimensional e Condições de Vitória

* **Inatividade Dimensional Unilateral (Ausência do Rei):** Se o rei for tomado ou sair da dimensão dele deixando a dimensão sem rei, essa dimensão fica inativa para esse jogador não podendo mover as peças, passar peças de outra dimensão por ela e nem pular para ela.
  * *Restauração:* Essa dimensão permanecerá morta para aquele jogador **até que ele consiga transportar outro Rei** (ou promover um Peão Quântico a Rei) para dentro dela, o que anula a penalidade e reativa todas as peças aliadas que estavam congeladas.
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