const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
var uniqid = require('uniqid');
const GameService = require('./services/game.service');

// ---------------------------------------------------
// -------- CONSTANTS AND GLOBAL VARIABLES -----------
// ---------------------------------------------------
let games = [];
let queue = [];

// ------------------------------------
// -------- EMITTER METHODS -----------
// ------------------------------------

const updateClientsViewTimers = (game) => {
  game.player1Socket.emit('game.timer', GameService.send.forPlayer.gameTimer('player:1', game.gameState));
  if (!game.vsbot)
    game.player2Socket.emit('game.timer', GameService.send.forPlayer.gameTimer('player:2', game.gameState));
};

const updateClientsViewDecks = (game) => {
  setTimeout(() => {
    game.player1Socket.emit('game.deck.view-state', GameService.send.forPlayer.deckViewState('player:1', game.gameState));
    if (!game.vsbot)
      game.player2Socket.emit('game.deck.view-state', GameService.send.forPlayer.deckViewState('player:2', game.gameState));
  }, 200);
};

const updateClientsViewChoices = (game) => {
  setTimeout(() => {
    game.player1Socket.emit('game.choices.view-state', GameService.send.forPlayer.choicesViewState('player:1', game.gameState));
    if (!game.vsbot)
      game.player2Socket.emit('game.choices.view-state', GameService.send.forPlayer.choicesViewState('player:2', game.gameState));
  }, 200);
}

const updateClientsViewGrid = (game) => {
  setTimeout(() => {
    game.player1Socket.emit('game.grid.view-state', GameService.send.forPlayer.gridViewState('player:1', game.gameState));
    if (!game.vsbot)
      game.player2Socket.emit('game.grid.view-state', GameService.send.forPlayer.gridViewState('player:2', game.gameState));
  }, 200)
}

// ---------------------------------
// -------- GAME METHODS -----------
// ---------------------------------

const createGame = (player1Socket, player2Socket) => {

  // init objet (game) with this first level of structure:
  // - gameState : { .. evolutive object .. }
  // - idGame : just in case ;)
  // - player1Socket: socket instance key "joueur:1"
  // - player2Socket: socket instance key "joueur:2"
  const newGame = GameService.init.gameState();
  newGame['idGame'] = uniqid();
  newGame['player1Socket'] = player1Socket;
  newGame['player2Socket'] = player2Socket;

  // push game into 'games' global array
  games.push(newGame);

  const gameIndex = GameService.utils.findGameIndexById(games, newGame.idGame);

  // just notifying screens that game is starting
  games[gameIndex].player1Socket.emit('game.start', GameService.send.forPlayer.viewGameState('player:1', games[gameIndex]));
  if (!games[gameIndex].gameState.vsbot)
    games[gameIndex].player2Socket.emit('game.start', GameService.send.forPlayer.viewGameState('player:2', games[gameIndex]));

  // we update views
  updateClientsViewTimers(games[gameIndex]);
  updateClientsViewDecks(games[gameIndex]);
  updateClientsViewGrid(games[gameIndex]);

  // timer every second
  const gameInterval = setInterval(() => {

    // timer variable decreased
    games[gameIndex].gameState.timer--;

    // emit timer to both clients every seconds
    updateClientsViewTimers(games[gameIndex]);

    // if timer is down to 0, we end turn
    if (games[gameIndex].gameState.timer === 0) {

      // switch currentTurn variable
      games[gameIndex].gameState.currentTurn = games[gameIndex].gameState.currentTurn === 'player:1' ? 'player:2' : 'player:1';

      // reset timer
      games[gameIndex].gameState.timer = GameService.timer.getTurnDuration();

      // reset deck / choices / grid states
      games[gameIndex].gameState.deck = GameService.init.deck();
      games[gameIndex].gameState.choices = GameService.init.choices();
      games[gameIndex].gameState.grid = GameService.grid.resetcanBeCheckedCells(games[gameIndex].gameState.grid);

      // reset views also
      updateClientsViewTimers(games[gameIndex]);
      updateClientsViewDecks(games[gameIndex]);
      updateClientsViewChoices(games[gameIndex]);
      updateClientsViewGrid(games[gameIndex]);
    }

  }, 1000);

  // remove intervals at deconnection
  player1Socket.on('disconnect', () => {
    clearInterval(gameInterval);
  });

  if (player2Socket) {
    player2Socket.on('disconnect', () => {
      clearInterval(gameInterval);
    });
  }

};

const createGameVsBot = (playerSocket) => {
  const newGame = GameService.init.gameStateBot();
  newGame['idGame'] = uniqid();
  newGame['player1Socket'] = playerSocket;
  newGame['player2Socket'] = createBotSocket();

  games.push(newGame);

  const gameIndex = GameService.utils.findGameIndexById(games, newGame.idGame);

  games[gameIndex].player1Socket.emit('botGame.start', GameService.send.forPlayer.viewGameState('player:1', games[gameIndex]));
  if (!games[gameIndex].gameState.vsbot)
    games[gameIndex].player2Socket.emit('botGame.start', GameService.send.forPlayer.viewGameState('player:2', games[gameIndex]));

  const gameInterval = setInterval(() => {
    const currentGame = games[gameIndex];

    currentGame.gameState.timer--;

    updateClientsViewTimers(currentGame);

    if (currentGame.gameState.timer === 0) {
      currentGame.gameState.currentTurn = currentGame.gameState.currentTurn === 'player:1' ? 'player:2' : 'player:1';

      if (currentGame.gameState.currentTurn === 'player:1')
        currentGame.gameState.timer = GameService.timer.getTurnDuration();
      else
        currentGame.gameState.timer = 4;

      currentGame.gameState.deck = GameService.init.deck();
      currentGame.gameState.choices = GameService.init.choices();
      currentGame.gameState.grid = GameService.grid.resetcanBeCheckedCells(currentGame.gameState.grid);


      if (currentGame.gameState.currentTurn === 'player:2') {
        const botChoice = makeBotPlay(currentGame.gameState); // simulate bot's choice

        handleBotChoice(botChoice, currentGame); // handle the bot's choice
        // bot score

        const playerScore = GameService.grid.checkAndScoreLines(games[gameIndex].gameState.grid, games[gameIndex].gameState.currentTurn);

        games[gameIndex].gameState.player2Score = playerScore.score;

        games[gameIndex].player1Socket.emit('game.score', GameService.send.forPlayer.gameScore('player:1', games[gameIndex].gameState));

        if (playerScore.victory) {
          if (!playerScore.vainqueur) {
            if (games[gameIndex].gameState.player1Score > games[gameIndex].gameState.player2Score)
              playerScore.vainqueur = 'player:1';
            else if (games[gameIndex].gameState.player1Score < games[gameIndex].gameState.player2Score)
              playerScore.vainqueur = 'player:2';
            else
              playerScore.vainqueur = 'égalité';
          }
          games[gameIndex].player1Socket.emit("botGame.end", { vainqueur: playerScore.vainqueur, player1Score: games[gameIndex].gameState.player1Score, player2Score: games[gameIndex].gameState.player2Score });
        }

      }

    }

    updateClientsViewTimers(currentGame);
    updateClientsViewDecks(currentGame);
    updateClientsViewChoices(currentGame);
    updateClientsViewGrid(currentGame);
  }, 1000);

  playerSocket.on('disconnect', () => {
    clearInterval(gameInterval);
  });

};

const makeBotPlay = (gameState) => {

  gameState.deck.dices = GameService.dices.roll(gameState.deck.dices);

  // Récupérer les dés actuels du jeu
  const { dices } = gameState.deck;

  // Initialiser le tableau pour compter le nombre de dés pour chaque valeur
  const diceCounts = dices.reduce((acc, dice) => {
    // Récupérer la valeur du dé
    const diceValue = parseInt(dice.value);

    // Incrémenter le compteur de dés pour cette valeur
    acc[diceValue]++;

    return acc;
  }, [0, 0, 0, 0, 0, 0, 0]); // Initialiser le tableau avec un élément nul à l'indice 0 et 0 dés pour chaque valeur de 1 à 6

  // Maintenant, diceCounts contient le nombre de dés pour chaque valeur de 1 à 6

  const isYam = diceCounts.some(count => count === 5);
  const isCarre = diceCounts.some(count => count === 4);
  const isSuite = (
    (diceCounts[1] && diceCounts[2] && diceCounts[3] && diceCounts[4] && diceCounts[5]) ||
    (diceCounts[2] && diceCounts[3] && diceCounts[4] && diceCounts[5] && diceCounts[6])
  );
  const isFull = diceCounts.some(count => count === 3) && diceCounts.some(count => count === 2);

  //Si c'est pas un sec on reroll
  if (!isYam && !isCarre && !isFull && !isSuite) {
    // on lock le brelan ou la/les paire(s)
    for (let i = 1; i <= 6; i++) {
      if (diceCounts[i] === 2 || diceCounts[i] === 3) {
        // Verrouiller les dés avec 2 ou 3 valeurs identiques
        for (let j = 0; j < gameState.deck.dices.length; j++) {
          if (parseInt(gameState.deck.dices[j].value) === i) {
            gameState.deck.dices[j].locked = true; // Verrouiller le dé
          }
        }
      }
    }
    gameState.deck.dices = GameService.dices.roll(gameState.deck.dices);

    // On recalcule diceCounts avec les nouvelles valeurs des dés
    for (let i = 0; i < 7; i++) {
      diceCounts[i] = 0;
    }
    for (let dice of gameState.deck.dices) {
      const diceValue = parseInt(dice.value);
      diceCounts[diceValue]++;
    }
    const isYam = diceCounts.some(count => count === 5);
    const isSuite = (
      (diceCounts[1] && diceCounts[2] && diceCounts[3] && diceCounts[4] && diceCounts[5]) ||
      (diceCounts[2] && diceCounts[3] && diceCounts[4] && diceCounts[5] && diceCounts[6])
    );
    const isFull = diceCounts.some(count => count === 3) && diceCounts.some(count => count === 2);

    if (!isFull && !isSuite && !isYam) {
      // on lock le carré, le brelan ou la/les paire(s)
      for (let i = 1; i <= 6; i++) {
        if (diceCounts[i] === 2 || diceCounts[i] === 3 || diceCounts[i] === 4) {
          // Verrouiller les dés avec 2 ou 3 ou 4 valeurs identiques
          for (let j = 0; j < gameState.deck.dices.length; j++) {
            if (parseInt(gameState.deck.dices[j].value) === i) {
              gameState.deck.dices[j].locked = true; // Verrouiller le dé
            }
          }
        }
      }
      //on fait le dernier lancé
      gameState.deck.dices = GameService.dices.roll(gameState.deck.dices);

    }

  }

  const availableChoices = GameService.choices.findCombinations(gameState.deck.dices);

  const filteredChoices = availableChoices.filter(choice => {
    return isCombinationAvailableInGrid(choice, gameState.grid);
  });

  // Définir l'ordre des combinaisons en fonction de leur priorité
  const combinationOrder = ['defi', 'yam', 'sec', 'moinshuit', 'carre', 'full', 'suite', 'brelan'];

  // Trier les combinaisons disponibles en fonction de l'ordre défini
  const sortedChoices = filteredChoices.sort((a, b) => {
    const indexA = combinationOrder.indexOf(a.id.split(/(\d+)/)[0]);
    const indexB = combinationOrder.indexOf(b.id.split(/(\d+)/)[0]);

    // Si l'index est le même pour les deux combinaisons, on compare les numéros
    if (indexA === indexB) {
      const numberA = parseInt(a.id.match(/\d+/)[0]);
      const numberB = parseInt(b.id.match(/\d+/)[0]);
      return numberA - numberB;
    }

    return indexA - indexB;
  });

  // Sélectionner la première combinaison dans la liste triée
  if (sortedChoices.length > 0) {
    return sortedChoices[0];
  }

  return null;
};

const handleBotChoice = (botChoice, currentGame) => {
  if (botChoice) {
    currentGame.gameState.deck.dices = GameService.dices.lockEveryDice(currentGame.gameState.deck.dices);
    currentGame.gameState.choices.idSelectedChoice = botChoice.id;

    const availableCells = currentGame.gameState.grid.flat().filter(cell => cell.id === currentGame.gameState.choices.idSelectedChoice && cell.owner === null);

    if (availableCells.length > 0) {
      const randomIndex = Math.floor(Math.random() * availableCells.length);
      const randomCell = availableCells[randomIndex];

      // Trouver rowIndex et cellIndex à partir de l'index aléatoire
      let rowIndex, cellIndex;

      currentGame.gameState.grid.forEach((row, i) => {
        row.forEach((cell, j) => {
          if (cell === randomCell) {
            rowIndex = i;
            cellIndex = j;
          }
        });
      });

      currentGame.gameState.grid = GameService.grid.selectCell(
        randomCell.id,
        rowIndex,
        cellIndex,
        currentGame.gameState.currentTurn,
        currentGame.gameState.grid
      );
    }
  }
};

const isCombinationAvailableInGrid = (combination, grid) => {
  // Parcourir la grille pour vérifier si les cases nécessaires pour la combinaison sont disponibles
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      const cell = grid[row][col];
      // Vérifier si la combinaison est réalisable dans cette case
      if (cell.id === combination.id && cell.owner === null) {
        return true; // La combinaison est disponible dans la grille
      }
    }
  }
  return false; // La combinaison n'est pas disponible dans la grille
};

const newPlayerInQueue = (socket) => {

  queue.push(socket);

  // 'queue' management
  if (queue.length >= 2) {
    const player1Socket = queue.shift();
    const player2Socket = queue.shift();
    createGame(player1Socket, player2Socket);
  }
  else {
    socket.emit('queue.added', GameService.send.forPlayer.viewQueueState());
  }
};


// Fonction pour créer un socket simulant le bot
const createBotSocket = () => {
  return {
    id: 'bot123',
    emit: (eventName, eventData) => {
      //console.log(`Bot emitted event ${eventName} with data:`, eventData);
    },
    on: (eventName, callback) => {
      // Implémentation pour ajouter un écouteur d'événement (peut être vide)
      //console.log(`Bot added listener for event ${eventName}`);
    },
    disconnect: () => {
      // Implémentation pour gérer la déconnexion du bot (peut être vide)
      console.log('Bot disconnected');
    }
  };
};

// ---------------------------------------
// -------- SOCKETS MANAGEMENT -----------
// ---------------------------------------

io.on('connection', socket => {
  console.log(`[${socket.id}] socket connected`);

  socket.on('queue.join', () => {
    console.log(`[${socket.id}] new player in queue `)
    newPlayerInQueue(socket);
  });

  socket.on('botGame.join', () => {
    console.log(`[${socket.id}] new player joining game against bot`);
    createGameVsBot(socket);  // Créer une partie contre le bot
  });

  socket.on('game.dices.roll', () => {

    const gameIndex = GameService.utils.findGameIndexBySocketId(games, socket.id);

    // if not last throw
    if (games[gameIndex].gameState.deck.rollsCounter < games[gameIndex].gameState.deck.rollsMaximum) {

      // dices management
      games[gameIndex].gameState.deck.dices = GameService.dices.roll(games[gameIndex].gameState.deck.dices);
      games[gameIndex].gameState.deck.rollsCounter++;

    }
    // if last throw
    else {

      // dices management 
      games[gameIndex].gameState.deck.dices = GameService.dices.roll(games[gameIndex].gameState.deck.dices);
      games[gameIndex].gameState.deck.rollsCounter++;
      games[gameIndex].gameState.deck.dices = GameService.dices.lockEveryDice(games[gameIndex].gameState.deck.dices);

      // temporary put timer at 5 sec to test turn switching 
      games[gameIndex].gameState.timer = 5;
    }

    // combinations management
    const dices = games[gameIndex].gameState.deck.dices;
    const isDefi = false;
    const isSec = games[gameIndex].gameState.deck.rollsCounter === 2;

    const combinations = GameService.choices.findCombinations(dices, isDefi, isSec);
    games[gameIndex].gameState.choices.availableChoices = combinations;


    // emit to views new state
    updateClientsViewDecks(games[gameIndex]);
    updateClientsViewChoices(games[gameIndex]);
  });

  socket.on('game.dices.lock', (idDice) => {

    const gameIndex = GameService.utils.findGameIndexBySocketId(games, socket.id);
    const indexDice = GameService.utils.findDiceIndexByDiceId(games[gameIndex].gameState.deck.dices, idDice);

    // reverse flag 'locked'
    games[gameIndex].gameState.deck.dices[indexDice].locked = !games[gameIndex].gameState.deck.dices[indexDice].locked;

    updateClientsViewDecks(games[gameIndex]);
  });

  socket.on('game.choices.selected', (data) => {

    // gestion des choix
    const gameIndex = GameService.utils.findGameIndexBySocketId(games, socket.id);
    games[gameIndex].gameState.choices.idSelectedChoice = data.choiceId;

    // gestion de la grid
    games[gameIndex].gameState.grid = GameService.grid.resetcanBeCheckedCells(games[gameIndex].gameState.grid);
    games[gameIndex].gameState.grid = GameService.grid.updateGridAfterSelectingChoice(data.choiceId, games[gameIndex].gameState.grid);

    updateClientsViewChoices(games[gameIndex]);
    updateClientsViewGrid(games[gameIndex]);
  });


  socket.on('game.grid.selected', (data) => {

    const gameIndex = GameService.utils.findGameIndexBySocketId(games, socket.id);

    games[gameIndex].gameState.grid = GameService.grid.resetcanBeCheckedCells(games[gameIndex].gameState.grid);
    games[gameIndex].gameState.grid = GameService.grid.selectCell(data.cellId, data.rowIndex, data.cellIndex, games[gameIndex].gameState.currentTurn, games[gameIndex].gameState.grid);



    // Here calcul score

    const playerScore = GameService.grid.checkAndScoreLines(games[gameIndex].gameState.grid, games[gameIndex].gameState.currentTurn);

    console.log(playerScore);

    if (games[gameIndex].gameState.currentTurn === 'player:1') {
      games[gameIndex].gameState.player1Score = playerScore.score;
    } else {
      games[gameIndex].gameState.player2Score = playerScore.score;
    }

    games[gameIndex].player1Socket.emit('game.score', GameService.send.forPlayer.gameScore('player:1', games[gameIndex].gameState));
    if (!games[gameIndex].gameState.vsbot)
      games[gameIndex].player2Socket.emit('game.score', GameService.send.forPlayer.gameScore('player:2', games[gameIndex].gameState));

    if (playerScore.victory) {
      if (!playerScore.vainqueur) {
        if (games[gameIndex].gameState.player1Score > games[gameIndex].gameState.player2Score)
          playerScore.vainqueur = 'player:1';
        else if (games[gameIndex].gameState.player1Score < games[gameIndex].gameState.player2Score)
          playerScore.vainqueur = 'player:2';
        else
          playerScore.vainqueur = 'égalité';
      }
      games[gameIndex].player1Socket.emit("botGame.end", { vainqueur: playerScore.vainqueur, player1Score: games[gameIndex].gameState.player1Score, player2Score: games[gameIndex].gameState.player2Score });
      if (!games[gameIndex].gameState.vsbot)
        games[gameIndex].player2Socket.emit("botGame.end", { vainqueur: playerScore.vainqueur, player1Score: games[gameIndex].gameState.player1Score, player2Score: games[gameIndex].gameState.player2Score });

    }
    else {
      games[gameIndex].gameState.currentTurn = games[gameIndex].gameState.currentTurn === 'player:1' ? 'player:2' : 'player:1';

      if (games[gameIndex].gameState.currentTurn === 'player:1')
        games[gameIndex].gameState.timer = GameService.timer.getTurnDuration();
      else {
        if (games[gameIndex].gameState.vsbot) {
          games[gameIndex].gameState.timer = 4;
        }
        else
          games[gameIndex].gameState.timer = GameService.timer.getTurnDuration();
      }

      games[gameIndex].gameState.deck = GameService.init.deck();
      games[gameIndex].gameState.choices = GameService.init.choices();

      games[gameIndex].player1Socket.emit('game.timer', GameService.send.forPlayer.gameTimer('player:1', games[gameIndex].gameState));
      if (!games[gameIndex].gameState.vsbot)
        games[gameIndex].player2Socket.emit('game.timer', GameService.send.forPlayer.gameTimer('player:2', games[gameIndex].gameState));

      // if current turn is bot's turn, make the bot play
      if (games[gameIndex].gameState.vsbot && games[gameIndex].gameState.currentTurn === 'player:2') {

        //1er lancé
        games[gameIndex].gameState.deck.dices = GameService.dices.roll(games[gameIndex].gameState.deck.dices);
        const botChoice = makeBotPlay(games[gameIndex].gameState); // simulate bot's choice

        if (botChoice) {
          handleBotChoice(botChoice, games[gameIndex]); // handle the bot's choice
        }
        else { //si rien au 1er lancé, on fait le 2eme
          games[gameIndex].gameState.deck.dices = GameService.dices.roll(games[gameIndex].gameState.deck.dices);
          const botChoiceRoll2 = makeBotPlay(games[gameIndex].gameState); // simulate bot's choice
          if (botChoiceRoll2) {
            handleBotChoice(botChoiceRoll2, games[gameIndex]); // handle the bot's choice
          }
          else {//si rien au 2eme lancé, on fait le 3eme
            games[gameIndex].gameState.deck.dices = GameService.dices.roll(games[gameIndex].gameState.deck.dices);
            const botChoiceRoll3 = makeBotPlay(games[gameIndex].gameState); // simulate bot's choice
            if (botChoiceRoll3) {
              handleBotChoice(botChoiceRoll3, games[gameIndex]); // handle the bot's choice
            }

          }

        }
        // bot score

        const playerScore = GameService.grid.checkAndScoreLines(games[gameIndex].gameState.grid, games[gameIndex].gameState.currentTurn);

        games[gameIndex].gameState.player2Score = playerScore.score;

        games[gameIndex].player1Socket.emit('game.score', GameService.send.forPlayer.gameScore('player:1', games[gameIndex].gameState));

        if (playerScore.victory) {
          if (!playerScore.vainqueur) {
            if (games[gameIndex].gameState.player1Score > games[gameIndex].gameState.player2Score)
              playerScore.vainqueur = 'player:1';
            else if (games[gameIndex].gameState.player1Score < games[gameIndex].gameState.player2Score)
              playerScore.vainqueur = 'player:2';
            else
              playerScore.vainqueur = 'égalité';
          }
          games[gameIndex].player1Socket.emit("botGame.end", { vainqueur: playerScore.vainqueur, player1Score: games[gameIndex].gameState.player1Score, player2Score: games[gameIndex].gameState.player2Score });
          if (!games[gameIndex].gameState.vsbot)
            games[gameIndex].player2Socket.emit("botGame.end", { vainqueur: playerScore.vainqueur, player1Score: games[gameIndex].gameState.player1Score, player2Score: games[gameIndex].gameState.player2Score });

        }
      }


    }


    updateClientsViewDecks(games[gameIndex]);
    updateClientsViewChoices(games[gameIndex]);
    updateClientsViewGrid(games[gameIndex]);
  });

  socket.on('disconnect', reason => {
    console.log(`[${socket.id}] socket disconnected - ${reason}`);
  });
});

// -----------------------------------
// -------- SERVER METHODS -----------
// -----------------------------------

app.get('/', (req, res) => res.sendFile('index.html'));

http.listen(3000, function () {
  console.log('listening on *:3000');
});
