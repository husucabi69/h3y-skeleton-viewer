# 라이선스와 출처 고지 — H3Y 전신 골격 3D 소스 패키지

## 1. 한눈에

| 구분 | 내용 |
|---|---|
| 3D 뼈 메쉬 | **BodyParts3D 4.0**, (c) The Database Center for Life Science (DBCLS), Japan |
| 라이선스 | **Creative Commons Attribution 4.0 International (CC BY 4.0)** |
| 라이선스 페이지 | https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html |
| 아카이브 | `isa_BP3D_4.0_obj_99.zip` (142,903,898 바이트), SHA-256 `40665852c49f218326590e204db91064a1ecfc3c6f8cbd7bbbcaac62c7cd409e` |
| 라이선스 갱신일 | 2025-02-27 |
| 이 패키지의 가공 | H3Y Anatomy Studio — 정점 용접, 데시메이션, 주름각 스무스 노멀, 2단 복셀 차폐 베이크(COLOR_0), 좌표계 변환, 재질 분리(에나멜·늑연골) |
| three.js (동봉) | MIT License, Copyright 2010-2022 Three.js Authors — `03_질감_셰이더_코드/vendor/LICENSE-three.txt` |

## 2. 앱 화면에 표시할 문구 (그대로 복사)

한국어 화면:

```
3D 뼈 모델: BodyParts3D 4.0, (c) The Database Center for Life Science (DBCLS),
CC BY 4.0 (https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html) 에 따라 사용.
H3Y Anatomy Studio 가공(용접·단순화·법선 재계산·음영 베이크).
```

영문 화면(GL의 `asset.copyright`에도 같은 문구가 들어 있습니다):

```
3D bone geometry: BodyParts3D 4.0, (c) The Database Center for Life Science (DBCLS),
licensed under Creative Commons Attribution 4.0 International (CC BY 4.0).
Archive licence updated 2025-02-27. Adapted for H3Y Anatomy Studio
(welded, decimated, re-normalled, re-framed, occlusion-baked).
```

표시 위치 권장: 3D 화면 하단 상시 표기(작게) + 앱 "정보 → 출처" 화면(전문).

## 3. CC BY 4.0이 요구하는 것

1. **저작자 표시** — 위 문구처럼 DBCLS를 원저작자로 밝힌다.
2. **라이선스 표시** — CC BY 4.0임을 밝히고 라이선스 링크를 건다.
3. **변경 사실 표시** — 이 패키지에서 메쉬를 가공했다는 사실을 밝힌다(위 문구에 포함).
4. **추가 제한 금지** — 재배포 시 원저작물의 이용을 제한하는 조건을 붙이지 않는다.

전문: https://creativecommons.org/licenses/by/4.0/legalcode.ko

## 4. 유의 사항 (2026-11-27 기록)

- 원본 OBJ 파일의 헤더에는 2013년 제작 당시의 `CC BY-SA 2.1 JP` 문구가 남아 있습니다. 공식 배포 페이지는 라이선스를 **CC BY 4.0**으로 갱신했고, 이 패키지는 갱신된 조건을 따릅니다(원장님 지시 사항). **상업 배포 전 법률 검토를 권장합니다.**
- 이 패키지가 추가한 기하(없음) — 뼈 메쉬는 전부 BodyParts3D 원본을 가공한 것이며, H3Y가 새로 만든 기하는 이 패키지에 없습니다.
- 셰이더 코드(`h3y-bone-shader.js/.ts`)와 빌드 스크립트는 H3Y ANATOMY STUDIO의 자산입니다. 외부 공개 시 원장님 승인 후 진행합니다.
