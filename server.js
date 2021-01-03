const models = require("./public/CommunicationModels");
const express = require('express')
const session = require('express-session');

var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

const sessionMiddleware = session({ rolling: true, secret: 'not-secret', cookie: { maxAge: 60000 * 60 }});
// register middleware in Express
app.use(sessionMiddleware);
// register middleware in Socket.IO
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});


var path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

//app.listen("192.168.1.7");

http.listen(80, () => {
    console.log('listening on *:80');
});

const gameStates = {};
const players = {};

function DominoPool(config){
    const self = this;

    this.dominos = []

    for(var i = 0; i <= config.maxDominoValue; i++){
        for(var j = i; j <= config.maxDominoValue; j++){
            this.dominos.push(new models.DominoValue(i, j));
        }
    }

    this.draw = function(){
        const i = Math.floor( Math.random() * (self.dominos.length - 1));

        return self.dominos.splice(i, 1)[0];
    }

    this.remove = function(dominoValue){
        for (var i = 0; i < self.dominos.length; i++) {
            const value = self.dominos[i];

            if(value.firstValue == dominoValue.firstValue && value.secondValue == dominoValue.secondValue){
                self.dominos.splice(i, 1)[0];
                return;
            }
        }
    }
}

function GameState(game){
    const self = this;

    this.game = game;
    this.state = new models.GameState([], 0);
    this.dominoPool = new DominoPool(game.config);
    this.playerHands = [];

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
    newGameState.state.round = gameConfig.startingRound - 2;
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

function createPlayer(game, socketId, session, playerConfig){
    const playerInfo = new models.Player(playerConfig.name, game.players.length);
    const newPlayer = new Player(socketId, playerInfo, game.id);

    players[session] = newPlayer;
    console.log(playerConfig.name + " assigned to session " + session);

    return newPlayer;
}

function getPlayOptions(player){
    const game = gameStates[player.currentGameId];
    const playOptions = new Set();

    if(game.state.mustBeSatisfied == -1){
        for(const train of game.state.trains){
            if(train.player.id == player.info.id || train.trainIsUp){
                playOptions.add(getTrainValue(train));
            }
        }
    }
    else{
        playOptions.add(getTrainValue(game.state.trains[game.state.mustBeSatisfied]));
    }

    return playOptions;
}

function hasPlay(player){
    const game = gameStates[player.currentGameId];
    const hand = game.playerHands[player.info.id];
    const playOptions = getPlayOptions(player);


    for (const domino of hand.dominos) {
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
            const dominoValue = domino;

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

function logToPlayer(message, player){
    io.to(player.socketId).emit("log", message);
}

function startGame(gameState){
    console.log("Game " + gameState.game.id + " is full, starting now");

    for (const player of gameState.game.players) {
        io.to(player.socketId).emit("game-start", gameState.game, gameState.getPlayerGameState(player));
    }
    

    logToGame(new models.LogMessage("Game", "Game is full, starting now"), gameState.game);

    gameState.advanceRound();
    startNextRound(gameState);

    advanceTurn(gameState);
}

function endGame(gameState){
    console.log("Game " + gameState.game.id + " is over");

    gameState.state.round = -1;

    for (const player of gameState.game.players) {
        io.to(player.socketId).emit("game-end", gameState.getPlayerGameState(player));
    }

    delete gameStates[gameState.game.id];
}

function endRound(gameState){
    gameState.advanceRound();

    for (const player of gameState.game.players) {
        io.to(player.socketId).emit("round-end", gameState.getPlayerGameState(player));
    }
}

function startNextRound(gameState){
    const doubleValue = gameState.game.config.maxDominoValue - gameState.state.round;
    const startDomino = new models.DominoValue(doubleValue, doubleValue);
    
    if(doubleValue == -1){
        endGame(gameState);
        return;
    }

    gameState.dominoPool.remove(startDomino);

    for (const train of gameState.state.trains) {
        train.dominos = [startDomino];
        train.flipped = [false];
        train.trainIsUp = train.player.id == -1; // Train is only up on mexican
    }

    for (const player of gameState.game.players) {
        gameState.state.playerDominoCounts[player.info.id] = 0;
        gameState.playerHands[player.info.id] = new models.PlayerHand([]);
    }
    
    for (const player of gameState.game.players) {
        io.to(player.socketId).emit("round-start", gameState.game, gameState.getPlayerGameState(player));
    }

    for(const player of gameState.game.players){
        for(var i = 0; i < 15; i++){ // TODO: return to 15
            drawDomino(gameState, player);
        }
    }

    logToGame(new models.LogMessage("Game", "Starting round " + (gameState.state.round + 1)), gameState.game);
}

function advanceRound(gameState){
    endRound(gameState);
    // 5 second wait between starting next round
    setTimeout(() => startNextRound(gameState), 10000);
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

    const sessionId = socket.request.sessionID;

    if(sessionId in players){
        players[sessionId].socketId = socket.id;
    }
    else{
        console.log("new session: " + sessionId);
    }

    socket.on("join-game", (gameId, playerConfig) => {
        onJoinGame(socket, gameId, playerConfig);
    });

    socket.on("create-game", (gameId, gameConfig) => {
        onCreateGame(socket, gameId, gameConfig);
    });

    socket.on("play", (play) =>{
        onPlay(socket, play);
    });

    socket.on("draw", () =>{
        onDraw(socket);
    });

    socket.on('disconnect', function (reason) {
        if(!(sessionId in players)){
            return;
        }

        const player = players[socket.request.sessionID];
        console.log(player.info.name + ' disconnected because of ' + reason);
    });
});

function assignPlayer(game, socket, playerConfig){
    const player = createPlayer(game, socket.id, socket.request.sessionID, playerConfig);
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
    gameState.state.playerDominoCounts[player.info.id] = 0;
    gameState.state.scores.push(playerConfig.startingScore);

    socket.join(gameId);

    socket.to(gameId).emit("game-joined", player.info);

    logToGame(new models.LogMessage("Game", player.info.name + " joined the game"), gameState.game);

    if(game.players.length === game.config.maxPlayers){
        startGame(gameState);
    }
}

function onCreateGame(socket, gameId, gameConfig){
    console.log("Game " + gameId + " created");
    createGameState(gameId, gameConfig);
}

function onPlay(socket, play){
    if(!(socket.request.sessionID in players)){
        //TODO: handle errors
        return;
    }

    const player = players[socket.request.sessionID];
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
        train.trainIsUp = false;
    }
    for (const player of gameState.game.players) {
        io.to(player.socketId).emit("play", play, gameState.getPlayerGameState(player));
    }

    // Round is over
    if(gameState.playerHands[player.info.id].dominos.length == 0){
        logToGame(new models.LogMessage("Game", player.info.name + " went out!"), gameState.game);
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
    if(!(socket.request.sessionID in players)){
        //TODO: handle errors
        return;
    }

    const player = players[socket.request.sessionID];
    const gameState = gameStates[player.currentGameId]

    if(player.info.id != gameState.state.turn){
        //TODO: report error
        return;
    }

    drawDomino(gameState, player);

    if(!hasPlay(player)){
        gameState.state.trains[player.info.id + 1].trainIsUp = true;
        logToGame(new models.LogMessage("Game", player.info.name + "'s train is up"), gameState.game);
        advanceTurn(gameState);
    }
}

// Feature: rotate starting position
// 