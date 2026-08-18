#!/usr/bin/env python3
"""キャラクターの glTF から、アニメーションだけを取りのぞく。

Quaternius のキャラクターパックは52体ぜんぶが同じ骨組みで、
同じ17個のアニメーションを1体ずつ持っている（1体2MB、合計99MB）。
骨組みが同じなら、アニメーションは1体ぶんあれば全員に使い回せるので、
「動きの見本」1体だけ残して、ほかは形と色だけにする。

使い方:
    python3 tools/strip-anims.py 入力フォルダ 出力フォルダ 見本にする名前
"""
import base64
import json
import os
import sys


def strip(src_path, dst_path):
    with open(src_path) as f:
        g = json.load(f)

    if 'animations' not in g:
        return None
    del g['animations']

    # ---- まだ使われている accessor を集める ----
    used_acc = set()
    for mesh in g.get('meshes', []):
        for prim in mesh.get('primitives', []):
            used_acc.update(prim.get('attributes', {}).values())
            if 'indices' in prim:
                used_acc.add(prim['indices'])
            for target in prim.get('targets', []):
                used_acc.update(target.values())
    for skin in g.get('skins', []):
        if 'inverseBindMatrices' in skin:
            used_acc.add(skin['inverseBindMatrices'])

    keep_acc = sorted(used_acc)
    acc_map = {old: new for new, old in enumerate(keep_acc)}
    accessors = [g['accessors'][i] for i in keep_acc]

    # ---- その accessor が指している bufferView を集める ----
    used_bv = set()
    for a in accessors:
        if 'bufferView' in a:
            used_bv.add(a['bufferView'])
    for img in g.get('images', []):
        if 'bufferView' in img:
            used_bv.add(img['bufferView'])

    keep_bv = sorted(used_bv)
    bv_map = {old: new for new, old in enumerate(keep_bv)}

    # ---- 元のバイト列から、残す部分だけを新しく詰めなおす ----
    uri = g['buffers'][0]['uri']
    head, b64 = uri.split(',', 1)
    raw = base64.b64decode(b64)

    out = bytearray()
    new_views = []
    for old in keep_bv:
        bv = dict(g['bufferViews'][old])
        start = bv.get('byteOffset', 0)
        length = bv['byteLength']
        # 4バイト境界にそろえる。ずれていると読み込みでこける
        while len(out) % 4:
            out.append(0)
        bv['byteOffset'] = len(out)
        bv['buffer'] = 0
        out += raw[start:start + length]
        new_views.append(bv)

    for a in accessors:
        if 'bufferView' in a:
            a['bufferView'] = bv_map[a['bufferView']]

    g['accessors'] = accessors
    g['bufferViews'] = new_views
    g['buffers'] = [{
        'byteLength': len(out),
        'uri': head + ',' + base64.b64encode(bytes(out)).decode('ascii'),
    }]

    with open(dst_path, 'w') as f:
        json.dump(g, f, separators=(',', ':'))
    return len(out)


def main():
    src, dst, keeper = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(dst, exist_ok=True)
    total_before = total_after = 0
    for name in sorted(os.listdir(src)):
        if not name.endswith('.gltf'):
            continue
        s = os.path.join(src, name)
        d = os.path.join(dst, name)
        before = os.path.getsize(s)
        total_before += before
        if name == keeper + '.gltf':
            # 動きの見本。そのまま置く
            with open(s) as f:
                data = f.read()
            with open(d, 'w') as f:
                f.write(data)
            total_after += os.path.getsize(d)
            print(f'{name}: 見本なのでそのまま ({before // 1024}KB)')
            continue
        strip(s, d)
        after = os.path.getsize(d)
        total_after += after
        print(f'{name}: {before // 1024}KB -> {after // 1024}KB')
    print(f'合計 {total_before // 1024 // 1024}MB -> {total_after // 1024 // 1024}MB')


if __name__ == '__main__':
    main()
