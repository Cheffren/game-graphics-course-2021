import PicoGL from "../node_modules/picogl/build/module/picogl.js";
import {mat4, vec3, vec4} from "../node_modules/gl-matrix/esm/index.js";

let startTime = new Date().getTime() / 1000;

function draw() {
    let time = new Date().getTime() / 1000 - startTime;

    requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
