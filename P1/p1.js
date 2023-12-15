var canvas = document.getElementById('myCanvas');
var context = canvas.getContext('2d');

const BACKGROUND = "white";
const COLOR_LINE = "black";
const COLOR_FACE = "red";
const HEIGHT = canvas.height;
const WIDTH = canvas.width;
let deltaTime = 0;
let timeLast = 0;
let mouseX = 0;
let mouseY = 0;
context.fillStyle = COLOR_FACE;
context.strokeStyle = COLOR_LINE;
context.lineWith = WIDTH / 100;
context.lineCap = "round";


//Speed in Radians per second (Sliders)
const xSlider = document.getElementById('x'); 
const ySlider = document.getElementById('y');
const zSlider = document.getElementById('z');
const copySlider = document.getElementById('copies');
xSlider.value = 0.1;
ySlider.value = 0.1;
zSlider.value = 0.1;
copySlider.value = 1;

//Checkboxes
const shading = document.getElementById("shading");
const outline = document.getElementById("outline");


class vec3 {
    constructor(x, y, z){
        this.x = x;
        this.y = y;
        this.z = z;
    }
}  

//Connects each index in the above list of verticies to each other.
let edges = [
    [0, 1], [1, 2], [2, 3], [3, 0], // back
    [4, 5], [5, 6], [6, 7], [7, 4], // front
    [0, 4], [1, 5], [2, 6], [3, 7] // edges from back to front
];

let faces = [
    [0, 1, 2, 3], // Back face
    [4, 5, 6, 7], // Front face
    [0, 1, 5, 4], // Top face
    [2, 3, 7, 6], // Bottom face
    [0, 3, 7, 4], // Left face
    [1, 2, 6, 5]  // Right face
];

//Cube!
//There are 8 unique points on a cube that we need to translate through 3D space.
class Cube {
    //Offsets in image
    constructor(x, y, z, size, red, green, blue){
        this.cubeX = x;
        this.cubeY = y;
        this.cubeZ = z;
        this.size = size;
        this.color = [red, green, blue]

        this.updateVerts();
    }

    //Used to update vertex positions if cubeX or cubeY is changed.
    updateVerts(){
        this.vertices = [
            new vec3(this.cubeX - this.size, this.cubeY - this.size, this.cubeZ - this.size),
            new vec3(this.cubeX + this.size, this.cubeY - this.size, this.cubeZ - this.size),
            new vec3(this.cubeX + this.size, this.cubeY + this.size, this.cubeZ - this.size),
            new vec3(this.cubeX - this.size, this.cubeY + this.size, this.cubeZ - this.size),
            new vec3(this.cubeX - this.size, this.cubeY - this.size, this.cubeZ + this.size),
            new vec3(this.cubeX + this.size, this.cubeY - this.size, this.cubeZ + this.size),
            new vec3(this.cubeX + this.size, this.cubeY + this.size, this.cubeZ + this.size),
            new vec3(this.cubeX - this.size, this.cubeY + this.size, this.cubeZ + this.size)
        ]; 
    }

    drawCube(timeDelta){
        /**
         * Rotate cube, all information from some guides online and this 
         * wikipedia page: https://en.wikipedia.org/wiki/Rotation_matrix#In_three_dimensions
         * NO, I did not copy someone (I have prior experience w/ graphics), I can show the matrix math I did if asked.
        **/
        let angleX = timeDelta * 0.001 * xSlider.value * Math.PI * 2;
        let angleY = timeDelta * 0.001 * ySlider.value * Math.PI * 2;
        let angleZ = timeDelta * 0.001 * zSlider.value * Math.PI * 2;
        
        for (let v of this.vertices) {
            v.x -= this.cubeX;
            v.y -= this.cubeY;
            v.z -= 0;
        }

        //Z Rotation
        for(let v of this.vertices){
            let newX = v.x*Math.cos(angleZ) - v.y*Math.sin(angleZ);
            let newY = v.x*Math.sin(angleZ) + v.y*Math.cos(angleZ);
            let newZ = v.z;
            v.x = newX;
            v.y = newY;
            v.z = newZ;
        }
    
        //X Rotation
        for(let v of this.vertices){
            let newX = v.x;
            let newY = v.y*Math.cos(angleX) - v.z*Math.sin(angleX);
            let newZ = v.y*Math.sin(angleX) + v.z*Math.cos(angleX);
            v.x = newX;
            v.y = newY;
            v.z = newZ;
        }
    
        //Y Rotation
        for(let v of this.vertices){
            let newX = v.x*Math.cos(angleY) + v.z*Math.sin(angleY);
            let newY = v.y;
            let newZ = -v.x*Math.sin(angleY) + v.z*Math.cos(angleY);
            v.x = newX;
            v.y = newY;
            v.z = newZ;
        }
    
        for (let v of this.vertices) {
            v.x += this.cubeX;
            v.y += this.cubeY;
            v.z += 0;
        }
    
        // Sort the faces by average depth (you need to calculate the depth for each face)
        // We are sorting them becasue we DONT have a depth buffer!
        faces.sort((face1, face2) => {
            // Calculate average depth for each face
            let depth1 = (this.vertices[face1[0]].z + this.vertices[face1[1]].z + this.vertices[face1[2]].z + this.vertices[face1[3]].z) / 4;
            let depth2 = (this.vertices[face2[0]].z + this.vertices[face2[1]].z + this.vertices[face2[2]].z + this.vertices[face2[3]].z) / 4;
            return depth2 - depth1; // Sort in descending order (furthest faces first)
        });
    
        //Draw faces.
        for (let face of faces){
            context.fillStyle = `rgb(${this.color[0]}, ${this.color[1]}, ${this.color[2]})`
            if(shading.checked){
                //All for shading.
                //Calculate surface normal -> get dot product -> shade according to that magnitude
                let v1 = subtract(this.vertices[face[1]], this.vertices[face[0]]);
                let v2 = subtract(this.vertices[face[2]], this.vertices[face[0]]);
                let centerX = (this.vertices[face[0]].x + this.vertices[face[1]].x + this.vertices[face[2]].x + this.vertices[face[3]].x) / 4;
                let centerY = (this.vertices[face[0]].y + this.vertices[face[1]].y + this.vertices[face[2]].y + this.vertices[face[3]].y) / 4
    
                let normal = normalize(cross(v1, v2));
                let pos = normalize(new vec3(mouseX - centerX, mouseY - centerY, this.cubeZ - normal.z));
                let dotProduct = dot(pos, normal);
    
                let shadingIntensity = (dotProduct + 1) / 2; 
                let redComponent = Math.max(Math.floor(this.color[0] * shadingIntensity), 50);
                let greenComponent = Math.max(Math.floor(this.color[1] * shadingIntensity), 50);
                let blueComponent = Math.max(Math.floor(this.color[2] * shadingIntensity), 50);

                let fillColor = `rgb(${redComponent}, ${greenComponent}, ${blueComponent})`;
                context.fillStyle = fillColor;
            }
            
            context.beginPath();
            context.moveTo(this.vertices[face[0]].x, this.vertices[face[0]].y);
            context.lineTo(this.vertices[face[1]].x, this.vertices[face[1]].y);
            context.lineTo(this.vertices[face[2]].x, this.vertices[face[2]].y);
            context.lineTo(this.vertices[face[3]].x, this.vertices[face[3]].y);
            context.closePath();
    
            context.fill();
        }
    
        //Draw edges of cube
        if(outline.checked){
            context.strokeStyle = COLOR_LINE;
            for (let edge of edges) {
                context.beginPath();
                context.moveTo(this.vertices[edge[0]].x, this.vertices[edge[0]].y);
                context.lineTo(this.vertices[edge[1]].x, this.vertices[edge[1]].y);
                context.stroke();
            }
        }
    } 


}


let cubeX = WIDTH / 2;
let cubeY = HEIGHT / 2;
let cubeZ = 0;
let size = HEIGHT / 4;

let vertices = [
    new vec3(cubeX - size, cubeY - size, cubeZ - size),
    new vec3(cubeX + size, cubeY - size, cubeZ - size),
    new vec3(cubeX + size, cubeY + size, cubeZ - size),
    new vec3(cubeX - size, cubeY + size, cubeZ - size),
    new vec3(cubeX - size, cubeY - size, cubeZ + size),
    new vec3(cubeX + size, cubeY - size, cubeZ + size),
    new vec3(cubeX + size, cubeY + size, cubeZ + size),
    new vec3(cubeX - size, cubeY + size, cubeZ + size)
]


//Copied from https://stackoverflow.com/questions/7790725/javascript-track-mouse-position
function track(e) {
    mouseX = e.pageX;
    mouseY = e.pageY;
}

function subtract(v1, v2){
    return new vec3(
        v1.x - v2.x,
        v1.y - v2.y,
        v1.z - v2.z
    );
}

function cross(v1, v2) {
    let x = v1.y * v2.z - v1.z * v2.y;
    let y = v1.z * v2.x - v1.x * v2.z;
    let z = v1.x * v2.y - v1.y * v2.x;
    return new vec3(x, y, z);
}

function dot(v1, v2){
    return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
}

function mag(v1){
    return Math.sqrt(v1.x*v1.x + v1.y*v1.y + v1.z*v1.z);
}

function normalize(v1){
    let m = mag(v1);
    return new vec3(
        v1.x / m,
        v1.y / m,
        v1.z / m
    );
}

//Make all of the cubes.
let cubes = []
let copies = copySlider.value;
let prevCopyCount = -1;

requestAnimationFrame(draw);

function draw(elapsedTime){
    timeDelta = elapsedTime - timeLast;
    timeLast = elapsedTime;

    context.fillStyle = BACKGROUND;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = COLOR_FACE;

    //If the number of copies changed, we need to remake the array.
    if(prevCopyCount != copySlider.value){
        copies = copySlider.value;
        prevCopyCount = copies;
        scaledSize = WIDTH / copies;
        cubes = [];
        for(let i = 0; i < copies; i++){
            for(let j = 0; j < copies; j++){
                cubes.push(new Cube(j * (WIDTH/copies) + scaledSize/2, i * scaledSize + HEIGHT/(copies*copies), 0, scaledSize/4, Math.random() * 256, Math.random() * 256, Math.random() * 256))
            }
        }

        //Special behavior if it is 1.
        if(cubes.length == 1){
            cubes[0].cubeX = WIDTH/2;
            cubes[0].cubeY = HEIGHT/2;
            cubes[0].updateVerts();
        }
    }
    
    for(let cube of cubes){
        cube.drawCube(timeDelta);
    }



    requestAnimationFrame(draw);
}

addEventListener("mousemove", track, false);







