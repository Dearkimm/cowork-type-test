# -*- coding: utf-8 -*-
# 손가락 커서. 둥글둥글한 만화 손이다.
# 검지는 짧고 굵게, 주먹은 거의 동그랗게. 마디는 살짝만 튀어나온다.
import sys
from PIL import Image

W, H = 20, 22
def blank(): return [[0] * W for _ in range(H)]

def capsule(x0, y0, x1, y1, r):
    m = blank()
    for y in range(H):
        for x in range(W):
            px, py = x + 0.5, y + 0.5
            dx, dy = x1 - x0, y1 - y0
            L2 = dx * dx + dy * dy
            t = 0 if L2 == 0 else max(0, min(1, ((px - x0) * dx + (py - y0) * dy) / L2))
            cx, cy = x0 + t * dx, y0 + t * dy
            if (px - cx) ** 2 + (py - cy) ** 2 <= r * r: m[y][x] = 1
    return m

def rrect(x0, y0, x1, y1, r):
    m = blank()
    for y in range(H):
        for x in range(W):
            px, py = x + 0.5, y + 0.5
            if not (x0 <= px <= x1 and y0 <= py <= y1): continue
            qx = max(x0 + r - px, 0, px - (x1 - r))
            qy = max(y0 + r - py, 0, py - (y1 - r))
            if qx * qx + qy * qy <= r * r: m[y][x] = 1
    return m

def union(*ms):
    o = blank()
    for m in ms:
        for y in range(H):
            for x in range(W):
                if m[y][x]: o[y][x] = 1
    return o

def outline(m):
    o = blank()
    for y in range(H):
        for x in range(W):
            if m[y][x]: continue
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < H and 0 <= xx < W and m[yy][xx]: o[y][x] = 1
    return o

finger = capsule(5.0, 3.0, 7.6, 11.0, 2.7)      # 짧고 굵게, 위로 갈수록 왼쪽
k1     = capsule(11.4, 9.2, 11.6, 12.0, 2.3)
k2     = capsule(15.0, 10.4, 15.2, 12.6, 2.1)
fist   = rrect(2.2, 10.2, 17.6, 19.2, 5.8)      # 거의 동그란 주먹
hand = union(finger, k1, k2, fist)
# 소매는 따로 사각형을 두지 않고 주먹 아랫부분을 잘라 쓴다.
# 사각형을 얹으면 둥근 바닥이 잘려 네모가 된다.
cuff = blank()
for y in range(16, H):
    for x in range(W):
        if hand[y][x]: cuff[y][x] = 1
edge = outline(hand)

# 검지와 첫 마디 사이에만 짧게 골을 판다. 전부 파면 손이 검게 뒤덮인다
groove = blank()
o = outline(finger)
for y in range(0, 12):
    for x in range(W):
        if o[y][x] and hand[y][x] and not edge[y][x] and x > 6: groove[y][x] = 1
o2 = outline(k1)
for y in range(8, 12):
    for x in range(W):
        if o2[y][x] and hand[y][x] and not edge[y][x] and x > 12: groove[y][x] = 1

PAL = {'K': (46, 58, 92), 'W': (255, 255, 255), 'S': (203, 221, 245), 'B': (93, 158, 228), 'D': (53, 116, 188)}
im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = im.load()
for y in range(H):
    for x in range(W):
        if edge[y][x] or groove[y][x]: d[x, y] = PAL['K'] + (255,)
        elif cuff[y][x]:               d[x, y] = PAL['D' if x >= 14 else 'B'] + (255,)
        elif hand[y][x]:               d[x, y] = PAL['S' if (x - 4) * 0.9 + (y - 11) * 0.5 > 9 else 'W'] + (255,)
im.resize((W * 2, H * 2), Image.NEAREST).save('hand2x.png')
bg = Image.new('RGBA', (W * 2 + 8, H * 2 + 8), (255, 110, 163, 255))
bg.alpha_composite(im.resize((W * 2, H * 2), Image.NEAREST), (4, 4))
bg.convert('RGB').resize(((W * 2 + 8) * 4, (H * 2 + 8) * 4), Image.NEAREST).save('handview.png')
for y in range(H):
    r = [x for x in range(W) if hand[y][x] or edge[y][x]]
    if r:
        print('커서 %dx%d, 손끝 기준점 (%d,%d)' % (W * 2, H * 2, (r[0] + r[-1]) + 1, y * 2)); break
