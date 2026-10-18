"""Fetch a few real CC0 photos that look 'too perfect' (glossy, saturated, AI-ish) into raw/perfect/."""
import json, sys, time, urllib.request, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from fetch_commons import UA, PEOPLE, strip_html, get

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "raw" / "perfect"
# Search terms only; subjects in candidates.json were corrected after review (e.g. the "rainbow eucalyptus" hit is a lorikeet).
TERMS = ["milky way night sky", "aurora borealis", "dew drops macro", "hummingbird", "lavender field", "kingfisher", "jellyfish", "rainbow eucalyptus"]

def main(per_term):
    RAW.mkdir(parents=True, exist_ok=True)
    out = []
    for term in TERMS:
        d = get({"action": "query", "format": "json", "generator": "search", "gsrnamespace": 6,
                 "gsrsearch": f'{term} insource:"cc-zero" filetype:bitmap', "gsrlimit": 25,
                 "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata", "iiurlwidth": 1000,
                 "iiextmetadatafilter": "LicenseShortName|License|Artist|Categories|ImageDescription"})
        got = 0
        for p in sorted(d.get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 0)):
            if got >= per_term: break
            ii = p["imageinfo"][0]; m = ii["extmetadata"]
            text = " ".join([p["title"], m.get("Categories", {}).get("value", ""), strip_html(m.get("ImageDescription", {}).get("value", ""))])
            if m.get("License", {}).get("value", "").lower() != "cc0" or ii["mime"] != "image/jpeg": continue
            if ii["width"] < 1200 or ii["height"] < 800 or PEOPLE.search(text): continue
            fid = f"perfect-{len(out)+1:02d}"
            with urllib.request.urlopen(urllib.request.Request(ii["thumburl"], headers={"User-Agent": UA}), timeout=60) as r:
                (RAW / f"{fid}.jpg").write_bytes(r.read())
            out.append({"id": fid, "answer": "real", "too_perfect": True, "subject": term,
                        "title": p["title"].removeprefix("File:"), "source": ii["descriptionurl"],
                        "license": "CC0 1.0", "author": strip_html(m.get("Artist", {}).get("value", "")) or "unknown"})
            got += 1; print(fid, term, p["title"], flush=True); time.sleep(0.5)
        time.sleep(0.5)
    (RAW / "candidates.json").write_text(json.dumps(out, indent=2, ensure_ascii=False))
    print(len(out), "downloaded")

if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 2)
