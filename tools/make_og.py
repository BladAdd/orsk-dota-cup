"""Генерация OG-картинки (1200x630) для соцсетей.
Запуск: python -I tools/make_og.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "img", "og-image.png")

W, H = 1200, 630
BG = (13, 15, 19)
RED = (210, 31, 43)
RED_DEEP = (141, 17, 25)
GOLD = (217, 164, 65)
TEXT = (233, 231, 226)
MUTED = (152, 161, 177)

FONT_DIR = r"C:\Windows\Fonts"


def font(name, size):
    for cand in (name, name.lower()):
        p = os.path.join(FONT_DIR, cand)
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)

# фоновые диагональные красные полосы слева
for i in range(-H, W, 90):
    d.polygon([(i, H), (i + 34, H), (i + 34 + H, 0), (i + H, 0)], fill=(26, 20, 24))
for i in range(-H, 520, 90):
    d.polygon([(i, H), (i + 16, H), (i + 16 + H, 0), (i + H, 0)], fill=RED_DEEP)

# тёмная панель под текст
d.rectangle([0, 0, W, H], fill=None)
d.rectangle([60, 90, 760, 540], fill=(16, 19, 26))
d.rectangle([60, 90, 760, 96], fill=RED)

# логотипы КПРФ и Dota 2 как единая связка
import math
KPRF = os.path.join(ROOT, "assets", "img", "kprf.png")
DOTA = os.path.join(ROOT, "assets", "img", "dota2.png")
if os.path.exists(KPRF):
    k = Image.open(KPRF).convert("RGB").resize((110, 110))
    img.paste(k, (95, 120))
if os.path.exists(DOTA):
    dd = Image.open(DOTA).convert("RGB")
    dd = dd.resize((200, int(200 * dd.height / dd.width)))
    img.paste(dd, (940, 150))
# золотой знак связи между логотипами и текстом
d.text((215, 150), "×", font=font("arialbd.ttf", 60), fill=GOLD)

f_title = font("arialbd.ttf", 64)
f_sub = font("arial.ttf", 30)
f_meta = font("arialbd.ttf", 34)
f_small = font("arial.ttf", 24)

d.text((200, 130), "КУБОК ОРСКА", font=f_title, fill=TEXT)
d.text((200, 200), "ПО DOTA 2", font=f_title, fill=RED)
d.rectangle([200, 292, 560, 295], fill=GOLD)
d.text((200, 320), "Открытый любительский турнир Оренбуржья", font=f_sub, fill=MUTED)
d.text((200, 372), "15 000 ₽  ·  14 команд  ·  single elimination", font=f_meta, fill=GOLD)
d.text((200, 430), "Старт 28 ноября 2026 · финал в Орске", font=f_small, fill=MUTED)
d.text((200, 470), "Генеральный спонсор — Орское городское отделение КПРФ", font=f_small, fill=MUTED)

img.save(OUT, "PNG", optimize=True)
print("saved", OUT, img.size)
