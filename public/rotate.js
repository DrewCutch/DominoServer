
const Direction = {
    Normal: {
        class: "normal"
    },
    Left: {
        class: "left"
    },
    Right: {
        class: "right"
    },
    Flipped: {
        class: "flipped"
    }
}

function getRotationFromClassName(className){
    const rotations = {
        "normal": 0,
        "right": 90,
        "flipped": 180,
        "left": -90
    }
    const split = className.split("-");

    return rotations[split[0]];
}

function getDirectionFromElement(element){
    for(var dir in Direction){
        if(element.classList.contains(dir.class)){
            return dir;
        }
    }
    
    return Direction.Normal;
}

function getTransition(from, to){
    const fromDegrees = getRotationFromClassName(from.class);
    const toDegrees = getRotationFromClassName(to.class);

    const difference = toDegrees - fromDegrees;

    const needsNegative = Math.abs(difference) > 180;

    return to.class + (needsNegative ? "negative" : "") + "-transition";
}

function setOrientation(element, direction){
    for(var dir in Direction){
        element.classList.remove(Direction[dir].class + "-transition");
    }

    const currentDirection = getDirectionFromElement(element);

    const transition = getTransition(currentDirection, direction);

    element.classList.add(transition);
    //element.addEventListener("transitionend", rotationNormalizer(element));
}


function rotationNormalizer(element){
    return () =>{

        element.removeEventListener("transitionend", this);
    }
}