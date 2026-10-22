#!/usr/bin/env python3
"""Télécharge les images principales des fiches produits Centrakor dans public/catalog-images.

Usage (depuis la racine du dépôt) :
    python3 scripts/download_catalog_images.py

Le script utilise uniquement la bibliothèque standard de Python.
Vérifiez les conditions d'utilisation du site avant de republier les images.
"""
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlparse
import sys

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "public" / "catalog-images"

PRODUCTS = [
    ("taho-blanche.jpg", "https://www.centrakor.com/chaise-coque-blanche-46x54x85cm-362567.html"),
    ("aliya.jpg", "https://www.centrakor.com/suspension-aliya-d-44x28cm-400265.html"),
    ("mix-modul.jpg", "https://www.centrakor.com/etagere-cube-modulable-6-casiers-bois-blanche-67-5x100-5x32cm-341462.html"),
    ("vase-gres.jpg", "https://www.centrakor.com/vase-en-gres-blanc-h-28-5cm-624838.html"),
    ("abana.jpg", "https://www.centrakor.com/meuble-tv-abana-39x48x120cm-638072.html"),
    ("seram.jpg", "https://www.centrakor.com/fauteuil-rotin-seram-beige-atmosphera-373771.html"),
    ("livia.jpg", "https://www.centrakor.com/miroir-organique-livia-bois-75x45cm-624721.html"),
    ("koby.jpg", "https://www.centrakor.com/lampe-a-poser-koby-naturel-blanc-h-24cm-636492.html"),
    ("tapis-jute.jpg", "https://www.centrakor.com/tapis-rectangulaire-jute-naturel-160x230cm-384676.html"),
    ("twily.jpg", "https://www.centrakor.com/coussin-twily-poly-coton-sauge-30x50cm-636275.html"),
    ("plaid-terracotta.jpg", "https://www.centrakor.com/plaid-polyester-flanelle-terracotta-130x180cm-625604.html"),
    ("senecon.jpg", "https://www.centrakor.com/plante-artificielle-tombante-senecon-h-75cm-618170.html"),
]

class MetaImageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.image = None
    def handle_starttag(self, tag, attrs):
        if tag.lower() != "meta":
            return
        a = {k.lower(): v for k, v in attrs}
        if a.get("property", "").lower() == "og:image" and a.get("content"):
            self.image = a["content"]
        elif a.get("name", "").lower() == "twitter:image" and a.get("content") and not self.image:
            self.image = a["content"]

def get_image_url(page_url):
    req = Request(page_url, headers={"User-Agent": "Mozilla/5.0 (compatible; CatalogImageHelper/1.0)"})
    with urlopen(req, timeout=25) as response:
        html = response.read().decode("utf-8", errors="replace")
    parser = MetaImageParser()
    parser.feed(html)
    if not parser.image:
        raise RuntimeError("aucune image principale (og:image) trouvée")
    return parser.image.replace("&amp;", "&")

def main():
    DEST.mkdir(parents=True, exist_ok=True)
    errors = []
    for filename, page_url in PRODUCTS:
        try:
            image_url = get_image_url(page_url)
            req = Request(image_url, headers={"User-Agent": "Mozilla/5.0"})
            with urlopen(req, timeout=30) as response:
                data = response.read()
                content_type = response.headers.get("Content-Type", "").lower()
            if not content_type.startswith("image/") or len(data) < 1000:
                raise RuntimeError(f"réponse inattendue ({content_type}, {len(data)} octets)")
            # Évite de nommer une image WebP/PNG en .jpg.
            ext = ".webp" if "webp" in content_type else ".png" if "png" in content_type else ".jpg"
            final_name = str(Path(filename).with_suffix(ext))
            (DEST / final_name).write_bytes(data)
            print(f"OK  {final_name} ({len(data):,} octets)")
            if final_name != filename:
                print(f"    Extension réelle différente : modifiez le chemin image dans catalog.json vers catalog-images/{final_name}")
        except Exception as exc:
            errors.append((filename, str(exc)))
            print(f"ERREUR {filename}: {exc}")
    print(f"\\nImages enregistrées dans : {DEST}")
    if errors:
        print(f"{len(errors)} téléchargement(s) en échec. Vérifiez les fiches produits et réessayez.")
        sys.exit(1)

if __name__ == "__main__":
    main()
