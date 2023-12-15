const canvas = document.getElementById('myCanvas');
const gl = canvas.getContext("webgl", {premultipliedAlpha: false});
const stats = document.getElementById('overlayText'); //Information about renderer.
let timeDelta = 0;
let timeLast = 0;
let obj = null;
let materials = null;
let cameraPosition = [9540, 3500, 9385];
let lightPosition = [-3,3,9];
let velocity = [0,0,0];
let textures = {};
let tCamera;
var yaw = 0;
var pitch = 0;
var isMouseLocked = false;
var lastMouseX;
var lastMouseY;

let shaderProgram, waterProgram, skyboxProgram;
let globalTime = 0;
let polygonsRendered = 0;
let depthDisplay = false; //Depth buffer being displayed
let overlayOn = true;
let nerdMode = false;

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


function setup(){
    obj = parseOBJ(PeachCastle);
    materials = parseMTL(PeachCastleMat);
    canvas.width = document.body.clientWidth;
    canvas.height = document.body.clientHeight;

    //Load the textures (just diffuse map)
    for(const geometry of obj.geometries){
      textures[geometry.material] = new Image();
      textures[geometry.material].crossOrigin = "anonymous";
      textures[geometry.material].src = "data:image/png;base64," + texturesBase64[materials[geometry.material].diffuseMap];
    }

    var castleVert = document.getElementById("castleVert").text;
    var castleFrag = document.getElementById("castleFrag").text;
    var waterVert = document.getElementById("waterVert").text;
    var waterFrag = document.getElementById("waterFrag").text;
    var skyboxVert = document.getElementById("skyboxVert").text;
    var skyboxFrag = document.getElementById("skyboxFrag").text;
    
    //Compile Shaders
    var castleVertShader = gl.createShader(gl.VERTEX_SHADER);
    var waterVertShader = gl.createShader(gl.VERTEX_SHADER);
    var skyboxVertShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(castleVertShader,castleVert);
    gl.compileShader(castleVertShader);
    if (!gl.getShaderParameter(castleVertShader, gl.COMPILE_STATUS)) {
      alert(gl.getShaderInfoLog(castleVertShader)); return null; }
    
    gl.shaderSource(waterVertShader,waterVert);
    gl.compileShader(waterVertShader);
    if (!gl.getShaderParameter(waterVertShader, gl.COMPILE_STATUS)) {
      alert(gl.getShaderInfoLog(waterVertShader)); return null; }
    
    gl.shaderSource(skyboxVertShader,skyboxVert);
    gl.compileShader(skyboxVertShader);
    if (!gl.getShaderParameter(skyboxVertShader, gl.COMPILE_STATUS)) {
      alert(gl.getShaderInfoLog(skyboxVertShader)); return null; }
    
    // Compile fragment shader
    var castleFragShader = gl.createShader(gl.FRAGMENT_SHADER);
    var waterFragShader = gl.createShader(gl.FRAGMENT_SHADER);
    var skyboxFragShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(castleFragShader,castleFrag);
    gl.compileShader(castleFragShader);
    if (!gl.getShaderParameter(castleFragShader, gl.COMPILE_STATUS)) {
      alert(gl.getShaderInfoLog(castleFragShader)); return null; }
    
    gl.shaderSource(waterFragShader,waterFrag);
    gl.compileShader(waterFragShader);
    if (!gl.getShaderParameter(waterFragShader, gl.COMPILE_STATUS)) {
      alert(gl.getShaderInfoLog(waterFragShader)); return null; }
    
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
    waterProgram = gl.createProgram();
    gl.attachShader(waterProgram, waterVertShader);
    gl.attachShader(waterProgram, waterFragShader);
    gl.linkProgram(waterProgram);
    if (!gl.getProgramParameter(waterProgram, gl.LINK_STATUS)) {
      alert("Could not initialize shaders"); }
    gl.useProgram(waterProgram);
    
    waterProgram.PositionAttribute = gl.getAttribLocation(waterProgram, "vPosition");
    gl.enableVertexAttribArray(waterProgram.PositionAttribute);
    
    waterProgram.NormalAttribute = gl.getAttribLocation(waterProgram, "vNormal");
    gl.enableVertexAttribArray(waterProgram.NormalAttribute);  

    waterProgram.texcoordAttribute = gl.getAttribLocation(waterProgram, "vTexCoord");
    gl.enableVertexAttribArray(waterProgram.texcoordAttribute);

    waterProgram.texSampler1 = gl.getUniformLocation(waterProgram, "texSampler1");
    gl.uniform1i(waterProgram.texSampler1, 0);

    waterProgram.MVPmatrix = gl.getUniformLocation(waterProgram,"uMVP");
    waterProgram.MVmatrix = gl.getUniformLocation(waterProgram,"uMV");
    waterProgram.MVnmatrix = gl.getUniformLocation(waterProgram,"uMVn");
    waterProgram.time = gl.getUniformLocation(waterProgram, "time");

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
    gl.uniform1i(skyboxProgram.skybox, 1);

    requestAnimationFrame(draw);
}

function renderWater(texture, proj, model_view, trans_mat){
  gl.useProgram(waterProgram);
  for(const geometry of obj.geometries){
    if(geometry.material.indexOf("lambert") == -1) continue;
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
    textureBuffer.itemSize = 3;
    textureBuffer.numItems = geometry.data.texcoord.length/3;

    //Index Buffer
    let indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.data.indices, gl.STATIC_DRAW);
    
    //Setup uniforms
    gl.uniformMatrix4fv(waterProgram.MVmatrix, false, model_view);
    gl.uniformMatrix4fv(waterProgram.MVPmatrix,false, proj);
    gl.uniformMatrix3fv(waterProgram.MVnmatrix, false, trans_mat);
    gl.uniform1f(waterProgram.time, globalTime);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.vertexAttribPointer(waterProgram.NormalAttribute, normalBuffer.itemSize, gl.FLOAT,false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, trianglePosBuffer);
    gl.vertexAttribPointer(waterProgram.PositionAttribute, trianglePosBuffer.itemSize, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, textureBuffer);
    gl.vertexAttribPointer(waterProgram.texcoordAttribute, textureBuffer.itemSize, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textures[geometry.material]);

    gl.drawElements(gl.TRIANGLES, trianglePosBuffer.numItems, gl.UNSIGNED_SHORT, 0);
    polygonsRendered += trianglePosBuffer.numItems 
  }
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
    image.src = "data:image/png;base64," + texturesBase64['GalaxySkyGalaxyL.png'];
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
    renderWater(texture, proj, model_view, trans_mat);
    renderSkybox(proj, model_view, trans_mat, viewProjInv);

    gl.useProgram(shaderProgram);
    for(const geometry of obj.geometries){
      if(geometry.material.indexOf("lambert") > -1) continue;
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
      textureBuffer.itemSize = 3;
      textureBuffer.numItems = geometry.data.texcoord.length/3;

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
      gl.uniform3fv(shaderProgram.ambientColor,materials[geometry.material].ambient);
      gl.uniform3fv(shaderProgram.diffuseColor,materials[geometry.material].diffuse);
      gl.uniform3fv(shaderProgram.specularColor,materials[geometry.material].specular);
      gl.uniform3fv(shaderProgram.emissiveColor,materials[geometry.material].emissive);

      gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
      gl.vertexAttribPointer(shaderProgram.NormalAttribute, normalBuffer.itemSize, gl.FLOAT,false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, trianglePosBuffer);
      gl.vertexAttribPointer(shaderProgram.PositionAttribute, trianglePosBuffer.itemSize, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, textureBuffer);
      gl.vertexAttribPointer(shaderProgram.texcoordAttribute, textureBuffer.itemSize, gl.FLOAT, false, 0, 0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textures[geometry.material]);
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
    //mat4.fromScaling(tModel,[100,100,100]);
    updateCamera();

    let viewMatrix = mat4.invert(mat4.create(), tCamera);
    // We only care about direction so remove the translation
    viewMatrix[12] = 0;
    viewMatrix[13] = 0;
    viewMatrix[14] = 0;

    var tProjection = mat4.create();
    const aspect = canvas.clientWidth / canvas.clientHeight;
    mat4.perspective(tProjection,Math.PI/4,aspect,10,100000);
    
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
    This is a rendering of the Star Festival from Super Mario Galaxy.
    Click anywhere to lock the mouse to allow for flight.
    Use WASD to move laterally, EQ to ascend and descend respectively.
    Use UIO to change the light position on the XYZ axes. Hold shift to decrease their value.
    Hit H to toggle any overlay. Hit N to toggle some technical details (nerd stuff).
    `
  }
  else if(overlayOn && nerdMode){
    stats.innerText = `As I stated earlier, this model is from Super Mario Galaxy (2006, yes really) for the Nintendo Wii.
    It is rendering ~170k polygons presumably (the math is a bit dubious on this, probably 17k), with NO Frustum culling
    being used because I am lazy and did not want to precalculate thousands of AABBs. 
    The lighting is standard blinn-phong, but I did use the specific material properties of each texture to light each polygon.
    I was planning to add shadow-mapping to add some more depth, as well as a post-processing bloom affect, but no time. Maybe for the last project.
    I wanted to add a skybox, and even in the code you can see me starting to work on that, but I ran into some errors that prevented me from doing it.
    The water is an interesting effect, it uses 2 scrolling textures with 1 scaled up slightly to minimize tiling (even though you can see it still), and
    I then compare it to a threshold in the shader to determine whether or not to draw it. Ideally, the water should also distort the pixels underneath it,
    so the reflection doesn't look so mirror-like, but I had some issues working with alpha that prevented me from adding that.
    Obviously, adding some sort of character would've been cool, but collision detection is one of the hardest things to perfect, so I opted not to add it.
    
    Either way, I find this to be a pretty clear example of why the GPU is so powerful for graphics. I did a smaller model for P5 (Mario Planet), and the
    transformations and projections being all done on 1 thread made it run at 5 fps with the highest quality, whereas this runs at 60fps with no problem.
    Pretty cool in my opinion. Thanks for reading! (Hit H to hide this or N to go back to the original overlay). 
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
  var acceleration = 50.0; // Adjust acceleration as needed

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










