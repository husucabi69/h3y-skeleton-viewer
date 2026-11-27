/**
 * H3Y 전신 골격 — 실물 표본 피질골 셰이더 v2
 * ==========================================
 * 의장님 피드백(2026-11-27): "지금 뼈는 표면 재질이 거칠고 그림 티가 난다.
 * 모든 뼈를 두판상근 2D 도판 수준의 퀄리티로." 에 따라 뷰어 전용으로 다시 쓴 버전입니다.
 * (원본 패키지의 03_질감_셰이더_코드/h3y-bone-shader.js 는 손대지 않았고,
 *  이 파일은 h3y-skeleton-viewer 저장소에만 들어가는 오버라이드입니다.)
 *
 * v1 → v2 에서 바꾼 것
 *  · 저주파·중주파 얼룩(mottle)과 굵은 균열망(craze network)을 제거 → CG 티의 주원인
 *  · 남긴 것은 1,450/620 스케일의 아주 미세한 다공질·골결뿐 (진폭 2~5%)
 *  · 색을 창백한 회백색에서 두판상근 도판의 따뜻한 상아·황토로:
 *      하이라이트 #dfd0b4 · 중간톤 #b59a72 · 틈새 AO #2e2114
 *  · roughness 0.42~0.54 의 매끈한 치밀골 스페큘러 + 프레넬 림(서브서피스 느낌)
 *  · 봉합선·오목한 틈은 GLB 에 구워진 cavity(B 채널)로만 잉크선처럼 남김
 *
 * GLB 의 COLOR_0 채널 규약 (패키지 규약 그대로)
 *   R = 근접 차폐(32 mm)   G = 원거리 차폐(100 mm)   B = 날카로운 함몰(봉합선)
 *
 * 사용법
 *   const api = H3YBoneShader.applyH3YBoneShader(THREE, root, { quality: 1.0, detail: 0.8 });
 *   api.setQuality(0.0 | 0.5 | 1.0);   // 질감 끔 / 0.5 / 1.0
 */

const H3Y_NOISE_GLSL = `
float h3yHash(vec3 p){
  p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float h3yNoise(vec3 x){
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3yHash(i + vec3(0.0,0.0,0.0)), h3yHash(i + vec3(1.0,0.0,0.0)), f.x),
                 mix(h3yHash(i + vec3(0.0,1.0,0.0)), h3yHash(i + vec3(1.0,1.0,0.0)), f.x), f.y),
             mix(mix(h3yHash(i + vec3(0.0,0.0,1.0)), h3yHash(i + vec3(1.0,0.0,1.0)), f.x),
                 mix(h3yHash(i + vec3(0.0,1.0,1.0)), h3yHash(i + vec3(1.0,1.0,1.0)), f.x), f.y), f.z);
}`;

const H3Y_SURFACE_GLSL = `
vec3 h3yToLinear(vec3 c){ return pow(c, vec3(2.2)); }

// 두판상근 도판의 뼈: 짙은 갈색 틈새 → 황토 중간톤 → 따뜻한 상아 하이라이트
vec3 h3yIvory(float tone){
  vec3 cCave = h3yToLinear(vec3(0.180, 0.129, 0.078));  // #2e2114
  vec3 cMid  = h3yToLinear(vec3(0.710, 0.604, 0.447));  // #b59a72
  vec3 cHigh = h3yToLinear(vec3(0.875, 0.816, 0.706));  // #dfd0b4
  vec3 c = mix(cCave, cMid, smoothstep(0.05, 0.52, tone));
  c = mix(c, cHigh, smoothstep(0.52, 0.90, tone));
  return c;
}
vec3 h3yEnamelTone(float tone){
  vec3 cNeck  = h3yToLinear(vec3(0.588, 0.500, 0.396));
  vec3 cCrown = h3yToLinear(vec3(0.902, 0.878, 0.820));
  return mix(cNeck, cCrown, smoothstep(0.15, 0.85, tone));
}
vec3 h3yCartilageTone(float tone){
  vec3 cLow = h3yToLinear(vec3(0.478, 0.404, 0.310));
  vec3 cTop = h3yToLinear(vec3(0.812, 0.760, 0.663));
  return mix(cLow, cTop, smoothstep(0.10, 0.85, tone));
}`;

/** 재질 이름 → 모드·기본값 */
const H3Y_SURFACE = {
  h3y_bone:      { mode: 0, grain: 1.0, rim: 0.22, color: 0xdfd0b4, roughness: 0.47 },
  h3y_enamel:    { mode: 1, grain: 0.5, rim: 0.10, color: 0xe6ddc9, roughness: 0.30 },
  h3y_cartilage: { mode: 2, grain: 0.8, rim: 0.14, color: 0xcdbfa6, roughness: 0.58 }
};

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
    uMode:    { value: spec.mode },
    uDetail:  { value: options.detail !== undefined ? options.detail : 0.8 },
    uQuality: { value: options.quality !== undefined ? options.quality : 1.0 },
    uGrain:   { value: spec.grain },
    uRim:     { value: spec.rim }
  };
  material.userData.h3yUniforms = uniforms;
  material.userData.h3yMaterial = key;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uMode;
uniform float uDetail;
uniform float uQuality;
uniform float uGrain;
uniform float uRim;
attribute vec4 color;
varying vec3 vH3yWorld;
varying vec3 vH3yNormalW;
varying vec3 vH3yViewPos;
varying vec4 vH3yAO;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vH3yWorld = (modelMatrix * vec4(position, 1.0)).xyz;
vH3yNormalW = normalize(mat3(modelMatrix) * objectNormal);
vH3yAO = color;
vH3yViewPos = -(modelViewMatrix * vec4(position, 1.0)).xyz;`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uMode;
uniform float uDetail;
uniform float uQuality;
uniform float uGrain;
uniform float uRim;
varying vec3 vH3yWorld;
varying vec3 vH3yNormalW;
varying vec3 vH3yViewPos;
varying vec4 vH3yAO;
float h3yToneG;
float h3yPoreG;
${H3Y_NOISE_GLSL}
${H3Y_SURFACE_GLSL}`)
      // ---- 알베도 ----
      .replace('#include <map_fragment>', `#include <map_fragment>
float h3yAoNear = clamp(vH3yAO.r, 0.0, 1.0);
float h3yAoFar  = clamp(vH3yAO.g, 0.0, 1.0);
float h3yCavity = clamp(vH3yAO.b, 0.0, 1.0);
float h3yAo = h3yAoNear * mix(1.0, h3yAoFar, 0.55);
float h3yTone = clamp(h3yAo * (1.0 - 0.22 * h3yCavity), 0.0, 1.0);
h3yToneG = h3yTone;

// 아주 미세한 골결·다공질만. 저주파 얼룩은 넣지 않는다.
float h3yFine  = uQuality > 0.0 ? h3yNoise(vH3yWorld * 1450.0) : 0.5;
float h3yPore  = uQuality > 0.5 ? smoothstep(0.82, 0.99, h3yNoise(vH3yWorld * 620.0)) : 0.0;
float h3yMicro = uQuality > 0.0 ? h3yNoise(vH3yWorld * 215.0) : 0.5;
h3yPoreG = h3yPore;

if (uMode < 0.5) {
  vec3 albedo = h3yIvory(h3yTone);
  albedo *= 1.0 + 0.028 * (h3yMicro - 0.5) + 0.020 * (h3yFine - 0.5) - 0.055 * h3yPore;
  // 봉합선·구멍(영양공)은 짙은 갈색으로 스며들게
  albedo = mix(albedo, h3yToLinear(vec3(0.180, 0.129, 0.078)), 0.42 * h3yCavity);
  diffuseColor.rgb = albedo;
} else if (uMode < 1.5) {
  vec3 albedo = h3yEnamelTone(h3yTone);
  float perikymata = 0.5 + 0.5 * sin(vH3yWorld.y * 690.0 + h3yNoise(vH3yWorld * 40.0) * 5.0);
  albedo *= 0.985 + 0.030 * (h3yFine - 0.5) - 0.018 * perikymata;
  diffuseColor.rgb = albedo;
} else {
  vec3 albedo = h3yCartilageTone(h3yTone);
  albedo *= 1.0 + 0.040 * (h3yMicro - 0.5) - 0.045 * h3yPore;
  diffuseColor.rgb = albedo;
}`)
      // ---- 거칠기: 매끈한 치밀골 ----
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
if (uMode < 0.5) {
  // 매끈한 치밀골 반광: 0.38~0.50 (기공·골결에서만 미세하게 올라간다)
  roughnessFactor = clamp(0.440 + 0.030 * (h3yFine - 0.5) + 0.038 * h3yPoreG
                          - 0.022 * smoothstep(0.60, 1.00, h3yToneG), 0.38, 0.50);
} else if (uMode < 1.5) {
  roughnessFactor = clamp(0.285 + 0.040 * h3yFine, 0.24, 0.36);
} else {
  roughnessFactor = clamp(0.560 + 0.050 * (h3yMicro - 0.5), 0.48, 0.66);
}`)
      // ---- 미세 요철: 초고주파만, 아주 약하게 ----
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
if (uMode < 0.5) {
  vec3 nW = normalize(vH3yNormalW);
  if (uQuality > 0.5) {
    float e = 0.00022;
    float h0 = h3yNoise(vH3yWorld * 620.0);
    vec3 grad = vec3(h3yNoise((vH3yWorld + vec3(e, 0.0, 0.0)) * 620.0) - h0,
                     h3yNoise((vH3yWorld + vec3(0.0, e, 0.0)) * 620.0) - h0,
                     h3yNoise((vH3yWorld + vec3(0.0, 0.0, e)) * 620.0) - h0) / e;
    vec3 bump = grad - nW * dot(grad, nW);
    vec3 nPert = normalize(nW - bump * 0.000016 * (1.0 - 0.55 * h3yCavity));
    normal = normalize(mat3(viewMatrix) * nPert);
  } else {
    normal = normalize(mat3(viewMatrix) * nW);
  }
} else if (uMode < 1.5 && uQuality > 0.5) {
  vec3 nW = normalize(vH3yNormalW);
  float e = 0.0004;
  float h0 = h3yNoise(vH3yWorld * 430.0);
  vec3 grad = vec3(h3yNoise((vH3yWorld + vec3(e, 0.0, 0.0)) * 430.0) - h0,
                   h3yNoise((vH3yWorld + vec3(0.0, e, 0.0)) * 430.0) - h0,
                   h3yNoise((vH3yWorld + vec3(0.0, 0.0, e)) * 430.0) - h0) / e;
  vec3 bump = grad - nW * dot(grad, nW);
  normal = normalize(mat3(viewMatrix) * normalize(nW - bump * 0.000012));
}`);
    material.customProgramCacheKey = () => `h3y-bone-v2-${key}`;
  };
  return material;
}

/**
 * 씬(또는 GLB 루트)의 모든 뼈 메시를 실물 표본 피질골 재질로 교체합니다.
 * @returns {{materials, setQuality, setDetail, setRim}}
 */
function applyH3YBoneShader(THREE, root, options) {
  options = options || {};
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
    if (u) fn(u);
  });
  return {
    materials,
    setQuality: (q) => each((u) => { u.uQuality.value = q; }),
    setDetail: (d) => each((u) => { u.uDetail.value = d; }),
    setRim: (r) => each((u) => { u.uRim.value = r; })
  };
}

if (typeof window !== 'undefined') {
  window.H3YBoneShader = { createH3YBoneMaterial, applyH3YBoneShader, H3Y_SURFACE };
}
