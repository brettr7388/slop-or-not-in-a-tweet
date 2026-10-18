import json, sys, time, urllib.parse, urllib.request, pathlib, re

UA = "SlopOrNotBuild/0.1 (https://github.com/brettr7388/slop-or-not-in-a-tweet)"
API = "https://commons.wikimedia.org/w/api.php"
ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "raw" / "real"
PEOPLE = re.compile(r"\b(people|person|portrait|man|men|woman|women|girl|boy|child|children|crowd|selfie|face|wedding|tourists?|actor|actress|politician|player|festival|parade|nude)\b", re.I)
ALLOWED = {"cc0": "CC0 1.0", "pd": "Public domain"}

def get(params):
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def strip_html(s):
    return re.sub(r"<[^>]+>", "", s or "").strip()

def candidates(term):
    for lic in ('insource:"cc-zero"', 'insource:"PD-self"', 'insource:"PD-USGov"'):
        d = get({"action": "query", "format": "json", "generator": "search", "gsrnamespace": 6,
                 "gsrsearch": f"{term} {lic} filetype:bitmap", "gsrlimit": 20,
                 "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata", "iiurlwidth": 900,
                 "iiextmetadatafilter": "LicenseShortName|License|Artist|Categories|ImageDescription"})
        pages = sorted(d.get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 0))
        for p in pages:
            yield p
        time.sleep(0.5)

def main(per_subject):
    subjects = json.loads((ROOT / "scripts" / "subjects.json").read_text())
    RAW.mkdir(parents=True, exist_ok=True)
    out, seen = [], set()
    for term in subjects:
        got = 0
        for p in candidates(term):
            if got >= per_subject:
                break
            ii = p["imageinfo"][0]
            m = ii["extmetadata"]
            lic = m.get("License", {}).get("value", "").lower()
            text = " ".join([p["title"], m.get("Categories", {}).get("value", ""), strip_html(m.get("ImageDescription", {}).get("value", ""))])
            if p["title"] in seen or lic not in ALLOWED or ii["mime"] != "image/jpeg":
                continue
            if ii["width"] < 1200 or ii["height"] < 800 or PEOPLE.search(text):
                continue
            seen.add(p["title"])
            fid = f"real-{len(out)+1:02d}"
            req = urllib.request.Request(ii["thumburl"], headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                (RAW / f"{fid}.jpg").write_bytes(r.read())
            out.append({"id": fid, "answer": "real", "subject": term,
                        "title": p["title"].removeprefix("File:"),
                        "source": ii["descriptionurl"],
                        "license": ALLOWED[lic] + f" ({m.get('LicenseShortName', {}).get('value', '')})",
                        "author": strip_html(m.get("Artist", {}).get("value", "")) or "unknown"})
            got += 1
            print(fid, term, p["title"], lic, flush=True)
            time.sleep(0.5)
    (RAW / "candidates.json").write_text(json.dumps(out, indent=2, ensure_ascii=False))
    print(len(out), "downloaded")

if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 2)
