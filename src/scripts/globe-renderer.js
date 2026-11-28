// Minimal WebGL renderer for the low-poly globe.
// Reproduces the original three.js setup pixel for pixel: MeshPhongMaterial
// (Blinn-Phong, shininess 25, specular = diffuse colour), an ambient light
// (0.5), a white directional light at (2,2,2), the model's own "Sun" light that
// rotates with the globe, ACES Filmic tone mapping and sRGB output.

const VERT = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec3 aColor;
uniform mat4 uModelView;
uniform mat4 uProjection;
uniform mat3 uNormalMatrix;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec3 vColor;
void main() {
  vec4 mv = uModelView * vec4(aPosition, 1.0);
  vViewPosition = -mv.xyz;
  vNormal = normalize(uNormalMatrix * aNormal);
  vColor = aColor;
  gl_Position = uProjection * mv;
}`;

const FRAG = `
precision highp float;
#define RECIPROCAL_PI 0.3183098861837907
uniform vec3 uAmbient;
uniform vec3 uLightDir[2];
uniform vec3 uLightColor[2];
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec3 vColor;

vec3 F_Schlick(vec3 f0, float f90, float dotVH) {
  float fresnel = exp2((-5.55473 * dotVH - 6.98316) * dotVH);
  return f0 * (1.0 - fresnel) + (f90 * fresnel);
}
vec3 BRDF_BlinnPhong(vec3 l, vec3 v, vec3 n, vec3 spec, float shininess) {
  vec3 h = normalize(l + v);
  float dotNH = clamp(dot(n, h), 0.0, 1.0);
  float dotVH = clamp(dot(v, h), 0.0, 1.0);
  vec3 F = F_Schlick(spec, 1.0, dotVH);
  float D = RECIPROCAL_PI * (shininess * 0.5 + 1.0) * pow(dotNH, shininess);
  return F * (0.25 * D);
}
vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 ACESFilmic(vec3 color) {
  const mat3 inM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 outM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color *= 1.0 / 0.6;
  color = inM * color;
  color = RRTAndODTFit(color);
  color = outM * color;
  return clamp(color, 0.0, 1.0);
}
vec3 sRGB(vec3 c) {
  return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
}
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(vViewPosition);
  vec3 diffuse = uAmbient * RECIPROCAL_PI * vColor;
  vec3 specular = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    vec3 irradiance = clamp(dot(n, uLightDir[i]), 0.0, 1.0) * uLightColor[i];
    diffuse += irradiance * RECIPROCAL_PI * vColor;
    specular += irradiance * BRDF_BlinnPhong(uLightDir[i], v, n, vColor, 25.0);
  }
  gl_FragColor = vec4(sRGB(ACESFilmic(diffuse + specular)), 1.0);
}`;

// Linear-space material colours from the original model (ocean, land, forest, accent, ice).
const MATERIALS = [
  [0.006216820329427719, 0.37804681062698364, 0.6827744245529175],
  [0.04057749733328819, 0.8162760734558105, 0.11648337543010712],
  [0.05683440342545509, 0.24227656424045563, 0.10035599768161774],
  [0.8000000715255737, 0.002075883559882641, 0.008127829059958458],
  [0.6434436440467834, 0.759128212928772, 0.805510401725769],
];
const SUN_POSITION = [-476.73203057800583, 106.93674360548667, 216.69738082244965];
const SUN_COLOR = [1 * 2.7, 0.8680734038352966 * 2.7, 0.702198326587677 * 2.7];
const KEY_DIR = normalize([2, 2, 2]);
const MODEL_SCALE = 0.02;
const CAMERA_Z = 5;
const FOV = (75 * Math.PI) / 180;

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Rotation matrix for Euler XYZ (z = 0), column-major 3x3. */
function rotationXY(rx, ry) {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry);
  // R = Rx * Ry
  return [
    cy, sx * sy, -cx * sy,
    0, cx, sx,
    sy, -sx * cy, cx * cy,
  ];
}

function mul3(m, v) {
  return [
    m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
    m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
    m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
  ];
}

/** Decode the binary mesh produced from LowPolyEarth.fbx into flat per-vertex arrays. */
export function decodeMesh(buffer) {
  const [nVerts, nTris] = new Uint32Array(buffer, 0, 2);
  let o = 8;
  const pos = new Float32Array(buffer, o, nVerts * 3); o += nVerts * 12;
  const idx = new Uint16Array(buffer, o, nTris * 3); o += nTris * 6;
  const nrm = new Int16Array(buffer, o, nTris * 3); o += nTris * 6;
  const mat = new Uint8Array(buffer, o, nTris);
  const data = new Float32Array(nTris * 3 * 9);
  for (let t = 0, w = 0; t < nTris; t++) {
    const c = MATERIALS[mat[t]];
    for (let k = 0; k < 3; k++) {
      const p = idx[t * 3 + k] * 3;
      data[w++] = pos[p]; data[w++] = pos[p + 1]; data[w++] = pos[p + 2];
      data[w++] = nrm[t * 3] / 32767; data[w++] = nrm[t * 3 + 1] / 32767; data[w++] = nrm[t * 3 + 2] / 32767;
      data[w++] = c[0]; data[w++] = c[1]; data[w++] = c[2];
    }
  }
  return { data, count: nTris * 3 };
}

/** Create the renderer. Returns null when WebGL is unavailable. */
export function createRenderer(canvas, mesh) {
  const opts = { antialias: true, alpha: true, premultipliedAlpha: true };
  const gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts);
  if (!gl) return null;

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, mesh.data, gl.STATIC_DRAW);
  [['aPosition', 0], ['aNormal', 12], ['aColor', 24]].forEach(([name, offset]) => {
    const loc = gl.getAttribLocation(prog, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 36, offset);
  });

  const u = (name) => gl.getUniformLocation(prog, name);
  const uModelView = u('uModelView'), uProjection = u('uProjection'), uNormalMatrix = u('uNormalMatrix');
  const uLightDir = u('uLightDir'), uLightColor = u('uLightColor');
  gl.uniform3f(u('uAmbient'), 0.5, 0.5, 0.5);
  gl.uniform3fv(uLightColor, [1, 1, 1, ...SUN_COLOR]);

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.CULL_FACE);
  gl.clearColor(0, 0, 0, 0);

  return {
    resize(width, height, dpr) {
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      const aspect = width / height;
      const f = 1 / Math.tan(FOV / 2), near = 0.1, far = 1000;
      gl.uniformMatrix4fv(uProjection, false, [
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) / (near - far), -1,
        0, 0, (2 * far * near) / (near - far), 0,
      ]);
    },
    render(rx, ry) {
      const r = rotationXY(rx, ry);
      const s = MODEL_SCALE;
      gl.uniformMatrix4fv(uModelView, false, [
        r[0] * s, r[1] * s, r[2] * s, 0,
        r[3] * s, r[4] * s, r[5] * s, 0,
        r[6] * s, r[7] * s, r[8] * s, 0,
        0, 0, -CAMERA_Z, 1,
      ]);
      gl.uniformMatrix3fv(uNormalMatrix, false, r);
      gl.uniform3fv(uLightDir, [...KEY_DIR, ...normalize(mul3(r, SUN_POSITION))]);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    },
  };
}
