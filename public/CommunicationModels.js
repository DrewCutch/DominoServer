function PlayerConfig(name){
    this.name = name;
}

function Player(name, id){
    this.name = name;
    this.id = id;
}

function GameConfig(maxDominoValue, maxPlayers){
    this.maxDominoValue = maxDominoValue;
    this.maxPlayers = maxPlayers;
}

function Game(id, gameConfig){
    this.id = id;
    this.config = gameConfig;
    this.players = [];
}

function LogMessage(sender, message){
    this.sender = sender;
    this.message = message;
}

function PlayUpdate(play, gameState){
    this.play = play;
    this.game = gameState;
}

function GameState(trains, turn){
    this.round = -1;
    this.trains = trains;
    this.scores = []
    this.turn = turn;
    this.pendingSatisfied = -1
    this.mustBeSatisfied = -1;
    this.remainingDominoValues = [];
    this.playerDominoCounts = [];
}

function PlayerGameState(gameState, playerHand){
    this.game = gameState;
    this.playerHand = playerHand;
}

function PlayerHand(dominos){
    this.dominos = dominos;
}

function DominoValue(firstValue, secondValue){
    this.firstValue = firstValue;
    this.secondValue = secondValue;
}

function TrainState(player, dominos, flipped, trainIsUp){
    this.player = player;
    this.id = player.id + 1;
    this.dominos = dominos;
    this.trainIsUp = trainIsUp;
    this.flipped = flipped;
}

function Play(player, domino, train){
    this.player = player;
    this.domino = domino;
    this.train = train;
}



if(typeof module !== 'undefined'){
    module.exports = {
        DominoValue: DominoValue,
        PlayerConfig: PlayerConfig,
        Player: Player,
        GameConfig: GameConfig,
        Game: Game,
        GameState: GameState,
        TrainState: TrainState,
        LogMessage: LogMessage,
        Play: Play, 
        PlayerHand: PlayerHand,
        PlayerGameState: PlayerGameState
    }
}