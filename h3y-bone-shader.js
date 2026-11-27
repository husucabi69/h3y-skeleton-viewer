/**
 * H3Y 전신 골격 — 실사 표본 피질골 셰이더 v3 (Tri-planar 사진 텍스처)
 * =====================================================================
 * 의장님 피드백(2026-11-27): "지금 보는 이 뼈의 질감 고퀄리티로 만들라고"
 *
 *  v1 (균열망) → 그림/진흙 티          · v2 (균열 제거) → 밋밋한 플라스틱
 *  v3 은 표면 정보를 '사진'에서 가져온다.
 *
 *  · 사진 기반 타일 3종 (assets/tex/)
 *      bone_albedo.jpg    타일 = 실제 16 cm — 상아 판 ↔ 황토·호박색 얼룩
 *      bone_normal.png    타일 = 실제 5.4 cm — 1~2 mm 미세 주름·기공 요철
 *      bone_roughness.jpg 타일 = 실제 16 cm — 축축한 판 ↔ 건조한 판 반광 편차
 *    (원본: 두판상근 2D 도판 후두개부 좌측 피질골 / attachments/2026-11-27)
 *
 *  · UV 가 없는 BodyParts3D 메쉬 → 월드 좌표 3축 Tri-planar 샘플링.
 *    이음새 0. 알베도는 2스케일 혼합으로 반복 타일감을 지운다.
 *  · GLB 의 COLOR_0 (R 근접차폐 / G 원거리차폐 / B 함몰) 을 깊고 따뜻한
 *    갈색~호박색 음영으로 곱해 두개골 아래·관절 틈을 가라앉힌다.
 *  · v3a2 (2026-11-27 의장님 #16062): 경추·요추 화면의 검은 먹물 자국 제거 —
 *    뒷면 법선 반전(gl_FrontFacing), AO 바닥 0.18, 함몰·틈새 혼합 강도 하향.
 *  · 노멀은 접선공간 노멀을 월드 접선평면에 사영해 합성(tangent-free) →
 *    잔잔한 골 표면 요철과 촉촉한 실물 반광.
 *  · roughness 0.32~0.58 + Fresnel 실루엣 림.
 *
 * 사용법
 *   const api = H3YBoneShader.applyH3YBoneShader(THREE, root, { quality: 1.0 });
 *   api.setQuality(0 | 0.5 | 1);   api.setRim(0.2);   api.setTextureRoot('assets/tex');
 */

const H3Y_TEX_VERSION = 'v3a1';
const H3Y_TEX_FILES = {
  albedo: 'bone_albedo.jpg?v=' + H3Y_TEX_VERSION,
  normal: 'bone_normal.png?v=' + H3Y_TEX_VERSION,
  roughness: 'bone_roughness.jpg?v=' + H3Y_TEX_VERSION
};

const H3Y_NOISE_GLSL = `
float h3yHash(vec3 p){
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float h3yNoise(vec3 x){
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(mix(h3yHash(i + vec3(0.0,0.0,0.0)), h3yHash(i + vec3(1.0,0.0,0.0)), f.x),
                 mix(h3yHash(i + vec3(0.0,1.0,0.0)), h3yHash(i + vec3(1.0,1.0,0.0)), f.x), f.y),
             mix(mix(h3yHash(i + vec3(0.0,0.0,1.0)), h3yHash(i + vec3(1.0,0.0,1.0)), f.x),
                 mix(h3yHash(i + vec3(0.0,1.0,1.0)), h3yHash(i + vec3(1.0,1.0,1.0)), f.x), f.y), f.z);
}`;

const H3Y_SURFACE_GLSL = `
vec3 h3yToLinear(vec3 c){ return pow(max(c, vec3(0.0)), vec3(2.2)); }
// 깊은 틈새 — 따뜻한 짙은 갈색 (먹물 자국 방지: 순흑에 가까운 #1b1209 에서 완화)
vec3 h3yCave(){ return h3yToLinear(vec3(0.16, 0.11, 0.065)); }    // 짙은 갈색
vec3 h3yAmber(){ return h3yToLinear(vec3(0.353, 0.243, 0.122)); }  // #5a3e1f

// 접선공간 노멀(0..1 텍스처) → 월드 기울기 벡터.
// 축별 (u,v) → 월드 축 대응:
//   X축 샘플 uv=(z,y)  u→+Z v→+Y
//   Y축 샘플 uv=(x,z)  u→+X v→+Z
//   Z축 샘플 uv=(x,y)  u→+X v→+Y
vec3 h3yTriNormalGrad(vec3 p, vec3 n, vec3 bw, float s){
  vec2 uv[3];
  uv[0] = p.zy * s;
  uv[1] = p.xz * s;
  uv[2] = p.xy * s;
  vec2 g0 = texture2D(uH3yNormalMap, uv[0]).xy * 2.0 - 1.0;
  vec2 g1 = texture2D(uH3yNormalMap, uv[1]).xy * 2.0 - 1.0;
  vec2 g2 = texture2D(uH3yNormalMap, uv[2]).xy * 2.0 - 1.0;
  g0 = vec2(-g0.x, -g0.y);  // 노멀 xy → 높이 기울기
  g1 = vec2(-g1.x, -g1.y);
  g2 = vec2(-g2.x, -g2.y);
  vec3 sx = vec3(0.0, g0.y, g0.x) * sign(n.x + 1e-6);
  vec3 sy = vec3(g1.x, 0.0, g1.y) * sign(n.y + 1e-6);
  vec3 sz = vec3(g2.x, g2.y, 0.0) * sign(n.z + 1e-6);
  return sx * bw.x + sy * bw.y + sz * bw.z;
}

// 화면 미분 기반 범프 — 노멀을 화면 해상도에 맞춰 흔든다(밉맵에 사라지지 않는다)
vec3 h3yBump(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir){
  vec3 vSigmaX = dFdx(surfPos);
  vec3 vSigmaY = dFdy(surfPos);
  vec3 vN = surfNorm;
  vec3 R1 = cross(vSigmaY, vN);
  vec3 R2 = cross(vN, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDir;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surfNorm - vGrad);
}

vec3 h3yTriAlbedo(vec3 p, vec3 bw, float s){
  vec3 c = texture2D(uH3yAlbedoMap, p.zy * s).rgb * bw.x
         + texture2D(uH3yAlbedoMap, p.xz * s).rgb * bw.y
         + texture2D(uH3yAlbedoMap, p.xy * s).rgb * bw.z;
  return c;
}

float h3yTriRough(vec3 p, vec3 bw, float s){
  float r = texture2D(uH3yRoughMap, p.zy * s).r * bw.x
          + texture2D(uH3yRoughMap, p.xz * s).r * bw.y
          + texture2D(uH3yRoughMap, p.xy * s).r * bw.z;
  return r;
}`;

/** 재질 이름 → 모드·기본값 */
const H3Y_SURFACE = {
  h3y_bone:      { mode: 0, rim: 0.16, color: 0xffffff, roughness: 0.62 },
  h3y_enamel:    { mode: 1, rim: 0.12, color: 0xffffff, roughness: 0.30 },
  h3y_cartilage: { mode: 2, rim: 0.16, color: 0xffffff, roughness: 0.55 }
};

/** 텍스처 로더 (한 번만) */
const H3Y_TEX_STATE = { loaded: false, root: 'assets/tex', albedo: null, normal: null, roughness: null, listeners: [] };

function h3ySolidTexture(THREE, r, g, b) {
  const data = new Uint8Array([r, g, b, 255]);
  const t = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function h3yLoadTextures(THREE, root) {
  if (H3Y_TEX_STATE.loading || H3Y_TEX_STATE.loaded) return;
  H3Y_TEX_STATE.loading = true;
  const loader = new THREE.TextureLoader();
  const base = (root || H3Y_TEX_STATE.root || 'assets/tex').replace(/\/$/, '');
  let pending = 3;

  const done = () => {
    if (--pending > 0) return;
    H3Y_TEX_STATE.loaded = true;
    H3Y_TEX_STATE.listeners.forEach((fn) => { try { fn(); } catch (e) {} });
    H3Y_TEX_STATE.listeners.length = 0;
  };

  const setup = (t, srgb) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    if (srgb && THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
    t.needsUpdate = true;
    return t;
  };

  loader.load(base + '/' + H3Y_TEX_FILES.albedo, (t) => {
    H3Y_TEX_STATE.albedo = setup(t, true); done();
  }, undefined, () => { done(); });
  loader.load(base + '/' + H3Y_TEX_FILES.normal, (t) => {
    H3Y_TEX_STATE.normal = setup(t, false); done();
  }, undefined, () => { done(); });
  loader.load(base + '/' + H3Y_TEX_FILES.roughness, (t) => {
    H3Y_TEX_STATE.roughness = setup(t, false); done();
  }, undefined, () => { done(); });
}

function createH3YBoneMaterial(THREE, src, options) {
  options = options || {};
  const name = (src && src.name) || 'h3y_bone';
  const key = H3Y_SURFACE[name] ? name : 'h3y_bone';
  const spec = H3Y_SURFACE[key];

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(spec.color),
    roughness: spec.roughness,
    metalness: 0.0,
    vertexColors: false,
    side: THREE.DoubleSide,
    transparent: false,
    envMapIntensity: 0.0
  });
  material.name = name;

  const uniforms = {
    uMode:      { value: spec.mode },
    uQuality:   { value: options.quality !== undefined ? options.quality : 1.0 },
    uDetail:    { value: options.detail !== undefined ? options.detail : 1.0 },
    uRim:       { value: spec.rim },
    uRimColor:  { value: new THREE.Color(0.62, 0.42, 0.24) },
    uAlbScale:  { value: 1 / 0.054 },   // 타일 5.4 cm (사진 원해상도)
    uNrmScale:  { value: 1 / 0.054 },   // 타일 5.4 cm
    uNrmScale2: { value: 1 / 0.029 },   // 두 번째 스케일(반복감 제거)
    uNrmGain:   { value: 1.6 },
    uTexMix:    { value: 0.0 },
    uDebugAO:   { value: 0.0 },
    uSheen:     { value: 0.06 },
    uBump:      { value: 0.22 },
    uSheenGloss:{ value: 0.55 },
    uSoftDir:   { value: new THREE.Vector3(0.495, 0.522, 0.694).normalize() },         // 텍스처 준비도 (0→1)
    uH3yAlbedoMap:    { value: h3ySolidTexture(THREE, 208, 194, 168) },
    uH3yNormalMap:    { value: h3ySolidTexture(THREE, 128, 128, 255) },
    uH3yRoughMap:     { value: h3ySolidTexture(THREE, 118, 118, 118) }
  };
  material.userData.h3yUniforms = uniforms;
  material.userData.h3yMaterial = key;

  material.onBeforeCompile = (shader) => {
    shader.uniforms = Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 color;
varying vec3 vH3yWorld;
varying vec3 vH3yNormalW;
varying vec4 vH3yAO;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vH3yWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
vH3yNormalW = normalize(mat3(modelMatrix) * objectNormal);
vH3yAO = color;`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uMode;
uniform float uQuality;
uniform float uDetail;
uniform float uRim;
uniform vec3  uRimColor;
uniform float uAlbScale;
uniform float uNrmScale;
uniform float uNrmScale2;
uniform float uNrmGain;
uniform float uTexMix;
uniform float uDebugAO;
uniform float uSheen;
uniform float uBump;
uniform float uSheenGloss;
uniform vec3  uSoftDir;
uniform sampler2D uH3yAlbedoMap;
uniform sampler2D uH3yNormalMap;
uniform sampler2D uH3yRoughMap;
varying vec3 vH3yWorld;
varying vec3 vH3yNormalW;
varying vec4 vH3yAO;
float h3yTriBlendX;
float h3yTriBlendY;
float h3yTriBlendZ;
float h3yCavityG;
float h3yN1;
float h3yN2;
vec3 h3yNWp;
${H3Y_NOISE_GLSL}
${H3Y_SURFACE_GLSL}`)
      // ---------------- 알베도 ----------------
      .replace('#include <map_fragment>', `
float h3yAoNear = clamp(vH3yAO.r, 0.0, 1.0);
float h3yAoFar  = clamp(vH3yAO.g, 0.0, 1.0);
float h3yCavity = clamp(vH3yAO.b, 0.0, 1.0);
float h3yAo = mix(h3yAoNear, h3yAoNear * h3yAoFar, 0.55);
// 얇은 뼈판·모서리에서 AO 가 0 으로 떨어져 검게 죽는 것을 막는다(바닥 0.18)
h3yAo = clamp(h3yAo, 0.18, 1.0);
h3yCavityG = h3yCavity;

vec3 h3yNw = normalize(vH3yNormalW);
// 뒷면(DoubleSide)은 법선을 뒤집어야 라이팅·림이 뒤집혀 검게 보이지 않는다
if (!gl_FrontFacing) h3yNw = -h3yNw;
vec3 h3yBw = pow(abs(h3yNw), vec3(3.0));
h3yBw /= max(dot(h3yBw, vec3(1.0)), 1e-4);
h3yTriBlendX = h3yBw.x; h3yTriBlendY = h3yBw.y; h3yTriBlendZ = h3yBw.z;

vec3 h3yAlb;
if (uQuality > 0.05 && uTexMix > 0.01) {
  // 1차 스케일(16 cm) + 2차 스케일(약 24 cm) 혼합 → 타일 반복감 제거
  h3yAlb = h3yTriAlbedo(vH3yWorld, h3yBw, uAlbScale);
  // 큰 유기적 얼룩(3~15 cm)은 3D 노이즈로 — 타일 반복 없이 실물 표본의 얼룩을 만든다
  float motA = h3yNoise(vH3yWorld * 5.5 + 17.3);
  float motB = h3yNoise(vH3yWorld * 14.0 + 3.1);
  float motC = h3yNoise(vH3yWorld * 31.0 + 8.7);
  float mot = motA * 0.52 + motB * 0.31 + motC * 0.17;
  float mWarm = smoothstep(0.30, 0.72, mot);          // 0=상아, 1=황토
  h3yAlb *= mix(vec3(0.885, 0.815, 0.705), vec3(1.075, 1.030, 0.985), mWarm);
  // 드문 호박색 반점
  float amberSpot = smoothstep(0.76, 0.94, motC) * smoothstep(0.40, 0.62, motA);
  h3yAlb *= mix(vec3(1.0), vec3(0.88, 0.755, 0.605), amberSpot);
  // 밉맵에 사라지지 않는 초미세 결 — 범프와 같은 노이즈를 재사용한다(비용 절감)
  vec3 h3yP2 = vec3(vH3yWorld.x * 0.83 + vH3yWorld.z * 0.56,
                   vH3yWorld.y * 1.07 - vH3yWorld.z * 0.31,
                   vH3yWorld.z * 0.79 - vH3yWorld.x * 0.62);
  h3yN1 = h3yNoise(vH3yWorld * 330.0 + 7.0) - 0.5;
  h3yN2 = h3yNoise(h3yP2 * 158.0 + 13.0) - 0.5;
  h3yAlb *= 1.0 + 0.085 * h3yN1 + 0.075 * h3yN2;
  h3yAlb = mix(vec3(0.62, 0.55, 0.44), h3yAlb, uTexMix);
} else {
  h3yAlb = mix(vec3(0.62, 0.55, 0.44), vec3(0.78, 0.70, 0.56), h3yAo);
}

if (uMode < 0.5) {
  // 깊은 틈새·봉합선: 따뜻한 갈색으로 가라앉힌다(경추·요추 모서리의 시커먼 얼룩 방지)
  float depth = pow(1.0 - h3yAo, 1.15);
  h3yAlb = mix(h3yAlb, h3yCave(), 0.48 * depth);
  h3yAlb = mix(h3yAlb, h3yCave(), 0.38 * pow(h3yCavity, 1.5));
  h3yAlb = mix(h3yAlb, h3yAmber(), 0.10 * smoothstep(0.55, 1.0, 1.0 - h3yAo));
  // 밝은 곳은 상아색으로 살짝 들어 올린다
  h3yAlb *= mix(0.90, 1.06, smoothstep(0.55, 1.0, h3yAo));
} else if (uMode < 1.5) {
  vec3 enamel = mix(vec3(0.86, 0.83, 0.77), vec3(0.95, 0.93, 0.88), smoothstep(0.3, 1.0, h3yAo));
  h3yAlb = mix(h3yAlb, enamel, 0.55);
  h3yAlb = mix(h3yAlb, h3yCave(), 0.35 * pow(1.0 - h3yAo, 2.0));
} else {
  vec3 cart = mix(vec3(0.55, 0.47, 0.36), vec3(0.78, 0.72, 0.61), smoothstep(0.25, 1.0, h3yAo));
  h3yAlb = mix(h3yAlb, cart, 0.60);
  h3yAlb = mix(h3yAlb, h3yCave(), 0.45 * pow(1.0 - h3yAo, 1.8));
}
diffuseColor.rgb = h3yAlb;
if (uDebugAO > 0.5) diffuseColor.rgb = vec3(h3yAoNear, h3yAoFar, h3yCavity);`)
      // ---------------- 거칠기 ----------------
      .replace('#include <roughnessmap_fragment>', `
float roughnessFactor = 0.46;
if (uMode < 0.5) {
  float rm = 0.452;
  if (uQuality > 0.05 && uTexMix > 0.01) {
    rm = h3yTriRough(vH3yWorld, vec3(h3yTriBlendX, h3yTriBlendY, h3yTriBlendZ), uAlbScale);
    rm = mix(0.452, rm, uTexMix);
  }
  // 기공·틈새는 조금 더 거칠게(반광이 죽고 음영이 남는다)
  roughnessFactor = clamp(rm + 0.17 + 0.06 * h3yCavityG + 0.02 * (1.0 - h3yAoNear), 0.52, 0.82);
} else if (uMode < 1.5) {
  roughnessFactor = clamp(0.30 + 0.05 * h3yCavityG, 0.24, 0.40);
} else {
  roughnessFactor = clamp(0.55 + 0.06 * (1.0 - h3yAoNear), 0.42, 0.68);
}`)
      // ---------------- 요철 노멀 ----------------
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
if (uQuality > 0.05 && uTexMix > 0.01) {
  vec3 bw2 = vec3(h3yTriBlendX, h3yTriBlendY, h3yTriBlendZ);
  float gain = uNrmGain * mix(1.0, 0.35, h3yCavityG);
  if (uMode > 0.5) gain *= 0.5;
  vec3 g1n = h3yTriNormalGrad(vH3yWorld, h3yNw, bw2, uNrmScale);
  vec3 g2n = h3yTriNormalGrad(vH3yWorld + vec3(0.213, 0.517, 0.371), h3yNw, bw2, uNrmScale2);
  vec3 grad = (g1n * 0.68 + g2n * 0.42) * gain * uTexMix;
  // 접선평면에 사영 (표면 밖으로 튀지 않게)
  grad -= h3yNw * dot(grad, h3yNw);
  vec3 nPert = normalize(h3yNw - grad);
  h3yNWp = nPert;
  normal = normalize((viewMatrix * vec4(nPert, 0.0)).xyz);
} else {
  h3yNWp = h3yNw;
}
// ---- 초미세 골결 요철: 화면 미분 범프 ----
// 픽셀이 요철보다 커지면(원경) 자연히 사라지도록 나이키스트 페이드
{
  float f1 = 330.0, f2 = 150.0;
  float pixW = length(fwidth(vH3yWorld));
  float fade1 = 1.0 - smoothstep(0.30 / f1, 0.90 / f1, pixW);
  float fade2 = 1.0 - smoothstep(0.30 / f2, 0.90 / f2, pixW);
  float hN = h3yN1 * 1.10 * fade1 + h3yN2 * 0.95 * fade2;
  vec2 dH = clamp(vec2(dFdx(hN), dFdy(hN)) * uBump * 0.0026, vec2(-0.06), vec2(0.06));
  h3yNWp = h3yBump(-vViewPosition, h3yNWp, dH, faceDirection);
  normal = h3yBump(-vViewPosition, normal, dH, faceDirection);
}`)
      // ---------------- 실루엣 림(촉촉한 SSS 느낌) ----------------
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
// 소프트박스 셰인 — 미세 요철을 타고 흐르는 실물 반광
{
  vec3 Vw = normalize(cameraPosition - vH3yWorld);
  vec3 Hh = normalize(uSoftDir + Vw);
  vec3 Np = normalize(h3yNWp);
  float ndh = max(dot(Np, Hh), 0.0);
  float gloss = mix(26.0, 95.0, clamp(uSheenGloss, 0.0, 1.0));
  float sheen = pow(ndh, gloss) * (gloss + 8.0) / 25.0;
  float fres = 0.035 + 0.965 * pow(1.0 - clamp(dot(Np, Vw), 0.0, 1.0), 5.0);
  vec3 sheenCol = mix(vec3(0.95, 0.90, 0.80), vec3(1.0, 0.93, 0.80), 0.5);
  totalEmissiveRadiance += sheenCol * sheen * fres * uSheen * mix(0.25, 1.0, h3yAoNear);
}
if (uRim > 0.001) {
  float ndv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 3.2);
  totalEmissiveRadiance += uRimColor * fres * uRim * mix(0.35, 1.0, h3yAoNear);
}`);
    material.customProgramCacheKey = () => `h3y-bone-v3-${key}`;
  };

  // 텍스처가 늦게 도착하면 자동 반영
  const applyTex = () => {
    if (H3Y_TEX_STATE.albedo) uniforms.uH3yAlbedoMap.value = H3Y_TEX_STATE.albedo;
    if (H3Y_TEX_STATE.normal) uniforms.uH3yNormalMap.value = H3Y_TEX_STATE.normal;
    if (H3Y_TEX_STATE.roughness) uniforms.uH3yRoughMap.value = H3Y_TEX_STATE.roughness;
    uniforms.uTexMix.value = 1.0;
  };
  if (H3Y_TEX_STATE.loaded) applyTex();
  else H3Y_TEX_STATE.listeners.push(applyTex);

  return material;
}

/**
 * 씬(또는 GLB 루트)의 모든 뼈 메시를 실사 피질골 재질로 교체합니다.
 */
function applyH3YBoneShader(THREE, root, options) {
  options = options || {};
  if (options.textureRoot) H3Y_TEX_STATE.root = options.textureRoot;
  h3yLoadTextures(THREE, H3Y_TEX_STATE.root);

  const cache = new Map();
  const materials = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const src = Array.isArray(o.material) ? o.material[0] : o.material;
    const key = (src && src.name) || 'h3y_bone';
    if (!cache.has(key)) cache.set(key, createH3YBoneMaterial(THREE, src, options));
    const mat = cache.get(key);
    o.material = mat;
    if (materials.indexOf(mat) < 0) materials.push(mat);
  });
  const each = (fn) => materials.forEach((m) => {
    const u = m.userData.h3yUniforms;
    if (u) fn(u, m);
  });
  const api = {
    materials,
    setQuality: (q) => each((u) => { u.uQuality.value = q; }),
    setDetail: (d) => each((u) => { u.uDetail.value = d; }),
    setRim: (r) => each((u) => { u.uRim.value = r; }),
    setNormalGain: (g) => each((u) => { u.uNrmGain.value = g; }),
    setTexMix: (v) => each((u) => { u.uTexMix.value = v; }),
    setDebugAO: (v) => each((u) => { u.uDebugAO.value = v; }),
    setSheen: (v) => each((u) => { u.uSheen.value = v; }),
    setBump: (v) => each((u) => { u.uBump.value = v; }),
    setAlbedoScale: (v) => each((u) => { u.uAlbScale.value = v; }),
    setNormalScale: (v) => each((u) => { u.uNrmScale.value = v; }),
    uniformsOf: () => materials.map((m) => m.userData.h3yUniforms),
    reloadTextures: () => {
      H3Y_TEX_STATE.loaded = false;
      H3Y_TEX_STATE.loading = false;
      h3yLoadTextures(THREE, H3Y_TEX_STATE.root);
    }
  };
  window.H3YBoneShader._lastApi = api;
  return api;
}

if (typeof window !== 'undefined') {
  window.H3YBoneShader = { createH3YBoneMaterial, applyH3YBoneShader, H3Y_SURFACE, H3Y_TEX_STATE };
}
