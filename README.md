# H3Y 전신 골격 242 — 스튜디오 뷰어

`husucabi69/h3y-anatomy-studio`와 별개로 운영하는 **검수 전용 독립 웹 뷰어**입니다.
H3Y ANATOMY STUDIO 3.0.0 (Loop 세분화 UHD) 패키지의 원본 GLB를 브라우저에서 그대로 서빙합니다.

- 개별 뼈 **242개** (`assets/bones/<부위>/<slug>.glb`)
- 임상 모듈 **62개** (`assets/modules/`)
- 부위별 묶음 **13개** (`assets/regions/`)
- 전신 경량 마스터 **1개** (`assets/master/h3y-full-skeleton-bone-master.glb`)
- 매니페스트: `assets/index.json` (한국어·영문 명칭, 부위, 삼각형 수, 파일 크기, bbox)

## 뷰어 기능

- **모드 전환**: 개별 뼈 242 / 임상 모듈 62 / 부위별 13 / 전신
- **부위 필터 + 검색**(한글·영문·slug·FMA)
- 뼈를 고르면 그 뼈만 단독 로드 → `Box3` 기반 자동 정중앙 프레이밍
- **◀ 이전 / 다음 ▶**, 전체 목록 시트
- **정면 · 측면 · 후면 · 위(상면)** 원터치 시점, **질감 끔 · 0.5 · 1.0**
- 한 손가락 회전(관성) · 두 손가락 핀치 확대 + 동시 이동 · 두 번 탭 줌
- **다크 스튜디오 / 화이트 스튜디오** 전환 (우측 상단)
- 화면에 한글 이름 · 영문 slug · 삼각형 수 · 파일 크기 표시

## 스튜디오 테마

| | 다크 (기본) | 화이트 |
|---|---|---|
| 배경 | `#07090d` ~ `#161b24` | `#f4f6f9` ~ `#ffffff` |
| 키라이트 | `0xfff1dc` 1.15 | `0xffffff` 0.92 |
| 림라이트 | `0xffd9a8` 0.55 | `0xfff6ea` 0.20 |
| 필라이트 | `0xd4deee` 0.35 | `0xeef3ff` 0.55 |

## 피질골 셰이더 (`h3y-bone-shader.js`)

이 파일은 뷰어 전용 오버라이드입니다(원본 패키지 파일은 무수정).

- 저주파·중주파 얼룩과 굵은 균열망을 제거하고, 1,450/620 스케일의 **미세 다공질·골결**만 남김
- 색: 하이라이트 `#dfd0b4` · 중간톤 `#b59a72` · 틈새 AO `#2e2114`
- roughness **0.38~0.50** (매끈한 치밀골 반광) + 프레넬 림(서브서피스 느낌)
- 봉합선·오목한 틈은 GLB에 구워진 COLOR_0(B 채널, cavity)로만 표현
- `질감 끔/0.5/1.0` = 셰이더 `uQuality` 단계

## 딥링크

`#b=<slug>` (개별 뼈), `#m=<module>` (임상 모듈), `#r=<region>` (부위), `#all` (전신)
예: `index.html#b=femur_R`

## 라이선스 / 출처

BodyParts3D, © The Database Center for Life Science (DBCLS), licensed under CC BY 4.0.
Adaptation for H3Y Anatomy Studio, full-skeleton 3.0.0 (welded, Loop-subdivided, re-normalled, re-framed, occlusion-baked).
three.js r147 — MIT.
