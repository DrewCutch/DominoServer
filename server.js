var models = require("./public/CommunicationModels");

var express = require('express')
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

var path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

//app.listen(3000);

http.listen(3000, () => {
    console.log('listening on *:3000');
});

const gameStates = {}
const players = {}
const dominoLookUp = {}

function generateDominoLookUp(gameConfig){
    // Return if lookup already generated
    if(gameConfig.maxDominoValue in dominoLookUp){
        return;
    }

    const dominos = [];
    var id = 0;
    
    for(var i = 0; i <= gameConfig.maxDominoValue; i++){
        for(var j = i; j <= gameConfig.maxDominoValue; j++){
            dominos.push(new models.DominoValue(i, j));
            id += 1;
        }
    }

    dominoLookUp[gameConfig.maxDominoValue] = dominos;
}

function DominoPool(config){
    const highestNumber = config.maxDominoValue;
    const numberOfDominos = (highestNumber * highestNumber + (3 * highestNumber) + 2) / 2;
    this.dominos = new Array(numberOfDominos);

    for(var i = 0; i < numberOfDominos; i++){
        this.dominos[i] = i + 1;
    }

    this.draw = function(){
        const i = Math.floor( Math.random() * (this.dominos.length - 1) );
        const id = this.dominos.splice(i, 1)[0];

        return dominoLookUp[highestNumber][id];
    }
}

function GameState(game){
    const self = this;

    this.game = game;
    this.state = new models.GameState([], 0);
    this.dominoPool = new DominoPool(game.config);
    this.playerHands = [];

    generateDominoLookUp(game.config);

    for (const domino of this.dominoPool.dominos) {
        this.state.remainingDominoValues[domino.firstValue] += 1;
        this.state.remainingDominoValues[domino.secondValue] += 1;
    }

    this.removeDominoFromHand = (dominoValue, hand) => {
        self.state.playerDominoCounts[hand] -= 1;

        const playerDominos = self.playerHands[hand].dominos;
        for(var i = 0; i < playerDominos.length; i++){
            if(playerDominos[i].firstValue == dominoValue.firstValue &&
                playerDominos[i].secondValue == dominoValue.secondValue){
                    playerDominos.splice(i, 1);
                return true;
            }
            
        }

        return false;
    }

    this.advanceRound = () => {
        for(var i = 0; i < self.playerHands.length; i++){
            for (const domino of self.playerHands[i].dominos) {
                self.state.scores[i] += domino.firstValue + domino.secondValue;
            }
        }

        self.state.round += 1;
        self.dominoPool = new DominoPool(game.config);
    }

    this.getPlayerGameState = (player) => {
        return new models.PlayerGameState(self.state, self.playerHands[player.info.id]);
    }
}

function createGameState(id, gameConfig){
    const newGameState = new GameState(new models.Game(id, gameConfig));
    gameStates[id] = newGameState;

    newGameState.state.trains.push(new models.TrainState(new models.Player("MEXICAN", -1), [], [], true));
    return newGameState;
}


function getTrainValue(trainState){
    if(trainState.dominos.length == 0){
        return -1;
    }

    const lastDomino = trainState.dominos[trainState.dominos.length - 1];
    const lastDominoFlipped = trainState.flipped[trainState.flipped.length - 1];

    return lastDominoFlipped ? lastDomino.firstValue : lastDomino.secondValue;
}

function addDominoToTrain(gameState, domino, trainId){
    const train = gameState.state.trains[trainId];
    const trainValue = getTrainValue(train);
    const flipped = trainValue === domino.secondValue;

    train.dominos.push(domino);
    train.flipped.push(flipped);

    gameState.state.remainingDominoValues[domino.firstValue] -= 1;
    gameState.state.remainingDominoValues[domino.secondValue] -= 1;
}

function Player(socketId, playerInfo, currentGameId){
    this.socketId = socketId;
    this.info = playerInfo;

    this.currentGameId = currentGameId; 
}

function createPlayer(game, socketId, playerConfig){
    const playerInfo = new models.Player(playerConfig.name, game.players.length);
    const newPlayer = new Player(socketId, playerInfo, game.id);

    players[socketId] = newPlayer;

    return newPlayer;
}

function getPlayOptions(player){
    const game = gameStates[player.currentGameId];
    const playOptions = new Set();

    for(const train of game.state.trains){
        if(train.player.id == player.info.id || train.trainIsUp){
            playOptions.add(getTrainValue(train));
        }
    }

    return playOptions;
}

function hasPlay(player){
    const game = gameStates[player.currentGameId];
    const hand = game.playerHands[player.info.id];
    const playOptions = getPlayOptions(player);

    //console.log(playOptions);
    //console.log(hand);

    for (const domino of hand.dominos) {
        //console.log("playOptions.has(domino.firstValue): " + playOptions.has(domino.firstValue));
        //console.log("playOptions.has(domino.secondValue): " + playOptions.has(domino.secondValue));
        
        if(playOptions.has(domino.firstValue) || playOptions.has(domino.secondValue)){
            return true;
        }
    }

    console.log(player.info.name + " does not have a play")
    return false;
}

function roundIsPlayable(gameState){
    for (const player of gameState.game.players) {
        const hand = gameState.playerHands[player.info.id];
        const playOptions = getPlayOptions(player);
        
        for (const domino of hand.dominos) {
            if(playOptions.has(domino.firstValue) || playOptions.has(domino.secondValue)){
                return true;
            }
        }
    }

    // Only check domino pool if no players have a play (to avoid longer time)
    for (const player of gameState.game.players) {
        const playOptions = getPlayOptions(player);

        for (const domino of gameState.dominoPool.dominos) {
            const dominoValue = dominoLookUp[gameState.game.config.maxDominoValue][domino];

            if(playOptions.has(dominoValue.firstValue) || playOptions.has(dominoValue.secondValue)){
                return true;
            }
        }
    }

    return false;
}

function isDouble(domino){
    return domino.firstValue === domino.secondValue;
}

function logToGame(message, game){
    io.in(game.id).emit("log", message);
}

function startGame(gameState){
    console.log("Game " + gameState.game.id + " is full, starting now");

    for (const player of gameState.game.players) {
        io.to(player.socketId).emit("game-start", gameState.game, gameState.getPlayerGameState(player));
    }
    

    logToGame(new models.LogMessage("Server", "Game is full, starting now"), gameState.game);

    advanceRound(gameState);
    advanceTurn(gameState);
}

function advanceRound(gameState){
    gameState.advanceRound();

    const doubleValue = gameState.game.config.maxDominoValue - gameState.state.round;
    
    for (const train of gameState.state.trains) {
        train.dominos = [new models.DominoValue(doubleValue, doubleValue)];
        train.flipped = [false];
        train.trainIsUp = train.player.id == -1; // Train is only up on mexican
    }

    for (const player of gameState.game.players) {
        io.to(player.socketId).emit("round-start", gameState.game, gameState.getPlayerGameState(player));
    }

    for(const player of gameState.game.players){
        for(var i = 0; i < 5; i++){ // TODO: return to 15
            drawDomino(gameState, player);
        }
    }

    logToGame(new models.LogMessage("Server", "Starting round " + (gameState.state.round + 1)), gameState.game);
}

function advanceTurn(gameState){
    gameState.state.turn = (gameState.state.turn + 1) % gameState.game.players.length;

    gameState.state.mustBeSatisfied = gameState.state.pendingSatisfied;

    for (const player of gameState.game.players) {
        io.to(player.socketId).emit("turn", gameState.getPlayerGameState(player));
    }
}

function drawDomino(gameState, player){
    const domino = gameState.dominoPool.draw();
    gameState.playerHands[player.info.id].dominos.push(domino);
    gameState.state.playerDominoCounts[player.info.id] += 1;

    io.to(player.socketId).emit("domino-give", gameState.getPlayerGameState(player), domino);
}

io.on("connection", (socket) => {
    console.log("user connected");
    socket.emit("welcome", "welcome man");

    socket.on("join-game", (gameId, playerConfig) => {
        onJoinGame(socket, gameId, playerConfig);
    });

    socket.on("create-game", (gameId, gameConfig, playerConfig) => {
        onCreateGame(socket, gameId, gameConfig);
    });

    socket.on("play", (play) =>{
        onPlay(socket, play);
    })

    socket.on("draw", () =>{
        onDraw(socket);
    })
});

function assignPlayer(game, socket, playerConfig){
    const player = createPlayer(game, socket.id, playerConfig);
    socket.emit("player-assign", player.info);

    console.log("Player " + playerConfig.name + " created");

    return player;
}

function onJoinGame(socket, gameId, playerConfig){
    // If the game does not exist
    if(!(gameId in gameStates)){
        return;
    }

    const gameState = gameStates[gameId];
    const game = gameState.game;
    const player = assignPlayer(game, socket, playerConfig);

    console.log("Game " + gameId + " joined by " + player.info.name);
    game.players.push(player);
    gameState.state.trains.push(new models.TrainState(player.info, [], [], false));
    gameState.playerHands[player.info.id] = new models.PlayerHand([]);
    gameState.state.scores.push(0);

    socket.join(gameId);

    socket.to(gameId).emit("game-joined", player.info);

    logToGame(new models.LogMessage("Server", player.info.name + " joined the game"), gameState.game);

    if(game.players.length === game.config.maxPlayers){
        startGame(gameState);
    }
}

function onCreateGame(socket, gameId, gameConfig){
    console.log("Game " + gameId + " created");
    createGameState(gameId, gameConfig);
}

function onPlay(socket, play){
    if(!(socket.id in players)){
        //TODO: handle errors
        return;
    }

    const player = players[socket.id];
    const gameState = gameStates[player.currentGameId];
    const train = gameState.state.trains[play.train.id];

    //TODO: check if play is valid
    if(player.info.id != gameState.state.turn){
        //TODO: report error
        return;
    }

    // If a train must be satisfied and the play does not satisfy it...
    if(gameState.state.mustBeSatisfied != -1 && play.train.id != gameState.state.mustBeSatisfied){
        //TODO: report error
        return;
    }

    gameState.removeDominoFromHand(play.domino, player.info.id);

    addDominoToTrain(gameState, play.domino, play.train.id);

    // If you satify a double...
    if(play.train.id === gameState.state.pendingSatisfied){
        gameState.state.pendingSatisfied = -1;
    }

    // Playing a double will make that train pendingSatisfied
    if(isDouble(play.domino)){
        gameState.state.pendingSatisfied = play.train.id;
    }

    if(train.player.id === player.info.id){
        console.log("Train is down.");
        train.trainIsUp = false;
    }


    for (const player of gameState.game.players) {
        io.to(player.socketId).emit("play", play, gameState.getPlayerGameState(player));
    }

    // Round is over
    if(gameState.playerHands[player.info.id].length == 0){
        advanceRound(gameState);
    }
    else if(!roundIsPlayable(gameState)){
        //TODO: add message that round connot be finished
        advanceRound(gameState);
    }
    else if(!isDouble(play.domino)){
        advanceTurn(gameState);
    }
}

function onDraw(socket){
    const player = players[socket.id];
    const gameState = gameStates[player.currentGameId]

    if(player.info.id != gameState.state.turn){
        //TODO: report error
        return;
    }

    drawDomino(gameState, player);

    if(!hasPlay(player)){
        gameState.state.trains[player.info.id + 1].trainIsUp = true;
        advanceTurn(gameState);
    }
}