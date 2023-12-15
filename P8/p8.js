const canvas = document.getElementById('myCanvas');
const gl = canvas.getContext("webgl", {premultipliedAlpha: false});
const stats = document.getElementById('overlayText'); //Information about renderer.
let timeDelta = 0;
let timeLast = 0;
let obj = null;
let materials = null;
let cameraPosition = [-16, 70, -66];
let lightPosition = [2,8,13];
let velocity = [0,0,0];
let textures = {};
let tCamera;
var yaw = 0.9480000000000002;
var pitch = -0.014;
var isMouseLocked = false;
var lastMouseX;
var lastMouseY;

let shaderProgram, cloudProgram, skyboxProgram;
let globalTime = 0;
let polygonsRendered = 0;
let depthDisplay = false; //Depth buffer being displayed
let overlayOn = true;
let nerdMode = false;
let models = []

class Model {
  constructor(objSrc, materialSrc){
    this.obj = parseOBJ(objSrc);
    this.materials = parseMTL(materialSrc);
    this.textures = {}
  }
}

//Loading functions are from: https://webglfundamentals.org/webgl/lessons/webgl-load-obj.html
function parseOBJ(text) {
    // because indices are base 1 let's just fill in the 0th data
    const objPositions = [[0, 0, 0]];
    const objTexcoords = [[0, 0]];
    const objNormals = [[0, 0, 0]];
    const objColors = [[0, 0, 0]];
  
    // same order as `f` indices
    const objVertexData = [
      objPositions,
      objTexcoords,
      objNormals,
      objColors,
    ];
  
    // same order as `f` indices
    let webglVertexData = [
      [],   // positions
      [],   // texcoords
      [],   // normals
      [],   // colors
    ];
  
    const materialLibs = [];
    const geometries = [];
    let geometry;
    let groups = ['default'];
    let material = 'default';
    let object = 'default';
  
    const noop = () => {};
  
    function newGeometry() {
      // If there is an existing geometry and it's
      // not empty then start a new one.
      if (geometry && geometry.data.position.length) {
        geometry = undefined;
      }
    }
  
    function setGeometry() {
      if (!geometry) {
        const position = [];
        const texcoord = [];
        const normal = [];
        const color = [];
        webglVertexData = [
          position,
          texcoord,
          normal,
          color,
        ];
        geometry = {
          object,
          groups,
          material,
          data: {
            position,
            texcoord,
            normal,
            color,
          },
        };
        geometries.push(geometry);
      }
    }
  
    function addVertex(vert) {
      const ptn = vert.split('/');
      ptn.forEach((objIndexStr, i) => {
        if (!objIndexStr) {
          return;
        }
        const objIndex = parseInt(objIndexStr);
        const index = objIndex + (objIndex >= 0 ? 0 : objVertexData[i].length);
        webglVertexData[i].push(...objVertexData[i][index]);
        // if this is the position index (index 0) and we parsed
        // vertex colors then copy the vertex colors to the webgl vertex color data
        if (i === 0 && objColors.length > 1) {
          geometry.data.color.push(...objColors[index]);
        }
      });
    }
  
    const keywords = {
      v(parts) {
        // if there are more than 3 values here they are vertex colors
        if (parts.length > 3) {
          objPositions.push(parts.slice(0, 3).map(parseFloat));
          objColors.push(parts.slice(3).map(parseFloat));
        } else {
          objPositions.push(parts.map(parseFloat));
        }
      },
      vn(parts) {
        objNormals.push(parts.map(parseFloat));
      },
      vt(parts) {
        // should check for missing v and extra w?
        objTexcoords.push(parts.map(parseFloat));
      },
      f(parts) {
        setGeometry();
        const numTriangles = parts.length - 2;
        for (let tri = 0; tri < numTriangles; ++tri) {
          addVertex(parts[0]);
          addVertex(parts[tri + 1]);
          addVertex(parts[tri + 2]);
        }
      },
      s: noop,    // smoothing group
      mtllib(parts, unparsedArgs) {
        // the spec says there can be multiple filenames here
        // but many exist with spaces in a single filename
        materialLibs.push(unparsedArgs);
      },
      usemtl(parts, unparsedArgs) {
        material = unparsedArgs;
        newGeometry();
      },
      g(parts) {
        groups = parts;
        newGeometry();
      },
      o(parts, unparsedArgs) {
        object = unparsedArgs;
        newGeometry();
      },
    };

    const keywordRE = /(\w*)(?: )*(.*)/;
    const lines = text.split('\n');
    for (let lineNo = 0; lineNo < lines.length; ++lineNo) {
      const line = lines[lineNo].trim();
      if (line === '' || line.startsWith('#')) {
        continue;
      }
      const m = keywordRE.exec(line);
      if (!m) {
        continue;
      }
      const [, keyword, unparsedArgs] = m;
      const parts = line.split(/\s+/).slice(1);
      const handler = keywords[keyword];
      if (!handler) {
        console.warn('unhandled keyword:', keyword);  // eslint-disable-line no-console
        continue;
      }
      handler(parts, unparsedArgs);
    }
  
    // remove any arrays that have no entries.
    for (const geometry of geometries) {
      geometry.data = Object.fromEntries(
          Object.entries(geometry.data).filter(([, array]) => array.length > 0));
    }

    function normalCalc(v1, v2, v3){
      let dir = vec3.cross(vec3.create(), vec3.sub(vec3.create(), v2, v1), vec3.sub(vec3.create(), v3, v1));
      return vec3.normalize(vec3.create(), dir);
    }

    for(const geometry of geometries){
      if(!geometry.data.normal){
        geometry.data.normal = [];
        //Manually generate normals
        for(let i = 0; i < geometry.data.position.length; i += 9){
          //We need to calculate the cross product for each point and assign it a unique normal.
          let A = vec3.fromValues(geometry.data.position[i], geometry.data.position[i+1], geometry.data.position[i+2]);
          let B = vec3.fromValues(geometry.data.position[i+3], geometry.data.position[i+4], geometry.data.position[i+5]);
          let C = vec3.fromValues(geometry.data.position[i+6], geometry.data.position[i+7], geometry.data.position[i+8]);

          //Normal calc (insertion needs to be decomposed to have a flattened array.)
          let normal = normalCalc(A, B, C);
          for(let j = 0; j < 3; j++){
            geometry.data.normal.push(normal[0]);
            geometry.data.normal.push(normal[1]);
            geometry.data.normal.push(normal[2]);
          }
        }
      }

      //Generate index buffer
      if(!geometry.data.indices){
        geometry.data.indices = []; //Winding is already correct as is the face ordering. So we can literally just make a loop.
        for(let i = 0; i < geometry.data.position.length; i++){
          geometry.data.indices.push(i);
        }
      }

      geometry.data.position = new Float32Array(geometry.data.position);
      geometry.data.normal = new Float32Array(geometry.data.normal);
      geometry.data.texcoord = new Float32Array(geometry.data.texcoord);
      geometry.data.indices = new Uint16Array(geometry.data.indices);
    }

    return {
      geometries,
      materialLibs,
    };
  }

  function parseMapArgs(unparsedArgs) {
    // TODO: handle options
    return unparsedArgs;
  }

  function parseMTL(text) {
    const materials = {};
    let material;
  
    const keywords = {
      newmtl(parts, unparsedArgs) {
        material = {};
        materials[unparsedArgs] = material;
      },
      /* eslint brace-style:0 */
      Ns(parts)       { material.shininess      = parseFloat(parts[0]); },
      Ka(parts)       { material.ambient        = parts.map(parseFloat); },
      Kd(parts)       { material.diffuse        = parts.map(parseFloat); },
      Ks(parts)       { material.specular       = parts.map(parseFloat); },
      Ke(parts)       { material.emissive       = parts.map(parseFloat);},
      map_Kd(parts, unparsedArgs)   { material.diffuseMap = parseMapArgs(unparsedArgs); },
      map_Ns(parts, unparsedArgs)   { material.specularMap = parseMapArgs(unparsedArgs); },
      map_Bump(parts, unparsedArgs) { material.normalMap = parseMapArgs(unparsedArgs); },
      Ni(parts)       { material.opticalDensity = parseFloat(parts[0]); },
      d(parts)        { material.opacity        = parseFloat(parts[0]); },
      illum(parts)    { material.illum          = parseInt(parts[0]); },
    };
  
    const keywordRE = /(\w*)(?: )*(.*)/;
    const lines = text.split('\n');
    for (let lineNo = 0; lineNo < lines.length; ++lineNo) {
      const line = lines[lineNo].trim();
      if (line === '' || line.startsWith('#')) {
        continue;
      }
      const m = keywordRE.exec(line);
      if (!m) {
        continue;
      }
      const [, keyword, unparsedArgs] = m;
      const parts = line.split(/\s+/).slice(1);
      const handler = keywords[keyword];
      if (!handler) {
        //console.warn('unhandled keyword:', keyword);  // eslint-disable-line no-console
        continue;
      }
      handler(parts, unparsedArgs);
    }
  
    return materials;
}

async function loadImageBitmap(url) {
  const response = await fetch(url);
  const blob = await response.blob();
  return createImageBitmap(blob);
}

async function setup(){
    objSrc = [Cloudtop]
    matSrc = [CloudtopMat]
    for(let i = 0; i < objSrc.length; i++){
      models.push(new Model(objSrc[i], matSrc[i]));
      
      for(const geometry of models[i].obj.geometries){
        
        const url = "data:image/png;base64," + texturesBase64[(models[i].materials[geometry.material].diffuseMap).toLowerCase()]
        models[i].textures[geometry.material] = await loadImageBitmap(url);
        models[i].textures[geometry.material].crossOrigin = "anonymous";
        models[i].materials[geometry.material].isNormalMap = models[i].materials[geometry.material].diffuseMap.includes("Nrm");
      }
    }

    canvas.width = document.body.clientWidth;
    canvas.height = document.body.clientHeight;

    var castleVert = document.getElementById("castleVert").text;
    var castleFrag = document.getElementById("castleFrag").text;
    var cloudVert = document.getElementById("cloudVert").text;
    var cloudFrag = document.getElementById("cloudFrag").text;
    var skyboxVert = document.getElementById("skyboxVert").text;
    var skyboxFrag = document.getElementById("skyboxFrag").text;
    
    //Compile Shaders
    var castleVertShader = gl.createShader(gl.VERTEX_SHADER);
    var cloudVertShader = gl.createShader(gl.VERTEX_SHADER);
    var skyboxVertShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(castleVertShader,castleVert);
    gl.compileShader(castleVertShader);
    if (!gl.getShaderParameter(castleVertShader, gl.COMPILE_STATUS)) {
      alert(gl.getShaderInfoLog(castleVertShader)); return null; }
    
    gl.shaderSource(cloudVertShader,cloudVert);
    gl.compileShader(cloudVertShader);
    if (!gl.getShaderParameter(cloudVertShader, gl.COMPILE_STATUS)) {
      alert(gl.getShaderInfoLog(cloudVertShader)); return null; }
    
    gl.shaderSource(skyboxVertShader,skyboxVert);
    gl.compileShader(skyboxVertShader);
    if (!gl.getShaderParameter(skyboxVertShader, gl.COMPILE_STATUS)) {
      alert(gl.getShaderInfoLog(skyboxVertShader)); return null; }
    
    // Compile fragment shader
    var castleFragShader = gl.createShader(gl.FRAGMENT_SHADER);
    var cloudFragShader = gl.createShader(gl.FRAGMENT_SHADER);
    var skyboxFragShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(castleFragShader,castleFrag);
    gl.compileShader(castleFragShader);
    if (!gl.getShaderParameter(castleFragShader, gl.COMPILE_STATUS)) {
      alert(gl.getShaderInfoLog(castleFragShader)); return null; }
    
    gl.shaderSource(cloudFragShader,cloudFrag);
    gl.compileShader(cloudFragShader);
    if (!gl.getShaderParameter(cloudFragShader, gl.COMPILE_STATUS)) {
      alert(gl.getShaderInfoLog(cloudFragShader)); return null; }
    
    gl.shaderSource(skyboxFragShader,skyboxFrag);
    gl.compileShader(skyboxFragShader);
    if (!gl.getShaderParameter(skyboxFragShader, gl.COMPILE_STATUS)) {
      alert(gl.getShaderInfoLog(skyboxFragShader)); return null; }
    
    //Attach shaders
    shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, castleVertShader);
    gl.attachShader(shaderProgram, castleFragShader);
    gl.linkProgram(shaderProgram);
    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      alert("Could not initialize shaders"); }
    gl.useProgram(shaderProgram);	 
    
    shaderProgram.PositionAttribute = gl.getAttribLocation(shaderProgram, "vPosition");
    gl.enableVertexAttribArray(shaderProgram.PositionAttribute);
    
    shaderProgram.NormalAttribute = gl.getAttribLocation(shaderProgram, "vNormal");
    gl.enableVertexAttribArray(shaderProgram.NormalAttribute);    

    shaderProgram.texcoordAttribute = gl.getAttribLocation(shaderProgram, "vTexCoord");
    gl.enableVertexAttribArray(shaderProgram.texcoordAttribute);

    shaderProgram.texSampler1 = gl.getUniformLocation(shaderProgram, "texSampler1");
    gl.uniform1i(shaderProgram.texSampler1, 0);
    
    // this gives us access to the matrix uniform
    shaderProgram.MVPmatrix = gl.getUniformLocation(shaderProgram,"uMVP");
    shaderProgram.MVmatrix = gl.getUniformLocation(shaderProgram,"uMV");
    shaderProgram.MVnmatrix = gl.getUniformLocation(shaderProgram,"uMVn");
    shaderProgram.time = gl.getUniformLocation(shaderProgram, "time");
    shaderProgram.lightPos = gl.getUniformLocation(shaderProgram, "lightPos");
    shaderProgram.depthDisplay = gl.getUniformLocation(shaderProgram,"depthDisplay");
    shaderProgram.ambientColor = gl.getUniformLocation(shaderProgram, "ambientColor");
    shaderProgram.diffuseColor = gl.getUniformLocation(shaderProgram, "diffuseColor");
    shaderProgram.specularColor = gl.getUniformLocation(shaderProgram, "specularColor");
    shaderProgram.emissiveColor = gl.getUniformLocation(shaderProgram, "emissiveColor");

    //Water setup
    cloudProgram = gl.createProgram();
    gl.attachShader(cloudProgram, cloudVertShader);
    gl.attachShader(cloudProgram, cloudFragShader);
    gl.linkProgram(cloudProgram);
    if (!gl.getProgramParameter(cloudProgram, gl.LINK_STATUS)) {
      alert("Could not initialize shaders"); }
    gl.useProgram(cloudProgram);
    
    cloudProgram.PositionAttribute = gl.getAttribLocation(cloudProgram, "vPosition");
    gl.enableVertexAttribArray(cloudProgram.PositionAttribute);
    
    cloudProgram.NormalAttribute = gl.getAttribLocation(cloudProgram, "vNormal");
    gl.enableVertexAttribArray(cloudProgram.NormalAttribute);  

    cloudProgram.texcoordAttribute = gl.getAttribLocation(cloudProgram, "vTexCoord");
    gl.enableVertexAttribArray(cloudProgram.texcoordAttribute);

    cloudProgram.texSampler1 = gl.getUniformLocation(cloudProgram, "texSampler1");
    cloudProgram.texSampler2 = gl.getUniformLocation(cloudProgram, "texSampler2");
    gl.uniform1i(cloudProgram.texSampler1, 0);
    gl.uniform1i(cloudProgram.texSampler2, 1);

    cloudProgram.MVPmatrix = gl.getUniformLocation(cloudProgram,"uMVP");
    cloudProgram.MVmatrix = gl.getUniformLocation(cloudProgram,"uMV");
    cloudProgram.MVnmatrix = gl.getUniformLocation(cloudProgram,"uMVn");
    cloudProgram.time = gl.getUniformLocation(cloudProgram, "time");
    cloudProgram.lightPos = gl.getUniformLocation(cloudProgram, "lightPos");

    //Skybox setup
    skyboxProgram = gl.createProgram();
    gl.attachShader(skyboxProgram, skyboxVertShader);
    gl.attachShader(skyboxProgram, skyboxFragShader);
    gl.linkProgram(skyboxProgram);
    if (!gl.getProgramParameter(skyboxProgram, gl.LINK_STATUS)) {
      alert("Could not initialize shaders"); }
    gl.useProgram(skyboxProgram);

    //Attributes
    skyboxProgram.PositionAttribute = gl.getAttribLocation(skyboxProgram, "vPosition");
    gl.enableVertexAttribArray(skyboxProgram.PositionAttribute);

    //Uniforms
    skyboxProgram.viewProjInv = gl.getUniformLocation(skyboxProgram, "uViewProjInv");
    skyboxProgram.skybox = gl.getUniformLocation(skyboxProgram, "uSkybox");
    gl.uniform1i(skyboxProgram.skybox, 0);

    requestAnimationFrame(draw);
}

function renderWater(texture, proj, model_view, trans_mat){
  gl.useProgram(cloudProgram);
  for(const geometry of models[1].obj.geometries){
    let model = models[1]
    let trianglePosBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, trianglePosBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, geometry.data.position, gl.STATIC_DRAW);
    trianglePosBuffer.itemSize = 3;
    trianglePosBuffer.numItems = geometry.data.position.length/3;

    //Normal Buffer
    let normalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, geometry.data.normal, gl.STATIC_DRAW);
    normalBuffer.itemSize = 3;
    normalBuffer.numItems = geometry.data.normal.length/3;
    
    //Texture UV Buffer
    let textureBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, textureBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, geometry.data.texcoord, gl.STATIC_DRAW);
    textureBuffer.itemSize = 2;
    textureBuffer.numItems = geometry.data.texcoord.length/2;

    //Index Buffer
    let indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.data.indices, gl.STATIC_DRAW);
    
    //Setup uniforms
    gl.uniformMatrix4fv(cloudProgram.MVmatrix, false, model_view);
    gl.uniformMatrix4fv(cloudProgram.MVPmatrix,false, proj);
    gl.uniformMatrix3fv(cloudProgram.MVnmatrix, false, trans_mat);
    gl.uniform1f(cloudProgram.time, globalTime);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.vertexAttribPointer(cloudProgram.NormalAttribute, normalBuffer.itemSize, gl.FLOAT,false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, trianglePosBuffer);
    gl.vertexAttribPointer(cloudProgram.PositionAttribute, trianglePosBuffer.itemSize, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, textureBuffer);
    gl.vertexAttribPointer(cloudProgram.texcoordAttribute, textureBuffer.itemSize, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, model.textures[geometry.material]);

    gl.drawElements(gl.TRIANGLES, trianglePosBuffer.numItems, gl.UNSIGNED_SHORT, 0);
    polygonsRendered += trianglePosBuffer.numItems 
  }
}

function renderCloud(model, geometry, proj, model_view, trans_mat){
  let normalMap = gl.createTexture();
  let cloudTex = gl.createTexture();
   
  gl.useProgram(cloudProgram);
  let trianglePosBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, trianglePosBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, geometry.data.position, gl.STATIC_DRAW);
  trianglePosBuffer.itemSize = 3;
  trianglePosBuffer.numItems = geometry.data.position.length/3;

  //Normal Buffer
  let normalBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, geometry.data.normal, gl.STATIC_DRAW);
  normalBuffer.itemSize = 3;
  normalBuffer.numItems = geometry.data.normal.length/3;
  
  //Texture UV Buffer
  let textureBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, textureBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, geometry.data.texcoord, gl.STATIC_DRAW);
  textureBuffer.itemSize = 2;
  textureBuffer.numItems = geometry.data.texcoord.length/2;

  //Index Buffer
  let indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.data.indices, gl.STATIC_DRAW);
  
  //Setup uniforms
  gl.uniformMatrix4fv(cloudProgram.MVmatrix, false, model_view);
  gl.uniformMatrix4fv(cloudProgram.MVPmatrix,false, proj);
  gl.uniformMatrix3fv(cloudProgram.MVnmatrix, false, trans_mat);
  gl.uniform3fv(cloudProgram.lightPos, lightPosition);
  gl.uniform1f(cloudProgram.time, globalTime);
  
  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
  gl.vertexAttribPointer(cloudProgram.NormalAttribute, normalBuffer.itemSize, gl.FLOAT,false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, trianglePosBuffer);
  gl.vertexAttribPointer(cloudProgram.PositionAttribute, trianglePosBuffer.itemSize, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, textureBuffer);
  gl.vertexAttribPointer(cloudProgram.texcoordAttribute, textureBuffer.itemSize, gl.FLOAT, false, 0, 0);

  //Render Normal map.
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, normalMap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); // Use REPEAT for horizontal wrapping
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT); // Use REPEAT for vertical wrapping
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, model.textures[geometry.material]);

  //Actual cloud texture.
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, cloudTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); // Use REPEAT for horizontal wrapping
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT); // Use REPEAT for vertical wrapping
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, model.textures["cl_cloudroad"]);

  gl.drawElements(gl.TRIANGLES, trianglePosBuffer.numItems, gl.UNSIGNED_SHORT, 0);
  polygonsRendered += trianglePosBuffer.numItems
}

function renderSkybox(proj, model_view, trans_mat, viewProjInv){
  gl.useProgram(skyboxProgram);
  gl.activeTexture(gl.TEXTURE1);

  let tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex);
  gl.uniformMatrix4fv(skyboxProgram.viewProjInv, false, viewProjInv);

  var positions = new Float32Array(
    [
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]);

  let cubeBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  cubeBuffer.itemSize = 2;
  cubeBuffer.numItems = positions.length/2;

  gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuffer);
  gl.vertexAttribPointer(skyboxProgram.PositionAttribute, cubeBuffer.itemSize, gl.FLOAT, false, 0, 0);

  var targets = [
    gl.TEXTURE_CUBE_MAP_POSITIVE_X, gl.TEXTURE_CUBE_MAP_NEGATIVE_X, 
    gl.TEXTURE_CUBE_MAP_POSITIVE_Y, gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, 
    gl.TEXTURE_CUBE_MAP_POSITIVE_Z, gl.TEXTURE_CUBE_MAP_NEGATIVE_Z 
  ];

  const level = 0;
  const internalFormat = gl.RGBA;
  const width = 1;
  const height = 1;
  const format = gl.RGBA;
  const type = gl.UNSIGNED_BYTE;

  for(let i = 0; i < 6; i++){
    gl.texImage2D(targets[i], level, internalFormat, width, height, 0, format, type, null);
    const image = new Image();
    image.src = "data:image/png;base64," + texturesBase64['skybox.png'];
    image.onload = () => {
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex);
      gl.texImage2D(targets[i], level, internalFormat, format, type, image);
      gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
    }
  }

  gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
   gl.uniform1i(skyboxProgram.skybox, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 1 * 6);

  if(gl.getError() != 0)
    console.log(gl.getError())
}


function createDepthTexture(){
  const depthTexture = gl.createTexture();
  const depthTextureSize = 512;
  gl.bindTexture(gl.TEXTURE_2D, depthTexture);

  gl.texImage2D(
    gl.TEXTURE_2D,      // target
    0,                  // mip level
    gl.DEPTH_COMPONENT, // internal format
    depthTextureSize,   // width
    depthTextureSize,   // height
    0,                  // border
    gl.DEPTH_COMPONENT, // format
    gl.UNSIGNED_INT,    // type
    null                 // data
  );     
  
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const depthFramebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, depthFramebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,       // target
    gl.DEPTH_ATTACHMENT,  // attachment point
    gl.TEXTURE_2D,        // texture target
    depthTexture,         // texture
    0                     // mip level
  );            
  
  

}

function renderModel(proj, model_view, trans_mat, viewProjInv){
    let texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    // Set texture parameters (adjust as needed)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); // Use REPEAT for horizontal wrapping
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT); // Use REPEAT for vertical wrapping


    //Skybox and water get rendered first.
    renderSkybox(proj, model_view, trans_mat, viewProjInv);

    count = 0; //If 1 its water
    for(const geometry of models[0].obj.geometries){
      let model = models[0]
      if(model.materials[geometry.material].isNormalMap){
        renderCloud(model, geometry, proj, model_view, trans_mat);
        continue;
      }
      
      gl.useProgram(shaderProgram);
      gl.activeTexture(gl.TEXTURE0);

      //Vertex buffer
      let trianglePosBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, trianglePosBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, geometry.data.position, gl.STATIC_DRAW);
      trianglePosBuffer.itemSize = 3;
      trianglePosBuffer.numItems = geometry.data.position.length/3;

      //Normal Buffer
      let normalBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, geometry.data.normal, gl.STATIC_DRAW);
      normalBuffer.itemSize = 3;
      normalBuffer.numItems = geometry.data.normal.length/3;
      
      //Texture UV Buffer
      let textureBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, textureBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, geometry.data.texcoord, gl.STATIC_DRAW);
      textureBuffer.itemSize = 2;
      textureBuffer.numItems = geometry.data.texcoord.length/textureBuffer.itemSize;

      //Index Buffer
      let indexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.data.indices, gl.STATIC_DRAW);

      // Set up uniforms & attributes
      gl.uniformMatrix4fv(shaderProgram.MVmatrix, false, model_view);
      gl.uniformMatrix4fv(shaderProgram.MVPmatrix,false, proj);
      gl.uniformMatrix3fv(shaderProgram.MVnmatrix,false, trans_mat);

      gl.uniform1f(shaderProgram.time, globalTime);
      gl.uniform1i(shaderProgram.depthDisplay, depthDisplay);
      gl.uniform3fv(shaderProgram.lightPos,lightPosition);
      gl.uniform3fv(shaderProgram.ambientColor,model.materials[geometry.material].ambient);
      gl.uniform3fv(shaderProgram.diffuseColor,model.materials[geometry.material].diffuse);
      gl.uniform3fv(shaderProgram.specularColor,model.materials[geometry.material].specular);
      gl.uniform3fv(shaderProgram.emissiveColor, model.materials[geometry.material].emissive != undefined ? model.materials[geometry.material].emissive : [0,0,0]);

      gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
      gl.vertexAttribPointer(shaderProgram.NormalAttribute, normalBuffer.itemSize, gl.FLOAT,false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, trianglePosBuffer);
      gl.vertexAttribPointer(shaderProgram.PositionAttribute, trianglePosBuffer.itemSize, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, textureBuffer);
      gl.vertexAttribPointer(shaderProgram.texcoordAttribute, textureBuffer.itemSize, gl.FLOAT, false, 0, 0);
      
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, model.textures[geometry.material]);
      //Generate a mipmap
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      
      // Do the drawing
      gl.drawElements(gl.TRIANGLES, trianglePosBuffer.numItems, gl.UNSIGNED_SHORT, 0);
      polygonsRendered += trianglePosBuffer.numItems 
    }
}

function draw(elapsedTime) {
    canvas.width = canvas.width;
    timeDelta = elapsedTime - timeLast;
    timeLast = elapsedTime;
    globalTime = elapsedTime / 1000.0;
    polygonsRendered = 0;

    var tModel = mat4.create();
    //mat4.fromScaling(tModel,[1000,1000,1000]);
    updateCamera();

    let viewMatrix = mat4.invert(mat4.create(), tCamera);
    // We only care about direction so remove the translation
    viewMatrix[12] = 0;
    viewMatrix[13] = 0;
    viewMatrix[14] = 0;

    var tProjection = mat4.create();
    const aspect = canvas.clientWidth / canvas.clientHeight;
    mat4.perspective(tProjection,Math.PI/4,aspect,1,100000);
    
    var tMVP = mat4.create();
    let tMV = mat4.multiply(tMVP,tCamera,tModel); // "modelView" matrix
    let tMVn = mat3.normalFromMat4(mat3.create(),tMV);
    let viewDirectionProjectionMatrix = mat4.multiply(mat4.create(), tProjection, viewMatrix);
    let viewDirectionProjectionInverseMatrix = mat4.invert(mat4.create(), viewDirectionProjectionMatrix);
    mat4.multiply(tMVP,tProjection,tMV);

    // Clear screen, prepare for rendering
    gl.clearColor(0.0, 0.0, 0.2, 1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    gl.depthFunc(gl.LEQUAL);
    gl.cullFace(gl.BACK);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    renderModel(tMVP, tMV, tMVn, viewDirectionProjectionInverseMatrix);

    //Update text
    updateStatistics(timeDelta);

    requestAnimationFrame(draw);
}

function updateStatistics(timeDelta){
  stats.innerText = '';
  if(overlayOn && !nerdMode){
    stats.innerText = `FPS: ${(1000.0/timeDelta).toFixed(2)}
    Displaying Depth Buffer? ${depthDisplay}
    Polygons Rendered: ${polygonsRendered}
    Position: (${cameraPosition.map((x) => x.toFixed(2)).join(",")})
    Light Position: (${lightPosition.map((x) => x.toFixed(2)).join(",")})
    This is a rendering of Cloudtop Cruise from Mario Kart 8 DX.
    Click anywhere to lock the mouse to allow for flight.
    Use WASD to move laterally, EQ to ascend and descend respectively.
    Use UIO to change the light position on the XYZ axes. Hold shift to decrease their value.
    Hit H to toggle any overlay. Hit N to toggle some technical details (nerd stuff).
    `
  }
  else if(overlayOn && nerdMode){
    stats.innerText = `As I stated earlier, this model is from Mario Kart 8 DX for the Nintendo Switch.
    Due to the huge jump in power between the Wii and Switch, there are ~524,000 polygons being rendered in this scene.
    The performance is poor because I am not doing any frustum culling due to time constraints and the texture
    quality being very high. I am unsure why WebGL is so bottle-necked by texImage2D (70% of lag is from this),
    and I searched for any optimizations with no luck.
    The clouds actually use normal maps (as do a large amount of the textures), which in addition with the higher
    texture quality add a lot more detail to each model. The clouds are a bit too bright for my liking, but the
    alternative was to make them too shiny, and that looked strange.
    As you have probably also noticed, there is a skybox! It still has some bad performance implications due to 
    how the code is setup, but I decided to add it for this project since the scene looked dull without it. It
    moves a bit too quickly for my liking, and I am not sure how to fix that.

    Anyway, this class was fun, enjoy exploring!
    `;
  }
}

window.onload = setup;
document.addEventListener('keydown', handleKeyDown);
document.addEventListener('keyup', handleKeyUp);
document.addEventListener('keydown', handleKeyPress);
document.addEventListener('mousemove', handleMouseMove);
canvas.addEventListener('click', lockMouse);

var keyState = {};

function handleKeyDown(event) {
  keyState[event.key] = true;
}

function handleKeyUp(event) {
  keyState[event.key] = false;
}

function handleKeyPress() {
  var acceleration = 1.0; // Adjust acceleration as needed

  if (keyState['w']) {
    velocity[0] += acceleration * Math.cos(yaw);
    velocity[2] += acceleration * Math.sin(yaw);
  }
  if (keyState['a']) {
    velocity[0] -= acceleration;
  }
  if (keyState['s']) {
    velocity[0] -= acceleration * Math.cos(yaw);
    velocity[2] -= acceleration * Math.sin(yaw);
  }
  if (keyState['d']) {
    velocity[0] += acceleration;
  }
  if (keyState['q']) {
    velocity[1] -= acceleration;
  }
  if (keyState['e']) {
    velocity[1] += acceleration;
  }

  // Handle other keys as needed

  if (keyState['Escape']) {
    isMouseLocked = false;
    document.exitPointerLock();
  }

  if (keyState['z']) {
    depthDisplay = !depthDisplay;
  }

  if (keyState['u']) {
    lightPosition[0] += keyState['Shift'] ? -1.0 : 1.0;
  }
  if (keyState['i']) {
    lightPosition[1] += keyState['Shift'] ? -1.0 : 1.0;
  }
  if (keyState['o']) {
    lightPosition[2] += keyState['Shift'] ? -1.0 : 1.0;
  }

  if(keyState['h']){
    overlayOn = !overlayOn;
  }

  if(keyState['n']){
    nerdMode = !nerdMode;
  }
}

document.addEventListener('keydown', handleKeyDown);
document.addEventListener('keyup', handleKeyUp);

function lockMouse() {
  canvas.requestPointerLock();
}

// Lock the mouse when the canvas is clicked
canvas.addEventListener('click', function () {
  isMouseLocked = true;
});

// Handle mouse movement events
function handleMouseMove(event) {
  if (isMouseLocked) {
      var movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
      var movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

      yaw -= movementX * 0.002;
      pitch -= movementY * 0.002;

      // Clamp pitch to avoid flipping
      pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
  }
}

// Update the camera transformation
function updateCamera() {
  cameraPosition[0] += velocity[0];
  cameraPosition[1] += velocity[1];
  cameraPosition[2] += velocity[2];

  // Damping to gradually slow down the camera
  velocity[0] *= 0.9;
  velocity[1] *= 0.9;
  velocity[2] *= 0.9;

  var eye = cameraPosition;
  var target = [
      eye[0] + Math.cos(yaw) * Math.cos(pitch),
      eye[1] + Math.sin(pitch),
      eye[2] + Math.sin(yaw) * Math.cos(pitch)
  ];
  var up = [0, 1, 0];
  tCamera = mat4.create();
  mat4.lookAt(tCamera, eye, target, up);
}

const observer = new ResizeObserver((entries) => {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);
});
observer.observe(canvas)










