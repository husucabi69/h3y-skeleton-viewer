/**
 * H3Y 전신 골격 — 표면 셰이더 v4
 * ============================================================================
 *  v1 (균열망) → v2 (균열 제거) → v3 (사진 기반 Tri-planar) → v3a2 (경추·요추
 *  검은 자국 제거) → v4 (골원·골단 다공·랩 라이팅 + 디스크·인대·반월상연골)
 *
 *  의장님 요청(2026-11-28 07:43): "더 리얼한 본 텍스처", "디스크도 결들이 다
 *  보이게", "ACL·PCL·MCL·LCL 같은 관절 인대도".
 *
 *  ── 뼈 (mode 0) v4 추가 ─────────────────────────────────────────────────
 *   · 골원/하버스관 세로 결: 세계좌표에서 수직으로 늘인 3번째 노이즈(520/m 횡,
 *     90/m 종)를 알베도·범프에 함께 사용 — 밉맵에서도 사라지지 않는다.
 *   · 골단(epiphysis) 다공질: COLOR_0.a 로 표시된 골단부에서 기공·거친 면을
 *     증폭(앱이 로드 시 뼈의 장축 양끝 15%를 a=1 로 굽는다).
 *   · 랩 라이팅: 명암 경계 너머로 새는 따뜻한 서브서피스 항 + 뒷면 투과.
 *   · v3a2 유지: 뒷면 법선 반전, h3yCave() 따뜻한 갈색, AO 바닥 0.18,
 *     함몰 혼합 0.38·pow(c,1.5).
 *
 *  ── 디스크 (mode 3, 재질 h3y_disc) ─────────────────────────────────────
 *   UV = (반경 t 0..1, 각도 0..1).  캡은 t=반경, 벽은 t=축방향 s.
 *   · 섬유륜 14층 동심원 층(lamella): 층마다 밝기·거칠기를 달리하고 층 경계에
 *     어두운 틈을 넣는다. 층 안의 콜라겐 다발은 층마다 ±35° 로 교차한다.
 *   · 수핵(nucleus, t<0.45): 젤리 같은 반투명, 미세 방사 결.
 *   · 벽면: 층 경계가 만드는 가로 띠 + 사선 교차 섬유 + 상·하면 부착부.
 *   · 젖은 연골 광택(roughness 0.26~0.38) + 프레넬 투과.
 *
 *  ── 인대 (mode 4, 재질 h3y_ligament) ────────────────────────────────────
 *   UV = (폭 0..1, 길이 0..1).  세로 콜라겐 다발(fascicle) 9~13개, 다발 사이
 *   틈, 미세 주름(crimp). 진주빛 백색-상아색, 부착부는 섬유연골로 누렇게.
 *
 *  ── 반월상연골 (mode 5, 재질 h3y_meniscus) ──────────────────────────────
 *   UV = (폭 0..1, 원주 0..1).  원주 다발 + 방사 결, 매트한 섬유연골.
 *
 * 사용법
 *   const api = H3YBoneShader.applyH3YBoneShader(THREE, root, { quality: 1.0 });
 *   api.setQuality(0 | 0.5 | 1);  api.setRim(0.2);  api.setTextureRoot('assets/tex');
 */

const H3Y_TEX_VERSION = 'v4a2';
const H3Y_TEX_FILES = {
  albedo: 'bone_albedo.jpg?v=' + H3Y_TEX_VERSION,
  normal: 'bone_normal.jpg?v=' + H3Y_TEX_VERSION,
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
// 깊은 틈새 — 따뜻한 짙은 갈색 (먹물 자국 방지)
vec3 h3yCave(){ return h3yToLinear(vec3(0.16, 0.11, 0.065)); }
vec3 h3yAmber(){ return h3yToLinear(vec3(0.353, 0.243, 0.122)); }

// 접선공간 노멀(0..1 텍스처) → 월드 기울기 벡터.
vec3 h3yTriNormalGrad(vec3 p, vec3 n, vec3 bw, float s){
  vec2 uv[3];
  uv[0] = p.zy * s;
  uv[1] = p.xz * s;
  uv[2] = p.xy * s;
  vec2 g0 = texture2D(uH3yNormalMap, uv[0]).xy * 2.0 - 1.0;
  vec2 g1 = texture2D(uH3yNormalMap, uv[1]).xy * 2.0 - 1.0;
  vec2 g2 = texture2D(uH3yNormalMap, uv[2]).xy * 2.0 - 1.0;
  g0 = vec2(-g0.x, -g0.y);
  g1 = vec2(-g1.x, -g1.y);
  g2 = vec2(-g2.x, -g2.y);
  vec3 sx = vec3(0.0, g0.y, g0.x) * sign(n.x + 1e-6);
  vec3 sy = vec3(g1.x, 0.0, g1.y) * sign(n.y + 1e-6);
  vec3 sz = vec3(g2.x, g2.y, 0.0) * sign(n.z + 1e-6);
  return sx * bw.x + sy * bw.y + sz * bw.z;
}

// 화면 미분 기반 범프 — 노멀을 화면 해상도에 맞춰 흔든다(밉맵에 사라지지 않음)
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
  return texture2D(uH3yAlbedoMap, p.zy * s).rgb * bw.x
       + texture2D(uH3yAlbedoMap, p.xz * s).rgb * bw.y
       + texture2D(uH3yAlbedoMap, p.xy * s).rgb * bw.z;
}

float h3yTriRough(vec3 p, vec3 bw, float s){
  float r = texture2D(uH3yRoughMap, p.zy * s).r * bw.x
          + texture2D(uH3yRoughMap, p.xz * s).r * bw.y
          + texture2D(uH3yRoughMap, p.xy * s).r * bw.z;
  return r;
}

// ───────────────────────── 디스크(섬유륜) ─────────────────────────
// 캡: t = 반경(0 수핵 → 1 외연), a = 각도.  벽: t = 축방향(0 아래 → 1 위).
struct H3yDisc {
  vec3  alb;
  float rough;
  float h;      // 범프용 높이장
  float sheen;
  float sss;
};

H3yDisc h3yDiscSample(vec2 uv, float wall){
  float t = uv.x;
  float a = uv.y * 6.2831853;      // 각도(rad)
  H3yDisc d;

  // --- 층(lamella) 구조
  float NL = 14.0;
  float outer = 0.44;                       // 수핵 경계
  float u = clamp((t - outer) / (1.0 - outer), 0.0, 1.0);
  float layerF = u * NL;
  float layer = floor(layerF);
  float w = layerF - layer;                 // 층 안 위치 0..1
  float sgn = mod(layer, 2.0) * 2.0 - 1.0;  // 층마다 섬유 방향 교차
  float tone = 0.5 + 0.5 * sin(layer * 2.399963);   // 층별 밝기 차

  // 층 경계 틈 (동심원 띠)
  float seam = smoothstep(0.0, 0.10, w) * smoothstep(0.0, 0.10, 1.0 - w);

  // 층 안 사선 콜라겐 다발 (층마다 ±35° 교차)
  float fib = sin(6.2831853 * (a * 12.0 + sgn * w * 3.0));
  fib = smoothstep(-0.35, 0.75, fib);
  // 다발 사이 잔결
  float fine = sin(6.2831853 * (a * 16.0 + sgn * w * 3.0));

  // 벽: 축방향 층 경계 + 사선 다발
  float wallBand = 0.0;
  if (wall > 0.5) {
    float sb = t;                             // 축 0..1
    float NB2 = 6.0;                          // 벽면에 보이는 층 경계 수
    wallBand = smoothstep(0.04, 0.22, fract(sb * NB2)) * smoothstep(0.04, 0.22, 1.0 - fract(sb * NB2));
    fib = sin(6.2831853 * (a * 12.0 + sgn * sb * 2.2 + sb * 4.0));
    fib = smoothstep(-0.35, 0.75, fib);
    fine = sin(6.2831853 * (a * 16.0 + sb * 4.0));
    seam = mix(0.55, 1.0, wallBand);
  }

  // 수핵: 젤리 + 방사 미세결
  float nuc = 1.0 - smoothstep(outer - 0.12, outer + 0.06, t);
  float nucFib = sin(6.2831853 * (a * 13.0 + t * 3.0)) * 0.5 + 0.5;

  // 알베도 (섬유륜: 푸른기 도는 상아색 / 수핵: 연한 황갈색 반투명)
  vec3 ann = mix(vec3(0.520, 0.505, 0.470), vec3(0.780, 0.768, 0.730), 0.35 + 0.65 * tone);
  ann *= mix(0.80, 1.0, seam);                       // 층 틈 어둡게(동심원 층)
  ann *= mix(0.92, 1.06, fib);                       // 다발 마루 밝게
  ann *= mix(0.97, 1.02, fine * 0.5 + 0.5);
  vec3 np = mix(vec3(0.560, 0.525, 0.460), vec3(0.700, 0.678, 0.615), nucFib * 0.6 + 0.4);
  d.alb = mix(ann, np, clamp(nuc, 0.0, 1.0));
  if (wall > 0.5) d.alb = mix(d.alb, d.alb * 1.03, wallBand);

  // 거칠기 — 층 틈과 수핵은 더 거칠고, 다발 마루는 젖은 광택
  d.rough = mix(0.42, 0.24, fib) + 0.14 * (1.0 - seam) + 0.06 * nuc;

  // 높이장 (범프)
  d.h = (fib - 0.5) * 0.60 + (fine - 0.5) * 0.10 + (1.0 - seam) * -1.0 + nuc * 0.10;

  d.sheen = 0.16;
  d.sss = 0.35 + 0.25 * nuc;
  return d;
}

// ───────────────────────── 인대 ─────────────────────────
struct H3yLig {
  vec3  alb;
  float rough;
  float h;
  float sheen;
  float sss;
};

H3yLig h3yLigSample(vec2 uv){
  float t = uv.x;              // 폭 0..1
  float s = uv.y;              // 길이 0..1
  H3yLig L;
  float NF = 11.0;
  float b = t * NF;
  float bundle = floor(b);
  float w = b - bundle;
  // 다발 사이 틈
  float gap = smoothstep(0.0, 0.13, w) * smoothstep(0.0, 0.13, 1.0 - w);
  // 다발 내부 세로 미세결 (길이방향) + 주름(crimp)
  float crimp = sin(6.2831853 * (s * 22.0 + sin(t * 34.0) * 0.35));
  float stri = sin(6.2831853 * (t * 210.0 + s * 3.0));
  float tone = 0.5 + 0.5 * sin(bundle * 2.399963);

  vec3 ivory = mix(vec3(0.700, 0.665, 0.600), vec3(0.930, 0.905, 0.850), 0.45 + 0.55 * tone);
  ivory *= mix(0.80, 1.05, gap);                     // 다발 틈 어둡게
  ivory *= mix(0.94, 1.05, crimp * 0.5 + 0.5);
  ivory *= mix(0.97, 1.03, stri * 0.5 + 0.5);
  // 부착부(양끝)는 섬유연골로 누렇게
  float ends = smoothstep(0.10, 0.0, s) + smoothstep(0.90, 1.0, s);
  ivory = mix(ivory, vec3(0.760, 0.690, 0.545), clamp(ends, 0.0, 1.0) * 0.65);
  L.alb = ivory;
  L.rough = mix(0.30, 0.46, 1.0 - gap) + 0.06 * ends;
  L.h = (gap - 0.55) * 0.9 + (crimp - 0.5) * 0.22 + (stri - 0.5) * 0.10;
  L.sheen = 0.40;
  L.sss = 0.85;
  return L;
}

// ───────────────────────── 반월상연골 ─────────────────────────
H3yLig h3yMenSample(vec2 uv){
  float t = uv.x;              // 폭(외연 → 내연)
  float s = uv.y;              // 원주
  H3yLig L;
  float circ = sin(6.2831853 * (s * 46.0 + t * 1.6));
  float radial = sin(6.2831853 * (t * 26.0 + s * 4.0));
  float tone = mix(0.55, 0.85, t);
  vec3 c = mix(vec3(0.700, 0.680, 0.610), vec3(0.880, 0.860, 0.790), tone);
  c *= mix(0.92, 1.04, circ * 0.5 + 0.5);
  c *= mix(0.95, 1.04, radial * 0.5 + 0.5);
  L.alb = c;
  L.rough = 0.48 + 0.08 * (1.0 - t);
  L.h = (circ - 0.5) * 0.35 + (radial - 0.5) * 0.25;
  L.sheen = 0.20;
  L.sss = 0.55;
  return L;
}`;

/** 재질 이름 → 모드·기본값 */
const H3Y_SURFACE = {
  h3y_bone:      { mode: 0, rim: 0.16, color: 0xffffff, roughness: 0.62 },
  h3y_enamel:    { mode: 1, rim: 0.12, color: 0xffffff, roughness: 0.30 },
  h3y_cartilage: { mode: 2, rim: 0.16, color: 0xffffff, roughness: 0.55 },
  h3y_disc:      { mode: 3, rim: 0.10, color: 0xffffff, roughness: 0.34 },
  h3y_ligament:  { mode: 4, rim: 0.12, color: 0xffffff, roughness: 0.36 },
  h3y_meniscus:  { mode: 5, rim: 0.10, color: 0xffffff, roughness: 0.50 }
};

/** 텍스처 로더 (한 번만) */
const H3Y_TEX_STATE = { loaded: false, loading: false, root: 'assets/tex', albedo: null, normal: null, roughness: null, listeners: [] };

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
    uAlbScale:  { value: 1 / 0.054 },
    uNrmScale:  { value: 1 / 0.054 },
    uNrmScale2: { value: 1 / 0.029 },
    uNrmGain:   { value: 1.6 },
    uTexMix:    { value: 0.0 },
    uDebugAO:   { value: 0.0 },
    uSheen:     { value: 0.06 },
    uBump:      { value: 0.22 },
    uSheenGloss:{ value: 0.55 },
    uOsteon:    { value: 1.0 },
    uPorous:    { value: 1.0 },
    uSss:       { value: 1.0 },
    uSoftDir:   { value: new THREE.Vector3(0.495, 0.522, 0.694).normalize() },
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
attribute vec2 h3yUv;
varying vec3 vH3yWorld;
varying vec3 vH3yNormalW;
varying vec4 vH3yAO;
varying vec2 vH3yUv;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vH3yWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
vH3yNormalW = normalize(mat3(modelMatrix) * objectNormal);
vH3yAO = color;
vH3yUv = h3yUv;`);

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
uniform float uOsteon;
uniform float uPorous;
uniform float uSss;
uniform vec3  uSoftDir;
uniform sampler2D uH3yAlbedoMap;
uniform sampler2D uH3yNormalMap;
uniform sampler2D uH3yRoughMap;
varying vec3 vH3yWorld;
varying vec3 vH3yNormalW;
varying vec4 vH3yAO;
varying vec2 vH3yUv;
float h3yTriBlendX;
float h3yTriBlendY;
float h3yTriBlendZ;
float h3yCavityG;
float h3yN1;
float h3yN2;
float h3yEpiph;
float h3yTissueH;
float h3yTissueSss;
float h3yTissueSheen;
vec3 h3yNWp;
${H3Y_NOISE_GLSL}
${H3Y_SURFACE_GLSL}`)
      // ---------------- 알베도 ----------------
      .replace('#include <map_fragment>', `
float h3yAoNear = clamp(vH3yAO.r, 0.0, 1.0);
float h3yAoFar  = clamp(vH3yAO.g, 0.0, 1.0);
float h3yCavity = clamp(vH3yAO.b, 0.0, 1.0);
float h3yAo = mix(h3yAoNear, h3yAoNear * h3yAoFar, 0.55);
h3yAo = clamp(h3yAo, 0.18, 1.0);
h3yCavityG = h3yCavity;
// COLOR_0.a = 골단(epiphysis) 표시 (앱이 장축 양끝을 굽는다)
h3yEpiph = clamp(vH3yAO.a, 0.0, 1.0);

vec3 h3yNw = normalize(vH3yNormalW);
// 뒷면(DoubleSide)은 법선을 뒤집어야 라이팅·림이 뒤집혀 검게 보이지 않는다
if (!gl_FrontFacing) h3yNw = -h3yNw;
vec3 h3yBw = pow(abs(h3yNw), vec3(3.0));
h3yBw /= max(dot(h3yBw, vec3(1.0)), 1e-4);
h3yTriBlendX = h3yBw.x; h3yTriBlendY = h3yBw.y; h3yTriBlendZ = h3yBw.z;

vec3 h3yAlb;
h3yTissueH = 0.0;
h3yTissueSss = 0.0;
h3yTissueSheen = 0.0;
float h3yIsTissue = (uMode > 2.5) ? 1.0 : 0.0;

if (uMode > 2.5) {
  // ───── 디스크 / 인대 / 반연골 ─────
  if (uMode < 3.5) {
    H3yDisc d = h3yDiscSample(vH3yUv, step(0.5, vH3yAO.a));
    h3yAlb = d.alb;
    h3yTissueH = d.h;
    h3yTissueSss = d.sss;
    h3yTissueSheen = d.sheen;
  } else if (uMode < 4.5) {
    H3yLig l = h3yLigSample(vH3yUv);
    h3yAlb = l.alb;
    h3yTissueH = l.h;
    h3yTissueSss = l.sss;
    h3yTissueSheen = l.sheen;
  } else {
    H3yLig m = h3yMenSample(vH3yUv);
    h3yAlb = m.alb;
    h3yTissueH = m.h;
    h3yTissueSss = m.sss;
    h3yTissueSheen = m.sheen;
  }
  h3yAlb = pow(h3yAlb, vec3(2.2));        // sRGB → linear
  float occl = mix(0.42, 1.0, h3yAo) * mix(0.72, 1.0, h3yCavity);
  h3yAlb *= occl;
} else if (uQuality > 0.05 && uTexMix > 0.01) {
  h3yAlb = h3yTriAlbedo(vH3yWorld, h3yBw, uAlbScale);
  float motA = h3yNoise(vH3yWorld * 5.5 + 17.3);
  float motB = h3yNoise(vH3yWorld * 14.0 + 3.1);
  float motC = h3yNoise(vH3yWorld * 31.0 + 8.7);
  float mot = motA * 0.52 + motB * 0.31 + motC * 0.17;
  float mWarm = smoothstep(0.30, 0.72, mot);
  h3yAlb *= mix(vec3(0.885, 0.815, 0.705), vec3(1.075, 1.030, 0.985), mWarm);
  float amberSpot = smoothstep(0.76, 0.94, motC) * smoothstep(0.40, 0.62, motA);
  h3yAlb *= mix(vec3(1.0), vec3(0.88, 0.755, 0.605), amberSpot);
  vec3 h3yP2 = vec3(vH3yWorld.x * 0.83 + vH3yWorld.z * 0.56,
                   vH3yWorld.y * 1.07 - vH3yWorld.z * 0.31,
                   vH3yWorld.z * 0.79 - vH3yWorld.x * 0.62);
  h3yN1 = h3yNoise(vH3yWorld * 330.0 + 7.0) - 0.5;
  h3yN2 = h3yNoise(h3yP2 * 158.0 + 13.0) - 0.5;
  h3yAlb *= 1.0 + 0.085 * h3yN1 + 0.075 * h3yN2;
  // ── v4: 골원(osteon)·하버스관 세로 결 — 수직으로 늘인 3번째 필드
  vec3 h3yP3 = vec3(vH3yWorld.x * 1.0 + vH3yWorld.y * 0.12,
                    vH3yWorld.y * 1.0 - vH3yWorld.x * 0.12,
                    vH3yWorld.z * 0.34);
  float osteon = h3yNoise(h3yP3 * 560.0 + 51.0) - 0.5;
  float osteon2 = h3yNoise(h3yP3 * 210.0 + 83.0) - 0.5;
  h3yAlb *= 1.0 + uOsteon * (0.055 * osteon + 0.035 * osteon2);
  // ── v4: 골단부 다공질 — 기공이 밀집하고 국소적으로 어두워진다
  float pore = h3yNoise(vH3yWorld * 1400.0 + 29.0) * 0.65
             + h3yNoise(vH3yWorld * 3200.0 + 61.0) * 0.35;
  float poreM = smoothstep(0.70, 0.97, pore) * h3yEpiph * uPorous;
  h3yAlb *= 1.0 - 0.055 * poreM;
  h3yAlb *= mix(1.0, 0.992, h3yEpiph * uPorous);
  h3yAlb = mix(vec3(0.62, 0.55, 0.44), h3yAlb, uTexMix);
} else {
  h3yAlb = mix(vec3(0.62, 0.55, 0.44), vec3(0.78, 0.70, 0.56), h3yAo);
}

if (uMode < 0.5) {
  float depth = pow(1.0 - h3yAo, 1.15);
  h3yAlb = mix(h3yAlb, h3yCave(), 0.48 * depth);
  h3yAlb = mix(h3yAlb, h3yCave(), 0.38 * pow(h3yCavity, 1.5));
  h3yAlb = mix(h3yAlb, h3yAmber(), 0.10 * smoothstep(0.55, 1.0, 1.0 - h3yAo));
  h3yAlb *= mix(0.90, 1.06, smoothstep(0.55, 1.0, h3yAo));
} else if (uMode < 0.5 + 1.0 && uMode > 0.5) {
  vec3 enamel = mix(vec3(0.86, 0.83, 0.77), vec3(0.95, 0.93, 0.88), smoothstep(0.3, 1.0, h3yAo));
  h3yAlb = mix(h3yAlb, enamel, 0.55);
  h3yAlb = mix(h3yAlb, h3yCave(), 0.35 * pow(1.0 - h3yAo, 2.0));
} else if (uMode > 1.5 && uMode < 2.5) {
  vec3 cart = mix(vec3(0.55, 0.47, 0.36), vec3(0.78, 0.72, 0.61), smoothstep(0.25, 1.0, h3yAo));
  h3yAlb = mix(h3yAlb, cart, 0.60);
  h3yAlb = mix(h3yAlb, h3yCave(), 0.45 * pow(1.0 - h3yAo, 1.8));
}
diffuseColor.rgb = h3yAlb;
if (uDebugAO > 0.5) diffuseColor.rgb = vec3(h3yAoNear, h3yAoFar, h3yCavity);`)
      // ---------------- 거칠기 ----------------
      .replace('#include <roughnessmap_fragment>', `
float roughnessFactor = 0.46;
if (uMode > 2.5) {
  if (uMode < 3.5) {
    float t = vH3yUv.x, a = vH3yUv.y;
    float fib = sin(6.2831853 * (a * 12.0 + t * 3.0)) * 0.5 + 0.5;
    float u = clamp((t - 0.44) / 0.56, 0.0, 1.0);
    float w = fract(u * 14.0);
    float seam = smoothstep(0.0, 0.10, w) * smoothstep(0.0, 0.10, 1.0 - w);
    roughnessFactor = clamp(mix(0.38, 0.24, fib) + 0.12 * (1.0 - seam), 0.20, 0.52);
    if (step(0.5, vH3yAO.a) > 0.5) roughnessFactor += 0.05;
  } else if (uMode < 4.5) {
    float b = fract(vH3yUv.x * 11.0);
    float gap = smoothstep(0.0, 0.13, b) * smoothstep(0.0, 0.13, 1.0 - b);
    roughnessFactor = clamp(mix(0.30, 0.44, 1.0 - gap), 0.24, 0.50);
  } else {
    roughnessFactor = clamp(0.48 + 0.06 * (1.0 - vH3yUv.x), 0.40, 0.60);
  }
} else if (uMode < 0.5) {
  float rm = 0.452;
  if (uQuality > 0.05 && uTexMix > 0.01) {
    rm = h3yTriRough(vH3yWorld, vec3(h3yTriBlendX, h3yTriBlendY, h3yTriBlendZ), uAlbScale);
    rm = mix(0.452, rm, uTexMix);
  }
  float epiRough = 0.035 * h3yEpiph * uPorous;     // 골단은 더 거칠다
  roughnessFactor = clamp(rm + 0.17 + 0.06 * h3yCavityG + 0.02 * (1.0 - h3yAoNear) + epiRough, 0.52, 0.84);
} else if (uMode < 1.5) {
  roughnessFactor = clamp(0.30 + 0.05 * h3yCavityG, 0.24, 0.40);
} else {
  roughnessFactor = clamp(0.55 + 0.06 * (1.0 - h3yAoNear), 0.42, 0.68);
}`)
      // ---------------- 요철 노멀 ----------------
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
if (uMode > 2.5) {
  // 조직(디스크·인대)은 절차적 높이장의 화면미분 범프
  float str = (uMode < 3.5) ? 0.0013 : 0.0017;
  vec2 dH = clamp(vec2(dFdx(h3yTissueH), dFdy(h3yTissueH)) * str, vec2(-0.12), vec2(0.12));
  h3yNWp = h3yBump(-vViewPosition, h3yNw, dH, faceDirection);
  normal = h3yBump(-vViewPosition, normal, dH, faceDirection);
} else {
if (uQuality > 0.05 && uTexMix > 0.01) {
  vec3 bw2 = vec3(h3yTriBlendX, h3yTriBlendY, h3yTriBlendZ);
  float gain = uNrmGain * mix(1.0, 0.35, h3yCavityG);
  if (uMode > 0.5) gain *= 0.5;
  vec3 g1n = h3yTriNormalGrad(vH3yWorld, h3yNw, bw2, uNrmScale);
  vec3 g2n = h3yTriNormalGrad(vH3yWorld + vec3(0.213, 0.517, 0.371), h3yNw, bw2, uNrmScale2);
  vec3 grad = (g1n * 0.68 + g2n * 0.42) * gain * uTexMix;
  grad -= h3yNw * dot(grad, h3yNw);
  vec3 nPert = normalize(h3yNw - grad);
  h3yNWp = nPert;
  normal = normalize((viewMatrix * vec4(nPert, 0.0)).xyz);
} else {
  h3yNWp = h3yNw;
}
{
  float f1 = 330.0, f2 = 150.0;
  float pixW = length(fwidth(vH3yWorld));
  float fade1 = 1.0 - smoothstep(0.30 / f1, 0.90 / f1, pixW);
  float fade2 = 1.0 - smoothstep(0.30 / f2, 0.90 / f2, pixW);
  float hN = h3yN1 * 1.10 * fade1 + h3yN2 * 0.95 * fade2;
  vec2 dH = clamp(vec2(dFdx(hN), dFdy(hN)) * uBump * 0.0026, vec2(-0.06), vec2(0.06));
  h3yNWp = h3yBump(-vViewPosition, h3yNWp, dH, faceDirection);
  normal = h3yBump(-vViewPosition, normal, dH, faceDirection);
}
}`)
      // ---------------- 실루엣 림·셰인·서브서피스 ----------------
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec3 Vw = normalize(cameraPosition - vH3yWorld);
  vec3 Hh = normalize(uSoftDir + Vw);
  vec3 Np = normalize(h3yNWp);
  float ndh = max(dot(Np, Hh), 0.0);
  float gloss = mix(26.0, 95.0, clamp(uSheenGloss, 0.0, 1.0));
  float sheen = pow(ndh, gloss) * (gloss + 8.0) / 25.0;
  float fres = 0.035 + 0.965 * pow(1.0 - clamp(dot(Np, Vw), 0.0, 1.0), 5.0);
  vec3 sheenCol = mix(vec3(0.95, 0.90, 0.80), vec3(1.0, 0.93, 0.80), 0.5);
  float sheenW = uSheen * mix(0.25, 1.0, h3yAoNear);
  if (uMode > 2.5) sheenW = h3yTissueSheen;
  totalEmissiveRadiance += sheenCol * sheen * fres * sheenW;
  // ── v4 서브서피스: 명암 경계 너머로 새는 따뜻한 빛
  if (uMode < 2.5) {
    float ndv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
    float wrap = pow(1.0 - ndv, 2.0);
    vec3 sssCol = mix(vec3(0.38, 0.27, 0.18), vec3(0.60, 0.44, 0.30), h3yAoNear);
    totalEmissiveRadiance += sssCol * wrap * 0.065 * uSss * (0.55 + 0.45 * h3yEpiph);
    // 골단부 미세 투과 — 얇은 골단이 촛불처럼 비친다
    totalEmissiveRadiance += vec3(0.30, 0.17, 0.09) * h3yEpiph * uPorous * 0.06 * (1.0 - ndv);
  } else {
    float ndv2 = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
    vec3 ssCol = (uMode < 3.5) ? vec3(0.80, 0.78, 0.70) : vec3(0.86, 0.82, 0.74);
    totalEmissiveRadiance += ssCol * pow(1.0 - ndv2, 3.0) * 0.10 * h3yTissueSss;
  }
}
if (uRim > 0.001) {
  float ndv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 3.2);
  totalEmissiveRadiance += uRimColor * fres * uRim * mix(0.35, 1.0, h3yAoNear);
}`);
    material.customProgramCacheKey = () => `h3y-bone-v4-${key}`;
  };

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
 * 씬(또는 GLB 루트)의 모든 메시를 표면 재질로 교체합니다.
 * 뼈 메시에는 로드 시 골단 표시(COLOR_0.a)를 굽습니다.
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
    setOsteon: (v) => each((u) => { u.uOsteon.value = v; }),
    setPorous: (v) => each((u) => { u.uPorous.value = v; }),
    setSss: (v) => each((u) => { u.uSss.value = v; }),
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
