const setupForm = document.getElementById("setup-form");
const setupModal = document.getElementById("setup-modal");
const gameSpace = document.getElementById("game-space");
const trainSpace = document.getElementById("train-space");
const handSpace = document.getElementById("hand-space");
const gameLog = document.getElementById("game-log");
const actionSpace = document.getElementById("action-space");
const actionMessage = document.getElementById("action-message");
const actionButton = document.getElementById("action-button");

const socket = io("ws://localhost:3000");

var myPlayer;
var myGameState;
var highestZIndex = 1;

function trySetupFromURL(){
    let params = new URLSearchParams(location.search);

    if(!params.has("playerName") || !params.has("gameName")){
        return;
    }

    joinGame(new PlayerConfig(params.get("playerName")), params.get("gameName"));
}

trySetupFromURL();

function onSetup(){
    const playerConfig = new PlayerConfig(setupForm.playerName.value);

    if(setupForm.submitted === "createGame"){
        createGame(setupForm.gameName.value, new GameConfig(12, parseInt(setupForm.gameSize.value)));
    }
    joinGame(setupForm.gameName.value, playerConfig);

    return false;
}

function createGame(gameName, gameConfig){
    socket.emit('create-game', gameName, gameConfig);
}

function joinGame(gameName, playerConfig){
    socket.emit('join-game', gameName, playerConfig);
}


socket.on("connect", () => {
    console.log("connected")
});

const trains = [];
const dominoElements = [];

function destroyAllDominoElements(){
    for (const dominoElement of dominoElements) {
        dominoElement.remove();
    }

    dominoElements.length = 0;
}


socket.on("game-start", (game, gameState) => {
    myGameState = gameState;

    for(const trainState of gameState.game.trains){
        trains.push(new Train(trainState));
    }
});

socket.on("domino-give", (gameState, dominoValue) => {
    myGameState = gameState;

    const newDomino = new Domino(dominoValue);

    newDomino.domElement.style.top = 
        (handSpace.offsetTop + Math.floor(Math.random() * (handSpace.offsetHeight - newDomino.domElement.offsetHeight))) + "px";
    
        newDomino.domElement.style.left = 
        (handSpace.offsetLeft + Math.floor(Math.random() * (handSpace.offsetWidth - newDomino.domElement.offsetHeight))) + "px";

    checkToDraw();
});

socket.on("turn", (gameState) => {
    myGameState = gameState;

    updateTrains();

    if(gameState.game.turn == myPlayer.id){
        log(new LogMessage("Local", "It is your turn."));
    }

    checkToDraw();
})

socket.on("play", (play, gameState) => {
    //TODO: check gameState accuracy
    myGameState = gameState;

    const train = trains[play.train.id];

    train.update(play.train);

    checkToDraw();
});

socket.on("round-start", (game, gameState) => {
    destroyAllDominoElements();

    myGameState = gameState;

    for (const train of trains) {
        train.localDominos = [];
        train.state.dominos = [];
    }

    updateTrains();

    setCurrentActionOption(null);
});

socket.on("player-assign", (player) => {
    myPlayer = player;
    setupModal.style.display = "none";
});

socket.on("log", (logMessage) => {
    log(logMessage);
});

function updateTrains(){
    for(var i = 0; i < myGameState.game.trains.length; i++){
        trains[i].update(myGameState.game.trains[i]);

        if(i == 0){
            trains[i].titleElement.innerHTML = "MEXICAN";
            continue;
        }
        trains[i].titleElement.innerHTML = 
            "<p>" + trains[i].state.player.name + "</p>" +
            "<p>Score: " + myGameState.game.scores[i - 1] + "</p>"
            "<p>Dominos: " + myGameState.game.playerDominoCounts[i - 1] + "</p>";
        ;
    }
}

function draw(){
    socket.emit("draw");
}


function ActionOption(message, actionTitle, onAction){
    this.message = message;
    this.actionTitle = actionTitle;
    this.onAction = onAction;
}

function setCurrentActionOption(actionOption){
    if(actionOption == null){
        actionSpace.style.display = "none";
        return;
    }

    actionSpace.style.display = "flex";

    actionButton.onclick = actionOption.onAction;
    actionButton.textContent = actionOption.actionTitle;
    actionMessage.innerText = actionOption.message;
}

function hasPlay(){
    let playOptions = new Set();

    if(myGameState.game.mustBeSatisfied == -1){
        for (const train of trains) {
            if(train.state.player.id == myPlayer.id || train.state.trainIsUp){
                playOptions.add(train.currentValue());
            }
        }
    }
    else{
        playOptions.add(trains[myGameState.game.mustBeSatisfied].currentValue());
    }

    for (const domino of myGameState.playerHand.dominos) {
        if(playOptions.has(domino.firstValue) || playOptions.has(domino.secondValue)){
            return true;
        }
    }
    return false;
}

function checkToDraw(){
    if(myGameState.game.turn == myPlayer.id && !hasPlay()){
        setCurrentActionOption(new ActionOption("You do not have a play.", "Draw", draw));
    }
    else{
        setCurrentActionOption(null);
    }
}

function resync(){
    alert("IMPLEMENT RESYNC");
}

function log(logMessage){
    let element = document.createElement("p");
    element.innerText = logMessage.sender + ": " + logMessage.message;

    gameLog.append(element);
}

function DragManager(element){
    this.onStartDrag = (pos) => {};
    this.onDrag = (pos) => {};
    this.onEndDrag = (pos) => {};
    this.setPosition = (pos) => {
        element.style.top = (pos.y - element.style.height / 2) + "px";
        element.style.left = (pos.x - element.style.width / 2) + "px";
    }
}

function makeDraggable(element){
    var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    var oldDocumentMouseUp = null, oldDocumentMouseMove = null;

    const dragManager = new DragManager(element);

    element.onmousedown = dragMouseDown;

    return dragManager;
    
    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();

        if(e.button !== 0){
            return
        }

        // get the mouse cursor position at startup:
        pos3 = e.clientX;
        pos4 = e.clientY;

        oldDocumentMouseUp = document.onmouseup
        document.onmouseup = closeDragElement;

        // call a function whenever the cursor moves:
        oldDocumentMouseMove = document.onmousemove;
        document.onmousemove = elementDrag;

        dragManager.onStartDrag({x: e.clientX, y: e.clientY})
    }
  
    function elementDrag(e) {
      e = e || window.event;
      e.preventDefault();
      // calculate the new cursor position:
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      // set the element's new position:
      element.style.top = (element.offsetTop - pos2) + "px";
      element.style.left = (element.offsetLeft - pos1) + "px";

      dragManager.onDrag({x: e.clientX, y: e.clientY})
    }
  
    function closeDragElement(e) {
        if(e.button !== 0){
            return
        }
        // stop moving when mouse button is released:
        document.onmouseup = oldDocumentMouseUp;
        document.onmousemove = oldDocumentMouseMove;

        dragManager.onEndDrag({x: e.clientX, y: e.clientY});
    }
}

function setRotation(element, deg){
    element.style.transform = "rotate(" + deg + "deg)";
}

function getRotation(element){
    const obj = window.getComputedStyle(element, null);
    const matrix = obj.getPropertyValue('transform');

    if(matrix === 'none'){
        return 0;
    }

    const values = matrix.split('(')[1].split(')')[0].split(',');
    const a = values[0];
    const b = values[1];
    return Math.round(Math.atan2(b, a) * (180/Math.PI));
}

function addRotation(element, deg){
    setRotation(element, getRotation(element) + deg);
}

function Train(trainState){
    const self = this;
    this.state = trainState;
    this.domElement = createTrainElement();
    this.localDominos = [];

    this.titleElement = self.domElement.children[1].children[0];
    this.trainElement = self.domElement.children[1].children[1];

    this.clear = () => {
        self.localDominos = [];
    }

    this.currentValue = () => {
        if(self.state.dominos.length === 0){
            return -1;
        }

        const lastDomino = self.state.dominos[self.state.dominos.length - 1];
        const lastDominoFlipped = self.state.flipped[self.state.flipped.length - 1];

        return lastDominoFlipped ? lastDomino.firstValue : lastDomino.secondValue;
    }

    this.update = (newTrainState) => {
        self.state.trainIsUp = newTrainState.trainIsUp;

        self.trainElement.style.display = self.state.trainIsUp ? "block" : "none";

        for(var i = self.state.dominos.length; i < newTrainState.dominos.length; i++){
            const newDomino = new Domino(newTrainState.dominos[i]);
            addDominoToTrain(newDomino, this);
        }

        if(myGameState.game.mustBeSatisfied === self.state.id){
            self.localDominos[self.localDominos.length - 1].domElement.classList.add("must-be-satisfied");
        }
        else if(self.localDominos.length > 0){
            self.localDominos[self.localDominos.length - 1].domElement.classList.remove("must-be-satisfied");
        }
    }

    this.canPlay = (dominoValue) => {
        return (self.currentValue() === dominoValue.firstValue || self.currentValue() === dominoValue.secondValue)
        && (myPlayer.id === self.state.player.id || self.state.trainIsUp) 
        && (myGameState.game.mustBeSatisfied === -1 || myGameState.game.mustBeSatisfied === self.state.id);
    }

    this.update(trainState);
}

function createTrainElement(){
    let element = document.createElement("div");
    element.classList.add("train");

    let trainContainer = document.createElement("div");
    trainContainer.classList.add("train-container");
    element.appendChild(trainContainer);

    let trainLeft = document.createElement("div");
    trainLeft.classList.add("train-lane");
    trainContainer.appendChild(trainLeft);

    let trainRight = document.createElement("div");
    trainRight.classList.add("train-lane");
    trainContainer.appendChild(trainRight);

    let trainInfo = document.createElement("div");
    trainInfo.classList.add("train-info");
    element.appendChild(trainInfo);

    let trainName = document.createElement("div");
    trainName.classList.add("train-name");
    trainInfo.appendChild(trainName);

    let trainIcon = document.createElement("img");
    trainIcon.src = "assets/train-icon.jpg";
    trainIcon.classList.add("train-icon");
    trainInfo.appendChild(trainIcon);

    trainSpace.appendChild(element);

    return element;
}

function flipDominoToValue(domino, value){
    setOrientation(domino.domElement, domino.value.firstValue === value ? Direction.Normal : Direction.Flipped);
}

function addDominoToTrain(domino, train){
    domino.domElement.classList.add("train-domino");

    // Alternate left and right container
    const trainContainer = train.domElement.children[0].children[train.localDominos.length % 2];
    const otherContainer = train.domElement.children[0].children[(train.localDominos.length + 1) % 2];

    if(trainContainer.children.length > 0){
        trainContainer.children.item(0).style.marginBottom = "0px";
    }
    if(otherContainer.children.length > 0){
        otherContainer.children.item(0).style.marginBottom = "55px";
    }

    flipDominoToValue(domino, train.currentValue());

    trainContainer.prepend(domino.domElement);

    const oldCurrentValue = train.currentValue();
    train.state.dominos.push(domino.value);
    train.state.flipped.push(domino.value.firstValue != oldCurrentValue);
    train.localDominos.push(domino);    
}

function playDomino(domino, train){
    addDominoToTrain(domino, train);

    socket.emit("play", new Play(myPlayer, domino.value, train.state));
}

function createDominoElement(domino){
    let element = document.createElement("div");
    element.classList.add("domino");

    let firstSVG = document.createElement("img");
    firstSVG.src = "assets/domino" + domino.value.firstValue + ".svg";

    let secondSVG = document.createElement("img");
    secondSVG.src = "assets/domino" + domino.value.secondValue + ".svg";

    let divider = document.createElement("img");
    divider.src = "assets/divider.svg";

    element.appendChild(firstSVG);
    element.appendChild(divider);
    element.appendChild(secondSVG);

    gameSpace.appendChild(element);

    dominoElements.push(element);

    return element;
}

function DominoConfig(highestNumber){
    this.highestNumber = highestNumber;
}

const DominoStates = {
    InHand: 0,
    Dragging: 1,
    Played: 2
};


function Domino(value){
    const self = this;
    this.value = value;

    this.state = DominoStates.InHand;

    this.domElement = createDominoElement(this);
    this.dragManager = makeDraggable(this.domElement);


    this._turned = true;
    this._startDrag;

    this._right = true;

    self.dragManager.onStartDrag = function(pos){
        self._startDrag = pos;

        if(self.domElement.style.zIndex < highestZIndex){
            highestZIndex += 1;
            self.domElement.style.zIndex = highestZIndex;
        }   
    }

    self.dragManager.onDrag = function(pos){
        const trainWidth = trainSpace.offsetWidth / trains.length;
        const nearestTrainIndex = Math.floor(pos.x / trainWidth);
        const nearestTrain = trains[nearestTrainIndex];



        if(pos.y < 300 && nearestTrain.canPlay(self.value)){
            flipDominoToValue(self, nearestTrain.currentValue());
            self._turned = false;
        }
        else if(!self._turned){
            setOrientation(self.domElement, Direction.Right);
            self._turned = true;
        }
    }

    self.dragManager.onEndDrag = function(pos){
        // Allow user to bring domino into hand space
        if(pos.y >= handSpace.offsetTop){
            return;
        }
        const trainWidth = trainSpace.offsetWidth / trains.length;
        const nearestTrainIndex = Math.floor(pos.x / trainWidth);
        const nearestTrain = trains[nearestTrainIndex];

        if(myGameState.game.turn === myPlayer.id && 
            (nearestTrain.state.player.id === myPlayer.id || nearestTrain.state.trainIsUp) &&
            nearestTrain.canPlay(self.value)){
            playDomino(self, nearestTrain);
        }
        else{
            self.dragManager.setPosition(self._startDrag);
            setOrientation(self.domElement, Direction.Right);
        }
    }

    setOrientation(self.domElement, Direction.Right);

    self.domElement.addEventListener('contextmenu', function(e){
        e.preventDefault();

        if(self.state == DominoStates.InHand){
            setOrientation(self.domElement, self._right ? Direction.Left : Direction.Right);
            self._right = !self._right;
        }

        return false;
    }, false);
}

