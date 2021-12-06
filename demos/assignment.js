// *********************************************************************************************************************
// **                                                                                                                 **
// **             Texturing example, Cube is mapped with 2D texture, skybox is mapped with a Cubemap                  **
// **                                                                                                                 **
// *********************************************************************************************************************

// * Change textures
// * Combine several textures in fragment shaders
// * Distort UV coordinates
// * Change texture filtering for pixel graphics
// * Use wrapping modes for texture tiling

import PicoGL from "../node_modules/picogl/build/module/picogl.js";
import {mat4, vec3} from "../node_modules/gl-matrix/esm/index.js";

import {positions, normals, uvs, indices} from "../blender/ball.js"

// language=GLSL
let fragmentShader = `
    #version 300 es
    precision highp float;
    precision highp float;    
    precision highp sampler2DShadow;
    
    uniform vec4 baseColor;
    uniform vec4 ambientColor;
    uniform vec3 lightPosition;
    uniform vec3 cameraPosition;    
    uniform sampler2DShadow shadowMap;
    
    in vec3 vPosition;
    in vec3 vNormal;
    in vec4 vPositionFromLight;
    in vec3 vModelPosition;
    out vec4 fragColor;
    
    uniform sampler2D tex;    
    
    in vec2 v_uv;
    
    out vec4 outColor;
    
    void main()
    {       
        vec3 shadowCoord = (vPositionFromLight.xyz / vPositionFromLight.w) / 2.0 + 0.5;        
        float shadow = texture(shadowMap, shadowCoord);
        
        vec3 normal = normalize(vNormal);
        vec3 eyeDirection = normalize(cameraPosition - vPosition);
        vec3 lightDirection = normalize(lightPosition - vPosition);        
        vec3 reflectionDirection = reflect(-lightDirection, normal);
        
        float diffuse = max(dot(lightDirection, normal), 0.0) * max(shadow, -0.2);        
        float specular = shadow * pow(max(dot(reflectionDirection, eyeDirection), 0.0), 100.0) / 0.5
        fragColor = vec4(diffuse * baseColor.rgb + ambientColor.rgb + specular, baseColor.a);
        outColor = texture(tex, v_uv) * fragColor;

    }
`;

// language=GLSL
let vertexShader = `
    #version 300 es
            
    uniform mat4 modelViewProjectionMatrix;
    
    layout(location=0) in vec3 position;
    layout(location=1) in vec3 normal;
    layout(location=2) in vec2 uv;
        
    out vec2 v_uv;
    
    void main()
    {
        gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);           
        v_uv = uv;
    }
`;

let shadowFragmentShader = `
    #version 300 es
    precision highp float;
    
    out vec4 fragColor;
    
    void main() {
        // Uncomment to see the depth buffer of the shadow map    
        //fragColor = vec4((gl_FragCoord.z - 0.98) * 50.0);    
    }
`;

// language=GLSL
let shadowVertexShader = `
    #version 300 es
    layout(location=0) in vec4 position;
    uniform mat4 lightModelViewProjectionMatrix;
    
    void main() {
        gl_Position = lightModelViewProjectionMatrix * position;
    }
`;

let bgColor = vec4.fromValues(1.0, 0.9, 0.8, 0.1);
app.enable(PicoGL.DEPTH_TEST)
   .enable(PicoGL.CULL_FACE)
   .clearColor(bgColor[0], bgColor[1], bgColor[2], bgColor[3])
//Dit is allemaal voor de textures
let program = app.createProgram(vertexShader.trim(), fragmentShader.trim());
let shadowProgram = app.createProgram(shadowVertexShader.trim(), shadowFragmentShader.trim());


let vertexArray = app.createVertexArray()
    .vertexAttributeBuffer(0, app.createVertexBuffer(PicoGL.FLOAT, 3, positions))
    .vertexAttributeBuffer(1, app.createVertexBuffer(PicoGL.FLOAT, 3, normals))
    .vertexAttributeBuffer(2, app.createVertexBuffer(PicoGL.FLOAT, 2, uvs))
    .indexBuffer(app.createIndexBuffer(PicoGL.UNSIGNED_INT, 3, indices));

    let shadowDepthTarget = app.createTexture2D(512, 512, {
        internalFormat: PicoGL.DEPTH_COMPONENT16,
        compareMode: PicoGL.COMPARE_REF_TO_TEXTURE,
        magFilter: PicoGL.LINEAR,
    });
    let shadowBuffer = app.createFramebuffer().depthTarget(shadowDepthTarget);

let projMatrix = mat4.create();
let viewMatrix = mat4.create();
let viewProjMatrix = mat4.create();
let modelMatrix = mat4.create();
let modelViewMatrix = mat4.create();
let modelViewProjectionMatrix = mat4.create();
let rotateXMatrix = mat4.create();
let rotateYMatrix = mat4.create();

let lightModelViewProjectionMatrix = mat4.create();

let cameraPosition = vec3.fromValues(0, 2, 4);
let lightPosition = vec3.fromValues(5, 5, 2.5);
let lightViewMatrix = mat4.create();
let lightViewProjMatrix = mat4.create();
mat4.lookAt(lightViewMatrix, lightPosition, vec3.fromValues(0, -1, 0), vec3.fromValues(0, 1, 0));

async function loadTexture(fileName) {
    return await createImageBitmap(await (await fetch("images/" + fileName)).blob());
}

(async () => {
    const tex = await loadTexture("slangenvel.jpg");
    let drawCall = app.createDrawCall(program, vertexArray)
        .texture("tex", app.createTexture2D(tex, tex.width, tex.height, {
            magFilter: PicoGL.LINEAR,
            minFilter: PicoGL.LINEAR_MIPMAP_LINEAR,
            maxAnisotropy: 10,
            wrapS: PicoGL.REPEAT,
            wrapT: PicoGL.MIRRORED_REPEAT
        }));


        let secondDrawCall = app.createDrawCall(program, vertexArray)
        .uniform("baseColor", fgColor)
        //.uniform("ambientColor", vec4.scale(vec4.create(), bgColor, 0.2))
        .uniform("modelMatrix", modelMatrix)
        .uniform("modelViewProjectionMatrix", modelViewProjectionMatrix)
        .uniform("cameraPosition", cameraPosition)
        .uniform("lightPosition", lightPosition)
        .uniform("lightModelViewProjectionMatrix", lightModelViewProjectionMatrix)
        .texture("shadowMap", shadowDepthTarget);
    
    let shadowDrawCall = app.createDrawCall(shadowProgram, vertexArray)
        .uniform("lightModelViewProjectionMatrix", lightModelViewProjectionMatrix);

    
        function renderShadowMap() {
            app.drawFramebuffer(shadowBuffer);
            app.viewport(0, 0, shadowDepthTarget.width, shadowDepthTarget.height);
            app.gl.cullFace(app.gl.FRONT);
        
            // Change the projection and view matrices to render objects from the point view of light source
            mat4.perspective(projMatrix, Math.PI * 0.1, shadowDepthTarget.width / shadowDepthTarget.height, 0.1, 100.0);
            mat4.multiply(lightViewProjMatrix, projMatrix, lightViewMatrix);
        
            drawObjects(shadowDrawCall);
        
            app.gl.cullFace(app.gl.BACK);
            app.defaultDrawFramebuffer();
            app.defaultViewport();
        }

    let startTime = new Date().getTime() / 1000;


    function draw() {
        let time = new Date().getTime() / 1000 - startTime;

        mat4.perspective(projMatrix, Math.PI / 2, app.width / app.height, 0.5, 60);
        let camPos = vec3.rotateY(vec3.create(), vec3.fromValues(0, 0.5, 2), vec3.fromValues(0, 0, 0), time * 2.05);
        mat4.lookAt(viewMatrix, camPos, vec3.fromValues(0, 0, 0), vec3.fromValues(0, 1, 0));
        mat4.multiply(viewProjMatrix, projMatrix, viewMatrix);

        mat4.fromXRotation(rotateXMatrix, time * 0.0136);
        mat4.fromZRotation(rotateYMatrix, time * 0.0235);
        mat4.multiply(modelMatrix, rotateXMatrix, rotateYMatrix);

        mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);
        mat4.multiply(modelViewProjectionMatrix, viewProjMatrix, modelMatrix);
        app.clear();
        app.enable(PicoGL.DEPTH_TEST);
        drawCall.uniform("modelViewProjectionMatrix", modelViewProjectionMatrix);
        drawCall.draw();

        requestAnimationFrame(draw);
        renderShadowMap();
    drawObjects(secondDrawCall);


    }

    requestAnimationFrame(draw);
})();
