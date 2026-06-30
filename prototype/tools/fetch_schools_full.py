#!/usr/bin/env python3
"""
전국 초등학교 완전판 생성기 (schools.js)
- NEIS 학교기본정보 OpenAPI 사용. 키가 있으면 전국 6,300여 곳을 한 번에 받는다.
- 키 발급: https://open.neis.go.kr/ (무료, 1분) → 마이페이지 인증키
사용법:
  NEIS_KEY=발급받은키 python fetch_schools_full.py
키가 없으면 5건 제한이 걸려 표본만 생성된다(데모용).
"""
import urllib.request, urllib.parse, json, os, time, sys

KEY = os.environ.get("NEIS_KEY", "").strip()
OUT = os.path.join(os.path.dirname(__file__), "..", "schools.js")

def office_to_gu(ju, sido):
    if not ju: return ""
    return ju.replace(sido, "").replace("교육청", "").replace("교육지원청", "").replace("교육", "").strip()

def fetch_all():
    seen, idx = {}, 1
    while True:
        params = {"Type": "json", "pIndex": str(idx), "pSize": "1000", "SCHUL_KND_SC_NM": "초등학교"}
        if KEY: params["KEY"] = KEY
        url = "https://open.neis.go.kr/hub/schoolInfo?" + urllib.parse.urlencode(params)
        try:
            with urllib.request.urlopen(url, timeout=40) as r:
                d = json.load(r)
            rows = d["schoolInfo"][1]["row"]
        except Exception as e:
            print("stop at page", idx, e); break
        for x in rows:
            c = x.get("SD_SCHUL_CODE")
            sido = x.get("LCTN_SC_NM") or ""
            if c: seen[c] = {"c": c, "n": x.get("SCHUL_NM"), "r": sido,
                             "g": office_to_gu(x.get("JU_ORG_NM"), sido), "o": x.get("ATPT_OFCDC_SC_CODE")}
        if len(rows) < 1000: break
        idx += 1; time.sleep(0.2)
    return list(seen.values())

def main():
    if not KEY:
        print("⚠️  NEIS_KEY 미설정 → 5건 제한(표본만). 전국 완전판은 키 발급 후 실행하세요.")
    data = fetch_all()
    data.sort(key=lambda z: (z["r"] or "", z["g"] or "", z["n"] or ""))
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// 전국 초등학교 (NEIS 학교기본정보). c=코드 n=교명 r=시도 g=시군구 o=교육청코드\n")
        f.write("const SCHOOLS=" + json.dumps(data, ensure_ascii=False) + ";\n")
        f.write("if(typeof module!=='undefined')module.exports=SCHOOLS;\n")
    print(f"✅ {len(data)} schools → {os.path.abspath(OUT)}")

if __name__ == "__main__":
    main()
