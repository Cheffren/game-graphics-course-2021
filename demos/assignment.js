import PicoGL from "../node_modules/picogl/build/module/picogl.js";
import {mat4, vec3, mat3, vec4,vec2} from "../node_modules/gl-matrix/esm/index.js";

import {positions, normals, uvs,indices} from "../blender/beer-bottle.js";
import {positions as objectPos, normals as objectNorm, uvs as objectUvs, indices as objectIndices} from "../blender/sphere.js";

import {positions as mirrorPositions, uvs as mirrorUvs, indices as mirrorIndices} from "../blender/plane.js"

// skyboxpositions

let skyboxPositions = new Float32Array([
    -1.0, 1.0, 1.0,
    1.0, 1.0, 1.0,
    -1.0, -1.0, 1.0,
    1.0, -1.0, 1.0
]);

let skyboxTriangles = new Uint32Array([
    0, 2, 1,
    2, 3, 1
]);

//Hier bepaal ik de kleur van het licht, hoeveel lichtbronnen er zijn, de posities daar van,...

let ambientLightColor = vec3.fromValues(0.5, 0.8, 0.8);
let numberOfLights = 2;
let lightColors = [vec3.fromValues(1.0, 0.0, 0.8), vec3.fromValues(0.9, 0.1, 0.4), vec3.fromValues(0.4,0.5,0.8)];
let lightInitialPositions = [vec3.fromValues(8, 0, 4), vec3.fromValues(-8, 0, 4)];
let lightPositions = [vec3.create(), vec3.create(), vec3.create()];
//Ik heb blinn-phong gekozen als licht model. Het heeft een diffuse en een specular
let lightCalculationShader = `
    uniform vec3 cameraPos;
    uniform vec3 ambientLightColor;    
    uniform vec3 lightColors[${numberOfLights}];        
    uniform vec3 lightPositions[${numberOfLights}];
    
    // This function calculates light reflection using Phong reflection model (ambient + diffuse + specular)
    vec4 calculateLights(vec3 normal, vec3 position) {
        vec3 viewDirection = normalize(cameraPos.xyz - position);
        vec4 color = vec4(ambientLightColor, 1.0);
                
        for (int i = 0; i < lightPositions.length(); i++) {
            vec3 lightDirection = normalize(lightPositions[i] - position);
            
            // Lambertian reflection (ideal diffuse of matte surfaces) is also a part of Phong model                        
            float diffuse = max(dot(lightDirection, normal), 0.0);                                    
                      
            // Phong specular highlight 
            //float specular = pow(max(dot(viewDirection, reflect(-lightDirection, normal)), 0.0), 50.0);
            
            // Blinn-Phong improved specular highlight                        
            float specular = pow(max(dot(normalize(lightDirection + viewDirection), normal), 0.0), 200.0);
            
            color.rgb += lightColors[i] * diffuse + specular ;
        }
        return color;
    }
`;
//Het object heeft enkel een outColor in de fragment shader.
let fragmentShader = `
    #version 300 es
    precision highp float;
    ${lightCalculationShader}
    
    uniform samplerCube cubemap;    
    
    in vec3 vPosition;  
    in vec3 vNormal;
    in vec3 viewDir;
    
    out vec4 outColor;
    
    void main()
    {        
        vec3 reflectedDir = reflect(viewDir, normalize(vNormal));
        //outColor = texture(cubemap, reflectedDir);
        outColor = calculateLights(normalize(vNormal), vPosition);
        // Try using a higher mipmap LOD to get a rough material effect without any performance impact
        //outColor = textureLod(cubemap, reflectedDir, 7.0);
    }
`;
//In de vertex shader bepaal ik de uv mapping, posities van alles
// language=GLSL
let vertexShader = `
    #version 300 es
    ${lightCalculationShader}
            
    uniform mat4 modelViewProjectionMatrix;
    uniform mat4 modelMatrix;
    uniform mat3 normalMatrix;
    uniform vec3 cameraPosition; 
    
    layout(location=0) in vec4 position;
    layout(location=1) in vec3 normal;
    layout(location=2) in vec2 uv;
        
    out vec3 vPosition;
    out vec2 vUv;
    out vec3 vNormal;
    out vec3 viewDir;
    out vec4 vColor;
    
    void main()
    {
        gl_Position = modelViewProjectionMatrix * position;           
        vUv = uv;
        viewDir = (modelMatrix * position).xyz / cameraPosition;                
        vNormal = normalMatrix * normal;
        vColor = calculateLights(normalize(vNormal), vPosition);
    }
`;
// In de objectfragment shader bepaal ik de kleur en texture van het object (in dit geval de bol) het moet de skybox reflecteren dus daarom is de texture er van de cubemap.
let objectFragmentShader = `

#version 300 es
precision highp float;
${lightCalculationShader}

uniform samplerCube cubemap;    
        
in vec3 vNormal;
in vec3 viewDir;

out vec4 outColor;

void main()
{        
    vec3 reflectedDir = reflect(viewDir, normalize(vNormal));
     outColor = texture(cubemap, reflectedDir);
    
    //outColor = textureLod(cubemap, reflectedDir, 0.3  );
}
`;
//Hier zijn de vertexshaders van de bol in verwerkt
let objectVertexShader = `
#version 300 es
    ${lightCalculationShader}
            
    uniform mat4 modelViewProjectionMatrix;
    uniform mat4 modelMatrix;
    uniform mat3 normalMatrix;
    uniform vec3 cameraPosition; 
    
    layout(location=0) in vec4 position;
    layout(location=1) in vec3 normal;
    layout(location=2) in vec2 uv;
        
    out vec2 vUv;
    out vec3 vNormal;
    out vec3 viewDir;
    
    void main()
    {
        gl_Position = modelViewProjectionMatrix * position;           
        vUv = uv;
        viewDir = (modelMatrix * position).xyz  * cameraPosition;                
        vNormal = (normalMatrix * normal.xyz) + viewDir.xyz;
    }


`;
//De reflectie wordt hier bepaald, de outColor bestaat uit de reflectie texture en de positie van het scherm.
let mirrorFragmentShader = `
    #version 300 es
    precision highp float;
    
    uniform sampler2D reflectionTex;
    uniform sampler2D distortionMap;
    uniform vec2 screenSize;
    
    in vec2 vUv;        
        
    out vec4 outColor;
    
    void main()
    {                        
        vec2 screenPos = gl_FragCoord.xy / screenSize;
        
        // 0.03 is a mirror distortion factor, try making a larger distortion         
        screenPos.x += (texture(distortionMap, vUv).r - 0.5) * 0.20;
        outColor = texture(reflectionTex, screenPos);
    }
`;

// language=GLSL
let mirrorVertexShader = `
    #version 300 es
            
    uniform mat4 modelViewProjectionMatrix;
    
    layout(location=0) in vec4 position;   
    layout(location=1) in vec2 uv;
    
    out vec2 vUv;
        
    void main()
    {
        vUv = uv;
        gl_Position = modelViewProjectionMatrix * position;           
    }
`;
//De texture is hier ook de cubemap
let skyboxFragmentShader = `
    #version 300 es
    precision mediump float;
    
    uniform samplerCube cubemap;
    uniform mat4 viewProjectionInverse;
    
    in vec4 v_position;
    
    out vec4 outColor;
    
    void main() {
      vec4 t = viewProjectionInverse * v_position;
      outColor = texture(cubemap, normalize(t.xyz / t.w));
    }
`;

// language=GLSL
let skyboxVertexShader = `
    #version 300 es
    
    layout(location=0) in vec4 position;
    out vec4 v_position;
    
    void main() {
      v_position = position;
      gl_Position = position;
    }
`;


app.enable(PicoGL.DEPTH_TEST)
//Hier bepaal ik de programma's en wat elke shader doet zodat het duidelijker is welk programma wanneer actief is
let program = app.createProgram(vertexShader.trim(), fragmentShader.trim());
let objectProgram = app.createProgram(objectVertexShader.trim(),objectFragmentShader.trim());
let skyboxProgram = app.createProgram(skyboxVertexShader, skyboxFragmentShader);
let mirrorProgram = app.createProgram(mirrorVertexShader, mirrorFragmentShader );
//Dit zijn de nodige elementen die worden gebruikt waardoor dat het de vorm is dat het nu is
let vertexArray = app.createVertexArray()
    .vertexAttributeBuffer(0, app.createVertexBuffer(PicoGL.FLOAT, 3, positions))
    .vertexAttributeBuffer(1, app.createVertexBuffer(PicoGL.FLOAT, 3, normals))
    .vertexAttributeBuffer(2, app.createVertexBuffer(PicoGL.FLOAT, 2, uvs))
    .indexBuffer(app.createIndexBuffer(PicoGL.UNSIGNED_INT, 3, indices));



    let objectVertexArray = app.createVertexArray()
    .vertexAttributeBuffer(0, app.createVertexBuffer(PicoGL.FLOAT, 3, objectPos))
    .vertexAttributeBuffer(1, app.createVertexBuffer(PicoGL.FLOAT, 3, objectNorm))
    .vertexAttributeBuffer(2, app.createVertexBuffer(PicoGL.FLOAT, 2, objectUvs))
    .indexBuffer(app.createIndexBuffer(PicoGL.UNSIGNED_INT, 3, objectIndices));


    let mirrorArray = app.createVertexArray()
    .vertexAttributeBuffer(0, app.createVertexBuffer(PicoGL.FLOAT, 3, mirrorPositions))
    .vertexAttributeBuffer(1, app.createVertexBuffer(PicoGL.FLOAT, 2, mirrorUvs))
    .indexBuffer(app.createIndexBuffer(PicoGL.UNSIGNED_INT, 3, mirrorIndices));

    let skyboxArray = app.createVertexArray()
    .vertexAttributeBuffer(0, app.createVertexBuffer(PicoGL.FLOAT, 3, skyboxPositions))
    .indexBuffer(app.createIndexBuffer(PicoGL.UNSIGNED_INT, 3, skyboxTriangles));

  //Dit zijn de matrixes van het bierflesje  

let projMatrix = mat4.create();
let viewMatrix = mat4.create();
let viewProjMatrix = mat4.create();
let modelMatrix = mat4.create();
let modelViewProjectionMatrix = mat4.create();
let rotateXMatrix = mat4.create();
let rotateYMatrix = mat4.create();

//Camera positie enz
let skyboxViewProjectionInverse = mat4.create();
let cameraPosition = vec3.create();

//Matrixes van de bol

let objectModelViewProjectionMatrix = mat4.create();


//Dit bepaalt de resolutie van de reflectie (hoe hoger het getal, hoe minder het zal weergeven);
let reflectionResolutionFactor = 1;
let reflectionColorTarget = app.createTexture2D(app.width * reflectionResolutionFactor, app.height * reflectionResolutionFactor, {magFilter: PicoGL.NEAREST});
let reflectionDepthTarget = app.createTexture2D(app.width * reflectionResolutionFactor, app.height * reflectionResolutionFactor, {internalFormat: PicoGL.DEPTH_COMPONENT16});
let reflectionBuffer = app.createFramebuffer().colorTarget(0, reflectionColorTarget).depthTarget(reflectionDepthTarget);


let mirrorModelMatrix = mat4.create();
let mirrorModelViewProjectionMatrix = mat4.create();


function calculateSurfaceReflectionMatrix(reflectionMat, mirrorModelMatrix, surfaceNormal) {
    let normal = vec3.transformMat3(vec3.create(), surfaceNormal, mat3.normalFromMat4(mat3.create(), mirrorModelMatrix));
    let pos = mat4.getTranslation(vec3.create(), mirrorModelMatrix);
    let d = -vec3.dot(normal, pos);
    let plane = vec4.fromValues(normal[0], normal[1], normal[2], d);
    //Dit bepaalt de vorm van de reflectie

    reflectionMat[0] = (1 - 2 * plane[0] * plane[0]);
    reflectionMat[4] = ( - 2 * plane[0] * plane[1]);
    reflectionMat[8] = ( - 2 * plane[0] * plane[2]);
    reflectionMat[12] = ( - 2 * plane[3] * plane[0]);

    reflectionMat[1] = ( - 2 * plane[1] * plane[0]);
    reflectionMat[5] = (1 - 2 * plane[1] * plane[1]);
    reflectionMat[9] = ( - 2 * plane[1] * plane[2]);
    reflectionMat[13] = ( - 2 * plane[3] * plane[1]);

    reflectionMat[2] = ( - 2 * plane[2] * plane[0]);
    reflectionMat[6] = ( - 2 * plane[2] * plane[1]);
    reflectionMat[10] = (1 - 2 * plane[2] * plane[2]);
    reflectionMat[14] = ( - 2 * plane[3] * plane[2]);

    reflectionMat[3] = 0;
    reflectionMat[7] = 0;
    reflectionMat[11] = 0;
    reflectionMat[15] = 1;

    return reflectionMat;
}



//Hier wordt de texture gebruikt
async function loadTexture(fileName) {
    return await createImageBitmap(await (await fetch("images/" + fileName)).blob());
}

(async () => {
    const cubemap = app.createCubemap({
            negX: await loadTexture("left.png"),
            posX: await loadTexture("right.png"),
            negY: await loadTexture("bot.png"),
            posY: await loadTexture("top.png"),
            negZ: await loadTexture("back.png"),
            posZ: await loadTexture("front.png")
    });



const positionsBuffer = new Float32Array(numberOfLights * 3);
const colorsBuffer = new Float32Array(numberOfLights * 3);


//Hier zijn alle elementen voor het gewone programma (het bierflesje)
let drawCall = app.createDrawCall(program, vertexArray)
.texture("cubemap", cubemap)
.uniform("ambientLightColor", ambientLightColor);
//Dit is voor het tekenen vah de skybox
let skyboxDrawCall = app.createDrawCall(skyboxProgram, skyboxArray)
        .texture("cubemap", cubemap);


//Dit is voor het renderen van de spiegel
let mirrorDrawCall = app.createDrawCall(mirrorProgram, mirrorArray)
.texture("reflectionTex", reflectionColorTarget)
.texture("distortionMap", app.createTexture2D(await loadTexture("ice.jpg")));

let objectDrawCall = app.createDrawCall(objectProgram, objectVertexArray)
        .texture("cubemap", cubemap)
        .uniform("ambientLightColor", ambientLightColor);

        function renderReflectionTexture()
    {
        app.drawFramebuffer(reflectionBuffer);
        app.viewport(0, 0, reflectionColorTarget.width, reflectionColorTarget.height);

        app.gl.cullFace(app.gl.FRONT);

        let reflectionMatrix = calculateSurfaceReflectionMatrix(mat4.create(), mirrorModelMatrix, vec3.fromValues(0, 1, 0));
        let reflectionViewMatrix = mat4.mul(mat4.create(), viewMatrix, reflectionMatrix);
        let reflectionCameraPosition = vec3.transformMat4(vec3.create(), cameraPosition, reflectionMatrix);
        drawObjects(reflectionCameraPosition, reflectionViewMatrix);

        app.gl.cullFace(app.gl.BACK);
        app.defaultDrawFramebuffer();
        app.defaultViewport();
    }

    //In deze functie worden alle objecten getekend los van de spiegel
        function drawObjects(cameraPosition, viewMatrix) {
            mat4.multiply(viewProjMatrix, projMatrix, viewMatrix);
            mat4.multiply(modelViewProjectionMatrix, viewProjMatrix, modelMatrix);
            
    
            let skyboxView = mat4.clone(viewMatrix);
            skyboxView[12] = 0;
            skyboxView[13] = 0;
            skyboxView[14] = 0;
            let skyboxViewProjectionMatrix = mat4.create();
            mat4.mul(skyboxViewProjectionMatrix, projMatrix, skyboxView);
            mat4.invert(skyboxViewProjectionInverse, skyboxViewProjectionMatrix);
    
            app.clear();
    
            app.disable(PicoGL.DEPTH_TEST);
            app.gl.cullFace(app.gl.FRONT);
            skyboxDrawCall.uniform("viewProjectionInverse", skyboxViewProjectionInverse);
            skyboxDrawCall.draw();
    

    
    
           //Hier zijn alle matrixes aangepast voor de bal, de matrixes zijn hetzelfde als in de gewone vertex shader maar door ze anders te noemen
           //Kan ik er voor zorgen dat het niet op dezelfde manier draait of beweegt tov het bierflesje
           
           

            app.enable(PicoGL.DEPTH_TEST);
            app.gl.cullFace(app.gl.FRONT);
            objectDrawCall.uniform("modelViewProjectionMatrix", objectModelViewProjectionMatrix);
            objectDrawCall.uniform("cameraPosition", cameraPosition);
            objectDrawCall.uniform("modelMatrix", modelMatrix);
            objectDrawCall.uniform("normalMatrix", mat3.normalFromMat4(mat3.create(), modelMatrix));
            mat4.fromRotationTranslationScale(modelMatrix, rotateYMatrix, vec3.fromValues(0, 0, 0), [0.8,0.8,0.8]);
            objectDrawCall.draw();

            //Hier worden de matrixes bepaald voor het bierflesje
            drawCall.uniform("modelViewProjectionMatrix", modelViewProjectionMatrix);
            drawCall.uniform("cameraPosition", cameraPosition);
            drawCall.uniform("modelMatrix", modelMatrix);
            drawCall.uniform("normalMatrix", mat3.normalFromMat4(mat3.create(), modelMatrix));
            //change the scale of object
            mat4.fromRotationTranslationScale(modelMatrix, rotateYMatrix, vec3.fromValues(0, 0, 2), [0.4, 0.4, 0.4]);
            drawCall.draw();




        }

//Dit is voor de spiegel te tekenen
        function drawMirror() {
            mat4.multiply(mirrorModelViewProjectionMatrix, viewProjMatrix, mirrorModelMatrix);
            mirrorDrawCall.uniform("modelViewProjectionMatrix", mirrorModelViewProjectionMatrix);
            mirrorDrawCall.uniform("screenSize", vec2.fromValues(app.width, app.height))
            mirrorDrawCall.draw();
        }

      





  
        

    

        function draw() {
            let time = new Date().getTime() * 0.001;
    
            mat4.perspective(projMatrix, Math.PI / 2, app.width / app.height, 0.8, 100.0);
           /* mat4.perspective(objectProjMatrix, Math.PI / 5, app.width / app.height, 0.9, 20);*/
            vec3.rotateY(cameraPosition, vec3.fromValues(2, 4, 1), vec3.fromValues(0, 4, 3), time *0.015);
            mat4.lookAt(viewMatrix, cameraPosition, vec3.fromValues(0, 3, 0.05), vec3.fromValues(0, 3, 0));
        

            mat4.mul(modelMatrix, rotateXMatrix, rotateYMatrix);
            
            mat4.fromXRotation(rotateXMatrix, 0.3);
            mat4.fromYRotation(rotateYMatrix, time * 0.2354);

        
        mat4.mul(mirrorModelMatrix, rotateYMatrix, rotateXMatrix);
        mat4.translate(mirrorModelMatrix, mirrorModelMatrix, vec3.fromValues(0,-2, 0));
    
            for (let i = 0; i < numberOfLights; i++) {
                vec3.rotateZ(lightPositions[i], lightInitialPositions[i], vec3.fromValues(0, 0, 0), time);
                positionsBuffer.set(lightPositions[i], i * 3);
                colorsBuffer.set(lightColors[i], i * 3);
            }
        
            drawCall.uniform("lightPositions[0]", positionsBuffer);
            drawCall.uniform("lightColors[0]", colorsBuffer);
    
           
            renderReflectionTexture();
            drawObjects(cameraPosition, viewMatrix);
            drawMirror();
    
            requestAnimationFrame(draw);
        }
    
        requestAnimationFrame(draw);
    

    })();

