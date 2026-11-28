/* H3Y 전신 골격 242 — 검수 전용 독립 웹 뷰어
 * 카메라 조작은 패키지의 육안검수_무릎하지_UHD_v2.html 방식을 그대로 계승하고,
 * 개별 뼈 242 / 임상 모듈 62 / 부위 13 / 전신 마스터를 한 화면에서 오가도록 확장했다.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('c');
  var statusEl = $('status');
  var loadingEl = $('loading');
  var loadingText = $('loadingText');
  var nameEl = $('name');
  var sub2El = $('sub2');

  if (!window.THREE || !THREE.GLTFLoader) {
    loadingText.textContent = '3D 엔진(three.js)을 읽지 못했습니다. 페이지를 새로 고침해 주세요.';
    return;
  }

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (err) {
    loadingText.textContent = '이 브라우저에서 WebGL을 열 수 없습니다. 삼성 인터넷이나 크롬에서 다시 열어 주세요.';
    return;
  }
  // v4.2: 조작 중에는 낮은 DPR, 정지하면 3.0 까지 올려 선명하게 (tick 참조)
  var dprCap = Math.min(window.devicePixelRatio || 1, 2.0);
  renderer.setPixelRatio(dprCap);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.03;
  renderer.setClearColor(0x000000, 0);
  // v4.2: 실시간 그림자 (전신 모드에서는 자동으로 끔)
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(34, 1, 0.01, 50);
  camera.position.set(0, 0, 1);

  // ---------- 스튜디오 조명 (다크/화이트) ----------
  function makeLight(color, intensity, yaw, pitch) {
    var l = new THREE.DirectionalLight(color, intensity);
    l.position.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(4);
    scene.add(l);
    return l;
  }
  var ambLight = new THREE.AmbientLight(0x2b3341, 0.45);
  scene.add(ambLight);
  var keyLight = makeLight(0xfff6ea, 1.55, 0.52, 0.62);   // 중성 스튜디오 키
  var keyDir = keyLight.position.clone().normalize();
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.bias = -0.0004;
  keyLight.shadow.normalBias = 0.0015;
  keyLight.shadow.camera.near = 0.0005;
  keyLight.shadow.camera.far = 100;
  scene.add(keyLight.target);
  var rimLight = makeLight(0xffe8cf, 0.30, Math.PI - 0.45, -0.10); // 은은한 앰버 림
  var fillLight = makeLight(0xdfe6f2, 0.22, -1.30, 0.18);  // 부드러운 필
  var topLight = makeLight(0x5a4a34, 0.25, 0.0, 1.15);     // 천장 바운스
  var bounceLight = makeLight(0x4a3a26, 0.30, 0.0, -0.75); // 아래 반사판

  var THEMES = {
    dark: {
      amb: [0x2b3341, 0.30], key: [0xfff6ea, 1.55], rim: [0xffe8cf, 0.30],
      fill: [0xdfe6f2, 0.22], top: [0x6a5a44, 0.18], bounce: [0x4a3a26, 0.24], shaderRim: 0.16
    },
    light: {
      amb: [0xffffff, 0.24], key: [0xffffff, 0.72], rim: [0xfff6ea, 0.14],
      fill: [0xeef3ff, 0.28], top: [0xffffff, 0.18], bounce: [0xffffff, 0.10], shaderRim: 0.08
    }
  };
  var themeName = 'dark';

  function applyTheme(name) {
    themeName = name;
    var t = THEMES[name] || THEMES.dark;
    ambLight.color.setHex(t.amb[0]); ambLight.intensity = t.amb[1];
    keyLight.color.setHex(t.key[0]); keyLight.intensity = t.key[1];
    rimLight.color.setHex(t.rim[0]); rimLight.intensity = t.rim[1];
    fillLight.color.setHex(t.fill[0]); fillLight.intensity = t.fill[1];
    topLight.color.setHex(t.top[0]); topLight.intensity = t.top[1];
    bounceLight.color.setHex(t.bounce[0]); bounceLight.intensity = t.bounce[1];

    document.body.classList.toggle('theme-dark', name === 'dark');
    document.body.classList.toggle('theme-light', name === 'light');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', name === 'dark' ? '#07090d' : '#f4f6f9');
    Array.prototype.forEach.call(document.querySelectorAll('[data-theme]'), function (b) {
      b.classList.toggle('on', b.dataset.theme === name);
    });
    if (S.shaderApi && S.shaderApi.setRim) S.shaderApi.setRim(t.shaderRim);
    try { localStorage.setItem('h3y-skel-theme', name); } catch (e) {}
  }

  var holder = new THREE.Group();
  scene.add(holder);
  var pickables = [];

  var S = {
    data: null,
    boneBySlug: {},
    mode: 'bones',
    items: [],
    idx: -1,
    region: 'all',
    q: '',
    tex: 1.0,
    loadSeq: 0,
    shaderApi: null,
    shaderBroken: false,
    current: null,
    pickedBone: null,
    tissue: { disc: true, lig: true },
    tissueGroup: null,
    tissueUrls: [],
    tissueSeq: 0,
    shadow: true
  };

  try {
    var ts = JSON.parse(localStorage.getItem('h3y-skel-tissue') || 'null');
    if (ts && typeof ts === 'object') {
      S.tissue.disc = ts.disc !== false;
      S.tissue.lig = ts.lig !== false;
    }
  } catch (e) {}
  try {
    var sh = localStorage.getItem('h3y-skel-shadow');
    if (sh === '0') S.shadow = false;
  } catch (e) {}

  // ---------- v4.2 실시간 그림자 ----------
  // 키라이트 한 개만 그림자를 낸다(2048 PCFSoft). 구도에 따라 그림자 카메라를
  // 현재 모델의 바운딩 구에 맞추어 재설정하므로, 논문 크기(수 mm~전신)와 상관없이
  // 그림자가 뭉개지거나 잘리지 않는다.
  var shadowMapSize = 0;

  function shadowAllowed() {
    // 전신(242뼈 전체)은 자동으로 끈다 — 성능 안전장치.
    if (S.current && S.current.kind === 'master') return false;
    return !!S.shadow;
  }

  function setShadowMapSize(n) {
    if (n === shadowMapSize) return;
    shadowMapSize = n;
    if (keyLight.shadow.map) {
      keyLight.shadow.map.dispose();
      keyLight.shadow.map = null;
    }
    keyLight.shadow.mapSize.set(n, n);
  }

  function fitShadowCamera() {
    holder.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(holder);
    if (box.isEmpty()) return;
    var bs = new THREE.Sphere();
    box.getBoundingSphere(bs);
    var r = Math.max(bs.radius, 1e-3);
    // 모델은 원점에 있지 않을 수 있다(초점(focus)이 있는 모듈은 실제 해부 좌표에
    // 그대로 앉아 있다). 그림자 카메라는 반드시 "모델 중심"을 보게 해야 한다.
    var c = box.getCenter(new THREE.Vector3());
    var dist = r * 2.6;
    keyLight.target.position.copy(c);
    keyLight.target.updateMatrixWorld();
    keyLight.position.copy(c).addScaledVector(keyDir, dist);
    keyLight.updateMatrixWorld();
    var cam = keyLight.shadow.camera;
    cam.left = -r * 1.05; cam.right = r * 1.05;
    cam.top = r * 1.05; cam.bottom = -r * 1.05;
    cam.near = Math.max(dist - r * 1.7, r * 0.02);
    cam.far = dist + r * 1.7;
    cam.updateProjectionMatrix();
    // 여드름(acne)·피터패닝 — 모델 반지름에 비례해 조정한다.
    // 2048 맵 + 반지름 r 이면 텍셀 한 칸 ≈ 2r/2048 이므로 그 2~3배를 노멀 바이어스로.
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.normalBias = Math.min(Math.max(r * 0.012, 0.0005), 0.02);
    keyLight.shadow.needsUpdate = true;
  }

  function applyShadow() {
    var on = shadowAllowed();
    keyLight.castShadow = on;
    if (on) {
      setShadowMapSize(dprTris > 450000 ? 1024 : 2048);
      fitShadowCamera();
    }
    updateShadowUI();
  }

  function updateShadowUI() {
    var btn = $('shadowBtn');
    if (!btn) return;
    var master = !!(S.current && S.current.kind === 'master');
    var on = shadowAllowed();
    btn.classList.toggle('on', on);
    btn.classList.toggle('auto', master);
    btn.textContent = master ? '그림자 자동 OFF'
      : (S.shadow ? '그림자 ON' : '그림자 OFF');
    var hint = $('shadowHint');
    if (hint) {
      hint.textContent = master ? '전신 242는 성능 보호로 자동 꺼짐'
        : (S.shadow ? '정지 시 3.0배 · 조작 중 2.0배' : '그림자 꺼짐 · 정지 시 3.0배 렌더');
    }
  }

  function setShadow(on) {
    S.shadow = !!on;
    try { localStorage.setItem('h3y-skel-shadow', S.shadow ? '1' : '0'); } catch (e) {}
    applyShadow();
  }

  // ---------- 카메라 ----------
  var FRONT_YAW = Math.PI + 0.12;
  var camState = {
    yaw: FRONT_YAW, pitch: 0.08, dist: 1.2, target: new THREE.Vector3(),
    tYaw: FRONT_YAW, tPitch: 0.08, tDist: 1.2, tTarget: new THREE.Vector3()
  };
  var fitR = 0.5, minDist = 0.05, maxDist = 5;

  function screenUpVec(yaw, pitch) {
    // 카메라가 보는 방향에 대한 화면 "위" 축(월드). 패널을 피해 대상을 화면 위쪽에 앉힌다.
    var f = new THREE.Vector3(-Math.cos(pitch) * Math.sin(yaw), -Math.sin(pitch), -Math.cos(pitch) * Math.cos(yaw)).normalize();
    var right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0));
    if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
    right.normalize();
    return new THREE.Vector3().crossVectors(right, f).normalize();
  }

  function fit(instant) {
    if (S.current && S.current.focus) {
      var f = S.current.focus;
      camState.tTarget.set(f.target[0], f.target[1], f.target[2]);
      camState.tDist = f.dist;
      minDist = f.dist * 0.12; maxDist = f.dist * 6;
      if (instant) { camState.target.copy(camState.tTarget); camState.dist = f.dist; }
      holder.position.set(0, 0, 0);
      camera.near = Math.max(f.dist * 0.004, 0.0004);
      camera.far = f.dist * 60;
      camera.updateProjectionMatrix();
      return;
    }
    holder.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(holder);
    if (box.isEmpty()) return;
    var c = new THREE.Vector3();
    box.getCenter(c);
    holder.position.sub(c);
    holder.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(holder);
    var sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    fitR = Math.max(sphere.radius, 1e-4);
    var center = new THREE.Vector3();
    box.getCenter(center);

    // 하단 패널·상단 바를 뺀 "실제로 보이는 영역" 기준으로 프레이밍한다.
    var vh = window.innerHeight || 1;
    var panelEl = $('panel');
    var panelRect = panelEl ? panelEl.getBoundingClientRect() : null;
    var panelH = panelRect ? panelRect.height + 18 : 0;
    var topH = 58;
    var effH = Math.max(vh - panelH - topH, vh * 0.42);
    var vfovFull = THREE.MathUtils.degToRad(camera.fov);
    var vfovEff = 2 * Math.atan(Math.tan(vfovFull / 2) * effH / vh);
    var hfov = 2 * Math.atan(Math.tan(vfovFull / 2) * camera.aspect);
    var fovMin = Math.min(vfovEff, hfov);
    var d = fitR / Math.sin(fovMin / 2) * 1.06;

    var pxToWorld = (2 * d * Math.tan(vfovFull / 2)) / vh;
    center.addScaledVector(screenUpVec(camState.tYaw, camState.tPitch), (topH - panelH) / 2 * pxToWorld);

    minDist = fitR * 0.12;
    maxDist = fitR * 9;
    camState.tTarget.copy(center);
    camState.tDist = d;
    if (instant) {
      camState.target.copy(center);
      camState.dist = d;
    }
    camera.near = Math.max(fitR * 0.004, 0.0004);
    camera.far = fitR * 60;
    camera.updateProjectionMatrix();
  }

  function setAngle(a) {
    if (a === 'front') { camState.tYaw = FRONT_YAW; camState.tPitch = 0.08; }
    else if (a === 'side') { camState.tYaw = Math.PI * 1.5; camState.tPitch = 0.06; }
    else if (a === 'back') { camState.tYaw = 0.12; camState.tPitch = 0.08; }
    else if (a === 'top') { camState.tYaw = Math.PI; camState.tPitch = 1.45; }
    vYaw = 0; vPitch = 0;
    Array.prototype.forEach.call(document.querySelectorAll('[data-angle]'), function (b) {
      b.classList.toggle('on', b.dataset.angle === a);
    });
  }

  // ---------- 포맷 ----------
  function fmtInt(n) { return (n || 0).toLocaleString('ko-KR'); }
  function fmtBytes(n) {
    if (!n) return '0 B';
    if (n >= 1048576) return (n / 1048576).toFixed(n >= 10485760 ? 1 : 2) + ' MB';
    if (n >= 1024) return Math.round(n / 1024) + ' KB';
    return n + ' B';
  }

  // ---------- 재질 ----------
  var fbFlat = null, fbStd = null;
  function fallbackMaterials() {
    if (fbFlat) return;
    fbFlat = new THREE.MeshStandardMaterial({ color: 0xd8c3a0, roughness: 0.55, metalness: 0.0, side: THREE.DoubleSide });
    fbFlat.name = 'h3y_bone';
    fbStd = new THREE.MeshStandardMaterial({ color: 0xd8c3a0, roughness: 0.6, metalness: 0.0, vertexColors: true, side: THREE.DoubleSide });
    fbStd.name = 'h3y_bone';
  }

  function paintFallback(level) {
    fallbackMaterials();
    var mat = level > 0 ? fbStd : fbFlat;
    holder.traverse(function (o) {
      if (o.isMesh) o.material = mat;
    });
  }

  function setTex(level) {
    S.tex = level;
    Array.prototype.forEach.call(document.querySelectorAll('[data-tex]'), function (b) {
      b.classList.toggle('on', parseFloat(b.dataset.tex) === level);
    });
    if (!pickables.length) return;
    if (!S.shaderBroken && window.H3YBoneShader) {
      try {
        if (S.shaderApi) {
          S.shaderApi.setQuality(level);
          S.shaderApi.setDetail(level);
          return;
        }
        S.shaderApi = window.H3YBoneShader.applyH3YBoneShader(THREE, holder, { quality: level, detail: level });
        if (S.shaderApi && S.shaderApi.setRim) S.shaderApi.setRim((THEMES[themeName] || THEMES.dark).shaderRim);
        return;
      } catch (e) {
        S.shaderBroken = true;
      }
    }
    paintFallback(level);
  }

  // ---------- 로딩 ----------
  var loader = new THREE.GLTFLoader();

  function pickSlug(o) {
    var p = o;
    while (p) {
      var ud = p.userData || {};
      if (ud.h3y_bone) return ud.h3y_bone;
      if (ud.h3ySlug) return ud.h3ySlug;
      var n = p.name || '';
      var m = /^h3y_bone_(.+)$/.exec(n);
      if (m) return m[1];
      if (n && S.boneBySlug[n]) return n;
      p = p.parent;
    }
    return '';
  }

  function disposeHolder() {
    S.shaderApi = null;
    disposeTissue();
    for (var i = holder.children.length - 1; i >= 0; i--) {
      var root = holder.children[i];
      root.traverse(function (o) {
        if (o.isMesh) {
          if (o.geometry) o.geometry.dispose();
          var mat = o.material;
          var arr = Array.isArray(mat) ? mat : [mat];
          for (var k = 0; k < arr.length; k++) {
            // 공용 대체 재질은 다음 항목에서 다시 쓰므로 해제하지 않는다
            if (arr[k] && arr[k].dispose && arr[k] !== fbFlat && arr[k] !== fbStd) arr[k].dispose();
          }
        }
      });
      holder.remove(root);
    }
    pickables.length = 0;
    holder.position.set(0, 0, 0);
  }

  function showLoading(on, text) {
    if (text) loadingText.textContent = text;
    loadingEl.classList.toggle('hide', !on);
  }

  function openItem(item, opts) {
    opts = opts || {};
    var seq = ++S.loadSeq;
    S.current = item;
    S.pickedBone = null;
    dprIdle = false;
    vYaw = 0; vPitch = 0;
    window.clearTimeout(pressTimer);
    var urls = (item.urls && item.urls.length) ? item.urls : [item.url];
    showLoading(item.bytes > 12000000 || urls.length > 2, '불러오는 중…');
    statusEl.textContent = '불러오는 중…';
    nameEl.textContent = item.ko;
    sub2El.textContent = metaLine(item);
    disposeHolder();

    var root = new THREE.Group();
    root.name = 'h3y_bone_root';
    var pending = urls.length, tris = 0, failed = false;
    var finish = function () {
      if (seq !== S.loadSeq || failed) return;
      holder.add(root);
      fit(!opts.smooth);
      setTex(S.tex);
      applyPixelBudget(tris);
      applyShadow();
      notifyMotion();          // 150 ms 뒤 정지 프레임은 DPR 3.0
      showLoading(false);
      nameEl.textContent = item.ko;
      sub2El.textContent = metaLine(item);
      statusEl.textContent = (S.idx + 1) + ' / ' + S.items.length;
      updateHash(item);
      loadTissue();
    };
    urls.forEach(function (u) {
      loader.load(u,
        function (gltf) {
          if (seq !== S.loadSeq) return;
          tris += prepareMeshes(gltf.scene, false, item);
          root.add(gltf.scene);
          if (--pending === 0) finish();
        },
        function (xhr) {
          if (seq !== S.loadSeq) return;
          if (xhr.total) {
            statusEl.textContent = Math.min(100, Math.round(xhr.loaded / xhr.total * 100)) + '%';
          } else {
            statusEl.textContent = (xhr.loaded / 1048576).toFixed(1) + ' MB';
          }
        },
        function () {
          if (seq !== S.loadSeq) return;
          failed = true;
          showLoading(false);
          statusEl.textContent = '불러오기 실패';
          sub2El.textContent = '파일을 받지 못했습니다. 잠시 뒤 다시 눌러 주세요.';
        }
      );
    });
  }

  // ---------- 메시 준비 (노멀·COLOR_0·UV·골단 표시) ----------
  function prepareMeshes(root, isTissue, item) {
    var tris = 0;
    root.traverse(function (o) {
      if (!o.isMesh) return;
      var g = o.geometry;
      if (g) {
        if (!g.attributes.normal) g.computeVertexNormals();
        var hasColor = g.getAttribute && g.getAttribute('color');
        if (!hasColor && g.attributes.position) {
          var n = g.attributes.position.count;
          var arr = new Float32Array(n * 4);
          for (var q = 0; q < arr.length; q++) arr[q] = 1;
          g.setAttribute('color', new THREE.BufferAttribute(arr, 4));
        }
        if (g.attributes.uv && !g.getAttribute('h3yUv')) {
          var n2 = g.attributes.uv.count;
          var a2 = new Float32Array(n2 * 2);
          for (var r = 0; r < n2; r++) {
            a2[r * 2] = g.attributes.uv.getX(r);
            a2[r * 2 + 1] = g.attributes.uv.getY(r);
          }
          g.setAttribute('h3yUv', new THREE.BufferAttribute(a2, 2));
        }
        if (!isTissue) bakeEpiphysis(g);
        tris += ((g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0)) / 3);
      }
      o.userData.slug = pickSlug(o) || (item && item.slug) || '';
      o.castShadow = true;
      o.receiveShadow = true;
      pickables.push(o);
    });
    return tris;
  }

  // 골단(epiphysis) 표시를 COLOR_0.a 에 굽는다 — 장축 양끝 16 %.
  // 셰이더 v4 가 이 값을 다공질·거친 면·미세 투과에 쓴다.
  function bakeEpiphysis(g) {
    var col = g.getAttribute && g.getAttribute('color');
    var pos = g.attributes && g.attributes.position;
    if (!col || !pos || !col.normalized && col.itemSize !== 4) return;
    if (col.itemSize !== 4) return;
    var minv = [Infinity, Infinity, Infinity], maxv = [-Infinity, -Infinity, -Infinity];
    var i, j;
    var arr = pos.array;
    for (i = 0; i < pos.count; i++) {
      for (j = 0; j < 3; j++) {
        var v = arr[i * 3 + j];
        if (v < minv[j]) minv[j] = v;
        if (v > maxv[j]) maxv[j] = v;
      }
    }
    var ax = 0, best = -1;
    for (j = 0; j < 3; j++) {
      if (maxv[j] - minv[j] > best) { best = maxv[j] - minv[j]; ax = j; }
    }
    var span = Math.max(maxv[ax] - minv[ax], 1e-6);
    var ca = col.array, step = col.itemSize;
    var unit = col.normalized ? 255 : 1;
    for (i = 0; i < pos.count; i++) {
      var t = (arr[i * 3 + ax] - minv[ax]) / span;
      var d = Math.min(t, 1 - t);
      var e = 1 - Math.min(Math.max((d - 0.04) / 0.10, 0), 1);   // 0.04 이내 = 골단
      ca[i * step + 3] = e * unit;
    }
    col.needsUpdate = true;
  }

  // ---------- 조직 레이어 (디스크 · 관절 인대) ----------
  function tissueOf(item) {
    if (!item) return null;
    var t = item.tissue;
    if (!t) return null;
    var disc = (t.disc || []).slice();
    var lig = (t.lig || []).slice();
    if (!disc.length && !lig.length) return null;
    return { disc: disc, lig: lig };
  }

  function disposeTissue() {
    S.tissueSeq++;
    if (!S.tissueGroup) { S.tissueUrls = []; return; }
    var tg = S.tissueGroup;
    tg.traverse(function (o) {
      if (o.isMesh) {
        if (o.geometry) o.geometry.dispose();
        var mat = o.material;
        var arr = Array.isArray(mat) ? mat : [mat];
        for (var k = 0; k < arr.length; k++) {
          if (arr[k] && arr[k].dispose) arr[k].dispose();
        }
      }
    });
    holder.remove(tg);
    S.tissueGroup = null;
    S.tissueUrls = [];
  }

  function loadTissue() {
    disposeTissue();
    var t = tissueOf(S.current);
    updateTissueUI();
    if (!t) return;
    var urls = [];
    if (S.tissue.disc) urls = urls.concat(t.disc);
    if (S.tissue.lig) urls = urls.concat(t.lig);
    if (!urls.length) return;
    var seq = ++S.tissueSeq;
    var tg = new THREE.Group();
    tg.name = 'h3y_tissue';
    S.tissueGroup = tg;
    S.tissueUrls = urls;
    var pending = urls.length;
    var done = function () {
      if (seq !== S.tissueSeq) return;
      holder.add(tg);
      applyShaderToHolder();
      applyShadow();
      statusEl.textContent = (S.idx + 1) + ' / ' + S.items.length;
    };
    urls.forEach(function (u) {
      loader.load(u, function (gltf) {
        if (seq !== S.tissueSeq) return;
        prepareMeshes(gltf.scene, true, null);
        tg.add(gltf.scene);
        if (--pending === 0) done();
      }, undefined, function () {
        if (seq !== S.tissueSeq) return;
        if (--pending === 0) done();
      });
    });
  }

  function applyShaderToHolder() {
    if (S.shaderBroken || !window.H3YBoneShader) { paintFallback(S.tex); return; }
    if (!(S.tex > 0.01)) { paintFallback(S.tex); return; }
    try {
      S.shaderApi = window.H3YBoneShader.applyH3YBoneShader(THREE, holder, { quality: S.tex, detail: S.tex });
      if (S.shaderApi && S.shaderApi.setRim) S.shaderApi.setRim((THEMES[themeName] || THEMES.dark).shaderRim);
    } catch (e) {
      S.shaderBroken = true;
      paintFallback(S.tex);
    }
  }

  function setTissue(kind, on) {
    S.tissue[kind] = !!on;
    try { localStorage.setItem('h3y-skel-tissue', JSON.stringify(S.tissue)); } catch (e) {}
    loadTissue();
  }

  function updateTissueUI() {
    var t = tissueOf(S.current);
    var row = $('tissueRow');
    if (!row) return;
    row.style.display = t ? 'flex' : 'none';
    var dBtn = $('discBtn'), lBtn = $('ligBtn');
    if (dBtn) {
      var hasD = !!(t && t.disc.length);
      dBtn.style.display = hasD ? '' : 'none';
      dBtn.classList.toggle('on', hasD && S.tissue.disc);
      dBtn.textContent = '디스크 ' + (S.tissue.disc ? 'ON' : 'OFF');
    }
    if (lBtn) {
      var hasL = !!(t && t.lig.length);
      lBtn.style.display = hasL ? '' : 'none';
      lBtn.classList.toggle('on', hasL && S.tissue.lig);
      lBtn.textContent = '관절 인대 ' + (S.tissue.lig ? 'ON' : 'OFF');
    }
  }

  function metaLine(item) {
    if (item.kind === 'bone') {
      return item.slug + ' · ' + fmtInt(item.tris) + ' 삼각형 · ' + fmtBytes(item.bytes);
    }
    if (item.kind === 'module') {
      return item.slug + ' · 뼈 ' + item.bones + '개 · ' + fmtInt(item.tris) + ' 삼각형 · ' + fmtBytes(item.bytes);
    }
    if (item.kind === 'region') {
      return item.key + ' · 뼈 ' + item.bones + '개 · ' + fmtInt(item.tris) + ' 삼각형 · ' + fmtBytes(item.bytes);
    }
    return '전신 · 뼈 ' + item.bones + '개 · ' + fmtInt(item.tris) + ' 삼각형 · ' + fmtBytes(item.bytes);
  }

  // ---------- 목록 구성 ----------
  function buildItems() {
    var d = S.data, arr = [];
    if (S.mode === 'bones') {
      arr = d.bones.map(function (b) {
        return { kind: 'bone', slug: b.slug, ko: b.ko, en: b.en, region: b.region, side: b.side,
                 fma: b.fma, tris: b.tris, bytes: b.bytes, url: b.url, tissue: b.tissue || null };
      });
      if (S.region !== 'all') arr = arr.filter(function (b) { return b.region === S.region; });
    } else if (S.mode === 'modules') {
      arr = d.modules.map(function (m) {
        return { kind: 'module', slug: m.slug, ko: m.ko, en: m.en, bones: m.bones,
                 tris: m.tris, bytes: m.bytes, url: m.url, urls: m.urls || null,
                 tissue: m.tissue || null, focus: m.focus || null };
      });
    } else if (S.mode === 'regions') {
      arr = d.regions.map(function (r) {
        return { kind: 'region', slug: r.key, key: r.key, ko: r.ko, en: r.en, bones: r.bones,
                 tris: r.tris, bytes: r.bytes, url: r.url, tissue: r.tissue || null };
      });
    } else {
      arr = d.masters.map(function (m) {
        return { kind: 'master', slug: m.slug, ko: m.ko, en: m.en, bones: m.bones,
                 tris: m.tris, bytes: m.bytes, url: m.url, tissue: m.tissue || null };
      });
    }
    var q = (S.mode === 'master' ? '' : S.q).trim().toLowerCase();
    if (q) {
      arr = arr.filter(function (it) {
        return ((it.ko || '') + ' ' + (it.en || '') + ' ' + (it.slug || '') + ' ' + (it.key || '') + ' ' + (it.fma || ''))
          .toLowerCase().indexOf(q) >= 0;
      });
    }
    S.items = arr;
    return arr;
  }

  function selectBySlug(slug) {
    for (var i = 0; i < S.items.length; i++) if (S.items[i].slug === slug) return i;
    return -1;
  }

  function gotoIndex(i, opts) {
    if (!S.items.length) return;
    if (i < 0) i = S.items.length - 1;
    if (i >= S.items.length) i = 0;
    S.idx = i;
    openItem(S.items[i], opts);
    highlightList();
  }

  function step(delta) {
    if (!S.items.length) return;
    gotoIndex(S.idx + delta, { smooth: true });
  }

  // ---------- UI ----------
  function regionLabel(key) {
    var r = null, i;
    for (i = 0; i < S.data.regions.length; i++) if (S.data.regions[i].key === key) r = S.data.regions[i];
    return r ? r.ko : key;
  }

  function buildRegionSelect() {
    var sel = $('regionSel');
    sel.innerHTML = '';
    var all = document.createElement('option');
    all.value = 'all'; all.textContent = '전체 부위';
    sel.appendChild(all);
    S.data.regions.forEach(function (r) {
      var o = document.createElement('option');
      o.value = r.key;
      o.textContent = r.ko + ' (' + r.bones + ')';
      sel.appendChild(o);
    });
  }

  function highlightList() {
    var rows = document.querySelectorAll('#list .it');
    for (var i = 0; i < rows.length; i++) {
      rows[i].classList.toggle('on', Number(rows[i].dataset.i) === S.idx);
    }
    var cur = document.querySelector('#list .it.on');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'center' });
  }

  function buildList() {
    var box = $('list');
    box.innerHTML = '';
    var frag = document.createDocumentFragment();
    var lastRegion = null;
    S.items.forEach(function (it, i) {
      if (S.mode === 'bones' && it.region !== lastRegion) {
        lastRegion = it.region;
        var g = document.createElement('div');
        g.className = 'grp';
        g.textContent = regionLabel(it.region) + ' · ' + it.region;
        frag.appendChild(g);
      }
      var row = document.createElement('div');
      row.className = 'it' + (i === S.idx ? ' on' : '');
      row.dataset.i = i;
      var side = it.side === 'R' ? '오' : it.side === 'L' ? '왼' : '';
      var g1 = document.createElement('div');
      g1.className = 'g'; g1.textContent = side;
      var n = document.createElement('div');
      n.className = 'n'; n.textContent = it.ko;
      var m = document.createElement('div');
      m.className = 'm'; m.textContent = fmtBytes(it.bytes);
      row.appendChild(g1); row.appendChild(n); row.appendChild(m);
      row.addEventListener('click', function () {
        S.idx = i;
        openItem(S.items[i], { smooth: false });
        closeSheet();
      });
      frag.appendChild(row);
    });
    box.appendChild(frag);
    $('sheetCount').textContent = S.items.length + '개' +
      (S.q ? " · '" + S.q + "' 검색 결과" : '') +
      (S.mode === 'bones' && S.region !== 'all' ? ' · ' + regionLabel(S.region) : '');
  }

  function openSheet() {
    buildList();
    $('sheet').classList.remove('hidden');
    $('sheet').setAttribute('aria-hidden', 'false');
  }
  function closeSheet() {
    $('sheet').classList.add('hidden');
    $('sheet').setAttribute('aria-hidden', 'true');
  }

  function applyFilter() {
    var keep = S.current ? S.current.slug : null;
    buildItems();
    var i = keep ? selectBySlug(keep) : -1;
    if (!S.items.length) {
      S.idx = -1;
      nameEl.textContent = '—';
      sub2El.textContent = '검색 결과가 없습니다';
      statusEl.textContent = '0';
    } else if (i < 0) {
      S.idx = 0;
      openItem(S.items[0], { smooth: false });
    } else {
      S.idx = i;
      statusEl.textContent = (S.idx + 1) + ' / ' + S.items.length;
    }
    if (!$('sheet').classList.contains('hidden')) buildList();
  }

  function setMode(mode, noLoad) {
    S.mode = mode;
    Array.prototype.forEach.call(document.querySelectorAll('[data-mode]'), function (b) {
      b.classList.toggle('on', b.dataset.mode === mode);
    });
    $('filterRow').style.display = mode === 'master' ? 'none' : 'flex';
    var bonesOnly = mode === 'bones';
    $('regionSel').style.display = bonesOnly ? '' : 'none';
    if (!bonesOnly) { S.region = 'all'; $('regionSel').value = 'all'; }
    buildItems();
    S.idx = 0;
    if (!noLoad && S.items.length) openItem(S.items[0], { smooth: false });
    if (!$('sheet').classList.contains('hidden')) buildList();
  }

  // v4.2 — 조작 중 DPR 2.0, 조작이 멈춘 뒤 150 ms 가 지나면 3.0 으로 올벼
  // 정지 프레임을 선명하게 그린다. 고밀도 모델(부위별 등)은 기기 발열·프레임
  // 저하를 막기 위해 단계를 하나 낮춰 쓴다.
  var dprTris = 0;
  var dprIdle = false;
  var dprIdleTimer = 0;

  function dprFor(idle) {
    var cap = dprTris > 900000 ? (idle ? 2.0 : 1.35)
            : dprTris > 450000 ? (idle ? 2.5 : 1.7)
            : (idle ? 3.0 : 2.0);
    return Math.min(window.devicePixelRatio || 1, cap);
  }

  function setDpr(ratio) {
    if (Math.abs(ratio - dprCap) < 1e-3) return;
    dprCap = ratio;
    renderer.setPixelRatio(ratio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  function applyPixelBudget(tris) {
    if (tris) dprTris = tris;
    setDpr(dprFor(dprIdle));
  }

  function notifyMotion() {
    window.clearTimeout(dprIdleTimer);
    if (dprIdle) { dprIdle = false; applyPixelBudget(); }
    dprIdleTimer = window.setTimeout(function () {
      dprIdle = true;
      applyPixelBudget();
    }, 150);
  }

  function updateHash(item) {
    var h = '';
    if (!item) return;
    if (item.kind === 'bone') h = '#b=' + encodeURIComponent(item.slug);
    else if (item.kind === 'module') h = '#m=' + encodeURIComponent(item.slug);
    else if (item.kind === 'region') h = '#r=' + encodeURIComponent(item.key);
    else h = '#all';
    try { history.replaceState(null, '', h); } catch (e) {}
  }

  function readHash() {
    var h = (location.hash || '').replace(/^#/, '');
    var m;
    if (h === 'all') return { mode: 'master' };
    if ((m = /^b=(.+)$/.exec(h))) return { mode: 'bones', slug: decodeURIComponent(m[1]) };
    if ((m = /^m=(.+)$/.exec(h))) return { mode: 'modules', slug: decodeURIComponent(m[1]) };
    if ((m = /^r=(.+)$/.exec(h))) return { mode: 'regions', slug: decodeURIComponent(m[1]) };
    return null;
  }

  // ---------- 포인터 조작 ----------
  var ptrs = new Map();
  var prevPinch = null, prevMid = null, movedSum = 0, lastTap = 0, lastTapAt = null;
  var vYaw = 0, vPitch = 0;
  var raycaster = new THREE.Raycaster();
  var ndc = new THREE.Vector2();
  var pressTimer = null;

  function two() {
    var a = Array.from(ptrs.values());
    var p0 = a[0], p1 = a[1];
    return {
      dist: Math.hypot(p0.x - p1.x, p0.y - p1.y),
      mid: { x: (p0.x + p1.x) * 0.5, y: (p0.y + p1.y) * 0.5 }
    };
  }

  function hitAt(cx, cy) {
    var r = canvas.getBoundingClientRect();
    ndc.x = ((cx - r.left) / r.width) * 2 - 1;
    ndc.y = -((cy - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    var hits = raycaster.intersectObjects(pickables, false);
    return hits[0] || null;
  }

  canvas.addEventListener('pointerdown', function (e) {
    try { canvas.setPointerCapture(e.pointerId); } catch (x) {}
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) {
      movedSum = 0; prevPinch = null; prevMid = null;
      vYaw = 0; vPitch = 0;
      window.clearTimeout(pressTimer);
      var px = e.clientX, py = e.clientY;
      pressTimer = window.setTimeout(function () { longPress(px, py); }, 640);
    } else if (ptrs.size === 2) {
      var t = two();
      prevPinch = t.dist; prevMid = t.mid; movedSum = 999;
      window.clearTimeout(pressTimer);
    }
  });

  canvas.addEventListener('pointermove', function (e) {
    var prev = ptrs.get(e.pointerId);
    if (!prev) return;
    var dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (ptrs.size === 1) {
      movedSum += Math.abs(dx) + Math.abs(dy);
      if (movedSum > 8) window.clearTimeout(pressTimer);
      var ry = -dx * 0.0085, rp = dy * 0.0085;
      camState.tYaw += ry;
      camState.tPitch = Math.max(-1.45, Math.min(1.45, camState.tPitch + rp));
      vYaw = ry * 0.55; vPitch = rp * 0.55;
    } else if (ptrs.size === 2) {
      var t = two();
      if (prevPinch && t.dist > 5) {
        camState.tDist = Math.max(minDist, Math.min(maxDist, camState.tDist * (prevPinch / t.dist)));
      }
      if (prevMid) {
        var mx = t.mid.x - prevMid.x, my = t.mid.y - prevMid.y;
        var panSpeed = camState.tDist * 0.0016;
        var right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        var up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
        camState.tTarget.addScaledVector(right, -mx * panSpeed);
        camState.tTarget.addScaledVector(up, my * panSpeed);
      }
      prevPinch = t.dist; prevMid = t.mid;
    }
  });

  canvas.addEventListener('pointerup', function (e) {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) { prevPinch = null; prevMid = null; }
    window.clearTimeout(pressTimer);
    if (ptrs.size === 0 && movedSum < 10) {
      var hit = hitAt(e.clientX, e.clientY);
      var now = performance.now();
      if (hit) {
        if (S.mode === 'master') showPicked(hit.object);
        if (now - lastTap < 330) {
          camState.tTarget.copy(hit.point);
          camState.tDist = Math.max(minDist, camState.tDist * 0.45);
          lastTap = 0;
        } else {
          lastTap = now;
        }
      }
    }
    if (ptrs.size === 0) movedSum = 0;
  });

  canvas.addEventListener('pointercancel', function (e) {
    ptrs.delete(e.pointerId);
    prevPinch = null; prevMid = null;
    window.clearTimeout(pressTimer);
  });

  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    camState.tDist = Math.max(minDist, Math.min(maxDist, camState.tDist * (1 + Math.sign(e.deltaY) * 0.1)));
  }, { passive: false });

  function showPicked(o) {
    var slug = (o && o.userData && o.userData.slug) || pickSlug(o);
    var b = S.boneBySlug[slug];
    if (!b) { statusEl.textContent = '전신 · ' + ((S.idx + 1) + '/' + S.items.length); return; }
    S.pickedBone = b;
    nameEl.textContent = b.ko;
    sub2El.textContent = b.slug + ' · ' + fmtInt(b.tris) + ' 삼각형 · ' + fmtBytes(b.bytes) + ' · 길게 누르면 이 뼈만';
    statusEl.textContent = regionLabel(b.region);
  }

  function longPress(cx, cy) {
    if (S.mode !== 'master') return;
    var hit = hitAt(cx, cy);
    if (!hit) return;
    var slug = (hit.object.userData && hit.object.userData.slug) || pickSlug(hit.object);
    var b = S.boneBySlug[slug];
    if (!b) return;
    if (navigator.vibrate) navigator.vibrate(24);
    openBone(b.slug);
  }

  function openBone(slug) {
    setMode('bones', true);
    var i = selectBySlug(slug);
    if (i < 0) {
      S.q = ''; $('q').value = ''; S.region = 'all'; $('regionSel').value = 'all';
      buildItems();
      i = selectBySlug(slug);
    }
    if (i >= 0) gotoIndex(i, { smooth: false });
  }

  // ---------- 이벤트 연결 ----------
  Array.prototype.forEach.call(document.querySelectorAll('[data-mode]'), function (b) {
    b.addEventListener('click', function () { setMode(b.dataset.mode); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-angle]'), function (b) {
    b.addEventListener('click', function () { setAngle(b.dataset.angle); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-tex]'), function (b) {
    b.addEventListener('click', function () { setTex(parseFloat(b.dataset.tex)); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-theme]'), function (b) {
    b.addEventListener('click', function () { applyTheme(b.dataset.theme); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-tissue]'), function (b) {
    b.addEventListener('click', function () { setTissue(b.dataset.tissue, !S.tissue[b.dataset.tissue]); });
  });
  if ($('shadowBtn')) $('shadowBtn').addEventListener('click', function () { setShadow(!S.shadow); });
  $('prev').addEventListener('click', function () { step(-1); });
  $('next').addEventListener('click', function () { step(1); });
  $('fitBtn').addEventListener('click', function () { fit(false); });
  $('listBtn').addEventListener('click', function () { openSheet(); });
  $('closeSheet').addEventListener('click', function () { closeSheet(); });
  $('regionSel').addEventListener('change', function () {
    S.region = $('regionSel').value;
    applyFilter();
  });

  var qTimer = null;
  $('q').addEventListener('input', function () {
    window.clearTimeout(qTimer);
    var v = $('q').value;
    qTimer = window.setTimeout(function () { S.q = v; applyFilter(); }, 160);
  });
  $('qs').addEventListener('input', function () {
    S.q = $('qs').value;
    $('q').value = S.q;
    buildItems();
    if (!$('sheet').classList.contains('hidden')) buildList();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { step(1); }
    else if (e.key === 'ArrowLeft') { step(-1); }
    else if (e.key === 'Escape') { closeSheet(); }
  });

  window.addEventListener('resize', resize);
  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(dprCap);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.__h3y = {
    renderer: renderer, scene: scene, camera: camera, S: S, THREE: THREE,
    camState: camState, holder: holder, keyLight: keyLight,
    applyShadow: applyShadow, setShadow: setShadow, fitShadowCamera: fitShadowCamera,
    shadowAllowed: shadowAllowed, notifyMotion: notifyMotion,
    // 캡처 하니스 전용: DPR 을 즉시 고정하고 한 프레임 그린다.
    forceDpr: function (r) {
      dprIdle = true;
      dprTris = 0;
      setDpr(Math.min(window.devicePixelRatio || 1, r));
      renderer.render(scene, camera);
      return { ratio: renderer.getPixelRatio(), shadow: keyLight.castShadow };
    }
  };

  // ---------- 렌더 루프 ----------
  function tick() {
    if (ptrs.size === 0 && (Math.abs(vYaw) > 1e-5 || Math.abs(vPitch) > 1e-5)) {
      camState.tYaw += vYaw;
      camState.tPitch = Math.max(-1.45, Math.min(1.45, camState.tPitch + vPitch));
      vYaw *= 0.93; vPitch *= 0.93;
      if (Math.abs(vYaw) < 1e-4) vYaw = 0;
      if (Math.abs(vPitch) < 1e-4) vPitch = 0;
    }
    var k = 0.18;
    camState.yaw += (camState.tYaw - camState.yaw) * k;
    camState.pitch += (camState.tPitch - camState.pitch) * k;
    camState.dist += (camState.tDist - camState.dist) * k;
    camState.target.lerp(camState.tTarget, k);

    var cp = Math.cos(camState.pitch), sp = Math.sin(camState.pitch);
    var cy = Math.cos(camState.yaw), sy = Math.sin(camState.yaw);
    camera.position.set(
      camState.target.x + camState.dist * cp * sy,
      camState.target.y + camState.dist * sp,
      camState.target.z + camState.dist * cp * cy
    );
    camera.lookAt(camState.target);
    var moving = ptrs.size > 0
      || Math.abs(vYaw) > 1e-4 || Math.abs(vPitch) > 1e-4
      || Math.abs(camState.tYaw - camState.yaw) > 2e-4
      || Math.abs(camState.tPitch - camState.pitch) > 2e-4
      || Math.abs(camState.tDist - camState.dist) > camState.dist * 2e-4
      || camState.target.distanceToSquared(camState.tTarget) > Math.pow(camState.dist * 2e-4, 2);
    if (moving) notifyMotion();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  // ---------- 시작 ----------
  fetch('assets/index.json', { cache: 'no-cache' })
    .then(function (r) {
      if (!r.ok) throw new Error('index ' + r.status);
      return r.json();
    })
    .then(function (data) {
      S.data = data;
      data.bones.forEach(function (b) { S.boneBySlug[b.slug] = b; });
      buildRegionSelect();
      var deep = readHash();
      if (deep && deep.slug) {
        setMode(deep.mode, true);
        var i = selectBySlug(deep.slug);
        if (i < 0 && S.items.length) i = 0;
        if (i >= 0) { S.idx = i; openItem(S.items[i], { smooth: false }); }
      } else {
        setMode(deep ? deep.mode : 'bones', false);
      }
      if (!S.items.length) loadingText.textContent = '항목을 찾지 못했습니다.';
      tick();
    })
    .catch(function (err) {
      loadingText.textContent = '목록(index.json)을 읽지 못했습니다. 네트워크를 확인하고 새로 고침해 주세요.';
      statusEl.textContent = String(err && err.message || err);
    });

  // 소개 화면 (첫 방문 1회)
  try {
    var savedTheme = localStorage.getItem('h3y-skel-theme');
    applyTheme(savedTheme === 'light' ? 'light' : 'dark');
  } catch (e) { applyTheme('dark'); }

  try {
    if (!localStorage.getItem('h3y-skel-about')) {
      $('about').classList.remove('hidden');
      localStorage.setItem('h3y-skel-about', '1');
    }
  } catch (e) {}
  $('closeAbout').addEventListener('click', function () { $('about').classList.add('hidden'); });
})();
